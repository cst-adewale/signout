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
    customName: '',
    customNumber: '',
    paymentMethod: 'bank-transfer',
    receipt: null,   // { name, size, type, dataUrl }
    customDesign: null,
    cart: [],
    orders: [],
    user: null,
    token: null,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const fmt = (n) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n);

const PLAIN_SHIRT_ITEM = {
    id: 'PLAIN',
    name: 'Plain White T-Shirt',
    src: 'assets/plain-shirt.webp',
    type: 'plain',
};

const UPLOADED_CUSTOMS_ITEM = {
    id: 'CUSTOM-UPLOADED',
    name: 'For Uploaded Customs',
    src: 'assets/plain-shirt.webp',
    type: 'custom',
};

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

const INITIAL_GALLERY_COUNT = 8;

function genId() {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    const rnd = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `${dd}${mm}${yy}-${rnd}`;
}

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

function updateBrandAssets() {
    const isDark = document.body.classList.contains('dark');
    const logo = $('#site-logo');
    const footerLogo = $('#footer-logo');
    const favicon = $('#site-favicon');
    const asset = isDark ? 'assets/pappy_dark.svg' : 'assets/pappy_light.svg';
    if (logo) logo.src = asset;
    if (footerLogo) footerLogo.src = asset;
    if (favicon) favicon.href = asset;
}

// Token storage helpers
function saveToken(token) {
    try {
        localStorage.setItem('sos_token', token);
    } catch (_) { }
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
    } catch (_) { }
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
// Each cart item carries its own `type` ('plain' | 'custom'), so mixed carts
// (plain shirts + designed shirts together) price correctly per line item
// instead of relying on one global shirt-type toggle.

function priceForItem(item) {
    return CONFIG.prices[item.type] || CONFIG.prices.plain;
}

function calcCartTotals() {
    let totalQty = 0;
    let totalPrice = 0;

    state.cart.forEach(item => {
        const itemPrice = priceForItem(item);
        totalQty += item.qty;
        totalPrice += itemPrice * item.qty;
    });

    const hasBulkDiscount = totalQty >= CONFIG.bulkThreshold;
    const discount = hasBulkDiscount ? totalPrice * CONFIG.bulkDiscount : 0;
    const finalTotal = totalPrice - discount;

    return { totalQty, totalPrice, discount, finalTotal, hasBulkDiscount };
}

function getOrderShirtType() {
    const hasCustomItem = state.cart.some(item => (item.type || 'custom') === 'custom');
    if (hasCustomItem || state.customDesign) return 'custom';
    return 'plain';
}

// ─── Payment Info Box ─────────────────────────────────────────────────────────

function renderPaymentInfo() {
    const rows = CONFIG.paymentDetails[state.paymentMethod] || [];
    const box = $('#payment-info-box');
    box.innerHTML = rows.map(r => {
        const isCopyableAccount = state.paymentMethod === 'bank-transfer' && r.label === 'Account Number';
        return `
        <div class="payment-info-row" style="display:flex;justify-content:space-between;gap:1rem;align-items:center;">
            <span>${r.label}</span>
            <span style="display:inline-flex;align-items:center;gap:0.5rem;">
                <span>${r.value}</span>
                ${isCopyableAccount ? `<button type="button" class="btn btn-secondary btn-sm copy-account-btn" data-copy-value="${r.value}">Copy</button>` : ''}
            </span>
        </div>
    `;
    }).join('');

    box.querySelectorAll('.copy-account-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const value = btn.dataset.copyValue || '';
            try {
                await navigator.clipboard.writeText(value);
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: 'Account copied',
                    showConfirmButton: false,
                    timer: 800,
                    timerProgressBar: true,
                });
            } catch (_) {
                Swal.fire('Copy failed', 'Please copy the account number manually.', 'error');
            }
        });
    });
}

// ─── Gallery & Modal ──────────────────────────────────────────────────────────

function selectDesign(id, name) {
    state.designId = id;
    state.designName = name;

    // Update gallery selection ring
    $$('.gallery-card').forEach(c =>
        c.classList.toggle('selected', c.dataset.id === id)
    );

    // Scroll to order form
    const orderFormSection = $('#order-form');
    if (orderFormSection) {
        orderFormSection.scrollIntoView({ behavior: 'smooth' });
    }
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
            type: design.type || (design.id === 'PLAIN' ? 'plain' : 'custom'),
            qty: 1,
            size: 'M'
        });
    }
    persistCart();
    renderCart();
    updateCartBadge();
    syncGallerySelectionState();
    Swal.fire({
        title: 'Added to Cart',
        text: `${design.name} has been added to your cart.`,
        icon: 'success',
        confirmButtonColor: '#000000',
        timer: 800,
        showConfirmButton: false
    });
}

function removeFromCartById(id) {
    state.cart = state.cart.filter(x => x.id !== id);
    persistCart();
    renderCart();
    updateCartBadge();
    syncGallerySelectionState();
}

// Keep gallery "Select"/"Remove" button states in sync with what's actually in the cart,
// so users can deselect a design directly from the gallery, not just from the cart list.
function syncGallerySelectionState() {
    $$('.gallery-select-btn').forEach(btn => {
        const id = btn.dataset.id;
        const inCart = state.cart.some(item => item.id === id);
        btn.textContent = inCart ? 'Remove' : 'Select Design';
        btn.classList.toggle('btn-primary', !inCart);
        btn.classList.toggle('btn-secondary', inCart);
        btn.closest('.gallery-card')?.classList.toggle('selected', inCart);
    });
}

function persistCart() {
    try {
        sessionStorage.setItem('sos_cart', JSON.stringify(state.cart));
    } catch (_) { }
    updateCartBadge();
}

function restoreCart() {
    try {
        const raw = sessionStorage.getItem('sos_cart');
        state.cart = raw ? JSON.parse(raw) : [];
        // Backfill `type` for any carts saved before per-item pricing existed.
        state.cart.forEach(item => {
            if (!item.type) item.type = item.id === 'PLAIN' ? 'plain' : 'custom';
        });
    } catch (_) {
        state.cart = [];
    }
    updateCartBadge();
}

function renderCart() {
    const empty = $('#cart-empty');
    const items = $('#cart-items');
    const selectedId = $('#selected-design-id');
    if (!empty || !items) return;

    if (state.cart.length === 0) {
        empty.style.display = 'block';
        items.style.display = 'none';
        if (selectedId) selectedId.value = '';
        updateCartPriceSummary();
        updateCartBadge();
        return;
    }

    empty.style.display = 'none';
    items.style.display = 'flex';
    items.innerHTML = state.cart.map(item => `
        <div class="cart-item-card">
            <img class="cart-item-card__img" src="${item.src}" alt="${item.id}">
            <div class="cart-item-card__body">
                <div class="cart-item-card__head">
                    <strong class="cart-item-card__name">${item.name}</strong>
                    <span class="design-tag">${item.type === 'plain' ? 'Plain' : item.id}</span>
                </div>

                <div class="cart-item-card__controls">
                    <div class="cart-item-card__field">
                        <label class="cart-item-card__label">Size</label>
                        <select class="form-select cart-size-select" data-id="${item.id}">
                            <option value="XS" ${item.size === 'XS' ? 'selected' : ''}>XS</option>
                            <option value="S" ${item.size === 'S' ? 'selected' : ''}>S</option>
                            <option value="M" ${item.size === 'M' ? 'selected' : ''}>M</option>
                            <option value="L" ${item.size === 'L' ? 'selected' : ''}>L</option>
                            <option value="XL" ${item.size === 'XL' ? 'selected' : ''}>XL</option>
                            <option value="XXL" ${item.size === 'XXL' ? 'selected' : ''}>2XL</option>
                            <option value="3XL" ${item.size === '3XL' ? 'selected' : ''}>3XL</option>
                        </select>
                    </div>

                    <div class="cart-item-card__field">
                        <label class="cart-item-card__label">Qty</label>
                        <div class="qty-stepper">
                            <button type="button" class="qty-stepper__btn cart-dec" data-id="${item.id}">−</button>
                            <span class="qty-stepper__value">${item.qty}</span>
                            <button type="button" class="qty-stepper__btn cart-inc" data-id="${item.id}">+</button>
                        </div>
                    </div>

                    <button type="button" class="btn btn-secondary btn-sm cart-remove" data-id="${item.id}">Remove</button>
                </div>
            </div>
        </div>
    `).join('');

    // Size change handlers
    items.querySelectorAll('.cart-size-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const item = state.cart.find(x => x.id === e.target.dataset.id);
            if (item) {
                item.size = e.target.value;
                persistCart();
                updateCartPriceSummary();
            }
        });
    });

    // Quantity handlers
    items.querySelectorAll('.cart-dec').forEach(btn => btn.onclick = () => {
        const item = state.cart.find(x => x.id === btn.dataset.id);
        if (!item) return;
        item.qty = Math.max(1, item.qty - 1);
        persistCart();
        renderCart();
        updateCartPriceSummary();
    });

    items.querySelectorAll('.cart-inc').forEach(btn => btn.onclick = () => {
        const item = state.cart.find(x => x.id === btn.dataset.id);
        if (!item) return;
        item.qty += 1;
        persistCart();
        renderCart();
        updateCartPriceSummary();
    });

    items.querySelectorAll('.cart-remove').forEach(btn => btn.onclick = () => {
        removeFromCartById(btn.dataset.id);
        updateCartPriceSummary();
    });

    if (selectedId && state.cart[0]) selectedId.value = state.cart[0].id;
    updateCartPriceSummary();
    updateCartBadge();
}

function updateCartPriceSummary() {
    const totals = calcCartTotals();
    const summary = document.querySelector('#cart-price-summary');

    if (!summary) return;

    let html = `
        <div class="price-box" style="margin-top:1rem;border-top:1px solid #e5e7eb;padding-top:1rem;">
            <div class="price-row" style="display:flex;justify-content:space-between;padding:0.5rem 0;">
                <span>Total Shirts</span>
                <strong>${totals.totalQty}</strong>
            </div>
            <div class="price-row" style="display:flex;justify-content:space-between;padding:0.5rem 0;">
                <span>Subtotal</span>
                <strong>${fmt(totals.totalPrice)}</strong>
            </div>
    `;

    if (totals.hasBulkDiscount) {
        html += `
            <div class="price-row price-row--discount" style="display:flex;justify-content:space-between;padding:0.5rem 0;color:#16a34a;">
                <span>10% Bulk Discount</span>
                <strong>−${fmt(totals.discount)}</strong>
            </div>
            <div class="discount-banner" style="background:#dcfce7;border:1px solid #86efac;border-radius:8px;padding:0.75rem;margin:0.75rem 0;font-size:0.875rem;color:#166534;">
                <strong>✓ 10% discount applied!</strong> You have ${totals.totalQty} shirts in your cart — that's 5 or more, so 10% has already been taken off your total.
            </div>
        `;
    }

    html += `
            <div class="price-divider" style="border-top:2px solid #e5e7eb;margin:0.75rem 0;"></div>
            <div class="price-row price-row--total" style="display:flex;justify-content:space-between;padding:0.75rem 0;font-size:1.1rem;">
                <span><strong>Total</strong></span>
                <strong>${fmt(totals.finalTotal)}</strong>
            </div>
        </div>
    `;

    summary.innerHTML = html;
}

function persistSelectedDesign(id, name, src) {
    try {
        sessionStorage.setItem('sos_selected_design', JSON.stringify({ id, name, src }));
    } catch (_) { }
}

function restoreSelectedDesign() {
    try {
        const raw = sessionStorage.getItem('sos_selected_design');
        if (!raw) return;
        const design = JSON.parse(raw);
        if (design?.id && design?.name) {
            selectDesign(design.id, design.name);
        }
    } catch (_) { }
}

function initGallery() {
    const grid = $('#gallery-grid');
    const modal = $('#gallery-modal');
    const modalImg = $('#modal-img');
    const modalTag = $('#modal-tag');
    const modalName = $('#modal-name');
    const closeBtn = $('#modal-close');
    const selectBtn = $('#modal-select');

    // Plain White T-Shirt is rendered as the first tile in the gallery grid,
    // followed by the regular design catalog — same card markup, same
    // select/preview/cart behavior for all of them.
    const galleryItems = [PLAIN_SHIRT_ITEM, UPLOADED_CUSTOMS_ITEM, ...DESIGN_CATALOG.slice(0, INITIAL_GALLERY_COUNT - 2)];

    if (grid && !grid.dataset.rendered) {
        grid.innerHTML = galleryItems.map(design => `
            <div class="gallery-card ${design.id === 'PLAIN' ? 'gallery-card--plain' : design.id === 'CUSTOM-UPLOADED' ? 'gallery-card--custom-upload' : ''}" data-id="${design.id}" data-name="${design.name}" data-src="${design.src}" data-type="${design.type}">
                <div class="gallery-card__img-wrap">
                    <img src="${design.src}" alt="${design.id}" loading="lazy" decoding="async">
                    <div class="gallery-card__overlay"><span class="btn btn-secondary btn-sm">Preview</span></div>
                </div>
                <div class="gallery-card__foot">
                    <span class="design-tag">${design.type === 'plain' ? 'Plain' : design.id}</span>
                    <span class="gallery-card__name">${design.name}</span>
                    <button type="button" class="btn btn-primary btn-sm gallery-select-btn" data-id="${design.id}" data-name="${design.name}" data-src="${design.src}" data-type="${design.type}">Select Design</button>
                </div>
            </div>
        `).join('');
        grid.dataset.rendered = 'true';
    }

    $$('.gallery-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // If the user clicked the Select Design button inside the card, do not open the preview modal
            if (e.target.closest('.gallery-select-btn')) return;

            const id = card.dataset.id;
            const name = card.dataset.name;
            const src = card.dataset.src;

            modalImg.src = src;
            modalImg.alt = name;
            modalTag.textContent = id === 'PLAIN' ? 'Plain' : id;
            modalName.textContent = name;
            selectBtn.dataset.id = id;
            selectBtn.dataset.name = name;
            selectBtn.dataset.src = src;
            selectBtn.dataset.type = card.dataset.type;
            selectBtn.textContent = state.cart.some(item => item.id === id) ? 'Remove From Cart' : 'Select This Design';

            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        });
    });

    // Handle immediate select/remove button clicks — acts as a toggle so users
    // can pick and unpick designs (and the plain shirt) directly from the gallery.
    $$('.gallery-select-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const name = btn.dataset.name;
            const src = btn.dataset.src || `assets/des${Number(id.slice(1))}.webp`;
            const type = btn.dataset.type || 'custom';

            const alreadyInCart = state.cart.some(item => item.id === id);
            if (alreadyInCart) {
                removeFromCartById(id);
            } else {
                addToCart({ id, name, src, type });
            }
        });
    });

    syncGallerySelectionState();

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
        const src = selectBtn.dataset.src || modalImg.src;
        const type = selectBtn.dataset.type || 'custom';

        const alreadyInCart = state.cart.some(item => item.id === id);
        if (alreadyInCart) {
            removeFromCartById(id);
        } else {
            persistSelectedDesign(id, name, src);
            addToCart({ id, name, src, type });
        }
        closeModal();
    });
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

function compressCustomDesign(dataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = dataUrl;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1200;
            const MAX_HEIGHT = 1200;
            let width = img.width;
            let height = img.height;

            if (width > height && width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
            } else if (height >= width && height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/webp', 0.85));
        };
        img.onerror = () => resolve(dataUrl);
    });
}

function initCustomDesignUpload() {
    const input = $('#custom-design-input');
    const textInput = $('#custom-design-text');
    const preview = $('#custom-design-preview');
    const removeBtn = $('#remove-custom-design');
    const locked = $('#custom-design-locked');
    const uploadWrap = $('#custom-design-upload-wrap');
    const loginBtn = $('#custom-design-login-btn');

    const sync = () => {
        const signedIn = !!state.user;
        if (locked) locked.style.display = signedIn ? 'none' : 'block';
        if (uploadWrap) uploadWrap.style.display = signedIn ? 'block' : 'none';
        if (input) input.disabled = !signedIn;
    };

    sync();

    const setTextDesign = () => {
        if (!textInput || !state.user) return;
        const text = textInput.value.trim();
        if (!text) {
            if (!state.customDesign || state.customDesign.mode !== 'image') {
                state.customDesign = null;
            }
            if (preview && (!state.customDesign || state.customDesign.mode !== 'image')) {
                preview.classList.remove('show');
            }
            return;
        }

        state.customDesign = {
            mode: 'text',
            text,
        };

        if (preview) {
            $('#custom-design-preview-icon').textContent = '📝';
            $('#custom-design-preview-name').textContent = 'Text design request';
            $('#custom-design-preview-size').textContent = text.length > 80 ? `${text.slice(0, 80)}…` : text;
            preview.classList.add('show');
        }
    };

    loginBtn?.addEventListener('click', () => $('#form-login-btn')?.click());

    textInput?.addEventListener('input', () => {
        if (input) input.value = '';
        setTextDesign();
    });

    input?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file || !state.user) return;
        if (textInput) textInput.value = '';

        const maxBytes = CONFIG.maxFileSizeMB * 1024 * 1024;
        if (file.size > maxBytes) {
            Swal.fire('File Too Large', `Please upload a file under ${CONFIG.maxFileSizeMB}MB.`, 'error');
            input.value = '';
            return;
        }

        const allowed = ['image/png', 'image/jpeg', 'image/webp'];
            if (!allowed.includes(file.type)) {
            Swal.fire('Wrong File Type', 'Please upload a PNG, JPG, or WebP image.', 'error');
            input.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = async ev => {
            $('#custom-design-preview-name').textContent = 'Compressing design...';
            preview.classList.add('show');
            const compressedDataUrl = await compressCustomDesign(ev.target.result);
            const approxSize = Math.round((compressedDataUrl.length - 814) / 1.37);

            state.customDesign = {
                name: file.name,
                size: approxSize,
                type: file.type,
                dataUrl: compressedDataUrl,
            };

            $('#custom-design-preview-icon').textContent = '🎨';
            $('#custom-design-preview-name').textContent = file.name;
            $('#custom-design-preview-size').textContent = `${(approxSize / 1024).toFixed(1)} KB (Optimized)`;
        };
        reader.readAsDataURL(file);
    });

    removeBtn?.addEventListener('click', () => {
        state.customDesign = null;
        input.value = '';
        if (textInput) textInput.value = '';
        preview.classList.remove('show');
    });
}

// ─── Form Validation ──────────────────────────────────────────────────────────

function validate() {
    if (!state.cart.length) {
        Swal.fire('No Design Selected', 'Please add at least one design to your cart.', 'warning');
        return false;
    }

    // Check if all cart items have sizes selected
    for (let item of state.cart) {
        if (!item.size) {
            Swal.fire('Missing Size', `Please select a size for ${item.name}.`, 'warning');
            return false;
        }
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

    const pricing = calcCartTotals();
    const order = {
        id: genId(),
        createdAt: new Date().toISOString(),
        shirtType: getOrderShirtType(),
        design: { id: state.cart[0].id, name: state.cart[0].name },
        cartItems: state.cart,
        customization: {
            name: $('#custom-name')?.value.trim() || '',
            number: $('#custom-number')?.value.trim() || '',
        },
        payment: {
            method: state.paymentMethod,
        },
        receipt: state.receipt,
        customDesign: state.customDesign,
        pricing: {
            totalQty: pricing.totalQty,
            subtotal: pricing.totalPrice,
            discount: pricing.discount,
            total: pricing.finalTotal,
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
                        <span style="color:#4b5563;">Total Shirts</span><strong>${order.pricing.totalQty}</strong>
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
    state.receipt = null;
    state.customDesign = null;
    state.cart = [];
    persistCart();

    $('#selected-design-id').value = '';
    renderCart();
    syncGallerySelectionState();

    $$('.gallery-card').forEach(c => c.classList.remove('selected'));

    $('#file-preview').classList.remove('show');
    $('#custom-design-preview')?.classList.remove('show');

    updateCartPriceSummary();
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
                        <span>Total Shirts</span>
                        <span>${order.pricing.totalQty}</span>
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

    function syncCustomDesignGate() {
        const locked = $('#custom-design-locked');
        const uploadWrap = $('#custom-design-upload-wrap');
        const input = $('#custom-design-input');
        if (locked) locked.style.display = state.user ? 'none' : 'block';
        if (uploadWrap) uploadWrap.style.display = state.user ? 'block' : 'none';
        if (input) input.disabled = !state.user;
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
                syncCustomDesignGate();
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
                syncCustomDesignGate();
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
        renderCart();
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
        renderCart();
    }

    syncCustomDesignGate();
}

function logout() {
    removeToken();
    state.token = null;
    state.user = null;

    // Clear cart and design states on logout
    state.cart = [];
    state.designId = null;
    state.designName = null;
    state.receipt = null;
    state.customDesign = null;
    persistCart();
    try {
        sessionStorage.removeItem('sos_selected_design');
    } catch (_) { }

    updateUI();
    Swal.fire('Signed Out', 'You have successfully signed out.', 'success');
}

function syncCustomDesignGate() {
    const locked = $('#custom-design-locked');
    const uploadWrap = $('#custom-design-upload-wrap');
    const input = $('#custom-design-input');
    if (locked) locked.style.display = state.user ? 'none' : 'block';
    if (uploadWrap) uploadWrap.style.display = state.user ? 'block' : 'none';
    if (input) input.disabled = !state.user;
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
    updateBrandAssets();

    toggleBtn.addEventListener('click', () => {
        const isDark = document.body.classList.toggle('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        toggleBtn.textContent = isDark ? '☀️' : '🌙';
        updateBrandAssets();
    });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    restoreCart();
    initAuth();
    await fetchProfile();
    await updateUI();

    initNav();
    initGallery();
    initCustomDesignUpload();
    initPayment();
    initUpload();
    updateCartPriceSummary();

    $('#main-form').addEventListener('submit', handleSubmit);
    restoreSelectedDesign();

    console.log('🎽 Signoutshirts app ready');
});
