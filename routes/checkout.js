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
  const shipping = afterDiscount >= 99 ? 0 : 5.99;
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
  const shipping = afterDiscount >= 99 ? 0 : 5.99;
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
    try { db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE code = ?').run(coupon.code); } catch(e) {}
    delete req.session.coupon;
  }

  // Clear cart
  req.cartSession.cart = [];

  // Store order in session so the confirmation page works even on a different Lambda
  req.session.lastOrder = {
    order_number: orderNumber,
    user_id: userId,
    guest_email: userId ? null : shipping_email,
    status: 'pending',
    subtotal, discount, shipping, tax, total,
    coupon_code: coupon ? coupon.code : null,
    shipping_name, shipping_address, shipping_city,
    shipping_state: shipping_state || '',
    shipping_zip: shipping_zip || '',
    shipping_country: shipping_country || 'US',
    payment_method: payment_method || 'cod',
    notes: notes || '',
    created_at: new Date().toISOString(),
    items: items.map(i => ({
      name: i.name + (i.variant_name ? ` - ${i.variant_name}` : ''),
      price: i.effective_price,
      quantity: i.quantity,
      subtotal: i.effective_price * i.quantity,
      sku: i.sku || '',
      category: i.category_name || '',
    })),
  };

  req.flash('success', `Order placed successfully! Your order number is ${orderNumber}`);
  res.redirect(`/checkout/confirmation/${orderNumber}`);
});

// GET /checkout/confirmation/:orderNumber
router.get('/confirmation/:orderNumber', (req, res) => {
  // Try DB first; fall back to session-cached order for Vercel multi-Lambda cases
  let order = null;
  let orderItems = [];
  try {
    order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(req.params.orderNumber);
    if (order) {
      orderItems = db.prepare(`
        SELECT oi.*, p.slug, p.sku, c.name AS category
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE oi.order_id = ?
      `).all(order.id);
    }
  } catch(e) {}

  if (!order && req.session.lastOrder && req.session.lastOrder.order_number === req.params.orderNumber) {
    const lo = req.session.lastOrder;
    order = lo;
    orderItems = lo.items || [];
  }

  if (!order) return res.redirect('/');

  res.render('checkout/confirmation', {
    title: 'Order Confirmed',
    order,
    orderItems
  });
});

module.exports = router;
