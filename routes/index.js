const express = require('express');
const router = express.Router();
const db = require('../config/database');

router.get('/', (req, res) => {
  try {
    const featured = db.prepare(`
      SELECT p.*, pi.url as image_url
      FROM products p
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.sort_order = 0
      WHERE p.featured = 1 AND p.status = 'active'
      ORDER BY p.created_at DESC
      LIMIT 8
    `).all();

    const sale = db.prepare(`
      SELECT p.*, pi.url as image_url
      FROM products p
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.sort_order = 0
      WHERE p.on_sale = 1 AND p.status = 'active'
      ORDER BY p.created_at DESC
      LIMIT 4
    `).all();

    const categories = db.prepare(`
      SELECT * FROM categories
      WHERE slug IN ('sports','running','lifestyle','classics','basketball','golf')
      ORDER BY CASE slug
        WHEN 'sports'      THEN 1
        WHEN 'running'     THEN 2
        WHEN 'lifestyle'   THEN 3
        WHEN 'classics'    THEN 4
        WHEN 'basketball'  THEN 5
        WHEN 'golf'        THEN 6
      END
    `).all();

    res.render('index', { title: 'Home', featured, sale, categories });
  } catch (err) {
    console.error(err);
    res.render('index', { title: 'Home', featured: [], sale: [], categories: [] });
  }
});

router.get('/promo/summer-sale', (req, res) => {
  res.render('promo/summer-sale', { title: 'Summer Sale' });
});

router.get('/promo/new-arrivals', (req, res) => {
  res.render('promo/new-arrivals', { title: 'New Arrivals' });
});

router.get('/promo/running-gear', (req, res) => {
  res.render('promo/running-gear', { title: 'Running Gear' });
});

module.exports = router;
