const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

// Single-row table: the CHECK constraint makes "more than one row" impossible,
// matching the "just overwrite the latest record" semantics of the handoff.
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
        id INTEGER PRIMARY KEY DEFAULT 1,
        email TEXT NOT NULL,
        ts TIMESTAMPTZ NOT NULL,
        CHECK (id = 1)
      )
    `.catch(err => {
      ensureTablePromise = null; // allow retry on the next call
      throw err;
    });
  }
  return ensureTablePromise;
}

module.exports = { sql, ensureTable };
