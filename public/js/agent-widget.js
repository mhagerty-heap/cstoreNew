// Scripted "AI agent" chat widget. Fully canned — no LLM calls. Activated per
// browser session via ?aiScenario=<slug>, persisted in sessionStorage so it
// survives navigation without the query param on every page. The scenario's
// steps/chips are admin-authored (see /admin/agent-scenarios) and fetched
// once from /agent-chat/scenario/:slug.
(function () {
  var params = new URLSearchParams(window.location.search);
  var qsSlug = params.get('aiScenario');
  if (qsSlug) {
    try { sessionStorage.setItem('aiScenarioSlug', qsSlug); } catch (e) {}
  }

  var slug = qsSlug;
  if (!slug) {
    try { slug = sessionStorage.getItem('aiScenarioSlug'); } catch (e) {}
  }
  if (!slug) return;

  fetch('/agent-chat/scenario/' + encodeURIComponent(slug))
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (data && data.success) initWidget(data.scenario);
    })
    .catch(function () {});

  function initWidget(scenario) {
    var link = document.getElementById('ai-agent-icon-link');
    if (!link) return;
    link.style.display = '';

    var panel = null;
    var body = null;
    var textFooter = null;
    var chipsFooter = null;
    var input = null;
    var stepIndex = 0;
    var ended = false;

    link.addEventListener('click', function (e) {
      e.preventDefault();
      if (!panel) {
        buildPanel();
        renderGreeting();
        renderStep();
      } else {
        panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
      }
    });

    function buildPanel() {
      panel = document.createElement('div');
      panel.id = 'ai-agent-panel';
      panel.className = 'ai-agent-panel';
      panel.innerHTML =
        '<div class="ai-agent-topbar">' +
          '<span>' + escapeHtml(scenario.name || 'AI Assistant') + '</span>' +
          '<button type="button" class="ai-agent-close" id="ai-agent-close-btn">&times;</button>' +
        '</div>' +
        '<div class="ai-agent-body" id="ai-agent-body"></div>' +
        '<div class="ai-agent-chips-footer" id="ai-agent-chips-footer" style="display:none;"></div>' +
        '<div class="ai-agent-text-footer" id="ai-agent-text-footer">' +
          '<input type="text" class="ai-agent-input" id="ai-agent-input" placeholder="Type a message...">' +
          '<button type="button" class="ai-agent-send" id="ai-agent-send-btn">Send</button>' +
        '</div>';
      document.body.appendChild(panel);

      body = panel.querySelector('#ai-agent-body');
      textFooter = panel.querySelector('#ai-agent-text-footer');
      chipsFooter = panel.querySelector('#ai-agent-chips-footer');
      input = panel.querySelector('#ai-agent-input');

      panel.querySelector('#ai-agent-close-btn').addEventListener('click', function () {
        panel.style.display = 'none';
      });
      panel.querySelector('#ai-agent-send-btn').addEventListener('click', handleSend);
      input.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') handleSend();
      });
    }

    function escapeHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function appendBubble(text, who) {
      var bubble = document.createElement('div');
      bubble.className = 'ai-agent-bubble ai-agent-bubble-' + who;
      bubble.textContent = text;
      body.appendChild(bubble);
      body.scrollTop = body.scrollHeight;
      return bubble;
    }

    function renderGreeting() {
      if (scenario.greeting) appendBubble(scenario.greeting, 'agent');
    }

    function currentStep() {
      return scenario.steps[stepIndex];
    }

    function renderStep() {
      var step = currentStep();
      if (ended || !step) {
        ended = true;
        chipsFooter.style.display = 'none';
        textFooter.style.display = 'flex';
        input.disabled = false;
        input.focus();
        return;
      }

      if (step.mode === 'chips' && step.chips && step.chips.length) {
        textFooter.style.display = 'none';
        chipsFooter.style.display = 'flex';
        chipsFooter.innerHTML = '';
        step.chips.forEach(function (chip, i) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'ai-agent-chip';
          btn.id = 'ai-agent-chip-' + i;
          btn.setAttribute('data-label', chip.label);
          btn.textContent = chip.label;
          btn.addEventListener('click', function () { handleChip(chip); });
          chipsFooter.appendChild(btn);
        });
      } else {
        chipsFooter.style.display = 'none';
        textFooter.style.display = 'flex';
        input.disabled = false;
        input.focus();
      }
    }

    function showTypingThen(delayMs, fn) {
      var typing = document.createElement('div');
      typing.className = 'ai-agent-typing';
      typing.innerHTML = '<span></span><span></span><span></span>';
      body.appendChild(typing);
      body.scrollTop = body.scrollHeight;
      setTimeout(function () {
        typing.remove();
        fn();
      }, delayMs || 1200);
    }

    function handleSend() {
      var text = input.value.trim();
      if (!text) return;
      appendBubble(text, 'user');
      input.value = '';
      input.disabled = true;

      if (ended) {
        showTypingThen(1000, function () {
          appendBubble(scenario.completionText, 'agent');
          input.disabled = false;
          input.focus();
        });
        return;
      }

      var step = currentStep();
      showTypingThen(step.typingDelayMs, function () {
        appendBubble(step.response, 'agent');
        stepIndex += 1;
        input.disabled = false;
        renderStep();
      });
    }

    function handleChip(chip) {
      appendBubble(chip.label, 'user');
      var step = currentStep();
      showTypingThen(step.typingDelayMs, function () {
        appendBubble(chip.response, 'agent');
        if (chip.next == null) {
          ended = true;
        } else {
          stepIndex = chip.next;
        }
        renderStep();
      });
    }
  }
})();
