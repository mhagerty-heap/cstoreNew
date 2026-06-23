const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { requireAuth, requireAdmin } = require('../../middleware/auth');

// GET /admin/orders
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const { status, page } = req.query;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limit = 20;
  const offset = (pageNum - 1) * limit;

  let where = '';
  let params = [];
  if (status && status !== 'all') {
    where = 'WHERE o.status = ?';
    params.push(status);
  }

  const total = db.prepare(`SELECT COUNT(*) as count FROM orders o ${where}`).get(...params).count;
  const orders = db.prepare(`
    SELECT o.*, u.name as customer_name
    FROM orders o
    LEFT JOIN users u ON o.user_id = u.id
    ${where}
    ORDER BY o.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const statusCounts = {};
  ['pending','processing','shipped','delivered','cancelled'].forEach(s => {
    statusCounts[s] = db.prepare('SELECT COUNT(*) as count FROM orders WHERE status = ?').get(s).count;
  });

  res.render('admin/orders/index', {
    title: 'Manage Orders',
    orders,
    currentStatus: status || 'all',
    statusCounts,
    pagination: { page: pageNum, totalPages: Math.ceil(total / limit), total }
  });
});

// GET /admin/orders/:id
router.get('/:id', requireAuth, requireAdmin, (req, res) => {
  const order = db.prepare(`
    SELECT o.*, u.name as customer_name, u.email as customer_email
    FROM orders o
    LEFT JOIN users u ON o.user_id = u.id
    WHERE o.id = ?
  `).get(req.params.id);

  if (!order) {
    req.flash('error', 'Order not found');
    return res.redirect('/admin/orders');
  }

  const orderItems = db.prepare(`
    SELECT oi.*, pi.url as image_url
    FROM order_items oi
    LEFT JOIN product_images pi ON oi.product_id = pi.product_id AND pi.sort_order = 0
    WHERE oi.order_id = ?
  `).all(order.id);

  res.render('admin/orders/detail', { title: `Order ${order.order_number}`, order, orderItems });
});

// PUT /admin/orders/:id/status
router.put('/:id/status', requireAuth, requireAdmin, (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

  if (!validStatuses.includes(status)) {
    req.flash('error', 'Invalid status');
    return res.redirect(`/admin/orders/${req.params.id}`);
  }

  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  req.flash('success', 'Order status updated');
  res.redirect(`/admin/orders/${req.params.id}`);
});

module.exports = router;
