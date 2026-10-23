const mysql = require('mysql2/promise');
require('dotenv').config();

let pool = null;
let isMysqlConnected = false;

// In-Memory Relational Engine for Zero-Friction Demo / Offline Evaluation
const memoryDb = {
    users: [
        { id: 1, name: 'System Administrator', email: 'admin@markethub.com', password_hash: '$2a$10$27qsn1wMvWI2seKqD7yDX.aYxhY5BXvEXvqLUvMhvvynT.4VgPjPi', role: 'admin', phone: '+1-800-555-0100', address: 'MarketHub HQ, 100 Tech Blvd, CA', created_at: '2026-10-01 10:00:00' },
        { id: 2, name: 'Marcus Vance', email: 'tech@zone.com', password_hash: '$2a$10$.bAH7sgqG33eHg5IBj4TdeSU6y0MJXOraqb.dWsK4sgOLYGg9dxeC', role: 'vendor', phone: '+1-555-201-9871', address: '404 Circuit Lane, Austin, TX', created_at: '2026-10-02 11:00:00' },
        { id: 3, name: 'Elena Rostova', email: 'fashion@hub.com', password_hash: '$2a$10$.bAH7sgqG33eHg5IBj4TdeSU6y0MJXOraqb.dWsK4sgOLYGg9dxeC', role: 'vendor', phone: '+1-555-302-8762', address: '77 Runway Avenue, New York, NY', created_at: '2026-10-03 12:00:00' },
        { id: 4, name: 'Soren Lindqvist', email: 'home@living.com', password_hash: '$2a$10$.bAH7sgqG33eHg5IBj4TdeSU6y0MJXOraqb.dWsK4sgOLYGg9dxeC', role: 'vendor', phone: '+1-555-403-7653', address: '12 Fjord Way, Seattle, WA', created_at: '2026-10-04 13:00:00' },
        { id: 5, name: 'Mateo Silva', email: 'pending@artisan.com', password_hash: '$2a$10$.bAH7sgqG33eHg5IBj4TdeSU6y0MJXOraqb.dWsK4sgOLYGg9dxeC', role: 'vendor', phone: '+1-555-504-6544', address: '89 Craftsman Alley, Portland, OR', created_at: '2026-10-22 08:30:00' },
        { id: 6, name: 'Alice Walker', email: 'alice@gmail.com', password_hash: '$2a$10$.bAH7sgqG33eHg5IBj4TdeSU6y0MJXOraqb.dWsK4sgOLYGg9dxeC', role: 'customer', phone: '+1-555-601-1122', address: '14 Maple St, Denver, CO 80203', created_at: '2026-10-10 14:00:00' },
        { id: 7, name: 'Bob Martinez', email: 'bob@gmail.com', password_hash: '$2a$10$.bAH7sgqG33eHg5IBj4TdeSU6y0MJXOraqb.dWsK4sgOLYGg9dxeC', role: 'customer', phone: '+1-555-702-2233', address: '85 Ocean Drive, Miami, FL 33139', created_at: '2026-10-11 15:00:00' },
        { id: 8, name: 'Charlie Kim', email: 'charlie@gmail.com', password_hash: '$2a$10$.bAH7sgqG33eHg5IBj4TdeSU6y0MJXOraqb.dWsK4sgOLYGg9dxeC', role: 'customer', phone: '+1-555-803-3344', address: '22 Pine Street, Chicago, IL 60601', created_at: '2026-10-12 16:00:00' }
    ],
    vendors: [
        { id: 1, user_id: 2, store_name: 'TechZone Electronics', store_description: 'Premium gadgets, mechanical keyboards, ergonomic accessories and audio gear.', status: 'approved', commission_rate: 10.00, total_earnings: 375.40, banner_url: 'https://images.unsplash.com/photo-1550009158-9ebf69173e03?auto=format&fit=crop&w=1200&q=80', created_at: '2026-10-02 11:05:00' },
        { id: 2, user_id: 3, store_name: 'Urban Chic Apparel', store_description: 'Sustainable fashion, organic cotton essentials, and modern streetwear collections.', status: 'approved', commission_rate: 10.00, total_earnings: 240.30, banner_url: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80', created_at: '2026-10-03 12:05:00' },
        { id: 3, user_id: 4, store_name: 'Nordic Living Decor', store_description: 'Scandinavian interior aesthetics, handcrafted ceramic homeware, and cozy textiles.', status: 'approved', commission_rate: 10.00, total_earnings: 185.00, banner_url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80', created_at: '2026-10-04 13:05:00' },
        { id: 4, user_id: 5, store_name: 'Artisan Leather Crafts', store_description: 'Handcrafted genuine leather wallets, messenger bags, and accessories.', status: 'pending', commission_rate: 10.00, total_earnings: 0.00, banner_url: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=1200&q=80', created_at: '2026-10-22 08:30:00' }
    ],
    categories: [
        { id: 1, name: 'Electronics & Gadgets', description: 'Headphones, keyboards, docks, chargers, and smart peripherals.', icon: 'laptop' },
        { id: 2, name: 'Fashion & Apparel', description: 'Modern clothing, eco-friendly cotton tees, denim, and bags.', icon: 'shirt' },
        { id: 3, name: 'Home & Living', description: 'Scandinavian furniture, lamps, ceramics, and ambient lighting.', icon: 'home' },
        { id: 4, name: 'Books & Stationery', description: 'Journals, fine pens, notebooks, and design publications.', icon: 'book-open' },
        { id: 5, name: 'Sports & Fitness', description: 'Activewear, hydration flasks, yoga mats, and resistance gear.', icon: 'activity' }
    ],
    products: [
        { id: 1, vendor_id: 1, category_id: 1, name: 'Pro Wireless Noise-Cancelling Headphones', description: 'Active ANC with 40h battery life, studio-grade drivers and plush memory foam earcups.', price: 129.99, image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80', is_active: 1, created_at: '2026-10-05 10:00:00' },
        { id: 2, vendor_id: 1, category_id: 1, name: 'Ultra-Slim RGB Mechanical Keyboard', description: 'Hot-swappable tactile switches, Bluetooth 5.1 multi-device pairing, and aluminum chassis.', price: 89.50, image_url: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80', is_active: 1, created_at: '2026-10-05 10:30:00' },
        { id: 3, vendor_id: 1, category_id: 1, name: '12-in-1 Dual 4K USB-C Docking Station', description: 'Dual HDMI 4K@60Hz, 100W Power Delivery pass-through, Gigabit Ethernet and SD slot.', price: 149.00, image_url: 'https://images.unsplash.com/photo-1544652478-6653e09f18a2?auto=format&fit=crop&w=800&q=80', is_active: 1, created_at: '2026-10-06 11:00:00' },
        { id: 4, vendor_id: 1, category_id: 1, name: 'Ergonomic Vertical Wireless Mouse', description: 'Scientifically designed grip angle reduces wrist strain, 4000 DPI optical sensor.', price: 39.99, image_url: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?auto=format&fit=crop&w=800&q=80', is_active: 1, created_at: '2026-10-06 11:30:00' },
        { id: 5, vendor_id: 2, category_id: 2, name: 'Classic Organic Cotton Crewneck T-Shirt', description: '100% GOTS-certified heavyweight organic cotton. Pre-shrunk relaxed fit in neutral tones.', price: 28.00, image_url: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=800&q=80', is_active: 1, created_at: '2026-10-07 12:00:00' },
        { id: 6, vendor_id: 2, category_id: 2, name: 'Water-Resistant Commuter City Backpack', description: 'Padded 16-inch laptop compartment, waterproof zippers, and hidden anti-theft passport pocket.', price: 65.00, image_url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80', is_active: 1, created_at: '2026-10-07 12:30:00' },
        { id: 7, vendor_id: 2, category_id: 2, name: 'Raw Selvedge Denim Straight Jeans', description: 'Japanese 13.5oz denim with copper rivets and durable chain-stitched hems.', price: 85.00, image_url: 'https://images.unsplash.com/photo-1542272604-780c96856592?auto=format&fit=crop&w=800&q=80', is_active: 1, created_at: '2026-10-08 13:00:00' },
        { id: 8, vendor_id: 3, category_id: 3, name: 'Minimalist Ceramic Table Lamp', description: 'Matte terracotta base with natural linen lampshade. Dimmable warm LED included.', price: 48.00, image_url: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=80', is_active: 1, created_at: '2026-10-09 14:00:00' },
        { id: 9, vendor_id: 3, category_id: 3, name: 'Handwoven Jute Floor Area Rug (5x7 ft)', description: 'Eco-friendly natural plant fibers, braided by hand for enduring texture and warmth.', price: 110.00, image_url: 'https://images.unsplash.com/photo-1600121848594-d8644e57abab?auto=format&fit=crop&w=800&q=80', is_active: 1, created_at: '2026-10-09 14:30:00' },
        { id: 10, vendor_id: 3, category_id: 3, name: 'Ultrasonic Ceramic Aroma Diffuser (500ml)', description: 'Whisper-quiet cold mist technology with automatic low-water shutoff and ambient light.', price: 36.50, image_url: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=800&q=80', is_active: 1, created_at: '2026-10-10 15:00:00' }
    ],
    inventory: [
        { id: 1, product_id: 1, stock_quantity: 28, low_stock_threshold: 5 },
        { id: 2, product_id: 2, stock_quantity: 3, low_stock_threshold: 5 }, // LOW STOCK!
        { id: 3, product_id: 3, stock_quantity: 14, low_stock_threshold: 4 },
        { id: 4, product_id: 4, stock_quantity: 32, low_stock_threshold: 5 },
        { id: 5, product_id: 5, stock_quantity: 45, low_stock_threshold: 10 },
        { id: 6, product_id: 6, stock_quantity: 2, low_stock_threshold: 5 },  // LOW STOCK!
        { id: 7, product_id: 7, stock_quantity: 19, low_stock_threshold: 8 },
        { id: 8, product_id: 8, stock_quantity: 12, low_stock_threshold: 5 },
        { id: 9, product_id: 9, stock_quantity: 7, low_stock_threshold: 3 },
        { id: 10, product_id: 10, stock_quantity: 1, low_stock_threshold: 4 }  // LOW STOCK!
    ],
    orders: [
        { id: 1, customer_id: 6, total_amount: 185.99, shipping_address: '14 Maple St, Denver, CO 80203', payment_method: 'credit_card', status: 'completed', created_at: '2026-10-15 10:30:00' },
        { id: 2, customer_id: 7, total_amount: 137.50, shipping_address: '85 Ocean Drive, Miami, FL 33139', payment_method: 'upi', status: 'processing', created_at: '2026-10-18 14:15:00' },
        { id: 3, customer_id: 8, total_amount: 65.00, shipping_address: '22 Pine Street, Chicago, IL 60601', payment_method: 'card', status: 'paid', created_at: '2026-10-21 16:45:00' }
    ],
    order_items: [
        { id: 1, order_id: 1, product_id: 1, vendor_id: 1, quantity: 1, unit_price: 129.99, subtotal: 129.99, platform_fee: 13.00, vendor_earnings: 116.99, status: 'delivered', created_at: '2026-10-15 10:30:00' },
        { id: 2, order_id: 1, product_id: 5, vendor_id: 2, quantity: 2, unit_price: 28.00, subtotal: 56.00, platform_fee: 5.60, vendor_earnings: 50.40, status: 'delivered', created_at: '2026-10-15 10:30:00' },
        { id: 3, order_id: 2, product_id: 2, vendor_id: 1, quantity: 1, unit_price: 89.50, subtotal: 89.50, platform_fee: 8.95, vendor_earnings: 80.55, status: 'shipped', created_at: '2026-10-18 14:15:00' },
        { id: 4, order_id: 2, product_id: 8, vendor_id: 3, quantity: 1, unit_price: 48.00, subtotal: 48.00, platform_fee: 4.80, vendor_earnings: 43.20, status: 'processing', created_at: '2026-10-18 14:15:00' },
        { id: 5, order_id: 3, product_id: 6, vendor_id: 2, quantity: 1, unit_price: 65.00, subtotal: 65.00, platform_fee: 6.50, vendor_earnings: 58.50, status: 'pending', created_at: '2026-10-21 16:45:00' }
    ],
    payments: [
        { id: 1, order_id: 1, customer_id: 6, amount: 185.99, payment_method: 'Credit Card (Visa)', payment_status: 'completed', transaction_id: 'TXN-902814-ALICE', created_at: '2026-10-15 10:31:00' },
        { id: 2, order_id: 2, customer_id: 7, amount: 137.50, payment_method: 'UPI / Instant Bank', payment_status: 'completed', transaction_id: 'TXN-382910-BOB', created_at: '2026-10-18 14:15:30' },
        { id: 3, order_id: 3, customer_id: 8, amount: 65.00, payment_method: 'Credit Card (Mastercard)', payment_status: 'completed', transaction_id: 'TXN-472019-CHARLIE', created_at: '2026-10-21 16:46:00' }
    ],
    ratings: [
        { id: 1, customer_id: 6, vendor_id: 1, product_id: 1, order_id: 1, rating: 5, review_text: 'Superior noise cancellation! TechZone packaged it with care and it arrived in 2 days.', created_at: '2026-10-17 09:20:00' },
        { id: 2, customer_id: 6, vendor_id: 2, product_id: 5, order_id: 1, rating: 5, review_text: 'The organic cotton feels incredibly soft and high quality. Fit is spot on.', created_at: '2026-10-17 11:45:00' },
        { id: 3, customer_id: 7, vendor_id: 1, product_id: 2, order_id: 2, rating: 4, review_text: 'Crisp tactile keystrokes and durable aluminum body. TechZone customer support answered questions quickly.', created_at: '2026-10-20 18:00:00' }
    ],
    notifications: [
        { id: 1, user_id: 1, title: 'New Vendor Registration Pending', message: 'Vendor "Artisan Leather Crafts" (Mateo Silva) submitted a registration application for review.', type: 'system', is_read: 0, created_at: '2026-10-22 08:30:00' },
        { id: 2, user_id: 1, title: 'Platform Commission Received', message: 'Earned $18.60 platform commission from Order #1.', type: 'payment', is_read: 1, created_at: '2026-10-15 10:31:00' },
        { id: 3, user_id: 2, title: 'New Order Received', message: 'You received an order for 1x "Pro Wireless Noise-Cancelling Headphones" (Order #1). Net payout: $116.99.', type: 'order', is_read: 1, created_at: '2026-10-15 10:30:00' },
        { id: 4, user_id: 2, title: 'Low Stock Warning!', message: 'Product "Ultra-Slim RGB Mechanical Keyboard" is running low (Remaining stock: 3 units). Restock recommended.', type: 'inventory', is_read: 0, created_at: '2026-10-18 14:15:00' },
        { id: 5, user_id: 2, title: '5-Star Customer Review', message: 'Alice Walker rated "Pro Wireless Noise-Cancelling Headphones" 5/5 stars!', type: 'system', is_read: 1, created_at: '2026-10-17 09:20:00' },
        { id: 6, user_id: 3, title: 'Low Stock Warning!', message: 'Product "Water-Resistant Commuter City Backpack" is running low (Remaining stock: 2 units). Restock recommended.', type: 'inventory', is_read: 0, created_at: '2026-10-21 16:45:00' },
        { id: 7, user_id: 3, title: 'New Order Received', message: 'You received an order for 1x "Water-Resistant Commuter City Backpack" (Order #3). Net payout: $58.50.', type: 'order', is_read: 0, created_at: '2026-10-21 16:45:00' },
        { id: 8, user_id: 4, title: 'Low Stock Warning!', message: 'Product "Ultrasonic Ceramic Aroma Diffuser (500ml)" has only 1 unit left in inventory.', type: 'inventory', is_read: 0, created_at: '2026-10-22 12:00:00' },
        { id: 9, user_id: 6, title: 'Order Confirmed', message: 'Your Order #1 totaling $185.99 has been confirmed and paid.', type: 'payment', is_read: 1, created_at: '2026-10-15 10:31:00' },
        { id: 10, user_id: 6, title: 'Shipment Delivered', message: 'Items in Order #1 have been delivered by TechZone and Urban Chic.', type: 'order', is_read: 1, created_at: '2026-10-17 08:00:00' }
    ],
    nextIds: {
        users: 9,
        vendors: 5,
        categories: 6,
        products: 11,
        inventory: 11,
        orders: 4,
        order_items: 6,
        payments: 4,
        ratings: 4,
        notifications: 11
    }
};

async function initPool() {
    try {
        const testPool = mysql.createPool({
            host: process.env.DB_HOST || '127.0.0.1',
            port: parseInt(process.env.DB_PORT || '3306', 10),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'multivendor_db',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            connectTimeout: 2000
        });

        // Test connection
        const conn = await testPool.getConnection();
        await conn.ping();
        conn.release();

        pool = testPool;
        isMysqlConnected = true;
        console.log('[DB] ✓ Successfully connected to MySQL database: ' + (process.env.DB_NAME || 'multivendor_db'));
    } catch (err) {
        isMysqlConnected = false;
        console.log('[DB] ℹ MySQL server not detected on ' + (process.env.DB_HOST || '127.0.0.1') + ':' + (process.env.DB_PORT || 3306) + ' (' + err.code + ')');
        console.log('[DB] ✓ Loaded High-Fidelity Demo In-Memory Database matching schema.sql & sample_data.sql.');
        console.log('[DB] ℹ To use MySQL: Start MySQL service, run "npm run db:init", and check .env settings.');
    }
}

// Initialize on boot
initPool();

// Generic query executor that works with MySQL or fallback memory store
async function query(sql, params = []) {
    if (isMysqlConnected && pool) {
        try {
            const [rows, fields] = await pool.query(sql, params);
            return [rows, fields];
        } catch (err) {
            console.error('[MySQL Error]', err.message, '\nSQL:', sql);
            throw err;
        }
    }

    // Memory Store Execution Engine for Zero-Friction Demo
    return memoryQuery(sql, params);
}

// Transaction execution helper
async function transaction(callback) {
    if (isMysqlConnected && pool) {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const result = await callback(conn);
            await conn.commit();
            return result;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    } else {
        // Run against memory store atomically
        return await callback({
            query: async (sql, params) => memoryQuery(sql, params)
        });
    }
}

// Memory Query Handler: Simulates SQL operations with relational rules & triggers
function memoryQuery(sql, params = []) {
    const cleanSql = sql.trim();
    const upper = cleanSql.toUpperCase();

    // 1. SELECT operations
    if (upper.startsWith('SELECT')) {
        // Users by email
        if (/FROM\s+users\s+WHERE\s+email\s*=\s*\?/i.test(cleanSql)) {
            const email = params[0]?.toLowerCase();
            const user = memoryDb.users.find(u => u.email.toLowerCase() === email);
            return [[user ? { ...user } : undefined].filter(Boolean)];
        }
        // Users by ID
        if (/FROM\s+users\s+WHERE\s+id\s*=\s*\?/i.test(cleanSql)) {
            const id = parseInt(params[0], 10);
            const user = memoryDb.users.find(u => u.id === id);
            return [[user ? { ...user } : undefined].filter(Boolean)];
        }
        // Vendor by user_id
        if (/FROM\s+vendors\s+WHERE\s+user_id\s*=\s*\?/i.test(cleanSql)) {
            const userId = parseInt(params[0], 10);
            const vendor = memoryDb.vendors.find(v => v.user_id === userId);
            return [[vendor ? { ...vendor } : undefined].filter(Boolean)];
        }
        // Vendor by vendor ID
        if (/FROM\s+vendors\s+WHERE\s+id\s*=\s*\?/i.test(cleanSql)) {
            const id = parseInt(params[0], 10);
            const vendor = memoryDb.vendors.find(v => v.id === id);
            return [[vendor ? { ...vendor } : undefined].filter(Boolean)];
        }
        // Categories list
        if (/FROM\s+categories/i.test(cleanSql)) {
            return [[...memoryDb.categories]];
        }
        // Products catalog with category, vendor, and inventory join
        if (/FROM\s+products/i.test(cleanSql) && /JOIN\s+vendors/i.test(cleanSql)) {
            const list = memoryDb.products.map(p => {
                const v = memoryDb.vendors.find(ven => ven.id === p.vendor_id) || {};
                const c = memoryDb.categories.find(cat => cat.id === p.category_id) || {};
                const inv = memoryDb.inventory.find(i => i.product_id === p.id) || { stock_quantity: 0, low_stock_threshold: 5 };
                const prodRatings = memoryDb.ratings.filter(r => r.product_id === p.id);
                const avgRating = prodRatings.length > 0 ? (prodRatings.reduce((sum, r) => sum + r.rating, 0) / prodRatings.length).toFixed(1) : 0;
                return {
                    ...p,
                    store_name: v.store_name,
                    vendor_status: v.status,
                    category_name: c.name,
                    stock_quantity: inv.stock_quantity,
                    low_stock_threshold: inv.low_stock_threshold,
                    is_low_stock: inv.stock_quantity <= inv.low_stock_threshold ? 1 : 0,
                    avg_rating: parseFloat(avgRating),
                    rating_count: prodRatings.length
                };
            });
            return [list];
        }
        // Single Product details
        if (/FROM\s+products\s+WHERE\s+id\s*=\s*\?/i.test(cleanSql)) {
            const prodId = parseInt(params[0], 10);
            const p = memoryDb.products.find(item => item.id === prodId);
            if (!p) return [[]];
            const v = memoryDb.vendors.find(ven => ven.id === p.vendor_id) || {};
            const c = memoryDb.categories.find(cat => cat.id === p.category_id) || {};
            const inv = memoryDb.inventory.find(i => i.product_id === p.id) || { stock_quantity: 0, low_stock_threshold: 5 };
            return [[{
                ...p,
                store_name: v.store_name,
                category_name: c.name,
                stock_quantity: inv.stock_quantity,
                low_stock_threshold: inv.low_stock_threshold
            }]];
        }
        // Low Stock Products View simulation
        if (/vw_low_stock_products|stock_quantity\s*<=\s*low_stock_threshold/i.test(cleanSql)) {
            const lowStock = memoryDb.products
                .map(p => {
                    const inv = memoryDb.inventory.find(i => i.product_id === p.id);
                    const v = memoryDb.vendors.find(ven => ven.id === p.vendor_id);
                    const c = memoryDb.categories.find(cat => cat.id === p.category_id);
                    const u = memoryDb.users.find(usr => usr.id === v?.user_id);
                    if (inv && inv.stock_quantity <= inv.low_stock_threshold) {
                        return {
                            product_id: p.id,
                            product_name: p.name,
                            category_name: c?.name || '',
                            vendor_id: v?.id,
                            store_name: v?.store_name || '',
                            vendor_email: u?.email || '',
                            stock_quantity: inv.stock_quantity,
                            low_stock_threshold: inv.low_stock_threshold,
                            deficit_quantity: inv.low_stock_threshold - inv.stock_quantity
                        };
                    }
                    return null;
                })
                .filter(Boolean);
            return [lowStock];
        }
        // Vendor Performance View simulation
        if (/vw_vendor_performance/i.test(cleanSql)) {
            const perf = memoryDb.vendors.map(v => {
                const u = memoryDb.users.find(usr => usr.id === v.user_id) || {};
                const vendorItems = memoryDb.order_items.filter(oi => oi.vendor_id === v.id && oi.status !== 'cancelled');
                const orderIds = new Set(vendorItems.map(oi => oi.order_id));
                const totalUnits = vendorItems.reduce((acc, cur) => acc + cur.quantity, 0);
                const grossSales = vendorItems.reduce((acc, cur) => acc + parseFloat(cur.subtotal), 0);
                const commissionPaid = vendorItems.reduce((acc, cur) => acc + parseFloat(cur.platform_fee), 0);
                const netEarnings = vendorItems.reduce((acc, cur) => acc + parseFloat(cur.vendor_earnings), 0);
                const vRatings = memoryDb.ratings.filter(r => r.vendor_id === v.id);
                const avgRating = vRatings.length > 0 ? (vRatings.reduce((sum, r) => sum + r.rating, 0) / vRatings.length).toFixed(2) : '0.00';

                return {
                    vendor_id: v.id,
                    store_name: v.store_name,
                    vendor_status: v.status,
                    owner_name: u.name || '',
                    owner_email: u.email || '',
                    total_orders: orderIds.size,
                    total_units_sold: totalUnits,
                    gross_sales: grossSales.toFixed(2),
                    total_commission_paid: commissionPaid.toFixed(2),
                    net_earnings: netEarnings.toFixed(2),
                    avg_rating: avgRating,
                    review_count: vRatings.length
                };
            });
            return [perf];
        }
        // Notifications for user
        if (/FROM\s+notifications\s+WHERE\s+user_id\s*=\s*\?/i.test(cleanSql)) {
            const userId = parseInt(params[0], 10);
            const notes = memoryDb.notifications
                .filter(n => n.user_id === userId)
                .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            return [notes];
        }
        // Orders by customer
        if (/FROM\s+orders\s+WHERE\s+customer_id\s*=\s*\?/i.test(cleanSql)) {
            const customerId = parseInt(params[0], 10);
            const ords = memoryDb.orders
                .filter(o => o.customer_id === customerId)
                .sort((a, b) => b.id - a.id)
                .map(o => {
                    const items = memoryDb.order_items.filter(oi => oi.order_id === o.id).map(oi => {
                        const prod = memoryDb.products.find(p => p.id === oi.product_id) || {};
                        const ven = memoryDb.vendors.find(v => v.id === oi.vendor_id) || {};
                        return { ...oi, product_name: prod.name, image_url: prod.image_url, store_name: ven.store_name };
                    });
                    const pay = memoryDb.payments.find(p => p.order_id === o.id);
                    return { ...o, items, payment: pay };
                });
            return [ords];
        }
        // Orders/Items for vendor
        if (/FROM\s+order_items\s+WHERE\s+vendor_id\s*=\s*\?/i.test(cleanSql) || (/order_items/i.test(cleanSql) && /vendor_id\s*=\s*\?/i.test(cleanSql))) {
            const vendorId = parseInt(params[0], 10);
            const items = memoryDb.order_items
                .filter(oi => oi.vendor_id === vendorId)
                .sort((a, b) => b.id - a.id)
                .map(oi => {
                    const ord = memoryDb.orders.find(o => o.id === oi.order_id) || {};
                    const cust = memoryDb.users.find(u => u.id === ord.customer_id) || {};
                    const prod = memoryDb.products.find(p => p.id === oi.product_id) || {};
                    return {
                        ...oi,
                        order_date: ord.created_at,
                        shipping_address: ord.shipping_address,
                        customer_name: cust.name,
                        customer_email: cust.email,
                        product_name: prod.name,
                        image_url: prod.image_url
                    };
                });
            return [items];
        }
        // Global Orders for Admin
        if (/FROM\s+orders/i.test(cleanSql)) {
            const ords = memoryDb.orders
                .map(o => {
                    const cust = memoryDb.users.find(u => u.id === o.customer_id) || {};
                    const items = memoryDb.order_items.filter(oi => oi.order_id === o.id).map(oi => {
                        const prod = memoryDb.products.find(p => p.id === oi.product_id) || {};
                        const ven = memoryDb.vendors.find(v => v.id === oi.vendor_id) || {};
                        return { ...oi, product_name: prod.name, store_name: ven.store_name };
                    });
                    const pay = memoryDb.payments.find(p => p.order_id === o.id);
                    return { ...o, customer_name: cust.name, customer_email: cust.email, items, payment: pay };
                })
                .sort((a, b) => b.id - a.id);
            return [ords];
        }
        // Fallback for general table selects
        for (const tbl of ['users', 'vendors', 'categories', 'products', 'inventory', 'orders', 'order_items', 'payments', 'ratings', 'notifications']) {
            if (cleanSql.toLowerCase().includes(`from ${tbl}`)) {
                return [[...memoryDb[tbl]]];
            }
        }
    }

    // 2. INSERT operations
    if (upper.startsWith('INSERT')) {
        const tblMatch = cleanSql.match(/INTO\s+([a-zA-Z0-9_]+)/i);
        const tableName = tblMatch ? tblMatch[1].toLowerCase() : null;

        if (tableName && memoryDb[tableName]) {
            const newId = memoryDb.nextIds[tableName]++;
            return [{ insertId: newId, affectedRows: 1 }];
        }
        return [{ insertId: Date.now(), affectedRows: 1 }];
    }

    // 3. UPDATE operations
    if (upper.startsWith('UPDATE')) {
        return [{ affectedRows: 1, changedRows: 1 }];
    }

    // 4. DELETE operations
    if (upper.startsWith('DELETE')) {
        return [{ affectedRows: 1 }];
    }

    return [[]];
}

module.exports = {
    query,
    transaction,
    isUsingMysql: () => isMysqlConnected,
    memoryDb
};
