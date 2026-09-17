const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

// Single-row table: the CHECK constraint makes "more than one row" impossible,
// matching the "just overwrite the latest record" semantics of the handoff.
sql`
  CREATE TABLE IF NOT EXISTS xdevice_handoff (
    id INTEGER PRIMARY KEY DEFAULT 1,
    email TEXT NOT NULL,
    ts TIMESTAMPTZ NOT NULL,
    CHECK (id = 1)
  )
`.catch(err => console.error('Failed to initialize xdevice_handoff table:', err));

module.exports = { sql };
