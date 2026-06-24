const db = require('../../config/database');
const bcrypt = require('bcryptjs');

console.log('Seeding database...');

// Clear all data in correct order
db.exec(`
  DELETE FROM reviews;
  DELETE FROM order_items;
  DELETE FROM orders;
  DELETE FROM wishlist_items;
  DELETE FROM cart_items;
  DELETE FROM product_variants;
  DELETE FROM product_attributes;
  DELETE FROM product_images;
  DELETE FROM products;
  DELETE FROM coupons;
  DELETE FROM categories;
  DELETE FROM users;
`);

// Users
const adminHash = bcrypt.hashSync('admin123', 10);
const userHash = bcrypt.hashSync('user123', 10);

const adminId = db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)').run('Admin User', 'admin@store.com', adminHash, 'admin').lastInsertRowid;
const userId = db.prepare('INSERT INTO users (name, email, password, role, address, city, state, zip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('John Doe', 'user@test.com', userHash, 'customer', '123 Main St', 'New York', 'NY', '10001').lastInsertRowid;
const userId2 = db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)').run('Jane Smith', 'jane@test.com', bcrypt.hashSync('jane123', 10), 'customer').lastInsertRowid;

console.log('Users created');

// Categories
const electronics = db.prepare('INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)').run('Electronics', 'electronics', 'Gadgets and tech products').lastInsertRowid;
const phones = db.prepare('INSERT INTO categories (name, slug, parent_id, description) VALUES (?, ?, ?, ?)').run('Phones', 'phones', electronics, 'Smartphones and accessories').lastInsertRowid;
const laptops = db.prepare('INSERT INTO categories (name, slug, parent_id, description) VALUES (?, ?, ?, ?)').run('Laptops', 'laptops', electronics, 'Laptops and notebooks').lastInsertRowid;
const clothing = db.prepare('INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)').run('Clothing', 'clothing', 'Fashion and apparel').lastInsertRowid;
const mens = db.prepare('INSERT INTO categories (name, slug, parent_id, description) VALUES (?, ?, ?, ?)').run("Men's", 'mens', clothing, "Men's clothing").lastInsertRowid;
const womens = db.prepare('INSERT INTO categories (name, slug, parent_id, description) VALUES (?, ?, ?, ?)').run("Women's", 'womens', clothing, "Women's clothing").lastInsertRowid;
const home = db.prepare('INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)').run('Home & Kitchen', 'home-kitchen', 'Home goods and kitchen items').lastInsertRowid;
const sports = db.prepare('INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)').run('Sports & Outdoors', 'sports-outdoors', 'Sports equipment and outdoor gear').lastInsertRowid;
const books = db.prepare('INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)').run('Books', 'books', 'Books and literature').lastInsertRowid;

console.log('Categories created');

// Products
const insertProduct = db.prepare(`
  INSERT INTO products (name, slug, description, short_description, price, compare_price, stock, category_id, featured, on_sale, status, sku)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
`);
const insertImage = db.prepare('INSERT INTO product_images (product_id, url, alt_text, sort_order) VALUES (?, ?, ?, ?)');
const insertVariant = db.prepare('INSERT INTO product_variants (product_id, name, price, stock, sku) VALUES (?, ?, ?, ?, ?)');

// Product 1: iPhone
const p1 = insertProduct.run(
  'iPhone 15 Pro', 'iphone-15-pro',
  'Experience the future of smartphones with the iPhone 15 Pro. Features a titanium design, the A17 Pro chip, and a 48MP main camera system. USB-C connectivity and Action Button included.',
  'Latest iPhone with A17 Pro chip and titanium design',
  999.99, 1099.99, 50, phones, 1, 0, 'IPHONE-15-PRO'
).lastInsertRowid;
insertImage.run(p1, 'https://picsum.photos/seed/iphone15/800/600', 'iPhone 15 Pro', 0);
insertImage.run(p1, 'https://picsum.photos/seed/iphone15b/800/600', 'iPhone 15 Pro back', 1);
insertVariant.run(p1, '128GB - Natural Titanium', 999.99, 20, 'IPHONE-15-128-NT');
insertVariant.run(p1, '256GB - Black Titanium', 1099.99, 15, 'IPHONE-15-256-BT');
insertVariant.run(p1, '512GB - Blue Titanium', 1299.99, 15, 'IPHONE-15-512-BLT');

// Product 2: Samsung Galaxy
const p2 = insertProduct.run(
  'Samsung Galaxy S24 Ultra', 'samsung-galaxy-s24-ultra',
  'The Samsung Galaxy S24 Ultra combines the best of Galaxy AI with the productivity of the S Pen. Features a 200MP camera, Snapdragon 8 Gen 3, and 12GB RAM for ultimate performance.',
  'Flagship Samsung with built-in S Pen and AI features',
  1199.99, null, 35, phones, 1, 0, 'SAM-S24-ULTRA'
).lastInsertRowid;
insertImage.run(p2, 'https://picsum.photos/seed/samsung24/800/600', 'Samsung Galaxy S24 Ultra', 0);
insertVariant.run(p2, '256GB - Titanium Black', 1199.99, 15, 'S24-256-TB');
insertVariant.run(p2, '512GB - Titanium Gray', 1399.99, 12, 'S24-512-TG');
insertVariant.run(p2, '1TB - Titanium Violet', 1619.99, 8, 'S24-1TB-TV');

// Product 3: MacBook Pro
const p3 = insertProduct.run(
  'MacBook Pro 14"', 'macbook-pro-14',
  'The MacBook Pro 14" with M3 chip delivers exceptional performance for professionals. Features a stunning Liquid Retina XDR display, up to 22 hours of battery life, and a comprehensive port selection.',
  'Professional laptop with M3 chip',
  1999.99, 2199.99, 20, laptops, 1, 1, 'MBP-14-M3'
).lastInsertRowid;
insertImage.run(p3, 'https://picsum.photos/seed/macbook14/800/600', 'MacBook Pro 14"', 0);
insertImage.run(p3, 'https://picsum.photos/seed/macbook14b/800/600', 'MacBook Pro 14" open', 1);
insertVariant.run(p3, 'M3 / 8GB / 512GB', 1999.99, 10, 'MBP-M3-8-512');
insertVariant.run(p3, 'M3 Pro / 18GB / 512GB', 2399.99, 7, 'MBP-M3PRO-18-512');
insertVariant.run(p3, 'M3 Max / 36GB / 1TB', 3499.99, 3, 'MBP-M3MAX-36-1T');

// Product 4: Dell XPS
const p4 = insertProduct.run(
  'Dell XPS 13 Plus', 'dell-xps-13-plus',
  'The Dell XPS 13 Plus redefines the premium laptop experience with its borderless display, 13th Gen Intel Core processor, and sleek haptic touch function row. An ultrabook reimagined for the modern professional.',
  'Ultra-slim premium Windows laptop',
  1299.99, null, 15, laptops, 0, 0, 'DELL-XPS13-PLUS'
).lastInsertRowid;
insertImage.run(p4, 'https://picsum.photos/seed/dellxps/800/600', 'Dell XPS 13 Plus', 0);

// Product 5: Classic T-Shirt (Men's)
const p5 = insertProduct.run(
  "Classic Cotton T-Shirt", 'classic-cotton-tshirt',
  'Our classic cotton t-shirt is made from 100% organic cotton, providing ultimate comfort and breathability. Available in multiple colors and sizes. Perfect for everyday wear.',
  '100% organic cotton everyday tee',
  29.99, 39.99, 200, mens, 0, 1, 'TEE-CLASSIC-M'
).lastInsertRowid;
insertImage.run(p5, 'https://picsum.photos/seed/tshirtmen/800/600', 'Classic T-Shirt', 0);
insertImage.run(p5, 'https://picsum.photos/seed/tshirtmen2/800/600', 'Classic T-Shirt back', 1);
insertVariant.run(p5, 'Small - White', 29.99, 40, 'TEE-S-WHT');
insertVariant.run(p5, 'Medium - White', 29.99, 50, 'TEE-M-WHT');
insertVariant.run(p5, 'Large - White', 29.99, 45, 'TEE-L-WHT');
insertVariant.run(p5, 'Small - Black', 29.99, 35, 'TEE-S-BLK');
insertVariant.run(p5, 'Medium - Black', 29.99, 30, 'TEE-M-BLK');

// Product 6: Women's Floral Dress
const p6 = insertProduct.run(
  "Floral Summer Dress", 'floral-summer-dress',
  "Beautiful floral summer dress made from lightweight chiffon fabric. Features a flowy silhouette, adjustable spaghetti straps, and a vibrant floral print. Perfect for warm weather outings.",
  'Lightweight chiffon floral dress for summer',
  59.99, 79.99, 80, womens, 1, 1, 'DRESS-FLORAL-W'
).lastInsertRowid;
insertImage.run(p6, 'https://picsum.photos/seed/floraldress/800/600', 'Floral Summer Dress', 0);
insertVariant.run(p6, 'XS - Blue Floral', 59.99, 15, 'DRESS-XS-BLU');
insertVariant.run(p6, 'S - Blue Floral', 59.99, 20, 'DRESS-S-BLU');
insertVariant.run(p6, 'M - Pink Floral', 59.99, 25, 'DRESS-M-PNK');
insertVariant.run(p6, 'L - Pink Floral', 59.99, 20, 'DRESS-L-PNK');

// Product 7: Coffee Maker
const p7 = insertProduct.run(
  'Premium Coffee Maker', 'premium-coffee-maker',
  'Brew the perfect cup every time with our Premium Coffee Maker. Features programmable brewing, a thermal carafe to keep coffee hot for hours, built-in grinder, and customizable brew strength.',
  'Programmable coffee maker with built-in grinder',
  149.99, 199.99, 30, home, 1, 1, 'COFFEE-MAKER-PRO'
).lastInsertRowid;
insertImage.run(p7, 'https://picsum.photos/seed/coffeemaker/800/600', 'Premium Coffee Maker', 0);
insertImage.run(p7, 'https://picsum.photos/seed/coffeemaker2/800/600', 'Coffee Maker side view', 1);

// Product 8: Non-stick Cookware Set
const p8 = insertProduct.run(
  '12-Piece Non-Stick Cookware Set', 'nonstick-cookware-set-12pc',
  'Complete your kitchen with this professional-grade 12-piece non-stick cookware set. Includes pots, pans, and lids in various sizes. PFOA-free coating ensures healthy cooking. Oven-safe up to 450°F.',
  'Professional non-stick cookware set, 12 pieces',
  199.99, 279.99, 25, home, 0, 1, 'COOKWARE-12PC'
).lastInsertRowid;
insertImage.run(p8, 'https://picsum.photos/seed/cookware/800/600', '12-Piece Cookware Set', 0);

// Product 9: Yoga Mat
const p9 = insertProduct.run(
  'Premium Yoga Mat', 'premium-yoga-mat',
  'Elevate your yoga practice with our Premium Yoga Mat. Features extra-thick cushioning for joint protection, non-slip texture for stability, and eco-friendly TPE material. Includes carrying strap.',
  'Extra-thick eco-friendly yoga mat with carrying strap',
  49.99, null, 100, sports, 1, 0, 'YOGA-MAT-PRO'
).lastInsertRowid;
insertImage.run(p9, 'https://picsum.photos/seed/yogamat/800/600', 'Premium Yoga Mat', 0);
insertVariant.run(p9, 'Purple - 6mm', 49.99, 30, 'YOGA-6MM-PRP');
insertVariant.run(p9, 'Blue - 6mm', 49.99, 35, 'YOGA-6MM-BLU');
insertVariant.run(p9, 'Black - 8mm', 54.99, 35, 'YOGA-8MM-BLK');

// Product 10: Running Shoes
const p10 = insertProduct.run(
  'CloudRunner Pro Sneakers', 'cloudrunner-pro-sneakers',
  'Experience the perfect blend of cushioning and responsiveness with CloudRunner Pro Sneakers. Engineered mesh upper for breathability, responsive foam midsole for energy return, and durable rubber outsole.',
  'High-performance running shoes with CloudFoam cushioning',
  89.99, 119.99, 60, sports, 1, 1, 'SHOE-CLOUDRUN'
).lastInsertRowid;
insertImage.run(p10, 'https://picsum.photos/seed/sneakers/800/600', 'CloudRunner Pro', 0);
insertVariant.run(p10, 'Size 8 - White', 89.99, 10, 'SHOE-8-WHT');
insertVariant.run(p10, 'Size 9 - White', 89.99, 12, 'SHOE-9-WHT');
insertVariant.run(p10, 'Size 10 - Black', 89.99, 15, 'SHOE-10-BLK');
insertVariant.run(p10, 'Size 11 - Navy', 89.99, 13, 'SHOE-11-NVY');
insertVariant.run(p10, 'Size 12 - Gray', 89.99, 10, 'SHOE-12-GRY');

// Product 11: Programming Book
const p11 = insertProduct.run(
  'Clean Code: A Handbook of Agile Software', 'clean-code-handbook',
  "Robert C. Martin's \"Clean Code\" is a must-read for any professional developer. Learn how to write code that's easy to read, maintain, and modify. Covers naming conventions, functions, comments, formatting, and more.",
  'The classic software development book by Robert C. Martin',
  39.99, 49.99, 200, books, 0, 0, 'BOOK-CLEAN-CODE'
).lastInsertRowid;
insertImage.run(p11, 'https://picsum.photos/seed/cleancode/800/600', 'Clean Code Book', 0);

// Product 12: Smart Watch
const p12 = insertProduct.run(
  'SmartWatch Pro X', 'smartwatch-pro-x',
  'Stay connected and track your health with the SmartWatch Pro X. Features heart rate monitoring, GPS, sleep tracking, 50+ workout modes, and 7-day battery life. Compatible with iOS and Android.',
  'Advanced smartwatch with health tracking and GPS',
  299.99, 349.99, 45, electronics, 1, 1, 'WATCH-PRO-X'
).lastInsertRowid;
insertImage.run(p12, 'https://picsum.photos/seed/smartwatch/800/600', 'SmartWatch Pro X', 0);
insertImage.run(p12, 'https://picsum.photos/seed/smartwatchb/800/600', 'SmartWatch Pro X face', 1);
insertVariant.run(p12, '41mm - Midnight Black', 299.99, 15, 'WATCH-41-BLK');
insertVariant.run(p12, '45mm - Silver', 329.99, 15, 'WATCH-45-SLV');
insertVariant.run(p12, '45mm - Rose Gold', 329.99, 15, 'WATCH-45-RGD');

console.log('Products created');

// Coupons
db.prepare('INSERT INTO coupons (code, type, value, min_order, max_uses, active) VALUES (?, ?, ?, ?, ?, ?)').run('SAVE10', 'percent', 10, 50, 100, 1);
db.prepare('INSERT INTO coupons (code, type, value, min_order, max_uses, active) VALUES (?, ?, ?, ?, ?, ?)').run('FLAT20', 'fixed', 20, 100, 50, 1);
db.prepare('INSERT INTO coupons (code, type, value, min_order, active) VALUES (?, ?, ?, ?, ?)').run('WELCOME15', 'percent', 15, 0, 1);

console.log('Coupons created');

// Orders
const o1 = db.prepare(`
  INSERT INTO orders (order_number, user_id, status, subtotal, shipping, tax, total,
    shipping_name, shipping_address, shipping_city, shipping_state, shipping_zip, shipping_country, payment_method)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run('ORD-1001', userId, 'delivered', 1099.99, 0, 87.99, 1187.98, 'John Doe', '123 Main St', 'New York', 'NY', '10001', 'US', 'cod').lastInsertRowid;
db.prepare('INSERT INTO order_items (order_id, product_id, name, price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?)').run(o1, p1, 'iPhone 15 Pro - 128GB Natural Titanium', 999.99, 1, 999.99);
db.prepare('INSERT INTO order_items (order_id, product_id, name, price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?)').run(o1, p9, 'Premium Yoga Mat - Blue 6mm', 49.99, 2, 99.98);

const o2 = db.prepare(`
  INSERT INTO orders (order_number, user_id, status, subtotal, discount, shipping, tax, total, coupon_code,
    shipping_name, shipping_address, shipping_city, shipping_state, shipping_zip, shipping_country, payment_method)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run('ORD-1002', userId, 'processing', 1999.99, 199.99, 0, 144.00, 1944.00, 'SAVE10', 'John Doe', '123 Main St', 'New York', 'NY', '10001', 'US', 'credit_card').lastInsertRowid;
db.prepare('INSERT INTO order_items (order_id, product_id, name, price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?)').run(o2, p3, 'MacBook Pro 14" - M3 / 8GB / 512GB', 1999.99, 1, 1999.99);

const o3 = db.prepare(`
  INSERT INTO orders (order_number, user_id, status, subtotal, shipping, tax, total,
    shipping_name, shipping_address, shipping_city, shipping_state, shipping_zip, shipping_country, payment_method)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run('ORD-1003', userId2, 'shipped', 149.97, 0, 11.99, 161.96, 'Jane Smith', '456 Oak Ave', 'Los Angeles', 'CA', '90001', 'US', 'cod').lastInsertRowid;
db.prepare('INSERT INTO order_items (order_id, product_id, name, price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?)').run(o3, p5, 'Classic Cotton T-Shirt - Large White', 29.99, 2, 59.98);
db.prepare('INSERT INTO order_items (order_id, product_id, name, price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?)').run(o3, p6, 'Floral Summer Dress - M Pink Floral', 59.99, 1, 59.99);
db.prepare('INSERT INTO order_items (order_id, product_id, name, price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?)').run(o3, p9, 'Premium Yoga Mat - Purple 6mm', 29.99, 1, 29.99);

const o4 = db.prepare(`
  INSERT INTO orders (order_number, user_id, status, subtotal, shipping, tax, total,
    shipping_name, shipping_address, shipping_city, shipping_state, shipping_zip, shipping_country, payment_method)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run('ORD-1004', userId, 'pending', 299.99, 0, 24.00, 323.99, 'John Doe', '123 Main St', 'New York', 'NY', '10001', 'US', 'cod').lastInsertRowid;
db.prepare('INSERT INTO order_items (order_id, product_id, name, price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?)').run(o4, p12, 'SmartWatch Pro X - 41mm Midnight Black', 299.99, 1, 299.99);

const o5 = db.prepare(`
  INSERT INTO orders (order_number, user_id, status, subtotal, discount, shipping, tax, total, coupon_code,
    shipping_name, shipping_address, shipping_city, shipping_state, shipping_zip, shipping_country, payment_method)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run('ORD-1005', userId2, 'cancelled', 89.99, 20, 0, 5.59, 75.58, 'FLAT20', 'Jane Smith', '456 Oak Ave', 'Los Angeles', 'CA', '90001', 'US', 'credit_card').lastInsertRowid;
db.prepare('INSERT INTO order_items (order_id, product_id, name, price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?)').run(o5, p10, 'CloudRunner Pro Sneakers - Size 9 White', 89.99, 1, 89.99);

console.log('Orders created');

// Reviews
const insertReview = db.prepare('INSERT INTO reviews (product_id, user_id, rating, title, body, status) VALUES (?, ?, ?, ?, ?, ?)');

insertReview.run(p1, userId, 5, 'Absolutely Amazing!', 'The iPhone 15 Pro is the best smartphone I\'ve ever used. The camera is incredible, the performance is blazing fast, and the titanium build feels so premium. Worth every penny!', 'approved');
insertReview.run(p1, userId2, 4, 'Great phone, pricey though', 'Excellent smartphone with top-notch performance. The camera system is outstanding. Only downside is the premium price tag.', 'approved');
insertReview.run(p3, userId, 5, 'Perfect laptop for development', 'The M3 chip is insanely fast for my coding work. Battery lasts all day, the display is gorgeous, and it handles everything I throw at it. Highly recommend!', 'approved');
insertReview.run(p5, userId2, 5, 'Soft and comfortable', 'These t-shirts are incredibly soft and comfortable. The organic cotton feels great on skin. Great value for the price. Will definitely buy more colors!', 'approved');
insertReview.run(p6, userId2, 4, 'Beautiful dress, runs small', 'Really pretty dress with great fabric quality. I normally wear a medium but had to size up. The floral pattern is even more beautiful in person!', 'approved');
insertReview.run(p7, userId, 5, 'Best coffee maker ever', 'The built-in grinder makes such a difference in coffee freshness. The thermal carafe keeps coffee hot for hours. Easy to program and clean. Best purchase I\'ve made for my kitchen!', 'approved');
insertReview.run(p9, userId, 5, 'Perfect yoga mat', 'Excellent grip and cushioning. The extra thickness really helps with my knees during floor poses. The carrying strap is convenient. Love the purple color!', 'approved');
insertReview.run(p12, userId2, 4, 'Great smartwatch', 'Very accurate health tracking, love the sleep monitoring feature. Battery life is impressive - easily lasts 7 days. The interface is intuitive and responsive.', 'approved');

console.log('Reviews created');
console.log('\n=== Seed complete! ===');
console.log('Admin: admin@store.com / admin123');
console.log('User:  user@test.com / user123');
console.log('==================\n');
