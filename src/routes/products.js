const express = require('express');
const router = express.Router();
const db = require('../../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// GET /api/products/categories
router.get('/categories', async (req, res) => {
    try {
        const [categories] = await db.query('SELECT * FROM categories ORDER BY name ASC');
        res.json({ success: true, categories });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/products (Public catalog with search, filter, and sort)
router.get('/', async (req, res) => {
    try {
        const { search, category, vendor, sort, inStockOnly } = req.query;

        if (db.isUsingMysql()) {
            let sql = `
                SELECT 
                    p.id, p.name, p.description, p.price, p.image_url, p.is_active, p.created_at,
                    p.category_id, c.name AS category_name,
                    p.vendor_id, v.store_name, v.status AS vendor_status,
                    i.stock_quantity, i.low_stock_threshold,
                    COALESCE(ROUND(AVG(r.rating), 1), 0) AS avg_rating,
                    COUNT(r.id) AS rating_count
                FROM products p
                JOIN vendors v ON v.id = p.vendor_id
                JOIN categories c ON c.id = p.category_id
                LEFT JOIN inventory i ON i.product_id = p.id
                LEFT JOIN ratings r ON r.product_id = p.id
                WHERE p.is_active = TRUE AND v.status = 'approved'
            `;
            const params = [];

            if (search) {
                sql += ` AND (p.name LIKE ? OR p.description LIKE ?)`;
                params.push(`%${search}%`, `%${search}%`);
            }
            if (category) {
                sql += ` AND p.category_id = ?`;
                params.push(parseInt(category, 10));
            }
            if (vendor) {
                sql += ` AND p.vendor_id = ?`;
                params.push(parseInt(vendor, 10));
            }
            if (inStockOnly === 'true') {
                sql += ` AND i.stock_quantity > 0`;
            }

            sql += ` GROUP BY p.id, p.name, p.description, p.price, p.image_url, p.is_active, p.created_at, p.category_id, c.name, p.vendor_id, v.store_name, v.status, i.stock_quantity, i.low_stock_threshold`;

            if (sort === 'price_asc') sql += ` ORDER BY p.price ASC`;
            else if (sort === 'price_desc') sql += ` ORDER BY p.price DESC`;
            else if (sort === 'rating') sql += ` ORDER BY avg_rating DESC`;
            else sql += ` ORDER BY p.id DESC`;

            const [products] = await db.query(sql, params);
            return res.json({ success: true, products });
        } else {
            // Memory mode query simulation
            let list = db.memoryDb.products.filter(p => {
                const v = db.memoryDb.vendors.find(ven => ven.id === p.vendor_id);
                return p.is_active && v && v.status === 'approved';
            }).map(p => {
                const v = db.memoryDb.vendors.find(ven => ven.id === p.vendor_id) || {};
                const c = db.memoryDb.categories.find(cat => cat.id === p.category_id) || {};
                const inv = db.memoryDb.inventory.find(i => i.product_id === p.id) || { stock_quantity: 0, low_stock_threshold: 5 };
                const prodRatings = db.memoryDb.ratings.filter(r => r.product_id === p.id);
                const avgRating = prodRatings.length > 0 ? (prodRatings.reduce((sum, r) => sum + r.rating, 0) / prodRatings.length).toFixed(1) : 0;
                return {
                    ...p,
                    store_name: v.store_name,
                    category_name: c.name,
                    stock_quantity: inv.stock_quantity,
                    low_stock_threshold: inv.low_stock_threshold,
                    is_low_stock: inv.stock_quantity <= inv.low_stock_threshold ? 1 : 0,
                    avg_rating: parseFloat(avgRating),
                    rating_count: prodRatings.length
                };
            });

            if (search) {
                const term = search.toLowerCase();
                list = list.filter(p => p.name.toLowerCase().includes(term) || (p.description && p.description.toLowerCase().includes(term)));
            }
            if (category) {
                list = list.filter(p => p.category_id === parseInt(category, 10));
            }
            if (vendor) {
                list = list.filter(p => p.vendor_id === parseInt(vendor, 10));
            }
            if (inStockOnly === 'true') {
                list = list.filter(p => p.stock_quantity > 0);
            }

            if (sort === 'price_asc') list.sort((a, b) => a.price - b.price);
            else if (sort === 'price_desc') list.sort((a, b) => b.price - a.price);
            else if (sort === 'rating') list.sort((a, b) => b.avg_rating - a.avg_rating);
            else list.sort((a, b) => b.id - a.id);

            return res.json({ success: true, products: list });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/products/:id (Single product detail with reviews)
router.get('/:id', async (req, res) => {
    try {
        const prodId = parseInt(req.params.id, 10);

        if (db.isUsingMysql()) {
            const [rows] = await db.query(`
                SELECT 
                    p.id, p.name, p.description, p.price, p.image_url, p.is_active, p.created_at,
                    p.category_id, c.name AS category_name,
                    p.vendor_id, v.store_name, v.store_description, v.status AS vendor_status,
                    i.stock_quantity, i.low_stock_threshold
                FROM products p
                JOIN vendors v ON v.id = p.vendor_id
                JOIN categories c ON c.id = p.category_id
                LEFT JOIN inventory i ON i.product_id = p.id
                WHERE p.id = ?
            `, [prodId]);

            if (!rows || rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Product not found.' });
            }

            const product = rows[0];

            // Get product reviews
            const [reviews] = await db.query(`
                SELECT r.id, r.rating, r.review_text, r.created_at, u.name AS customer_name
                FROM ratings r
                JOIN users u ON u.id = r.customer_id
                WHERE r.product_id = ?
                ORDER BY r.created_at DESC
            `, [prodId]);

            const avgRating = reviews.length > 0 
                ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
                : 0;

            return res.json({
                success: true,
                product: {
                    ...product,
                    avg_rating: parseFloat(avgRating),
                    rating_count: reviews.length,
                    reviews
                }
            });
        } else {
            const p = db.memoryDb.products.find(item => item.id === prodId);
            if (!p) {
                return res.status(404).json({ success: false, message: 'Product not found.' });
            }
            const v = db.memoryDb.vendors.find(ven => ven.id === p.vendor_id) || {};
            const c = db.memoryDb.categories.find(cat => cat.id === p.category_id) || {};
            const inv = db.memoryDb.inventory.find(i => i.product_id === p.id) || { stock_quantity: 0, low_stock_threshold: 5 };
            const reviews = db.memoryDb.ratings
                .filter(r => r.product_id === p.id)
                .map(r => {
                    const u = db.memoryDb.users.find(usr => usr.id === r.customer_id);
                    return { ...r, customer_name: u?.name || 'Customer' };
                });
            const avgRating = reviews.length > 0 ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1) : 0;

            return res.json({
                success: true,
                product: {
                    ...p,
                    store_name: v.store_name,
                    store_description: v.store_description,
                    vendor_status: v.status,
                    category_name: c.name,
                    stock_quantity: inv.stock_quantity,
                    low_stock_threshold: inv.low_stock_threshold,
                    avg_rating: parseFloat(avgRating),
                    rating_count: reviews.length,
                    reviews
                }
            });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/products (Vendor adds a new product)
router.post('/', authenticateToken, requireRole('vendor'), async (req, res) => {
    try {
        const vendorId = req.user.vendorId;
        const vendorStatus = req.user.vendorStatus;

        if (vendorStatus !== 'approved') {
            return res.status(403).json({
                success: false,
                message: 'Your vendor account is pending admin approval. You cannot publish products yet.'
            });
        }

        const { name, description, price, category_id, image_url, stock_quantity = 10, low_stock_threshold = 5 } = req.body;

        if (!name || price === undefined || !category_id) {
            return res.status(400).json({ success: false, message: 'Product name, price, and category are required.' });
        }

        const numPrice = parseFloat(price);
        const numStock = parseInt(stock_quantity, 10);
        const numThreshold = parseInt(low_stock_threshold, 10);

        if (numPrice < 0) {
            return res.status(400).json({ success: false, message: 'Price cannot be negative.' });
        }
        if (numStock < 0) {
            return res.status(400).json({ success: false, message: 'Initial stock cannot be negative.' });
        }

        const defaultImage = image_url || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80';

        let newProdId;
        if (db.isUsingMysql()) {
            const [pResult] = await db.query(
                'INSERT INTO products (vendor_id, category_id, name, description, price, image_url, is_active) VALUES (?, ?, ?, ?, ?, ?, TRUE)',
                [vendorId, category_id, name, description || '', numPrice, defaultImage]
            );
            newProdId = pResult.insertId;

            // Note: trigger trg_after_product_insert creates an inventory row, or update it with custom values
            await db.query(
                'INSERT INTO inventory (product_id, stock_quantity, low_stock_threshold) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE stock_quantity = ?, low_stock_threshold = ?',
                [newProdId, numStock, numThreshold, numStock, numThreshold]
            );
        } else {
            newProdId = db.memoryDb.nextIds.products++;
            const newProduct = {
                id: newProdId,
                vendor_id: vendorId,
                category_id: parseInt(category_id, 10),
                name,
                description: description || '',
                price: numPrice,
                image_url: defaultImage,
                is_active: 1,
                created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
            };
            db.memoryDb.products.push(newProduct);

            db.memoryDb.inventory.push({
                id: db.memoryDb.nextIds.inventory++,
                product_id: newProdId,
                stock_quantity: numStock,
                low_stock_threshold: numThreshold
            });
        }

        return res.status(201).json({
            success: true,
            message: `Product "${name}" created successfully!`,
            productId: newProdId
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/products/:id (Vendor updates their product)
router.put('/:id', authenticateToken, requireRole('vendor', 'admin'), async (req, res) => {
    try {
        const prodId = parseInt(req.params.id, 10);
        const { name, description, price, category_id, image_url, is_active } = req.body;

        if (db.isUsingMysql()) {
            // Verify ownership if vendor
            if (req.user.role === 'vendor') {
                const [rows] = await db.query('SELECT vendor_id FROM products WHERE id = ?', [prodId]);
                if (!rows.length || rows[0].vendor_id !== req.user.vendorId) {
                    return res.status(403).json({ success: false, message: 'Unauthorized to modify this product.' });
                }
            }

            await db.query(
                `UPDATE products 
                 SET name = COALESCE(?, name),
                     description = COALESCE(?, description),
                     price = COALESCE(?, price),
                     category_id = COALESCE(?, category_id),
                     image_url = COALESCE(?, image_url),
                     is_active = COALESCE(?, is_active)
                 WHERE id = ?`,
                [name, description, price !== undefined ? parseFloat(price) : null, category_id, image_url, is_active, prodId]
            );
        } else {
            const p = db.memoryDb.products.find(item => item.id === prodId);
            if (!p) return res.status(404).json({ success: false, message: 'Product not found.' });

            if (req.user.role === 'vendor' && p.vendor_id !== req.user.vendorId) {
                return res.status(403).json({ success: false, message: 'Unauthorized to modify this product.' });
            }

            if (name !== undefined) p.name = name;
            if (description !== undefined) p.description = description;
            if (price !== undefined) p.price = parseFloat(price);
            if (category_id !== undefined) p.category_id = parseInt(category_id, 10);
            if (image_url !== undefined) p.image_url = image_url;
            if (is_active !== undefined) p.is_active = is_active ? 1 : 0;
        }

        res.json({ success: true, message: 'Product updated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/products/:id (Vendor deactivates their product)
router.delete('/:id', authenticateToken, requireRole('vendor', 'admin'), async (req, res) => {
    try {
        const prodId = parseInt(req.params.id, 10);

        if (db.isUsingMysql()) {
            if (req.user.role === 'vendor') {
                const [rows] = await db.query('SELECT vendor_id FROM products WHERE id = ?', [prodId]);
                if (!rows.length || rows[0].vendor_id !== req.user.vendorId) {
                    return res.status(403).json({ success: false, message: 'Unauthorized to delete this product.' });
                }
            }
            await db.query('UPDATE products SET is_active = FALSE WHERE id = ?', [prodId]);
        } else {
            const p = db.memoryDb.products.find(item => item.id === prodId);
            if (!p) return res.status(404).json({ success: false, message: 'Product not found.' });
            if (req.user.role === 'vendor' && p.vendor_id !== req.user.vendorId) {
                return res.status(403).json({ success: false, message: 'Unauthorized.' });
            }
            p.is_active = 0;
        }

        res.json({ success: true, message: 'Product removed from active catalog.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/products/:id/stock (Restock product inventory)
router.post('/:id/stock', authenticateToken, requireRole('vendor', 'admin'), async (req, res) => {
    try {
        const prodId = parseInt(req.params.id, 10);
        const { quantity, threshold } = req.body;

        const addQty = parseInt(quantity, 10);
        if (isNaN(addQty) || addQty <= 0) {
            return res.status(400).json({ success: false, message: 'Restock quantity must be a positive integer.' });
        }

        if (db.isUsingMysql()) {
            if (req.user.role === 'vendor') {
                const [rows] = await db.query('SELECT vendor_id FROM products WHERE id = ?', [prodId]);
                if (!rows.length || rows[0].vendor_id !== req.user.vendorId) {
                    return res.status(403).json({ success: false, message: 'Unauthorized.' });
                }
            }

            await db.query(`
                INSERT INTO inventory (product_id, stock_quantity, low_stock_threshold)
                VALUES (?, ?, COALESCE(?, 5))
                ON DUPLICATE KEY UPDATE 
                    stock_quantity = stock_quantity + VALUES(stock_quantity),
                    low_stock_threshold = COALESCE(VALUES(low_stock_threshold), low_stock_threshold)
            `, [prodId, addQty, threshold || null]);
        } else {
            const p = db.memoryDb.products.find(item => item.id === prodId);
            if (!p) return res.status(404).json({ success: false, message: 'Product not found.' });
            if (req.user.role === 'vendor' && p.vendor_id !== req.user.vendorId) {
                return res.status(403).json({ success: false, message: 'Unauthorized.' });
            }
            let inv = db.memoryDb.inventory.find(i => i.product_id === prodId);
            if (!inv) {
                inv = { id: db.memoryDb.nextIds.inventory++, product_id: prodId, stock_quantity: 0, low_stock_threshold: 5 };
                db.memoryDb.inventory.push(inv);
            }
            inv.stock_quantity += addQty;
            if (threshold !== undefined) inv.low_stock_threshold = parseInt(threshold, 10);
        }

        res.json({ success: true, message: `Successfully restocked product by ${addQty} units.` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
