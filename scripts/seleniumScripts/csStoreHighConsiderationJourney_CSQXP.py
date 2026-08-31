import sys
import os
import time
import json
import random
import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.common.keys import Keys
import csq_dual_injection

# ===========================================================================
# csStoreHighConsiderationJourney_CSQXP.py
#
# A DEDICATED high-consideration-journey script — separate from
# csStoreRetentionModel_CSQXP.py and csStoreJourneyZoningFunnel_CSQXP.py on
# purpose. Retention models REPEAT orders decaying over months; this script
# models a single purchase decision that a shopper deliberates over ~5 visits
# across ~2 weeks, comparing 2-3 options within one category before
# converting on one of them. Today's 30-minute session timeout would read
# that as several isolated low-intent bounces — this script's job is to
# generate the multi-visit source data so CSQ / Heap can reconcile it back
# into one continuous path-to-purchase, identified at the user level rather
# than stitched by session.
#
#   Start event / Return event : 'HighConsiderationSession' (visit-to-visit)
#                                'HighConsiderationConverted' (on conversion)
#   Group by                   : 'considerationCategory' custom variable
#
# All tracking is fired by JS injection into the page via _uxa.push(...) — the
# unified CSQ tag cross-writes Heap (cs_crosswrites_heap), so NO site changes
# are needed, and routing through _uxa avoids depending on window.heap
# directly.
#
# Journey progress is shaped by a per-user state file
# (highConsiderationJourneyState_CSQXP.json) that records each persona's
# category, comparison shortlist, visit count, and target visit/day count.
# Delete that file to restart every journey from scratch.
# ===========================================================================

# ---------------------------------------------------------------------------
# [CONFIG] Change siteDomain to match your deployed site (or localhost:3000).
# ---------------------------------------------------------------------------
siteDomain = "sc-demo-cstore-new.vercel.app"

SCRIPT_DIR    = os.path.dirname(os.path.abspath(__file__))
PERSONA_FILE  = os.path.join(SCRIPT_DIR, "csStoreCustomerPersonas_CSQXP.json")
POOL_FILE     = os.path.join(SCRIPT_DIR, "highConsiderationPool_CSQXP.json")
CATALOG_FILE  = os.path.join(SCRIPT_DIR, "highConsiderationCatalog_CSQXP.json")
STATE_FILE    = os.path.join(SCRIPT_DIR, "highConsiderationJourneyState_CSQXP.json")
COOKIE_FILE   = os.path.join(SCRIPT_DIR, "highConsiderationCookies_CSQXP.json")

# ---------------------------------------------------------------------------
# [CONFIG] Journey shape — mirrors "comes back five times over two weeks":
# a persona's journey converts once they hit TARGET_VISITS visits or
# TARGET_DAYS days since their first visit, whichever comes first. Randomized
# per-journey (not per-session) so it doesn't look mechanical while still
# landing close to the ~5-visits-over-~2-weeks story.
# ---------------------------------------------------------------------------
TARGET_VISITS_RANGE = (4, 6)     # inclusive
TARGET_DAYS_RANGE    = (10, 16)   # inclusive

MIN_DAYS_BETWEEN_VISITS = 2       # cooldown so visits don't cluster same-day
POST_CONVERSION_COOLDOWN_DAYS = 5 # rest period before a persona starts a NEW journey

# Winner is decided at journey start (biased toward the priciest shortlist
# item) so "the same product wins" is consistent across every visit.
WINNER_WEIGHTS = [0.5, 0.3, 0.2]  # by shortlist position, most expensive first

# 14 curated Chrome-only UA strings — realistic OS/version distribution
# (~64% Windows, ~36% Mac). Chrome-only on purpose: the CSQ tag itself
# branches on navigator.userAgent for Safari detection (confirmed by reading
# the live tag bundle), so a spoofed Safari/Android string on a real Chrome
# engine could push a persona's session down a code path that doesn't match
# the actual browser. Assigned per-persona (by personaIndex) so a given
# persona always presents the same browser across runs.
UA_POOL = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 12_7_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
]

scriptRunTimestamp = datetime.datetime.now()
today = datetime.date.today()

print("[INIT] " + "=" * 60)
print("[INIT] scriptRunTimestamp = " + str(scriptRunTimestamp))
print("[INIT] scriptname = csStoreHighConsiderationJourney_CSQXP.py")


# ---------------------------------------------------------------------------
# [INIT] Load persona library + pool manifest + product catalog
# ---------------------------------------------------------------------------
with open(PERSONA_FILE, "r") as f:
    personas = json.load(f)

if not os.path.exists(POOL_FILE) or not os.path.exists(CATALOG_FILE):
    print("[INIT] ERROR — highConsiderationPool_CSQXP.json / highConsiderationCatalog_CSQXP.json "
          "not found. Run `npm run seed-high-consideration-users` first.")
    sys.exit(1)

with open(POOL_FILE, "r") as f:
    pool = json.load(f)

with open(CATALOG_FILE, "r") as f:
    catalog = json.load(f)

print("[INIT] pool size = " + str(len(pool)) + ", catalog categories = " + str(len(catalog)))

personaIndex = random.choice(pool)
persona      = personas[personaIndex]
userAgentString = UA_POOL[personaIndex % len(UA_POOL)]

customerName          = persona["customerName"]
nameParts             = customerName.split()
customerFirstName     = nameParts[0]
customerLastName      = nameParts[1] if len(nameParts) > 1 else ""
customerEmail         = persona["customerEmail"].lower().strip()   # matches seeded DB record
customerPassword      = persona["customerPassword"]
customerStreetAddress = persona.get("customerStreetAddress", "")
customerCity          = str(persona.get("customerCity", ""))
customerState         = str(persona.get("customerState", ""))
customerPostalCode    = str(persona.get("customerPostalCode", ""))

print("[INIT] customer         = " + customerName + " <" + customerEmail + ">")
print("[INIT] user_agent       = " + userAgentString[:72] + "...")

startingUrl = "https://" + siteDomain + "/?sessionReplay=true&sessionReplayName=csStoreHighConsiderationJourney"


# ---------------------------------------------------------------------------
# [STATE] Load / save the journey state file (atomic writes, script-relative)
# ---------------------------------------------------------------------------
def load_state():
    if not os.path.exists(STATE_FILE):
        return {}
    try:
        with open(STATE_FILE, "r") as f:
            return json.load(f)
    except Exception as e:
        print("[STATE] Could not read state file (" + str(e) + ") — starting empty")
        return {}

def save_state(state):
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, STATE_FILE)

# ---------------------------------------------------------------------------
# [COOKIES] Per-persona CSQ cookie cache — same mechanism as the retention
# script. See csStoreRetentionModel_CSQXP.py for the full rationale: CSQ's
# New/Returning classification is purely cookie-based, independent of
# identify(), and every run launches a fresh browser with cleared cookies.
# ---------------------------------------------------------------------------
CS_PERSISTENT_COOKIES = ("_cs_c", "_cs_id")

def load_cookie_cache():
    if not os.path.exists(COOKIE_FILE):
        return {}
    try:
        with open(COOKIE_FILE, "r") as f:
            return json.load(f)
    except Exception as e:
        print("[COOKIE] Could not read cookie cache (" + str(e) + ") — starting empty")
        return {}

def save_cookie_cache(cache):
    tmp = COOKIE_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(cache, f, indent=2)
    os.replace(tmp, COOKIE_FILE)


# ---------------------------------------------------------------------------
# [JOURNEY] Small date helpers
# ---------------------------------------------------------------------------
def days_since(date_str):
    d = datetime.date.fromisoformat(date_str)
    return (today - d).days


# ---------------------------------------------------------------------------
# [BROWSER] Chrome setup
# ---------------------------------------------------------------------------
print("[BROWSER] Initialising Chrome...")

options = webdriver.ChromeOptions()
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--disable-gpu")
options.add_argument("--window-size=1280,900")
options.add_argument("user-agent=" + userAgentString)
options.page_load_strategy = "normal"

# Optional CSQ dual-injection (replay tag beacons to extra project(s) — see
# csq_dual_injection.py). Disabled unless CSQ_DUAL_INJECTION_TARGETS is set.
dualInjectionTargets = csq_dual_injection.load_dual_injection_targets()
if dualInjectionTargets:
    options.set_capability("goog:loggingPrefs", {"performance": "ALL"})

driver = webdriver.Chrome(options=options)
driver.set_window_size(1280, 900)
print("[BROWSER] Chrome launched")

driver.execute_cdp_cmd("Network.clearBrowserCookies", {})
driver.execute_cdp_cmd("Network.clearBrowserCache", {})
driver.execute_cdp_cmd("Network.enable", {})
# Comparison shoppers arrive direct (typed / bookmarked PDP / "still deciding" email nudge).
driver.execute_cdp_cmd("Network.setExtraHTTPHeaders", {"headers": {"Referer": "https://mail.google.com/"}})

dualInjection = csq_dual_injection.CsqDualInjection(driver, dualInjectionTargets) if dualInjectionTargets else None


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------
def log(prefix, msg):
    print("[" + prefix + "] " + msg)

def wait(lo=0.8, hi=2.2):
    if dualInjection:
        dualInjection.poll()
    time.sleep(random.uniform(lo, hi))

def scroll_to(element):
    driver.execute_script("arguments[0].scrollIntoView({behavior:'smooth',block:'center'})", element)
    time.sleep(random.uniform(0.6, 1.2))

def partial_page_scroll(stop_fraction=0.5, label=""):
    ph = driver.execute_script("return document.body.scrollHeight")
    target = int(ph * stop_fraction)
    pos, step = 0, random.randint(280, 420)
    if label:
        log("SCROLL", label)
    while pos < target:
        pos += step
        driver.execute_script("window.scrollBy({top:" + str(step) + ",behavior:'smooth'})")
        time.sleep(random.uniform(0.4, 0.9))

def hover_click(element, wait_after=2.0):
    try:
        if element.size["width"] == 0 or element.size["height"] == 0:
            return
    except Exception as _e:
        if "invalid session id" in str(_e).lower():
            raise
        return
    ActionChains(driver, duration=random.randint(500, 900)).move_to_element(element).perform()
    time.sleep(random.uniform(0.3, 0.7))
    element.click()
    time.sleep(wait_after)

def find_clickable(element_id, timeout=10):
    return WebDriverWait(driver, timeout).until(EC.element_to_be_clickable((By.ID, element_id)))

def try_find(element_id, timeout=5):
    try:
        return WebDriverWait(driver, timeout).until(EC.presence_of_element_located((By.ID, element_id)))
    except Exception:
        return None


# ---------------------------------------------------------------------------
# CS + Heap tracking helpers (JS injection — unified CSQ tag loads Heap)
# ---------------------------------------------------------------------------
def cs_check():
    try:
        WebDriverWait(driver, 12).until(
            lambda d: d.execute_script("return (typeof _uxa==='object' && typeof heap==='object');")
        )
        log("TRACK", "_uxa + heap confirmed present")
    except Exception:
        log("TRACK", "tracking libs not found — events may not register")

def cs_identify():
    driver.execute_script(
        "if(typeof _uxa!=='undefined') _uxa.push(['trackPageEvent','@user-identifier@" + customerEmail + "']);"
    )

# CSQ's setCustomVariable requires a numeric index FIRST (1-20), not the
# name — every script/page that calls this must use the SAME index for the
# same name (see the project-wide setCustomVariable index bug fix). Indices
# 1-15 are already claimed by the other scripts / footer.ejs / the ChatGPT
# widget — this script only adds 16-18, it never reuses 1-15.
CS_CUSTOM_VAR_INDEX = {
    "script_name": 1,
    "Loyalty Tier": 2,
    "customerType": 3,
    "orderNumber": 4,
    "channel": 5,
    "coupon_code": 6,
    "days_since_issued": 7,
    "numberOfPastPurchases": 8,
    "entryPoint": 9,
    "sessionOutcome": 10,
    "selectedPath": 11,
    "pathName": 12,
    "promptCount": 13,
    "filterBarUsed": 14,
    "userPrompt": 15,
    "visitNumber": 16,
    "daysInJourney": 17,
    "considerationCategory": 18,
}

def cs_var(key, value):
    index = CS_CUSTOM_VAR_INDEX[key]
    driver.execute_script(
        "if(typeof _uxa!=='undefined') _uxa.push(['setCustomVariable'," + str(index) + ",'" + key + "','" + str(value) + "','visit']);"
    )

def heap_identify():
    driver.execute_script("if(typeof _uxa!=='undefined') _uxa.push(['identify', '" + customerEmail + "']);")
    log("TRACK", "_uxa identify → " + customerEmail)

def heap_user_props():
    driver.execute_script(
        "if(typeof _uxa!=='undefined') _uxa.push(['addUserProperties', {"
        "'customerType':'returning'"
        "}]);"
    )

def heap_event_props():
    driver.execute_script(
        "if(typeof _uxa!=='undefined') _uxa.push(['addEventProperties', {"
        "'data_source':'high_consideration',"
        "'script_name':'csStoreHighConsiderationJourney'"
        "}]);"
    )

def heap_track(event_name, props=None):
    props_json = json.dumps(props or {})
    driver.execute_script(
        "if(typeof _uxa!=='undefined') _uxa.push(['trackEvent', {name: '" + event_name + "', properties: " + props_json + "}]);"
    )
    log("TRACK", "_uxa trackEvent: '" + event_name + "' " + props_json)

def cs_event(name):
    driver.execute_script(
        "if(typeof _uxa!=='undefined') _uxa.push(['trackPageEvent','" + name + "']);"
    )


# ---------------------------------------------------------------------------
# Session flow helpers
# ---------------------------------------------------------------------------
def restore_cs_cookies(email):
    """Re-inject this persona's saved CSQ visitor cookies (if any) BEFORE the
    real, tracked homepage load — so this session starts with a valid CSQ
    cookie present and registers as Returning. See csStoreRetentionModel_CSQXP.py
    for why this uses CDP Network.setCookie instead of a throwaway navigation."""
    cache = load_cookie_cache()
    saved = cache.get(email)
    if not saved:
        log("COOKIE", "No saved CSQ cookies for " + email + " — first visit, staying New")
        return
    for name in CS_PERSISTENT_COOKIES:
        if name not in saved:
            continue
        try:
            driver.execute_cdp_cmd("Network.setCookie", {
                "name": name,
                "value": saved[name],
                "domain": "." + siteDomain,
                "path": "/",
            })
        except Exception as e:
            log("COOKIE", "Could not restore cookie " + name + ": " + str(e))
    log("COOKIE", "Restored CSQ cookies for " + email + " — should register as Returning")

def capture_cs_cookies(email):
    cache = load_cookie_cache()
    current = {}
    for c in driver.get_cookies():
        if c["name"] in CS_PERSISTENT_COOKIES:
            current[c["name"]] = c["value"]
    if current:
        cache[email] = current
        save_cookie_cache(cache)
        log("COOKIE", "Saved CSQ cookies for " + email + " (" + ", ".join(current.keys()) + ")")
    else:
        log("COOKIE", "No CSQ cookies found to save for " + email)

def load_homepage():
    driver.get(startingUrl)
    time.sleep(random.uniform(4, 6))
    log("MAIN", "Homepage loaded — " + driver.current_url)
    cs_check()

def login_account():
    log("MAIN", "Logging in as " + customerEmail)
    driver.get("https://" + siteDomain + "/login")
    time.sleep(random.uniform(3, 5))
    email_field = find_clickable("login-email")
    hover_click(email_field, wait_after=0.5)
    email_field.send_keys(customerEmail)
    wait(0.5, 1.0)
    pw_field = find_clickable("login-password")
    hover_click(pw_field, wait_after=0.5)
    pw_field.send_keys(customerPassword)
    wait(0.6, 1.2)
    submit = find_clickable("login-submit")
    hover_click(submit, wait_after=random.uniform(4, 6))
    log("MAIN", "Login submitted")

def view_product(slug, label=""):
    """Navigate directly to a specific product's PDP by slug — this journey
    needs the SAME shortlist products revisited every time, not a random pick
    off the grid like the other scripts."""
    driver.get("https://" + siteDomain + "/product/" + slug)
    time.sleep(random.uniform(3, 5))
    log("MAIN", "Viewing PDP" + (" (" + label + ")" if label else "") + " — " + driver.current_url)
    partial_page_scroll(random.uniform(0.4, 0.7), "reading PDP" + (" — " + label if label else ""))
    time.sleep(random.uniform(1.5, 3))

def browse_category(categorySlug):
    driver.get("https://" + siteDomain + "/shop?category=" + categorySlug)
    time.sleep(random.uniform(4, 6))
    log("MAIN", "Browsing category — " + driver.current_url)
    partial_page_scroll(random.uniform(0.4, 0.6), "browsing category")

def add_to_cart():
    try:
        stock_el = driver.find_element(By.ID, "pd-stock-status")
        if "Out of Stock" in stock_el.text:
            log("MAIN", "Product out of stock — cannot order")
            return False
    except Exception:
        pass
    atc = try_find("pd-add-to-cart", timeout=15)
    if not atc:
        log("MAIN", "pd-add-to-cart not found")
        return False
    scroll_to(atc)
    hover_click(atc, wait_after=random.uniform(3, 5))
    log("MAIN", "Added to cart")
    return True

def view_cart():
    link = find_clickable("nav-cart-link")
    hover_click(link, wait_after=random.uniform(3, 5))
    log("MAIN", "Viewing cart")

def proceed_to_checkout():
    btn = find_clickable("proceed-to-checkout")
    scroll_to(btn)
    hover_click(btn, wait_after=random.uniform(5, 7))
    log("MAIN", "Proceeded to checkout")

def fill_checkout_form():
    def fill(field_id, value):
        el = try_find(field_id, timeout=8)
        if not el:
            return
        scroll_to(el)
        ActionChains(driver, duration=500).move_to_element(el).perform()
        el.click()
        el.clear()
        el.send_keys(value)
        wait(0.3, 0.8)
    fill("shipping-name", customerFirstName + " " + customerLastName)
    fill("shipping-email", customerEmail)
    fill("shipping-address", customerStreetAddress)
    fill("shipping-city", customerCity)
    fill("shipping-state", customerState[:2].upper())
    fill("shipping-zip", customerPostalCode[:5])
    log("MAIN", "Checkout form filled")

def fill_card_fields():
    try:
        pm_card = find_clickable("pm_card", timeout=6)
        scroll_to(pm_card)
        hover_click(pm_card, wait_after=random.uniform(1.0, 1.8))
    except Exception as ex:
        log("MAIN", "pm_card not found: " + str(ex))
        return
    cc_name = try_find("cc-name", timeout=6)
    if cc_name:
        scroll_to(cc_name)
        cc_name.click()
        cc_name.send_keys(customerFirstName + " " + customerLastName)
        wait(0.4, 0.9)
    cc_expiry = try_find("cc-expiry", timeout=5)
    if cc_expiry:
        cc_expiry.click()
        cc_expiry.send_keys(str(random.randint(1, 12)).zfill(2) + str(random.randint(27, 31)))
        wait(0.4, 0.9)
    cc_number = try_find("cc-number", timeout=5)
    if cc_number:
        cc_number.click()
        full = "4532" + str(random.randint(100000000000, 999999999999))
        cc_number.send_keys(full)
        wait(0.4, 0.8)
    cc_cvv = try_find("cc-cvv", timeout=5)
    if cc_cvv:
        cc_cvv.click()
        cc_cvv.send_keys(str(random.randint(100, 999)))
        wait(0.4, 0.8)
    log("MAIN", "Card fields filled")

def place_order():
    btn = find_clickable("place-order-btn")
    scroll_to(btn)
    hover_click(btn, wait_after=random.uniform(10, 15))
    log("MAIN", "place-order-btn clicked")

def verify_order_confirmation():
    try:
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.ID, "order-confirmation-header"))
        )
        log("MAIN", "Order confirmed")
        return True
    except Exception:
        log("MAIN", "Order confirmation not detected")
        return False


# ---------------------------------------------------------------------------
# Journey-specific session flows
# ---------------------------------------------------------------------------
def start_new_journey():
    entry = random.choice(catalog)
    products = entry["products"]
    winnerCount = min(len(WINNER_WEIGHTS), len(products))
    winnerIdx = random.choices(range(winnerCount), weights=WINNER_WEIGHTS[:winnerCount], k=1)[0]
    return {
        "category": entry["categoryName"],
        "shortlist": products,
        "winnerId": products[winnerIdx]["id"],
        "firstVisitDate": today.isoformat(),
        "lastVisitDate": None,
        "visitCount": 0,
        "targetVisits": random.randint(*TARGET_VISITS_RANGE),
        "targetDays": random.randint(*TARGET_DAYS_RANGE),
        "converted": False,
        "convertedProductId": None,
        "convertedDate": None,
    }

def shortlist_product(journey, product_id):
    for p in journey["shortlist"]:
        if p["id"] == product_id:
            return p
    return journey["shortlist"][0]

def run_comparison_visit(journey, visitNumber):
    """A non-final visit within an ongoing journey: revisit the winner product
    plus at least one other shortlist item for comparison, sometimes adding to
    cart and then abandoning — reflecting the "many broken sessions" pattern
    the slide describes, except here they're all the SAME identified shopper."""
    winner = shortlist_product(journey, journey["winnerId"])
    others = [p for p in journey["shortlist"] if p["id"] != journey["winnerId"]]
    comparisonProduct = random.choice(others) if others else None

    if visitNumber == 1:
        browse_category(winner["categorySlug"])

    view_product(winner["slug"], label="winner / " + journey["category"])
    if comparisonProduct:
        view_product(comparisonProduct["slug"], label="comparing / " + journey["category"])
        # Come back to the winner once more before leaving — comparison shoppers
        # tend to end back on their front-runner, not the alternative.
        view_product(winner["slug"], label="back to winner")

    if random.random() < 0.6:
        if add_to_cart():
            log("MAIN", "Cart added mid-journey, then abandoned (visit " + str(visitNumber) + ")")
            return "cart_abandon"
    return "browse_only"

def run_conversion_visit(journey):
    """Final visit: winner goes in the cart and all the way through checkout."""
    winner = shortlist_product(journey, journey["winnerId"])
    view_product(winner["slug"], label="winner / converting")
    if not add_to_cart():
        return False
    view_cart()
    partial_page_scroll(0.5, "reviewing cart before converting")
    proceed_to_checkout()
    fill_checkout_form()
    fill_card_fields()
    place_order()
    return verify_order_confirmation()

def run_post_conversion_browse():
    """Persona already converted and is still in cooldown — a light, unrelated
    browse so the session isn't wasted, without touching journey state."""
    driver.get("https://" + siteDomain + "/shop")
    time.sleep(random.uniform(5, 8))
    partial_page_scroll(random.uniform(0.3, 0.5), "post-conversion casual browse")
    log("MAIN", "Post-conversion cooldown browse — no journey activity")


# ===========================================================================
# [MAIN]
# ===========================================================================
state = load_state()
journey = state.get(customerEmail)

isGlanceOnly = False   # same-day repeat pick — doesn't advance the journey
isPostConversionCooldown = False

try:
    if journey and journey.get("converted"):
        daysSinceConversion = days_since(journey["convertedDate"])
        if daysSinceConversion < POST_CONVERSION_COOLDOWN_DAYS:
            isPostConversionCooldown = True
        else:
            log("MAIN", "Cooldown elapsed (" + str(daysSinceConversion) + "d) — starting a NEW journey for " + customerEmail)
            journey = start_new_journey()
    elif journey is None:
        journey = start_new_journey()
        log("MAIN", "New journey — " + customerEmail + " comparing in " + journey["category"])

    restore_cs_cookies(customerEmail)
    load_homepage()

    heap_identify()
    cs_identify()
    heap_user_props()
    heap_event_props()
    cs_var("script_name", "csStoreHighConsiderationJourney")

    login_account()

    if isPostConversionCooldown:
        cs_var("sessionOutcome", "PostConversionBrowse")
        run_post_conversion_browse()

    else:
        if journey["lastVisitDate"] is not None and days_since(journey["lastVisitDate"]) < MIN_DAYS_BETWEEN_VISITS:
            isGlanceOnly = True

        if isGlanceOnly:
            log("MAIN", "Same-day repeat pick — running an uncounted glance, not an official visit")
            cs_var("considerationCategory", journey["category"])
            cs_var("visitNumber", journey["visitCount"])
            cs_var("sessionOutcome", "Glance")
            winner = shortlist_product(journey, journey["winnerId"])
            view_product(winner["slug"], label="glance / " + journey["category"])
            heap_track("HighConsiderationSession", {
                "considerationCategory": journey["category"],
                "visitNumber": journey["visitCount"],
                "official": False
            })
            cs_event("HighConsiderationSession")

        else:
            visitNumber = journey["visitCount"] + 1
            daysInJourney = days_since(journey["firstVisitDate"]) if journey["visitCount"] > 0 else 0
            isFinalVisit = visitNumber >= journey["targetVisits"] or daysInJourney >= journey["targetDays"]

            cs_var("considerationCategory", journey["category"])
            cs_var("visitNumber", visitNumber)
            cs_var("daysInJourney", daysInJourney)

            heap_track("HighConsiderationSession", {
                "considerationCategory": journey["category"],
                "visitNumber": visitNumber,
                "daysInJourney": daysInJourney,
                "official": True
            })
            cs_event("HighConsiderationSession")

            log("MAIN", "Visit " + str(visitNumber) + "/" + str(journey["targetVisits"]) +
                " (day " + str(daysInJourney) + "/" + str(journey["targetDays"]) +
                ") — category=" + journey["category"] + ", finalVisit=" + str(isFinalVisit))

            journey["visitCount"] = visitNumber
            journey["lastVisitDate"] = today.isoformat()

            if isFinalVisit:
                cs_var("sessionOutcome", "Converting")
                confirmed = run_conversion_visit(journey)
                if confirmed:
                    journey["converted"] = True
                    journey["convertedProductId"] = journey["winnerId"]
                    journey["convertedDate"] = today.isoformat()
                    heap_track("HighConsiderationConverted", {
                        "considerationCategory": journey["category"],
                        "visitNumber": visitNumber,
                        "daysInJourney": daysInJourney,
                        "productId": journey["winnerId"]
                    })
                    cs_event("HighConsiderationConverted")
                    log("MAIN", "Converted on visit " + str(visitNumber) + " — product " + str(journey["winnerId"]))
                else:
                    log("MAIN", "Final visit did not confirm an order — journey left open, will retry next pick")
            else:
                outcome = run_comparison_visit(journey, visitNumber)
                cs_var("sessionOutcome", "CartAbandon" if outcome == "cart_abandon" else "Comparing")

            state[customerEmail] = journey
            save_state(state)

    log("MAIN", "Session complete for " + customerEmail)

except Exception as e:
    log("ERROR", "Unhandled exception (" + customerEmail + "): " + str(e))
    import traceback
    traceback.print_exc()

finally:
    log("CLEANUP", "Closing browser")
    try:
        capture_cs_cookies(customerEmail)
    except Exception as e:
        log("COOKIE", "Could not capture CSQ cookies: " + str(e))
    try:
        driver.execute_script("window.localStorage.clear(); window.sessionStorage.clear();")
    except Exception:
        pass
    try:
        driver.delete_all_cookies()
    except Exception:
        pass
    if dualInjection:
        dualInjection.stop()
    driver.quit()
    log("CLEANUP", "Done")
