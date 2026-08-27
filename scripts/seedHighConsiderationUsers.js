// Seed the high-consideration-journey user pool + product catalog and emit
// highConsiderationPool_CSQXP.json / highConsiderationCatalog_CSQXP.json.
//
// Usage:  npm run seed-high-consideration-users
//
// Backs csStoreHighConsiderationJourney_CSQXP.py — the Selenium script that
// simulates a shopper comparing a considered purchase (a specific category's
// top-priced options) across ~5 visits over ~2 weeks before converting, so
// CSQ / Heap reports can reconcile that as one path-to-purchase instead of
// several isolated 30-minute-timeout sessions.
//
// This pool is DISTINCT from the general 200 returning users (persona indices
// 0-199, scripts/seedUsers.js) and from the retention loyalty pool
// (retentionPool_CSQXP.json, scattered across indices 200+). Selection scans
// from 200 up, skipping any index already claimed by the retention pool, so
// the three pools never overlap and stay cleanly separable in reporting.
//
// Safe to re-run — INSERT OR IGNORE skips existing emails, and both output
// files are rewritten deterministically (same selection every run, as long as
// retentionPool_CSQXP.json hasn't changed).

const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const bcrypt = require('bcryptjs');
const personas = require('./seleniumScripts/csStoreCustomerPersonas_CSQXP.json');

const SALT_ROUNDS = 10;
const CANDIDATE_START = 200;
const TARGET_POOL_SIZE = 60;
const SHORTLIST_SIZE = 3;   // top-N priced products per category = the "comparison shortlist"

const POOL_FILE    = path.join(__dirname, 'seleniumScripts', 'highConsiderationPool_CSQXP.json');
const CATALOG_FILE = path.join(__dirname, 'seleniumScripts', 'highConsiderationCatalog_CSQXP.json');
const RETENTION_POOL_FILE = path.join(__dirname, 'seleniumScripts', 'retentionPool_CSQXP.json');

// ---------------------------------------------------------------------------
// [POOL] Select personas distinct from the general pool (0-199) and the
// retention pool (whatever indices retentionPool_CSQXP.json already claimed).
// ---------------------------------------------------------------------------
let retentionIndices = new Set();
if (fs.existsSync(RETENTION_POOL_FILE)) {
  const retentionPool = JSON.parse(fs.readFileSync(RETENTION_POOL_FILE, 'utf8'));
  retentionIndices = new Set(retentionPool.map(r => r.personaIndex));
} else {
  console.warn('[seed-high-consideration] retentionPool_CSQXP.json not found — skipping overlap exclusion');
}

const selected = [];
for (let i = CANDIDATE_START; i < personas.length; i++) {
  if (selected.length >= TARGET_POOL_SIZE) break;
  if (retentionIndices.has(i)) continue;
  selected.push(i);
}

if (selected.length < TARGET_POOL_SIZE) {
  console.warn('[seed-high-consideration] WARNING — only found ' + selected.length + '/' + TARGET_POOL_SIZE + ' available personas');
}

fs.writeFileSync(POOL_FILE, JSON.stringify(selected, null, 2));
console.log('[seed-high-consideration] Wrote pool manifest: ' + POOL_FILE + ' (' + selected.length + ' users)');

// ---------------------------------------------------------------------------
// [CATALOG] Top-N priced products per category = the comparison shortlist.
// An absolute price cutoff (e.g. $150+) only produced a usable shortlist for
// 2 of 13 categories in this catalog — "top-priced within its own category"
// gives every category a real 3-item shortlist instead.
// ---------------------------------------------------------------------------
const rows = db.prepare(`
  SELECT p.id, p.name, p.slug, p.price, c.name AS categoryName, c.slug AS categorySlug
  FROM products p
  JOIN categories c ON p.category_id = c.id
  WHERE p.status = 'active'
  ORDER BY c.name, p.price DESC
`).all();

const byCategory = new Map();
for (const row of rows) {
  if (!byCategory.has(row.categoryName)) byCategory.set(row.categoryName, []);
  const bucket = byCategory.get(row.categoryName);
  if (bucket.length < SHORTLIST_SIZE) bucket.push(row);
}

const catalog = Array.from(byCategory.entries())
  .filter(([, products]) => products.length >= 2)   // need at least 2 to "compare"
  .map(([categoryName, products]) => ({
    categoryName,
    products: products.map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: p.price,
      categorySlug: p.categorySlug
    }))
  }));

fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2));
console.log('[seed-high-consideration] Wrote catalog: ' + CATALOG_FILE + ' (' + catalog.length + ' categories)');

// ---------------------------------------------------------------------------
// [DB] Seed the login accounts, same as the retention pool.
// ---------------------------------------------------------------------------
console.log('[seed-high-consideration] Hashing and inserting ' + selected.length + ' accounts (~' + Math.round(selected.length * 0.5) + 's)...');

const insert = db.prepare(`
  INSERT OR IGNORE INTO users (name, email, password, role, address, city, state, zip, country, phone)
  VALUES (?, ?, ?, 'customer', ?, ?, ?, ?, ?, ?)
`);

const seedMany = db.transaction((personaIndices) => {
  let inserted = 0, skipped = 0;
  for (const personaIndex of personaIndices) {
    const p = personas[personaIndex];
    const hash  = bcrypt.hashSync(p.customerPassword, SALT_ROUNDS);
    const email = p.customerEmail.toLowerCase().trim();
    const zip   = String(p.customerPostalCode || '').slice(0, 10) || null;
    const result = insert.run(
      p.customerName, email, hash,
      p.customerStreetAddress || null, p.customerCity || null, p.customerState || null,
      zip, p.customerCountry || 'US', p.customerMobileNumber || null
    );
    if (result.changes === 1) inserted++; else skipped++;
  }
  return { inserted, skipped };
});

const { inserted, skipped } = seedMany(selected);
console.log('[seed-high-consideration] Done — ' + inserted + ' inserted, ' + skipped + ' already existed');
console.log('[seed-high-consideration] High-consideration pool ready (' + selected.length + ' accounts in DB)');
