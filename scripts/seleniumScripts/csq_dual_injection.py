"""
csq_dual_injection.py

Optional helper for replaying ContentSquare (CSQ) analytics/session-recording
beacons captured during a Selenium run to one or more additional CSQ
projects — mirroring the "dual injection" feature used by qt_store's
Playwright test suite (qt_store/testing/src/core/csq-project-dual-injection.ts).

Unlike the Playwright version, there is NO automatic host discovery here:
the caller must supply each target's collector/recording host explicitly via
the CSQ_DUAL_INJECTION_TARGETS environment variable — see
load_dual_injection_targets() for the expected format.

The feature is entirely optional. If CSQ_DUAL_INJECTION_TARGETS is unset or
blank, load_dual_injection_targets() returns [] and callers should skip
enabling it — no Chrome performance-logging overhead, no polling, no
behavior change.

How it works: Chrome's CDP "Network" domain (already enabled by every script
that wants this feature, via driver.execute_cdp_cmd("Network.enable", {}))
records every request in the browser's performance log when the
"goog:loggingPrefs": {"performance": "ALL"} capability is set. poll() drains
that log, finds POST/PATCH requests to *.contentsquare.net, and replays each
one to every configured target (rewriting `pid`, and optionally `happid`),
via a plain HTTP request — no browser involved for the replay itself.

Usage (see csStoreRetentionModel_CSQXP.py etc. for a full integration
example):

    targets = load_dual_injection_targets()
    if targets:
        options.set_capability("goog:loggingPrefs", {"performance": "ALL"})
    ...
    driver = webdriver.Chrome(options=options)
    driver.execute_cdp_cmd("Network.enable", {})
    dual_injection = CsqDualInjection(driver, targets) if targets else None
    ...
    def wait(lo=0.8, hi=2.2):
        if dual_injection:
            dual_injection.poll()
        time.sleep(random.uniform(lo, hi))
    ...
    if dual_injection:
        dual_injection.stop()
"""

import json
import os
import re
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

import requests

DEFAULT_TARGETS_ENV_VAR = "CSQ_DUAL_INJECTION_TARGETS"
DEFAULT_REQUEST_TIMEOUT_SECONDS = 10
EXCLUDED_PATH = "/log/web/metrics"
RECORDING_PATH_PREFIX = "/v2/recording"
_HEADERS_TO_STRIP = {"host", "content-length"}

_USAGE_EXAMPLE = (
    '[{"projectId":"30708","collectorHost":"c-host.contentsquare.net",'
    '"recordingHost":"r-host.contentsquare.net","environmentId":"123456"}]'
)


@dataclass
class DualInjectionTarget:
    project_id: str
    collector_host: str
    recording_host: Optional[str] = None
    environment_id: Optional[str] = None


def load_dual_injection_targets(env_var=DEFAULT_TARGETS_ENV_VAR):
    """
    Reads and parses the dual-injection target configuration from an
    environment variable. Returns [] (feature disabled) if the variable is
    unset or blank.

    Expected format — a JSON array of objects:
        [{"projectId": "30708",
          "collectorHost": "c-host.contentsquare.net",
          "recordingHost": "r-host.contentsquare.net",
          "environmentId": "123456"}]

    `collectorHost` is required. `recordingHost` and `environmentId` are
    optional — omit `environmentId` for standard (non-XP) CSQ projects to
    preserve the original request's `happid`; omit `recordingHost` to skip
    replaying session-recording traffic for that target.

    Hosts must be found manually (e.g. via the browser DevTools Network tab
    while browsing the target CSQ project) — there is no auto-discovery.
    """
    raw = os.environ.get(env_var, "").strip()
    if not raw:
        return []

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(
            f"{env_var} is not valid JSON: {e}\n"
            f"Expected format, e.g.:\n{env_var}='{_USAGE_EXAMPLE}'"
        ) from e

    if not isinstance(parsed, list) or not parsed:
        raise ValueError(
            f"{env_var} must be a non-empty JSON array. Expected format, e.g.:\n"
            f"{env_var}='{_USAGE_EXAMPLE}'"
        )

    targets = []
    for i, entry in enumerate(parsed):
        if not isinstance(entry, dict):
            raise ValueError(f"{env_var}[{i}] must be a JSON object, got: {entry!r}")
        project_id = entry.get("projectId")
        collector_host = entry.get("collectorHost")
        if not project_id or not collector_host:
            raise ValueError(
                f"{env_var}[{i}] is missing required field(s) 'projectId'/'collectorHost': {entry!r}\n"
                f"Expected format, e.g.:\n{env_var}='{_USAGE_EXAMPLE}'"
            )
        targets.append(DualInjectionTarget(
            project_id=str(project_id),
            collector_host=str(collector_host),
            recording_host=str(entry["recordingHost"]) if entry.get("recordingHost") else None,
            environment_id=str(entry["environmentId"]) if entry.get("environmentId") else None,
        ))
    return targets


_HAPPID_JSON_RE = re.compile(r'"happid"\s*:\s*"([^"]*)"')
_HAPPID_URLENCODED_RE = re.compile(r'([&?])happid=[^&]*')


def _replace_happid_in_body(body_str, environment_id):
    if _HAPPID_JSON_RE.search(body_str):
        return _HAPPID_JSON_RE.sub(f'"happid":"{environment_id}"', body_str)
    if re.search(r'[&?]?happid=', body_str):
        return _HAPPID_URLENCODED_RE.sub(rf'\1happid={environment_id}', body_str)
    return body_str


def _rewrite_url(url, project_id, target_host, environment_id):
    parts = urlsplit(url)
    # Only pid (and, for XP targets, happid) are overridden — every other
    # param (uu, sid, ...) is intentionally reused from the master request,
    # same as qt_store's dual injection.
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["pid"] = project_id
    if environment_id and "happid" in query:
        query["happid"] = environment_id
    new_query = urlencode(query)
    return urlunsplit((parts.scheme, target_host, parts.path, new_query, parts.fragment))


class CsqDualInjection:
    """
    Captures CSQ tag network requests via Chrome's CDP performance log and
    replays them to one or more additional CSQ projects.

    Must be constructed AFTER driver.execute_cdp_cmd("Network.enable", {})
    has been called, and the Chrome session must have been created with the
    "goog:loggingPrefs": {"performance": "ALL"} capability set.

    Call poll() periodically (e.g. from a script's pacing/wait() helper) to
    drain captured requests and replay them. Call stop() once at the end of
    the run to flush any remaining requests and print a summary.
    """

    def __init__(self, driver, targets, timeout=DEFAULT_REQUEST_TIMEOUT_SECONDS):
        self._driver = driver
        self._targets = targets
        self._timeout = timeout
        self._seen_request_ids = set()
        self._stats = {
            t.project_id: {"sent": 0, "succeeded": 0, "failed": 0, "status_counts": {}}
            for t in targets
        }

    def poll(self):
        try:
            entries = self._driver.get_log("performance")
        except Exception as e:
            print(f"[CsqDualInjection] Could not read performance log: {e}")
            return

        # Keep only the last requestWillBeSent event per requestId (handles redirects).
        latest_by_request_id = {}
        for entry in entries:
            try:
                message = json.loads(entry["message"])["message"]
            except (KeyError, ValueError):
                continue
            if message.get("method") != "Network.requestWillBeSent":
                continue
            params = message.get("params", {})
            request_id = params.get("requestId")
            if request_id:
                latest_by_request_id[request_id] = params

        for request_id, params in latest_by_request_id.items():
            if request_id in self._seen_request_ids:
                continue
            self._seen_request_ids.add(request_id)
            self._handle_request(request_id, params)

    def _handle_request(self, request_id, params):
        request = params.get("request", {})
        method = request.get("method", "").upper()
        if method not in ("POST", "PATCH"):
            return

        url = request.get("url", "")
        parts = urlsplit(url)
        if "contentsquare.net" not in parts.netloc:
            return
        if parts.path == EXCLUDED_PATH:
            return

        headers = {
            k: v for k, v in request.get("headers", {}).items()
            if k.lower() not in _HEADERS_TO_STRIP
        }

        body = request.get("postData")
        if body is None and request.get("hasPostData"):
            try:
                result = self._driver.execute_cdp_cmd("Network.getRequestPostData", {"requestId": request_id})
                body = result.get("postData")
            except Exception:
                # Request body may already have been evicted from Chrome's memory — replay without it.
                body = None

        for target in self._targets:
            self._replay(method, parts, headers, body, target)

    def _replay(self, method, parts, headers, body, target):
        is_recording = parts.path.startswith(RECORDING_PATH_PREFIX)
        target_host = target.recording_host if is_recording else target.collector_host
        if not target_host:
            return  # No host configured for this traffic type on this target — skip.

        original_url = urlunsplit(parts)
        new_url = _rewrite_url(original_url, target.project_id, target_host, target.environment_id)

        new_body = body
        if new_body and target.environment_id:
            new_body = _replace_happid_in_body(new_body, target.environment_id)

        stats = self._stats[target.project_id]
        try:
            response = requests.request(
                method,
                new_url,
                headers=headers or None,
                data=new_body,
                timeout=self._timeout,
            )
            stats["sent"] += 1
            stats["status_counts"][response.status_code] = stats["status_counts"].get(response.status_code, 0) + 1
            if response.ok:
                stats["succeeded"] += 1
            else:
                stats["failed"] += 1
                print(f"[CsqDualInjection] pid={target.project_id} ({target_host}{parts.path}) -> HTTP {response.status_code}")
        except requests.RequestException as e:
            stats["sent"] += 1
            stats["failed"] += 1
            print(f"[CsqDualInjection] pid={target.project_id} ({target_host}) failed: {e}")

    def stop(self):
        self.poll()  # final flush
        for target in self._targets:
            stats = self._stats[target.project_id]
            status_summary = " ".join(
                f"{code}x{count}" for code, count in sorted(stats["status_counts"].items())
            )
            summary = (
                f"[CsqDualInjection] pid={target.project_id} - {stats['sent']} sent, "
                f"{stats['succeeded']} succeeded, {stats['failed']} failed"
            )
            if status_summary:
                summary += f" | statuses: {status_summary}"
            print(summary)
