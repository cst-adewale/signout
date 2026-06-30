/**
 * admin.js — Admin Dashboard Logic (Optimized for Performance)
 * Signoutshirts | Class of 2026
 */

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
    password: sessionStorage.getItem('sos_admin_pass') || '',
    orders: [],
    analytics: null,
    filter: 'all',
    ordersRendered: 0,
    lastLoadTime: 0
};

const CONFIG = {
    ORDERS_PER_BATCH: 20,
    CACHE_DURATION: 30000, // 30 seconds
    SCROLL_THRESHOLD: 300 // pixels from bottom to trigger load more
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const fmt = (n) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n);

const escapeHtml = (value = '') =>
    String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

// ─── Authentication Gate ─────────────────────────────────────────────────────
async function checkAuth() {
    if (!state.password) {
        showLockedScreen();
        return;
    }
    try {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: state.password })
        });
        if (res.ok) {
            showDashboard();
        } else {
            sessionStorage.removeItem('sos_admin_pass');
            state.password = '';
            showLockedScreen();
        }
    } catch (err) {
        console.error(err);
        Swal.fire('Connection Error', 'Could not connect to the backend server.', 'error');
        showLockedScreen();
    }
}

function showLockedScreen() {
    $('#locked-screen').style.display = 'flex';
    $('#admin-app').style.display = 'none';
}

function showDashboard() {
    $('#locked-screen').style.display = 'none';
    $('#admin-app').style.display = 'block';
    loadData();
}

async function handleLogin() {
    const { value: password } = await Swal.fire({
        title: 'Enter Admin Password',
        input: 'password',
        inputPlaceholder: 'Password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        confirmButtonText: 'Access Dashboard',
        confirmButtonColor: '#000000',
        showCancelButton: true
    });

    if (password) {
        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const data = await res.json();
            if (data.success) {
                state.password = password;
                sessionStorage.setItem('sos_admin_pass', password);
                showDashboard();
            } else {
                Swal.fire('Access Denied', 'Incorrect password. Please try again.', 'error');
            }
        } catch (err) {
            Swal.fire('Error', 'Server connection error.', 'error');
        }
    }
}

function handleLogout() {
    sessionStorage.removeItem('sos_admin_pass');
    state.password = '';
    showLockedScreen();
}

// ─── Data Loading with Caching ────────────────────────────────────────────────
async function loadData(forceRefresh = false) {
    try {
        // Check if we can use cached data
        const now = Date.now();
        if (!forceRefresh && state.lastLoadTime && now - state.lastLoadTime < CONFIG.CACHE_DURATION) {
            console.log('✓ Using cached data (fresh within', CONFIG.CACHE_DURATION / 1000, 'seconds)');
            return;
        }

        const headers = { 'x-admin-password': state.password };

        // Fetch the heavy dashboard pieces first so the page becomes usable sooner.
        const [resAnalytics, resOrders] = await Promise.all([
            fetch('/api/analytics', { headers }),
            fetch('/api/orders', { headers })
        ]);

        const [dataAnalytics, dataOrders] = await Promise.all([
            resAnalytics.json(),
            resOrders.json()
        ]);

        if (dataAnalytics.success) {
            state.analytics = dataAnalytics;
            renderStats(dataAnalytics.summary);
            renderCharts(dataAnalytics.charts);
        }

        if (dataOrders.success) {
            state.orders = dataOrders.orders;
            state.ordersRendered = 0; // Reset virtual list
            renderOrders();
        }

        state.lastLoadTime = now;

        // Load users in the background so they do not block the main dashboard render.
        fetch('/api/users', { headers })
            .then(res => res.json())
            .then(dataUsers => {
                if (dataUsers.success) {
                    renderUsers(dataUsers.users);
                }
            })
            .catch(err => console.error('Error loading admin users:', err));

    } catch (err) {
        console.error('Error loading admin dashboard data:', err);
        Swal.fire('Data Load Error', 'Failed to fetch analytics, orders, or users.', 'error');
    }
}

// ─── Render Users ────────────────────────────────────────────────────────────
function renderUsers(users) {
    const container = $('#admin-users-list');
    if (!container) return;

    if (!users || users.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 2rem 0;">
                <div class="empty-state__icon">👥</div>
                <h3 class="empty-state__title">No users registered yet</h3>
            </div>
        `;
        return;
    }

    container.innerHTML = users.map(user => {
        const date = new Date(user.createdAt).toLocaleDateString('en-NG', {
            hour: '2-digit',
            minute: '2-digit'
        });
        return `
            <div style="background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--r-md); padding: var(--sp-4); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                <div>
                    <strong style="font-size: 1rem; color: var(--color-ink);">${user.name}</strong>
                    <div style="font-size: .85rem; color: var(--color-text-sub);">${user.email}</div>
                    <div style="font-size: .8rem; color: var(--color-text-faint);">Registered: ${date}</div>
                </div>
                <div style="font-size: .9rem; text-align: right;">
                    <div><strong>WhatsApp:</strong> <a href="https://wa.me/${user.whatsapp.replace(/\D/g, '')}" target="_blank" style="color: #25d366; text-decoration: underline; font-weight: 500;">${user.whatsapp} 💬</a></div>
                    <div><strong>Location:</strong> ${user.location}</div>
                </div>
            </div>
        `;
    }).join('');
}

// ─── Render Stats ────────────────────────────────────────────────────────────
function renderStats(summary) {
    if (!summary) return;
    $('#stat-total').textContent = summary.totalOrders;
    $('#stat-pending').textContent = summary.pending;
    $('#stat-confirmed').textContent = summary.confirmed;
    $('#stat-revenue').textContent = fmt(summary.revenue);
}

// ─── Render Charts (Lazy Load with Grid Lines) ───────────────────────────────
function renderCharts(charts) {
    if (!charts) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.id;
                const chartKey = id.replace('chart-', '');
                renderChartBar(id, charts[chartKey]);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });

    ['designs', 'sizes', 'types', 'payments'].forEach(key => {
        const el = document.getElementById(`chart-${key}`);
        if (el) observer.observe(el);
    });
}

function renderChartBar(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = '<div class="sos-chart__empty">No data yet</div>';
        return;
    }

    const maxVal = Math.max(...data.map(d => d.count), 1);
    const H_GRID_LINES = 5; // 5 horizontal lines
    const V_GRID_LINES = data.length; // vertical line for each bar column

    // Build columns HTML
    const columnsHtml = data.map(d => {
        const pct = Math.round((d.count / maxVal) * 100);
        return `
        <div class="sos-chart-v__col">
            <span class="sos-chart-v__val">${d.count}</span>
            <div class="sos-chart-v__track">
                <div class="sos-chart-v__fill" data-pct="${pct}" style="height:0%"></div>
            </div>
        </div>`;
    }).join('');

    // Build bottom label items HTML
    const labelsHtml = data.map(d => {
        const labelText = d.label === 'custom' ? 'Customized'
            : d.label === 'plain' ? 'Plain'
            : d.label === 'bank-transfer' ? 'Bank Transfer'
            : d.label === 'ussd' ? 'USSD'
            : d.label;
        return `<span class="sos-chart-v__label-item" title="${labelText}">${labelText}</span>`;
    }).join('');

    // Build grid line elements
    const hLines = Array.from({ length: H_GRID_LINES }, () => '<span></span>').join('');
    const vLines = Array.from({ length: V_GRID_LINES }, () => '<span></span>').join('');

    container.innerHTML = `
        <div class="sos-chart-v">
            <div class="sos-chart-v__body">
                <!-- Grid Backdrop -->
                <div class="sos-chart-v__h-lines">${hLines}</div>
                <div class="sos-chart-v__v-lines">${vLines}</div>
                
                <!-- Columns -->
                <div class="sos-chart-v__columns">
                    ${columnsHtml}
                </div>
            </div>
            <!-- X Axis Labels -->
            <div class="sos-chart-v__labels">
                ${labelsHtml}
            </div>
        </div>`;

    // Animate bar heights
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            container.querySelectorAll('.sos-chart-v__fill').forEach(fill => {
                const pct = fill.dataset.pct;
                fill.style.height = pct + '%';
            });
        });
    });
}

// ─── Build Order HTML (Extracted for reuse) ──────────────────────────────────
function buildOrderHTML(order) {
    const date = new Date(order.createdAt).toLocaleDateString('en-NG', {
        hour: '2-digit',
        minute: '2-digit'
    });

    const isPending = order.status === 'pending';
    const isConfirmed = order.status === 'confirmed';
    const isDelivery = order.status === 'delivery';

    const statusLabels = {
        pending: 'Pending',
        confirmed: 'Confirmed',
        rejected: 'Rejected',
        delivery: '🚚 Out for Delivery',
        delivered: '✅ Delivered'
    };

    return `
        <div class="admin-order-row" style="background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--r-md); padding: var(--sp-5); margin-bottom: var(--sp-4); display: flex; flex-direction: column; gap: var(--sp-3);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px dashed var(--color-border); padding-bottom: var(--sp-3); flex-wrap: wrap; gap: var(--sp-2);">
                <div>
                    <strong style="font-size: 1.1rem; color: var(--color-ink);">#${order.id}</strong>
                    <span style="font-size: .8rem; color: var(--color-text-sub); margin-left: var(--sp-3);">${date}</span>
                </div>
                <span class="badge badge--${order.status}">${statusLabels[order.status] || order.status}</span>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr; gap: var(--sp-4);" class="order-details-grid">
                <!-- Customer Info -->
                <div>
                    <h4 style="font-size: .75rem; text-transform: uppercase; letter-spacing: .05em; color: var(--color-text-faint); margin-bottom: var(--sp-2);">Customer Info</h4>
                    <div style="font-size: .9rem; line-height: 1.5;">
                        <div><strong>Name:</strong> ${order.customer.name}</div>
                        <div><strong>Email:</strong> ${order.customer.email}</div>
                        <div><strong>WhatsApp:</strong> <a href="https://wa.me/${order.customer.whatsapp.replace(/\D/g, '')}" target="_blank" style="color: #25d366; text-decoration: underline; font-weight: 500;">${order.customer.whatsapp} 💬</a></div>
                        <div><strong>Location:</strong> ${order.customer.location}</div>
                    </div>
                </div>
                
                <!-- Shirt Details -->
                <div>
                    <h4 style="font-size: .75rem; text-transform: uppercase; letter-spacing: .05em; color: var(--color-text-faint); margin-bottom: var(--sp-2);">Shirt Details</h4>
                    <div style="font-size: .9rem; line-height: 1.5;">
                        <div style="display:flex; gap:.5rem; flex-wrap:wrap; margin-top:.25rem;">
                            <button class="btn btn-secondary btn-sm view-shirt-details-btn" data-id="${order.id}">
                                👕 View Shirt Details
                            </button>
                            <button class="btn btn-secondary btn-sm view-designs-btn" data-id="${order.id}">
                                🖼️ Designs Selected
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Payment -->
                <div>
                    <h4 style="font-size: .75rem; text-transform: uppercase; letter-spacing: .05em; color: var(--color-text-faint); margin-bottom: var(--sp-2);">Payment</h4>
                    <div style="font-size: .9rem; line-height: 1.5; margin-bottom: var(--sp-2);">
                        <div><strong>Method:</strong> ${order.payment.method === 'bank-transfer' ? 'Bank Transfer' : 'USSD'}</div>
                        <div><strong>Total:</strong> <strong style="color: var(--color-ink);">${fmt(order.pricing.total)}</strong></div>
                    </div>
                    ${order.receipt && order.receipt.name ? `
                        <button class="btn btn-secondary btn-sm view-receipt-btn" data-id="${order.id}">
                            📄 View Receipt
                        </button>
                    ` : '<span style="color: var(--color-text-faint); font-size: .85rem;">No Receipt Uploaded</span>'}
                    ${order.customDesign ? `
                        <div style="margin-top:.75rem;">
                            <button class="btn btn-secondary btn-sm view-custom-design-btn" data-id="${order.id}">
                                ${order.customDesign.mode === 'text' ? '📝 View Custom Design Notes' : '🎨 View Custom Design'}
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>

            <!-- Action Buttons -->
            ${isPending ? `
                <div style="display: flex; gap: var(--sp-2); justify-content: flex-end; border-top: 1px solid var(--color-border); padding-top: var(--sp-3); margin-top: var(--sp-2); flex-wrap: wrap;">
                    <button class="btn btn-secondary btn-sm reject-order-btn" data-id="${order.id}" style="color: #dc2626; border-color: #fca5a5;">
                        ✕ Reject Payment
                    </button>
                    <button class="btn btn-primary btn-sm confirm-order-btn" data-id="${order.id}">
                        ✓ Confirm Order
                    </button>
                    <button class="btn btn-danger btn-sm delete-order-btn" data-id="${order.id}">
                        🗑 Delete
                    </button>
                </div>
            ` : ''}

            ${isConfirmed ? `
                <div style="display: flex; gap: var(--sp-2); justify-content: flex-end; border-top: 1px solid var(--color-border); padding-top: var(--sp-3); margin-top: var(--sp-2);">
                    <button class="btn btn-primary btn-sm delivery-order-btn" data-id="${order.id}" style="background: #1d4ed8;">
                        🚚 Sent for Delivery
                    </button>
                    <button class="btn btn-danger btn-sm delete-order-btn" data-id="${order.id}">
                        🗑 Delete
                    </button>
                </div>
            ` : ''}

            ${isDelivery ? `
                <div style="display: flex; gap: var(--sp-2); justify-content: flex-end; border-top: 1px solid var(--color-border); padding-top: var(--sp-3); margin-top: var(--sp-2);">
                    <button class="btn btn-success btn-sm delivered-order-btn" data-id="${order.id}">
                        ✅ Mark as Delivered
                    </button>
                    <button class="btn btn-danger btn-sm delete-order-btn" data-id="${order.id}">
                        🗑 Delete
                    </button>
                </div>
            ` : ''}
            
            ${(!isPending && !isConfirmed && !isDelivery) ? `
                <div style="display: flex; gap: var(--sp-2); justify-content: flex-end; border-top: 1px solid var(--color-border); padding-top: var(--sp-3); margin-top: var(--sp-2);">
                    <button class="btn btn-danger btn-sm delete-order-btn" data-id="${order.id}">
                        🗑 Delete
                    </button>
                </div>
            ` : ''}
        </div>
    `;
}

// ─── Virtualized Orders List (Load More on Scroll) ──────────────────────────
function renderOrders() {
    const container = $('#admin-orders-list');
    if (!container) return;

    let filtered = state.orders;
    if (state.filter !== 'all') {
        filtered = state.orders.filter(o => o.status === state.filter);
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 3rem 0;">
                <div class="empty-state__icon">📁</div>
                <h3 class="empty-state__title">No orders found</h3>
                <p class="empty-state__msg">No orders match the current status filter.</p>
            </div>
        `;
        return;
    }

    // Clear and render initial batch
    container.innerHTML = '';
    state.ordersRendered = 0;
    state.currentFilteredOrders = filtered; // Store for "load more"

    renderOrderBatch(container, filtered);

    // Attach scroll listener for lazy loading
    removeScrollListener(container);
    if (state.ordersRendered < filtered.length) {
        container.addEventListener('scroll', onOrdersScroll);
    }
}

function renderOrderBatch(container, filtered) {
    const start = state.ordersRendered;
    const end = Math.min(start + CONFIG.ORDERS_PER_BATCH, filtered.length);
    const batch = filtered.slice(start, end);

    const html = batch.map(order => buildOrderHTML(order)).join('');
    container.insertAdjacentHTML('beforeend', html);

    state.ordersRendered = end;

    // Attach event listeners to new buttons
    attachOrderEventListeners(container);

    // Show "loading more" indicator if there are more orders
    if (state.ordersRendered < filtered.length) {
        const loadMore = document.createElement('div');
        loadMore.className = 'orders-loading-more';
        loadMore.innerHTML = '<p style="text-align: center; color: var(--color-text-faint); padding: var(--sp-4);">Scroll for more...</p>';
        container.appendChild(loadMore);
    }
}

function onOrdersScroll(e) {
    const container = e.target;
    const { scrollTop, scrollHeight, clientHeight } = container;

    // Check if user scrolled near bottom
    if (scrollTop + clientHeight >= scrollHeight - CONFIG.SCROLL_THRESHOLD) {
        if (state.ordersRendered < state.currentFilteredOrders.length) {
            // Remove previous "scroll for more" message
            const loadMoreEl = container.querySelector('.orders-loading-more');
            if (loadMoreEl) loadMoreEl.remove();

            renderOrderBatch(container, state.currentFilteredOrders);
        }
    }
}

function removeScrollListener(container) {
    container.removeEventListener('scroll', onOrdersScroll);
}

function attachOrderEventListeners(container) {
    // View Receipt
    container.querySelectorAll('.view-receipt-btn').forEach(btn => {
        btn.removeEventListener('click', viewReceiptHandler);
        btn.addEventListener('click', viewReceiptHandler);
    });

    container.querySelectorAll('.view-custom-design-btn').forEach(btn => {
        btn.removeEventListener('click', viewCustomDesignHandler);
        btn.addEventListener('click', viewCustomDesignHandler);
    });

    container.querySelectorAll('.view-shirt-details-btn').forEach(btn => {
        btn.removeEventListener('click', viewShirtDetailsHandler);
        btn.addEventListener('click', viewShirtDetailsHandler);
    });

    container.querySelectorAll('.view-designs-btn').forEach(btn => {
        btn.removeEventListener('click', viewDesignsHandler);
        btn.addEventListener('click', viewDesignsHandler);
    });

    // Confirm, Reject, Delivery, Delivered
    container.querySelectorAll('.confirm-order-btn').forEach(btn => {
        btn.removeEventListener('click', confirmOrderHandler);
        btn.addEventListener('click', confirmOrderHandler);
    });

    container.querySelectorAll('.reject-order-btn').forEach(btn => {
        btn.removeEventListener('click', rejectOrderHandler);
        btn.addEventListener('click', rejectOrderHandler);
    });

    container.querySelectorAll('.delivery-order-btn').forEach(btn => {
        btn.removeEventListener('click', markDeliveryHandler);
        btn.addEventListener('click', markDeliveryHandler);
    });

    container.querySelectorAll('.delivered-order-btn').forEach(btn => {
        btn.removeEventListener('click', markDeliveredHandler);
        btn.addEventListener('click', markDeliveredHandler);
    });

    container.querySelectorAll('.delete-order-btn').forEach(btn => {
        btn.removeEventListener('click', deleteOrderHandler);
        btn.addEventListener('click', deleteOrderHandler);
    });
}

// Event Handlers (Extracted for cleaner delegation)
const viewReceiptHandler = async function (e) {
    const orderId = this.dataset.id;
    const order = state.orders.find(o => o.id === orderId);
    if (!order || !order.receipt) return;

    // Show loading while we fetch the receipt on-demand
    Swal.fire({
        title: `Loading Receipt #${orderId}…`,
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const res = await fetch(`/api/orders/${orderId}/receipt`, {
            headers: { 'x-admin-password': state.password }
        });
        const data = await res.json();

        if (!data.success || !data.dataUrl) {
            Swal.fire('Not Found', 'Receipt could not be loaded.', 'warning');
            return;
        }

        const isPdf = (data.type || '').includes('pdf');
        Swal.fire({
            title: `Payment Receipt: #${orderId}`,
            html: isPdf
                ? `<iframe src="${data.dataUrl}" style="width:100%; height:420px; border:none;"></iframe>`
                : `<img src="${data.dataUrl}" style="max-width:100%; max-height:420px; object-fit:contain; border-radius:8px;" alt="Receipt">`,
            showCloseButton: true,
            confirmButtonText: '⬇ Download',
            confirmButtonColor: '#000000',
            showDenyButton: true,
            denyButtonText: 'Close',
            denyButtonColor: '#9ca3af'
        }).then(result => {
            if (result.isConfirmed) {
                const link = document.createElement('a');
                link.href = data.dataUrl;
                link.download = order.receipt.name || `receipt_${orderId}`;
                link.click();
            }
        });
    } catch (err) {
        Swal.fire('Error', 'Could not load receipt. Check your connection.', 'error');
    }
};

const viewCustomDesignHandler = async function () {
    const orderId = this.dataset.id;
    const order = state.orders.find(o => o.id === orderId);
    if (!order || !order.customDesign) return;

    Swal.fire({
        title: `Loading Custom Design #${orderId}…`,
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    const data = order.customDesign;
    if (data.mode === 'text') {
        Swal.fire({
            title: `Custom Design Notes: #${orderId}`,
            html: `<div style="text-align:left; white-space:pre-wrap; line-height:1.6;">${escapeHtml(data.text || 'No notes provided.')}</div>`,
            showCloseButton: true,
            confirmButtonText: 'Close',
            confirmButtonColor: '#000000'
        });
        return;
    }

    const isPdf = (data.type || '').includes('pdf');
    Swal.fire({
        title: `Custom Design: #${orderId}`,
        html: isPdf
            ? `<iframe src="${data.dataUrl}" style="width:100%; height:420px; border:none;"></iframe>`
            : `<img src="${data.dataUrl}" style="max-width:100%; max-height:420px; object-fit:contain; border-radius:8px;" alt="Custom Design">`,
        showCloseButton: true,
        confirmButtonText: '⬇ Download',
        confirmButtonColor: '#000000',
        showDenyButton: true,
        denyButtonText: 'Close',
        denyButtonColor: '#9ca3af'
    }).then(result => {
        if (result.isConfirmed) {
            const link = document.createElement('a');
            link.href = data.dataUrl;
            link.download = data.name || `custom_design_${orderId}`;
            link.click();
        }
    });
};

const viewShirtDetailsHandler = function () {
    const orderId = this.dataset.id;
    const order = state.orders.find(o => o.id === orderId);
    if (!order) return;

    const items = Array.isArray(order.cartItems) && order.cartItems.length ? order.cartItems : [{
        id: order.design?.id || 'UNKNOWN',
        name: order.design?.name || 'Unknown Item',
        src: '',
        qty: order.qty || 1,
        size: order.size || 'M',
        type: order.shirtType || 'plain'
    }];

    const itemRows = items.map((item, index) => `
        <div style="border:1px solid var(--color-border); border-radius: var(--r-md); padding: var(--sp-4); background: var(--color-bg-soft);">
            <div style="display:flex; justify-content:space-between; gap:1rem; flex-wrap:wrap; margin-bottom:.5rem;">
                <strong>Shirt ${index + 1}: ${escapeHtml(item.name || 'Unnamed Shirt')}</strong>
                <span class="badge badge--${getCartItemTypeLabel(item, order) === 'Plain' ? 'pending' : 'confirmed'}">${getCartItemTypeLabel(item, order)}</span>
            </div>
            <div style="display:grid; gap:.35rem; font-size:.9rem; line-height:1.5;">
                <div><strong>Design:</strong> ${escapeHtml(item.name || item.id || '')}</div>
                <div><strong>Size:</strong> ${escapeHtml(item.size || order.size || 'M')}</div>
                <div><strong>Quantity:</strong> ${escapeHtml(String(item.qty || 1))}</div>
            </div>
        </div>
    `).join('');

    Swal.fire({
        title: `Shirt Details: #${orderId}`,
        html: `
            <div style="text-align:left; display:grid; gap:1rem;">
                <div style="display:grid; gap:.75rem;">
                    ${itemRows}
                </div>
            </div>
        `,
        showCloseButton: true,
        confirmButtonText: 'Close',
        confirmButtonColor: '#000000',
        width: 700
    });
};

const viewDesignsHandler = function () {
    const orderId = this.dataset.id;
    const order = state.orders.find(o => o.id === orderId);
    if (!order) return;

    const items = Array.isArray(order.cartItems) && order.cartItems.length ? order.cartItems : [{
        id: order.design?.id || 'UNKNOWN',
        name: order.design?.name || 'Unknown Design',
        src: order.design?.src || '',
        qty: order.qty || 1,
        size: order.size || 'M',
        type: order.shirtType || 'plain'
    }];

    const cards = items.map(item => `
        <div style="border:1px solid var(--color-border); border-radius: var(--r-md); overflow:hidden; background:var(--color-bg-soft);">
            <div style="aspect-ratio:1; background:#fff; display:flex; align-items:center; justify-content:center;">
                ${item.src ? `<img src="${item.src}" alt="${escapeHtml(item.name || item.id || 'Design')}" style="width:100%; height:100%; object-fit:cover;">` : `<div style="color:var(--color-text-faint); padding:2rem;">No image</div>`}
            </div>
            <div style="padding: var(--sp-3); display:grid; gap:.25rem; font-size:.9rem;">
                <strong>${escapeHtml(item.name || item.id || 'Design')}</strong>
                <span>Type: ${getCartItemTypeLabel(item, order)}</span>
                <span>Size: ${escapeHtml(item.size || order.size || 'M')}</span>
                <span>Qty: ${escapeHtml(String(item.qty || 1))}</span>
            </div>
        </div>
    `).join('');

    Swal.fire({
        title: `Designs Selected: #${orderId}`,
        html: `
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:1rem; text-align:left;">
                ${cards}
            </div>
        `,
        showCloseButton: true,
        confirmButtonText: 'Close',
        confirmButtonColor: '#000000',
        width: 900
    });
};

const confirmOrderHandler = function (e) {
    confirmOrder(this.dataset.id);
};

const rejectOrderHandler = function (e) {
    rejectOrder(this.dataset.id);
};

const markDeliveryHandler = function (e) {
    markDelivery(this.dataset.id);
};

const markDeliveredHandler = function (e) {
    markDelivered(this.dataset.id);
};

const deleteOrderHandler = function (e) {
    deleteOrder(this.dataset.id);
};

// ─── Actions ─────────────────────────────────────────────────────────────────
async function confirmOrder(id) {
    const result = await Swal.fire({
        title: 'Confirm Order?',
        text: `Verify payment for order #${id} and notify the student?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#000000',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Yes, Confirm it!'
    });
    if (!result.isConfirmed) return;

    try {
        const res = await fetch(`/api/orders/${id}/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-password': state.password }
        });
        const data = await res.json();
        if (data.success) {
            Swal.fire('Confirmed! 🎉', `Order #${id} confirmed.`, 'success');
            loadData(true); // Force refresh
        } else {
            Swal.fire('Error', data.message || 'Action failed.', 'error');
        }
    } catch (err) {
        Swal.fire('Error', 'Server connection error.', 'error');
    }
}

async function rejectOrder(id) {
    const result = await Swal.fire({
        title: 'Reject Payment Receipt?',
        text: `Reject order #${id} and notify the student?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'Yes, Reject it!'
    });
    if (!result.isConfirmed) return;

    try {
        const res = await fetch(`/api/orders/${id}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-password': state.password }
        });
        const data = await res.json();
        if (data.success) {
            Swal.fire('Rejected ⚠️', `Order #${id} marked as rejected.`, 'success');
            loadData(true); // Force refresh
        } else {
            Swal.fire('Error', data.message || 'Action failed.', 'error');
        }
    } catch (err) {
        Swal.fire('Error', 'Server connection error.', 'error');
    }
}

async function markDelivery(id) {
    const result = await Swal.fire({
        title: 'Sent for Delivery?',
        text: `Mark order #${id} as out for delivery and notify the student?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#1d4ed8',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: '🚚 Yes, Mark as Delivery!'
    });
    if (!result.isConfirmed) return;

    try {
        const res = await fetch(`/api/orders/${id}/delivery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-password': state.password }
        });
        const data = await res.json();
        if (data.success) {
            Swal.fire('Sent! 🚚', `Order #${id} marked as out for delivery.`, 'success');
            loadData(true); // Force refresh
        } else {
            Swal.fire('Error', data.message || 'Action failed.', 'error');
        }
    } catch (err) {
        Swal.fire('Error', 'Server connection error.', 'error');
    }
}

async function markDelivered(id) {
    const result = await Swal.fire({
        title: 'Mark as Delivered?',
        text: `Mark order #${id} as delivered?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#059669',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: '✅ Yes, Mark as Delivered!'
    });
    if (!result.isConfirmed) return;

    try {
        const res = await fetch(`/api/orders/${id}/delivered`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-password': state.password }
        });
        const data = await res.json();
        if (data.success) {
            Swal.fire('Delivered! ✅', `Order #${id} marked as delivered.`, 'success');
            loadData(true); // Force refresh
        } else {
            Swal.fire('Error', data.message || 'Action failed.', 'error');
        }
    } catch (err) {
        Swal.fire('Error', 'Server connection error.', 'error');
    }
}

async function deleteOrder(id) {
    const result = await Swal.fire({
        title: 'Delete Order?',
        text: `This will permanently remove order #${id}. This cannot be undone.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'Yes, Delete It'
    });
    if (!result.isConfirmed) return;

    try {
        const res = await fetch(`/api/orders/${id}`, {
            method: 'DELETE',
            headers: { 'x-admin-password': state.password }
        });
        const data = await res.json();
        if (data.success) {
            Swal.fire('Deleted', `Order #${id} was deleted.`, 'success');
            loadData(true);
        } else {
            Swal.fire('Error', data.message || 'Delete failed.', 'error');
        }
    } catch (err) {
        Swal.fire('Error', 'Server connection error.', 'error');
    }
}

function initWipeDb() {
    const wipeBtn = $('#wipe-db-btn');
    const warnModal = $('#wipe-warn-modal');
    const confirmModal = $('#wipe-confirm-modal');
    const warnCancel = $('#wipe-warn-cancel');
    const warnProceed = $('#wipe-warn-proceed');
    const confirmCancel = $('#wipe-confirm-cancel');
    const confirmDelete = $('#wipe-confirm-delete');
    const confirmInput = $('#wipe-confirm-input');

    const openModal = (modal) => {
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    };

    const closeModal = (modal) => {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    };

    const resetConfirm = () => {
        if (!confirmInput) return;
        confirmInput.value = '';
        confirmDelete.disabled = true;
        confirmDelete.style.opacity = '.4';
        confirmDelete.style.cursor = 'not-allowed';
    };

    wipeBtn?.addEventListener('click', () => openModal(warnModal));
    warnCancel?.addEventListener('click', () => closeModal(warnModal));
    warnProceed?.addEventListener('click', () => {
        closeModal(warnModal);
        openModal(confirmModal);
        resetConfirm();
        confirmInput?.focus();
    });
    confirmCancel?.addEventListener('click', () => {
        closeModal(confirmModal);
        resetConfirm();
    });

    confirmInput?.addEventListener('input', () => {
        const ok = confirmInput.value.trim().toLowerCase() === 'delete database orders';
        confirmDelete.disabled = !ok;
        confirmDelete.style.opacity = ok ? '1' : '.4';
        confirmDelete.style.cursor = ok ? 'pointer' : 'not-allowed';
    });

    confirmDelete?.addEventListener('click', async () => {
        const result = await Swal.fire({
            title: 'Delete all orders?',
            text: 'This will remove every order record from the database.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#9ca3af',
            confirmButtonText: 'Yes, delete orders'
        });
        if (!result.isConfirmed) return;

        try {
            const res = await fetch('/api/orders', {
                method: 'DELETE',
                headers: { 'x-admin-password': state.password }
            });
            const data = await res.json();
            if (data.success) {
                closeModal(confirmModal);
                Swal.fire('Deleted', `${data.deletedCount || 0} orders were removed.`, 'success');
                loadData(true);
            } else {
                Swal.fire('Error', data.message || 'Could not wipe orders.', 'error');
            }
        } catch (err) {
            Swal.fire('Error', 'Server connection error.', 'error');
        }
    });
}

// ─── Filter Pills (Debounced) ────────────────────────────────────────────────
function initFilters() {
    let filterTimeout;

    $$('#filter-pills button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            clearTimeout(filterTimeout);

            // Update UI immediately for responsiveness
            $$('#filter-pills button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.filter = e.target.dataset.filter;

            // Debounce the re-render to batch rapid filter changes
            filterTimeout = setTimeout(() => {
                state.ordersRendered = 0; // Reset virtual list
                renderOrders();
            }, 100);
        });
    });
}

// ─── Admin Nav Hamburger ─────────────────────────────────────────────────────
function initAdminNav() {
    const toggle = $('#admin-nav-toggle');
    const links = $('#admin-nav-links');
    if (!toggle) return;
    toggle.addEventListener('click', () => {
        links.classList.toggle('open');
        toggle.classList.toggle('open');
    });
}

function updateBrandAssets() {
    const isDark = document.body.classList.contains('dark');
    const logo = $('#site-logo');
    const favicon = $('#site-favicon');
    const asset = isDark ? 'assets/pappy_dark.svg' : 'assets/pappy_light.svg';
    if (logo) logo.src = asset;
    if (favicon) favicon.href = asset;
}

function initUsersPanel() {
    const toggleBtn = $('#users-toggle-btn');
    const panel = $('#admin-users-body');
    if (!toggleBtn || !panel) return;

    const setExpanded = (expanded) => {
        panel.hidden = !expanded;
        toggleBtn.setAttribute('aria-expanded', String(expanded));
        toggleBtn.textContent = expanded ? 'Hide Users ▲' : 'Show Users ▼';
    };

    setExpanded(false);
    toggleBtn.addEventListener('click', () => {
        const expanded = toggleBtn.getAttribute('aria-expanded') !== 'true';
        setExpanded(expanded);
    });
}

function initTheme() {
    const toggleBtn = $('#admin-theme-toggle');
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);

    document.body.classList.toggle('dark', isDark);
    if (toggleBtn) {
        toggleBtn.textContent = isDark ? '☀️' : '🌙';
        toggleBtn.addEventListener('click', () => {
            const nextIsDark = document.body.classList.toggle('dark');
            localStorage.setItem('theme', nextIsDark ? 'dark' : 'light');
            toggleBtn.textContent = nextIsDark ? '☀️' : '🌙';
            updateBrandAssets();
        });
    }

    updateBrandAssets();
}

function getOrderTypeLabel(order) {
    if (order.shirtType !== 'custom') return 'Plain';
    return order.customDesign ? 'Uploaded Custom' : 'Customized';
}

function getCartItemTypeLabel(item, order) {
    if ((item?.id || '') === 'PLAIN' || (item?.type || '') === 'plain') return 'Plain';
    if ((item?.id || '') === 'CUSTOM-UPLOADED') return 'Uploaded Custom';
    return 'Customized';
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initUsersPanel();

    checkAuth();
    $('#login-btn').addEventListener('click', handleLogin);
    $('#logout-btn').addEventListener('click', handleLogout);
    initFilters();
    initAdminNav();
    initWipeDb();
    console.log('⚡ Admin dashboard ready (optimized for speed)');
});
