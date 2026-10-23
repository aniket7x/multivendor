// Authentication & Role Management Controller
const Auth = {
    init() {
        this.bindEvents();
        this.checkAuthStatus();
    },

    bindEvents() {
        // Modal toggles
        document.getElementById('btn-open-login')?.addEventListener('click', () => this.showModal('login'));
        document.getElementById('btn-open-register')?.addEventListener('click', () => this.showModal('register'));
        document.getElementById('btn-logout')?.addEventListener('click', () => this.logout());

        // Modal close buttons
        document.querySelectorAll('.close-modal-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal-overlay');
                if (modal) modal.classList.add('hidden');
            });
        });

        // Switch between login and register inside modals
        document.getElementById('link-to-register')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.hideModal('login');
            this.showModal('register');
        });
        document.getElementById('link-to-login')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.hideModal('register');
            this.showModal('login');
        });

        // Register role tabs
        document.getElementById('tab-reg-customer')?.addEventListener('click', () => this.setRegisterRole('customer'));
        document.getElementById('tab-reg-vendor')?.addEventListener('click', () => this.setRegisterRole('vendor'));

        // Form submissions
        document.getElementById('form-login')?.addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('form-register')?.addEventListener('submit', (e) => this.handleRegister(e));

        // Quick demo login bar buttons
        document.querySelectorAll('.btn-demo-login').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const role = btn.dataset.role;
                const vendorIndex = parseInt(btn.dataset.vendorIndex || '0', 10);
                this.demoLogin(role, vendorIndex);
            });
        });
    },

    showModal(type) {
        const modal = document.getElementById(`modal-${type}`);
        if (modal) modal.classList.remove('hidden');
    },

    hideModal(type) {
        const modal = document.getElementById(`modal-${type}`);
        if (modal) modal.classList.add('hidden');
    },

    setRegisterRole(role) {
        const vendorFields = document.getElementById('vendor-registration-fields');
        const tabCust = document.getElementById('tab-reg-customer');
        const tabVend = document.getElementById('tab-reg-vendor');
        const hiddenRole = document.getElementById('reg-role');

        hiddenRole.value = role;

        if (role === 'vendor') {
            vendorFields?.classList.remove('hidden');
            tabVend?.classList.add('bg-indigo-600', 'text-white');
            tabVend?.classList.remove('bg-slate-100', 'text-slate-600');
            tabCust?.classList.remove('bg-indigo-600', 'text-white');
            tabCust?.classList.add('bg-slate-100', 'text-slate-600');
        } else {
            vendorFields?.classList.add('hidden');
            tabCust?.classList.add('bg-indigo-600', 'text-white');
            tabCust?.classList.remove('bg-slate-100', 'text-slate-600');
            tabVend?.classList.remove('bg-indigo-600', 'text-white');
            tabVend?.classList.add('bg-slate-100', 'text-slate-600');
        }
    },

    async handleLogin(e) {
        e.preventDefault();
        const submitBtn = document.getElementById('btn-submit-login');
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="animate-spin inline-block mr-2">⟳</span> Authenticating...';

            const res = await API.post('/auth/login', { email, password });
            API.setToken(res.token);
            API.setUser(res.user);

            showToast(res.message || 'Login successful!', 'success');
            this.hideModal('login');
            this.updateUIAfterAuth(res.user);
        } catch (err) {
            showToast(err.message || 'Invalid email or password', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Sign In';
        }
    },

    async handleRegister(e) {
        e.preventDefault();
        const submitBtn = document.getElementById('btn-submit-register');
        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value;
        const role = document.getElementById('reg-role').value;
        const phone = document.getElementById('reg-phone')?.value.trim();
        const store_name = document.getElementById('reg-store-name')?.value.trim();
        const store_description = document.getElementById('reg-store-desc')?.value.trim();

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="animate-spin inline-block mr-2">⟳</span> Creating account...';

            const res = await API.post('/auth/register', {
                name,
                email,
                password,
                role,
                phone,
                store_name,
                store_description
            });

            API.setToken(res.token);
            API.setUser(res.user);

            showToast(res.message, 'success');
            this.hideModal('register');
            this.updateUIAfterAuth(res.user);
        } catch (err) {
            showToast(err.message || 'Registration failed', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Create Account';
        }
    },

    async demoLogin(role, vendorIndex = 0) {
        try {
            const res = await API.post('/auth/demo-login', { role, vendorIndex });
            API.setToken(res.token);
            API.setUser(res.user);

            showToast(res.message, 'success');
            this.updateUIAfterAuth(res.user);
        } catch (err) {
            showToast(err.message || 'Demo login failed', 'error');
        }
    },

    async checkAuthStatus() {
        const token = API.getToken();
        if (!token) {
            this.renderGuestUI();
            return;
        }

        try {
            const res = await API.get('/auth/me');
            if (res.success && res.user) {
                API.setUser(res.user);
                this.updateUIAfterAuth(res.user);
            } else {
                this.logout();
            }
        } catch (err) {
            this.logout();
        }
    },

    updateUIAfterAuth(user) {
        document.getElementById('guest-actions')?.classList.add('hidden');
        document.getElementById('user-profile-menu')?.classList.remove('hidden');

        // Set user badge details
        const userNameElem = document.getElementById('user-display-name');
        const userRoleElem = document.getElementById('user-role-badge');
        if (userNameElem) userNameElem.innerText = user.name;
        if (userRoleElem) {
            userRoleElem.innerText = user.role.toUpperCase();
            userRoleElem.className = `px-2 py-0.5 text-xs font-bold rounded-full uppercase tracking-wider ${
                user.role === 'admin' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                user.role === 'vendor' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                'bg-blue-100 text-blue-700 border border-blue-200'
            }`;
        }

        // Show/hide role-specific navigation tabs
        const vendorTab = document.getElementById('nav-vendor-portal');
        const adminTab = document.getElementById('nav-admin-portal');
        const ordersTab = document.getElementById('nav-my-orders');

        if (user.role === 'admin') {
            adminTab?.classList.remove('hidden');
            vendorTab?.classList.add('hidden');
            ordersTab?.classList.add('hidden');
            App.switchView('admin');
        } else if (user.role === 'vendor') {
            vendorTab?.classList.remove('hidden');
            adminTab?.classList.add('hidden');
            ordersTab?.classList.add('hidden');
            App.switchView('vendor');
        } else {
            ordersTab?.classList.remove('hidden');
            vendorTab?.classList.add('hidden');
            adminTab?.classList.add('hidden');
            App.switchView('catalog');
        }

        // Refresh notifications
        App.loadNotifications();
    },

    renderGuestUI() {
        document.getElementById('guest-actions')?.classList.remove('hidden');
        document.getElementById('user-profile-menu')?.classList.add('hidden');
        document.getElementById('nav-vendor-portal')?.classList.add('hidden');
        document.getElementById('nav-admin-portal')?.classList.add('hidden');
        document.getElementById('nav-my-orders')?.classList.add('hidden');
        App.switchView('catalog');
    },

    logout() {
        API.setToken(null);
        API.setUser(null);
        showToast('You have been logged out.', 'info');
        this.renderGuestUI();
    }
};
