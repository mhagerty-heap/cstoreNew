const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// GET /wishlist
router.get('/', requireAuth, (req, res) => {
  const items = db.prepare(`
    SELECT wi.*, p.name, p.slug, p.price, p.compare_price, p.stock,
           pi.url as image_url
    FROM wishlist_items wi
    JOIN products p ON wi.product_id = p.id
    LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.sort_order = 0
    WHERE wi.user_id = ?
    ORDER BY wi.created_at DESC
  `).all(req.session.userId);

  res.render('wishlist', { title: 'My Wishlist', items });
});

// POST /wishlist/add
router.post('/add', requireAuth, (req, res) => {
  const { product_id } = req.body;

  try {
    db.prepare('INSERT OR IGNORE INTO wishlist_items (user_id, product_id) VALUES (?, ?)')
      .run(req.session.userId, product_id);
    req.flash('success', 'Added to wishlist!');
  } catch (e) {
    req.flash('error', 'Could not add to wishlist');
  }

  res.redirect(req.get('Referrer') || '/');
});

// POST /wishlist/remove
router.post('/remove', requireAuth, (req, res) => {
  const { product_id } = req.body;
  db.prepare('DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?')
    .run(req.session.userId, product_id);
  req.flash('success', 'Removed from wishlist');
  res.redirect(req.get('Referrer') || '/');
});

module.exports = router;
