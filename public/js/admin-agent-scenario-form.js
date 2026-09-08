(function () {
  var stepsContainer = document.getElementById('stepsContainer');
  var addStepBtn = document.getElementById('addStepBtn');
  var form = document.getElementById('scenario-form');
  var initialDataEl = document.getElementById('initial-scenario-data');

  var initialSteps = [];
  try { initialSteps = JSON.parse(initialDataEl.textContent || '[]'); } catch (e) {}

  function newClientId() {
    return 'new-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function chipRow(chip) {
    chip = chip || {};
    var row = document.createElement('div');
    row.className = 'row g-2 align-items-start mb-2 chip-row';
    row.innerHTML =
      '<div class="col-md-3">' +
        '<input type="text" class="form-control form-control-sm chip-label-input" placeholder="Chip label" value="' + escapeHtml(chip.label) + '">' +
      '</div>' +
      '<div class="col-md-5">' +
        '<textarea class="form-control form-control-sm chip-response-input" rows="1" placeholder="Agent response">' + escapeHtml(chip.response_text) + '</textarea>' +
      '</div>' +
      '<div class="col-md-3">' +
        '<select class="form-select form-select-sm chip-next-select"></select>' +
      '</div>' +
      '<div class="col-md-1">' +
        '<button type="button" class="btn btn-outline-danger btn-sm remove-chip-btn" title="Remove chip"><i class="bi bi-x"></i></button>' +
      '</div>';
    row.querySelector('.chip-next-select').dataset.initialNext = chip.nextClientId || '';
    return row;
  }

  function stepBlock(step) {
    step = step || {};
    var clientId = step.clientId || newClientId();
    var mode = step.input_mode === 'chips' ? 'chips' : 'free_text';
    var div = document.createElement('div');
    div.className = 'card border-0 shadow-sm mb-3 ai-agent-admin-step';
    div.dataset.clientId = clientId;
    div.innerHTML =
      '<div class="card-body p-3">' +
        '<div class="d-flex justify-content-between align-items-center mb-3">' +
          '<span class="fw-bold step-order-label"></span>' +
          '<div class="d-flex align-items-center gap-3">' +
            '<div class="btn-group btn-group-sm" role="group">' +
              '<input type="radio" class="btn-check mode-radio" name="mode-' + clientId + '" value="free_text" id="mode-free-' + clientId + '"' + (mode === 'free_text' ? ' checked' : '') + '>' +
              '<label class="btn btn-outline-primary" for="mode-free-' + clientId + '">Free Text</label>' +
              '<input type="radio" class="btn-check mode-radio" name="mode-' + clientId + '" value="chips" id="mode-chips-' + clientId + '"' + (mode === 'chips' ? ' checked' : '') + '>' +
              '<label class="btn btn-outline-primary" for="mode-chips-' + clientId + '">Chips</label>' +
            '</div>' +
            '<button type="button" class="btn btn-outline-danger btn-sm remove-step-btn" title="Remove step"><i class="bi bi-trash3"></i></button>' +
          '</div>' +
        '</div>' +
        '<input type="hidden" class="input-mode-input" value="' + mode + '">' +
        '<div class="free-text-fields"' + (mode === 'chips' ? ' style="display:none;"' : '') + '>' +
          '<label class="form-label small fw-semibold">Agent response (any input from the user advances here)</label>' +
          '<textarea class="form-control response-text-input" rows="2">' + escapeHtml(step.response_text) + '</textarea>' +
        '</div>' +
        '<div class="chips-fields"' + (mode === 'chips' ? '' : ' style="display:none;"') + '>' +
          '<label class="form-label small fw-semibold">Chip options for this turn</label>' +
          '<div class="chips-list"></div>' +
          '<button type="button" class="btn btn-outline-secondary btn-sm add-chip-btn mt-1"><i class="bi bi-plus-lg me-1"></i>Add Chip</button>' +
        '</div>' +
        '<div class="mt-3">' +
          '<label class="form-label small fw-semibold">Typing delay (ms)</label>' +
          '<input type="number" class="form-control form-control-sm typing-delay-input" style="max-width:120px;" min="0" step="100" value="' + (step.typing_delay_ms || 1200) + '">' +
        '</div>' +
      '</div>';

    var chipsList = div.querySelector('.chips-list');
    (step.chips || []).forEach(function (chip) { chipsList.appendChild(chipRow(chip)); });

    return div;
  }

  function refresh() {
    var blocks = Array.prototype.slice.call(stepsContainer.querySelectorAll('.ai-agent-admin-step'));
    var options = blocks.map(function (b, i) {
      return { clientId: b.dataset.clientId, label: 'Step ' + (i + 1) };
    });
    blocks.forEach(function (b, i) {
      b.querySelector('.step-order-label').textContent = 'Step ' + (i + 1);
      var selects = b.querySelectorAll('.chip-next-select');
      selects.forEach(function (select) {
        var current = select.options.length ? select.value : (select.dataset.initialNext || '');
        select.innerHTML = '<option value="">End conversation</option>' +
          options.filter(function (o) { return o.clientId !== b.dataset.clientId; })
            .map(function (o) { return '<option value="' + o.clientId + '"' + (o.clientId === current ? ' selected' : '') + '>' + o.label + '</option>'; })
            .join('');
      });
    });
  }

  function addStep(step) {
    stepsContainer.appendChild(stepBlock(step));
    refresh();
  }

  stepsContainer.addEventListener('click', function (e) {
    if (e.target.closest('.remove-step-btn')) {
      e.target.closest('.ai-agent-admin-step').remove();
      refresh();
    } else if (e.target.closest('.add-chip-btn')) {
      var stepEl = e.target.closest('.ai-agent-admin-step');
      stepEl.querySelector('.chips-list').appendChild(chipRow());
      refresh();
    } else if (e.target.closest('.remove-chip-btn')) {
      e.target.closest('.chip-row').remove();
    }
  });

  stepsContainer.addEventListener('change', function (e) {
    if (e.target.classList.contains('mode-radio')) {
      var stepEl = e.target.closest('.ai-agent-admin-step');
      var mode = e.target.value;
      stepEl.querySelector('.input-mode-input').value = mode;
      stepEl.querySelector('.free-text-fields').style.display = mode === 'free_text' ? '' : 'none';
      stepEl.querySelector('.chips-fields').style.display = mode === 'chips' ? '' : 'none';
    }
  });

  addStepBtn.addEventListener('click', function () { addStep(); });

  if (initialSteps.length) {
    initialSteps.forEach(function (step) { addStep(step); });
  } else {
    addStep();
  }

  function addHidden(container, name, value) {
    var input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    container.appendChild(input);
  }

  form.addEventListener('submit', function () {
    var existing = document.getElementById('serializedFields');
    if (existing) existing.remove();

    var container = document.createElement('div');
    container.id = 'serializedFields';
    container.style.display = 'none';

    var blocks = Array.prototype.slice.call(stepsContainer.querySelectorAll('.ai-agent-admin-step'));
    blocks.forEach(function (block, i) {
      addHidden(container, 'steps[' + i + '][client_id]', block.dataset.clientId);
      addHidden(container, 'steps[' + i + '][input_mode]', block.querySelector('.input-mode-input').value);
      addHidden(container, 'steps[' + i + '][response_text]', block.querySelector('.response-text-input').value);
      addHidden(container, 'steps[' + i + '][typing_delay_ms]', block.querySelector('.typing-delay-input').value);
      var chipRows = Array.prototype.slice.call(block.querySelectorAll('.chip-row'));
      chipRows.forEach(function (chipEl, j) {
        addHidden(container, 'steps[' + i + '][chips][' + j + '][label]', chipEl.querySelector('.chip-label-input').value);
        addHidden(container, 'steps[' + i + '][chips][' + j + '][response_text]', chipEl.querySelector('.chip-response-input').value);
        addHidden(container, 'steps[' + i + '][chips][' + j + '][next_client_id]', chipEl.querySelector('.chip-next-select').value);
      });
    });

    form.appendChild(container);
  });
})();
