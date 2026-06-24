const express = require('express');
const router = express.Router();
const db = require('../config/database');

// GET /shop
router.get('/shop', (req, res) => {
  const { q, category, min_price, max_price, sort, on_sale, page } = req.query;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limit = 12;
  const offset = (pageNum - 1) * limit;

  let conditions = ["p.status = 'active'"];
  let params = [];

  if (q) {
    conditions.push('(p.name LIKE ? OR p.description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  if (category) {
    const cat = db.prepare('SELECT id FROM categories WHERE slug = ?').get(category);
    if (cat) {
      const subCats = db.prepare('SELECT id FROM categories WHERE id = ? OR parent_id = ?').all(cat.id, cat.id);
      const catIds = subCats.map(c => c.id);
      conditions.push(`p.category_id IN (${catIds.map(() => '?').join(',')})`);
      params.push(...catIds);
    }
  }

  if (min_price) {
    conditions.push('p.price >= ?');
    params.push(parseFloat(min_price));
  }

  if (max_price) {
    conditions.push('p.price <= ?');
    params.push(parseFloat(max_price));
  }

  if (on_sale === '1') {
    conditions.push('p.on_sale = 1');
  }

  const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  let orderClause = 'ORDER BY p.created_at DESC';
  if (sort === 'price_asc') orderClause = 'ORDER BY p.price ASC';
  else if (sort === 'price_desc') orderClause = 'ORDER BY p.price DESC';
  else if (sort === 'name') orderClause = 'ORDER BY p.name ASC';
  else if (sort === 'newest') orderClause = 'ORDER BY p.created_at DESC';

  const countRow = db.prepare(`
    SELECT COUNT(DISTINCT p.id) as total
    FROM products p
    LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.sort_order = 0
    ${whereClause}
  `).get(...params);

  const totalProducts = countRow ? countRow.total : 0;
  const totalPages = Math.ceil(totalProducts / limit);

  const products = db.prepare(`
    SELECT p.*, pi.url as image_url, c.name as category_name
    FROM products p
    LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.sort_order = 0
    LEFT JOIN categories c ON p.category_id = c.id
    ${whereClause}
    ${orderClause}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const allCategories = db.prepare('SELECT * FROM categories ORDER BY name').all();
  const currentCategory = category ? db.prepare('SELECT * FROM categories WHERE slug = ?').get(category) : null;

  const wishlistIds = new Set((req.wishSession && req.wishSession.wishlist) || []);

  res.render('products/catalog', {
    title: currentCategory ? currentCategory.name : 'Shop',
    products,
    allCategories,
    currentCategory,
    filters: { q, category, min_price, max_price, sort, on_sale },
    pagination: { page: pageNum, totalPages, totalProducts, limit },
    wishlistIds
  });
});

// GET /shop/:categorySlug
router.get('/shop/:categorySlug', (req, res) => {
  res.redirect(`/shop?category=${req.params.categorySlug}`);
});

// GET /product/:slug
router.get('/product/:slug', (req, res) => {
  const product = db.prepare(`
    SELECT p.*, c.name as category_name, c.slug as category_slug
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.slug = ? AND p.status = 'active'
  `).get(req.params.slug);

  if (!product) {
    return res.status(404).render('error', { title: 'Not Found', message: 'Product not found', status: 404 });
  }

  const images = db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order').all(product.id);
  const variants = db.prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY name').all(product.id);
  const attributes = db.prepare('SELECT * FROM product_attributes WHERE product_id = ?').all(product.id);

  const reviews = db.prepare(`
    SELECT r.*, u.name as user_name
    FROM reviews r
    LEFT JOIN users u ON r.user_id = u.id
    WHERE r.product_id = ? AND r.status = 'approved'
    ORDER BY r.created_at DESC
  `).all(product.id);

  const avgRow = db.prepare(`
    SELECT AVG(rating) as avg_rating, COUNT(*) as review_count
    FROM reviews WHERE product_id = ? AND status = 'approved'
  `).get(product.id);

  // Related products
  const related = db.prepare(`
    SELECT p.*, pi.url as image_url
    FROM products p
    LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.sort_order = 0
    WHERE p.category_id = ? AND p.id != ? AND p.status = 'active'
    LIMIT 4
  `).all(product.category_id, product.id);

  // Check if wishlisted
  const inWishlist = ((req.wishSession && req.wishSession.wishlist) || []).includes(product.id);

  res.render('products/detail', {
    title: product.name,
    product,
    images,
    variants,
    attributes,
    reviews,
    avgRating: avgRow ? (avgRow.avg_rating || 0).toFixed(1) : '0.0',
    reviewCount: avgRow ? avgRow.review_count : 0,
    related,
    inWishlist
  });
});

module.exports = router;
