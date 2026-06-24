const express = require('express');
const router = express.Router();
const db = require('../config/database');

function getCartItems(req) {
  const userId = req.session.userId;
  const sessionId = req.session.guestId;

  if (userId) {
    return db.prepare(`
      SELECT ci.*, p.name, p.slug, p.price as unit_price, p.stock,
             COALESCE(pv.price, p.price) as effective_price,
             pv.name as variant_name,
             pi.url as image_url
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      LEFT JOIN product_variants pv ON ci.variant_id = pv.id
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.sort_order = 0
      WHERE ci.user_id = ?
      ORDER BY ci.created_at
    `).all(userId);
  } else {
    return db.prepare(`
      SELECT ci.*, p.name, p.slug, p.price as unit_price, p.stock,
             COALESCE(pv.price, p.price) as effective_price,
             pv.name as variant_name,
             pi.url as image_url
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      LEFT JOIN product_variants pv ON ci.variant_id = pv.id
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.sort_order = 0
      WHERE ci.session_id = ?
      ORDER BY ci.created_at
    `).all(sessionId);
  }
}

// GET /cart
router.get('/', (req, res) => {
  const items = getCartItems(req);
  const subtotal = items.reduce((sum, i) => sum + (i.effective_price * i.quantity), 0);
  const coupon = req.session.coupon || null;
  let discount = 0;
  if (coupon) {
    const eligibleSubtotal = coupon.productIds && coupon.productIds.length > 0
      ? items.filter(i => coupon.productIds.includes(i.product_id)).reduce((sum, i) => sum + (i.effective_price * i.quantity), 0)
      : subtotal;
    if (coupon.type === 'percent') {
      discount = eligibleSubtotal * (coupon.value / 100);
    } else {
      discount = Math.min(coupon.value, eligibleSubtotal);
    }
    discount = Math.min(discount, subtotal);
  }
  const afterDiscount = subtotal - discount;
  const shipping = afterDiscount >= 50 ? 0 : 5.99;
  const tax = afterDiscount * 0.08;
  const total = afterDiscount + shipping + tax;

  res.render('cart', { title: 'Shopping Cart', items, subtotal, discount, shipping, tax, total, coupon });
});

// POST /cart/add
router.post('/add', (req, res) => {
  const { product_id, variant_id, quantity } = req.body;
  const qty = Math.max(1, parseInt(quantity) || 1);
  const userId = req.session.userId;
  const sessionId = req.session.guestId;

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
  if (!product) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ success: false, message: 'Product not found' });
    }
    req.flash('error', 'Product not found');
    return res.redirect('back');
  }

  const varId = variant_id || null;

  if (userId) {
    const existing = db.prepare('SELECT * FROM cart_items WHERE user_id = ? AND product_id = ? AND variant_id IS ?')
      .get(userId, product_id, varId);
    if (existing) {
      db.prepare('UPDATE cart_items SET quantity = quantity + ? WHERE id = ?').run(qty, existing.id);
    } else {
      db.prepare('INSERT INTO cart_items (user_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?)')
        .run(userId, product_id, varId, qty);
    }
    const countRow = db.prepare('SELECT SUM(quantity) as count FROM cart_items WHERE user_id = ?').get(userId);
    const cartCount = countRow?.count || 0;
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ success: true, cartCount, message: 'Added to cart!' });
    }
  } else {
    const existing = db.prepare('SELECT * FROM cart_items WHERE session_id = ? AND product_id = ? AND variant_id IS ?')
      .get(sessionId, product_id, varId);
    if (existing) {
      db.prepare('UPDATE cart_items SET quantity = quantity + ? WHERE id = ?').run(qty, existing.id);
    } else {
      db.prepare('INSERT INTO cart_items (session_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?)')
        .run(sessionId, product_id, varId, qty);
    }
    const countRow = db.prepare('SELECT SUM(quantity) as count FROM cart_items WHERE session_id = ?').get(sessionId);
    const cartCount = countRow?.count || 0;
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ success: true, cartCount, message: 'Added to cart!' });
    }
  }

  req.flash('success', 'Item added to cart!');
  res.redirect('/cart');
});

// POST /cart/update
router.post('/update', (req, res) => {
  const { item_id, quantity } = req.body;
  const qty = parseInt(quantity);

  if (isNaN(qty) || qty <= 0) {
    db.prepare('DELETE FROM cart_items WHERE id = ?').run(item_id);
  } else {
    db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(qty, item_id);
  }

  req.flash('success', 'Cart updated');
  res.redirect('/cart');
});

// POST /cart/remove
router.post('/remove', (req, res) => {
  const { item_id } = req.body;
  db.prepare('DELETE FROM cart_items WHERE id = ?').run(item_id);
  req.flash('success', 'Item removed from cart');
  res.redirect('/cart');
});

module.exports = router;
module.exports.getCartItems = getCartItems;
