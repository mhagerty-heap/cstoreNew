const express = require('express');
const router = express.Router();
const { sql, ensureTable } = require('../config/neonDb');

// Cross-device demo/test-harness handoff, not a customer-facing feature —
// gated behind a shared secret known only to the Maestro flow and the
// Selenium polling script.
function requireHandoffSecret(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token || token !== process.env.XDEVICE_HANDOFF_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

const VALID_VERTICALS = ['shop', 'bank', 'saas', 'telcom', 'insurance'];
// Requests that predate verticals (existing Maestro/Selenium flows) omit it.
const DEFAULT_VERTICAL = 'shop';

// Returns the normalized vertical, or null if it's not an allowed value.
function resolveVertical(raw) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_VERTICAL;
  const v = String(raw).trim().toLowerCase();
  return VALID_VERTICALS.includes(v) ? v : null;
}

router.post('/xdevice-handoff', requireHandoffSecret, async (req, res) => {
  const { email, ts } = req.body;
  if (!email || !ts) {
    return res.status(400).json({ error: 'email and ts are required' });
  }
  const vertical = resolveVertical(req.body.vertical);
  if (!vertical) {
    return res.status(400).json({ error: `vertical must be one of: ${VALID_VERTICALS.join(', ')}` });
  }

  try {
    await ensureTable();
    await sql`
      INSERT INTO xdevice_handoff (vertical, email, ts) VALUES (${vertical}, ${email}, ${ts})
      ON CONFLICT (vertical) DO UPDATE SET email = EXCLUDED.email, ts = EXCLUDED.ts
    `;
    res.json({ success: true });
  } catch (err) {
    console.error('xdevice-handoff write failed:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/xdevice-handoff', requireHandoffSecret, async (req, res) => {
  const vertical = resolveVertical(req.query.vertical);
  if (!vertical) {
    return res.status(400).json({ error: `vertical must be one of: ${VALID_VERTICALS.join(', ')}` });
  }

  try {
    await ensureTable();
    const [row] = await sql`SELECT email, ts FROM xdevice_handoff WHERE vertical = ${vertical}`;
    res.json(row || null);
  } catch (err) {
    console.error('xdevice-handoff read failed:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
