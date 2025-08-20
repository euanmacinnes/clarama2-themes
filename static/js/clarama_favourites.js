document.addEventListener('DOMContentLoaded', function () {
    load_favorites($CLARAMA_USER);

    const checkFilesLoaded = setInterval(function () {
        if (favoriteFiles.length > 0) {
            clearInterval(checkFilesLoaded);

            const dd = document.getElementById("fav-dropdown");
            if (dd) dd.style.display = "block";

            if (document.getElementById("roles-grid") !== null) {
                render_home_favorites();
            }
            render_nav_favorites();

            // toggle favs based on whether current pg is in favs
            var starIcon = document.getElementById("page-fav");
            if (starIcon) {
                if (favoriteFiles.some(row => row[1] === window.location.pathname)) {
                    starIcon.classList.remove('bi-star');
                    starIcon.classList.add('bi-star-fill');
                } else {
                    starIcon.classList.remove('bi-star-fill');
                    starIcon.classList.add('bi-star');
                }
            }
        }
    }, 100);
});

function render_home_favorites() {
    const grid = document.getElementById('roles-grid');
    if (!grid) return;

    // Newest first at the top
    const favs = favoriteFiles.slice().reverse();
    if (favs.length === 0) return;

    const frag = document.createDocumentFragment();
    favs.forEach(file => {
        const name = file[0];
        const url  = file[1];
        const icon = file[2];
        const type = file[3];

        const host = document.createElement('div');
        host.className = 'clarama-post-embedded clarama-replaceable fav-card-host';
        host.setAttribute(
            'url',
            `/template/render/web/favourites_card` +
            `?name=${encodeURIComponent(name)}` +
            `&url=${encodeURIComponent(url)}` +
            `&icon=${encodeURIComponent(icon)}` +
            `&type=${encodeURIComponent(type)}`
        );
        frag.appendChild(host);
    });

    // Insert favourites then a full-width separator so role cards start on a new line
    const separator = document.createElement('div');
    separator.className = 'w-100 fav-role-separator';
    separator.setAttribute('aria-hidden', 'true');

    grid.prepend(separator);
    grid.prepend(frag);

    enable_interactions($(grid)); 

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

            const wrapper = star.closest('a.role-wrapper');
            if (wrapper) wrapper.remove();

            render_nav_favorites(true);
        });
        grid.dataset.favDelegated = '1';
    }
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
