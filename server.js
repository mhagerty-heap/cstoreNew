const express = require('express');
const cookieSession = require('cookie-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');
const crypto = require('crypto');

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

// Cookie-based sessions — data travels in a signed cookie so Vercel Lambda isolation doesn't break sessions
app.use(cookieSession({
  name: 'session',
  secret: 'shopexpress-secret-key-2024',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  secure: !!process.env.VERCEL,
  httpOnly: true,
  sameSite: 'lax'
}));

// connect-flash expects req.session.save() — shim it for cookie-session
app.use((req, res, next) => {
  if (!req.session.save) req.session.save = cb => { if (cb) cb(); };
  next();
});

// Ensure every visitor (logged-in or guest) has a stable guestId for cart tracking
app.use((req, res, next) => {
  if (!req.session.guestId) {
    req.session.guestId = crypto.randomUUID();
  }
  next();
});

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

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', { title: '404 Not Found', message: 'The page you are looking for does not exist.', status: 404 });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { title: 'Server Error', message: err.message || 'Something went wrong.', status: 500 });
});

// Export for Vercel serverless; also start a local server when run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`ShopExpress running at http://localhost:${PORT}`);
    console.log(`Admin: http://localhost:${PORT}/admin`);
  });
}

module.exports = app;
