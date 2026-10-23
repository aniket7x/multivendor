const express = require('express');
const router = express.Router();
const db = require('../../database/db');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// GET /api/notifications (User's notifications)
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;

        if (db.isUsingMysql()) {
            const [notifications] = await db.query(`
                SELECT * FROM notifications 
                WHERE user_id = ? 
                ORDER BY created_at DESC 
                LIMIT 50
            `, [userId]);

            const unreadCount = notifications.filter(n => !n.is_read).length;
            return res.json({ success: true, notifications, unreadCount });
        } else {
            const notifications = db.memoryDb.notifications
                .filter(n => n.user_id === userId)
                .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

            const unreadCount = notifications.filter(n => !n.is_read).length;
            return res.json({ success: true, notifications, unreadCount });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', async (req, res) => {
    try {
        const noteId = parseInt(req.params.id, 10);
        const userId = req.user.id;

        if (db.isUsingMysql()) {
            await db.query('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', [noteId, userId]);
        } else {
            const note = db.memoryDb.notifications.find(n => n.id === noteId && n.user_id === userId);
            if (note) note.is_read = 1;
        }

        res.json({ success: true, message: 'Notification marked as read.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/notifications/mark-all-read
router.put('/mark-all-read', async (req, res) => {
    try {
        const userId = req.user.id;

        if (db.isUsingMysql()) {
            await db.query('UPDATE notifications SET is_read = TRUE WHERE user_id = ?', [userId]);
        } else {
            db.memoryDb.notifications.forEach(n => {
                if (n.user_id === userId) n.is_read = 1;
            });
        }

        res.json({ success: true, message: 'All notifications marked as read.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
