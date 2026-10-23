-- ============================================================================
-- MULTI-VENDOR MANAGEMENT SYSTEM (DBMS PROJECT)
-- Sample Seed Data for Demonstration & Evaluation
-- ============================================================================

USE multivendor_db;

-- Disable foreign key checks during batch seed
SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE notifications;
TRUNCATE TABLE ratings;
TRUNCATE TABLE payments;
TRUNCATE TABLE order_items;
TRUNCATE TABLE orders;
TRUNCATE TABLE inventory;
TRUNCATE TABLE products;
TRUNCATE TABLE categories;
TRUNCATE TABLE vendors;
TRUNCATE TABLE users;

SET FOREIGN_KEY_CHECKS = 1;

-- ----------------------------------------------------------------------------
-- 1. USERS
-- All vendors & customers password: 'password123'
-- Admin password: 'admin123'
-- ----------------------------------------------------------------------------
INSERT INTO users (id, name, email, password_hash, role, phone, address) VALUES
(1, 'System Administrator', 'admin@markethub.com', '$2a$10$27qsn1wMvWI2seKqD7yDX.aYxhY5BXvEXvqLUvMhvvynT.4VgPjPi', 'admin', '+1-800-555-0100', 'MarketHub HQ, 100 Tech Blvd, Silicon Valley, CA'),
(2, 'Marcus Vance', 'tech@zone.com', '$2a$10$.bAH7sgqG33eHg5IBj4TdeSU6y0MJXOraqb.dWsK4sgOLYGg9dxeC', 'vendor', '+1-555-201-9871', '404 Circuit Lane, Austin, TX'),
(3, 'Elena Rostova', 'fashion@hub.com', '$2a$10$.bAH7sgqG33eHg5IBj4TdeSU6y0MJXOraqb.dWsK4sgOLYGg9dxeC', 'vendor', '+1-555-302-8762', '77 Runway Avenue, New York, NY'),
(4, 'Soren Lindqvist', 'home@living.com', '$2a$10$.bAH7sgqG33eHg5IBj4TdeSU6y0MJXOraqb.dWsK4sgOLYGg9dxeC', 'vendor', '+1-555-403-7653', '12 Fjord Way, Seattle, WA'),
(5, 'Mateo Silva', 'pending@artisan.com', '$2a$10$.bAH7sgqG33eHg5IBj4TdeSU6y0MJXOraqb.dWsK4sgOLYGg9dxeC', 'vendor', '+1-555-504-6544', '89 Craftsman Alley, Portland, OR'),
(6, 'Alice Walker', 'alice@gmail.com', '$2a$10$.bAH7sgqG33eHg5IBj4TdeSU6y0MJXOraqb.dWsK4sgOLYGg9dxeC', 'customer', '+1-555-601-1122', '14 Maple St, Denver, CO 80203'),
(7, 'Bob Martinez', 'bob@gmail.com', '$2a$10$.bAH7sgqG33eHg5IBj4TdeSU6y0MJXOraqb.dWsK4sgOLYGg9dxeC', 'customer', '+1-555-702-2233', '85 Ocean Drive, Miami, FL 33139'),
(8, 'Charlie Kim', 'charlie@gmail.com', '$2a$10$.bAH7sgqG33eHg5IBj4TdeSU6y0MJXOraqb.dWsK4sgOLYGg9dxeC', 'customer', '+1-555-803-3344', '22 Pine Street, Chicago, IL 60601');

-- ----------------------------------------------------------------------------
-- 2. VENDORS
-- 3 Approved vendors with initial earnings, 1 Pending vendor for admin review testing
-- ----------------------------------------------------------------------------
INSERT INTO vendors (id, user_id, store_name, store_description, status, commission_rate, total_earnings, banner_url) VALUES
(1, 2, 'TechZone Electronics', 'Premium gadgets, mechanical keyboards, ergonomic accessories and audio gear.', 'approved', 10.00, 375.40, 'https://images.unsplash.com/photo-1550009158-9ebf69173e03?auto=format&fit=crop&w=1200&q=80'),
(2, 3, 'Urban Chic Apparel', 'Sustainable fashion, organic cotton essentials, and modern streetwear collections.', 'approved', 10.00, 240.30, 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80'),
(3, 4, 'Nordic Living Decor', 'Scandinavian interior aesthetics, handcrafted ceramic homeware, and cozy textiles.', 'approved', 10.00, 185.00, 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80'),
(4, 5, 'Artisan Leather Crafts', 'Handcrafted genuine leather wallets, messenger bags, and accessories.', 'pending', 10.00, 0.00, 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=1200&q=80');

-- ----------------------------------------------------------------------------
-- 3. PRODUCT CATEGORIES
-- ----------------------------------------------------------------------------
INSERT INTO categories (id, name, description, icon) VALUES
(1, 'Electronics & Gadgets', 'Headphones, keyboards, docks, chargers, and smart peripherals.', 'laptop'),
(2, 'Fashion & Apparel', 'Modern clothing, eco-friendly cotton tees, denim, and bags.', 'shirt'),
(3, 'Home & Living', 'Scandinavian furniture, lamps, ceramics, and ambient lighting.', 'home'),
(4, 'Books & Stationery', 'Journals, fine pens, notebooks, and design publications.', 'book-open'),
(5, 'Sports & Fitness', 'Activewear, hydration flasks, yoga mats, and resistance gear.', 'activity');

-- ----------------------------------------------------------------------------
-- 4. PRODUCTS
-- ----------------------------------------------------------------------------
INSERT INTO products (id, vendor_id, category_id, name, description, price, image_url, is_active) VALUES
-- TechZone Products (Vendor 1)
(1, 1, 1, 'Pro Wireless Noise-Cancelling Headphones', 'Active ANC with 40h battery life, studio-grade drivers and plush memory foam earcups.', 129.99, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80', TRUE),
(2, 1, 1, 'Ultra-Slim RGB Mechanical Keyboard', 'Hot-swappable tactile switches, Bluetooth 5.1 multi-device pairing, and aluminum chassis.', 89.50, 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80', TRUE),
(3, 1, 1, '12-in-1 Dual 4K USB-C Docking Station', 'Dual HDMI 4K@60Hz, 100W Power Delivery pass-through, Gigabit Ethernet and SD slot.', 149.00, 'https://images.unsplash.com/photo-1544652478-6653e09f18a2?auto=format&fit=crop&w=800&q=80', TRUE),
(4, 1, 1, 'Ergonomic Vertical Wireless Mouse', 'Scientifically designed grip angle reduces wrist strain, 4000 DPI optical sensor.', 39.99, 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?auto=format&fit=crop&w=800&q=80', TRUE),

-- Urban Chic Apparel Products (Vendor 2)
(5, 2, 2, 'Classic Organic Cotton Crewneck T-Shirt', '100% GOTS-certified heavyweight organic cotton. Pre-shrunk relaxed fit in neutral tones.', 28.00, 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=800&q=80', TRUE),
(6, 2, 2, 'Water-Resistant Commuter City Backpack', 'Padded 16-inch laptop compartment, waterproof zippers, and hidden anti-theft passport pocket.', 65.00, 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80', TRUE),
(7, 2, 2, 'Raw Selvedge Denim Straight Jeans', 'Japanese 13.5oz denim with copper rivets and durable chain-stitched hems.', 85.00, 'https://images.unsplash.com/photo-1542272604-780c96856592?auto=format&fit=crop&w=800&q=80', TRUE),

-- Nordic Living Decor Products (Vendor 3)
(8, 3, 3, 'Minimalist Ceramic Table Lamp', 'Matte terracotta base with natural linen lampshade. Dimmable warm LED included.', 48.00, 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=80', TRUE),
(9, 3, 3, 'Handwoven Jute Floor Area Rug (5x7 ft)', 'Eco-friendly natural plant fibers, braided by hand for enduring texture and warmth.', 110.00, 'https://images.unsplash.com/photo-1600121848594-d8644e57abab?auto=format&fit=crop&w=800&q=80', TRUE),
(10, 3, 3, 'Ultrasonic Ceramic Aroma Diffuser (500ml)', 'Whisper-quiet cold mist technology with automatic low-water shutoff and ambient light.', 36.50, 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=800&q=80', TRUE);

-- ----------------------------------------------------------------------------
-- 5. INVENTORY
-- Notice: Products 2, 6, and 10 have stock <= threshold (triggers low-stock alerts!)
-- ----------------------------------------------------------------------------
INSERT INTO inventory (id, product_id, stock_quantity, low_stock_threshold) VALUES
(1, 1, 28, 5),   -- Healthy stock
(2, 2, 3, 5),    -- LOW STOCK ALERT! (3 remaining <= threshold 5)
(3, 3, 14, 4),   -- Healthy stock
(4, 4, 32, 5),   -- Healthy stock
(5, 5, 45, 10),  -- Healthy stock
(6, 6, 2, 5),    -- LOW STOCK ALERT! (2 remaining <= threshold 5)
(7, 7, 19, 8),   -- Healthy stock
(8, 8, 12, 5),   -- Healthy stock
(9, 9, 7, 3),    -- Healthy stock
(10, 10, 1, 4);  -- LOW STOCK ALERT! (1 remaining <= threshold 4)

-- ----------------------------------------------------------------------------
-- 6. ORDERS (Customer Purchases)
-- Demonstrating Multi-Vendor Cart splitting in single customer checkout!
-- ----------------------------------------------------------------------------
INSERT INTO orders (id, customer_id, total_amount, shipping_address, payment_method, status, created_at) VALUES
-- Order 1: Alice buys from TechZone (P1) AND Urban Chic (P5) - Multi-vendor order!
(1, 6, 185.99, '14 Maple St, Denver, CO 80203', 'credit_card', 'completed', '2026-10-15 10:30:00'),
-- Order 2: Bob buys from TechZone (P2) AND Nordic Living (P8)
(2, 7, 137.50, '85 Ocean Drive, Miami, FL 33139', 'upi', 'processing', '2026-10-18 14:15:00'),
-- Order 3: Charlie buys from Urban Chic (P6)
(3, 8, 65.00, '22 Pine Street, Chicago, IL 60601', 'card', 'paid', '2026-10-21 16:45:00');

-- ----------------------------------------------------------------------------
-- 7. ORDER ITEMS (Split by vendor with 10% platform fee and 90% vendor payout)
-- ----------------------------------------------------------------------------
INSERT INTO order_items (id, order_id, product_id, vendor_id, quantity, unit_price, subtotal, platform_fee, vendor_earnings, status) VALUES
-- Order 1 items:
(1, 1, 1, 1, 1, 129.99, 129.99, 13.00, 116.99, 'delivered'),  -- TechZone: $116.99 net
(2, 1, 5, 2, 2, 28.00, 56.00, 5.60, 50.40, 'delivered'),       -- Urban Chic: $50.40 net

-- Order 2 items:
(3, 2, 2, 1, 1, 89.50, 89.50, 8.95, 80.55, 'shipped'),          -- TechZone: $80.55 net
(4, 2, 8, 3, 1, 48.00, 48.00, 4.80, 43.20, 'processing'),       -- Nordic Living: $43.20 net

-- Order 3 items:
(5, 3, 6, 2, 1, 65.00, 65.00, 6.50, 58.50, 'pending');          -- Urban Chic: $58.50 net

-- ----------------------------------------------------------------------------
-- 8. PAYMENTS
-- ----------------------------------------------------------------------------
INSERT INTO payments (id, order_id, customer_id, amount, payment_method, payment_status, transaction_id, created_at) VALUES
(1, 1, 6, 185.99, 'Credit Card (Visa)', 'completed', 'TXN-902814-ALICE', '2026-10-15 10:31:00'),
(2, 2, 7, 137.50, 'UPI / Instant Bank', 'completed', 'TXN-382910-BOB', '2026-10-18 14:15:30'),
(3, 3, 8, 65.00, 'Credit Card (Mastercard)', 'completed', 'TXN-472019-CHARLIE', '2026-10-21 16:46:00');

-- ----------------------------------------------------------------------------
-- 9. RATINGS & REVIEWS
-- Customers rating products and vendors for delivered items
-- ----------------------------------------------------------------------------
INSERT INTO ratings (id, customer_id, vendor_id, product_id, order_id, rating, review_text, created_at) VALUES
(1, 6, 1, 1, 1, 5, 'Superior noise cancellation! TechZone packaged it with care and it arrived in 2 days.', '2026-10-17 09:20:00'),
(2, 6, 2, 5, 1, 5, 'The organic cotton feels incredibly soft and high quality. Fit is spot on.', '2026-10-17 11:45:00'),
(3, 7, 1, 2, 2, 4, 'Crisp tactile keystrokes and durable aluminum body. TechZone customer support answered questions quickly.', '2026-10-20 18:00:00');

-- ----------------------------------------------------------------------------
-- 10. NOTIFICATIONS
-- Realistic notifications across customer, vendor, and admin accounts
-- ----------------------------------------------------------------------------
INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at) VALUES
-- Admin notifications
(1, 1, 'New Vendor Registration Pending', 'Vendor "Artisan Leather Crafts" (Mateo Silva) submitted a registration application for review.', 'system', FALSE, '2026-10-22 08:30:00'),
(2, 1, 'Platform Commission Received', 'Earned $18.60 platform commission from Order #1.', 'payment', TRUE, '2026-10-15 10:31:00'),

-- Vendor 1 (TechZone - User 2) notifications
(3, 2, 'New Order Received', 'You received an order for 1x "Pro Wireless Noise-Cancelling Headphones" (Order #1). Net payout: $116.99.', 'order', TRUE, '2026-10-15 10:30:00'),
(4, 2, 'Low Stock Warning!', 'Product "Ultra-Slim RGB Mechanical Keyboard" is running low (Remaining stock: 3 units). Restock recommended.', 'inventory', FALSE, '2026-10-18 14:15:00'),
(5, 2, '5-Star Customer Review', 'Alice Walker rated "Pro Wireless Noise-Cancelling Headphones" 5/5 stars!', 'system', TRUE, '2026-10-17 09:20:00'),

-- Vendor 2 (Urban Chic - User 3) notifications
(6, 3, 'Low Stock Warning!', 'Product "Water-Resistant Commuter City Backpack" is running low (Remaining stock: 2 units). Restock recommended.', 'inventory', FALSE, '2026-10-21 16:45:00'),
(7, 3, 'New Order Received', 'You received an order for 1x "Water-Resistant Commuter City Backpack" (Order #3). Net payout: $58.50.', 'order', FALSE, '2026-10-21 16:45:00'),

-- Vendor 3 (Nordic Living - User 4) notifications
(8, 4, 'Low Stock Warning!', 'Product "Ultrasonic Ceramic Aroma Diffuser (500ml)" has only 1 unit left in inventory.', 'inventory', FALSE, '2026-10-22 12:00:00'),

-- Customer (Alice - User 6) notifications
(9, 6, 'Order Confirmed', 'Your Order #1 totaling $185.99 has been confirmed and paid.', 'payment', TRUE, '2026-10-15 10:31:00'),
(10, 6, 'Shipment Delivered', 'Items in Order #1 have been delivered by TechZone and Urban Chic.', 'order', TRUE, '2026-10-17 08:00:00');
