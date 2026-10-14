const express = require('express');
const router = express.Router();

// Cross-device demo/test-harness handoff, not a customer-facing feature —
// gated behind a shared secret known only to the Maestro flow and the
// Selenium listener.
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

// Push the handoff to the listener on the Selenium box, which launches the
// matching web session directly (this used to be stored in Neon and polled
// every minute, which kept the database awake around the clock). Awaited
// because Vercel can freeze the function once the response is sent, but
// bounded by a short timeout. Returns true/false; never throws.
async function forwardToListener(vertical, email, ts) {
  try {
    const resp = await fetch(process.env.HANDOFF_FORWARD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.XDEVICE_HANDOFF_SECRET}`,
      },
      body: JSON.stringify({ vertical, email, ts }),
      signal: AbortSignal.timeout(2500),
    });
    if (!resp.ok) throw new Error(`listener responded ${resp.status}`);
    return true;
  } catch (err) {
    console.error('xdevice-handoff forward failed:', err.message);
    return false;
  }
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
  if (!process.env.HANDOFF_FORWARD_URL) {
    console.error('xdevice-handoff: HANDOFF_FORWARD_URL is not set');
    return res.status(503).json({ error: 'Handoff forwarding is not configured' });
  }

  if (await forwardToListener(vertical, email, ts)) return res.json({ success: true });
  res.status(502).json({ error: 'Could not reach the handoff listener' });
});

module.exports = router;
