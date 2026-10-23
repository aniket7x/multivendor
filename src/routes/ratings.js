const express = require('express');
const router = express.Router();
const db = require('../../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// POST /api/ratings (Customer submits rating & review)
router.post('/', authenticateToken, requireRole('customer'), async (req, res) => {
    try {
        const customerId = req.user.id;
        const { product_id, order_id, rating, review_text } = req.body;

        const numRating = parseInt(rating, 10);
        const prodId = parseInt(product_id, 10);
        const ordId = order_id ? parseInt(order_id, 10) : null;

        if (isNaN(numRating) || numRating < 1 || numRating > 5) {
            return res.status(400).json({ success: false, message: 'Rating must be an integer between 1 and 5.' });
        }
        if (!prodId) {
            return res.status(400).json({ success: false, message: 'Product ID is required.' });
        }

        if (db.isUsingMysql()) {
            // Find vendor of product
            const [prods] = await db.query('SELECT vendor_id, name FROM products WHERE id = ?', [prodId]);
            if (!prods || prods.length === 0) {
                return res.status(404).json({ success: false, message: 'Product not found.' });
            }
            const vendorId = prods[0].vendor_id;
            const productName = prods[0].name;

            // Check if already rated
            if (ordId) {
                const [existing] = await db.query(
                    'SELECT id FROM ratings WHERE customer_id = ? AND product_id = ? AND order_id = ?',
                    [customerId, prodId, ordId]
                );
                if (existing && existing.length > 0) {
                    return res.status(400).json({ success: false, message: 'You have already reviewed this item for this order.' });
                }
            }

            await db.query(`
                INSERT INTO ratings (customer_id, vendor_id, product_id, order_id, rating, review_text)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [customerId, vendorId, prodId, ordId, numRating, review_text || null]);

            // Notify vendor
            const [vendors] = await db.query('SELECT user_id FROM vendors WHERE id = ?', [vendorId]);
            if (vendors && vendors.length > 0) {
                await db.query(`
                    INSERT INTO notifications (user_id, title, message, type)
                    VALUES (?, ?, ?, 'system')
                `, [
                    vendors[0].user_id,
                    `New Customer Review (${numRating}★)`,
                    `${req.user.name || 'A customer'} rated "${productName}": "${review_text ? review_text.substring(0, 80) : `${numRating} stars`}"`
                ]);
            }

            return res.status(201).json({ success: true, message: 'Thank you for your rating and review!' });
        } else {
            const product = db.memoryDb.products.find(p => p.id === prodId);
            if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

            const vendorId = product.vendor_id;
            const vendor = db.memoryDb.vendors.find(v => v.id === vendorId);

            if (ordId) {
                const exists = db.memoryDb.ratings.some(r => r.customer_id === customerId && r.product_id === prodId && r.order_id === ordId);
                if (exists) {
                    return res.status(400).json({ success: false, message: 'You have already reviewed this item for this order.' });
                }
            }

            db.memoryDb.ratings.push({
                id: db.memoryDb.nextIds.ratings++,
                customer_id: customerId,
                vendor_id: vendorId,
                product_id: prodId,
                order_id: ordId,
                rating: numRating,
                review_text: review_text || '',
                created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
            });

            // Notify vendor
            if (vendor) {
                db.memoryDb.notifications.push({
                    id: db.memoryDb.nextIds.notifications++,
                    user_id: vendor.user_id,
                    title: `New Customer Review (${numRating}★)`,
                    message: `${req.user.name || 'A customer'} rated "${product.name}": "${review_text ? review_text.substring(0, 80) : `${numRating} stars`}"`,
                    type: 'system',
                    is_read: 0,
                    created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
                });
            }

            return res.status(201).json({ success: true, message: 'Thank you for your rating and review!' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/ratings/vendor/:vendorId
router.get('/vendor/:vendorId', async (req, res) => {
    try {
        const vendorId = parseInt(req.params.vendorId, 10);

        if (db.isUsingMysql()) {
            const [reviews] = await db.query(`
                SELECT r.id, r.rating, r.review_text, r.created_at, u.name AS customer_name, p.name AS product_name
                FROM ratings r
                JOIN users u ON u.id = r.customer_id
                JOIN products p ON p.id = r.product_id
                WHERE r.vendor_id = ?
                ORDER BY r.created_at DESC
            `, [vendorId]);
            return res.json({ success: true, reviews });
        } else {
            const reviews = db.memoryDb.ratings
                .filter(r => r.vendor_id === vendorId)
                .map(r => {
                    const u = db.memoryDb.users.find(usr => usr.id === r.customer_id);
                    const p = db.memoryDb.products.find(prod => prod.id === r.product_id);
                    return {
                        id: r.id,
                        rating: r.rating,
                        review_text: r.review_text,
                        created_at: r.created_at,
                        customer_name: u?.name || 'Customer',
                        product_name: p?.name || 'Product'
                    };
                }).sort((a, b) => b.id - a.id);
            return res.json({ success: true, reviews });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
