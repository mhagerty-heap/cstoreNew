const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Vercel's filesystem is read-only except /tmp.
// Copy the bundled shop.db there on cold start so writes work.
let dbPath;
if (process.env.VERCEL) {
  const tmpPath = '/tmp/shop.db';
  if (!fs.existsSync(tmpPath)) {
    fs.copyFileSync(path.join(__dirname, '..', 'shop.db'), tmpPath);
  }
  dbPath = tmpPath;
} else {
  dbPath = path.join(__dirname, '..', 'shop.db');
}

const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer',
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    country TEXT DEFAULT 'US',
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    description TEXT,
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    short_description TEXT,
    price REAL NOT NULL DEFAULT 0,
    compare_price REAL,
    cost_price REAL,
    stock INTEGER NOT NULL DEFAULT 0,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    featured INTEGER NOT NULL DEFAULT 0,
    on_sale INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    weight REAL,
    sku TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    alt_text TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS product_attributes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    attr_values TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price REAL,
    stock INTEGER NOT NULL DEFAULT 0,
    sku TEXT
  );

  CREATE TABLE IF NOT EXISTS cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS wishlist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    guest_email TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    subtotal REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    shipping REAL NOT NULL DEFAULT 0,
    tax REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    coupon_code TEXT,
    shipping_name TEXT,
    shipping_address TEXT,
    shipping_city TEXT,
    shipping_state TEXT,
    shipping_zip TEXT,
    shipping_country TEXT DEFAULT 'US',
    payment_method TEXT DEFAULT 'cod',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    quantity INTEGER NOT NULL,
    subtotal REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL DEFAULT 'percent',
    value REAL NOT NULL,
    min_order REAL DEFAULT 0,
    max_uses INTEGER,
    used_count INTEGER NOT NULL DEFAULT 0,
    expires_at DATETIME,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS coupon_products (
    coupon_id INTEGER NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    PRIMARY KEY (coupon_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    title TEXT,
    body TEXT,
    status TEXT NOT NULL DEFAULT 'approved',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Scripted "AI agent" chat widget (admin-authored, fully scripted — no LLM
  -- calls). A scenario is selected client-side via ?aiScenario=<slug> and has
  -- no relationship to personas/accounts. Steps are ordered turns; a step is
  -- either free_text (any input advances positionally to the next step,
  -- content ignored — same behavior as the old GTM demo script) or chips
  -- (admin-authored buttons that can branch to any other step).
  CREATE TABLE IF NOT EXISTS agent_scenarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    greeting_text TEXT NOT NULL DEFAULT '',
    completion_text TEXT NOT NULL DEFAULT 'If you need further assistance, please contact our support team!',
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS agent_scenario_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scenario_id INTEGER NOT NULL REFERENCES agent_scenarios(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    input_mode TEXT NOT NULL DEFAULT 'free_text',
    response_text TEXT,
    typing_delay_ms INTEGER NOT NULL DEFAULT 1200
  );

  CREATE TABLE IF NOT EXISTS agent_scenario_chips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    step_id INTEGER NOT NULL REFERENCES agent_scenario_steps(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    label TEXT NOT NULL,
    response_text TEXT NOT NULL,
    next_step_id INTEGER REFERENCES agent_scenario_steps(id) ON DELETE SET NULL
  );
`);

// Seed one example scenario (mirrors the team's earlier GTM-injected demo
// script) so the widget has something to demo out of the box. INSERT OR
// IGNORE on the unique slug makes this a no-op after the first boot.
const demoScenario = db.prepare('SELECT id FROM agent_scenarios WHERE slug = ?').get('back-in-stock-help');
if (!demoScenario) {
  const insertScenario = db.prepare(`
    INSERT INTO agent_scenarios (name, slug, greeting_text, completion_text, active)
    VALUES (?, ?, ?, ?, 1)
  `);
  const { lastInsertRowid: scenarioId } = insertScenario.run(
    'Back-in-Stock Help (Demo)',
    'back-in-stock-help',
    "Hi there! I'm the CStore AI assistant. What can I help you find today?",
    "If you need further assistance, please contact our support team!"
  );

  const insertStep = db.prepare(`
    INSERT INTO agent_scenario_steps (scenario_id, sort_order, input_mode, response_text, typing_delay_ms)
    VALUES (?, ?, 'free_text', ?, 1200)
  `);
  [
    "Yes, we normally do offer that size!",
    "No, but it appears that our inventory hasn't been updated on the site just yet.",
    "That specific size is currently out of stock because of the huge recent sale that just ended.",
    "Please check back within 5 days. We should have it back by then!",
    "We don't offer notifications yet, but that feature is coming in the near future.",
  ].forEach((responseText, i) => insertStep.run(scenarioId, i, responseText));
}

// Cross-device high-value scenario (crossDeviceHighValueUsers_CSQXP.json /
// seedCrossDeviceHighValueUsers.js) needs a per-account flag so the real
// notify-me endpoint fails consistently for the same cohort across sessions.
// ALTER TABLE errors if the column already exists, so guard it — the
// CREATE TABLE IF NOT EXISTS above only handles a table that doesn't exist yet.
const userColumns = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!userColumns.includes('bis_notify_broken')) {
  db.exec('ALTER TABLE users ADD COLUMN bis_notify_broken INTEGER NOT NULL DEFAULT 0');
}

module.exports = db;
