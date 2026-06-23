const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { requireAuth, requireAdmin } = require('../../middleware/auth');

function saveProductRestrictions(couponId, productIds) {
  db.prepare('DELETE FROM coupon_products WHERE coupon_id = ?').run(couponId);
  const insert = db.prepare('INSERT INTO coupon_products (coupon_id, product_id) VALUES (?, ?)');
  const ids = Array.isArray(productIds) ? productIds : productIds ? [productIds] : [];
  for (const pid of ids) {
    insert.run(couponId, parseInt(pid));
  }
}

// GET /admin/coupons
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const coupons = db.prepare('SELECT * FROM coupons ORDER BY id DESC').all();
  res.render('admin/coupons/index', { title: 'Manage Coupons', coupons });
});

// GET /admin/coupons/new
router.get('/new', requireAuth, requireAdmin, (req, res) => {
  const products = db.prepare("SELECT id, name FROM products WHERE status = 'active' ORDER BY name").all();
  res.render('admin/coupons/form', { title: 'New Coupon', coupon: null, couponProductIds: [], products });
});

// POST /admin/coupons
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { code, type, value, min_order, max_uses, expires_at, active, product_ids } = req.body;

  if (!code || !value) {
    req.flash('error', 'Code and value are required');
    return res.redirect('/admin/coupons/new');
  }

  const existing = db.prepare('SELECT id FROM coupons WHERE UPPER(code) = UPPER(?)').get(code.trim());
  if (existing) {
    req.flash('error', 'A coupon with that code already exists');
    return res.redirect('/admin/coupons/new');
  }

  const result = db.prepare(`
    INSERT INTO coupons (code, type, value, min_order, max_uses, expires_at, active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    code.trim().toUpperCase(),
    type || 'percent',
    parseFloat(value),
    parseFloat(min_order) || 0,
    max_uses ? parseInt(max_uses) : null,
    expires_at || null,
    active === 'on' ? 1 : 0
  );

  saveProductRestrictions(result.lastInsertRowid, product_ids);

  req.flash('success', 'Coupon created');
  res.redirect('/admin/coupons');
});

// GET /admin/coupons/:id/edit
router.get('/:id/edit', requireAuth, requireAdmin, (req, res) => {
  const coupon = db.prepare('SELECT * FROM coupons WHERE id = ?').get(req.params.id);
  if (!coupon) {
    req.flash('error', 'Coupon not found');
    return res.redirect('/admin/coupons');
  }
  const products = db.prepare("SELECT id, name FROM products WHERE status = 'active' ORDER BY name").all();
  const couponProductIds = db.prepare('SELECT product_id FROM coupon_products WHERE coupon_id = ?')
    .all(coupon.id).map(r => r.product_id);
  res.render('admin/coupons/form', { title: 'Edit Coupon', coupon, couponProductIds, products });
});

// PUT /admin/coupons/:id
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const { code, type, value, min_order, max_uses, expires_at, active, product_ids } = req.body;
  const id = req.params.id;

  const existing = db.prepare('SELECT id FROM coupons WHERE UPPER(code) = UPPER(?) AND id != ?').get(code.trim(), id);
  if (existing) {
    req.flash('error', 'A coupon with that code already exists');
    return res.redirect(`/admin/coupons/${id}/edit`);
  }

  db.prepare(`
    UPDATE coupons SET code=?, type=?, value=?, min_order=?, max_uses=?, expires_at=?, active=?
    WHERE id=?
  `).run(
    code.trim().toUpperCase(),
    type || 'percent',
    parseFloat(value),
    parseFloat(min_order) || 0,
    max_uses ? parseInt(max_uses) : null,
    expires_at || null,
    active === 'on' ? 1 : 0,
    id
  );

  saveProductRestrictions(id, product_ids);

  req.flash('success', 'Coupon updated');
  res.redirect('/admin/coupons');
});

// DELETE /admin/coupons/:id
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM coupons WHERE id = ?').run(req.params.id);
  req.flash('success', 'Coupon deleted');
  res.redirect('/admin/coupons');
});

module.exports = router;
