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

router.post('/xdevice-handoff', requireHandoffSecret, async (req, res) => {
  const { email, ts } = req.body;
  if (!email || !ts) {
    return res.status(400).json({ error: 'email and ts are required' });
  }

  try {
    await ensureTable();
    await sql`
      INSERT INTO xdevice_handoff (id, email, ts) VALUES (1, ${email}, ${ts})
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, ts = EXCLUDED.ts
    `;
    res.json({ success: true });
  } catch (err) {
    console.error('xdevice-handoff write failed:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/xdevice-handoff', requireHandoffSecret, async (req, res) => {
  try {
    await ensureTable();
    const [row] = await sql`SELECT email, ts FROM xdevice_handoff WHERE id = 1`;
    res.json(row || null);
  } catch (err) {
    console.error('xdevice-handoff read failed:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
