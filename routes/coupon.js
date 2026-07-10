const express = require('express');
const router = express.Router();
const db = require('../config/database');

// POST /coupon/apply
router.post('/apply', (req, res) => {
  const { code, subtotal } = req.body;

  if (!code) {
    return res.json({ success: false, message: 'Please enter a coupon code' });
  }

  const trimmedCode = code.trim();
  let coupon = db.prepare('SELECT * FROM coupons WHERE UPPER(code) = UPPER(?) AND active = 1').get(trimmedCode);

  // Self-heal in-store kiosk coupons: Vercel copies shop.db fresh into /tmp
  // per serverless instance (config/database.js), so a coupon issued by one
  // instance isn't guaranteed to exist on whatever instance handles this
  // request. Re-issuing on a miss makes every caller — a live demo, an SC
  // manually typing the code, or the automated redemption script — work
  // reliably regardless of which instance answers.
  if (!coupon && /^INSTORE-[0-9A-F]+$/i.test(trimmedCode)) {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO coupons (code, type, value, min_order, max_uses, used_count, expires_at, active)
      VALUES (?, 'percent', 15, 0, 1, 0, ?, 1)
    `).run(trimmedCode, expiresAt);
    coupon = db.prepare('SELECT * FROM coupons WHERE UPPER(code) = UPPER(?) AND active = 1').get(trimmedCode);
  }

  if (!coupon) {
    return res.json({ success: false, message: 'Invalid coupon code' });
  }

  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return res.json({ success: false, message: 'This coupon has expired' });
  }

  if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
    return res.json({ success: false, message: 'This coupon has reached its usage limit' });
  }

  const orderSubtotal = parseFloat(subtotal) || 0;
  if (coupon.min_order && orderSubtotal < coupon.min_order) {
    return res.json({ success: false, message: `Minimum order of $${coupon.min_order.toFixed(2)} required for this coupon` });
  }

  // Fetch any product restrictions for this coupon
  const restrictedIds = db.prepare('SELECT product_id FROM coupon_products WHERE coupon_id = ?')
    .all(coupon.id).map(r => r.product_id);

  // Store coupon in session (discount computed at cart render time using actual items)
  req.session.coupon = {
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    productIds: restrictedIds  // empty array = applies to all
  };

  // For the response preview, use the passed subtotal as the eligible base
  let discount = 0;
  if (coupon.type === 'percent') {
    discount = orderSubtotal * (coupon.value / 100);
  } else {
    discount = coupon.value;
  }
  discount = Math.min(discount, orderSubtotal);

  const restrictionNote = restrictedIds.length > 0 ? ' (applies to selected products only)' : '';

  res.json({
    success: true,
    message: `Coupon applied! You save $${discount.toFixed(2)}${restrictionNote}`,
    discount: discount.toFixed(2),
    type: coupon.type,
    value: coupon.value
  });
});

// POST /coupon/remove
router.post('/remove', (req, res) => {
  delete req.session.coupon;
  req.flash('info', 'Coupon removed');
  res.redirect('/cart?action=coupon_removed');
});

module.exports = router;
