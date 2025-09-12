const FILETYPE_LABELS = (() => {
    const mapEl = document.getElementById('clarama-filetype-map');
    const out = {};
    if (mapEl) {
        mapEl.querySelectorAll(':scope > div[id]').forEach(div => {
            const key = (div.id || '').trim().toLowerCase();
            const val = (div.textContent || '').trim();
            if (key && val) out[key] = val;
        });
    }
    return out;
})();

document.addEventListener('DOMContentLoaded', () => {
    load_favorites($CLARAMA_USER);

    const dd = document.getElementById('fav-dropdown');
    if (dd) dd.style.display = 'block';

    const grid = document.getElementById('roles-grid');

    const LAST_COUNT_KEY = `clarama:lastFavCount:${$CLARAMA_USER}`;
    const lastCount = parseInt(localStorage.getItem(LAST_COUNT_KEY) || '1', 10);
    const MAX_INITIAL_WAIT_MS = (lastCount === 0 ? 0 : 700);
    const START_TS = Date.now();

    let rolesRevealed = (MAX_INITIAL_WAIT_MS === 0);
    let lastFavHash = '';

    if (grid && !rolesRevealed) {
        grid.querySelectorAll('.role-wrapper').forEach(a => a.classList.add('pre-wait'));
    }

    const initialTimer = setInterval(() => {
        const favReady = (typeof favoriteFileExists !== 'undefined');

        if (favReady) {
            handleFavsUpdate();
            revealRolesIfNeeded();
            clearInterval(initialTimer);
            return;
        }

        if (!rolesRevealed && (Date.now() - START_TS) >= MAX_INITIAL_WAIT_MS) {
            revealRolesIfNeeded();
            clearInterval(initialTimer);
        }
    }, 80);

    const watcher = setInterval(() => {
        if (typeof favoriteFileExists === 'undefined') return;
        handleFavsUpdate();
        if (!document.body.contains(grid)) clearInterval(watcher);
    }, 250);

    if (grid) {
        const mo = new MutationObserver(() => recalcStaggerDelays(grid));
        mo.observe(grid, { childList: true, subtree: true });
    }

    // --------------- Local helpers ---------------
    function revealRolesIfNeeded() {
        if (!grid || rolesRevealed) return;
        rolesRevealed = true;
        grid.querySelectorAll('.role-wrapper.pre-wait').forEach(a => a.classList.remove('pre-wait'));
        recalcStaggerDelays(grid);
    }

    function handleFavsUpdate() {
        const newHash = favHash();
        if (newHash === lastFavHash) return;
        lastFavHash = newHash;

        if (grid) render_home_favorites();
        render_nav_favorites();
        if (grid) recalcStaggerDelays(grid);

        try { localStorage.setItem(LAST_COUNT_KEY, String((favoriteFiles || []).length)); } catch (_) {}

        const pageStar = document.getElementById('page-fav');
        if (pageStar) {
            const onThisPage = (favoriteFiles || []).some(row => row[1] === window.location.pathname);
            pageStar.classList.toggle('bi-star-fill', onThisPage);
            pageStar.classList.toggle('bi-star', !onThisPage);
        }

        revealRolesIfNeeded();
    }

    function favHash() {
        try {
            if (!Array.isArray(favoriteFiles)) return '';
            const urls = favoriteFiles.map(r => r[1]).filter(Boolean).sort();
            return urls.length ? JSON.stringify(urls) : '__NONE__';
        } catch {
            return '';
        }
    }
});

/* --------------------- Shared helpers --------------------- */

function basename(path = '') {
    try {
        const clean = decodeURIComponent(String(path));
        const parts = clean.split(/[\\/]/);
        return parts[parts.length - 1] || clean;
    } catch {
        return String(path);
    }
}

function getFileTypeLabel(filenameOrPath) {
    const name = basename(filenameOrPath).toLowerCase();

    let best = null;
    let bestLen = -1;
    for (const key in FILETYPE_LABELS) {
        if (name.endsWith(key) && key.length > bestLen) {
            best = FILETYPE_LABELS[key];
            bestLen = key.length;
        }
    }
    return best || 'File';
}

function stripExtension(nameOrPath) {
    const base = basename(nameOrPath);
    const lower = base.toLowerCase();

    let bestLen = -1;
    for (const key in FILETYPE_LABELS) {
        if (lower.endsWith(key) && key.length > bestLen) {
            bestLen = key.length;
        }
    }
    if (bestLen > -1) return base.slice(0, base.length - bestLen);

    // Fallback: remove the last extension only (keeps ".env" as-is)
    const dot = base.lastIndexOf('.');
    return dot > 0 ? base.slice(0, dot) : base;
}

function initFavCarousel(carousel) {
    const viewport = carousel.querySelector('.fav-viewport');
    const track    = carousel.querySelector('.fav-track');
    const prevBtn  = carousel.querySelector('.fav-prev');
    const nextBtn  = carousel.querySelector('.fav-next');

    const page = () => Math.max(1, viewport.clientWidth); // scroll one viewport width

    const onPrev = () => {
        viewport.scrollBy({ left: -page(), behavior: 'smooth' });
    };
    const onNext = () => {
        viewport.scrollBy({ left: page(), behavior: 'smooth' });
    };

    prevBtn.addEventListener('click', onPrev);
    nextBtn.addEventListener('click', onNext);

    // Update nav state on scroll/resize/content changes
    const onScroll = () => updateFavCarouselNavState(carousel);
    viewport.addEventListener('scroll', onScroll, { passive: true });

    // Keyboard support (focus the viewport to use ←/→)
    viewport.tabIndex = 0;
    viewport.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft')  { e.preventDefault(); onPrev(); }
        if (e.key === 'ArrowRight') { e.preventDefault(); onNext(); }
    });

    // Wheel support (trackpads)
    viewport.addEventListener('wheel', (e) => {
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (delta) {
            e.preventDefault();
            viewport.scrollLeft += delta;
        }
    }, { passive: false });

    // Observe size & content
    const ro = new ResizeObserver(() => updateFavCarouselNavState(carousel));
    ro.observe(viewport);
    const mo = new MutationObserver(() => updateFavCarouselNavState(carousel));
    mo.observe(track, { childList: true, subtree: false });

    // Initial state
    requestAnimationFrame(() => updateFavCarouselNavState(carousel));
    carousel._favObservers = { ro, mo }; // (optional) keep refs if you later need to disconnect
}

function updateFavCarouselNavState(carousel) {
    const viewport = carousel.querySelector('.fav-viewport');
    const prevBtn  = carousel.querySelector('.fav-prev');
    const nextBtn  = carousel.querySelector('.fav-next');
  
    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const hasOverflow = maxScroll > 0;
  
    // Show/hide arrows & fades only when needed
    carousel.classList.toggle('has-overflow', hasOverflow);
    prevBtn.hidden = nextBtn.hidden = !hasOverflow;   // also hides from screen readers
  
    if (!hasOverflow) return;  // nothing else to do
  
    const x = Math.round(viewport.scrollLeft);
    const atStart = x <= 0;
    const atEnd   = x >= (maxScroll - 1);
  
    prevBtn.disabled = atStart;
    nextBtn.disabled = atEnd;
}  

/* --------------------- UI renderers --------------------- */

function render_home_favorites() {
    const grid = document.getElementById('roles-grid');
    if (!grid || !Array.isArray(favoriteFiles)) return;

    // Clear existing fav content (raw cards + previous carousel + separator)
    grid.querySelectorAll('a.role-wrapper.is-fav').forEach(n => n.remove());
    const oldCarousel = grid.querySelector('.fav-carousel');
    if (oldCarousel) oldCarousel.remove();
    const oldSep = grid.querySelector('.fav-role-separator');
    if (oldSep) oldSep.remove();

    const favs = favoriteFiles.slice();
    if (favs.length === 0) {
        ensureSeparator(grid, false);
        return;
    }

    // Build the carousel shell
    const carousel = document.createElement('div');
    carousel.className = 'fav-carousel';
    carousel.setAttribute('role', 'region');
    carousel.setAttribute('aria-label', 'Favourite items');

    const prevBtn = document.createElement('button');
    prevBtn.className = 'fav-nav fav-prev';
    prevBtn.type = 'button';
    prevBtn.innerHTML = '<i class="bi bi-chevron-left" aria-hidden="true"></i><span class="visually-hidden">Previous</span>';

    const nextBtn = document.createElement('button');
    nextBtn.className = 'fav-nav fav-next';
    nextBtn.type = 'button';
    nextBtn.innerHTML = '<i class="bi bi-chevron-right" aria-hidden="true"></i><span class="visually-hidden">Next</span>';

    const viewport = document.createElement('div');
    viewport.className = 'fav-viewport';

    const track = document.createElement('div');
    track.className = 'fav-track';

    viewport.appendChild(track);
    carousel.appendChild(prevBtn);
    carousel.appendChild(viewport);
    carousel.appendChild(nextBtn);

    // Card template (keeps your star left + icon + text layout)
    const favTemplate = ({ name, url, icon, type, idx }) => `
        <a href="${url}"
           class="d-flex role-wrapper is-fav text-decoration-none anim-in"
           style="min-width: 18rem; max-width: 48rem; width: fit-content; --stagger-index:${idx};"
           title="${url}">
            <div class="clickable-card card align-items-center shadow-lg p-4 flex-grow-1 fav-card">

                <i class="bi bi-star-fill text-warning fav-toggle"
                   role="button" aria-label="Unfavourite"
                   data-name="${name}"
                   data-url="${url}"
                   data-icon="${icon}"
                   data-type="${type}"></i>

                <i class="bi ${icon} fs-2 p-0 fav-icon"></i>

                <p class="card-text fav-type">${type}</p>

                <div class="card-body text-center w-100 d-flex flex-column py-2">
                    <h5 class="card-title d-flex align-items-center justify-content-center gap-2">
                        <span>${stripExtension(name)}</span>
                    </h5>
                </div>
            </div>
        </a>
    `.trim();

    // Fill the track
    const html = favs.map((row, idx) => favTemplate({
        name: row[0],
        url: row[1],
        icon: row[2],
        type: row[3] === 'file' ? getFileTypeLabel(row[1]) : row[3],
        idx
    })).join('');
    track.insertAdjacentHTML('beforeend', html);

    // Insert carousel at the top of the grid
    grid.insertAdjacentElement('afterbegin', carousel);
    ensureSeparator(grid, true);

    // Existing star/unfavourite delegation (works inside carousel too)
    if (!grid.dataset.favDelegated) {
        grid.addEventListener('click', (e) => {
            const star = e.target.closest('.fav-toggle');
            if (!star) return;

            e.preventDefault();
            e.stopPropagation();

            const name = star.dataset.name;
            const url  = star.dataset.url;
            const icon = star.dataset.icon;
            const type = star.dataset.type;

            toggle_favorite(name, url, icon, $CLARAMA_USER, type);

            const card = star.closest('a.role-wrapper.is-fav');
            if (card) {
                animateRemove(card, () => {
                    card.remove();
                    if (grid.querySelectorAll('a.role-wrapper.is-fav').length === 0) {
                        ensureSeparator(grid, false);
                    }
                    recalcStaggerDelays(grid);
                    updateFavCarouselNavState(carousel); // keep arrows correct
                });
            }

            render_nav_favorites();
        });
        grid.dataset.favDelegated = '1';
    }

    // Carousel wiring
    initFavCarousel(carousel);
    recalcStaggerDelays(grid);
}

function ensureSeparator(grid, shouldShow) {
    const existing = grid.querySelector('.fav-role-separator');
    if (shouldShow) {
        if (!existing) {
            const sep = document.createElement('div');
            sep.className = 'w-100 fav-role-separator';
            sep.setAttribute('aria-hidden', 'true');

            const firstRole = Array.from(grid.children)
                .find(n => n.matches('a.role-wrapper') && !n.classList.contains('is-fav'));
            if (firstRole) {
                grid.insertBefore(sep, firstRole);
            } else {
                grid.appendChild(sep);
            }
        }
    } else if (existing) {
        existing.remove();
    }
}

function recalcStaggerDelays(grid) {
    const cards = Array.from(grid.querySelectorAll('a.role-wrapper'));
    if (!cards.length) return;

    cards.forEach((card, i) => {
        card.style.setProperty('--stagger-index', String(i));
        if (!card.classList.contains('anim-in')) {
            card.classList.add('anim-in');
            card.style.animation = 'none';
            requestAnimationFrame(() => { card.style.animation = ''; });
        }
    });
}

function animateRemove(el, done) {
    el.classList.add('removing');
    const after = () => {
        el.removeEventListener('animationend', after);
        el.removeEventListener('transitionend', after);
        if (typeof done === 'function') done();
    };
    el.addEventListener('animationend', after, { once: true });
    el.addEventListener('transitionend', after, { once: true });
    setTimeout(after, 320);
}

function render_nav_favorites() {
    const container = document.getElementById('favorites-listing');
    if (!container) return;

    container.innerHTML = '';

    const frag = document.createDocumentFragment();
    favoriteFiles.forEach(file => {
        const name = file[0];
        const url  = file[1];
        const icon = file[2];
        const type = file[3];

        const displayName = stripExtension(name || url);

        const host = document.createElement('div');
        host.className = 'clarama-post-embedded clarama-replaceable nav-fav-host';
        host.setAttribute(
            'url',
            `/template/render/web/nav_favourites` +
            `?name=${encodeURIComponent(displayName)}` +
            `&url=${encodeURIComponent(url)}` +
            `&icon=${encodeURIComponent(icon)}` +
            `&type=${encodeURIComponent(type)}`
        );
        frag.appendChild(host);
    });

    container.appendChild(frag);
    enable_interactions($(container));

    if (!container.dataset.navFavDelegated) {
        container.addEventListener('click', (e) => {
            const star = e.target.closest('.nav-fav-toggle');
            if (!star) return;

            e.preventDefault();
            e.stopPropagation();

            const name = star.dataset.name;
            const url  = star.dataset.url;
            const icon = star.dataset.icon;
            const type = star.dataset.type;

            // Toggle + remove the row immediately 
            toggle_favorite(name, url, icon, $CLARAMA_USER, type);
            const row = star.closest('.list-group-item');
            if (row) row.remove();

            // Toggle the page-level star if present
            const pageStar = document.getElementById('page-fav');
            if (pageStar) {
                const onThisPage = (favoriteFiles || []).some(r => r[1] === window.location.pathname);
                pageStar.classList.toggle('bi-star-fill', onThisPage);
                pageStar.classList.toggle('bi-star', !onThisPage);
            }

            // If a grid card exists, animate-remove it too
            const cardSel = `a.role-wrapper.is-fav [data-url="${url}"]`;
            const gridCard = document.querySelector(cardSel)?.closest('a.role-wrapper.is-fav');
            if (gridCard) {
                animateRemove(gridCard, () => {
                    gridCard.remove();
                    const grid = document.getElementById('roles-grid');
                    if (grid && grid.querySelectorAll('a.role-wrapper.is-fav').length === 0) {
                        ensureSeparator(grid, false);
                        recalcStaggerDelays(grid);
                    }
                });
            }
        });
        container.dataset.navFavDelegated = '1';
    }
}

/* --------------------- Add/remove from page star --------------------- */

function toggle_nav_favorite(breadcrumb) {
    const path = window.location.pathname;
    const parts = path.split('/');
    const fileName = parts.pop();

    let icon = '';
    let dir = 'file';

    if (!fileName.includes('.')) {
        icon = 'bi-folder-fill';
        dir = 'folder';
    } else {
        let matchedIcon = Object.entries(filetypeCSS).find(([ext]) => fileName.endsWith(ext));
        if (!matchedIcon) {
            const simpleExt = `.${fileName.split('.').pop()}`;
            matchedIcon = filetypeCSS[simpleExt] ? [simpleExt, filetypeCSS[simpleExt]] : null;
        }
        icon = matchedIcon ? matchedIcon[1] : 'bi-file-earmark';
    }

    toggle_favorite(breadcrumb, path, icon, $CLARAMA_USER, dir);
}
