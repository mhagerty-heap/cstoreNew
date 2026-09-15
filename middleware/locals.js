const db = require('../config/database');

module.exports = function injectLocals(req, res, next) {
  // ContentSquare tag ID — sourced from CSQ_TAG_ID env var, omitted if not set
  res.locals.csqTagId = process.env.CSQ_TAG_ID || null;

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
