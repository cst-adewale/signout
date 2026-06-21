/**
 * app.js — Customer Order Flow
 * Signoutshirts | Class of 2026
 */

// ─── Config ──────────────────────────────────────────────────────────────────

const CONFIG = {
    prices: { plain: 5000, custom: 6000 },
    bulkThreshold: 5,
    bulkDiscount: 0.10,
    maxFileSizeMB: 5,
    adminEmail: 'pappymedia01@gmail.com',   // ← your admin email
    paymentDetails: {
        'bank-transfer': [
            { label: 'Account Name', value: 'Adegbuyi Elijah Muyiwa' },
            { label: 'Bank', value: 'GTBank' },
            { label: 'Account Number', value: '0510136683' },
        ],
        'ussd': [
            { label: 'GTBank', value: '*737*2*Amount*0510136683#' },
            { label: 'FirstBank', value: '*894*Amount*0510136683#' },
            { label: 'Zenith', value: '*966*Amount*0510136683#' },
        ],
    },
};

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
    shirtType: 'plain',
    designId: null,
    designName: null,
    size: '',
    qty: 1,
    customName: '',
    customNumber: '',
    paymentMethod: 'bank-transfer',
    receipt: null,   // { name, size, type, dataUrl }
    orders: [],
    user: null,
    token: null,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const fmt = (n) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n);

function genId() {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    const rnd = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `${dd}${mm}${yy}-${rnd}`;
}

// Token storage helpers
function saveToken(token) {
    try {
        localStorage.setItem('sos_token', token);
    } catch (_) {}
}

function loadToken() {
    try {
        return localStorage.getItem('sos_token');
    } catch (_) {
        return null;
    }
}

function removeToken() {
    try {
        localStorage.removeItem('sos_token');
    } catch (_) {}
}

// Fetch user profile from backend
async function fetchProfile() {
    const token = loadToken();
    if (!token) return null;

    try {
        const res = await fetch('/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
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

// Fetch user's orders from database
async function fetchUserOrders() {
    if (!state.token) return;
    try {
        const res = await fetch('/api/orders/my', {
            headers: {
                'Authorization': `Bearer ${state.token}`
            }
        });
        const data = await res.json();
        if (res.ok && data.success) {
            state.orders = data.orders;
        }
    } catch (err) {
        console.error('Error fetching user orders:', err);
    }
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

function calcPrice() {
    const unit = CONFIG.prices[state.shirtType];
    const subtotal = unit * state.qty;
    const bulk = state.qty >= CONFIG.bulkThreshold;
    const discount = bulk ? subtotal * CONFIG.bulkDiscount : 0;
    return { unit, subtotal, discount, total: subtotal - discount, bulk };
}

function refreshPricing() {
    const p = calcPrice();

    $('#price-unit').textContent = fmt(p.unit);
    $('#price-total').textContent = fmt(p.total);

    const bulkBanner = $('#bulk-banner');
    if (p.bulk) {
        bulkBanner.classList.add('show');
        $('#price-original-row').style.display = 'flex';
        $('#price-discount-row').style.display = 'flex';
        $('#price-original').textContent = fmt(p.subtotal);
        $('#price-discount').textContent = `−${fmt(p.discount)}`;
    } else {
        bulkBanner.classList.remove('show');
        $('#price-original-row').style.display = 'none';
        $('#price-discount-row').style.display = 'none';
    }
}

// ─── Payment Info Box ─────────────────────────────────────────────────────────

function renderPaymentInfo() {
    const rows = CONFIG.paymentDetails[state.paymentMethod] || [];
    const box = $('#payment-info-box');
    box.innerHTML = rows.map(r => `
        <div class="payment-info-row">
            <span>${r.label}</span>
            <span>${r.value}</span>
        </div>
    `).join('');
}

// ─── Gallery & Modal ──────────────────────────────────────────────────────────

function selectDesign(id, name) {
    state.designId = id;
    state.designName = name;

    // Update gallery selection ring
    $$('.gallery-card').forEach(c =>
        c.classList.toggle('selected', c.dataset.id === id)
    );

    // Update form display
    const display = $('#design-display');
    if (display) {
        display.textContent = `✓ ${name} (${id}) selected`;
        display.classList.add('has-design');
    }

    const selectEl = $('#selected-design-id');
    if (selectEl) {
        selectEl.value = id;
    }

    // Scroll to order form
    const orderFormSection = $('#order-form');
    if (orderFormSection) {
        orderFormSection.scrollIntoView({ behavior: 'smooth' });
    }
}

function initGallery() {
    const modal = $('#gallery-modal');
    const modalImg = $('#modal-img');
    const modalTag = $('#modal-tag');
    const modalName = $('#modal-name');
    const closeBtn = $('#modal-close');
    const selectBtn = $('#modal-select');

    $$('.gallery-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // If the user clicked the Select Design button inside the card, do not open the preview modal
            if (e.target.closest('.gallery-select-btn')) return;

            const id = card.dataset.id;
            const name = card.dataset.name;
            const src = card.dataset.src;

            modalImg.src = src;
            modalImg.alt = name;
            modalTag.textContent = id;
            modalName.textContent = name;
            selectBtn.dataset.id = id;
            selectBtn.dataset.name = name;

            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        });
    });

    // Handle immediate select design button clicks
    $$('.gallery-select-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const name = btn.dataset.name;
            selectDesign(id, name);
        });
    });

    function closeModal() {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

    selectBtn.addEventListener('click', () => {
        const id = selectBtn.dataset.id;
        const name = selectBtn.dataset.name;

        selectDesign(id, name);
        closeModal();
    });
}

// ─── Shirt Type Toggle ────────────────────────────────────────────────────────

function initShirtType() {
    $$('input[name="shirt-type"]').forEach(radio => {
        radio.addEventListener('change', e => {
            state.shirtType = e.target.value;
            $('#custom-section').style.display =
                state.shirtType === 'custom' ? 'block' : 'none';
            refreshPricing();
        });
    });
}

// ─── Quantity Stepper ─────────────────────────────────────────────────────────

function initQty() {
    const input = $('#qty-input');
    const dec = $('#qty-dec');
    const inc = $('#qty-inc');

    function setQty(n) {
        state.qty = Math.max(1, Math.min(100, n));
        input.value = state.qty;
        refreshPricing();
    }

    dec.addEventListener('click', () => setQty(state.qty - 1));
    inc.addEventListener('click', () => setQty(state.qty + 1));
    input.addEventListener('change', () => setQty(parseInt(input.value) || 1));
}

// ─── Payment Method ───────────────────────────────────────────────────────────

function initPayment() {
    $$('input[name="payment-method"]').forEach(radio => {
        radio.addEventListener('change', e => {
            state.paymentMethod = e.target.value;
            renderPaymentInfo();
        });
    });
    renderPaymentInfo();
}

// ─── Receipt Upload ───────────────────────────────────────────────────────────

function compressImage(dataUrl, fileType, callback) {
    if (fileType === 'application/pdf') {
        callback(dataUrl);
        return;
    }
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
            if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
            }
        } else {
            if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
            }
        }
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to WebP or JPEG for massive size compression
        const outputType = fileType === 'image/png' ? 'image/jpeg' : fileType;
        const compressedDataUrl = canvas.toDataURL(outputType, 0.7);
        callback(compressedDataUrl);
    };
    img.onerror = () => {
        callback(dataUrl);
    };
}

function initUpload() {
    const input = $('#receipt-input');
    const preview = $('#file-preview');
    const removeBtn = $('#remove-file');

    input.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;

        const maxBytes = CONFIG.maxFileSizeMB * 1024 * 1024;
        if (file.size > maxBytes) {
            Swal.fire('File Too Large', `Please upload a file under ${CONFIG.maxFileSizeMB}MB.`, 'error');
            input.value = '';
            return;
        }

        const allowed = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
        if (!allowed.includes(file.type)) {
            Swal.fire('Wrong File Type', 'Please upload a PNG, JPG, or PDF.', 'error');
            input.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = ev => {
            const rawDataUrl = ev.target.result;

            // Show loading state while compressing
            $('#preview-name').textContent = "Compressing image...";
            preview.classList.add('show');

            compressImage(rawDataUrl, file.type, (compressedDataUrl) => {
                // Calculate size of base64 string
                const approxSize = Math.round((compressedDataUrl.length - 814) / 1.37);

                state.receipt = {
                    name: file.name,
                    size: approxSize,
                    type: file.type,
                    dataUrl: compressedDataUrl,
                };

                $('#preview-icon').textContent =
                    file.type === 'application/pdf' ? '📄' : '🖼️';
                $('#preview-name').textContent = file.name;
                $('#preview-size').textContent =
                    `${(approxSize / 1024).toFixed(1)} KB (Optimized)`;
            });
        };
        reader.readAsDataURL(file);
    });

    removeBtn.addEventListener('click', () => {
        state.receipt = null;
        input.value = '';
        preview.classList.remove('show');
    });
}

// ─── Form Validation ──────────────────────────────────────────────────────────

function validate() {
    if (!state.designId) {
        Swal.fire('No Design Selected', 'Please pick a design from the gallery above.', 'warning');
        return false;
    }
    if (!$('#size-select').value) {
        Swal.fire('No Size Selected', 'Please choose a shirt size.', 'warning');
        return false;
    }
    if (!state.receipt) {
        Swal.fire('No Receipt', 'Please upload your payment receipt.', 'warning');
        return false;
    }
    if (!$('#cust-name').value.trim()) {
        Swal.fire('Missing Name', 'Please enter your full name.', 'warning');
        return false;
    }
    if (!$('#cust-email').value.trim()) {
        Swal.fire('Missing Email', 'Please enter your email address.', 'warning');
        return false;
    }
    if (!$('#cust-whatsapp').value.trim()) {
        Swal.fire('Missing WhatsApp', 'Please enter your WhatsApp number.', 'warning');
        return false;
    }
    if (!$('#cust-location').value.trim()) {
        Swal.fire('Missing Location', 'Please enter your delivery location.', 'warning');
        return false;
    }
    if (!$('#terms').checked) {
        Swal.fire('Terms', 'Please agree to the terms before submitting.', 'warning');
        return false;
    }
    return true;
}

// ─── Form Submission ──────────────────────────────────────────────────────────

async function handleSubmit(e) {
    e.preventDefault();
    if (!state.user) {
        Swal.fire('Please Sign In', 'You must be signed in to submit an order.', 'warning');
        return;
    }
    if (!validate()) return;

    const btn = $('#submit-btn');
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    const pricing = calcPrice();
    const order = {
        id: genId(),
        createdAt: new Date().toISOString(),
        shirtType: state.shirtType,
        design: { id: state.designId, name: state.designName },
        size: $('#size-select').value,
        qty: state.qty,
        customization: {
            name: $('#custom-name').value.trim(),
            number: $('#custom-number').value.trim(),
        },
        payment: {
            method: state.paymentMethod,
        },
        receipt: state.receipt,
        pricing: {
            unit: pricing.unit,
            subtotal: pricing.subtotal,
            discount: pricing.discount,
            total: pricing.total,
        },
        customer: {
            name: $('#cust-name').value.trim(),
            email: $('#cust-email').value.trim(),
            whatsapp: $('#cust-whatsapp').value.trim(),
            location: $('#cust-location').value.trim(),
        },
        status: 'pending',
    };

    try {
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify(order)
        });
        const resData = await response.json();
        if (!response.ok || !resData.success) {
            throw new Error(resData.message || 'Server error saving order');
        }

        // Refresh orders list from database
        await fetchUserOrders();

        // Reset UI
        btn.disabled = false;
        btn.textContent = 'Submit Order';

        // SweetAlert — Order Sent!
        await Swal.fire({
            title: 'Order Sent! 🎉',
            html: `
                <p style="margin-bottom:1rem;color:#4b5563;">
                    Your order <strong>#${order.id}</strong> has been submitted successfully.
                </p>
                <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:1rem;text-align:left;font-size:.9rem;">
                    <div style="display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid #e5e7eb;">
                        <span style="color:#4b5563;">Design</span><strong>${order.design.name}</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid #e5e7eb;">
                        <span style="color:#4b5563;">Qty × Size</span><strong>${order.qty} × ${order.size}</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:.4rem 0;">
                        <span style="color:#4b5563;">Total Paid</span><strong>${fmt(order.pricing.total)}</strong>
                    </div>
                </div>
                <p style="margin-top:1rem;font-size:.875rem;color:#9ca3af;">
                    The admin will verify your payment and send a confirmation to
                    <strong>${order.customer.email}</strong>.
                </p>
            `,
            icon: 'success',
            confirmButtonColor: '#000000',
            confirmButtonText: 'View My Orders',
            allowOutsideClick: false,
        });

        // Reset form
        resetForm();
        renderMyOrders();
        $('#my-orders').scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        console.error(err);
        Swal.fire('Submission Failed', err.message || 'Could not connect to the database. Please try again.', 'error');
        btn.disabled = false;
        btn.textContent = 'Submit Order';
    }
}

// ─── Admin Email Notification ─────────────────────────────────────────────────

async function notifyAdmin(order) {
    /**
     * Plug in EmailJS or your backend here.
     *
     * With EmailJS:
     *   await emailjs.send('SERVICE_ID', 'TEMPLATE_ADMIN', {
     *       order_id:      order.id,
     *       customer_name: order.customer.name,
     *       customer_email:order.customer.email,
     *       total:         fmt(order.pricing.total),
     *       receipt_url:   order.receipt.dataUrl,   // base64 image
     *   });
     *
     * With your own backend:
     *   await fetch('/api/orders', { method:'POST', body: JSON.stringify(order) });
     */
    console.log('📧 [notifyAdmin] Order ready to send to admin:', CONFIG.adminEmail, order.id);
}

// ─── Reset Form ───────────────────────────────────────────────────────────────

function resetForm() {
    $('#main-form').reset();

    state.designId = null;
    state.designName = null;
    state.shirtType = 'plain';
    state.qty = 1;
    state.receipt = null;

    const display = $('#design-display');
    display.textContent = 'No design selected — browse above';
    display.classList.remove('has-design');
    $('#selected-design-id').value = '';

    $$('.gallery-card').forEach(c => c.classList.remove('selected'));

    $('#file-preview').classList.remove('show');
    $('#custom-section').style.display = 'none';

    refreshPricing();
    renderPaymentInfo();
}

// ─── My Orders Dashboard ──────────────────────────────────────────────────────

function renderMyOrders() {
    const empty = $('#orders-empty');
    const grid = $('#orders-grid');

    if (state.orders.length === 0) {
        empty.style.display = 'block';
        grid.style.display = 'none';
        return;
    }

    empty.style.display = 'none';
    grid.style.display = 'grid';

    grid.innerHTML = [...state.orders].reverse().map(order => {
        const date = new Date(order.createdAt).toLocaleDateString('en-NG');
        const status = order.status;
        return `
            <div class="order-card">
                <div class="order-card__head">
                    <div>
                        <div class="order-card__id">#${order.id}</div>
                        <div class="order-card__date">${date}</div>
                    </div>
                    <span class="badge badge--${status}">${status}</span>
                </div>
                <div class="order-card__body">
                    <div class="order-card__row">
                        <span>Design</span>
                        <span>${order.design.name} (${order.design.id})</span>
                    </div>
                    <div class="order-card__row">
                        <span>Type</span>
                        <span>${order.shirtType === 'custom' ? 'Customized' : 'Plain'}</span>
                    </div>
                    <div class="order-card__row">
                        <span>Size</span>
                        <span>${order.size}</span>
                    </div>
                    <div class="order-card__row">
                        <span>Qty</span>
                        <span>${order.qty}</span>
                    </div>
                    <div class="order-card__row">
                        <span>Payment</span>
                        <span>${order.payment.method === 'bank-transfer' ? 'Bank Transfer' : 'USSD'}</span>
                    </div>
                </div>
                <div class="order-card__foot">
                    <span class="order-card__total">${fmt(order.pricing.total)}</span>
                </div>
            </div>
        `;
    }).join('');
}

// ─── Authentication Interface ──────────────────────────────────────────────────

function initAuth() {
    const authBtn = $('#auth-btn');
    const authModal = $('#auth-modal');
    const authModalClose = $('#auth-modal-close');
    const loginFormContainer = $('#login-form-container');
    const signupFormContainer = $('#signup-form-container');
    const switchToSignup = $('#switch-to-signup');
    const switchToLogin = $('#switch-to-login');

    const formLoginBtn = $('#form-login-btn');
    const ordersLoginBtn = $('#orders-login-btn');

    // Forms
    const loginForm = $('#login-form');
    const signupForm = $('#signup-form');

    function openAuthModal(startWithSignup = false) {
        if (startWithSignup) {
            loginFormContainer.style.display = 'none';
            signupFormContainer.style.display = 'block';
        } else {
            loginFormContainer.style.display = 'block';
            signupFormContainer.style.display = 'none';
        }
        authModal.classList.add('active');
        authModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }

    function closeAuthModal() {
        authModal.classList.remove('active');
        authModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    authBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (state.user) {
            // Sign Out action
            Swal.fire({
                title: 'Sign Out',
                text: 'Are you sure you want to sign out?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#000',
                cancelButtonColor: '#6b7280',
                confirmButtonText: 'Yes, Sign Out'
            }).then((result) => {
                if (result.isConfirmed) {
                    logout();
                }
            });
        } else {
            openAuthModal(false);
        }
    });

    authModalClose.addEventListener('click', closeAuthModal);
    authModal.addEventListener('click', e => { if (e.target === authModal) closeAuthModal(); });
    
    switchToSignup.addEventListener('click', (e) => {
        e.preventDefault();
        openAuthModal(true);
    });

    switchToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        openAuthModal(false);
    });

    if (formLoginBtn) formLoginBtn.addEventListener('click', () => openAuthModal(false));
    if (ordersLoginBtn) ordersLoginBtn.addEventListener('click', () => openAuthModal(false));

    // Handle Login Submit
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
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                saveToken(data.token);
                state.token = data.token;
                state.user = data.user;
                closeAuthModal();
                loginForm.reset();
                
                await updateUI();
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

    // Handle Signup Submit
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
                body: JSON.stringify({ name, email, whatsapp, location, password })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                saveToken(data.token);
                state.token = data.token;
                state.user = data.user;
                closeAuthModal();
                signupForm.reset();

                await updateUI();
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

async function updateUI() {
    const authBtn = $('#auth-btn');
    const navOrdersLink = $('#nav-orders-link');
    const formOverlay = $('#form-logged-out-overlay');
    const ordersLoggedOut = $('#orders-logged-out');
    const ordersEmpty = $('#orders-empty');
    const ordersGrid = $('#orders-grid');
    const mainForm = $('#main-form');

    if (state.user) {
        // Authenticated State
        authBtn.innerHTML = `Sign Out (<strong>${state.user.name.split(' ')[0]}</strong>)`;
        if (navOrdersLink) navOrdersLink.style.display = 'inline-block';
        if (formOverlay) formOverlay.style.display = 'none';
        if (ordersLoggedOut) ordersLoggedOut.style.display = 'none';
        if (mainForm) mainForm.style.display = 'block';

        // Auto-fill Step 7: Your Details
        $('#cust-name').value = state.user.name;
        $('#cust-email').value = state.user.email;
        $('#cust-whatsapp').value = state.user.whatsapp;
        $('#cust-location').value = state.user.location;

        // Fetch and render orders from database
        await fetchUserOrders();
        renderMyOrders();
    } else {
        // Logged Out State
        authBtn.textContent = 'Sign In';
        if (navOrdersLink) navOrdersLink.style.display = 'none';
        if (formOverlay) formOverlay.style.display = 'block';
        if (ordersLoggedOut) ordersLoggedOut.style.display = 'block';
        if (ordersEmpty) ordersEmpty.style.display = 'none';
        if (ordersGrid) ordersGrid.style.display = 'none';
        if (mainForm) mainForm.style.display = 'none';

        // Clear details
        $('#cust-name').value = '';
        $('#cust-email').value = '';
        $('#cust-whatsapp').value = '';
        $('#cust-location').value = '';
        state.orders = [];
    }
}

function logout() {
    removeToken();
    state.token = null;
    state.user = null;
    updateUI();
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

// ─── Theme Toggle (Light / Dark Mode) ──────────────────────────────────────────

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
    initAuth();
    await fetchProfile();
    await updateUI();

    initNav();
    initGallery();
    initShirtType();
    initQty();
    initPayment();
    initUpload();
    refreshPricing();

    $('#main-form').addEventListener('submit', handleSubmit);

    console.log('🎽 Signoutshirts app ready');
});