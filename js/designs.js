const DESIGN_CATALOG = Array.from({ length: 47 }, (_, i) => {
    const num = i + 1;
    const id = `D${String(num).padStart(2, '0')}`;
    return {
        id,
        name: `Design ${String(num).padStart(2, '0')}`,
        src: `assets/des${num}.webp`,
    };
});

const grid = document.getElementById('full-gallery-grid');

grid.innerHTML = DESIGN_CATALOG.map(design => `
    <div class="gallery-card" data-id="${design.id}" data-name="${design.name}" data-src="${design.src}">
        <div class="gallery-card__img-wrap">
            <img src="${design.src}" alt="${design.id}" loading="lazy" decoding="async">
            <div class="gallery-card__overlay"><span class="btn btn-secondary btn-sm">Select</span></div>
        </div>
        <div class="gallery-card__foot">
            <span class="design-tag">${design.id}</span>
            <span class="gallery-card__name">${design.name}</span>
            <button type="button" class="btn btn-primary btn-sm" data-select="${design.id}">Use This Design</button>
        </div>
    </div>
`).join('');

grid.querySelectorAll('[data-select]').forEach(btn => {
    btn.addEventListener('click', () => {
        const card = btn.closest('.gallery-card');
        const payload = {
            id: card.dataset.id,
            name: card.dataset.name,
            src: card.dataset.src
        };
        sessionStorage.setItem('sos_selected_design', JSON.stringify(payload));
        window.location.href = 'index.html#order-form';
    });
});
