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

grid.querySelectorAll('.gallery-card').forEach(card => {
    card.addEventListener('click', (e) => {
        if (e.target.closest('[data-select]')) return;
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.innerHTML = `
            <div class="modal" role="dialog" style="max-width:720px;">
                <button class="modal__close" aria-label="Close">&times;</button>
                <div class="modal__body">
                    <div class="modal__img-col">
                        <img src="${card.dataset.src}" alt="${card.dataset.id}" style="width:100%;height:auto;">
                    </div>
                    <div class="modal__info-col">
                        <span class="design-tag">${card.dataset.id}</span>
                        <h3 class="t-md" style="margin-top:.5rem;">${card.dataset.name}</h3>
                        <button class="btn btn-primary w-full" data-select-preview="${card.dataset.id}" style="margin-top:1rem;">Use This Design</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const close = () => modal.remove();
        modal.querySelector('.modal__close').addEventListener('click', close);
        modal.addEventListener('click', (ev) => { if (ev.target === modal) close(); });
        modal.querySelector('[data-select-preview]').addEventListener('click', () => {
            sessionStorage.setItem('sos_selected_design', JSON.stringify({
                id: card.dataset.id,
                name: card.dataset.name,
                src: card.dataset.src
            }));
            window.location.href = 'index.html#order-form';
        });
    });
});
