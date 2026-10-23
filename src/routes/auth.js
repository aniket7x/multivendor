const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../database/db');
const config = require('../config/config');
const { authenticateToken } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, role = 'customer', phone, address, store_name, store_description } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
        }

        const validRole = ['customer', 'vendor'].includes(role) ? role : 'customer';

        // Check if email already registered
        const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing && existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Email address is already registered.' });
        }

        const password_hash = await bcrypt.hash(password, 10);

        let newUserId;
        if (db.isUsingMysql()) {
            const [userResult] = await db.query(
                'INSERT INTO users (name, email, password_hash, role, phone, address) VALUES (?, ?, ?, ?, ?, ?)',
                [name, email, password_hash, validRole, phone || null, address || null]
            );
            newUserId = userResult.insertId;
        } else {
            newUserId = db.memoryDb.nextIds.users++;
            const newUser = {
                id: newUserId,
                name,
                email,
                password_hash,
                role: validRole,
                phone: phone || null,
                address: address || null,
                created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
            };
            db.memoryDb.users.push(newUser);
        }

        let vendorRecord = null;
        if (validRole === 'vendor') {
            const storeName = store_name || `${name}'s Store`;
            const storeDesc = store_description || 'New vendor store on MarketHub.';

            if (db.isUsingMysql()) {
                const [vResult] = await db.query(
                    'INSERT INTO vendors (user_id, store_name, store_description, status, commission_rate) VALUES (?, ?, ?, ?, ?)',
                    [newUserId, storeName, storeDesc, 'pending', config.PLATFORM_COMMISSION_PERCENT]
                );
                vendorRecord = { id: vResult.insertId, store_name: storeName, status: 'pending' };

                // Notify admin about new vendor
                const [admins] = await db.query("SELECT id FROM users WHERE role = 'admin'");
                for (const admin of admins) {
                    await db.query(
                        'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
                        [admin.id, 'New Vendor Application', `Vendor "${storeName}" (${name}) has registered and requires approval.`, 'system']
                    );
                }
            } else {
                const vendorId = db.memoryDb.nextIds.vendors++;
                vendorRecord = {
                    id: vendorId,
                    user_id: newUserId,
                    store_name: storeName,
                    store_description: storeDesc,
                    status: 'pending',
                    commission_rate: config.PLATFORM_COMMISSION_PERCENT,
                    total_earnings: 0.00,
                    created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
                };
                db.memoryDb.vendors.push(vendorRecord);

                // Notify admins in memory
                db.memoryDb.users.filter(u => u.role === 'admin').forEach(admin => {
                    db.memoryDb.notifications.push({
                        id: db.memoryDb.nextIds.notifications++,
                        user_id: admin.id,
                        title: 'New Vendor Application',
                        message: `Vendor "${storeName}" (${name}) has registered and requires approval.`,
                        type: 'system',
                        is_read: 0,
                        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
                    });
                });
            }
        }

        // Generate token
        const tokenPayload = {
            id: newUserId,
            email,
            role: validRole,
            name,
            vendorId: vendorRecord ? vendorRecord.id : null,
            vendorStatus: vendorRecord ? vendorRecord.status : null
        };
        const token = jwt.sign(tokenPayload, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });

        return res.status(201).json({
            success: true,
            message: validRole === 'vendor' 
                ? 'Vendor account registered! Awaiting admin approval before publishing products.' 
                : 'Registration successful! Welcome to MarketHub.',
            token,
            user: tokenPayload
        });
    } catch (err) {
        console.error('Registration error:', err);
        return res.status(500).json({ success: false, message: 'Server error during registration: ' + err.message });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required.' });
        }

        let user;
        if (db.isUsingMysql()) {
            const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
            user = users && users[0];
        } else {
            user = db.memoryDb.users.find(u => u.email.toLowerCase() === email.toLowerCase());
        }

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials. User not found.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        let vendorData = null;
        if (user.role === 'vendor') {
            if (db.isUsingMysql()) {
                const [vendors] = await db.query('SELECT id, store_name, status, commission_rate, total_earnings FROM vendors WHERE user_id = ?', [user.id]);
                vendorData = vendors && vendors[0];
            } else {
                vendorData = db.memoryDb.vendors.find(v => v.user_id === user.id);
            }
        }

        const tokenPayload = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            vendorId: vendorData ? vendorData.id : null,
            vendorStatus: vendorData ? vendorData.status : null,
            storeName: vendorData ? vendorData.store_name : null
        };

        const token = jwt.sign(tokenPayload, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });

        return res.json({
            success: true,
            message: `Welcome back, ${user.name}!`,
            token,
            user: tokenPayload,
            vendor: vendorData
        });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ success: false, message: 'Server error during login: ' + err.message });
    }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
    try {
        let user;
        let vendor = null;
        let unreadNotificationsCount = 0;

        if (db.isUsingMysql()) {
            const [users] = await db.query('SELECT id, name, email, role, phone, address, created_at FROM users WHERE id = ?', [req.user.id]);
            user = users && users[0];
            if (user && user.role === 'vendor') {
                const [vendors] = await db.query('SELECT * FROM vendors WHERE user_id = ?', [user.id]);
                vendor = vendors && vendors[0];
            }
            const [notes] = await db.query('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE', [req.user.id]);
            unreadNotificationsCount = notes[0]?.count || 0;
        } else {
            const u = db.memoryDb.users.find(usr => usr.id === req.user.id);
            if (u) {
                user = { id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone, address: u.address, created_at: u.created_at };
                if (u.role === 'vendor') {
                    vendor = db.memoryDb.vendors.find(v => v.user_id === u.id);
                }
            }
            unreadNotificationsCount = db.memoryDb.notifications.filter(n => n.user_id === req.user.id && !n.is_read).length;
        }

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        res.json({
            success: true,
            user: {
                ...user,
                vendorId: vendor ? vendor.id : null,
                vendorStatus: vendor ? vendor.status : null,
                storeName: vendor ? vendor.store_name : null,
                unreadNotifications: unreadNotificationsCount
            },
            vendor
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/auth/demo-login
// One-click login for evaluators & testing!
router.post('/demo-login', async (req, res) => {
    const { role = 'admin', vendorIndex = 0 } = req.body;

    let targetEmail;
    if (role === 'admin') {
        targetEmail = 'admin@markethub.com';
    } else if (role === 'vendor') {
        const vendorEmails = ['tech@zone.com', 'fashion@hub.com', 'home@living.com', 'pending@artisan.com'];
        targetEmail = vendorEmails[vendorIndex] || vendorEmails[0];
    } else {
        targetEmail = 'alice@gmail.com';
    }

    // Direct token minting for demo convenience
    try {
        let user;
        let vendorData = null;

        if (db.isUsingMysql()) {
            const [users] = await db.query('SELECT * FROM users WHERE email = ?', [targetEmail]);
            user = users && users[0];
            if (user && user.role === 'vendor') {
                const [vendors] = await db.query('SELECT * FROM vendors WHERE user_id = ?', [user.id]);
                vendorData = vendors && vendors[0];
            }
        } else {
            user = db.memoryDb.users.find(u => u.email === targetEmail);
            if (user && user.role === 'vendor') {
                vendorData = db.memoryDb.vendors.find(v => v.user_id === user.id);
            }
        }

        if (!user) {
            return res.status(404).json({ success: false, message: `Demo user ${targetEmail} not found.` });
        }

        const tokenPayload = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            vendorId: vendorData ? vendorData.id : null,
            vendorStatus: vendorData ? vendorData.status : null,
            storeName: vendorData ? vendorData.store_name : null
        };

        const token = jwt.sign(tokenPayload, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });

        return res.json({
            success: true,
            message: `Logged in as demo ${user.role} (${user.name})`,
            token,
            user: tokenPayload,
            vendor: vendorData
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
