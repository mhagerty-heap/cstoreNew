const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// GET /orders
router.get('/', requireAuth, (req, res) => {
  const orders = db.prepare(`
    SELECT * FROM orders
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(req.session.userId);

  res.render('orders/history', { title: 'My Orders', orders });
});

// GET /orders/:orderNumber
router.get('/:orderNumber', requireAuth, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE order_number = ? AND user_id = ?')
    .get(req.params.orderNumber, req.session.userId);

  if (!order) {
    return res.status(404).render('error', { title: 'Not Found', message: 'Order not found', status: 404 });
  }

  const orderItems = db.prepare(`
    SELECT oi.*, p.slug, pi.url as image_url
    FROM order_items oi
    LEFT JOIN products p ON oi.product_id = p.id
    LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.sort_order = 0
    WHERE oi.order_id = ?
  `).all(order.id);

  res.render('orders/detail', { title: `Order ${order.order_number}`, order, orderItems });
});

module.exports = router;
