// Customer Marketplace, Cart & Orders Controller
const Customer = {
    cart: [],
    categories: [],
    currentProducts: [],

    init() {
        this.loadCartFromStorage();
        this.bindEvents();
        this.loadCategories();
        this.loadProducts();
    },

    bindEvents() {
        // Search & Filter listeners
        document.getElementById('input-search')?.addEventListener('input', debounce(() => this.loadProducts(), 300));
        document.getElementById('select-sort')?.addEventListener('change', () => this.loadProducts());
        document.getElementById('check-instock')?.addEventListener('change', () => this.loadProducts());

        // Cart Drawer
        document.getElementById('btn-open-cart')?.addEventListener('click', () => this.toggleCart(true));
        document.getElementById('btn-close-cart')?.addEventListener('click', () => this.toggleCart(false));
        document.getElementById('btn-proceed-checkout')?.addEventListener('click', () => this.openCheckoutModal());

        // Checkout Form
        document.getElementById('form-checkout')?.addEventListener('submit', (e) => this.handleCheckout(e));

        // Review Form
        document.getElementById('form-submit-review')?.addEventListener('submit', (e) => this.handleSubmitReview(e));

        // Rating stars selection in review modal
        document.querySelectorAll('.star-rating-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const rating = parseInt(btn.dataset.rating, 10);
                this.setSelectedRating(rating);
            });
        });
    },

    loadCartFromStorage() {
        try {
            const saved = localStorage.getItem('mvms_cart');
            this.cart = saved ? JSON.parse(saved) : [];
        } catch (e) {
            this.cart = [];
        }
        this.updateCartBadge();
    },

    saveCartToStorage() {
        localStorage.setItem('mvms_cart', JSON.stringify(this.cart));
        this.updateCartBadge();
        this.renderCartDrawer();
    },

    updateCartBadge() {
        const totalItems = this.cart.reduce((sum, item) => sum + item.quantity, 0);
        const badge = document.getElementById('cart-badge');
        if (badge) {
            badge.innerText = totalItems;
            if (totalItems > 0) {
                badge.classList.remove('hidden');
                badge.classList.add('cart-bump');
                setTimeout(() => badge.classList.remove('cart-bump'), 300);
            } else {
                badge.classList.add('hidden');
            }
        }
    },

    async loadCategories() {
        try {
            const res = await API.get('/products/categories');
            if (res.success) {
                this.categories = res.categories;
                this.renderCategoryPills();
            }
        } catch (err) {
            console.error('Failed to load categories:', err);
        }
    },

    renderCategoryPills() {
        const container = document.getElementById('category-pills-container');
        if (!container) return;

        let html = `
            <button class="cat-pill active px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap bg-indigo-600 text-white shadow-sm transition-all" data-category="">
                All Categories
            </button>
        `;

        this.categories.forEach(cat => {
            html += `
                <button class="cat-pill px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 transition-all shadow-sm" data-category="${cat.id}">
                    ${cat.name}
                </button>
            `;
        });

        container.innerHTML = html;

        container.querySelectorAll('.cat-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.cat-pill').forEach(b => {
                    b.classList.remove('active', 'bg-indigo-600', 'text-white');
                    b.classList.add('bg-white', 'text-slate-700');
                });
                btn.classList.add('active', 'bg-indigo-600', 'text-white');
                btn.classList.remove('bg-white', 'text-slate-700');
                this.selectedCategory = btn.dataset.category;
                this.loadProducts();
            });
        });
    },

    async loadProducts() {
        const grid = document.getElementById('products-grid');
        if (!grid) return;

        grid.innerHTML = `
            <div class="col-span-full py-16 text-center text-slate-400">
                <div class="inline-block animate-spin text-3xl mb-3">⟳</div>
                <p>Loading catalog items...</p>
            </div>
        `;

        try {
            const search = document.getElementById('input-search')?.value.trim() || '';
            const sort = document.getElementById('select-sort')?.value || 'newest';
            const inStockOnly = document.getElementById('check-instock')?.checked;

            let query = `?sort=${sort}`;
            if (search) query += `&search=${encodeURIComponent(search)}`;
            if (this.selectedCategory) query += `&category=${this.selectedCategory}`;
            if (inStockOnly) query += `&inStockOnly=true`;

            const res = await API.get(`/products${query}`);
            if (res.success) {
                this.currentProducts = res.products;
                this.renderProductsGrid(res.products);
            }
        } catch (err) {
            grid.innerHTML = `<div class="col-span-full py-12 text-center text-rose-500 font-medium">Failed to load products: ${err.message}</div>`;
        }
    },

    renderProductsGrid(products) {
        const grid = document.getElementById('products-grid');
        if (!grid) return;

        if (products.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full py-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 p-8">
                    <span class="text-4xl block mb-2">🔍</span>
                    <h3 class="text-lg font-bold text-slate-800">No products found</h3>
                    <p class="text-sm text-slate-500 mt-1">Try relaxing your search terms or selecting another category.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = products.map(p => {
            const isOutOfStock = p.stock_quantity <= 0;
            const isLowStock = p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold;

            return `
                <div class="bg-white rounded-2xl border border-slate-200/80 hover:border-indigo-300 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col overflow-hidden group">
                    <div class="relative w-full h-48 bg-slate-100 overflow-hidden cursor-pointer" onclick="Customer.openProductModal(${p.id})">
                        <img src="${p.image_url}" alt="${escapeHtml(p.name)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onerror="this.src='https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80'">
                        
                        <div class="absolute top-3 left-3 flex flex-col space-y-1">
                            <span class="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-white/90 backdrop-blur text-slate-800 shadow-sm">
                                ${escapeHtml(p.category_name)}
                            </span>
                        </div>

                        <div class="absolute top-3 right-3">
                            ${isOutOfStock ? `
                                <span class="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-rose-600 text-white shadow-sm">Out of Stock</span>
                            ` : isLowStock ? `
                                <span class="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-500 text-white shadow-sm">Only ${p.stock_quantity} Left!</span>
                            ` : `
                                <span class="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-emerald-500/90 text-white shadow-sm">${p.stock_quantity} in stock</span>
                            `}
                        </div>
                    </div>

                    <div class="p-4 flex-1 flex flex-col justify-between">
                        <div>
                            <div class="flex items-center space-x-1.5 text-xs text-indigo-600 font-semibold mb-1">
                                <span>🏬</span>
                                <span>${escapeHtml(p.store_name)}</span>
                            </div>

                            <h4 class="font-bold text-slate-800 text-base line-clamp-1 group-hover:text-indigo-600 transition-colors cursor-pointer" onclick="Customer.openProductModal(${p.id})">
                                ${escapeHtml(p.name)}
                            </h4>
                            <p class="text-xs text-slate-500 line-clamp-2 mt-1">${escapeHtml(p.description || '')}</p>
                        </div>

                        <div class="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between">
                            <div>
                                <span class="text-xs text-slate-400 block font-medium">Price</span>
                                <span class="text-lg font-extrabold text-slate-900">$${parseFloat(p.price).toFixed(2)}</span>
                            </div>

                            <div class="flex items-center space-x-2">
                                <button onclick="Customer.openProductModal(${p.id})" class="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors" title="View Details">
                                    👁
                                </button>
                                <button onclick="Customer.addToCart(${p.id})" ${isOutOfStock ? 'disabled' : ''} class="px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                                    isOutOfStock 
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow'
                                }">
                                    + Add to Cart
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    addToCart(productId) {
        const product = this.currentProducts.find(p => p.id === productId);
        if (!product) return;

        if (product.stock_quantity <= 0) {
            showToast(`"${product.name}" is currently out of stock.`, 'warning');
            return;
        }

        const existing = this.cart.find(item => item.product_id === productId);
        if (existing) {
            if (existing.quantity + 1 > product.stock_quantity) {
                showToast(`Cannot add more. Only ${product.stock_quantity} units available in stock.`, 'warning');
                return;
            }
            existing.quantity += 1;
        } else {
            this.cart.push({
                product_id: product.id,
                name: product.name,
                price: parseFloat(product.price),
                image_url: product.image_url,
                vendor_id: product.vendor_id,
                store_name: product.store_name,
                stock_quantity: product.stock_quantity,
                quantity: 1
            });
        }

        this.saveCartToStorage();
        showToast(`Added "${product.name}" to cart!`, 'success');
    },

    updateCartItemQuantity(productId, delta) {
        const item = this.cart.find(i => i.product_id === productId);
        if (!item) return;

        const newQty = item.quantity + delta;
        if (newQty <= 0) {
            this.cart = this.cart.filter(i => i.product_id !== productId);
        } else {
            if (newQty > item.stock_quantity) {
                showToast(`Only ${item.stock_quantity} units available in stock.`, 'warning');
                return;
            }
            item.quantity = newQty;
        }
        this.saveCartToStorage();
    },

    toggleCart(open) {
        const drawer = document.getElementById('cart-drawer');
        const backdrop = document.getElementById('cart-backdrop');
        if (open) {
            this.renderCartDrawer();
            drawer?.classList.remove('translate-x-full');
            backdrop?.classList.remove('hidden');
        } else {
            drawer?.classList.add('translate-x-full');
            backdrop?.classList.add('hidden');
        }
    },

    renderCartDrawer() {
        const container = document.getElementById('cart-items-container');
        const subtotalElem = document.getElementById('cart-subtotal-price');
        const commElem = document.getElementById('cart-platform-fee');
        const totalElem = document.getElementById('cart-total-price');
        const checkoutBtn = document.getElementById('btn-proceed-checkout');

        if (!container) return;

        if (this.cart.length === 0) {
            container.innerHTML = `
                <div class="py-16 text-center text-slate-400">
                    <span class="text-5xl block mb-3">🛒</span>
                    <h4 class="font-bold text-slate-700">Your cart is empty</h4>
                    <p class="text-xs text-slate-400 mt-1">Browse vendors and add products to start shopping.</p>
                </div>
            `;
            if (subtotalElem) subtotalElem.innerText = '$0.00';
            if (commElem) commElem.innerText = '$0.00';
            if (totalElem) totalElem.innerText = '$0.00';
            if (checkoutBtn) checkoutBtn.disabled = true;
            return;
        }

        if (checkoutBtn) checkoutBtn.disabled = false;

        // Group cart items by vendor for multi-vendor auto-split preview
        const vendorGroups = {};
        let grandSubtotal = 0;

        this.cart.forEach(item => {
            const vId = item.vendor_id;
            if (!vendorGroups[vId]) {
                vendorGroups[vId] = {
                    storeName: item.store_name,
                    items: []
                };
            }
            vendorGroups[vId].items.push(item);
            grandSubtotal += item.price * item.quantity;
        });

        const platformCommission = grandSubtotal * 0.10;

        if (subtotalElem) subtotalElem.innerText = `$${grandSubtotal.toFixed(2)}`;
        if (commElem) commElem.innerText = `$${platformCommission.toFixed(2)} (included in price)`;
        if (totalElem) totalElem.innerText = `$${grandSubtotal.toFixed(2)}`;

        let html = '';
        Object.keys(vendorGroups).forEach(vId => {
            const group = vendorGroups[vId];
            html += `
                <div class="mb-4 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">
                    <div class="flex items-center space-x-2 text-xs font-bold text-indigo-700 pb-2 mb-2 border-b border-slate-200">
                        <span>🏬 Sold by:</span>
                        <span>${escapeHtml(group.storeName)}</span>
                    </div>

                    <div class="space-y-3">
                        ${group.items.map(item => `
                            <div class="flex items-center justify-between space-x-3 bg-white p-2.5 rounded-xl border border-slate-100 shadow-2xs">
                                <img src="${item.image_url}" class="w-12 h-12 rounded-lg object-cover flex-shrink-0" onerror="this.src='https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80'">
                                <div class="flex-1 min-w-0">
                                    <h5 class="text-xs font-bold text-slate-800 truncate">${escapeHtml(item.name)}</h5>
                                    <span class="text-xs font-extrabold text-slate-900">$${item.price.toFixed(2)}</span>
                                </div>
                                <div class="flex items-center space-x-1.5">
                                    <button onclick="Customer.updateCartItemQuantity(${item.product_id}, -1)" class="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center">-</button>
                                    <span class="text-xs font-bold text-slate-800 px-1.5">${item.quantity}</span>
                                    <button onclick="Customer.updateCartItemQuantity(${item.product_id}, 1)" class="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center">+</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    openCheckoutModal() {
        const user = API.getUser();
        if (!user) {
            this.toggleCart(false);
            Auth.showModal('login');
            showToast('Please sign in as a customer to checkout.', 'warning');
            return;
        }

        if (user.role !== 'customer') {
            showToast('Please log in as a Customer to place an order (vendors cannot buy from themselves).', 'warning');
            return;
        }

        this.toggleCart(false);

        // Calculate checkout summary
        const grandTotal = this.cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
        document.getElementById('checkout-total-display').innerText = `$${grandTotal.toFixed(2)}`;

        // Prepopulate address if available
        const addrField = document.getElementById('checkout-shipping-address');
        if (addrField && user.address) {
            addrField.value = user.address;
        }

        const modal = document.getElementById('modal-checkout');
        if (modal) modal.classList.remove('hidden');
    },

    async handleCheckout(e) {
        e.preventDefault();
        const submitBtn = document.getElementById('btn-submit-order');
        const shipping_address = document.getElementById('checkout-shipping-address').value.trim();
        const payment_method = document.getElementById('checkout-payment-method').value;

        if (!shipping_address) {
            showToast('Please provide a delivery address.', 'warning');
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="animate-spin inline-block mr-2">⟳</span> Processing Payment & Splitting Order...';

            const payload = {
                shipping_address,
                payment_method,
                items: this.cart.map(i => ({
                    product_id: i.product_id,
                    quantity: i.quantity
                }))
            };

            const res = await API.post('/orders/checkout', payload);

            showToast(res.message, 'success');
            this.cart = [];
            this.saveCartToStorage();

            document.getElementById('modal-checkout')?.classList.add('hidden');

            // Switch to My Orders view
            App.switchView('orders');
            this.loadCustomerOrders();
        } catch (err) {
            showToast(err.message || 'Checkout failed', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Pay & Place Order';
        }
    },

    async loadCustomerOrders() {
        const container = document.getElementById('customer-orders-container');
        if (!container) return;

        container.innerHTML = `
            <div class="py-16 text-center text-slate-400">
                <div class="inline-block animate-spin text-3xl mb-3">⟳</div>
                <p>Retrieving your order history...</p>
            </div>
        `;

        try {
            const res = await API.get('/orders/my-orders');
            if (!res.success || res.orders.length === 0) {
                container.innerHTML = `
                    <div class="py-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 p-8">
                        <span class="text-4xl block mb-2">📦</span>
                        <h3 class="text-lg font-bold text-slate-800">No orders placed yet</h3>
                        <p class="text-sm text-slate-500 mt-1">When you make a purchase, it will appear here with live tracking.</p>
                        <button onclick="App.switchView('catalog')" class="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700">
                            Start Shopping
                        </button>
                    </div>
                `;
                return;
            }

            container.innerHTML = res.orders.map(order => `
                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
                    <div class="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                        <div class="flex items-center space-x-3">
                            <span class="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-sm">#${order.id}</span>
                            <div>
                                <h4 class="font-bold text-slate-800 text-sm">Order #${order.id}</h4>
                                <span class="text-xs text-slate-400">${order.created_at}</span>
                            </div>
                        </div>

                        <div class="flex items-center space-x-3">
                            <div class="text-right">
                                <span class="text-xs text-slate-400 block font-medium">Total Paid</span>
                                <span class="text-base font-extrabold text-slate-900">$${parseFloat(order.total_amount).toFixed(2)}</span>
                            </div>
                            <span class="px-2.5 py-1 text-xs font-bold rounded-lg ${
                                order.status === 'completed' ? 'badge-delivered' :
                                order.status === 'processing' ? 'badge-processing' : 'badge-pending'
                            }">
                                ${order.status.toUpperCase()}
                            </span>
                        </div>
                    </div>

                    <div class="p-4">
                        <div class="text-xs text-slate-500 mb-3 flex items-center space-x-2">
                            <span>📍 <b>Shipping to:</b> ${escapeHtml(order.shipping_address)}</span>
                            <span>•</span>
                            <span>💳 <b>Payment:</b> ${order.payment_method.toUpperCase()} (${order.transaction_id || 'Verified'})</span>
                        </div>

                        <div class="divide-y divide-slate-100">
                            ${order.items.map(item => `
                                <div class="py-3 flex flex-wrap items-center justify-between gap-3">
                                    <div class="flex items-center space-x-3">
                                        <img src="${item.image_url}" class="w-12 h-12 rounded-xl object-cover" onerror="this.src='https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80'">
                                        <div>
                                            <h5 class="text-sm font-bold text-slate-800">${escapeHtml(item.product_name)}</h5>
                                            <div class="flex items-center space-x-2 text-xs text-slate-500 mt-0.5">
                                                <span class="text-indigo-600 font-semibold">Sold by ${escapeHtml(item.store_name)}</span>
                                                <span>•</span>
                                                <span>Qty: ${item.quantity} × $${parseFloat(item.unit_price).toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="flex items-center space-x-3">
                                        <span class="px-2.5 py-1 text-xs font-bold rounded-lg ${
                                            item.status === 'delivered' ? 'badge-delivered' :
                                            item.status === 'shipped' ? 'badge-shipped' :
                                            item.status === 'processing' ? 'badge-processing' :
                                            item.status === 'cancelled' ? 'badge-cancelled' : 'badge-pending'
                                        }">
                                            ${item.status.toUpperCase()}
                                        </span>

                                        ${item.rating ? `
                                            <span class="text-xs font-bold text-amber-500 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                                                ★ ${item.rating}/5 Rated
                                            </span>
                                        ` : `
                                            <button onclick="Customer.openReviewModal(${order.id}, ${item.product_id}, '${escapeHtml(item.product_name)}')" class="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-2xs transition-colors">
                                                ★ Rate Item
                                            </button>
                                        `}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `).join('');
        } catch (err) {
            container.innerHTML = `<div class="py-12 text-center text-rose-500">Failed to load orders: ${err.message}</div>`;
        }
    },

    openReviewModal(orderId, productId, productName) {
        document.getElementById('review-order-id').value = orderId;
        document.getElementById('review-product-id').value = productId;
        document.getElementById('review-product-title').innerText = productName;
        document.getElementById('review-comment').value = '';
        this.setSelectedRating(5);

        const modal = document.getElementById('modal-review');
        if (modal) modal.classList.remove('hidden');
    },

    setSelectedRating(rating) {
        document.getElementById('review-rating-value').value = rating;
        document.querySelectorAll('.star-rating-btn').forEach(btn => {
            const starNum = parseInt(btn.dataset.rating, 10);
            if (starNum <= rating) {
                btn.classList.add('text-amber-400');
                btn.classList.remove('text-slate-200');
            } else {
                btn.classList.remove('text-amber-400');
                btn.classList.add('text-slate-200');
            }
        });
    },

    async handleSubmitReview(e) {
        e.preventDefault();
        const submitBtn = document.getElementById('btn-submit-review');
        const order_id = document.getElementById('review-order-id').value;
        const product_id = document.getElementById('review-product-id').value;
        const rating = document.getElementById('review-rating-value').value;
        const review_text = document.getElementById('review-comment').value.trim();

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="animate-spin inline-block mr-2">⟳</span> Submitting...';

            const res = await API.post('/ratings', {
                order_id,
                product_id,
                rating,
                review_text
            });

            showToast(res.message, 'success');
            document.getElementById('modal-review')?.classList.add('hidden');
            this.loadCustomerOrders();
        } catch (err) {
            showToast(err.message || 'Failed to submit review', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Submit Rating & Review';
        }
    },

    async openProductModal(productId) {
        try {
            const res = await API.get(`/products/${productId}`);
            if (!res.success) return;

            const p = res.product;
            const modal = document.getElementById('modal-product-details');
            if (!modal) return;

            document.getElementById('modal-prod-image').src = p.image_url;
            document.getElementById('modal-prod-category').innerText = p.category_name;
            document.getElementById('modal-prod-name').innerText = p.name;
            document.getElementById('modal-prod-store').innerText = p.store_name;
            document.getElementById('modal-prod-description').innerText = p.description || 'No description provided.';
            document.getElementById('modal-prod-price').innerText = `$${parseFloat(p.price).toFixed(2)}`;
            document.getElementById('modal-prod-stock').innerText = `${p.stock_quantity} units available`;
            document.getElementById('modal-prod-rating').innerText = `★ ${p.avg_rating} (${p.rating_count} reviews)`;

            const addBtn = document.getElementById('btn-modal-add-to-cart');
            if (addBtn) {
                if (p.stock_quantity <= 0) {
                    addBtn.disabled = true;
                    addBtn.innerText = 'Out of Stock';
                    addBtn.className = 'px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-200 text-slate-400 cursor-not-allowed';
                } else {
                    addBtn.disabled = false;
                    addBtn.innerText = '+ Add to Cart';
                    addBtn.className = 'px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all';
                    addBtn.onclick = () => {
                        Customer.addToCart(p.id);
                        modal.classList.add('hidden');
                    };
                }
            }

            // Render reviews list
            const reviewsContainer = document.getElementById('modal-prod-reviews-list');
            if (reviewsContainer) {
                if (!p.reviews || p.reviews.length === 0) {
                    reviewsContainer.innerHTML = `<p class="text-xs text-slate-400 italic">No customer reviews yet. Be the first to purchase and review!</p>`;
                } else {
                    reviewsContainer.innerHTML = p.reviews.map(r => `
                        <div class="py-2.5 border-b border-slate-100 last:border-0">
                            <div class="flex items-center justify-between text-xs mb-1">
                                <span class="font-bold text-slate-800">${escapeHtml(r.customer_name)}</span>
                                <span class="text-amber-500 font-bold">★ ${r.rating}/5</span>
                            </div>
                            <p class="text-xs text-slate-600">${escapeHtml(r.review_text || 'No comment.')}</p>
                            <span class="text-[10px] text-slate-400 block mt-1">${r.created_at}</span>
                        </div>
                    `).join('');
                }
            }

            modal.classList.remove('hidden');
        } catch (err) {
            showToast('Failed to load product details: ' + err.message, 'error');
        }
    }
};

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function escapeHtml(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
