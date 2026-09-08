const express = require('express');
const router = express.Router();
const db = require('../config/database');

// GET /agent-chat/scenario/:slug — scenario config for the scripted AI agent
// widget (public/js/agent-widget.js). No auth: activation is gated client-side
// by the ?aiScenario= query param / sessionStorage, not by account, so this
// only ever serves admin-authored demo content, never real user data.
router.get('/agent-chat/scenario/:slug', (req, res) => {
  const scenario = db.prepare('SELECT * FROM agent_scenarios WHERE slug = ? AND active = 1').get(req.params.slug);
  if (!scenario) {
    return res.status(404).json({ success: false });
  }

  const steps = db.prepare('SELECT * FROM agent_scenario_steps WHERE scenario_id = ? ORDER BY sort_order').all(scenario.id);
  const stepIndexById = new Map(steps.map((step, i) => [step.id, i]));

  const chipsByStep = db.prepare(`
    SELECT c.* FROM agent_scenario_chips c
    JOIN agent_scenario_steps s ON s.id = c.step_id
    WHERE s.scenario_id = ?
    ORDER BY c.step_id, c.sort_order
  `).all(scenario.id);

  res.json({
    success: true,
    scenario: {
      slug: scenario.slug,
      name: scenario.name,
      greeting: scenario.greeting_text,
      completionText: scenario.completion_text,
      steps: steps.map((step, i) => ({
        index: i,
        mode: step.input_mode,
        response: step.input_mode === 'free_text' ? step.response_text : undefined,
        typingDelayMs: step.typing_delay_ms,
        chips: step.input_mode === 'chips'
          ? chipsByStep
              .filter(c => c.step_id === step.id)
              .map(c => ({
                label: c.label,
                response: c.response_text,
                next: c.next_step_id != null && stepIndexById.has(c.next_step_id)
                  ? stepIndexById.get(c.next_step_id)
                  : null,
              }))
          : undefined,
      })),
    },
  });
});

module.exports = router;
