// Seed the 100 cross-device high-value personas (crossDeviceHighValueUsers_CSQXP.json)
// into the users table, split into a "back-in-stock works" / "back-in-stock broken"
// cohort, and mark a handful of popular products out of stock so the notify-me
// feature has real targets.
//
// Usage:  npm run seed-cross-device-high-value
//
// Backs csStoreCrossDeviceMobileWeb_CSQXP.py — the Selenium script simulating the
// mobile-web half of a cross-device journey (teammate's iOS app sessions are the
// other half): high-value shoppers who drop off on mobile, return on web days
// later, and are heavy users of back-in-stock notifications. bis_notify_broken
// is a real per-account flag on the users table — the live /product/:id/notify-me
// endpoint checks it and genuinely fails for that cohort, so the "broken feature"
// is reproducible by anyone logging in as that account, not just by this script.
//
// NOTE: this pool overlaps with 10 personas already claimed by the retention-model
// pool (retentionPool_CSQXP.json) — kept intentionally per product decision, not
// an oversight. Those 10 accounts will carry both narratives depending on which
// script runs.
//
// Safe to re-run — INSERT OR IGNORE skips existing emails, the cohort flag and
// product stock updates are idempotent (plain UPDATEs).

const db = require('../config/database');
const bcrypt = require('bcryptjs');
const users = require('./seleniumScripts/crossDeviceHighValueUsers_CSQXP.json');

const SALT_ROUNDS = 10;

// Every 1st and 2nd user in each block of 5 (by array position) is in the
// "broken" cohort — 40 of 100 (40%), deterministic so re-runs are stable.
const BROKEN_COHORT_MODULO = 5;
const BROKEN_COHORT_THRESHOLD = 2;

// One out-of-stock product per favorite category represented in this persona
// pool (Soccer, Basketball, Golf, Running, Walking), so notify-me signups line
// up with what these personas actually shop for. Tennis (620) is already
// out of stock in the base catalog.
const NOTIFY_TARGET_PRODUCT_IDS = [538, 549, 530, 526, 531];

console.log(`[seed-cross-device-high-value] Hashing and inserting ${users.length} personas...`);

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (name, email, password, role, address, city, state, zip, country, phone)
  VALUES (?, ?, ?, 'customer', ?, ?, ?, ?, ?, ?)
`);
const setBrokenFlag = db.prepare(`UPDATE users SET bis_notify_broken = ? WHERE email = ?`);
const markOutOfStock = db.prepare(`UPDATE products SET stock = 0 WHERE id = ?`);

const seed = db.transaction((personas) => {
  let inserted = 0;
  let skipped = 0;
  let brokenCount = 0;

  personas.forEach((p, i) => {
    const email = p.customerEmail.toLowerCase().trim();
    const hash = bcrypt.hashSync(p.customerPassword, SALT_ROUNDS);
    const addr = p.customerStreetAddress || null;
    const city = p.customerCity || null;
    const state = p.customerState || null;
    const zip = String(p.customerPostalCode || '').slice(0, 10) || null;
    const country = p.customerCountry || 'US';
    const phone = p.customerMobileNumber || null;

    const result = insertUser.run(p.customerName, email, hash, addr, city, state, zip, country, phone);
    if (result.changes === 1) inserted++; else skipped++;

    const isBroken = (i % BROKEN_COHORT_MODULO) < BROKEN_COHORT_THRESHOLD;
    if (isBroken) brokenCount++;
    setBrokenFlag.run(isBroken ? 1 : 0, email);
  });

  for (const productId of NOTIFY_TARGET_PRODUCT_IDS) {
    markOutOfStock.run(productId);
  }

  return { inserted, skipped, brokenCount };
});

const { inserted, skipped, brokenCount } = seed(users);

console.log(`[seed-cross-device-high-value] Users: ${inserted} inserted, ${skipped} already existed`);
console.log(`[seed-cross-device-high-value] Back-in-stock cohort: ${brokenCount} broken, ${users.length - brokenCount} working`);
console.log(`[seed-cross-device-high-value] Marked out of stock: products ${NOTIFY_TARGET_PRODUCT_IDS.join(', ')} (plus existing OOS product 620)`);
console.log('[seed-cross-device-high-value] Done.');
