// API Client Helper
const API = {
    baseUrl: '/api',

    getToken() {
        return localStorage.getItem('mvms_token');
    },

    setToken(token) {
        if (token) {
            localStorage.setItem('mvms_token', token);
        } else {
            localStorage.removeItem('mvms_token');
        }
    },

    getUser() {
        const userStr = localStorage.getItem('mvms_user');
        try {
            return userStr ? JSON.parse(userStr) : null;
        } catch (e) {
            return null;
        }
    },

    setUser(user) {
        if (user) {
            localStorage.setItem('mvms_user', JSON.stringify(user));
        } else {
            localStorage.removeItem('mvms_user');
        }
    },

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(url, {
                ...options,
                headers
            });

            const data = await response.json();

            if (!response.ok) {
                // If token expired, clear auth
                if (response.status === 401 || response.status === 403) {
                    if (data.message && data.message.includes('expired')) {
                        this.setToken(null);
                        this.setUser(null);
                        window.location.reload();
                    }
                }
                throw new Error(data.message || `Request failed with status ${response.status}`);
            }

            return data;
        } catch (err) {
            console.error(`API Error [${endpoint}]:`, err.message);
            throw err;
        }
    },

    get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    },

    post(endpoint, body) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    },

    put(endpoint, body) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    },

    delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }
};

// Global Toast Notification Helper
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed bottom-5 right-5 z-50 flex flex-col space-y-3 pointer-events-none max-w-sm';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `pointer-events-auto transform transition-all duration-300 ease-out translate-y-4 opacity-0 p-4 rounded-xl shadow-xl flex items-center space-x-3 text-sm font-medium ${
        type === 'success' ? 'bg-emerald-600 text-white' :
        type === 'error' ? 'bg-rose-600 text-white' :
        type === 'warning' ? 'bg-amber-500 text-white' :
        'bg-slate-900 text-white'
    }`;

    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ℹ';
    toast.innerHTML = `
        <span class="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs">${icon}</span>
        <span class="flex-1">${message}</span>
    `;

    container.appendChild(toast);

    // Trigger animate-in
    setTimeout(() => {
        toast.classList.remove('translate-y-4', 'opacity-0');
        toast.classList.add('translate-y-0', 'opacity-100');
    }, 10);

    // Auto remove after 3.5s
    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-4', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}
