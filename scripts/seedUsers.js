// Seed 200 returning-user personas from the Selenium customer persona library
// into the users table. Safe to re-run — INSERT OR IGNORE skips existing emails.
//
// Usage:  npm run seed-users
//
// These 200 accounts are the fixed pool the Selenium script draws from when
// simulating returning visitors (login_account() path, ~30% of sessions).
// Passwords in the JSON are used verbatim — no +alias suffix — so logins work
// as recorded in the persona file.

const path = require('path');
const db   = require('../config/database');
const bcrypt = require('bcryptjs');
const personas = require('./seleniumScripts/csStoreCustomerPersonas.json');

const POOL_SIZE   = 200;
const SALT_ROUNDS = 10;

const subset = personas.slice(0, POOL_SIZE);

console.log(`[seed-users] Hashing and inserting ${POOL_SIZE} personas (this takes ~${Math.round(POOL_SIZE * 0.5)}s)...`);

const insert = db.prepare(`
  INSERT OR IGNORE INTO users (name, email, password, role, address, city, state, zip, country, phone)
  VALUES (?, ?, ?, 'customer', ?, ?, ?, ?, ?, ?)
`);

const seedMany = db.transaction((users) => {
  let inserted = 0;
  let skipped  = 0;
  for (const p of users) {
    const hash   = bcrypt.hashSync(p.customerPassword, SALT_ROUNDS);
    const email  = p.customerEmail.toLowerCase().trim();
    const name   = p.customerName;
    const addr   = p.customerStreetAddress || null;
    const city   = p.customerCity          || null;
    const state  = p.customerState         || null;
    const zip    = String(p.customerPostalCode || '').slice(0, 10) || null;
    const country = p.customerCountry      || 'US';
    const phone  = p.customerMobileNumber  || null;

    const result = insert.run(name, email, hash, addr, city, state, zip, country, phone);
    if (result.changes === 1) {
      inserted++;
    } else {
      skipped++;
    }

    if ((inserted + skipped) % 25 === 0) {
      console.log(`[seed-users]   ${inserted + skipped}/${POOL_SIZE} processed (${inserted} inserted, ${skipped} skipped)`);
    }
  }
  return { inserted, skipped };
});

const { inserted, skipped } = seedMany(subset);

console.log(`[seed-users] Done — ${inserted} inserted, ${skipped} already existed`);
console.log(`[seed-users] Returning-user pool ready (${inserted + skipped} total personas in DB)`);
