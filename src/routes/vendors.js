const express = require('express');
const router = express.Router();
const db = require('../../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// GET /api/vendors (Public directory of approved vendors)
router.get('/', async (req, res) => {
    try {
        if (db.isUsingMysql()) {
            const [vendors] = await db.query(`
                SELECT v.id, v.store_name, v.store_description, v.banner_url, v.created_at,
                       COUNT(DISTINCT p.id) AS total_products,
                       COALESCE(ROUND(AVG(r.rating), 1), 0) AS avg_rating,
                       COUNT(DISTINCT r.id) AS review_count
                FROM vendors v
                LEFT JOIN products p ON p.vendor_id = v.id AND p.is_active = TRUE
                LEFT JOIN ratings r ON r.vendor_id = v.id
                WHERE v.status = 'approved'
                GROUP BY v.id, v.store_name, v.store_description, v.banner_url, v.created_at
                ORDER BY avg_rating DESC
            `);
            return res.json({ success: true, vendors });
        } else {
            const vendors = db.memoryDb.vendors
                .filter(v => v.status === 'approved')
                .map(v => {
                    const prods = db.memoryDb.products.filter(p => p.vendor_id === v.id && p.is_active);
                    const vRatings = db.memoryDb.ratings.filter(r => r.vendor_id === v.id);
                    const avgRating = vRatings.length > 0 
                        ? (vRatings.reduce((sum, r) => sum + r.rating, 0) / vRatings.length).toFixed(1)
                        : 0;
                    return {
                        id: v.id,
                        store_name: v.store_name,
                        store_description: v.store_description,
                        banner_url: v.banner_url,
                        created_at: v.created_at,
                        total_products: prods.length,
                        avg_rating: parseFloat(avgRating),
                        review_count: vRatings.length
                    };
                });
            return res.json({ success: true, vendors });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/vendors/dashboard/stats (Vendor Dashboard Analytics)
router.get('/dashboard/stats', authenticateToken, requireRole('vendor'), async (req, res) => {
    try {
        const vendorId = req.user.vendorId;
        if (!vendorId) {
            return res.status(403).json({ success: false, message: 'Vendor store not found.' });
        }

        if (db.isUsingMysql()) {
            // Summary KPI metrics
            const [salesStats] = await db.query(`
                SELECT 
                    COALESCE(SUM(oi.subtotal), 0.00) AS gross_sales,
                    COALESCE(SUM(oi.platform_fee), 0.00) AS total_commission_paid,
                    COALESCE(SUM(oi.vendor_earnings), 0.00) AS net_earnings,
                    COUNT(DISTINCT oi.order_id) AS total_orders,
                    COALESCE(SUM(oi.quantity), 0) AS total_units_sold
                FROM order_items oi
                WHERE oi.vendor_id = ? AND oi.status <> 'cancelled'
            `, [vendorId]);

            // Status breakdown counts
            const [statusCounts] = await db.query(`
                SELECT status, COUNT(*) AS count
                FROM order_items
                WHERE vendor_id = ?
                GROUP BY status
            `, [vendorId]);

            // Rating stats
            const [ratingStats] = await db.query(`
                SELECT 
                    COALESCE(ROUND(AVG(rating), 2), 0.00) AS avg_rating,
                    COUNT(*) AS total_reviews
                FROM ratings
                WHERE vendor_id = ?
            `, [vendorId]);

            // Low-Stock items for this vendor
            const [lowStockItems] = await db.query(`
                SELECT p.id, p.name, c.name AS category_name, i.stock_quantity, i.low_stock_threshold
                FROM products p
                JOIN categories c ON c.id = p.category_id
                JOIN inventory i ON i.product_id = p.id
                WHERE p.vendor_id = ? AND i.stock_quantity <= i.low_stock_threshold AND p.is_active = TRUE
                ORDER BY i.stock_quantity ASC
            `, [vendorId]);

            // Recent reviews
            const [recentReviews] = await db.query(`
                SELECT r.id, r.rating, r.review_text, r.created_at, u.name AS customer_name, p.name AS product_name
                FROM ratings r
                JOIN users u ON u.id = r.customer_id
                JOIN products p ON p.id = r.product_id
                WHERE r.vendor_id = ?
                ORDER BY r.created_at DESC
                LIMIT 5
            `, [vendorId]);

            const statusMap = { pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 };
            statusCounts.forEach(row => { statusMap[row.status] = row.count; });

            return res.json({
                success: true,
                stats: {
                    ...salesStats[0],
                    avg_rating: ratingStats[0]?.avg_rating || '0.00',
                    total_reviews: ratingStats[0]?.total_reviews || 0,
                    statusCounts: statusMap,
                    lowStockAlerts: lowStockItems,
                    recentReviews
                }
            });
        } else {
            // Memory stats
            const vendorItems = db.memoryDb.order_items.filter(oi => oi.vendor_id === vendorId);
            const activeItems = vendorItems.filter(oi => oi.status !== 'cancelled');

            const grossSales = activeItems.reduce((acc, cur) => acc + parseFloat(cur.subtotal), 0);
            const commissionPaid = activeItems.reduce((acc, cur) => acc + parseFloat(cur.platform_fee), 0);
            const netEarnings = activeItems.reduce((acc, cur) => acc + parseFloat(cur.vendor_earnings), 0);
            const totalOrders = new Set(activeItems.map(oi => oi.order_id)).size;
            const totalUnitsSold = activeItems.reduce((acc, cur) => acc + cur.quantity, 0);

            const statusMap = { pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 };
            vendorItems.forEach(oi => {
                if (statusMap[oi.status] !== undefined) statusMap[oi.status]++;
            });

            const vRatings = db.memoryDb.ratings.filter(r => r.vendor_id === vendorId);
            const avgRating = vRatings.length > 0 
                ? (vRatings.reduce((sum, r) => sum + r.rating, 0) / vRatings.length).toFixed(2)
                : '0.00';

            const lowStockItems = db.memoryDb.products
                .filter(p => p.vendor_id === vendorId && p.is_active)
                .map(p => {
                    const inv = db.memoryDb.inventory.find(i => i.product_id === p.id);
                    const c = db.memoryDb.categories.find(cat => cat.id === p.category_id);
                    if (inv && inv.stock_quantity <= inv.low_stock_threshold) {
                        return {
                            id: p.id,
                            name: p.name,
                            category_name: c?.name || '',
                            stock_quantity: inv.stock_quantity,
                            low_stock_threshold: inv.low_stock_threshold
                        };
                    }
                    return null;
                })
                .filter(Boolean);

            const recentReviews = vRatings.slice(-5).reverse().map(r => {
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
            });

            return res.json({
                success: true,
                stats: {
                    gross_sales: grossSales.toFixed(2),
                    total_commission_paid: commissionPaid.toFixed(2),
                    net_earnings: netEarnings.toFixed(2),
                    total_orders: totalOrders,
                    total_units_sold: totalUnitsSold,
                    avg_rating: avgRating,
                    total_reviews: vRatings.length,
                    statusCounts: statusMap,
                    lowStockAlerts: lowStockItems,
                    recentReviews
                }
            });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/vendors/:id (Public single vendor details)
router.get('/:id', async (req, res) => {
    try {
        const vendorId = parseInt(req.params.id, 10);

        if (db.isUsingMysql()) {
            const [vendors] = await db.query('SELECT * FROM vendors WHERE id = ?', [vendorId]);
            if (!vendors || vendors.length === 0) {
                return res.status(404).json({ success: false, message: 'Vendor not found.' });
            }

            const vendor = vendors[0];
            const [products] = await db.query(`
                SELECT p.*, i.stock_quantity
                FROM products p
                LEFT JOIN inventory i ON i.product_id = p.id
                WHERE p.vendor_id = ? AND p.is_active = TRUE
            `, [vendorId]);

            const [ratings] = await db.query(`
                SELECT r.id, r.rating, r.review_text, r.created_at, u.name AS customer_name, p.name AS product_name
                FROM ratings r
                JOIN users u ON u.id = r.customer_id
                JOIN products p ON p.id = r.product_id
                WHERE r.vendor_id = ?
                ORDER BY r.created_at DESC
            `, [vendorId]);

            return res.json({ success: true, vendor, products, ratings });
        } else {
            const vendor = db.memoryDb.vendors.find(v => v.id === vendorId);
            if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found.' });

            const products = db.memoryDb.products
                .filter(p => p.vendor_id === vendorId && p.is_active)
                .map(p => {
                    const inv = db.memoryDb.inventory.find(i => i.product_id === p.id) || { stock_quantity: 0 };
                    return { ...p, stock_quantity: inv.stock_quantity };
                });

            const ratings = db.memoryDb.ratings
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
                });

            return res.json({ success: true, vendor, products, ratings });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
