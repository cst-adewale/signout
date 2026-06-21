/**
 * admin.js — Admin Dashboard Logic
 * Signoutshirts | Class of 2026
 */

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
    password: sessionStorage.getItem('sos_admin_pass') || '',
    orders: [],
    analytics: null,
    filter: 'all'
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const fmt = (n) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n);

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

// ─── Data Loading (Parallel for speed) ────────────────────────────────────────
async function loadData() {
    try {
        const headers = { 'x-admin-password': state.password };

        // Fetch analytics & orders in parallel for maximum speed
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
            renderOrders();
        }

    } catch (err) {
        console.error('Error loading admin dashboard data:', err);
        Swal.fire('Data Load Error', 'Failed to fetch analytics or orders.', 'error');
    }
}

// ─── Render Stats ────────────────────────────────────────────────────────────
function renderStats(summary) {
    if (!summary) return;
    $('#stat-total').textContent = summary.totalOrders;
    $('#stat-pending').textContent = summary.pending;
    $('#stat-confirmed').textContent = summary.confirmed;
    $('#stat-revenue').textContent = fmt(summary.revenue);
}

// ─── Render Charts ───────────────────────────────────────────────────────────
function renderCharts(charts) {
    if (!charts) return;
    renderChartBar('chart-designs', charts.designs);
    renderChartBar('chart-sizes', charts.sizes);
    renderChartBar('chart-types', charts.types);
    renderChartBar('chart-payments', charts.payments);
}

function renderChartBar(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = '<div style="color:var(--color-text-faint); font-size:.875rem;">No data yet</div>';
        return;
    }

    const maxVal = Math.max(...data.map(d => d.count), 1);
    container.innerHTML = data.map(d => {
        const pct = (d.count / maxVal) * 100;
        return `
            <div class="chart-bar-row">
                <span class="chart-bar-label">${d.label === 'custom' ? 'Customized' : d.label === 'plain' ? 'Plain' : d.label}</span>
                <div class="chart-bar-track">
                    <div class="chart-bar-fill" style="width: ${pct}%"></div>
                </div>
                <span class="chart-bar-count">${d.count}</span>
            </div>
        `;
    }).join('');
}

// ─── Render Orders List ──────────────────────────────────────────────────────
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

    container.innerHTML = filtered.map(order => {
        const date = new Date(order.createdAt).toLocaleDateString('en-NG', {
            hour: '2-digit', minute: '2-digit'
        });

        const isPending = order.status === 'pending';
        const isConfirmed = order.status === 'confirmed';
        const isDelivery = order.status === 'delivery';

        // Status badge labels
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
                            <div><strong>Design:</strong> ${order.design.name} (${order.design.id})</div>
                            <div><strong>Type:</strong> ${order.shirtType === 'custom' ? 'Customized' : 'Plain'}</div>
                            <div><strong>Size &amp; Qty:</strong> ${order.size} &times; ${order.qty}</div>
                            ${order.shirtType === 'custom' ? `<div><strong>Back Print:</strong> "${order.customization.name}" (#${order.customization.number || 'None'})</div>` : ''}
                        </div>
                    </div>
                    
                    <!-- Payment -->
                    <div>
                        <h4 style="font-size: .75rem; text-transform: uppercase; letter-spacing: .05em; color: var(--color-text-faint); margin-bottom: var(--sp-2);">Payment</h4>
                        <div style="font-size: .9rem; line-height: 1.5; margin-bottom: var(--sp-2);">
                            <div><strong>Method:</strong> ${order.payment.method === 'bank-transfer' ? 'Bank Transfer' : 'USSD'}</div>
                            <div><strong>Total:</strong> <strong style="color: var(--color-ink);">${fmt(order.pricing.total)}</strong></div>
                        </div>
                        ${order.receipt && order.receipt.dataUrl ? `
                            <button class="btn btn-secondary btn-sm view-receipt-btn" data-id="${order.id}">
                                📄 View Receipt
                            </button>
                        ` : '<span style="color: var(--color-text-faint); font-size: .85rem;">No Receipt Uploaded</span>'}
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
                    </div>
                ` : ''}

                ${isConfirmed ? `
                    <div style="display: flex; gap: var(--sp-2); justify-content: flex-end; border-top: 1px solid var(--color-border); padding-top: var(--sp-3); margin-top: var(--sp-2);">
                        <button class="btn btn-primary btn-sm delivery-order-btn" data-id="${order.id}" style="background: #1d4ed8;">
                            🚚 Sent for Delivery
                        </button>
                    </div>
                ` : ''}

                ${isDelivery ? `
                    <div style="display: flex; gap: var(--sp-2); justify-content: flex-end; border-top: 1px solid var(--color-border); padding-top: var(--sp-3); margin-top: var(--sp-2);">
                        <button class="btn btn-success btn-sm delivered-order-btn" data-id="${order.id}">
                            ✅ Mark as Delivered
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    // View Receipt
    $$('.view-receipt-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const order = state.orders.find(o => o.id === btn.dataset.id);
            if (order && order.receipt) {
                const isPdf = order.receipt.type === 'application/pdf';
                Swal.fire({
                    title: `Payment Receipt: #${order.id}`,
                    html: isPdf
                        ? `<iframe src="${order.receipt.dataUrl}" style="width:100%; height:400px; border:none;"></iframe>`
                        : `<img src="${order.receipt.dataUrl}" style="max-width:100%; max-height:400px; object-fit:contain; border-radius:8px;" alt="Receipt">`,
                    showCloseButton: true,
                    confirmButtonText: 'Download',
                    confirmButtonColor: '#000000',
                    showDenyButton: true,
                    denyButtonText: 'Close',
                    denyButtonColor: '#9ca3af'
                }).then((result) => {
                    if (result.isConfirmed) {
                        const link = document.createElement('a');
                        link.href = order.receipt.dataUrl;
                        link.download = order.receipt.name || `receipt_${order.id}`;
                        link.click();
                    }
                });
            }
        });
    });

    $$('.confirm-order-btn').forEach(btn => btn.addEventListener('click', () => confirmOrder(btn.dataset.id)));
    $$('.reject-order-btn').forEach(btn => btn.addEventListener('click', () => rejectOrder(btn.dataset.id)));
    $$('.delivery-order-btn').forEach(btn => btn.addEventListener('click', () => markDelivery(btn.dataset.id)));
    $$('.delivered-order-btn').forEach(btn => btn.addEventListener('click', () => markDelivered(btn.dataset.id)));
}

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
            loadData();
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
            loadData();
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
            loadData();
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
            loadData();
        } else {
            Swal.fire('Error', data.message || 'Action failed.', 'error');
        }
    } catch (err) {
        Swal.fire('Error', 'Server connection error.', 'error');
    }
}

// ─── Filter Pills ────────────────────────────────────────────────────────────
function initFilters() {
    $$('#filter-pills button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            $$('#filter-pills button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.filter = e.target.dataset.filter;
            renderOrders();
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

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    $('#login-btn').addEventListener('click', handleLogin);
    $('#logout-btn').addEventListener('click', handleLogout);
    initFilters();
    initAdminNav();
    console.log('📊 Admin dashboard logic ready');
});