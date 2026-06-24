const db = require('../config/database');

module.exports = function injectLocals(req, res, next) {
  // Cart count + total
  try {
    let items;
    if (req.session.userId) {
      const row = db.prepare('SELECT SUM(quantity) as count FROM cart_items WHERE user_id = ?').get(req.session.userId);
      res.locals.cartCount = (row && row.count) ? parseInt(row.count) : 0;
      items = db.prepare(`
        SELECT ci.quantity, COALESCE(pv.price, p.price) as effective_price
        FROM cart_items ci
        JOIN products p ON ci.product_id = p.id
        LEFT JOIN product_variants pv ON ci.variant_id = pv.id
        WHERE ci.user_id = ?
      `).all(req.session.userId);
    } else {
      const sessionId = req.session.guestId;
      const row = db.prepare('SELECT SUM(quantity) as count FROM cart_items WHERE session_id = ?').get(sessionId);
      res.locals.cartCount = (row && row.count) ? parseInt(row.count) : 0;
      items = db.prepare(`
        SELECT ci.quantity, COALESCE(pv.price, p.price) as effective_price
        FROM cart_items ci
        JOIN products p ON ci.product_id = p.id
        LEFT JOIN product_variants pv ON ci.variant_id = pv.id
        WHERE ci.session_id = ?
      `).all(sessionId);
    }
    res.locals.cartTotal = items.reduce((sum, i) => sum + (i.effective_price * i.quantity), 0);
  } catch (e) {
    res.locals.cartCount = 0;
    res.locals.cartTotal = 0;
  }

  // Wishlist count
  try {
    if (req.session.userId) {
      const row = db.prepare('SELECT COUNT(*) as count FROM wishlist_items WHERE user_id = ?').get(req.session.userId);
      res.locals.wishlistCount = (row && row.count) ? parseInt(row.count) : 0;
    } else {
      res.locals.wishlistCount = 0;
    }
  } catch (e) {
    res.locals.wishlistCount = 0;
  }

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
