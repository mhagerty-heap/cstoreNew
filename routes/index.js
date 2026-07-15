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

// CS Live Bot Toggle demo — this homepage variant renders nothing but a
// script tag server-side. All content below (hero, nav, prices, footer) is
// fetched and drawn in by /js/homepage-csr.js on the client, so a crawler or
// a browser with JS disabled sees a genuinely empty shell, not just content
// that's styled to look sparse.
router.get('/b', (req, res) => {
  res.render('b', { title: 'Home' });
});

// Real DB-backed data for the /b page, fetched client-side. navCategories,
// cartCount/cartTotal, and wishlistCount are already computed by
// injectLocals for every request, so this just reuses res.locals instead of
// re-querying.
router.get('/api/homepage-data', (req, res) => {
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

    res.json({
      featured,
      sale,
      categories,
      navCategories: (res.locals.navCategories || []).filter(c => !c.parent_id),
      cart: { count: res.locals.cartCount || 0, total: res.locals.cartTotal || 0 },
      wishlist: { count: res.locals.wishlistCount || 0 },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ featured: [], sale: [], categories: [], navCategories: [], cart: { count: 0, total: 0 }, wishlist: { count: 0 } });
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
