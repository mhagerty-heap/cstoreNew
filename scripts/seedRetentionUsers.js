// Seed the retention-model user pool into the users table and emit retentionPool.json.
//
// Usage:  npm run seed-retention-users
//
// These accounts are a DISTINCT pool from the 200 general returning users
// (scripts/seedUsers.js uses persona indices 0-199). This script selects a
// loyalty pyramid from persona indices 200+ by spend band, assigns each a tier,
// seeds the login accounts into the DB, and writes retentionPool.json — the
// single source of truth the retention Selenium script (csStoreRetentionModel.py)
// reads to know who is in the pool and what tier they belong to.
//
// Tier mapping (by customerTotalSpent):
//   Silver   — spend < $200      (mass, low value, fast retention decay)
//   Gold     — spend $200–$500   (mid value)
//   Platinum — spend >= $500      (whales, high value, slow retention decay)
//
// Safe to re-run — INSERT OR IGNORE skips existing emails, and retentionPool.json
// is rewritten deterministically (same selection every run).

const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const bcrypt = require('bcryptjs');
const personas = require('./seleniumScripts/csStoreCustomerPersonas.json');

const SALT_ROUNDS = 10;
const CANDIDATE_START = 200;          // keep distinct from the general pool (0-199)
const TARGET = { Silver: 80, Gold: 45, Platinum: 25 };   // ~150 total, pyramid shape
const POOL_FILE = path.join(__dirname, 'seleniumScripts', 'retentionPool.json');

function tierForSpend(spend) {
  if (spend === null || spend === undefined) return null;   // skip null-spend personas
  if (spend < 200) return 'Silver';
  if (spend < 500) return 'Gold';
  return 'Platinum';
}

// Deterministic selection: scan from CANDIDATE_START, fill each tier's quota in order.
const selected = [];   // { personaIndex, tier }
const counts = { Silver: 0, Gold: 0, Platinum: 0 };

for (let i = CANDIDATE_START; i < personas.length; i++) {
  if (selected.length >= TARGET.Silver + TARGET.Gold + TARGET.Platinum) break;
  const tier = tierForSpend(personas[i].customerTotalSpent);
  if (!tier) continue;
  if (counts[tier] >= TARGET[tier]) continue;
  counts[tier]++;
  selected.push({ personaIndex: i, tier });
}

console.log('[seed-retention] Selected pool:', JSON.stringify(counts));
if (counts.Silver < TARGET.Silver || counts.Gold < TARGET.Gold || counts.Platinum < TARGET.Platinum) {
  console.warn('[seed-retention] WARNING — could not fill every tier quota from available personas');
}

// Write the pool file (single source of truth for the Python script).
fs.writeFileSync(POOL_FILE, JSON.stringify(selected, null, 2));
console.log('[seed-retention] Wrote pool manifest: ' + POOL_FILE + ' (' + selected.length + ' users)');

// Seed the login accounts into the users table.
console.log('[seed-retention] Hashing and inserting ' + selected.length + ' accounts (~' + Math.round(selected.length * 0.5) + 's)...');

const insert = db.prepare(`
  INSERT OR IGNORE INTO users (name, email, password, role, address, city, state, zip, country, phone)
  VALUES (?, ?, ?, 'customer', ?, ?, ?, ?, ?, ?)
`);

const seedMany = db.transaction((rows) => {
  let inserted = 0, skipped = 0;
  for (const { personaIndex } of rows) {
    const p = personas[personaIndex];
    const hash   = bcrypt.hashSync(p.customerPassword, SALT_ROUNDS);
    const email  = p.customerEmail.toLowerCase().trim();
    const zip    = String(p.customerPostalCode || '').slice(0, 10) || null;
    const result = insert.run(
      p.customerName, email, hash,
      p.customerStreetAddress || null, p.customerCity || null, p.customerState || null,
      zip, p.customerCountry || 'US', p.customerMobileNumber || null
    );
    if (result.changes === 1) inserted++; else skipped++;
    if ((inserted + skipped) % 25 === 0) {
      console.log('[seed-retention]   ' + (inserted + skipped) + '/' + rows.length + ' processed');
    }
  }
  return { inserted, skipped };
});

const { inserted, skipped } = seedMany(selected);
console.log('[seed-retention] Done — ' + inserted + ' inserted, ' + skipped + ' already existed');
console.log('[seed-retention] Retention pool ready (' + selected.length + ' loyalty accounts in DB)');
