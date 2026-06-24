const db = require('../config/database');

module.exports = function injectLocals(req, res, next) {
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
    res.locals.navCategories = db.prepare('SELECT * FROM categories WHERE parent_id IS NULL ORDER BY name').all();
  } catch (e) {
    res.locals.navCategories = [];
  }

  // Flash messages
  res.locals.flash = {
    success: req.flash ? req.flash('success') : [],
    error: req.flash ? req.flash('error') : [],
    info: req.flash ? req.flash('info') : []
  };

  next();
};
