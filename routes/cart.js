const express = require('express');
const router = express.Router();
const db = require('../config/database');

function getCartItems(req) {
  const cart = (req.cartSession && req.cartSession.cart) || [];
  if (cart.length === 0) return [];

  return cart.map((entry, index) => {
    const row = db.prepare(`
      SELECT p.name, p.slug, p.price, p.stock,
             COALESCE(pv.price, p.price) as effective_price,
             pv.name as variant_name,
             pi.url as image_url
      FROM products p
      LEFT JOIN product_variants pv ON pv.id = ?
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.sort_order = 0
      WHERE p.id = ?
    `).get(entry.variantId || null, entry.productId);

    if (!row) return null;

    return {
      id: index,
      product_id: entry.productId,
      variant_id: entry.variantId || null,
      quantity: entry.quantity,
      name: row.name,
      slug: row.slug,
      unit_price: row.price,
      stock: row.stock,
      effective_price: row.effective_price,
      variant_name: row.variant_name,
      image_url: row.image_url,
    };
  }).filter(Boolean);
}

// GET /cart
router.get('/', (req, res) => {
  const items = getCartItems(req);
  const subtotal = items.reduce((sum, i) => sum + (i.effective_price * i.quantity), 0);
  const coupon = req.session.coupon || null;
  let discount = 0;
  if (coupon) {
    const eligibleSubtotal = coupon.productIds && coupon.productIds.length > 0
      ? items.filter(i => coupon.productIds.includes(i.product_id)).reduce((sum, i) => sum + (i.effective_price * i.quantity), 0)
      : subtotal;
    if (coupon.type === 'percent') {
      discount = eligibleSubtotal * (coupon.value / 100);
    } else {
      discount = Math.min(coupon.value, eligibleSubtotal);
    }
    discount = Math.min(discount, subtotal);
  }
  const afterDiscount = subtotal - discount;
  const shipping = afterDiscount >= 99 ? 0 : 5.99;
  const tax = afterDiscount * 0.08;
  const total = afterDiscount + shipping + tax;

  res.render('cart', { title: 'Shopping Cart', items, subtotal, discount, shipping, tax, total, coupon });
});

// Real, reproducible add-to-cart bug on the Air Max 98 PDP (demo scenario:
// conversation-deflection funnel). Not account-gated like bis_notify_broken —
// this page's traffic is mostly anonymous/new visitors, so the cohort is
// decided once per session. After CART_BUG_FIX_DATE, engineering has
// "shipped the fix" — always succeeds.
//
// Two real failure stages, so "still not working, connect me to a
// specialist" (see agent_scenarios 'cart-add-issue-help') has an honest
// second failure behind it instead of being asserted with no retry to back
// it up:
//   attempt 1: fails for ~60% of sessions (CART_BUG_COHORT_RATE)
//   attempt 2 (after the AI's generic "try again" tip): genuinely fails
//              AGAIN for ~35% of those (CART_BUG_SECOND_FAIL_RATE) — this is
//              the subset that actually needs the specialist
//   attempt 3+: always succeeds (the specialist's fix, or just luck)
const CART_BUG_PRODUCT_ID = 639; // Nike Wmns Air Max 98
const CART_BUG_FIX_DATE = new Date('2026-09-17T00:00:00Z');
const CART_BUG_COHORT_RATE = 0.6;
const CART_BUG_SECOND_FAIL_RATE = 0.35;
const CART_BUG_FAILURE_MESSAGE = 'Something went wrong adding this item to your cart. Please try again.';

function respondCartBugFailure(req, res) {
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.status(503).json({ success: false, code: 'CART_ADD_UNAVAILABLE', message: CART_BUG_FAILURE_MESSAGE });
  }
  req.flash('error', CART_BUG_FAILURE_MESSAGE);
  return res.redirect('back');
}

// POST /cart/force-bug — demo-only override, triggered by the hidden button
// on the Air Max 98 PDP (views/partials/nav.ejs). Queues exactly one more
// guaranteed failure for this session's NEXT /cart/add on that product, so a
// live demo doesn't have to cycle sessions hoping for the real ~60%/35%
// odds to land. Leaves those odds untouched for real/simulated traffic.
//
// Sets a *pending* stage rather than the delivered one directly
// ('failed_twice_pending', not 'needs_specialist') because the failure
// itself is only ever delivered inside POST /cart/add, in the same request
// that transitions into the delivered stage — setting the delivered stage
// here, one request early, would let the very next /cart/add fall through
// to the generic success path below instead of failing, since nothing else
// checks for it. Mirrors 'failed_once_pending' -> 'awaiting_retry' below.
//
// Also state-aware rather than a blind overwrite: pressing it after a
// natural failure had already reached 'needs_specialist' or 'resolved'
// must not rewind the machine into a 3rd/4th real failure — that would
// break the "always succeeds after 2 failures" guarantee the specialist's
// promise depends on. Once a session is past both failure gates, this is a
// no-op; the next attempt just succeeds as designed.
router.post('/force-bug', (req, res) => {
  const stage = req.session.atcBugStage;
  if (stage === undefined || stage === 'not_affected' || stage === 'failed_once_pending') {
    req.session.atcBugStage = 'failed_once_pending';
  } else if (stage === 'awaiting_retry' || stage === 'failed_twice_pending') {
    req.session.atcBugStage = 'failed_twice_pending';
  }
  res.json({ success: true });
});

// POST /cart/force-success — pairs with /force-bug (same hidden-button
// pattern, views/partials/nav.ejs). Makes this session's NEXT /cart/add on
// the Air Max 98 PDP succeed immediately, whatever the current stage — for
// reliably demoing "the AI's tip alone resolved it" (Take 2) without
// waiting on the real ~65% odds. Safe to set directly, unlike the failure
// side: success needs no separate delivery step, since every stage other
// than the two *_pending ones and 'awaiting_retry' already falls through
// to a normal add below.
router.post('/force-success', (req, res) => {
  req.session.atcBugStage = 'resolved';
  res.json({ success: true });
});

// POST /cart/add
router.post('/add', (req, res) => {
  const { product_id, variant_id, quantity } = req.body;
  const qty = Math.max(1, parseInt(quantity) || 1);
  const productId = parseInt(product_id);
  const variantId = variant_id ? parseInt(variant_id) : null;

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ success: false, message: 'Product not found' });
    }
    req.flash('error', 'Product not found');
    return res.redirect('back');
  }

  if (productId === CART_BUG_PRODUCT_ID && new Date() < CART_BUG_FIX_DATE) {
    if (req.session.atcBugStage === undefined) {
      req.session.atcBugStage = Math.random() < CART_BUG_COHORT_RATE ? 'failed_once_pending' : 'not_affected';
    }

    if (req.session.atcBugStage === 'failed_once_pending') {
      req.session.atcBugStage = 'awaiting_retry';
      return respondCartBugFailure(req, res);
    }

    // Forced via POST /cart/force-bug — delivers the genuine second failure
    // (see comment there for why this can't just be set to 'needs_specialist'
    // directly).
    if (req.session.atcBugStage === 'failed_twice_pending') {
      req.session.atcBugStage = 'needs_specialist';
      return respondCartBugFailure(req, res);
    }

    if (req.session.atcBugStage === 'awaiting_retry') {
      req.session.atcBugStage = Math.random() < CART_BUG_SECOND_FAIL_RATE ? 'needs_specialist' : 'resolved';
      if (req.session.atcBugStage === 'needs_specialist') {
        return respondCartBugFailure(req, res);
      }
      // 'resolved' — falls through to a real success below
    }
    // 'not_affected', 'resolved', or 'needs_specialist' (3rd+ attempt) all succeed from here on
  }

  if (!req.cartSession.cart) req.cartSession.cart = [];

  const existingIdx = req.cartSession.cart.findIndex(
    e => e.productId === productId && (e.variantId || null) === variantId
  );
  if (existingIdx >= 0) {
    req.cartSession.cart[existingIdx].quantity += qty;
  } else {
    req.cartSession.cart.push({ productId, variantId, quantity: qty });
  }

  const cartCount = req.cartSession.cart.reduce((sum, e) => sum + e.quantity, 0);

  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.json({ success: true, cartCount, message: 'Added to cart!' });
  }

  req.flash('success', 'Item added to cart!');
  res.redirect('/cart?action=added');
});

// POST /cart/update
router.post('/update', (req, res) => {
  const idx = parseInt(req.body.item_id);
  const qty = parseInt(req.body.quantity);
  const cart = req.cartSession.cart || [];

  if (!isNaN(idx) && idx >= 0 && idx < cart.length) {
    if (isNaN(qty) || qty <= 0) {
      cart.splice(idx, 1);
    } else {
      cart[idx].quantity = qty;
    }
    req.cartSession.cart = cart;
  }

  req.flash('success', 'Cart updated');
  res.redirect('/cart?action=updated');
});

// POST /cart/remove
router.post('/remove', (req, res) => {
  const idx = parseInt(req.body.item_id);
  const cart = req.cartSession.cart || [];
  if (!isNaN(idx) && idx >= 0 && idx < cart.length) {
    cart.splice(idx, 1);
    req.cartSession.cart = cart;
  }
  req.flash('success', 'Item removed from cart');
  res.redirect('/cart?action=removed');
});

module.exports = router;
module.exports.getCartItems = getCartItems;
