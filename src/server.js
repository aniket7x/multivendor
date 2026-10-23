const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config/config');
const db = require('../database/db');

// Route imports
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const vendorRoutes = require('./routes/vendors');
const adminRoutes = require('./routes/admin');
const ratingRoutes = require('./routes/ratings');
const notificationRoutes = require('./routes/notifications');

const app = express();

// Global Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, '../public')));

// System info endpoint (for verification & UI badges)
app.get('/api/system/info', (req, res) => {
    res.json({
        success: true,
        system: 'Multi-Vendor Management System (DBMS Project)',
        version: '1.0.0',
        dbEngine: db.isUsingMysql() ? 'MySQL (Direct Pool Connection)' : 'Demo Relational Engine (Schema-Compliant)',
        isMysqlActive: db.isUsingMysql(),
        commissionRate: `${config.PLATFORM_COMMISSION_PERCENT}%`,
        status: 'Operational',
        timestamp: new Date().toISOString()
    });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/notifications', notificationRoutes);

// Catch-all route for Single Page Application
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled Server Error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error'
    });
});

// Start Server
app.listen(config.PORT, () => {
    console.log('====================================================');
    console.log(`  MarketHub Multi-Vendor Management System`);
    console.log(`  Server listening on: http://localhost:${config.PORT}`);
    console.log(`  Database Status: ${db.isUsingMysql() ? 'Connected to MySQL' : 'Using Sample Dataset'}`);
    console.log('====================================================\n');
});

module.exports = app;
