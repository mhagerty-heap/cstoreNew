const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// GET /wishlist
router.get('/', requireAuth, (req, res) => {
  const wishlist = req.session.wishlist || [];
  const items = wishlist.map(productId => {
    return db.prepare(`
      SELECT p.*, pi.url as image_url
      FROM products p
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.sort_order = 0
      WHERE p.id = ?
    `).get(productId);
  }).filter(Boolean);

  res.render('wishlist', { title: 'My Wishlist', items });
});

// POST /wishlist/add
router.post('/add', requireAuth, (req, res) => {
  const productId = parseInt(req.body.product_id);
  if (!req.session.wishlist) req.session.wishlist = [];
  if (!req.session.wishlist.includes(productId)) {
    req.session.wishlist.push(productId);
  }
  req.flash('success', 'Added to wishlist!');
  res.redirect(req.get('Referrer') || '/');
});

// POST /wishlist/remove
router.post('/remove', requireAuth, (req, res) => {
  const productId = parseInt(req.body.product_id);
  req.session.wishlist = (req.session.wishlist || []).filter(id => id !== productId);
  req.flash('success', 'Removed from wishlist');
  res.redirect(req.get('Referrer') || '/');
});

module.exports = router;
