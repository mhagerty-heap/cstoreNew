const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const multer = require('multer');
const path = require('path');
const slugify = require('slugify');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../public/uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Only image files allowed'));
  }
});

// GET /admin/products
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 10;
  const offset = (page - 1) * limit;

  const total = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  const products = db.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  res.render('admin/products/index', {
    title: 'Manage Products',
    products,
    pagination: { page, totalPages: Math.ceil(total / limit), total }
  });
});

// GET /admin/products/new
router.get('/new', requireAuth, requireAdmin, (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
  res.render('admin/products/form', { title: 'New Product', product: null, categories, images: [] });
});

// POST /admin/products
router.post('/', requireAuth, requireAdmin, upload.array('images', 5), (req, res) => {
  const { name, description, short_description, price, compare_price, cost_price, stock, category_id, featured, on_sale, status, weight, sku, variants } = req.body;

  if (!name || !price) {
    req.flash('error', 'Name and price are required');
    return res.redirect('/admin/products/new');
  }

  let slug = slugify(name, { lower: true, strict: true });
  // ensure unique slug
  const existing = db.prepare('SELECT id FROM products WHERE slug = ?').get(slug);
  if (existing) slug = slug + '-' + Date.now();

  const result = db.prepare(`
    INSERT INTO products (name, slug, description, short_description, price, compare_price, cost_price, stock, category_id, featured, on_sale, status, weight, sku)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name, slug,
    description || '', short_description || '',
    parseFloat(price), compare_price ? parseFloat(compare_price) : null, cost_price ? parseFloat(cost_price) : null,
    parseInt(stock) || 0,
    category_id || null,
    featured ? 1 : 0, on_sale ? 1 : 0,
    status || 'active',
    weight ? parseFloat(weight) : null,
    sku || null
  );

  const productId = result.lastInsertRowid;

  // Insert images
  if (req.files && req.files.length > 0) {
    req.files.forEach((file, i) => {
      db.prepare('INSERT INTO product_images (product_id, url, sort_order) VALUES (?, ?, ?)')
        .run(productId, '/uploads/' + file.filename, i);
    });
  }

  // Insert variants
  if (variants) {
    const varLines = variants.split('\n').filter(l => l.trim());
    varLines.forEach(line => {
      const parts = line.split('|').map(p => p.trim());
      if (parts[0]) {
        db.prepare('INSERT INTO product_variants (product_id, name, price, stock, sku) VALUES (?, ?, ?, ?, ?)')
          .run(productId, parts[0], parts[1] ? parseFloat(parts[1]) : null, parts[2] ? parseInt(parts[2]) : 0, parts[3] || null);
      }
    });
  }

  req.flash('success', 'Product created successfully');
  res.redirect('/admin/products');
});

// GET /admin/products/:id/edit
router.get('/:id/edit', requireAuth, requireAdmin, (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) {
    req.flash('error', 'Product not found');
    return res.redirect('/admin/products');
  }
  const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
  const images = db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order').all(product.id);
  const variants = db.prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY name').all(product.id);

  res.render('admin/products/form', { title: 'Edit Product', product, categories, images, variants });
});

// PUT /admin/products/:id
router.put('/:id', requireAuth, requireAdmin, upload.array('images', 5), (req, res) => {
  const { name, description, short_description, price, compare_price, cost_price, stock, category_id, featured, on_sale, status, weight, sku } = req.body;
  const id = req.params.id;

  db.prepare(`
    UPDATE products SET name=?, description=?, short_description=?, price=?, compare_price=?, cost_price=?,
    stock=?, category_id=?, featured=?, on_sale=?, status=?, weight=?, sku=?
    WHERE id=?
  `).run(
    name, description || '', short_description || '',
    parseFloat(price), compare_price ? parseFloat(compare_price) : null, cost_price ? parseFloat(cost_price) : null,
    parseInt(stock) || 0, category_id || null,
    featured ? 1 : 0, on_sale ? 1 : 0, status || 'active',
    weight ? parseFloat(weight) : null, sku || null, id
  );

  // Add new images
  if (req.files && req.files.length > 0) {
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM product_images WHERE product_id = ?').get(id).m;
    req.files.forEach((file, i) => {
      db.prepare('INSERT INTO product_images (product_id, url, sort_order) VALUES (?, ?, ?)')
        .run(id, '/uploads/' + file.filename, maxOrder + 1 + i);
    });
  }

  req.flash('success', 'Product updated');
  res.redirect('/admin/products');
});

// DELETE /admin/products/:id
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = req.params.id;
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  req.flash('success', 'Product deleted');
  res.redirect('/admin/products');
});

module.exports = router;
