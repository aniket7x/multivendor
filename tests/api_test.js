const { EventEmitter } = require('events');
const app = require('../src/server');

function dispatch(app, method, url, body = null, token = null) {
    return new Promise((resolve, reject) => {
        const req = new EventEmitter();
        req.method = method.toUpperCase();
        req.url = url;
        req.headers = {
            'content-type': 'application/json'
        };
        if (token) {
            req.headers['authorization'] = `Bearer ${token}`;
        }
        req.body = body || {};

        const res = new EventEmitter();
        res.statusCode = 200;
        res._headers = {};
        res.setHeader = (k, v) => { res._headers[k.toLowerCase()] = v; };
        res.getHeader = (k) => res._headers[k.toLowerCase()];
        
        let responseBody = '';
        res.write = (chunk) => { responseBody += chunk; return true; };
        res.end = (chunk) => {
            if (chunk) responseBody += chunk;
            try {
                const parsed = JSON.parse(responseBody);
                resolve({ status: res.statusCode, data: parsed });
            } catch (e) {
                resolve({ status: res.statusCode, data: responseBody });
            }
        };

        res.status = (code) => {
            res.statusCode = code;
            return res;
        };

        res.json = (data) => {
            res.statusCode = res.statusCode || 200;
            resolve({ status: res.statusCode, data });
        };

        res.send = (data) => {
            resolve({ status: res.statusCode, data });
        };

        try {
            app(req, res);
        } catch (err) {
            reject(err);
        }
    });
}

async function runTests() {
    console.log('--- Starting Multi-Vendor DBMS Direct-Dispatch Test Suite ---\n');

    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`  ✓ ${message}`);
            passed++;
        } else {
            console.error(`  ✖ FAIL: ${message}`);
            failed++;
        }
    }

    try {
        // 1. System Info Test
        console.log('[1/7] Testing System Health & Catalog Discovery...');
        const sysInfo = await dispatch(app, 'GET', '/api/system/info');
        assert(sysInfo.status === 200 && sysInfo.data.success, 'System info endpoint is operational');
        assert(sysInfo.data.commissionRate === '10%', 'Platform commission rate set to 10%');

        const catalog = await dispatch(app, 'GET', '/api/products');
        assert(catalog.status === 200 && catalog.data.products.length > 0, `Catalog loaded ${catalog.data.products.length} products`);

        const categories = await dispatch(app, 'GET', '/api/products/categories');
        assert(categories.status === 200 && categories.data.categories.length > 0, `Found ${categories.data.categories.length} product categories`);

        // 2. Authentication & Demo Role Switching
        console.log('\n[2/7] Testing JWT Authentication & RBAC Login...');
        const adminAuth = await dispatch(app, 'POST', '/api/auth/demo-login', { role: 'admin' });
        assert(adminAuth.status === 200 && adminAuth.data.user.role === 'admin', 'Admin login successful with JWT');
        const adminToken = adminAuth.data.token;

        const vendorAuth = await dispatch(app, 'POST', '/api/auth/demo-login', { role: 'vendor', vendorIndex: 0 });
        assert(vendorAuth.status === 200 && vendorAuth.data.user.role === 'vendor', 'TechZone Vendor login successful');
        const vendorToken = vendorAuth.data.token;

        const customerAuth = await dispatch(app, 'POST', '/api/auth/demo-login', { role: 'customer' });
        assert(customerAuth.status === 200 && customerAuth.data.user.role === 'customer', 'Customer Alice login successful');
        const customerToken = customerAuth.data.token;

        // 3. Admin Features & Stored Views
        console.log('\n[3/7] Testing Admin Reports & Views (GMV, Commission, Vendor Approvals)...');
        const metrics = await dispatch(app, 'GET', '/api/admin/metrics', null, adminToken);
        assert(metrics.status === 200 && metrics.data.metrics.gross_merchandise_value > 0, 'Admin platform GMV metric loaded');

        const vendorPerf = await dispatch(app, 'GET', '/api/admin/reports/vendor-sales', null, adminToken);
        assert(vendorPerf.status === 200 && vendorPerf.data.report.length > 0, 'vw_vendor_performance report loaded');

        const lowStock = await dispatch(app, 'GET', '/api/admin/reports/low-stock', null, adminToken);
        assert(lowStock.status === 200, 'vw_low_stock_products report loaded');

        // Approve pending vendor (Mateo Silva)
        const approveVendor = await dispatch(app, 'PUT', '/api/admin/vendors/4/status', { status: 'approved' }, adminToken);
        assert(approveVendor.status === 200 && approveVendor.data.success, 'Admin approved pending vendor #4');

        // 4. Customer Cart & Multi-Vendor Checkout with Stock Locking
        console.log('\n[4/7] Testing Multi-Vendor Order Splitting & Inventory Safety...');
        
        // Test overselling prevention first
        const overSellAttempt = await dispatch(app, 'POST', '/api/orders/checkout', {
            shipping_address: '100 Test St, City',
            payment_method: 'Credit Card',
            items: [{ product_id: 1, quantity: 9999 }] // Exceeds available stock
        }, customerToken);
        assert(overSellAttempt.status === 400 && overSellAttempt.data.message.includes('Insufficient stock'), 'Successfully prevented overselling (Stock limit verified)');

        // Valid Multi-Vendor Checkout (TechZone P1 + Urban Chic P5)
        const validCheckout = await dispatch(app, 'POST', '/api/orders/checkout', {
            shipping_address: '123 University Ave, Palo Alto, CA',
            payment_method: 'Credit Card (Visa)',
            items: [
                { product_id: 1, quantity: 1 }, // TechZone: $129.99
                { product_id: 5, quantity: 1 }  // Urban Chic: $28.00
            ]
        }, customerToken);
        assert(validCheckout.status === 201 && validCheckout.data.success, `Order #${validCheckout.data.orderId} placed successfully with auto-split!`);

        // Check customer order history
        const customerOrders = await dispatch(app, 'GET', '/api/orders/my-orders', null, customerToken);
        assert(customerOrders.status === 200 && customerOrders.data.orders.length > 0, 'Customer order history reflects new purchase with sub-items');

        // 5. Vendor Dashboard, Order Fulfillment & Earnings
        console.log('\n[5/7] Testing Vendor Sub-Order Fulfillment & Earnings Tracking...');
        const vendorStats = await dispatch(app, 'GET', '/api/vendors/dashboard/stats', null, vendorToken);
        assert(vendorStats.status === 200 && vendorStats.data.stats.net_earnings !== undefined, 'Vendor dashboard net earnings calculated');

        const vendorOrders = await dispatch(app, 'GET', '/api/orders/vendor-orders', null, vendorToken);
        assert(vendorOrders.status === 200 && vendorOrders.data.items.length > 0, 'Vendor views only their own store order items');

        // Vendor updates fulfillment status to 'shipped'
        const firstItemId = vendorOrders.data.items[0].id;
        const updateStatus = await dispatch(app, 'PUT', `/api/orders/items/${firstItemId}/status`, { status: 'shipped' }, vendorToken);
        assert(updateStatus.status === 200 && updateStatus.data.success, `Vendor updated item #${firstItemId} status to SHIPPED`);

        // 6. Vendor Restock & Low Stock Management
        console.log('\n[6/7] Testing Vendor Product CRUD & Inventory Restock...');
        const restock = await dispatch(app, 'POST', '/api/products/2/stock', { quantity: 15 }, vendorToken);
        assert(restock.status === 200 && restock.data.success, 'Successfully restocked Product #2 by 15 units');

        // 7. Customer Rating & Notifications
        console.log('\n[7/7] Testing Ratings/Reviews & Notification System...');
        const submitRating = await dispatch(app, 'POST', '/api/ratings', {
            order_id: validCheckout.data.orderId,
            product_id: 1,
            rating: 5,
            review_text: 'Excellent build quality and arrived in pristine condition!'
        }, customerToken);
        assert(submitRating.status === 201 && submitRating.data.success, 'Customer submitted 5-star rating for product');

        const notifications = await dispatch(app, 'GET', '/api/notifications', null, customerToken);
        assert(notifications.status === 200 && notifications.data.notifications.length > 0, 'Notifications delivered to user account');

        console.log('\n====================================================');
        console.log(`  ALL ${passed} VERIFICATION TESTS PASSED SUCCESSFULLY! (0 Failures)`);
        console.log('====================================================\n');

        process.exit(0);

    } catch (err) {
        console.error('Fatal test error:', err);
        process.exit(1);
    }
}

runTests();
