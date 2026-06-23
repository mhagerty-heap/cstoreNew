const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { getCartItems } = require('./cart');

// GET /checkout
router.get('/', (req, res) => {
  const items = getCartItems(req);
  if (items.length === 0) {
    req.flash('error', 'Your cart is empty');
    return res.redirect('/cart');
  }

  const subtotal = items.reduce((sum, i) => sum + (i.effective_price * i.quantity), 0);
  const coupon = req.session.coupon || null;
  let discount = 0;
  if (coupon) {
    const eligibleSubtotal = coupon.productIds && coupon.productIds.length > 0
      ? items.filter(i => coupon.productIds.includes(i.product_id)).reduce((sum, i) => sum + (i.effective_price * i.quantity), 0)
      : subtotal;
    if (coupon.type === 'percent') discount = eligibleSubtotal * (coupon.value / 100);
    else discount = Math.min(coupon.value, eligibleSubtotal);
    discount = Math.min(discount, subtotal);
  }
  const afterDiscount = subtotal - discount;
  const shipping = afterDiscount >= 50 ? 0 : 5.99;
  const tax = afterDiscount * 0.08;
  const total = afterDiscount + shipping + tax;

  const user = res.locals.currentUser;
  res.render('checkout/index', {
    title: 'Checkout',
    items, subtotal, discount, shipping, tax, total, coupon,
    prefill: user ? { name: user.name, email: user.email, address: user.address, city: user.city, state: user.state, zip: user.zip } : {}
  });
});

// POST /checkout
router.post('/', (req, res) => {
  const items = getCartItems(req);
  if (items.length === 0) {
    req.flash('error', 'Your cart is empty');
    return res.redirect('/cart');
  }

  const { shipping_name, shipping_email, shipping_address, shipping_city, shipping_state, shipping_zip, shipping_country, payment_method, notes } = req.body;

  if (!shipping_name || !shipping_email || !shipping_address || !shipping_city) {
    req.flash('error', 'Please fill in all required shipping fields');
    return res.redirect('/checkout');
  }

  const subtotal = items.reduce((sum, i) => sum + (i.effective_price * i.quantity), 0);
  const coupon = req.session.coupon || null;
  let discount = 0;
  if (coupon) {
    const eligibleSubtotal = coupon.productIds && coupon.productIds.length > 0
      ? items.filter(i => coupon.productIds.includes(i.product_id)).reduce((sum, i) => sum + (i.effective_price * i.quantity), 0)
      : subtotal;
    if (coupon.type === 'percent') discount = eligibleSubtotal * (coupon.value / 100);
    else discount = Math.min(coupon.value, eligibleSubtotal);
    discount = Math.min(discount, subtotal);
  }
  const afterDiscount = subtotal - discount;
  const shipping = afterDiscount >= 50 ? 0 : 5.99;
  const tax = afterDiscount * 0.08;
  const total = afterDiscount + shipping + tax;

  const orderNumber = 'ORD-' + Date.now();
  const userId = req.session.userId || null;

  const orderResult = db.prepare(`
    INSERT INTO orders (
      order_number, user_id, guest_email, status, subtotal, discount, shipping, tax, total,
      coupon_code, shipping_name, shipping_address, shipping_city, shipping_state, shipping_zip,
      shipping_country, payment_method, notes
    ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    orderNumber, userId, userId ? null : shipping_email,
    subtotal, discount, shipping, tax, total,
    coupon ? coupon.code : null,
    shipping_name, shipping_address, shipping_city, shipping_state || '', shipping_zip || '',
    shipping_country || 'US', payment_method || 'cod', notes || ''
  );

  const orderId = orderResult.lastInsertRowid;

  for (const item of items) {
    db.prepare(`
      INSERT INTO order_items (order_id, product_id, variant_id, name, price, quantity, subtotal)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(orderId, item.product_id, item.variant_id, item.name + (item.variant_name ? ` - ${item.variant_name}` : ''), item.effective_price, item.quantity, item.effective_price * item.quantity);
  }

  // Update coupon usage
  if (coupon) {
    db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE code = ?').run(coupon.code);
    delete req.session.coupon;
  }

  // Clear cart
  if (userId) {
    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
  } else {
    db.prepare('DELETE FROM cart_items WHERE session_id = ?').run(req.session.id);
  }

  req.flash('success', `Order placed successfully! Your order number is ${orderNumber}`);
  res.redirect(`/checkout/confirmation/${orderNumber}`);
});

// GET /checkout/confirmation/:orderNumber
router.get('/confirmation/:orderNumber', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(req.params.orderNumber);
  if (!order) {
    return res.redirect('/');
  }

  const orderItems = db.prepare(`
    SELECT oi.*, p.slug
    FROM order_items oi
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = ?
  `).all(order.id);

  res.render('checkout/confirmation', {
    title: 'Order Confirmed',
    order,
    orderItems
  });
});

module.exports = router;
