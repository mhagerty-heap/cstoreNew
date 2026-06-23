const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const slugify = require('slugify');

// GET /admin/categories
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const categories = db.prepare(`
    SELECT c.*, p.name as parent_name,
           (SELECT COUNT(*) FROM products WHERE category_id = c.id) as product_count
    FROM categories c
    LEFT JOIN categories p ON c.parent_id = p.id
    ORDER BY c.name
  `).all();

  res.render('admin/categories/index', { title: 'Manage Categories', categories });
});

// GET /admin/categories/new
router.get('/new', requireAuth, requireAdmin, (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
  res.render('admin/categories/form', { title: 'New Category', category: null, categories });
});

// POST /admin/categories
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name, slug: rawSlug, parent_id, description } = req.body;

  if (!name) {
    req.flash('error', 'Category name is required');
    return res.redirect('/admin/categories/new');
  }

  let slug = rawSlug ? slugify(rawSlug, { lower: true, strict: true }) : slugify(name, { lower: true, strict: true });
  const existing = db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug);
  if (existing) slug = slug + '-' + Date.now();

  db.prepare('INSERT INTO categories (name, slug, parent_id, description) VALUES (?, ?, ?, ?)')
    .run(name, slug, parent_id || null, description || '');

  req.flash('success', 'Category created');
  res.redirect('/admin/categories');
});

// GET /admin/categories/:id/edit
router.get('/:id/edit', requireAuth, requireAdmin, (req, res) => {
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!category) {
    req.flash('error', 'Category not found');
    return res.redirect('/admin/categories');
  }
  const categories = db.prepare('SELECT * FROM categories WHERE id != ? ORDER BY name').all(req.params.id);
  res.render('admin/categories/form', { title: 'Edit Category', category, categories });
});

// PUT /admin/categories/:id
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const { name, slug: rawSlug, parent_id, description } = req.body;
  const id = req.params.id;

  let slug = rawSlug ? slugify(rawSlug, { lower: true, strict: true }) : slugify(name, { lower: true, strict: true });
  const existing = db.prepare('SELECT id FROM categories WHERE slug = ? AND id != ?').get(slug, id);
  if (existing) slug = slug + '-' + Date.now();

  db.prepare('UPDATE categories SET name=?, slug=?, parent_id=?, description=? WHERE id=?')
    .run(name, slug, parent_id || null, description || '', id);

  req.flash('success', 'Category updated');
  res.redirect('/admin/categories');
});

// DELETE /admin/categories/:id
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = req.params.id;
  const productCount = db.prepare('SELECT COUNT(*) as count FROM products WHERE category_id = ?').get(id).count;

  if (productCount > 0) {
    req.flash('error', `Cannot delete: ${productCount} product(s) are in this category`);
    return res.redirect('/admin/categories');
  }

  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  req.flash('success', 'Category deleted');
  res.redirect('/admin/categories');
});

module.exports = router;
