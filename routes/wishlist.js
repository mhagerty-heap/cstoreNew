const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// GET /wishlist
router.get('/', requireAuth, (req, res) => {
  const wishlist = (req.wishSession && req.wishSession.wishlist) || [];
  const items = wishlist.map(productId => {
    const row = db.prepare(`
      SELECT p.*, pi.url as image_url
      FROM products p
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.sort_order = 0
      WHERE p.id = ?
    `).get(productId);
    if (!row) return null;
    return { ...row, product_id: row.id };
  }).filter(Boolean);

  res.render('wishlist', { title: 'My Wishlist', items });
});

// POST /wishlist/add
router.post('/add', requireAuth, (req, res) => {
  const productId = parseInt(req.body.product_id);
  if (!req.wishSession.wishlist) req.wishSession.wishlist = [];
  if (!req.wishSession.wishlist.includes(productId)) {
    req.wishSession.wishlist.push(productId);
  }
  req.flash('success', 'Added to wishlist!');
  res.redirect(req.get('Referrer') || '/');
});

// POST /wishlist/remove
router.post('/remove', requireAuth, (req, res) => {
  const productId = parseInt(req.body.product_id);
  req.wishSession.wishlist = ((req.wishSession && req.wishSession.wishlist) || []).filter(id => id !== productId);
  req.flash('success', 'Removed from wishlist');
  res.redirect(req.get('Referrer') || '/');
});

module.exports = router;
