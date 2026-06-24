#!/usr/bin/env node
/**
 * Import WooCommerce CSV export into the SQLite shop.db.
 *
 * Usage:
 *   node scripts/productSeedScripts/importWooCommerce.js <path-to-csv>
 *
 * What it does:
 *   1. Wipes all products, categories, product_images, product_attributes, product_variants
 *      (preserves users, orders, coupons, reviews)
 *   2. Creates a 4-parent category hierarchy: Sports, Running, Lifestyle, Classics
 *   3. Imports all ~125 products, disambiguating duplicate names with SKU suffix
 *   4. Imports up to 5 images per product (external URLs from demo.pre-sales.fr)
 *   5. Imports product attributes: Color, Brand, Gender, Size, Width, Surface, Material, Features
 *   6. Marks 5 products on sale (spread across brands)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const csvPath = process.argv[2];
if (!csvPath || !fs.existsSync(csvPath)) {
  console.error('Usage: node importWooCommerce.js <path-to-csv>');
  process.exit(1);
}

// Parse CSV using Python (handles quoted commas reliably)
const pyScript = `
import csv, json, sys
with open(sys.argv[1], encoding='utf-8-sig') as f:
    rows = list(csv.DictReader(f))
print(json.dumps(rows))
`;
const tmpPy = path.join(__dirname, '_csv_parse_tmp.py');
fs.writeFileSync(tmpPy, pyScript);
let rows;
try {
  const out = execSync(`python3 ${tmpPy} "${csvPath}"`, { maxBuffer: 10 * 1024 * 1024 });
  rows = JSON.parse(out.toString());
} finally {
  fs.unlinkSync(tmpPy);
}

console.log(`Parsed ${rows.length} products from CSV`);

const db = require('../../config/database');

// ── 1. Clear product data (keep users, orders, coupons) ──────────────────────
db.exec(`
  DELETE FROM reviews;
  DELETE FROM product_variants;
  DELETE FROM product_attributes;
  DELETE FROM product_images;
  DELETE FROM products;
  DELETE FROM categories;
`);
console.log('Cleared existing product/category data');

function decodeHtml(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function toSlug(name) {
  return decodeHtml(name)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── 2. Build 4-parent category hierarchy ──────────────────────────────────────
//
//  Sports   → Basketball, Baseball, Soccer, Tennis, Track & Field, Golf, Training
//  Running  → Running, Trail Running
//  Lifestyle → Walking, Yoga, Lifestyle
//  Classics → Classics (leaf — no children needed)
//
const insertCat = db.prepare(
  'INSERT INTO categories (name, slug, description, parent_id) VALUES (?, ?, ?, ?)'
);

const parentSports    = insertCat.run('Sports',    'sports',    'Ball sports & track footwear', null).lastInsertRowid;
const parentRunning   = insertCat.run('Running',   'running',   'Running & trail footwear',     null).lastInsertRowid;
const parentLifestyle = insertCat.run('Lifestyle', 'lifestyle', 'Casual & everyday footwear',  null).lastInsertRowid;
const parentClassics  = insertCat.run('Classics',  'classics',  'Classic & retro footwear',    null).lastInsertRowid;

// WC category name → [display name, slug, parent id]
const wcCategoryMap = {
  'Basketball':    ['Basketball',    'basketball',    parentSports],
  'Baseball':      ['Baseball',      'baseball',      parentSports],
  'Soccer':        ['Soccer',        'soccer',        parentSports],
  'Tennis':        ['Tennis',        'tennis',        parentSports],
  'Track & Field': ['Track & Field', 'track-and-field', parentSports],
  'Golf':          ['Golf',          'golf',          parentSports],
  'Training':      ['Training',      'training',      parentSports],
  'Running':       ['Running',       'running-shoes', parentRunning],
  'Trail Running': ['Trail Running', 'trail-running', parentRunning],
  'Walking':       ['Walking',       'walking',       parentLifestyle],
  'Yoga':          ['Yoga',          'yoga',          parentLifestyle],
  'Lifestyle':     ['Lifestyle',     'lifestyle-shoes', parentLifestyle],
  'Classics':      ['Classics',      'classics-shoes',  parentClassics],
};

const categoryIdByName = {};
for (const [wcName, [displayName, slug, parentId]] of Object.entries(wcCategoryMap)) {
  const id = insertCat.run(displayName, slug, `${displayName} footwear`, parentId).lastInsertRowid;
  categoryIdByName[wcName] = id;
}

console.log(`Created ${4 + Object.keys(wcCategoryMap).length} categories (4 parents + 13 children)`);

// ── 3. Helper: read attribute value by name from a CSV row ────────────────────
function getAttr(row, attrName) {
  for (let i = 1; i <= 9; i++) {
    if ((row[`Attribute ${i} name`] || '').trim() === attrName) {
      return (row[`Attribute ${i} value(s)`] || '').trim();
    }
  }
  return '';
}

// ── 4. Prepare statements ──────────────────────────────────────────────────────
const insertProduct = db.prepare(`
  INSERT INTO products (name, slug, description, short_description, price, compare_price, stock, category_id, featured, on_sale, status, sku)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
`);
const insertImage = db.prepare(
  'INSERT INTO product_images (product_id, url, alt_text, sort_order) VALUES (?, ?, ?, ?)'
);
const insertAttr = db.prepare(
  'INSERT INTO product_attributes (product_id, name, attr_values) VALUES (?, ?, ?)'
);

// ── 5. Build slug → count map to disambiguate duplicates ─────────────────────
const slugCount = {};
for (const row of rows) {
  const base = toSlug(row['Name']);
  slugCount[base] = (slugCount[base] || 0) + 1;
}
// Track which slugs have been used so far to generate unique ones
const slugUsed = {};

// ── 6. Import products ────────────────────────────────────────────────────────
let imported = 0;
const importRun = db.transaction(() => {
  for (const row of rows) {
    const name = row['Name'].trim();
    const sku = row['SKU'].trim();
    const baseSlug = toSlug(name);

    // Disambiguate: if name appears more than once, append SKU
    let slug;
    if (slugCount[baseSlug] > 1) {
      slug = `${baseSlug}-${sku.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    } else {
      slug = baseSlug;
    }
    // Further guarantee uniqueness (shouldn't normally hit)
    if (slugUsed[slug]) {
      slug = `${slug}-${Object.keys(slugUsed).length}`;
    }
    slugUsed[slug] = true;

    const price = parseFloat(row['Regular price']) || 0;
    const salePrice = row['Sale price'] ? parseFloat(row['Sale price']) : null;
    const comparePrice = salePrice && salePrice < price ? price : null;
    const effectivePrice = salePrice && salePrice < price ? salePrice : price;
    const onSale = salePrice && salePrice < price ? 1 : 0;

    const inStock = row['In stock?'] === '1' ? 1 : 0;
    // Use stock column if present; default to 100 if in-stock but no count given
    const stockQty = row['Stock'] ? parseInt(row['Stock']) : (inStock ? 100 : 0);

    // Category: use the first listed category
    const firstCat = decodeHtml((row['Categories'] || '').split(',')[0].trim());
    const categoryId = categoryIdByName[firstCat] || null;

    const featured = row['Is featured?'] === '1' ? 1 : 0;

    const description = row['Description'] || '';
    const shortDesc = row['Short description'] || '';

    const productId = insertProduct.run(
      name, slug, description, shortDesc,
      effectivePrice, comparePrice, stockQty,
      categoryId, featured, onSale, sku
    ).lastInsertRowid;

    // Images — comma-separated in the Images column
    const imageUrls = (row['Images'] || '').split(',').map(u => u.trim()).filter(Boolean);
    imageUrls.slice(0, 5).forEach((url, idx) => {
      insertImage.run(productId, url, name, idx);
    });

    // Attributes
    const attrNames = ['Color', 'Brand', 'Gender', 'Activity', 'Size', 'Width', 'Surface', 'Material', 'Features'];
    for (const attrName of attrNames) {
      const val = getAttr(row, attrName);
      if (val) insertAttr.run(productId, attrName, val);
    }

    imported++;
  }
});

importRun();

console.log(`\nImported ${imported} products`);

// ── 7. Mark additional products on sale (spread across brands) ────────────────
const additionalSales = [
  // [sku, sale_price]   (compare_price = original regular price already in DB)
  ['275222', 89.95],   // Vans UA EVDNT UltimateWaffle   $114.95 → $89.95
  ['288723', 79.95],   // Converse x Keith Haring Chuck 70  $99.95 → $79.95
  ['280147', 69.90],   // Puma MIrage Mox EB              $89.90 → $69.90
  ['167004', 59.90],   // Adidas Originals ZX 500 RM      $79.90 → $59.90
];
const getSaleProduct = db.prepare('SELECT id, price FROM products WHERE sku = ?');
const updateSale = db.prepare('UPDATE products SET price = ?, compare_price = ?, on_sale = 1 WHERE id = ?');
for (const [sku, salePrice] of additionalSales) {
  const p = getSaleProduct.get(sku);
  if (p) {
    updateSale.run(salePrice, p.price, p.id);
    console.log(`  On sale: SKU ${sku} → $${salePrice} (was $${p.price})`);
  }
}
console.log(`Marked ${additionalSales.length} additional products on sale`);

// ── 7. Summary ────────────────────────────────────────────────────────────────
const productCount = db.prepare('SELECT COUNT(*) as n FROM products').get().n;
const catCount = db.prepare('SELECT COUNT(*) as n FROM categories').get().n;
const imgCount = db.prepare('SELECT COUNT(*) as n FROM product_images').get().n;
const attrCount = db.prepare('SELECT COUNT(*) as n FROM product_attributes').get().n;

console.log(`\n=== Import complete ===`);
console.log(`  Categories:  ${catCount}`);
console.log(`  Products:    ${productCount}`);
console.log(`  Images:      ${imgCount}`);
console.log(`  Attributes:  ${attrCount}`);
console.log('======================\n');
