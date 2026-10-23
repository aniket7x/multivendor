// Vendor Portal Controller
const Vendor = {
    init() {
        this.bindEvents();
    },

    bindEvents() {
        document.getElementById('btn-open-add-product')?.addEventListener('click', () => this.openProductModal());
        document.getElementById('form-product-crud')?.addEventListener('submit', (e) => this.handleSaveProduct(e));
        document.getElementById('form-restock-product')?.addEventListener('submit', (e) => this.handleRestockSubmit(e));
    },

    async loadDashboard() {
        const user = API.getUser();
        if (!user || user.role !== 'vendor') return;

        // Populate category dropdown in product modal
        this.populateCategorySelect();

        // Check pending status
        const pendingBanner = document.getElementById('vendor-pending-banner');
        const mainContent = document.getElementById('vendor-portal-content');

        if (user.vendorStatus === 'pending') {
            pendingBanner?.classList.remove('hidden');
            mainContent?.classList.add('opacity-40', 'pointer-events-none');
            showToast('Your vendor application is pending administrator review.', 'warning');
        } else {
            pendingBanner?.classList.add('hidden');
            mainContent?.classList.remove('opacity-40', 'pointer-events-none');
        }

        const storeTitleElem = document.getElementById('vendor-store-title');
        if (storeTitleElem) storeTitleElem.innerText = user.storeName || 'Vendor Dashboard';

        await Promise.all([
            this.loadStats(),
            this.loadVendorProducts(),
            this.loadVendorOrders()
        ]);
    },

    async loadStats() {
        try {
            const res = await API.get('/vendors/dashboard/stats');
            if (!res.success) return;

            const s = res.stats;
            document.getElementById('vendor-stat-gross').innerText = `$${parseFloat(s.gross_sales || 0).toFixed(2)}`;
            document.getElementById('vendor-stat-fee').innerText = `-$${parseFloat(s.total_commission_paid || 0).toFixed(2)}`;
            document.getElementById('vendor-stat-net').innerText = `$${parseFloat(s.net_earnings || 0).toFixed(2)}`;
            document.getElementById('vendor-stat-rating').innerText = `★ ${s.avg_rating} (${s.total_reviews} reviews)`;

            document.getElementById('vendor-stat-pending-orders').innerText = s.statusCounts?.pending || 0;
            document.getElementById('vendor-stat-shipped-orders').innerText = s.statusCounts?.shipped || 0;
            document.getElementById('vendor-stat-delivered-orders').innerText = s.statusCounts?.delivered || 0;

            // Low Stock Alert Banner
            const alertContainer = document.getElementById('vendor-low-stock-container');
            if (alertContainer) {
                if (s.lowStockAlerts && s.lowStockAlerts.length > 0) {
                    alertContainer.classList.remove('hidden');
                    alertContainer.innerHTML = `
                        <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                            <div class="flex items-center space-x-3">
                                <span class="text-2xl">⚠️</span>
                                <div>
                                    <h4 class="font-bold text-amber-900 text-sm">Low Stock Alert! (${s.lowStockAlerts.length} items need restock)</h4>
                                    <p class="text-xs text-amber-700 mt-0.5">
                                        ${s.lowStockAlerts.map(i => `<b>${escapeHtml(i.name)}</b> (${i.stock_quantity} left)`).join(', ')}
                                    </p>
                                </div>
                            </div>
                            <button onclick="Vendor.openRestockModal(${s.lowStockAlerts[0].id}, '${escapeHtml(s.lowStockAlerts[0].name)}', ${s.lowStockAlerts[0].stock_quantity})" class="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs whitespace-nowrap">
                                Restock Product
                            </button>
                        </div>
                    `;
                } else {
                    alertContainer.classList.add('hidden');
                }
            }
        } catch (err) {
            console.error('Failed to load vendor stats:', err);
        }
    },

    async loadVendorProducts() {
        const tableBody = document.getElementById('vendor-products-table-body');
        if (!tableBody) return;

        const user = API.getUser();
        if (!user || !user.vendorId) return;

        try {
            const res = await API.get(`/vendors/${user.vendorId}`);
            if (!res.success) return;

            const products = res.products || [];
            if (products.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="py-12 text-center text-slate-400 italic">No products listed yet. Click "+ Add New Product" to list your first item.</td>
                    </tr>
                `;
                return;
            }

            tableBody.innerHTML = products.map(p => {
                const isLow = p.stock_quantity <= 5;
                return `
                    <tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-100 last:border-0">
                        <td class="py-3.5 px-4">
                            <div class="flex items-center space-x-3">
                                <img src="${p.image_url}" class="w-10 h-10 rounded-lg object-cover flex-shrink-0" onerror="this.src='https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80'">
                                <div>
                                    <div class="font-bold text-slate-800 text-sm">${escapeHtml(p.name)}</div>
                                    <div class="text-[11px] text-slate-400">${p.created_at}</div>
                                </div>
                            </div>
                        </td>
                        <td class="py-3.5 px-4 font-extrabold text-slate-900">$${parseFloat(p.price).toFixed(2)}</td>
                        <td class="py-3.5 px-4">
                            <span class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${isLow ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-700'}">
                                ${isLow ? '⚠️ ' : ''}${p.stock_quantity} units
                            </span>
                        </td>
                        <td class="py-3.5 px-4">
                            <span class="px-2 py-0.5 text-xs font-semibold rounded-md ${p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}">
                                ${p.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </td>
                        <td class="py-3.5 px-4 text-right space-x-1">
                            <button onclick="Vendor.openRestockModal(${p.id}, '${escapeHtml(p.name)}', ${p.stock_quantity})" class="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors" title="Add Stock">
                                + Stock
                            </button>
                            <button onclick="Vendor.openEditProductModal(${JSON.stringify(p).replace(/"/g, '&quot;')})" class="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors">
                                Edit
                            </button>
                            <button onclick="Vendor.deleteProduct(${p.id}, '${escapeHtml(p.name)}')" class="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors">
                                Deactivate
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            console.error('Failed to load vendor products:', err);
        }
    },

    async loadVendorOrders() {
        const tableBody = document.getElementById('vendor-orders-table-body');
        if (!tableBody) return;

        try {
            const res = await API.get('/orders/vendor-orders');
            if (!res.success) return;

            const items = res.items || [];
            if (items.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="7" class="py-12 text-center text-slate-400 italic">No incoming orders yet. When customers buy your products, they will appear here.</td>
                    </tr>
                `;
                return;
            }

            tableBody.innerHTML = items.map(item => `
                <tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-100 last:border-0">
                    <td class="py-3.5 px-4">
                        <span class="font-bold text-slate-800 text-sm">#${item.order_id}</span>
                        <div class="text-[11px] text-slate-400">${item.order_date || item.created_at}</div>
                    </td>
                    <td class="py-3.5 px-4">
                        <div class="flex items-center space-x-2">
                            <img src="${item.image_url}" class="w-8 h-8 rounded-lg object-cover flex-shrink-0" onerror="this.src='https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80'">
                            <div>
                                <span class="font-bold text-xs text-slate-800 block truncate max-w-[160px]">${escapeHtml(item.product_name)}</span>
                                <span class="text-[11px] text-slate-500">Qty: ${item.quantity}</span>
                            </div>
                        </div>
                    </td>
                    <td class="py-3.5 px-4">
                        <div class="text-xs font-bold text-slate-800">${escapeHtml(item.customer_name)}</div>
                        <div class="text-[11px] text-slate-400 truncate max-w-[140px]">${escapeHtml(item.shipping_address)}</div>
                    </td>
                    <td class="py-3.5 px-4 font-bold text-slate-800 text-xs">$${parseFloat(item.subtotal).toFixed(2)}</td>
                    <td class="py-3.5 px-4">
                        <span class="text-xs font-extrabold text-emerald-600 block">+$${parseFloat(item.vendor_earnings).toFixed(2)}</span>
                        <span class="text-[10px] text-slate-400 block">Fee: $${parseFloat(item.platform_fee).toFixed(2)} (10%)</span>
                    </td>
                    <td class="py-3.5 px-4">
                        <span class="px-2.5 py-1 text-xs font-bold rounded-lg ${
                            item.item_status === 'delivered' ? 'badge-delivered' :
                            item.item_status === 'shipped' ? 'badge-shipped' :
                            item.item_status === 'processing' ? 'badge-processing' :
                            item.item_status === 'cancelled' ? 'badge-cancelled' : 'badge-pending'
                        }">
                            ${item.item_status.toUpperCase()}
                        </span>
                    </td>
                    <td class="py-3.5 px-4 text-right">
                        <select onchange="Vendor.updateItemStatus(${item.id}, this.value)" class="text-xs font-semibold px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 shadow-2xs hover:border-indigo-400 focus:outline-none">
                            <option value="pending" ${item.item_status === 'pending' ? 'selected' : ''}>Pending</option>
                            <option value="processing" ${item.item_status === 'processing' ? 'selected' : ''}>Processing</option>
                            <option value="shipped" ${item.item_status === 'shipped' ? 'selected' : ''}>Shipped</option>
                            <option value="delivered" ${item.item_status === 'delivered' ? 'selected' : ''}>Delivered</option>
                            <option value="cancelled" ${item.item_status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                        </select>
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            console.error('Failed to load vendor orders:', err);
        }
    },

    async updateItemStatus(itemId, newStatus) {
        try {
            const res = await API.put(`/orders/items/${itemId}/status`, { status: newStatus });
            showToast(res.message, 'success');
            await this.loadStats();
            await this.loadVendorOrders();
            await this.loadVendorProducts();
        } catch (err) {
            showToast(err.message || 'Failed to update order status', 'error');
            this.loadVendorOrders();
        }
    },

    populateCategorySelect() {
        const select = document.getElementById('crud-category-id');
        if (!select || select.children.length > 1) return;

        Customer.categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.innerText = cat.name;
            select.appendChild(opt);
        });
    },

    openProductModal(product = null) {
        this.populateCategorySelect();
        const modal = document.getElementById('modal-product-crud');
        const title = document.getElementById('modal-crud-title');
        const prodIdField = document.getElementById('crud-product-id');

        if (product) {
            title.innerText = 'Edit Product';
            prodIdField.value = product.id;
            document.getElementById('crud-name').value = product.name;
            document.getElementById('crud-description').value = product.description || '';
            document.getElementById('crud-price').value = product.price;
            document.getElementById('crud-category-id').value = product.category_id;
            document.getElementById('crud-image-url').value = product.image_url || '';
            document.getElementById('crud-stock-wrapper')?.classList.add('hidden');
        } else {
            title.innerText = 'Add New Product';
            prodIdField.value = '';
            document.getElementById('form-product-crud').reset();
            document.getElementById('crud-stock-wrapper')?.classList.remove('hidden');
        }

        modal?.classList.remove('hidden');
    },

    openEditProductModal(product) {
        this.openProductModal(product);
    },

    async handleSaveProduct(e) {
        e.preventDefault();
        const submitBtn = document.getElementById('btn-submit-product-crud');
        const prodId = document.getElementById('crud-product-id').value;
        const name = document.getElementById('crud-name').value.trim();
        const description = document.getElementById('crud-description').value.trim();
        const price = document.getElementById('crud-price').value;
        const category_id = document.getElementById('crud-category-id').value;
        const image_url = document.getElementById('crud-image-url').value.trim();
        const stock_quantity = document.getElementById('crud-initial-stock')?.value || 10;
        const low_stock_threshold = document.getElementById('crud-low-threshold')?.value || 5;

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="animate-spin inline-block mr-2">⟳</span> Saving...';

            if (prodId) {
                // Update
                const res = await API.put(`/products/${prodId}`, {
                    name,
                    description,
                    price,
                    category_id,
                    image_url
                });
                showToast(res.message, 'success');
            } else {
                // Create
                const res = await API.post('/products', {
                    name,
                    description,
                    price,
                    category_id,
                    image_url,
                    stock_quantity,
                    low_stock_threshold
                });
                showToast(res.message, 'success');
            }

            document.getElementById('modal-product-crud')?.classList.add('hidden');
            await this.loadVendorProducts();
            await this.loadStats();
            Customer.loadProducts();
        } catch (err) {
            showToast(err.message || 'Failed to save product', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Save Product';
        }
    },

    async deleteProduct(productId, productName) {
        if (!confirm(`Are you sure you want to deactivate "${productName}" from your store?`)) return;

        try {
            const res = await API.delete(`/products/${productId}`);
            showToast(res.message, 'info');
            await this.loadVendorProducts();
            Customer.loadProducts();
        } catch (err) {
            showToast(err.message || 'Failed to remove product', 'error');
        }
    },

    openRestockModal(productId, productName, currentStock) {
        document.getElementById('restock-product-id').value = productId;
        document.getElementById('restock-product-name').innerText = productName;
        document.getElementById('restock-current-stock').innerText = currentStock;
        document.getElementById('restock-add-quantity').value = 10;

        const modal = document.getElementById('modal-restock');
        if (modal) modal.classList.remove('hidden');
    },

    async handleRestockSubmit(e) {
        e.preventDefault();
        const submitBtn = document.getElementById('btn-submit-restock');
        const prodId = document.getElementById('restock-product-id').value;
        const quantity = document.getElementById('restock-add-quantity').value;

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="animate-spin inline-block mr-2">⟳</span> Updating stock...';

            const res = await API.post(`/products/${prodId}/stock`, { quantity });
            showToast(res.message, 'success');

            document.getElementById('modal-restock')?.classList.add('hidden');
            await this.loadStats();
            await this.loadVendorProducts();
            Customer.loadProducts();
        } catch (err) {
            showToast(err.message || 'Restock failed', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Confirm Restock';
        }
    }
};
