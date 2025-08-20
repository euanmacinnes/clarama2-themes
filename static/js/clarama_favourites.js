document.addEventListener('DOMContentLoaded', function () {
    load_favorites($CLARAMA_USER);

    const dd = document.getElementById("fav-dropdown");
    if (dd) dd.style.display = "block";

    const grid = document.getElementById('roles-grid');

    const LAST_COUNT_KEY = `clarama:lastFavCount:${$CLARAMA_USER}`;
    const lastCount = parseInt(localStorage.getItem(LAST_COUNT_KEY) || '1', 10); // assume some favs if unknown
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

    setInterval(() => {
        if (typeof favoriteFileExists === 'undefined') return;
        handleFavsUpdate();
    }, 250);

    if (grid) {
        const mo = new MutationObserver(() => recalcStaggerDelays(grid));
        mo.observe(grid, { childList: true, subtree: true });
    }

    // --------------- Helpers ---------------

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
            if ((favoriteFiles || []).some(row => row[1] === window.location.pathname)) {
                pageStar.classList.remove('bi-star');
                pageStar.classList.add('bi-star-fill');
            } else {
                pageStar.classList.remove('bi-star-fill');
                pageStar.classList.add('bi-star');
            }
        }

        revealRolesIfNeeded();
    }

    function favHash() {
        try {
            if (!Array.isArray(favoriteFiles)) return '';
            const urls = favoriteFiles.map(r => r[1]).filter(Boolean).sort();
            return urls.length ? JSON.stringify(urls) : '__NONE__';
        } catch (e) {
            return '';
        }
    }
});

function render_home_favorites() {
    const grid = document.getElementById('roles-grid');
    if (!grid || !Array.isArray(favoriteFiles)) return;

    grid.querySelectorAll('a.role-wrapper.is-fav').forEach(n => n.remove());
    const oldSep = grid.querySelector('.fav-role-separator');
    if (oldSep) oldSep.remove();

    const favs = favoriteFiles.slice();
    if (favs.length === 0) {
        ensureSeparator(grid, false);
        return;
    }

    const favTemplate = ({ name, url, icon, type, idx }) => `
        <a href="${url}"
        class="d-flex role-wrapper is-fav m-3 text-decoration-none anim-in"
        style="width: 21rem; --stagger-index:${idx};"
        title="${url}">
            <div class="card align-items-center shadow-lg p-4 flex-grow-1 fav-card">
                <i class="bi ${icon} fs-2 p-0"></i>
                <div class="card-body text-center w-100 d-flex flex-column py-2">
                    <h5 class="card-title d-flex align-items-center justify-content-center gap-2">
                        <i class="bi bi-star-fill text-warning fav-toggle"
                        role="button" aria-label="Unfavourite"
                        data-name="${name}"
                        data-url="${url}"
                        data-icon="${icon}"
                        data-type="${type}"></i>
                        <span>${name}</span>
                    </h5>
                    <p class="card-text">${type}</p>
                </div>
            </div>
        </a>`.trim();

    const html = favs.map((row, idx) => favTemplate({
        name: row[0], 
        url: row[1], 
        icon: row[2], 
        type: row[3], 
        idx
    })).join('');

    grid.insertAdjacentHTML('afterbegin', html);
    ensureSeparator(grid, true);

    if (!grid.dataset.favDelegated) {
        grid.addEventListener('click', function (e) {
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
                });
            }

            render_nav_favorites(true);
        });
        grid.dataset.favDelegated = '1';
    }

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
    setTimeout(after, 320); // safety
}

function render_nav_favorites(clearFirst = false) {
    const container = document.getElementById('favorites-listing');
    if (!container) return;

    // Clear existing content
    container.innerHTML = '';

    // Build hosts for each favourite
    const frag = document.createDocumentFragment();
    favoriteFiles.forEach(file => {
        const name = file[0];
        const url  = file[1];
        const icon = file[2];
        const type = file[3];

        const host = document.createElement('div');
        host.className = 'clarama-post-embedded clarama-replaceable nav-fav-host';
        host.setAttribute(
            'url',
            `/template/render/web/nav_favourites` +
            `?name=${encodeURIComponent(name)}` +
            `&url=${encodeURIComponent(url)}` +
            `&icon=${encodeURIComponent(icon)}` +
            `&type=${encodeURIComponent(type)}`
        );
        frag.appendChild(host);
    });

    container.appendChild(frag);

    enable_interactions($(container));

    if (!container.dataset.navFavDelegated) {
        container.addEventListener('click', function (e) {
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

            // Also toggle the page-level star if present
            const pageStar = document.getElementById('page-fav');
            if (pageStar) {
                if (favoriteFiles.some(r => r[1] === window.location.pathname)) {
                    pageStar.classList.remove('bi-star');
                    pageStar.classList.add('bi-star-fill');
                } else {
                    pageStar.classList.remove('bi-star-fill');
                    pageStar.classList.add('bi-star');
                }
            }

            const gridCard = document.querySelector(`a.role-wrapper.is-fav [data-url="${CSS.escape(url)}"]`)?.closest('a.role-wrapper.is-fav');
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

function toggle_nav_favorite(breadcrumb) {
    const path = window.location.pathname;
    const parts = path.split('/');
    const fileName = parts.pop();

    var icon = "";
    var dir = "file";

    if (!fileName.includes('.')) {
        icon = "bi-folder-fill";
        dir = "folder";
    } else {
        let matchedIcon = Object.entries(filetypeCSS)
            .find(([ext, _]) => fileName.endsWith(ext));

        if (!matchedIcon) {
            const simpleExt = `.${fileName.split('.').pop()}`;
            matchedIcon = filetypeCSS[simpleExt] ? [simpleExt, filetypeCSS[simpleExt]] : null;
        }

        icon = matchedIcon ? matchedIcon[1] : "bi-file-earmark";
    }

    toggle_favorite(breadcrumb, path, icon, $CLARAMA_USER, dir);
}
