const jwt = require('jsonwebtoken');
const config = require('../config/config');
const db = require('../../database/db');

async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access denied: Authentication token required.' });
    }

    try {
        const decoded = jwt.verify(token, config.JWT_SECRET);
        req.user = decoded;

        // If user is a vendor, ensure vendor_id is attached
        if (req.user.role === 'vendor' && !req.user.vendorId) {
            const [vendors] = await db.query('SELECT id, status, store_name FROM vendors WHERE user_id = ?', [req.user.id]);
            if (vendors && vendors.length > 0) {
                req.user.vendorId = vendors[0].id;
                req.user.vendorStatus = vendors[0].status;
                req.user.storeName = vendors[0].store_name;
            }
        }

        next();
    } catch (err) {
        return res.status(403).json({ success: false, message: 'Invalid or expired token. Please log in again.' });
    }
}

function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Forbidden: Access restricted to roles [${allowedRoles.join(', ')}]. Your role: ${req.user ? req.user.role : 'unauthenticated'}.`
            });
        }
        next();
    };
}

module.exports = {
    authenticateToken,
    requireRole
};
