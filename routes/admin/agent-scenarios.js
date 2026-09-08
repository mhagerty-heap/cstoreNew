const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const slugify = require('slugify');

function normalizeSteps(body) {
  // steps[] arrives via express's qs bracket-notation parsing. Each step
  // carries a client_id (see form.ejs) that chip[].next_client_id values
  // reference — for pre-existing steps this is just the old step's DB id
  // reused as a form-local key, since save always deletes+reinserts rather
  // than updating in place.
  const rawSteps = Array.isArray(body.steps) ? body.steps : Object.values(body.steps || {});
  return rawSteps.map((step) => {
    const mode = step.input_mode === 'chips' ? 'chips' : 'free_text';
    const rawChips = Array.isArray(step.chips) ? step.chips : Object.values(step.chips || {});
    return {
      clientId: String(step.client_id || ''),
      mode,
      responseText: mode === 'free_text' ? (step.response_text || '') : null,
      typingDelayMs: parseInt(step.typing_delay_ms, 10) || 1200,
      chips: mode === 'chips'
        ? rawChips
            .filter(c => c && c.label)
            .map(c => ({ label: c.label, responseText: c.response_text || '', nextClientId: c.next_client_id || '' }))
        : [],
    };
  }).filter(step => step.clientId);
}

// Full replace: delete this scenario's steps (cascades chips) and reinsert
// from the submitted form. Simplest correct option for an admin tool that
// only ever has one editor working on a scenario at a time.
const saveSteps = db.transaction((scenarioId, steps) => {
  db.prepare('DELETE FROM agent_scenario_steps WHERE scenario_id = ?').run(scenarioId);

  const insertStep = db.prepare(`
    INSERT INTO agent_scenario_steps (scenario_id, sort_order, input_mode, response_text, typing_delay_ms)
    VALUES (?, ?, ?, ?, ?)
  `);
  const stepIdByClientId = new Map();
  steps.forEach((step, i) => {
    const { lastInsertRowid } = insertStep.run(scenarioId, i, step.mode, step.responseText, step.typingDelayMs);
    stepIdByClientId.set(step.clientId, lastInsertRowid);
  });

  const insertChip = db.prepare(`
    INSERT INTO agent_scenario_chips (step_id, sort_order, label, response_text, next_step_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  steps.forEach((step) => {
    const stepId = stepIdByClientId.get(step.clientId);
    step.chips.forEach((chip, j) => {
      const nextStepId = chip.nextClientId ? (stepIdByClientId.get(chip.nextClientId) || null) : null;
      insertChip.run(stepId, j, chip.label, chip.responseText, nextStepId);
    });
  });
});

function loadScenarioForForm(id) {
  const scenario = db.prepare('SELECT * FROM agent_scenarios WHERE id = ?').get(id);
  if (!scenario) return null;
  const steps = db.prepare('SELECT * FROM agent_scenario_steps WHERE scenario_id = ? ORDER BY sort_order').all(id);
  const chips = db.prepare(`
    SELECT c.* FROM agent_scenario_chips c
    JOIN agent_scenario_steps s ON s.id = c.step_id
    WHERE s.scenario_id = ? ORDER BY c.step_id, c.sort_order
  `).all(id);
  scenario.steps = steps.map(step => ({
    ...step,
    clientId: String(step.id),
    chips: chips
      .filter(c => c.step_id === step.id)
      .map(c => ({ ...c, nextClientId: c.next_step_id != null ? String(c.next_step_id) : '' })),
  }));
  return scenario;
}

// GET /admin/agent-scenarios
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const scenarios = db.prepare(`
    SELECT s.*, (SELECT COUNT(*) FROM agent_scenario_steps WHERE scenario_id = s.id) as step_count
    FROM agent_scenarios s ORDER BY s.created_at DESC
  `).all();
  res.render('admin/agent-scenarios/index', { title: 'AI Agent Scenarios', scenarios });
});

// GET /admin/agent-scenarios/new
router.get('/new', requireAuth, requireAdmin, (req, res) => {
  res.render('admin/agent-scenarios/form', { title: 'New AI Agent Scenario', scenario: null });
});

// POST /admin/agent-scenarios
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name, slug: rawSlug, greeting_text, completion_text, active } = req.body;
  if (!name) {
    req.flash('error', 'Scenario name is required');
    return res.redirect('/admin/agent-scenarios/new');
  }

  let slug = rawSlug ? slugify(rawSlug, { lower: true, strict: true }) : slugify(name, { lower: true, strict: true });
  const existing = db.prepare('SELECT id FROM agent_scenarios WHERE slug = ?').get(slug);
  if (existing) slug = slug + '-' + Date.now();

  const { lastInsertRowid: scenarioId } = db.prepare(`
    INSERT INTO agent_scenarios (name, slug, greeting_text, completion_text, active)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, slug, greeting_text || '', completion_text || 'If you need further assistance, please contact our support team!', active ? 1 : 0);

  saveSteps(scenarioId, normalizeSteps(req.body));

  req.flash('success', 'Scenario created');
  res.redirect('/admin/agent-scenarios');
});

// GET /admin/agent-scenarios/:id/edit
router.get('/:id/edit', requireAuth, requireAdmin, (req, res) => {
  const scenario = loadScenarioForForm(req.params.id);
  if (!scenario) {
    req.flash('error', 'Scenario not found');
    return res.redirect('/admin/agent-scenarios');
  }
  res.render('admin/agent-scenarios/form', { title: 'Edit AI Agent Scenario', scenario });
});

// PUT /admin/agent-scenarios/:id
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = req.params.id;
  const { name, slug: rawSlug, greeting_text, completion_text, active } = req.body;

  let slug = rawSlug ? slugify(rawSlug, { lower: true, strict: true }) : slugify(name, { lower: true, strict: true });
  const existing = db.prepare('SELECT id FROM agent_scenarios WHERE slug = ? AND id != ?').get(slug, id);
  if (existing) slug = slug + '-' + Date.now();

  db.prepare(`
    UPDATE agent_scenarios SET name=?, slug=?, greeting_text=?, completion_text=?, active=? WHERE id=?
  `).run(name, slug, greeting_text || '', completion_text || 'If you need further assistance, please contact our support team!', active ? 1 : 0, id);

  saveSteps(id, normalizeSteps(req.body));

  req.flash('success', 'Scenario updated');
  res.redirect('/admin/agent-scenarios');
});

// DELETE /admin/agent-scenarios/:id
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM agent_scenarios WHERE id = ?').run(req.params.id);
  req.flash('success', 'Scenario deleted');
  res.redirect('/admin/agent-scenarios');
});

module.exports = router;
