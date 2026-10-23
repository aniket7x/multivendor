// Admin Dashboard & Reports Controller
const Admin = {
    currentTab: 'vendors',

    init() {
        this.bindEvents();
    },

    bindEvents() {
        // Report tab switching
        document.querySelectorAll('.admin-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                this.switchTab(tab);
            });
        });
    },

    switchTab(tab) {
        this.currentTab = tab;
        document.querySelectorAll('.admin-tab-btn').forEach(btn => {
            if (btn.dataset.tab === tab) {
                btn.classList.add('bg-indigo-600', 'text-white');
                btn.classList.remove('bg-white', 'text-slate-700');
            } else {
                btn.classList.remove('bg-indigo-600', 'text-white');
                btn.classList.add('bg-white', 'text-slate-700');
            }
        });

        document.querySelectorAll('.admin-tab-pane').forEach(pane => {
            if (pane.id === `admin-tab-pane-${tab}`) {
                pane.classList.remove('hidden');
            } else {
                pane.classList.add('hidden');
            }
        });

        if (tab === 'vendors') this.loadVendors();
        else if (tab === 'performance') this.loadVendorPerformanceReport();
        else if (tab === 'monthly') this.loadMonthlyRevenueReport();
        else if (tab === 'lowstock') this.loadLowStockReport();
        else if (tab === 'orders') this.loadGlobalOrders();
        else if (tab === 'payments') this.loadPaymentsLedger();
    },

    async loadDashboard() {
        const user = API.getUser();
        if (!user || user.role !== 'admin') return;

        await Promise.all([
            this.loadMetrics(),
            this.loadVendors()
        ]);
    },

    async loadMetrics() {
        try {
            const res = await API.get('/admin/metrics');
            if (!res.success) return;

            const m = res.metrics;
            document.getElementById('admin-stat-gmv').innerText = `$${parseFloat(m.gross_merchandise_value || 0).toFixed(2)}`;
            document.getElementById('admin-stat-revenue').innerText = `$${parseFloat(m.platform_revenue || 0).toFixed(2)}`;
            document.getElementById('admin-stat-orders').innerText = m.total_orders || 0;
            document.getElementById('admin-stat-vendors').innerText = `${m.vendors?.approved || 0} active (${m.vendors?.pending || 0} pending)`;
            document.getElementById('admin-stat-customers').innerText = m.total_customers || 0;
            document.getElementById('admin-stat-lowstock').innerText = m.low_stock_count || 0;

            const pendingAlert = document.getElementById('admin-pending-badge');
            if (pendingAlert) {
                if (m.vendors?.pending > 0) {
                    pendingAlert.innerText = `${m.vendors.pending} Pending`;
                    pendingAlert.classList.remove('hidden');
                } else {
                    pendingAlert.classList.add('hidden');
                }
            }
        } catch (err) {
            console.error('Failed to load admin metrics:', err);
        }
    },

    async loadVendors() {
        const tbody = document.getElementById('admin-vendors-table-body');
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-slate-400">Loading vendors list...</td></tr>`;

        try {
            const res = await API.get('/admin/vendors');
            if (!res.success) return;

            const vendors = res.vendors || [];
            if (vendors.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-slate-400">No vendors registered yet.</td></tr>`;
                return;
            }

            tbody.innerHTML = vendors.map(v => `
                <tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-100 last:border-0 ${v.status === 'pending' ? 'bg-amber-50/40' : ''}">
                    <td class="py-3.5 px-4">
                        <div class="font-bold text-slate-900 text-sm">${escapeHtml(v.store_name)}</div>
                        <div class="text-xs text-slate-500">${escapeHtml(v.store_description || 'No description')}</div>
                    </td>
                    <td class="py-3.5 px-4">
                        <div class="text-xs font-bold text-slate-800">${escapeHtml(v.owner_name)}</div>
                        <div class="text-[11px] text-slate-400">${escapeHtml(v.owner_email)}</div>
                    </td>
                    <td class="py-3.5 px-4 text-xs font-semibold text-slate-700">${v.products_count || 0} products</td>
                    <td class="py-3.5 px-4 font-bold text-slate-900 text-xs">$${parseFloat(v.total_earnings || 0).toFixed(2)}</td>
                    <td class="py-3.5 px-4">
                        <span class="px-2.5 py-1 text-xs font-bold rounded-lg ${
                            v.status === 'approved' ? 'badge-approved' :
                            v.status === 'rejected' ? 'badge-rejected' : 'badge-pending'
                        }">
                            ${v.status.toUpperCase()}
                        </span>
                    </td>
                    <td class="py-3.5 px-4 text-right space-x-1">
                        ${v.status === 'pending' ? `
                            <button onclick="Admin.updateVendorStatus(${v.id}, 'approved')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-2xs">
                                ✓ Approve
                            </button>
                            <button onclick="Admin.updateVendorStatus(${v.id}, 'rejected')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors shadow-2xs">
                                ✕ Reject
                            </button>
                        ` : `
                            <button onclick="Admin.updateVendorStatus(${v.id}, '${v.status === 'approved' ? 'pending' : 'approved'}')" class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors">
                                Toggle Status
                            </button>
                        `}
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-rose-500">Failed: ${err.message}</td></tr>`;
        }
    },

    async updateVendorStatus(vendorId, newStatus) {
        try {
            const res = await API.put(`/admin/vendors/${vendorId}/status`, { status: newStatus });
            showToast(res.message, 'success');
            await this.loadMetrics();
            await this.loadVendors();
            Customer.loadProducts();
        } catch (err) {
            showToast(err.message || 'Status update failed', 'error');
        }
    },

    async loadVendorPerformanceReport() {
        const tbody = document.getElementById('report-performance-tbody');
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="7" class="py-12 text-center text-slate-400">Loading view: vw_vendor_performance...</td></tr>`;

        try {
            const res = await API.get('/admin/reports/vendor-sales');
            if (!res.success) return;

            tbody.innerHTML = res.report.map(v => `
                <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                    <td class="py-3 px-4 font-bold text-slate-800 text-xs">${escapeHtml(v.store_name)}</td>
                    <td class="py-3 px-4 text-xs font-medium text-slate-600">${v.total_orders} orders (${v.total_units_sold} units)</td>
                    <td class="py-3 px-4 text-xs font-extrabold text-slate-900">$${parseFloat(v.gross_sales).toFixed(2)}</td>
                    <td class="py-3 px-4 text-xs font-bold text-indigo-600">$${parseFloat(v.total_commission_paid).toFixed(2)} (10%)</td>
                    <td class="py-3 px-4 text-xs font-bold text-emerald-600">$${parseFloat(v.net_earnings).toFixed(2)}</td>
                    <td class="py-3 px-4 text-xs font-semibold text-amber-500">★ ${v.avg_rating} (${v.review_count})</td>
                    <td class="py-3 px-4">
                        <span class="px-2 py-0.5 text-xs font-bold rounded-md ${v.vendor_status === 'approved' ? 'badge-approved' : 'badge-pending'}">
                            ${v.vendor_status}
                        </span>
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" class="py-12 text-center text-rose-500">Failed: ${err.message}</td></tr>`;
        }
    },

    async loadMonthlyRevenueReport() {
        const tbody = document.getElementById('report-monthly-tbody');
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="5" class="py-12 text-center text-slate-400">Loading view: vw_monthly_platform_revenue...</td></tr>`;

        try {
            const res = await API.get('/admin/reports/monthly-revenue');
            if (!res.success) return;

            if (res.revenue.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400">No monthly sales data recorded yet.</td></tr>`;
                return;
            }

            tbody.innerHTML = res.revenue.map(m => `
                <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                    <td class="py-3 px-4 font-bold text-slate-800 text-xs">${m.sales_month}</td>
                    <td class="py-3 px-4 text-xs font-semibold text-slate-700">${m.total_orders} orders</td>
                    <td class="py-3 px-4 text-xs font-extrabold text-slate-900">$${parseFloat(m.gross_merchandise_value).toFixed(2)}</td>
                    <td class="py-3 px-4 text-xs font-extrabold text-indigo-600">+$${parseFloat(m.platform_commission_revenue).toFixed(2)} (10%)</td>
                    <td class="py-3 px-4 text-xs font-bold text-emerald-600">$${parseFloat(m.total_vendor_payouts).toFixed(2)}</td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="5" class="py-12 text-center text-rose-500">Failed: ${err.message}</td></tr>`;
        }
    },

    async loadLowStockReport() {
        const tbody = document.getElementById('report-lowstock-tbody');
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-slate-400">Loading view: vw_low_stock_products...</td></tr>`;

        try {
            const res = await API.get('/admin/reports/low-stock');
            if (!res.success) return;

            if (res.alerts.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-emerald-600 font-medium">✓ All products across all vendors are healthy and above low-stock thresholds!</td></tr>`;
                return;
            }

            tbody.innerHTML = res.alerts.map(a => `
                <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                    <td class="py-3 px-4 font-bold text-slate-800 text-xs">${escapeHtml(a.product_name)}</td>
                    <td class="py-3 px-4 text-xs text-slate-600">${escapeHtml(a.category_name)}</td>
                    <td class="py-3 px-4 text-xs font-semibold text-indigo-600">${escapeHtml(a.store_name)} (${escapeHtml(a.vendor_email)})</td>
                    <td class="py-3 px-4 text-xs font-extrabold text-rose-600">${a.stock_quantity} left</td>
                    <td class="py-3 px-4 text-xs font-medium text-slate-500">Threshold: ${a.low_stock_threshold}</td>
                    <td class="py-3 px-4">
                        <span class="px-2 py-0.5 text-xs font-bold rounded-md bg-amber-100 text-amber-800">
                            Deficit: ${a.deficit_quantity}
                        </span>
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-rose-500">Failed: ${err.message}</td></tr>`;
        }
    },

    async loadGlobalOrders() {
        const tbody = document.getElementById('report-orders-tbody');
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-slate-400">Loading orders...</td></tr>`;

        try {
            const res = await API.get('/admin/reports/orders');
            if (!res.success) return;

            tbody.innerHTML = res.orders.map(o => `
                <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                    <td class="py-3 px-4 font-bold text-slate-800 text-xs">#${o.id}</td>
                    <td class="py-3 px-4 text-xs text-slate-600">${o.created_at}</td>
                    <td class="py-3 px-4 text-xs font-bold text-slate-800">${escapeHtml(o.customer_name)} (${escapeHtml(o.customer_email)})</td>
                    <td class="py-3 px-4 text-xs font-extrabold text-slate-900">$${parseFloat(o.total_amount).toFixed(2)}</td>
                    <td class="py-3 px-4 text-xs font-medium text-slate-600">${o.payment_method.toUpperCase()}</td>
                    <td class="py-3 px-4">
                        <span class="px-2 py-0.5 text-xs font-bold rounded-md ${o.status === 'completed' ? 'badge-delivered' : 'badge-pending'}">
                            ${o.status.toUpperCase()}
                        </span>
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-rose-500">Failed: ${err.message}</td></tr>`;
        }
    },

    async loadPaymentsLedger() {
        const tbody = document.getElementById('report-payments-tbody');
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-slate-400">Loading financial ledger...</td></tr>`;

        try {
            const res = await API.get('/admin/reports/payments');
            if (!res.success) return;

            tbody.innerHTML = res.payments.map(p => `
                <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                    <td class="py-3 px-4 font-mono text-xs font-bold text-slate-700">${escapeHtml(p.transaction_id)}</td>
                    <td class="py-3 px-4 text-xs font-bold text-slate-800">Order #${p.order_id}</td>
                    <td class="py-3 px-4 text-xs text-slate-600">${escapeHtml(p.customer_name)}</td>
                    <td class="py-3 px-4 text-xs font-extrabold text-slate-900">$${parseFloat(p.amount).toFixed(2)}</td>
                    <td class="py-3 px-4 text-xs font-medium text-slate-600">${escapeHtml(p.payment_method)}</td>
                    <td class="py-3 px-4">
                        <span class="px-2 py-0.5 text-xs font-bold rounded-md badge-completed">
                            ${p.payment_status.toUpperCase()}
                        </span>
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-rose-500">Failed: ${err.message}</td></tr>`;
        }
    }
};
