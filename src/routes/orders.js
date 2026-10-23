const express = require('express');
const router = express.Router();
const db = require('../../database/db');
const config = require('../config/config');
const { authenticateToken, requireRole } = require('../middleware/auth');

// POST /api/orders/checkout (Customer places order with auto stock deduction & vendor splitting)
router.post('/checkout', authenticateToken, requireRole('customer'), async (req, res) => {
    try {
        const customerId = req.user.id;
        const { items, shipping_address, payment_method = 'credit_card' } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Cart is empty. Please add items to checkout.' });
        }
        if (!shipping_address || !shipping_address.trim()) {
            return res.status(400).json({ success: false, message: 'Shipping address is required.' });
        }

        // Use transaction for atomic consistency
        if (db.isUsingMysql()) {
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();

                let calculatedTotal = 0.00;
                const processedItems = [];

                // Step 1: Pre-validation & Stock Lock Check (Prevent Overselling)
                for (const item of items) {
                    const prodId = parseInt(item.product_id, 10);
                    const qty = parseInt(item.quantity, 10);

                    if (qty <= 0) {
                        await conn.rollback();
                        conn.release();
                        return res.status(400).json({ success: false, message: 'Invalid item quantity.' });
                    }

                    // Select product & inventory with FOR UPDATE to prevent race conditions
                    const [rows] = await conn.query(`
                        SELECT p.id, p.name, p.price, p.vendor_id, p.is_active,
                               i.stock_quantity, i.low_stock_threshold,
                               v.store_name, v.user_id AS vendor_user_id, v.commission_rate
                        FROM products p
                        JOIN vendors v ON v.id = p.vendor_id
                        JOIN inventory i ON i.product_id = p.id
                        WHERE p.id = ? FOR UPDATE
                    `, [prodId]);

                    if (!rows || rows.length === 0) {
                        await conn.rollback();
                        conn.release();
                        return res.status(404).json({ success: false, message: `Product ID #${prodId} was not found.` });
                    }

                    const product = rows[0];
                    if (!product.is_active) {
                        await conn.rollback();
                        conn.release();
                        return res.status(400).json({ success: false, message: `Product "${product.name}" is no longer available.` });
                    }

                    if (product.stock_quantity < qty) {
                        await conn.rollback();
                        conn.release();
                        return res.status(400).json({
                            success: false,
                            message: `Insufficient stock for "${product.name}". Only ${product.stock_quantity} available, but you requested ${qty}.`
                        });
                    }

                    const unitPrice = parseFloat(product.price);
                    const subtotal = parseFloat((unitPrice * qty).toFixed(2));
                    const commRate = parseFloat(product.commission_rate || config.PLATFORM_COMMISSION_PERCENT);
                    const platformFee = parseFloat(((subtotal * commRate) / 100).toFixed(2));
                    const vendorEarnings = parseFloat((subtotal - platformFee).toFixed(2));

                    calculatedTotal += subtotal;

                    processedItems.push({
                        productId: prodId,
                        productName: product.name,
                        vendorId: product.vendor_id,
                        vendorUserId: product.vendor_user_id,
                        storeName: product.store_name,
                        quantity: qty,
                        unitPrice,
                        subtotal,
                        platformFee,
                        vendorEarnings,
                        currentStock: product.stock_quantity,
                        lowThreshold: product.low_stock_threshold
                    });
                }

                calculatedTotal = parseFloat(calculatedTotal.toFixed(2));

                // Step 2: Create Order Master Record
                const [orderRes] = await conn.query(`
                    INSERT INTO orders (customer_id, total_amount, shipping_address, payment_method, status)
                    VALUES (?, ?, ?, ?, 'paid')
                `, [customerId, calculatedTotal, shipping_address, payment_method]);
                const newOrderId = orderRes.insertId;

                // Step 3: Insert Order Items (Auto-Split per vendor) & Deduct Inventory
                for (const item of processedItems) {
                    await conn.query(`
                        INSERT INTO order_items (order_id, product_id, vendor_id, quantity, unit_price, subtotal, platform_fee, vendor_earnings, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                    `, [newOrderId, item.productId, item.vendorId, item.quantity, item.unitPrice, item.subtotal, item.platformFee, item.vendorEarnings]);

                    // Deduct stock (if trigger didn't handle it)
                    await conn.query(`
                        UPDATE inventory 
                        SET stock_quantity = stock_quantity - ?
                        WHERE product_id = ?
                    `, [item.quantity, item.productId]);

                    // Update vendor total earnings
                    await conn.query(`
                        UPDATE vendors 
                        SET total_earnings = total_earnings + ?
                        WHERE id = ?
                    `, [item.vendorEarnings, item.vendorId]);

                    // Check low-stock condition for alert
                    const remainingStock = item.currentStock - item.quantity;
                    if (remainingStock <= item.lowThreshold) {
                        await conn.query(`
                            INSERT INTO notifications (user_id, title, message, type)
                            VALUES (?, ?, ?, 'inventory')
                        `, [
                            item.vendorUserId,
                            'Low Stock Warning!',
                            `Product "${item.productName}" is running low (Remaining stock: ${remainingStock} units). Restock recommended.`
                        ]);
                    }

                    // Notify vendor of incoming item order
                    await conn.query(`
                        INSERT INTO notifications (user_id, title, message, type)
                        VALUES (?, ?, ?, 'order')
                    `, [
                        item.vendorUserId,
                        'New Order Received',
                        `You have a new order for ${item.quantity}x "${item.productName}" (Order #${newOrderId}). Payout: $${item.vendorEarnings.toFixed(2)}`
                    ]);
                }

                // Step 4: Record Mock Payment
                const txnId = `TXN-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
                await conn.query(`
                    INSERT INTO payments (order_id, customer_id, amount, payment_method, payment_status, transaction_id)
                    VALUES (?, ?, ?, ?, 'completed', ?)
                `, [newOrderId, customerId, calculatedTotal, payment_method, txnId]);

                // Step 5: Notify Customer
                await conn.query(`
                    INSERT INTO notifications (user_id, title, message, type)
                    VALUES (?, ?, ?, 'payment')
                `, [
                    customerId,
                    'Order Confirmed & Paid',
                    `Your Order #${newOrderId} totaling $${calculatedTotal.toFixed(2)} was placed successfully! Items are being processed.`
                ]);

                await conn.commit();
                conn.release();

                return res.status(201).json({
                    success: true,
                    message: `Order #${newOrderId} placed successfully!`,
                    orderId: newOrderId,
                    totalAmount: calculatedTotal,
                    transactionId: txnId
                });
            } catch (txErr) {
                await conn.rollback();
                conn.release();
                throw txErr;
            }
        } else {
            // Memory Store Atomic Checkout Simulation
            let calculatedTotal = 0.00;
            const processedItems = [];

            for (const item of items) {
                const prodId = parseInt(item.product_id, 10);
                const qty = parseInt(item.quantity, 10);
                const product = db.memoryDb.products.find(p => p.id === prodId);
                const inventory = db.memoryDb.inventory.find(i => i.product_id === prodId);

                if (!product || !product.is_active) {
                    return res.status(400).json({ success: false, message: `Product #${prodId} is unavailable.` });
                }

                const currentStock = inventory ? inventory.stock_quantity : 0;
                if (currentStock < qty) {
                    return res.status(400).json({
                        success: false,
                        message: `Insufficient stock for "${product.name}". Only ${currentStock} available, but you requested ${qty}.`
                    });
                }

                const vendor = db.memoryDb.vendors.find(v => v.id === product.vendor_id);
                const unitPrice = product.price;
                const subtotal = parseFloat((unitPrice * qty).toFixed(2));
                const commRate = vendor ? vendor.commission_rate : config.PLATFORM_COMMISSION_PERCENT;
                const platformFee = parseFloat(((subtotal * commRate) / 100).toFixed(2));
                const vendorEarnings = parseFloat((subtotal - platformFee).toFixed(2));

                calculatedTotal += subtotal;

                processedItems.push({
                    productId: prodId,
                    productName: product.name,
                    vendorId: product.vendor_id,
                    vendorUserId: vendor?.user_id,
                    quantity: qty,
                    unitPrice,
                    subtotal,
                    platformFee,
                    vendorEarnings,
                    inventoryRecord: inventory
                });
            }

            calculatedTotal = parseFloat(calculatedTotal.toFixed(2));
            const newOrderId = db.memoryDb.nextIds.orders++;
            const orderDate = new Date().toISOString().replace('T', ' ').substring(0, 19);

            db.memoryDb.orders.push({
                id: newOrderId,
                customer_id: customerId,
                total_amount: calculatedTotal,
                shipping_address,
                payment_method,
                status: 'paid',
                created_at: orderDate
            });

            for (const item of processedItems) {
                db.memoryDb.order_items.push({
                    id: db.memoryDb.nextIds.order_items++,
                    order_id: newOrderId,
                    product_id: item.productId,
                    vendor_id: item.vendorId,
                    quantity: item.quantity,
                    unit_price: item.unitPrice,
                    subtotal: item.subtotal,
                    platform_fee: item.platformFee,
                    vendor_earnings: item.vendorEarnings,
                    status: 'pending',
                    created_at: orderDate
                });

                // Deduct stock
                if (item.inventoryRecord) {
                    item.inventoryRecord.stock_quantity -= item.quantity;
                    // Check low stock
                    if (item.inventoryRecord.stock_quantity <= item.inventoryRecord.low_stock_threshold) {
                        db.memoryDb.notifications.push({
                            id: db.memoryDb.nextIds.notifications++,
                            user_id: item.vendorUserId,
                            title: 'Low Stock Warning!',
                            message: `Product "${item.productName}" is running low (Remaining stock: ${item.inventoryRecord.stock_quantity} units). Restock recommended.`,
                            type: 'inventory',
                            is_read: 0,
                            created_at: orderDate
                        });
                    }
                }

                // Update vendor cumulative earnings
                const v = db.memoryDb.vendors.find(ven => ven.id === item.vendorId);
                if (v) {
                    v.total_earnings = parseFloat((parseFloat(v.total_earnings || 0) + item.vendorEarnings).toFixed(2));
                }

                // Notify vendor
                if (item.vendorUserId) {
                    db.memoryDb.notifications.push({
                        id: db.memoryDb.nextIds.notifications++,
                        user_id: item.vendorUserId,
                        title: 'New Order Received',
                        message: `You received an order for ${item.quantity}x "${item.productName}" (Order #${newOrderId}). Net payout: $${item.vendorEarnings.toFixed(2)}`,
                        type: 'order',
                        is_read: 0,
                        created_at: orderDate
                    });
                }
            }

            // Create Payment record
            const txnId = `TXN-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
            db.memoryDb.payments.push({
                id: db.memoryDb.nextIds.payments++,
                order_id: newOrderId,
                customer_id: customerId,
                amount: calculatedTotal,
                payment_method,
                payment_status: 'completed',
                transaction_id: txnId,
                created_at: orderDate
            });

            // Notify Customer
            db.memoryDb.notifications.push({
                id: db.memoryDb.nextIds.notifications++,
                user_id: customerId,
                title: 'Order Confirmed & Paid',
                message: `Your Order #${newOrderId} totaling $${calculatedTotal.toFixed(2)} was placed successfully! Items are being processed.`,
                type: 'payment',
                is_read: 0,
                created_at: orderDate
            });

            return res.status(201).json({
                success: true,
                message: `Order #${newOrderId} placed successfully!`,
                orderId: newOrderId,
                totalAmount: calculatedTotal,
                transactionId: txnId
            });
        }
    } catch (err) {
        console.error('Checkout error:', err);
        res.status(500).json({ success: false, message: 'Checkout failed: ' + err.message });
    }
});

// GET /api/orders/my-orders (Customer order history with items and ratings status)
router.get('/my-orders', authenticateToken, requireRole('customer'), async (req, res) => {
    try {
        const customerId = req.user.id;

        if (db.isUsingMysql()) {
            const [orders] = await db.query(`
                SELECT o.id, o.total_amount, o.shipping_address, o.payment_method, o.status, o.created_at,
                       p.payment_status, p.transaction_id
                FROM orders o
                LEFT JOIN payments p ON p.order_id = o.id
                WHERE o.customer_id = ?
                ORDER BY o.id DESC
            `, [customerId]);

            for (const order of orders) {
                const [items] = await db.query(`
                    SELECT oi.id, oi.product_id, oi.vendor_id, oi.quantity, oi.unit_price, oi.subtotal, oi.status,
                           p.name AS product_name, p.image_url,
                           v.store_name,
                           r.rating, r.review_text
                    FROM order_items oi
                    JOIN products p ON p.id = oi.product_id
                    JOIN vendors v ON v.id = oi.vendor_id
                    LEFT JOIN ratings r ON r.order_id = oi.order_id AND r.product_id = oi.product_id AND r.customer_id = ?
                    WHERE oi.order_id = ?
                `, [customerId, order.id]);
                order.items = items;
            }

            return res.json({ success: true, orders });
        } else {
            const orders = db.memoryDb.orders
                .filter(o => o.customer_id === customerId)
                .sort((a, b) => b.id - a.id)
                .map(o => {
                    const pay = db.memoryDb.payments.find(p => p.order_id === o.id);
                    const items = db.memoryDb.order_items
                        .filter(oi => oi.order_id === o.id)
                        .map(oi => {
                            const prod = db.memoryDb.products.find(p => p.id === oi.product_id) || {};
                            const ven = db.memoryDb.vendors.find(v => v.id === oi.vendor_id) || {};
                            const rating = db.memoryDb.ratings.find(r => r.order_id === o.id && r.product_id === oi.product_id && r.customer_id === customerId);
                            return {
                                ...oi,
                                product_name: prod.name,
                                image_url: prod.image_url,
                                store_name: ven.store_name,
                                rating: rating ? rating.rating : null,
                                review_text: rating ? rating.review_text : null
                            };
                        });
                    return {
                        ...o,
                        payment_status: pay?.payment_status || 'completed',
                        transaction_id: pay?.transaction_id || '',
                        items
                    };
                });

            return res.json({ success: true, orders });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/orders/vendor-orders (Vendor views all sub-orders / items for their store)
router.get('/vendor-orders', authenticateToken, requireRole('vendor'), async (req, res) => {
    try {
        const vendorId = req.user.vendorId;
        if (!vendorId) {
            return res.status(403).json({ success: false, message: 'Vendor store not found for this account.' });
        }

        if (db.isUsingMysql()) {
            const [items] = await db.query(`
                SELECT oi.id, oi.order_id, oi.product_id, oi.quantity, oi.unit_price, oi.subtotal,
                       oi.platform_fee, oi.vendor_earnings, oi.status AS item_status, oi.created_at,
                       p.name AS product_name, p.image_url,
                       o.created_at AS order_date, o.shipping_address, o.payment_method,
                       u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                JOIN users u ON u.id = o.customer_id
                JOIN products p ON p.id = oi.product_id
                WHERE oi.vendor_id = ?
                ORDER BY oi.id DESC
            `, [vendorId]);

            return res.json({ success: true, items });
        } else {
            const items = db.memoryDb.order_items
                .filter(oi => oi.vendor_id === vendorId)
                .sort((a, b) => b.id - a.id)
                .map(oi => {
                    const ord = db.memoryDb.orders.find(o => o.id === oi.order_id) || {};
                    const cust = db.memoryDb.users.find(u => u.id === ord.customer_id) || {};
                    const prod = db.memoryDb.products.find(p => p.id === oi.product_id) || {};
                    return {
                        id: oi.id,
                        order_id: oi.order_id,
                        product_id: oi.product_id,
                        quantity: oi.quantity,
                        unit_price: oi.unit_price,
                        subtotal: oi.subtotal,
                        platform_fee: oi.platform_fee,
                        vendor_earnings: oi.vendor_earnings,
                        item_status: oi.status,
                        created_at: oi.created_at,
                        product_name: prod.name,
                        image_url: prod.image_url,
                        order_date: ord.created_at,
                        shipping_address: ord.shipping_address,
                        payment_method: ord.payment_method,
                        customer_name: cust.name,
                        customer_email: cust.email,
                        customer_phone: cust.phone
                    };
                });

            return res.json({ success: true, items });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/orders/items/:id/status (Vendor updates fulfillment status: pending/processing/shipped/delivered/cancelled)
router.put('/items/:id/status', authenticateToken, requireRole('vendor', 'admin'), async (req, res) => {
    try {
        const itemId = parseInt(req.params.id, 10);
        const { status } = req.body;
        const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
        }

        if (db.isUsingMysql()) {
            const [rows] = await db.query(`
                SELECT oi.*, p.name AS product_name, o.customer_id, v.user_id AS vendor_user_id
                FROM order_items oi
                JOIN products p ON p.id = oi.product_id
                JOIN orders o ON o.id = oi.order_id
                JOIN vendors v ON v.id = oi.vendor_id
                WHERE oi.id = ?
            `, [itemId]);

            if (!rows || rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Order item not found.' });
            }

            const item = rows[0];

            // Verify ownership if vendor
            if (req.user.role === 'vendor' && item.vendor_id !== req.user.vendorId) {
                return res.status(403).json({ success: false, message: 'Unauthorized to update this order item.' });
            }

            const previousStatus = item.status;
            await db.query('UPDATE order_items SET status = ? WHERE id = ?', [status, itemId]);

            // If cancelled, trigger will restore stock, but we can also ensure stock restoration
            if (status === 'cancelled' && previousStatus !== 'cancelled') {
                await db.query('UPDATE inventory SET stock_quantity = stock_quantity + ? WHERE product_id = ?', [item.quantity, item.product_id]);
                await db.query('UPDATE vendors SET total_earnings = GREATEST(0.00, total_earnings - ?) WHERE id = ?', [item.vendor_earnings, item.vendor_id]);
            }

            // Send notification to customer
            await db.query(`
                INSERT INTO notifications (user_id, title, message, type)
                VALUES (?, ?, ?, 'order')
            `, [
                item.customer_id,
                `Item Status Update: ${status.toUpperCase()}`,
                `Your order item "${item.product_name}" (Order #${item.order_id}) is now: ${status}.`
            ]);

            return res.json({ success: true, message: `Order item #${itemId} status updated to "${status}".` });
        } else {
            const item = db.memoryDb.order_items.find(oi => oi.id === itemId);
            if (!item) return res.status(404).json({ success: false, message: 'Order item not found.' });

            if (req.user.role === 'vendor' && item.vendor_id !== req.user.vendorId) {
                return res.status(403).json({ success: false, message: 'Unauthorized.' });
            }

            const prevStatus = item.status;
            item.status = status;

            const ord = db.memoryDb.orders.find(o => o.id === item.order_id);
            const prod = db.memoryDb.products.find(p => p.id === item.product_id);

            // If cancelled: restore stock & reverse vendor earnings
            if (status === 'cancelled' && prevStatus !== 'cancelled') {
                const inv = db.memoryDb.inventory.find(i => i.product_id === item.product_id);
                if (inv) inv.stock_quantity += item.quantity;
                const v = db.memoryDb.vendors.find(ven => ven.id === item.vendor_id);
                if (v) v.total_earnings = Math.max(0, (v.total_earnings || 0) - item.vendor_earnings);
            }

            // Notify Customer
            if (ord) {
                db.memoryDb.notifications.push({
                    id: db.memoryDb.nextIds.notifications++,
                    user_id: ord.customer_id,
                    title: `Item Status Update: ${status.toUpperCase()}`,
                    message: `Your order item "${prod?.name || 'Item'}" (Order #${item.order_id}) is now: ${status}.`,
                    type: 'order',
                    is_read: 0,
                    created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
                });
            }

            return res.json({ success: true, message: `Order item #${itemId} status updated to "${status}".` });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
