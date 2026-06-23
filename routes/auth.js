const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/database');

// GET /login
router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('auth/login', { title: 'Login' });
});

// POST /login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    req.flash('error', 'Please fill in all fields');
    return res.redirect('/login');
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());

  if (!user || !bcrypt.compareSync(password, user.password)) {
    req.flash('error', 'Invalid email or password');
    return res.redirect('/login');
  }

  // Merge guest cart into user cart
  const sessionId = req.session.id;
  const guestItems = db.prepare('SELECT * FROM cart_items WHERE session_id = ?').all(sessionId);

  for (const item of guestItems) {
    const existing = db.prepare('SELECT * FROM cart_items WHERE user_id = ? AND product_id = ? AND variant_id IS ?')
      .get(user.id, item.product_id, item.variant_id);
    if (existing) {
      db.prepare('UPDATE cart_items SET quantity = quantity + ? WHERE id = ?').run(item.quantity, existing.id);
    } else {
      db.prepare('INSERT INTO cart_items (user_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?)')
        .run(user.id, item.product_id, item.variant_id, item.quantity);
    }
    db.prepare('DELETE FROM cart_items WHERE id = ?').run(item.id);
  }

  req.session.userId = user.id;
  req.flash('success', `Welcome back, ${user.name}!`);

  const returnTo = req.session.returnTo || '/';
  delete req.session.returnTo;
  res.redirect(returnTo);
});

// GET /register
router.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('auth/register', { title: 'Register' });
});

// POST /register
router.post('/register', (req, res) => {
  const { name, email, password, password_confirm } = req.body;

  if (!name || !email || !password) {
    req.flash('error', 'Please fill in all fields');
    return res.redirect('/register');
  }

  if (password !== password_confirm) {
    req.flash('error', 'Passwords do not match');
    return res.redirect('/register');
  }

  if (password.length < 6) {
    req.flash('error', 'Password must be at least 6 characters');
    return res.redirect('/register');
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    req.flash('error', 'Email already registered');
    return res.redirect('/register');
  }

  const hashed = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
  ).run(name.trim(), email.toLowerCase().trim(), hashed, 'customer');

  req.session.userId = result.lastInsertRowid;
  req.flash('success', `Welcome, ${name}! Your account has been created.`);
  res.redirect('/');
});

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
