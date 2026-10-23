const express = require('express');
const router = express.Router();
const db = require('../../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// All admin routes require admin role
router.use(authenticateToken, requireRole('admin'));

// GET /api/admin/metrics (High-level platform KPI summary)
router.get('/metrics', async (req, res) => {
    try {
        if (db.isUsingMysql()) {
            const [salesRes] = await db.query(`
                SELECT 
                    COALESCE(SUM(subtotal), 0.00) AS gross_merchandise_value,
                    COALESCE(SUM(platform_fee), 0.00) AS platform_revenue,
                    COALESCE(SUM(vendor_earnings), 0.00) AS vendor_disbursements,
                    COUNT(DISTINCT order_id) AS total_orders
                FROM order_items
                WHERE status <> 'cancelled'
            `);

            const [vendorCounts] = await db.query(`
                SELECT 
                    COUNT(*) AS total,
                    SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
                    SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
                FROM vendors
            `);

            const [customerCounts] = await db.query(`
                SELECT COUNT(*) AS total_customers FROM users WHERE role = 'customer'
            `);

            const [lowStockCounts] = await db.query(`
                SELECT COUNT(*) AS low_stock_count
                FROM inventory
                WHERE stock_quantity <= low_stock_threshold
            `);

            return res.json({
                success: true,
                metrics: {
                    ...salesRes[0],
                    vendors: vendorCounts[0],
                    total_customers: customerCounts[0]?.total_customers || 0,
                    low_stock_count: lowStockCounts[0]?.low_stock_count || 0
                }
            });
        } else {
            const activeItems = db.memoryDb.order_items.filter(oi => oi.status !== 'cancelled');
            const gross = activeItems.reduce((acc, cur) => acc + parseFloat(cur.subtotal), 0);
            const commission = activeItems.reduce((acc, cur) => acc + parseFloat(cur.platform_fee), 0);
            const vendorDisbursements = activeItems.reduce((acc, cur) => acc + parseFloat(cur.vendor_earnings), 0);
            const totalOrders = new Set(activeItems.map(oi => oi.order_id)).size;

            const approvedVendors = db.memoryDb.vendors.filter(v => v.status === 'approved').length;
            const pendingVendors = db.memoryDb.vendors.filter(v => v.status === 'pending').length;
            const rejectedVendors = db.memoryDb.vendors.filter(v => v.status === 'rejected').length;

            const totalCustomers = db.memoryDb.users.filter(u => u.role === 'customer').length;
            const lowStockCount = db.memoryDb.inventory.filter(i => i.stock_quantity <= i.low_stock_threshold).length;

            return res.json({
                success: true,
                metrics: {
                    gross_merchandise_value: gross.toFixed(2),
                    platform_revenue: commission.toFixed(2),
                    vendor_disbursements: vendorDisbursements.toFixed(2),
                    total_orders: totalOrders,
                    vendors: {
                        total: db.memoryDb.vendors.length,
                        approved: approvedVendors,
                        pending: pendingVendors,
                        rejected: rejectedVendors
                    },
                    total_customers: totalCustomers,
                    low_stock_count: lowStockCount
                }
            });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/admin/vendors (All vendors with approval actions)
router.get('/vendors', async (req, res) => {
    try {
        if (db.isUsingMysql()) {
            const [vendors] = await db.query(`
                SELECT v.*, u.name AS owner_name, u.email AS owner_email, u.phone AS owner_phone,
                       COUNT(DISTINCT p.id) AS products_count
                FROM vendors v
                JOIN users u ON u.id = v.user_id
                LEFT JOIN products p ON p.vendor_id = v.id
                GROUP BY v.id, u.name, u.email, u.phone
                ORDER BY CASE WHEN v.status = 'pending' THEN 1 ELSE 2 END, v.id DESC
            `);
            return res.json({ success: true, vendors });
        } else {
            const vendors = db.memoryDb.vendors.map(v => {
                const u = db.memoryDb.users.find(usr => usr.id === v.user_id) || {};
                const prods = db.memoryDb.products.filter(p => p.vendor_id === v.id);
                return {
                    ...v,
                    owner_name: u.name,
                    owner_email: u.email,
                    owner_phone: u.phone,
                    products_count: prods.length
                };
            }).sort((a, b) => {
                if (a.status === 'pending' && b.status !== 'pending') return -1;
                if (b.status === 'pending' && a.status !== 'pending') return 1;
                return b.id - a.id;
            });
            return res.json({ success: true, vendors });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/admin/vendors/:id/status (Approve or Reject Vendor)
router.put('/vendors/:id/status', async (req, res) => {
    try {
        const vendorId = parseInt(req.params.id, 10);
        const { status, reason } = req.body;

        if (!['approved', 'rejected', 'pending'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Status must be approved, rejected, or pending.' });
        }

        if (db.isUsingMysql()) {
            // Can execute stored procedure or direct update
            const [vRows] = await db.query('SELECT user_id, store_name FROM vendors WHERE id = ?', [vendorId]);
            if (!vRows || vRows.length === 0) {
                return res.status(404).json({ success: false, message: 'Vendor not found.' });
            }

            const vendor = vRows[0];
            await db.query('UPDATE vendors SET status = ? WHERE id = ?', [status, vendorId]);

            // Insert notification to vendor
            const title = status === 'approved' ? 'Vendor Application Approved!' : 'Vendor Application Status Updated';
            const msg = status === 'approved' 
                ? `Congratulations! Your vendor store "${vendor.store_name}" is approved. You can now publish products.`
                : `Your vendor store "${vendor.store_name}" application was marked as ${status}. ${reason || ''}`;

            await db.query(
                'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
                [vendor.user_id, title, msg, 'system']
            );

            return res.json({ success: true, message: `Vendor "${vendor.store_name}" status set to ${status}.` });
        } else {
            const vendor = db.memoryDb.vendors.find(v => v.id === vendorId);
            if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found.' });

            vendor.status = status;

            // Notify vendor
            const title = status === 'approved' ? 'Vendor Application Approved!' : 'Vendor Application Status Updated';
            const msg = status === 'approved' 
                ? `Congratulations! Your vendor store "${vendor.store_name}" is approved. You can now publish products.`
                : `Your vendor store "${vendor.store_name}" application was marked as ${status}. ${reason || ''}`;

            db.memoryDb.notifications.push({
                id: db.memoryDb.nextIds.notifications++,
                user_id: vendor.user_id,
                title,
                message: msg,
                type: 'system',
                is_read: 0,
                created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
            });

            return res.json({ success: true, message: `Vendor "${vendor.store_name}" status set to ${status}.` });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/admin/reports/vendor-sales (Vendor performance report from vw_vendor_performance)
router.get('/reports/vendor-sales', async (req, res) => {
    try {
        if (db.isUsingMysql()) {
            const [report] = await db.query('SELECT * FROM vw_vendor_performance ORDER BY gross_sales DESC');
            return res.json({ success: true, report });
        } else {
            const [report] = await db.query('SELECT * FROM vw_vendor_performance');
            return res.json({ success: true, report });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/admin/reports/monthly-revenue (Monthly revenue breakdown from vw_monthly_platform_revenue)
router.get('/reports/monthly-revenue', async (req, res) => {
    try {
        if (db.isUsingMysql()) {
            const [revenue] = await db.query('SELECT * FROM vw_monthly_platform_revenue');
            return res.json({ success: true, revenue });
        } else {
            // Memory aggregation
            const activeItems = db.memoryDb.order_items.filter(oi => oi.status !== 'cancelled');
            const monthlyMap = {};

            activeItems.forEach(oi => {
                const month = (oi.created_at || '2026-10').substring(0, 7);
                if (!monthlyMap[month]) {
                    monthlyMap[month] = {
                        sales_month: month,
                        total_orders: new Set(),
                        gross_merchandise_value: 0,
                        platform_commission_revenue: 0,
                        total_vendor_payouts: 0
                    };
                }
                monthlyMap[month].total_orders.add(oi.order_id);
                monthlyMap[month].gross_merchandise_value += parseFloat(oi.subtotal);
                monthlyMap[month].platform_commission_revenue += parseFloat(oi.platform_fee);
                monthlyMap[month].total_vendor_payouts += parseFloat(oi.vendor_earnings);
            });

            const revenue = Object.values(monthlyMap).map(m => ({
                sales_month: m.sales_month,
                total_orders: m.total_orders.size,
                gross_merchandise_value: m.gross_merchandise_value.toFixed(2),
                platform_commission_revenue: m.platform_commission_revenue.toFixed(2),
                total_vendor_payouts: m.total_vendor_payouts.toFixed(2)
            }));

            return res.json({ success: true, revenue });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/admin/reports/low-stock (Low stock inventory audit from vw_low_stock_products)
router.get('/reports/low-stock', async (req, res) => {
    try {
        if (db.isUsingMysql()) {
            const [alerts] = await db.query('SELECT * FROM vw_low_stock_products ORDER BY stock_quantity ASC');
            return res.json({ success: true, alerts });
        } else {
            const [alerts] = await db.query('SELECT * FROM vw_low_stock_products');
            return res.json({ success: true, alerts });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/admin/reports/orders (Consolidated global orders list)
router.get('/reports/orders', async (req, res) => {
    try {
        if (db.isUsingMysql()) {
            const [orders] = await db.query(`
                SELECT o.id, o.customer_id, u.name AS customer_name, u.email AS customer_email,
                       o.total_amount, o.shipping_address, o.payment_method, o.status, o.created_at,
                       p.payment_status, p.transaction_id,
                       COUNT(oi.id) AS item_count
                FROM orders o
                JOIN users u ON u.id = o.customer_id
                LEFT JOIN payments p ON p.order_id = o.id
                LEFT JOIN order_items oi ON oi.order_id = o.id
                GROUP BY o.id, u.name, u.email, p.payment_status, p.transaction_id
                ORDER BY o.id DESC
            `);
            return res.json({ success: true, orders });
        } else {
            const [orders] = await db.query('SELECT * FROM orders');
            return res.json({ success: true, orders });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/admin/reports/payments (Financial transactions ledger)
router.get('/reports/payments', async (req, res) => {
    try {
        if (db.isUsingMysql()) {
            const [payments] = await db.query(`
                SELECT p.*, u.name AS customer_name, u.email AS customer_email, o.status AS order_status
                FROM payments p
                JOIN users u ON u.id = p.customer_id
                JOIN orders o ON o.id = p.order_id
                ORDER BY p.id DESC
            `);
            return res.json({ success: true, payments });
        } else {
            const payments = db.memoryDb.payments.map(p => {
                const u = db.memoryDb.users.find(usr => usr.id === p.customer_id);
                const o = db.memoryDb.orders.find(ord => ord.id === p.order_id);
                return {
                    ...p,
                    customer_name: u?.name || 'Customer',
                    customer_email: u?.email || '',
                    order_status: o?.status || 'completed'
                };
            }).sort((a, b) => b.id - a.id);
            return res.json({ success: true, payments });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
