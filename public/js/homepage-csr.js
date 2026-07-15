/* CS Live Bot Toggle demo — client-rendered homepage (route: /b)
 *
 * Everything on this page — nav, hero, prices, footer — is drawn in here,
 * after the real HTML response (see views/b.ejs) came back essentially
 * empty. With JS enabled this should look identical to the real homepage.
 * With JS disabled (or to a crawler that doesn't execute it), the page is
 * genuinely just the empty shell — that's the whole point of this route.
 */

(function () {
  var catImageMap = {
    sports: 'sports_cat.jpg', running: 'running_cat.jpg', lifestyle: 'lifestyles_cat.jpg',
    classics: 'classics_cat.jpg', basketball: 'basketball_cat.jpg', golf: 'golf_cat.jpg',
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function productCardHtml(product) {
    var img = product.image_url || ('https://picsum.photos/seed/p' + product.id + '/400/400');
    var badge = product.on_sale
      ? '<span class="pc-badge">Sale!</span>'
      : (product.featured ? '<span class="pc-badge featured">Featured</span>' : '');
    var price = parseFloat(product.price).toFixed(2);
    var comparePrice = (product.compare_price && product.compare_price > product.price)
      ? '<span class="original">$' + parseFloat(product.compare_price).toFixed(2) + '</span>' : '';
    var outOfStock = product.stock === 0
      ? '<div style="font-size:11px;color:#e53935;margin-top:4px;font-weight:600;" id="pc-out-of-stock-' + product.id + '">Out of Stock</div>' : '';

    return (
      '<div class="product-card h-100" id="product-card-' + product.id + '">' +
        '<div class="product-card-img-wrapper">' +
          '<a href="/product/' + esc(product.slug) + '" id="pc-img-link-' + product.id + '">' +
            '<img src="' + esc(img) + '" class="product-card-img" alt="' + esc(product.name) + '" loading="lazy">' +
          '</a>' +
          badge +
          '<div class="product-card-actions">' +
            '<form action="/cart/add" method="POST" style="display:contents">' +
              '<input type="hidden" name="product_id" value="' + product.id + '">' +
              '<input type="hidden" name="sku" value="' + esc(product.sku || '') + '">' +
              '<input type="hidden" name="quantity" value="1">' +
              '<button type="submit" class="btn-action btn-add-cart" id="pc-add-to-cart-' + product.id + '" title="Add to Cart">' +
                '<i class="bi bi-cart-plus me-1"></i>Add to Cart' +
              '</button>' +
            '</form>' +
            '<a href="/login" class="btn-action" id="pc-wishlist-login-' + product.id + '" title="Sign in to add to Wishlist">' +
              '<i class="bi bi-heart"></i>' +
            '</a>' +
            '<a href="/product/' + esc(product.slug) + '" class="btn-action" id="pc-quick-view-' + product.id + '" title="Quick View">' +
              '<i class="bi bi-eye"></i>' +
            '</a>' +
          '</div>' +
        '</div>' +
        '<div class="product-card-body">' +
          '<a href="/product/' + esc(product.slug) + '" class="pc-name d-block" id="pc-name-link-' + product.id + '">' + esc(product.name) + '</a>' +
          '<div class="pc-stars">' +
            '<i class="bi bi-star-fill"></i><i class="bi bi-star-fill"></i><i class="bi bi-star-fill"></i>' +
            '<i class="bi bi-star-fill"></i><i class="bi bi-star-half"></i><span class="count">(12)</span>' +
          '</div>' +
          '<div class="pc-price"><span class="current">$' + price + '</span>' + comparePrice + '</div>' +
          outOfStock +
        '</div>' +
      '</div>'
    );
  }

  function navHtml(data) {
    var cart = data.cart || { count: 0, total: 0 };
    var wishlist = data.wishlist || { count: 0 };
    var navCats = data.navCategories || [];

    var catLinks = navCats.map(function (cat) {
      return '<li class="nav-item"><a class="nav-link" href="/shop?category=' + esc(cat.slug) + '" id="nav-cat-' + esc(cat.slug) + '">' + esc(cat.name) + '</a></li>';
    }).join('');

    return (
      '<div class="top-bar">' +
        '<div class="container d-flex justify-content-between align-items-center">' +
          '<span><i class="bi bi-telephone me-1"></i>1 800 345 6789</span>' +
          '<span class="top-promo d-none-mobile"><i class="bi bi-truck me-1"></i>FREE SHIPPING ON ORDERS OVER $99</span>' +
          '<div class="d-flex gap-3">' +
            '<a href="/login"><i class="bi bi-person me-1"></i>Sign In</a>' +
            '<a href="/register">Register</a>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<header class="main-nav">' +
        '<div class="container d-flex align-items-center gap-4">' +
          '<a href="/" class="navbar-brand me-3 flex-shrink-0" id="main-logo">C<span>Store</span></a>' +
          '<form class="search-bar d-flex flex-grow-1" action="/shop" method="GET" id="search-form">' +
            '<input class="form-control" type="search" name="q" id="search-input" placeholder="Search products, brands and categories...">' +
            '<button class="btn-search" type="submit" id="search-submit"><i class="bi bi-search"></i></button>' +
          '</form>' +
          '<div class="nav-icons d-flex align-items-center ms-3">' +
            '<a href="/wishlist" title="Wishlist" id="nav-wishlist-link">' +
              '<i class="bi bi-heart' + (wishlist.count > 0 ? '-fill text-danger' : '') + '"></i><span>Wishlist</span>' +
            '</a>' +
            '<a href="/cart" title="Cart" class="ms-1 position-relative" id="nav-cart-link">' +
              '<i class="bi bi-cart2"></i>' +
              '<span class="cart-total-text">$' + Number(cart.total).toFixed(2) + '</span>' +
              '<span class="badge-pill' + (cart.count > 0 ? '' : ' d-none') + '" id="cart-count">' + cart.count + '</span>' +
            '</a>' +
          '</div>' +
        '</div>' +
      '</header>' +
      '<div class="cat-nav">' +
        '<div class="container">' +
          '<nav class="navbar navbar-expand-lg p-0">' +
            '<button class="navbar-toggler border-0 py-2 me-2" type="button" data-bs-toggle="collapse" data-bs-target="#catNavMenu"><i class="bi bi-list fs-4"></i></button>' +
            '<div class="collapse navbar-collapse" id="catNavMenu">' +
              '<ul class="navbar-nav">' +
                '<li class="nav-item"><a class="nav-link" href="/shop" id="nav-all-products">All Products</a></li>' +
                catLinks +
                '<li class="nav-item"><a class="nav-link" href="/shop?on_sale=1" style="color: var(--red) !important;" id="nav-sale-link">Sale</a></li>' +
              '</ul>' +
            '</div>' +
          '</nav>' +
        '</div>' +
      '</div>'
    );
  }

  function heroHtml() {
    return (
      '<div id="heroCarousel" class="carousel slide hero-carousel" data-bs-ride="carousel" data-bs-interval="5000">' +
        '<div class="carousel-indicators">' +
          '<button type="button" data-bs-target="#heroCarousel" data-bs-slide-to="0" class="active"></button>' +
          '<button type="button" data-bs-target="#heroCarousel" data-bs-slide-to="1"></button>' +
          '<button type="button" data-bs-target="#heroCarousel" data-bs-slide-to="2"></button>' +
        '</div>' +
        '<div class="carousel-inner">' +
          '<div class="carousel-item active" id="hero-slide-1">' +
            '<div class="slide-bg" style="background-image:url(\'/images/people_walking_carousel.jpg\')"></div>' +
            '<div class="carousel-caption-custom">' +
              '<span class="slide-label">Just for You</span>' +
              '<h2 class="slide-title">Sneakers for Every<br>Step of the Way</h2>' +
              '<p class="slide-subtitle">Top brands, every style, every size.<br>Fast shipping &amp; easy returns.</p>' +
              '<a href="/shop" class="btn-shop" id="hero-slide-1-cta">Shop Now</a>' +
            '</div>' +
            '<div class="discount-badge"><span class="pct" style="font-size:14px;line-height:1.2;">Popular</span><span class="off">Brands</span></div>' +
          '</div>' +
          '<div class="carousel-item" id="hero-slide-2">' +
            '<div class="slide-bg" style="background-image:url(\'/images/people_eating_carousel.jpg\')"></div>' +
            '<div class="carousel-caption-custom">' +
              '<span class="slide-label">Casual Classics</span>' +
              '<h2 class="slide-title">Kick Back in<br>Classic Style</h2>' +
              '<p class="slide-subtitle">Everyday sneakers for wherever life takes you.<br>Vans, Converse, Adidas &amp; more.</p>' +
              '<a href="/shop?category=classics" class="btn-shop" id="hero-slide-2-cta">Shop Classics</a>' +
            '</div>' +
            '<div class="discount-badge"><span class="pct" style="font-size:18px;line-height:1.2;">Classic</span><span class="off">Style</span></div>' +
          '</div>' +
          '<div class="carousel-item" id="hero-slide-3">' +
            '<div class="slide-bg" style="background-image:url(\'/images/sale_carousel.jpg\')"></div>' +
            '<div class="carousel-caption-custom">' +
              '<span class="slide-label">Flash Sale — Today Only</span>' +
              '<h2 class="slide-title">Unbeatable Deals<br>Every Day</h2>' +
              '<p class="slide-subtitle">Use code <strong>SAVE10</strong> for 10% off<br>on orders over $50.</p>' +
              '<a href="/shop?on_sale=1" class="btn-shop" id="hero-slide-3-cta">Grab Deals</a>' +
            '</div>' +
            '<div class="discount-badge" style="background:#fdd835;"><span class="pct" style="color:#1a1a1a;">30%</span><span class="off" style="color:#1a1a1a;">Off</span></div>' +
          '</div>' +
        '</div>' +
        '<button class="carousel-control-prev" type="button" data-bs-target="#heroCarousel" data-bs-slide="prev"><span class="carousel-control-prev-icon"></span></button>' +
        '<button class="carousel-control-next" type="button" data-bs-target="#heroCarousel" data-bs-slide="next"><span class="carousel-control-next-icon"></span></button>' +
      '</div>'
    );
  }

  function trustBarHtml() {
    var items = [
      ['bi-truck', 'Free Shipping', 'On orders over $99'],
      ['bi-arrow-counterclockwise', 'Easy Returns', '30-day return policy'],
      ['bi-shield-lock', 'Secure Checkout', '100% safe &amp; encrypted'],
      ['bi-headset', '24/7 Support', 'Always here for you'],
    ];
    var cols = items.map(function (item) {
      return '<div class="col-6 col-md-3"><div class="trust-item justify-content-center"><i class="bi ' + item[0] + '"></i>' +
        '<div><div class="label">' + item[1] + '</div><div class="sub">' + item[2] + '</div></div></div></div>';
    }).join('');
    return '<div class="trust-bar border-bottom"><div class="container"><div class="row g-3">' + cols + '</div></div></div>';
  }

  function categoriesHtml(categories) {
    if (!categories || !categories.length) return '';
    var tiles = categories.map(function (cat) {
      var img = catImageMap[cat.slug] || (cat.slug + '_cat.jpg');
      return '<div class="col-6 col-md-4 col-lg-2">' +
        '<a href="/shop?category=' + esc(cat.slug) + '" class="category-tile" id="home-cat-' + esc(cat.slug) + '">' +
          '<img src="/images/' + img + '" alt="' + esc(cat.name) + '" loading="lazy">' +
          '<div class="category-tile-overlay"><span class="category-tile-name">' + esc(cat.name) + '</span></div>' +
        '</a>' +
      '</div>';
    }).join('');
    return '<section class="py-5"><div class="container"><h2 class="section-title">Shop by Category</h2><div class="row g-3">' + tiles + '</div></div></section>';
  }

  function productSectionHtml(products, heading, headingId, viewAllId, bg) {
    if (!products || !products.length) return '';
    var cards = products.map(function (p) {
      return '<div class="col-6 col-md-4 col-lg-3">' + productCardHtml(p) + '</div>';
    }).join('');
    return '<section class="py-5"' + (bg ? ' style="background:var(--light-gray)"' : '') + '>' +
      '<div class="container">' +
        '<div class="d-flex justify-content-between align-items-end mb-4">' +
          '<h2 class="section-title mb-0"' + (headingId ? ' id="' + headingId + '"' : '') + '>' + heading + '</h2>' +
          '<a href="/shop" style="font-size:13px;font-weight:600;color:var(--red);text-decoration:none;"' + (viewAllId ? ' id="' + viewAllId + '"' : '') + '>View All <i class="bi bi-arrow-right"></i></a>' +
        '</div>' +
        '<div class="row g-3">' + cards + '</div>' +
      '</div>' +
    '</section>';
  }

  function promoBannersHtml() {
    return (
      '<section class="py-5"><div class="container"><div class="row g-4">' +
        '<div class="col-md-6"><div class="promo-banner" id="promo-banner-1">' +
          '<img src="https://picsum.photos/seed/promo1store/800/400" class="promo-banner-img" alt="Sale">' +
          '<div class="promo-banner-body"><div class="promo-banner-label">This Week Only</div>' +
          '<div class="promo-banner-title">Up to <span class="highlight">25% Off</span><br>Selected Styles</div>' +
          '<a href="/shop?on_sale=1" class="btn-banner" id="promo-banner-1-cta">Shop Sale</a></div>' +
        '</div></div>' +
        '<div class="col-md-6"><div class="promo-banner" id="promo-banner-2">' +
          '<img src="https://picsum.photos/seed/promo2store/800/400" class="promo-banner-img" alt="Running">' +
          '<div class="promo-banner-body"><div class="promo-banner-label">Built for the Road</div>' +
          '<div class="promo-banner-title">Running<br><span class="highlight">Collection</span></div>' +
          '<a href="/shop?category=running" class="btn-banner" id="promo-banner-2-cta">Shop Running</a></div>' +
        '</div></div>' +
      '</div></div></section>'
    );
  }

  function sportPromosHtml() {
    function block(img, label, title, subtitle, cta, href, idPrefix) {
      return '<div class="col-md-6"><div style="position:relative;overflow:hidden;border-radius:6px;height:340px;">' +
        '<img src="' + img + '" alt="' + label + '" style="width:100%;height:100%;object-fit:cover;object-position:center;display:block;filter:brightness(0.55);">' +
        '<div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:28px;">' +
          '<span style="display:inline-block;background:var(--red);color:#fff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:4px 12px;border-radius:2px;margin-bottom:12px;width:fit-content;" id="' + idPrefix + '-label">' + label + '</span>' +
          '<h3 style="color:#fff;font-size:clamp(22px,3vw,32px);font-weight:800;line-height:1.1;margin-bottom:10px;" id="' + idPrefix + '-title">' + title + '</h3>' +
          '<p style="color:rgba(255,255,255,0.85);font-size:14px;margin-bottom:20px;" id="' + idPrefix + '-subtitle">' + subtitle + '</p>' +
          '<a href="' + href + '" id="' + idPrefix + '-cta" style="background:var(--red);color:#fff;padding:11px 24px;font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;text-decoration:none;border-radius:2px;display:inline-block;width:fit-content;">' + cta + '</a>' +
        '</div></div></div>';
    }
    return '<section class="py-4" id="sport-promos"><div class="container"><div class="row g-4">' +
      block('/images/basketball-promo.jpg', 'On the Court', 'Built to Dominate<br>the Court', 'Performance basketball shoes from Nike, Adidas &amp; more.', 'Shop Basketball', '/shop?category=basketball', 'basketball-promo') +
      block('/images/golf-promo.jpg', 'On the Fairway', 'Step Up Your<br>Golf Game', 'Precision golf shoes engineered for comfort and control.', 'Shop Golf', '/shop?category=golf', 'golf-promo') +
      '</div></div></section>';
  }

  function newsletterHtml() {
    return (
      '<section class="py-5"><div class="container">' +
        '<div style="background:var(--dark);border-radius:6px;padding:48px 40px;text-align:center;color:#fff;">' +
          '<h3 style="font-weight:800;margin-bottom:8px;">Join Our Newsletter</h3>' +
          '<p style="color:#aaa;margin-bottom:24px;font-size:15px;">Get exclusive deals, new arrivals and sale alerts — directly in your inbox.</p>' +
          '<form class="d-flex justify-content-center gap-0" style="max-width:440px;margin:0 auto;" id="newsletter-form">' +
            '<input type="email" class="form-control" placeholder="Enter your email" id="newsletter-email" style="border-radius:3px 0 0 3px;border:none;height:48px;" required>' +
            '<button class="btn-red" id="newsletter-submit" style="border-radius:0 3px 3px 0;white-space:nowrap;padding:0 28px;font-size:13px;">Subscribe</button>' +
          '</form>' +
          '<div id="newsletter-success" style="display:none;margin-top:16px;">' +
            '<i class="bi bi-check-circle-fill text-success fs-4 me-2"></i>' +
            '<span style="color:#fff;font-size:16px;font-weight:600;">You\'re subscribed! Thanks for joining.</span>' +
          '</div>' +
        '</div>' +
      '</div></section>'
    );
  }

  function footerHtml(navCategories) {
    var catLinks = (navCategories || []).slice(0, 6).map(function (cat) {
      return '<li><a href="/shop?category=' + esc(cat.slug) + '">' + esc(cat.name) + '</a></li>';
    }).join('');
    return (
      '<footer class="site-footer"><div class="container"><div class="row g-4">' +
        '<div class="col-lg-3 col-md-6"><h6>CStore</h6><ul class="footer-contact">' +
          '<li><i class="bi bi-geo-alt-fill"></i><span>1234 Market Street, San Francisco, CA 94103</span></li>' +
          '<li><i class="bi bi-telephone-fill"></i><span>1 800 345 6789</span></li>' +
          '<li><i class="bi bi-envelope-fill"></i><span>support@cstore.com</span></li>' +
          '<li><i class="bi bi-clock-fill"></i><span>Monday – Friday: 8am – 6pm</span></li>' +
        '</ul><div class="social-links">' +
          '<a href="#" title="Facebook"><i class="bi bi-facebook"></i></a>' +
          '<a href="#" title="Twitter/X"><i class="bi bi-twitter-x"></i></a>' +
          '<a href="#" title="LinkedIn"><i class="bi bi-linkedin"></i></a>' +
          '<a href="#" title="Instagram"><i class="bi bi-instagram"></i></a>' +
        '</div></div>' +
        '<div class="col-lg-1 col-6"><h6>Quick Links</h6><ul>' +
          '<li><a href="/shop">Shop</a></li><li><a href="/cart">Cart</a></li>' +
          '<li><a href="/wishlist">Wishlist</a></li><li><a href="/orders">My Orders</a></li>' +
          '<li><a href="/login">Sign In</a></li><li><a href="/register">Register</a></li>' +
        '</ul></div>' +
        '<div class="col-lg-1 col-6"><h6>Categories</h6><ul>' + catLinks + '</ul></div>' +
        '<div class="col-lg-1 col-md-6"><h6>We Accept</h6><div class="payment-icons">' +
          '<span class="payment-icon">VISA</span><span class="payment-icon">MC</span>' +
          '<span class="payment-icon">AMEX</span><span class="payment-icon">PayPal</span>' +
          '<span class="payment-icon">COD</span>' +
        '</div></div>' +
      '</div>' +
      '<div class="pb-3"><div class="footer-disclaimer" style="border-top:1px solid #333;padding-top:20px;margin-top:10px;">' +
        '<p style="font-size:12.5px;color:#fff;margin:0;line-height:1.6;"><strong style="color:#fff;">Disclaimer:</strong> This is a demonstration website created for demo and testing purposes only. ' +
        'All products, prices, and transactions are fictitious. No real orders are processed, no payments are collected, ' +
        'and no goods will be shipped. Do not enter any personally identifiable information (PII) — including your real name, ' +
        'address, email, or payment details. Any data entered should be fictional test data only.</p>' +
      '</div></div>' +
      '<div class="footer-bottom"><div class="container d-flex flex-wrap justify-content-between align-items-center gap-2">' +
        '<span>&copy; ' + new Date().getFullYear() + ' CStore. All rights reserved.</span>' +
        '<div class="d-flex gap-3"><a href="#">Privacy Policy</a><a href="#">Terms of Service</a><a href="#">Returns</a><a href="#">Sitemap</a></div>' +
      '</div></div>' +
      '</footer>'
    );
  }

  function render(data) {
    var root = document.getElementById('app-root');
    root.innerHTML =
      navHtml(data) +
      '<main>' +
        heroHtml() +
        trustBarHtml() +
        categoriesHtml(data.categories) +
        productSectionHtml(data.featured, 'Featured Products') +
        promoBannersHtml() +
        productSectionHtml(data.sale, 'Best Selling', 'best-selling-heading', 'best-selling-view-all', true) +
        sportPromosHtml() +
        newsletterHtml() +
      '</main>' +
      footerHtml(data.navCategories);

    // Bootstrap doesn't auto-init components added after its own load, since
    // that scan only runs once on script load — do it explicitly here.
    var carouselEl = document.getElementById('heroCarousel');
    if (carouselEl && window.bootstrap) {
      new bootstrap.Carousel(carouselEl, { interval: 5000 });
    }

    var newsletterForm = document.getElementById('newsletter-form');
    if (newsletterForm) {
      newsletterForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = document.getElementById('newsletter-email').value;
        if (!email) return;
        newsletterForm.style.display = 'none';
        document.getElementById('newsletter-success').style.display = 'block';
      });
    }
  }

  // Same document-level tracking hooks as partials/footer.ejs — event
  // delegation means these work on this page's dynamically-injected forms
  // too, without needing footer.ejs itself.
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || form.action.indexOf('/cart/add') === -1) return;
    var skuInput = form.querySelector('input[name="sku"]');
    var sku = skuInput ? skuInput.value : '';
    if (!sku) return;
    window._uxa = window._uxa || [];
    window._uxa.push(['ec:cart:add', { sku: sku, merchant: window.location.hostname }]);
  });

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form) return;
    var emailInput = form.querySelector('input[type="email"]');
    var email = emailInput ? emailInput.value.trim() : '';
    if (!email) return;
    window._uxa = window._uxa || [];
    window._uxa.push(['identify', email]);
  });

  fetch('/api/homepage-data')
    .then(function (r) { return r.json(); })
    .then(render)
    .catch(function (err) { console.error('homepage-csr: failed to load', err); });
})();
