const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

// One row per vertical (shop, bank, ...): the PRIMARY KEY on vertical keeps
// "just overwrite the latest record" semantics within each vertical without
// one vertical's handoff clobbering another's.
//
// Lazy + memoized: only runs the first time /internal/xdevice-handoff is
// actually called, not on every cold start of the whole app. Running this at
// module load (as it did before) meant every page on the site paid for a
// round trip to Neon on every cold start, even though almost no request
// touches this table.
let ensureTablePromise = null;
function ensureTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = sql`
      CREATE TABLE IF NOT EXISTS xdevice_handoff (
        vertical TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        ts TIMESTAMPTZ NOT NULL
      )
    `.catch(err => {
      ensureTablePromise = null; // allow retry on the next call
      throw err;
    });
  }
  return ensureTablePromise;
}

module.exports = { sql, ensureTable };
