// Main Application Orchestrator
const App = {
    currentView: 'catalog',

    init() {
        Auth.init();
        Customer.init();
        Vendor.init();
        Admin.init();

        this.bindEvents();
        this.fetchSystemInfo();
        this.loadNotifications();

        // Check for view in URL hash or default to catalog
        const hash = window.location.hash.replace('#', '');
        if (['catalog', 'orders', 'vendor', 'admin'].includes(hash)) {
            this.switchView(hash);
        } else {
            this.switchView('catalog');
        }
    },

    bindEvents() {
        // Navigation links
        document.getElementById('nav-catalog')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.switchView('catalog');
        });
        document.getElementById('nav-my-orders')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.switchView('orders');
        });
        document.getElementById('nav-vendor-portal')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.switchView('vendor');
        });
        document.getElementById('nav-admin-portal')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.switchView('admin');
        });

        // Notifications Drawer Toggle
        document.getElementById('btn-open-notifications')?.addEventListener('click', () => this.toggleNotifications(true));
        document.getElementById('btn-close-notifications')?.addEventListener('click', () => this.toggleNotifications(false));
        document.getElementById('btn-mark-all-notifications')?.addEventListener('click', () => this.markAllNotificationsRead());

        // Keyboard Escape closes drawers & modals
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                Customer.toggleCart(false);
                this.toggleNotifications(false);
                document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
            }
        });
    },

    switchView(viewName) {
        this.currentView = viewName;
        window.location.hash = viewName;

        // Hide all views
        document.querySelectorAll('.app-view').forEach(view => {
            view.classList.add('hidden');
        });

        // Show target view
        const targetView = document.getElementById(`view-${viewName}`);
        if (targetView) {
            targetView.classList.remove('hidden');
            targetView.classList.add('tab-content');
        }

        // Update nav active states
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('text-indigo-600', 'font-bold');
            link.classList.add('text-slate-600', 'font-medium');
        });
        const activeLink = document.getElementById(`nav-${viewName === 'orders' ? 'my-orders' : viewName === 'vendor' ? 'vendor-portal' : viewName === 'admin' ? 'admin-portal' : 'catalog'}`);
        if (activeLink) {
            activeLink.classList.remove('text-slate-600', 'font-medium');
            activeLink.classList.add('text-indigo-600', 'font-bold');
        }

        // View-specific data loads
        if (viewName === 'catalog') {
            Customer.loadProducts();
        } else if (viewName === 'orders') {
            Customer.loadCustomerOrders();
        } else if (viewName === 'vendor') {
            Vendor.loadDashboard();
        } else if (viewName === 'admin') {
            Admin.loadDashboard();
        }
    },

    async fetchSystemInfo() {
        try {
            const res = await API.get('/system/info');
            if (res.success) {
                const badge = document.getElementById('db-status-badge');
                if (badge) {
                    if (res.isMysqlActive) {
                        badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span><span>MySQL Active (${res.commissionRate} Comm.)</span>`;
                        badge.className = 'inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs';
                    } else {
                        badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-indigo-500"></span><span>Demo Engine Active (${res.commissionRate} Comm.)</span>`;
                        badge.className = 'inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs';
                    }
                }
            }
        } catch (err) {
            console.error('System info fetch error:', err);
        }
    },

    async loadNotifications() {
        const token = API.getToken();
        if (!token) return;

        try {
            const res = await API.get('/notifications');
            if (!res.success) return;

            const badge = document.getElementById('notifications-badge');
            if (badge) {
                if (res.unreadCount > 0) {
                    badge.innerText = res.unreadCount;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }

            const list = document.getElementById('notifications-list');
            if (!list) return;

            if (res.notifications.length === 0) {
                list.innerHTML = `
                    <div class="py-12 text-center text-slate-400">
                        <span class="text-3xl block mb-2">🔔</span>
                        <p class="text-xs">No notifications yet.</p>
                    </div>
                `;
                return;
            }

            list.innerHTML = res.notifications.map(n => `
                <div onclick="App.markNotificationRead(${n.id})" class="p-3.5 rounded-xl border transition-colors cursor-pointer ${
                    !n.is_read ? 'bg-indigo-50/60 border-indigo-100 hover:bg-indigo-50' : 'bg-white border-slate-100 hover:bg-slate-50'
                }">
                    <div class="flex items-start justify-between gap-2">
                        <div class="flex items-center space-x-2">
                            <span class="text-xs">${n.type === 'inventory' ? '⚠️' : n.type === 'payment' ? '💳' : n.type === 'system' ? '⚙️' : '📦'}</span>
                            <h5 class="text-xs font-bold text-slate-900">${escapeHtml(n.title)}</h5>
                        </div>
                        ${!n.is_read ? '<span class="w-2 h-2 rounded-full bg-indigo-600 flex-shrink-0 mt-1"></span>' : ''}
                    </div>
                    <p class="text-xs text-slate-600 mt-1 line-clamp-3">${escapeHtml(n.message)}</p>
                    <span class="text-[10px] text-slate-400 block mt-1.5">${n.created_at}</span>
                </div>
            `).join('');
        } catch (err) {
            console.error('Error loading notifications:', err);
        }
    },

    toggleNotifications(open) {
        const drawer = document.getElementById('notifications-drawer');
        const backdrop = document.getElementById('notifications-backdrop');
        if (open) {
            this.loadNotifications();
            drawer?.classList.remove('translate-x-full');
            backdrop?.classList.remove('hidden');
        } else {
            drawer?.classList.add('translate-x-full');
            backdrop?.classList.add('hidden');
        }
    },

    async markNotificationRead(id) {
        try {
            await API.put(`/notifications/${id}/read`);
            this.loadNotifications();
        } catch (err) {
            console.error(err);
        }
    },

    async markAllNotificationsRead() {
        try {
            await API.put('/notifications/mark-all-read');
            showToast('All notifications marked as read', 'info');
            this.loadNotifications();
        } catch (err) {
            console.error(err);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
