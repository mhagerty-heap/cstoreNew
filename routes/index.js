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
      SELECT * FROM categories WHERE parent_id IS NULL ORDER BY name
    `).all();

    res.render('index', { title: 'Home', featured, sale, categories });
  } catch (err) {
    console.error(err);
    res.render('index', { title: 'Home', featured: [], sale: [], categories: [] });
  }
});

module.exports = router;
