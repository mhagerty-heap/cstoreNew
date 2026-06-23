const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { requireAuth, requireAdmin } = require('../../middleware/auth');

router.get('/', requireAuth, requireAdmin, (req, res) => {
  // Stats
  const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
  const todayOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE date(created_at) = date('now')").get().count;
  const totalRevenue = db.prepare("SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status != 'cancelled'").get().total;
  const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  const totalCustomers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'customer'").get().count;

  const recentOrders = db.prepare(`
    SELECT o.*, u.name as customer_name
    FROM orders o
    LEFT JOIN users u ON o.user_id = u.id
    ORDER BY o.created_at DESC
    LIMIT 5
  `).all();

  const lowStock = db.prepare(`
    SELECT * FROM products WHERE stock < 5 AND status = 'active' ORDER BY stock ASC LIMIT 10
  `).all();

  res.render('admin/dashboard', {
    title: 'Admin Dashboard',
    stats: { totalOrders, todayOrders, totalRevenue, totalProducts, totalCustomers },
    recentOrders,
    lowStock
  });
});

module.exports = router;
