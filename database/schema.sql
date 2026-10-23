-- ============================================================================
-- MULTI-VENDOR MANAGEMENT SYSTEM (DBMS PROJECT)
-- Relational Database Schema: Tables, Constraints, Indexes, Triggers, Views, Procedures
-- DBMS Target: MySQL 8.0+
-- ============================================================================

CREATE DATABASE IF NOT EXISTS multivendor_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE multivendor_db;

-- ----------------------------------------------------------------------------
-- 1. DROP EXISTING OBJECTS (CLEAN SLATE EXECUTION)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_after_order_item_insert;
DROP TRIGGER IF EXISTS trg_after_order_item_update;
DROP TRIGGER IF EXISTS trg_after_product_insert;

DROP VIEW IF EXISTS vw_monthly_platform_revenue;
DROP VIEW IF EXISTS vw_vendor_performance;
DROP VIEW IF EXISTS vw_low_stock_products;
DROP VIEW IF EXISTS vw_order_full_details;

DROP PROCEDURE IF EXISTS sp_approve_vendor;
DROP PROCEDURE IF EXISTS sp_reject_vendor;
DROP PROCEDURE IF EXISTS sp_restock_product;

DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS ratings;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS vendors;
DROP TABLE IF EXISTS users;

-- ----------------------------------------------------------------------------
-- 2. CORE USERS TABLE (Role-Based Authentication: Admin, Vendor, Customer)
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'vendor', 'customer') NOT NULL DEFAULT 'customer',
    phone VARCHAR(25) NULL,
    address TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_email (email),
    INDEX idx_users_role (role)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 3. VENDORS TABLE (Stores Vendor Profile, Approval Status, Commission & Earnings)
-- ----------------------------------------------------------------------------
CREATE TABLE vendors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    store_name VARCHAR(150) NOT NULL UNIQUE,
    store_description TEXT NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    commission_rate DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    total_earnings DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    banner_url VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_vendors_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_vendor_commission 
        CHECK (commission_rate >= 0.00 AND commission_rate <= 100.00),
    CONSTRAINT chk_vendor_earnings 
        CHECK (total_earnings >= 0.00),
    INDEX idx_vendors_status (status)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 4. PRODUCT CATEGORIES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NULL,
    icon VARCHAR(50) DEFAULT 'box',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 5. PRODUCTS TABLE (Vendor Catalog with Category Linking)
-- ----------------------------------------------------------------------------
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    vendor_id INT NOT NULL,
    category_id INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT NULL,
    price DECIMAL(10,2) NOT NULL,
    image_url VARCHAR(500) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_products_vendor
        FOREIGN KEY (vendor_id) REFERENCES vendors(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_products_category
        FOREIGN KEY (category_id) REFERENCES categories(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_product_price 
        CHECK (price >= 0.00),
    INDEX idx_products_vendor (vendor_id),
    INDEX idx_products_category (category_id),
    INDEX idx_products_active (is_active)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 6. INVENTORY TABLE (Atomic Stock Tracking, Low-Stock Alert Limits)
-- ----------------------------------------------------------------------------
CREATE TABLE inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL UNIQUE,
    stock_quantity INT NOT NULL DEFAULT 0,
    low_stock_threshold INT NOT NULL DEFAULT 5,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_inventory_product
        FOREIGN KEY (product_id) REFERENCES products(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_stock_non_negative 
        CHECK (stock_quantity >= 0),
    CONSTRAINT chk_threshold_non_negative 
        CHECK (low_stock_threshold >= 0),
    INDEX idx_inventory_stock (stock_quantity)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 7. ORDERS TABLE (Consolidated Customer Checkout Header)
-- ----------------------------------------------------------------------------
CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    total_amount DECIMAL(12,2) NOT NULL,
    shipping_address TEXT NOT NULL,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'card',
    status ENUM('pending', 'paid', 'processing', 'completed', 'cancelled') NOT NULL DEFAULT 'paid',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_orders_customer
        FOREIGN KEY (customer_id) REFERENCES users(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_order_total 
        CHECK (total_amount >= 0.00),
    INDEX idx_orders_customer (customer_id),
    INDEX idx_orders_status (status),
    INDEX idx_orders_created (created_at)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 8. ORDER ITEMS TABLE (Split Per Vendor: Payout, Commission & Sub-Order Status)
-- ----------------------------------------------------------------------------
CREATE TABLE order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    vendor_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    platform_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    vendor_earnings DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    status ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_order_items_order
        FOREIGN KEY (order_id) REFERENCES orders(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_order_items_product
        FOREIGN KEY (product_id) REFERENCES products(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_order_items_vendor
        FOREIGN KEY (vendor_id) REFERENCES vendors(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_item_quantity 
        CHECK (quantity > 0),
    CONSTRAINT chk_item_prices 
        CHECK (unit_price >= 0.00 AND subtotal >= 0.00),
    INDEX idx_order_items_order (order_id),
    INDEX idx_order_items_vendor (vendor_id),
    INDEX idx_order_items_product (product_id),
    INDEX idx_order_items_status (status)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 9. PAYMENTS TABLE (Financial Transactions & Verification)
-- ----------------------------------------------------------------------------
CREATE TABLE payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    customer_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    payment_status ENUM('pending', 'completed', 'failed', 'refunded') NOT NULL DEFAULT 'completed',
    transaction_id VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payments_order
        FOREIGN KEY (order_id) REFERENCES orders(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_payments_customer
        FOREIGN KEY (customer_id) REFERENCES users(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_payment_amount 
        CHECK (amount >= 0.00),
    INDEX idx_payments_order (order_id),
    INDEX idx_payments_status (payment_status)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 10. RATINGS & REVIEWS TABLE (Customer Vendor/Product Feedback)
-- ----------------------------------------------------------------------------
CREATE TABLE ratings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    vendor_id INT NOT NULL,
    product_id INT NOT NULL,
    order_id INT NULL,
    rating INT NOT NULL,
    review_text TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ratings_customer
        FOREIGN KEY (customer_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_ratings_vendor
        FOREIGN KEY (vendor_id) REFERENCES vendors(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_ratings_product
        FOREIGN KEY (product_id) REFERENCES products(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_ratings_order
        FOREIGN KEY (order_id) REFERENCES orders(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_rating_range 
        CHECK (rating >= 1 AND rating <= 5),
    CONSTRAINT uq_customer_product_order
        UNIQUE (customer_id, product_id, order_id),
    INDEX idx_ratings_vendor (vendor_id),
    INDEX idx_ratings_product (product_id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 11. NOTIFICATIONS TABLE (Alerts for Orders, Low-Stock, Payouts, Admin Actions)
-- ----------------------------------------------------------------------------
CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('order', 'inventory', 'payment', 'system') NOT NULL DEFAULT 'order',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_notifications_user_read (user_id, is_read),
    INDEX idx_notifications_created (created_at)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 12. TRIGGERS (AUTOMATION & RELATIONAL INTEGRITY)
-- ----------------------------------------------------------------------------

DELIMITER $$

-- Trigger 1: Auto Stock Deduction & Low-Stock Alert Generation on Order Item Placement
CREATE TRIGGER trg_after_order_item_insert
AFTER INSERT ON order_items
FOR EACH ROW
BEGIN
    DECLARE v_current_stock INT;
    DECLARE v_threshold INT;
    DECLARE v_prod_name VARCHAR(200);
    DECLARE v_vendor_user_id INT;

    -- 1. Deduct Stock from Inventory
    UPDATE inventory 
    SET stock_quantity = stock_quantity - NEW.quantity
    WHERE product_id = NEW.product_id;

    -- 2. Fetch updated stock, threshold, product name and vendor user ID
    SELECT i.stock_quantity, i.low_stock_threshold, p.name, v.user_id
    INTO v_current_stock, v_threshold, v_prod_name, v_vendor_user_id
    FROM inventory i
    JOIN products p ON p.id = i.product_id
    JOIN vendors v ON v.id = p.vendor_id
    WHERE i.product_id = NEW.product_id;

    -- 3. Check for Low Stock Condition and Trigger Alert Notification
    IF v_current_stock <= v_threshold THEN
        INSERT INTO notifications (user_id, title, message, type)
        VALUES (
            v_vendor_user_id,
            'Low Stock Warning!',
            CONCAT('Product "', v_prod_name, '" is running low (Remaining stock: ', v_current_stock, ' units). Please restock soon.'),
            'inventory'
        );
    END IF;

    -- 4. Credit Vendor Cumulative Earnings
    UPDATE vendors
    SET total_earnings = total_earnings + NEW.vendor_earnings
    WHERE id = NEW.vendor_id;

    -- 5. Send Order Notification to Vendor
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (
        v_vendor_user_id,
        'New Order Received',
        CONCAT('You received an order for ', NEW.quantity, 'x "', v_prod_name, '" (Order #', NEW.order_id, '). Net Payout: $', NEW.vendor_earnings),
        'order'
    );
END$$

-- Trigger 2: Order Item Cancellation - Restore Stock & Adjust Vendor Earnings
CREATE TRIGGER trg_after_order_item_update
AFTER UPDATE ON order_items
FOR EACH ROW
BEGIN
    DECLARE v_prod_name VARCHAR(200);
    DECLARE v_vendor_user_id INT;
    DECLARE v_customer_user_id INT;

    -- Check if status transitioned to 'cancelled'
    IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
        -- 1. Restore inventory stock
        UPDATE inventory 
        SET stock_quantity = stock_quantity + OLD.quantity
        WHERE product_id = OLD.product_id;

        -- 2. Reverse vendor cumulative earnings
        UPDATE vendors
        SET total_earnings = GREATEST(0.00, total_earnings - OLD.vendor_earnings)
        WHERE id = OLD.vendor_id;

        -- 3. Lookup details for notifications
        SELECT p.name, v.user_id, o.customer_id
        INTO v_prod_name, v_vendor_user_id, v_customer_user_id
        FROM products p
        JOIN vendors v ON v.id = p.vendor_id
        JOIN orders o ON o.id = NEW.order_id
        WHERE p.id = NEW.product_id;

        -- 4. Notify Vendor
        INSERT INTO notifications (user_id, title, message, type)
        VALUES (
            v_vendor_user_id,
            'Item Cancelled & Stock Restored',
            CONCAT('Order item for "', v_prod_name, '" (Order #', NEW.order_id, ') was cancelled. Stock refunded.'),
            'order'
        );

        -- 5. Notify Customer
        INSERT INTO notifications (user_id, title, message, type)
        VALUES (
            v_customer_user_id,
            'Order Item Cancelled',
            CONCAT('Your order item "', v_prod_name, '" (Order #', NEW.order_id, ') has been cancelled.'),
            'order'
        );
    END IF;
END$$

-- Trigger 3: Automatically initialize Inventory record whenever a product is created
CREATE TRIGGER trg_after_product_insert
AFTER INSERT ON products
FOR EACH ROW
BEGIN
    INSERT INTO inventory (product_id, stock_quantity, low_stock_threshold)
    VALUES (NEW.id, 10, 5)
    ON DUPLICATE KEY UPDATE product_id = NEW.id;
END$$

DELIMITER ;

-- ----------------------------------------------------------------------------
-- 13. VIEWS (ADVANCED REPORTING & ANALYTICS)
-- ----------------------------------------------------------------------------

-- View 1: Vendor Performance Analytics (Orders, Gross, Commission, Net, Rating)
CREATE OR REPLACE VIEW vw_vendor_performance AS
SELECT 
    v.id AS vendor_id,
    v.store_name,
    v.status AS vendor_status,
    u.name AS owner_name,
    u.email AS owner_email,
    COUNT(DISTINCT oi.order_id) AS total_orders,
    COALESCE(SUM(oi.quantity), 0) AS total_units_sold,
    COALESCE(SUM(oi.subtotal), 0.00) AS gross_sales,
    COALESCE(SUM(oi.platform_fee), 0.00) AS total_commission_paid,
    COALESCE(SUM(oi.vendor_earnings), 0.00) AS net_earnings,
    COALESCE(ROUND(AVG(r.rating), 2), 0.00) AS avg_rating,
    COUNT(DISTINCT r.id) AS review_count
FROM vendors v
JOIN users u ON u.id = v.user_id
LEFT JOIN order_items oi ON oi.vendor_id = v.id AND oi.status <> 'cancelled'
LEFT JOIN ratings r ON r.vendor_id = v.id
GROUP BY v.id, v.store_name, v.status, u.name, u.email;

-- View 2: Low-Stock Inventory Alerts View
CREATE OR REPLACE VIEW vw_low_stock_products AS
SELECT 
    p.id AS product_id,
    p.name AS product_name,
    c.name AS category_name,
    v.id AS vendor_id,
    v.store_name,
    u.email AS vendor_email,
    i.stock_quantity,
    i.low_stock_threshold,
    (i.low_stock_threshold - i.stock_quantity) AS deficit_quantity,
    i.last_updated
FROM products p
JOIN categories c ON c.id = p.category_id
JOIN vendors v ON v.id = p.vendor_id
JOIN users u ON u.id = v.user_id
JOIN inventory i ON i.product_id = p.id
WHERE i.stock_quantity <= i.low_stock_threshold;

-- View 3: Monthly Platform Revenue Aggregates
CREATE OR REPLACE VIEW vw_monthly_platform_revenue AS
SELECT 
    DATE_FORMAT(o.created_at, '%Y-%m') AS sales_month,
    COUNT(DISTINCT o.id) AS total_orders,
    SUM(oi.subtotal) AS gross_merchandise_value,
    SUM(oi.platform_fee) AS platform_commission_revenue,
    SUM(oi.vendor_earnings) AS total_vendor_payouts
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE o.status <> 'cancelled' AND oi.status <> 'cancelled'
GROUP BY DATE_FORMAT(o.created_at, '%Y-%m')
ORDER BY sales_month DESC;

-- View 4: Comprehensive Order Details Consolidated View
CREATE OR REPLACE VIEW vw_order_full_details AS
SELECT 
    o.id AS order_id,
    o.created_at AS order_date,
    o.status AS order_status,
    u.id AS customer_id,
    u.name AS customer_name,
    u.email AS customer_email,
    oi.id AS item_id,
    p.id AS product_id,
    p.name AS product_name,
    v.id AS vendor_id,
    v.store_name,
    oi.quantity,
    oi.unit_price,
    oi.subtotal,
    oi.platform_fee,
    oi.vendor_earnings,
    oi.status AS item_status,
    pay.payment_method,
    pay.payment_status,
    pay.transaction_id
FROM orders o
JOIN users u ON u.id = o.customer_id
JOIN order_items oi ON oi.order_id = o.id
JOIN products p ON p.id = oi.product_id
JOIN vendors v ON v.id = oi.vendor_id
LEFT JOIN payments pay ON pay.order_id = o.id;

-- ----------------------------------------------------------------------------
-- 14. STORED PROCEDURES (BUSINESS LOGIC EXECUTION)
-- ----------------------------------------------------------------------------

DELIMITER $$

-- Procedure 1: Approve Vendor Application with Notification
CREATE PROCEDURE sp_approve_vendor(
    IN p_vendor_id INT,
    IN p_admin_id INT
)
BEGIN
    DECLARE v_user_id INT;
    DECLARE v_store_name VARCHAR(150);

    SELECT user_id, store_name INTO v_user_id, v_store_name
    FROM vendors WHERE id = p_vendor_id;

    IF v_user_id IS NOT NULL THEN
        UPDATE vendors 
        SET status = 'approved', updated_at = CURRENT_TIMESTAMP
        WHERE id = p_vendor_id;

        INSERT INTO notifications (user_id, title, message, type)
        VALUES (
            v_user_id,
            'Vendor Application Approved!',
            CONCAT('Congratulations! Your vendor store "', v_store_name, '" has been approved. You can now publish products and accept orders.'),
            'system'
        );
    END IF;
END$$

-- Procedure 2: Reject Vendor Application with Notification
CREATE PROCEDURE sp_reject_vendor(
    IN p_vendor_id INT,
    IN p_admin_id INT,
    IN p_reason TEXT
)
BEGIN
    DECLARE v_user_id INT;
    DECLARE v_store_name VARCHAR(150);

    SELECT user_id, store_name INTO v_user_id, v_store_name
    FROM vendors WHERE id = p_vendor_id;

    IF v_user_id IS NOT NULL THEN
        UPDATE vendors 
        SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
        WHERE id = p_vendor_id;

        INSERT INTO notifications (user_id, title, message, type)
        VALUES (
            v_user_id,
            'Vendor Application Rejected',
            CONCAT('Your vendor store application for "', v_store_name, '" was not approved. Reason: ', COALESCE(p_reason, 'Information provided does not meet guidelines.')),
            'system'
        );
    END IF;
END$$

-- Procedure 3: Restock Inventory with Validation
CREATE PROCEDURE sp_restock_product(
    IN p_product_id INT,
    IN p_vendor_id INT,
    IN p_add_qty INT
)
BEGIN
    IF p_add_qty <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Restock quantity must be greater than zero.';
    END IF;

    -- Validate ownership
    IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id AND vendor_id = p_vendor_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unauthorized: Product does not belong to specified vendor.';
    END IF;

    UPDATE inventory 
    SET stock_quantity = stock_quantity + p_add_qty
    WHERE product_id = p_product_id;
END$$

DELIMITER ;
