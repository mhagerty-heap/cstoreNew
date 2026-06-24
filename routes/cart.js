const express = require('express');
const router = express.Router();
const db = require('../config/database');

function getCartItems(req) {
  const cart = req.session.cart || [];
  if (cart.length === 0) return [];

  return cart.map((entry, index) => {
    const row = db.prepare(`
      SELECT p.name, p.slug, p.price, p.stock,
             COALESCE(pv.price, p.price) as effective_price,
             pv.name as variant_name,
             pi.url as image_url
      FROM products p
      LEFT JOIN product_variants pv ON pv.id = ?
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.sort_order = 0
      WHERE p.id = ?
    `).get(entry.variantId || null, entry.productId);

    if (!row) return null;

    return {
      id: index,
      product_id: entry.productId,
      variant_id: entry.variantId || null,
      quantity: entry.quantity,
      name: row.name,
      slug: row.slug,
      unit_price: row.price,
      stock: row.stock,
      effective_price: row.effective_price,
      variant_name: row.variant_name,
      image_url: row.image_url,
    };
  }).filter(Boolean);
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
  const productId = parseInt(product_id);
  const variantId = variant_id ? parseInt(variant_id) : null;

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ success: false, message: 'Product not found' });
    }
    req.flash('error', 'Product not found');
    return res.redirect('back');
  }

  if (!req.session.cart) req.session.cart = [];

  const existingIdx = req.session.cart.findIndex(
    e => e.productId === productId && (e.variantId || null) === variantId
  );
  if (existingIdx >= 0) {
    req.session.cart[existingIdx].quantity += qty;
  } else {
    req.session.cart.push({ productId, variantId, quantity: qty });
  }

  const cartCount = req.session.cart.reduce((sum, e) => sum + e.quantity, 0);

  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.json({ success: true, cartCount, message: 'Added to cart!' });
  }

  req.flash('success', 'Item added to cart!');
  res.redirect('/cart');
});

// POST /cart/update
router.post('/update', (req, res) => {
  const idx = parseInt(req.body.item_id);
  const qty = parseInt(req.body.quantity);
  const cart = req.session.cart || [];

  if (!isNaN(idx) && idx >= 0 && idx < cart.length) {
    if (isNaN(qty) || qty <= 0) {
      cart.splice(idx, 1);
    } else {
      cart[idx].quantity = qty;
    }
    req.session.cart = cart;
  }

  req.flash('success', 'Cart updated');
  res.redirect('/cart');
});

// POST /cart/remove
router.post('/remove', (req, res) => {
  const idx = parseInt(req.body.item_id);
  const cart = req.session.cart || [];
  if (!isNaN(idx) && idx >= 0 && idx < cart.length) {
    cart.splice(idx, 1);
    req.session.cart = cart;
  }
  req.flash('success', 'Item removed from cart');
  res.redirect('/cart');
});

module.exports = router;
module.exports.getCartItems = getCartItems;
