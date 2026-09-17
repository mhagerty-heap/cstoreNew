const crypto = require('crypto');
const db = require('../config/database');

module.exports = function injectLocals(req, res, next) {
  // ContentSquare tag ID — sourced from CSQ_TAG_ID env var, omitted if not set.
  // Optional traffic split: CSQ_TAG_ID_B + CSQ_SPLIT_PERCENT (0-100) route that
  // % of visitors to the second PID instead. Bucketing is hashed off the
  // existing per-visitor guestId (set earlier in server.js) so a visitor stays
  // on the same PID for the life of their session cookie, rather than
  // flipping between PIDs across page loads and fragmenting the CSQ session.
  let csqTagId = process.env.CSQ_TAG_ID || null;
  const csqVariantId = process.env.CSQ_TAG_ID_B;
  const csqSplitPercent = parseInt(process.env.CSQ_SPLIT_PERCENT || '0', 10);

  // Manual override for QA/debugging: ?csqPid=a forces the control PID,
  // ?csqPid=b forces the variant, ?csqPid=reset clears it. Persisted in the
  // session so it survives subsequent navigation without needing the param
  // on every page.
  if (req.query.csqPid === 'a' || req.query.csqPid === 'b') {
    req.session.csqPidOverride = req.query.csqPid;
  } else if (req.query.csqPid === 'reset') {
    delete req.session.csqPidOverride;
  }

  if (req.session.csqPidOverride === 'b' && csqVariantId) {
    csqTagId = csqVariantId;
  } else if (req.session.csqPidOverride === 'a') {
    // csqTagId already defaults to CSQ_TAG_ID above
  } else if (csqVariantId && csqSplitPercent > 0 && req.session && req.session.guestId) {
    const hash = crypto.createHash('md5').update(req.session.guestId).digest();
    const bucket = hash.readUInt32BE(0) % 100;
    if (bucket < csqSplitPercent) csqTagId = csqVariantId;
  }
  res.locals.csqTagId = csqTagId;

  // Cart count + total — cart lives in sess-cart cookie
  try {
    const cart = (req.cartSession && req.cartSession.cart) || [];
    res.locals.cartCount = cart.reduce((sum, e) => sum + e.quantity, 0);
    let cartTotal = 0;
    for (const entry of cart) {
      const row = db.prepare(
        'SELECT COALESCE(pv.price, p.price) as effective_price FROM products p LEFT JOIN product_variants pv ON pv.id = ? WHERE p.id = ?'
      ).get(entry.variantId || null, entry.productId);
      if (row) cartTotal += row.effective_price * entry.quantity;
    }
    res.locals.cartTotal = cartTotal;
  } catch (e) {
    res.locals.cartCount = 0;
    res.locals.cartTotal = 0;
  }

  // Wishlist count — wishlist lives in sess-wish cookie
  res.locals.wishlistCount = ((req.wishSession && req.wishSession.wishlist) || []).length;

  // Top-level categories for navbar
  try {
    res.locals.navCategories = db.prepare(`
      SELECT * FROM categories ORDER BY
        CASE WHEN parent_id IS NULL THEN
          CASE name WHEN 'Sports' THEN 1 WHEN 'Running' THEN 2 WHEN 'Lifestyle' THEN 3 WHEN 'Classics' THEN 4 ELSE 5 END
        ELSE 99 END,
        name
    `).all();
  } catch (e) {
    res.locals.navCategories = [];
  }

  // Admin-settable default for the AI assistant widget (agent-widget.js) —
  // falls back to null if none is marked default yet (e.g. a brand new DB
  // before config/database.js's backfill has run), which the widget's own
  // hardcoded fallback slug covers.
  try {
    const defaultScenario = db.prepare('SELECT slug FROM agent_scenarios WHERE is_default = 1 LIMIT 1').get();
    res.locals.defaultAiScenarioSlug = defaultScenario ? defaultScenario.slug : null;
  } catch (e) {
    res.locals.defaultAiScenarioSlug = null;
  }

  // Flash messages
  res.locals.flash = {
    success: req.flash ? req.flash('success') : [],
    error: req.flash ? req.flash('error') : [],
    info: req.flash ? req.flash('info') : []
  };

  next();
};
