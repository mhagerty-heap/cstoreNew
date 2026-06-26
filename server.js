require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');
const crypto = require('crypto');
const onHeaders = require('on-headers');

// Init DB (runs schema creation)
const db = require('./config/database');

const { loadUser } = require('./middleware/auth');
const injectLocals = require('./middleware/locals');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Method override (for PUT and DELETE from forms)
app.use(methodOverride('_method'));

// Session cookies — intentionally no `secure` flag.
// TLS is terminated at the CDN/proxy edge on all serverless platforms
// (Vercel, Netlify, Railway, Render…). The runtime always receives plain HTTP,
// so `secure:true` would silently prevent cookies from being set.
const SECRET = 'shopexpress-secret-key-2024';
const COOKIE_DEFAULTS = {
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// Main session: userId, guestId, coupon, returnTo, userProfile, flash
app.use(cookieSession({
  name: 'sess',
  secret: SECRET,
  ...COOKIE_DEFAULTS,
}));

// connect-flash expects req.session.save() — shim for cookie-session
app.use((req, res, next) => {
  if (!req.session.save) req.session.save = cb => { if (cb) cb(); };
  next();
});

// Stable guestId for anonymous cart tracking
app.use((req, res, next) => {
  if (!req.session.guestId) {
    req.session.guestId = crypto.randomUUID();
  }
  next();
});

// Cart cookie — separate from main session so we never approach 4 KB
function splitCookieMiddleware(cookieName, reqProp) {
  return (req, res, next) => {
    // Read
    const raw = req.cookies ? req.cookies[cookieName] : null;
    let data = {};
    if (raw) {
      try { data = JSON.parse(Buffer.from(decodeURIComponent(raw), 'base64').toString('utf8')); } catch (e) {}
    } else {
      // Parse manually from Cookie header (cookie-parser not installed)
      const header = req.headers.cookie || '';
      const match = header.split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='));
      if (match) {
        try {
          const val = decodeURIComponent(match.slice(cookieName.length + 1));
          data = JSON.parse(Buffer.from(val, 'base64').toString('utf8'));
        } catch (e) {}
      }
    }
    req[reqProp] = data;

    // Write back just before response headers are sent
    const originalJson = JSON.stringify(data);
    onHeaders(res, function () {
      const newJson = JSON.stringify(req[reqProp]);
      if (newJson !== originalJson) {
        const encoded = Buffer.from(newJson).toString('base64');
        const expires = new Date(Date.now() + COOKIE_DEFAULTS.maxAge).toUTCString();
        const cookie = `${cookieName}=${encodeURIComponent(encoded)}; Path=/; Expires=${expires}; HttpOnly; SameSite=Lax`;
        const existing = res.getHeader('Set-Cookie');
        if (existing) {
          const arr = Array.isArray(existing) ? existing : [existing];
          res.setHeader('Set-Cookie', [...arr, cookie]);
        } else {
          res.setHeader('Set-Cookie', cookie);
        }
      }
    });

    next();
  };
}

app.use(splitCookieMiddleware('sess-cart', 'cartSession'));
app.use(splitCookieMiddleware('sess-wish', 'wishSession'));

// Flash messages
app.use(flash());

// Middleware: load current user + inject locals
app.use(loadUser);
app.use(injectLocals);

// Routes
app.use('/', require('./routes/index'));
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/products'));
app.use('/cart', require('./routes/cart'));
app.use('/checkout', require('./routes/checkout'));
app.use('/orders', require('./routes/orders'));
app.use('/wishlist', require('./routes/wishlist'));
app.use('/coupon', require('./routes/coupon'));
app.use('/admin/products', require('./routes/admin/products'));
app.use('/admin/orders', require('./routes/admin/orders'));
app.use('/admin/categories', require('./routes/admin/categories'));
app.use('/admin/coupons', require('./routes/admin/coupons'));
app.use('/admin', require('./routes/admin/index'));

// Demo reset — clears all session cookies server-side
app.get('/demo/reset', (req, res) => {
  req.session = null;
  req.cartSession = { cart: [] };
  req.wishSession = { wishlist: [] };
  res.redirect('/');
});

// Demo API error endpoints — return realistic error payloads for CSQ Error Analysis demos
app.post('/api/payment-verify', (req, res) => {
  res.status(503).json({
    error: 'PaymentGatewayUnavailable',
    code: 'GATEWAY_UPSTREAM_503',
    message: 'Unable to reach payment processor. Please try again later.',
    requestId: 'req_' + Math.random().toString(36).slice(2, 18),
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/inventory-check', (req, res) => {
  res.status(500).json({
    error: 'InventoryServiceError',
    code: 'INVENTORY_INTERNAL_500',
    message: 'Inventory service encountered an unexpected error.',
    requestId: 'req_' + Math.random().toString(36).slice(2, 18),
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/promo-validate', (req, res) => {
  res.status(422).json({
    error: 'PromoValidationFailed',
    code: 'PROMO_INVALID_STATE_422',
    message: 'Coupon cannot be applied to the current cart state.',
    requestId: 'req_' + Math.random().toString(36).slice(2, 18),
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', { title: '404 Not Found', message: 'The page you are looking for does not exist.', status: 404 });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { title: 'Server Error', message: err.message || 'Something went wrong.', status: 500 });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`ShopExpress running at http://localhost:${PORT}`);
    console.log(`Admin: http://localhost:${PORT}/admin`);
  });
}

module.exports = app;
