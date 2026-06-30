/**
 * designs.js — Full Design Gallery Page
 * Signoutshirts | Class of 2026
 *
 * This page is an extension of the index gallery section.
 * It shares the same cart (via sessionStorage) and auth state
 * (via localStorage token + /api/auth/me) as app.js.
 */

// ─── Config ───────────────────────────────────────────────────────────────────

const CONFIG = {
    prices: { plain: 5000, custom: 6000 },
    bulkThreshold: 5,
    bulkDiscount: 0.10,
};

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
    user: null,
    token: null,
    cart: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const fmt = (n) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n);

function getCartItemCount() {
    return state.cart.reduce((sum, item) => sum + (Number(item.qty) || 1), 0);
}

function updateCartBadge() {
    const badge = $('#nav-cart-count');
    if (!badge) return;
    const count = getCartItemCount();
    badge.textContent = String(count);
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
}

// ─── Design Catalog ───────────────────────────────────────────────────────────

const DESIGN_CATALOG = Array.from({ length: 47 }, (_, i) => {
    const num = i + 1;
    const id = `D${String(num).padStart(2, '0')}`;
    return {
        id,
        name: `Design ${String(num).padStart(2, '0')}`,
        src: `assets/des${num}.webp`,
        type: 'custom',
    };
});

// ─── Token / Auth helpers ─────────────────────────────────────────────────────

function loadToken() {
    try { return localStorage.getItem('sos_token'); } catch (_) { return null; }
}

function saveToken(token) {
    try { localStorage.setItem('sos_token', token); } catch (_) {}
}

function removeToken() {
    try { localStorage.removeItem('sos_token'); } catch (_) {}
}

async function fetchProfile() {
    const token = loadToken();
    if (!token) return null;
    try {
        const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.success) {
            state.token = token;
            state.user = data.user;
            return data.user;
        } else {
            removeToken();
        }
    } catch (err) {
        console.error('Error fetching profile:', err);
    }
    return null;
}

// ─── Cart helpers (shared with index via sessionStorage) ──────────────────────

function persistCart() {
    try { sessionStorage.setItem('sos_cart', JSON.stringify(state.cart)); } catch (_) {}
    updateCartBadge();
}

function restoreCart() {
    try {
        const raw = sessionStorage.getItem('sos_cart');
        state.cart = raw ? JSON.parse(raw) : [];
        state.cart.forEach(item => {
            if (!item.type) item.type = item.id === 'PLAIN' ? 'plain' : 'custom';
        });
    } catch (_) {
        state.cart = [];
    }
    updateCartBadge();
}

function addToCart(design) {
    const existing = state.cart.find(item => item.id === design.id);
    if (existing) {
        existing.qty += 1;
    } else {
        state.cart.push({
            id: design.id,
            name: design.name,
            src: design.src,
            type: design.type || 'custom',
            qty: 1,
            size: 'M',
        });
    }
    persistCart();
    updateCartBadge();
    syncGalleryState();
    Swal.fire({
        title: 'Added to Cart',
        text: `${design.name} has been added to your cart.`,
        icon: 'success',
        confirmButtonColor: '#000000',
        timer: 800,
        showConfirmButton: false,
    });
}

function removeFromCart(id) {
    state.cart = state.cart.filter(x => x.id !== id);
    persistCart();
    updateCartBadge();
    syncGalleryState();
}

// ─── Gallery ──────────────────────────────────────────────────────────────────

function renderGallery() {
    const grid = $('#full-gallery-grid');
    if (!grid) return;

    grid.innerHTML = DESIGN_CATALOG.map(design => `
        <div class="gallery-card" data-id="${design.id}" data-name="${design.name}" data-src="${design.src}" data-type="${design.type}">
            <div class="gallery-card__img-wrap">
                <img src="${design.src}" alt="${design.id}" loading="lazy" decoding="async">
                <div class="gallery-card__overlay"><span class="btn btn-secondary btn-sm">Preview</span></div>
            </div>
            <div class="gallery-card__foot">
                <span class="design-tag">${design.id}</span>
                <span class="gallery-card__name">${design.name}</span>
                <button type="button" class="btn btn-primary btn-sm gallery-select-btn"
                    data-id="${design.id}" data-name="${design.name}" data-src="${design.src}" data-type="${design.type}">
                    Select Design
                </button>
            </div>
        </div>
    `).join('');

    // Card click → preview modal
    $$('.gallery-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.gallery-select-btn')) return;
            openPreviewModal(card.dataset);
        });
    });

    // Select/Remove button click
    $$('.gallery-select-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!state.user) {
                openAuthModal();
                return;
            }
            const { id, name, src, type } = btn.dataset;
            const inCart = state.cart.some(item => item.id === id);
            if (inCart) {
                removeFromCart(id);
            } else {
                addToCart({ id, name, src, type });
            }
        });
    });

    syncGalleryState();
}

// Keep button label & card style in sync with cart state
function syncGalleryState() {
    $$('.gallery-select-btn').forEach(btn => {
        const id = btn.dataset.id;
        const inCart = state.cart.some(item => item.id === id);
        btn.textContent = inCart ? 'Remove' : 'Select Design';
        btn.classList.toggle('btn-primary', !inCart);
        btn.classList.toggle('btn-secondary', inCart);
        btn.closest('.gallery-card')?.classList.toggle('selected', inCart);
    });
}

// ─── Preview Modal ────────────────────────────────────────────────────────────

function openPreviewModal(dataset) {
    const { id, name, src, type } = dataset;
    const modal = $('#gallery-modal');
    const modalImg = $('#modal-img');
    const modalTag = $('#modal-tag');
    const modalName = $('#modal-name');
    const selectBtn = $('#modal-select');

    modalImg.src = src;
    modalImg.alt = name;
    modalTag.textContent = id;
    modalName.textContent = name;

    // Update the button based on cart state
    const inCart = state.cart.some(item => item.id === id);
    selectBtn.textContent = inCart ? 'Remove From Cart' : 'Select This Design';
    selectBtn.dataset.id = id;
    selectBtn.dataset.name = name;
    selectBtn.dataset.src = src;
    selectBtn.dataset.type = type || 'custom';

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function initPreviewModal() {
    const modal = $('#gallery-modal');
    const closeBtn = $('#modal-close');
    const selectBtn = $('#modal-select');

    function closeModal() {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

    selectBtn.addEventListener('click', () => {
        if (!state.user) {
            closeModal();
            openAuthModal();
            return;
        }
        const { id, name, src, type } = selectBtn.dataset;
        const inCart = state.cart.some(item => item.id === id);
        if (inCart) {
            removeFromCart(id);
        } else {
            addToCart({ id, name, src, type });
        }
        // Update button label while modal stays open
        const stillInCart = state.cart.some(item => item.id === id);
        selectBtn.textContent = stillInCart ? 'Remove From Cart' : 'Select This Design';
    });
}

// ─── Auth Notice ──────────────────────────────────────────────────────────────

function updateAuthNotice() {
    const notice = $('#designs-auth-notice');
    if (notice) notice.style.display = state.user ? 'none' : 'block';
}

// ─── Auth Modal ───────────────────────────────────────────────────────────────

function openAuthModal(startWithSignup = false) {
    const authModal = $('#auth-modal');
    const loginContainer = $('#login-form-container');
    const signupContainer = $('#signup-form-container');
    if (startWithSignup) {
        loginContainer.style.display = 'none';
        signupContainer.style.display = 'block';
    } else {
        loginContainer.style.display = 'block';
        signupContainer.style.display = 'none';
    }
    authModal.classList.add('active');
    authModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function closeAuthModal() {
    const authModal = $('#auth-modal');
    authModal.classList.remove('active');
    authModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

function initAuthModal() {
    const authBtn = $('#auth-btn');
    const authModalClose = $('#auth-modal-close');
    const authModal = $('#auth-modal');
    const switchToSignup = $('#switch-to-signup');
    const switchToLogin = $('#switch-to-login');
    const designsSigninLink = $('#designs-signin-link');
    const loginForm = $('#login-form');
    const signupForm = $('#signup-form');

    // Auth button in nav
    authBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (state.user) {
            Swal.fire({
                title: 'Sign Out',
                text: 'Are you sure you want to sign out?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#000',
                cancelButtonColor: '#6b7280',
                confirmButtonText: 'Yes, Sign Out',
            }).then((result) => {
                if (result.isConfirmed) logout();
            });
        } else {
            openAuthModal(false);
        }
    });

    authModalClose.addEventListener('click', closeAuthModal);
    authModal.addEventListener('click', e => { if (e.target === authModal) closeAuthModal(); });
    switchToSignup.addEventListener('click', (e) => { e.preventDefault(); openAuthModal(true); });
    switchToLogin.addEventListener('click', (e) => { e.preventDefault(); openAuthModal(false); });
    if (designsSigninLink) designsSigninLink.addEventListener('click', (e) => { e.preventDefault(); openAuthModal(false); });

    // Login form submit
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = $('#login-email').value.trim();
        const password = $('#login-password').value;
        if (!email || !password) {
            Swal.fire('Error', 'Please fill all fields', 'error');
            return;
        }
        const btn = $('#login-submit-btn');
        btn.disabled = true;
        btn.textContent = 'Signing In...';
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                saveToken(data.token);
                state.token = data.token;
                state.user = data.user;
                closeAuthModal();
                loginForm.reset();
                updateHeaderUI();
                updateAuthNotice();
                syncGalleryState();
                Swal.fire('Success', `Welcome back, ${data.user.name}!`, 'success');
            } else {
                throw new Error(data.message || 'Login failed');
            }
        } catch (err) {
            Swal.fire('Login Failed', err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Sign In';
        }
    });

    // Signup form submit
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = $('#signup-name').value.trim();
        const email = $('#signup-email').value.trim();
        const whatsapp = $('#signup-whatsapp').value.trim();
        const location = $('#signup-location').value.trim();
        const password = $('#signup-password').value;
        if (!name || !email || !whatsapp || !location || !password) {
            Swal.fire('Error', 'Please fill all fields', 'error');
            return;
        }
        if (password.length < 6) {
            Swal.fire('Error', 'Password must be at least 6 characters', 'error');
            return;
        }
        const btn = $('#signup-submit-btn');
        btn.disabled = true;
        btn.textContent = 'Creating Account...';
        try {
            const res = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, whatsapp, location, password }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                saveToken(data.token);
                state.token = data.token;
                state.user = data.user;
                closeAuthModal();
                signupForm.reset();
                updateHeaderUI();
                updateAuthNotice();
                syncGalleryState();
                Swal.fire('Success', `Account created! Welcome, ${data.user.name}!`, 'success');
            } else {
                throw new Error(data.message || 'Registration failed');
            }
        } catch (err) {
            Swal.fire('Registration Failed', err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Create Account';
        }
    });
}

// ─── Header UI ────────────────────────────────────────────────────────────────

function updateHeaderUI() {
    const authBtn = $('#auth-btn');
    if (!authBtn) return;
    if (state.user) {
        authBtn.innerHTML = `Sign Out (<strong>${state.user.name.split(' ')[0]}</strong>)`;
    } else {
        authBtn.textContent = 'Sign In';
    }
}

// ─── Logout ───────────────────────────────────────────────────────────────────

function logout() {
    removeToken();
    state.token = null;
    state.user = null;
    state.cart = [];
    persistCart();
    try { sessionStorage.removeItem('sos_selected_design'); } catch (_) {}
    updateHeaderUI();
    updateAuthNotice();
    syncGalleryState();
    Swal.fire('Signed Out', 'You have successfully signed out.', 'success');
}

// ─── Mobile Nav ───────────────────────────────────────────────────────────────

function initNav() {
    const toggle = $('#nav-toggle');
    const links = $('#nav-links');
    if (!toggle) return;
    toggle.addEventListener('click', () => {
        links.classList.toggle('open');
        toggle.classList.toggle('open');
    });
}

// ─── Theme Toggle ─────────────────────────────────────────────────────────────

function initTheme() {
    const toggleBtn = $('#theme-toggle');
    if (!toggleBtn) return;
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.body.classList.add('dark');
        toggleBtn.textContent = '☀️';
    } else {
        document.body.classList.remove('dark');
        toggleBtn.textContent = '🌙';
    }
    toggleBtn.addEventListener('click', () => {
        const isDark = document.body.classList.toggle('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        toggleBtn.textContent = isDark ? '☀️' : '🌙';
    });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    restoreCart();
    await fetchProfile();

    renderGallery();
    initPreviewModal();
    initAuthModal();
    initNav();
    updateHeaderUI();
    updateAuthNotice();

    console.log('🎽 Designs page ready');
});
