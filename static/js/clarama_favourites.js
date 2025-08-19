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

    // newest first at the top
    const favs = favoriteFiles.slice().reverse();

    const html = favs.map(file => {
        const decodedUrl = decodeURIComponent(file[1]);
        const icon = file[2] || 'bi-file-earmark';
        // const name = file[0];
        const name = file[0];
        const type = file[3] || 'file';
        console.log("favs: ", favoriteFiles);
        return `
            <a href="${file[1]}" class="d-flex role-wrapper m-3 text-decoration-none"
                style="width: 21rem;" title="${decodedUrl}">
                <div class="card align-items-center shadow-lg p-4 flex-grow-1 fav-card">
                    <i class="bi ${icon} fs-2 p-0"></i>
                    <div class="card-body text-center w-100 d-flex flex-column py-2">
                        <h5 class="card-title d-flex align-items-center justify-content-center gap-2">
                            <i class="bi bi-star-fill text-warning fav-toggle"
                                role="button" aria-label="Unfavourite"
                                data-name="${name}"
                                data-url="${file[1]}"
                                data-icon="${icon}"
                                data-type="${type}"></i>
                            <span>${name}</span>
                        </h5>
                        <p class="card-text">${type}</p>
                    </div>
                </div>
            </a>
        `;
    }).join('');

    grid.insertAdjacentHTML('afterbegin', html);

    grid.addEventListener('click', function (e) {
        const star = e.target.closest('.fav-toggle');
        if (!star) return;

        // prevent following the <a> link when clicking the star
        e.preventDefault();
        e.stopPropagation();

        const name = star.dataset.name;
        const url = star.dataset.url;
        const icon = star.dataset.icon;
        const type = star.dataset.type;

        // Toggle favourite
        toggle_favorite(name, url, icon, $CLARAMA_USER, type);

        const wrapper = star.closest('a.role-wrapper');
        if (wrapper) wrapper.remove();

        render_nav_favorites(true);
    }, { once: true });
}

function render_nav_favorites(clearFirst = false) {
    const container = document.getElementById('favorites-listing');
    if (!container) return;

    if (clearFirst) container.innerHTML = '';

    favoriteFiles.forEach(file => {
        const decodedUrl = decodeURIComponent(file[1]);
        container.innerHTML += `
            <div class="list-group-item list-group-item-action d-flex flex-row align-items-center justify-content-between border-0 p-3">
                <a href="${file[1]}" class="d-flex flex-column align-items-start p-0 text-decoration-none">
                    <div class="d-flex flex-row align-items-center">
                        <i class="bi ${file[2]} text-dark" style="font-size: 1.2rem; margin: 0 auto;"></i>
                        <p class="card-title text-dark fw-medium text-truncate ms-2">${file[0]}</p>
                    </div>
                    <p class="card-subtitle text-body-secondary text-break fst-italic" style="font-size: 10px;">${decodedUrl}</p>
                </a>
                <i class="bi bi-star-fill text-warning ps-3"
                    style="font-size: 1.2rem; cursor: pointer;"
                    onclick="toggle_favorite('${file[0]}', '${file[1]}', '${file[2]}', $CLARAMA_USER, '${file[3]}')"></i>
            </div>
        `;
    });
}


function toggle_nav_favorite(breadcrumb) {
    const path = window.location.pathname;
    const parts = path.split('/');
    const fileName = parts.pop(); // get last segment of path

    var icon = "";
    var dir = "file";

    // mayb not a v gd way to detect if its a folder/file... but this was done at the beginning of my internship haha
    // filetypeCSS is in the root.html where i defined the file types in an object -> but instead of this need to change to take from claram.ui.yaml
    if (!fileName.includes('.')) {
        icon = "bi-folder-fill";
        dir = "folder";
    } else {
        // this matches appropriate icons based on file ext
        let matchedIcon = Object.entries(filetypeCSS)
            .find(([ext, _]) => fileName.endsWith(ext)); // ext is the key, _ is the value but bec idn the value so i j named it as _

        if (!matchedIcon) {
            const simpleExt = `.${fileName.split('.').pop()}`;
            matchedIcon = filetypeCSS[simpleExt] ? [simpleExt, filetypeCSS[simpleExt]] : null;
        }

        icon = matchedIcon ? matchedIcon[1] : "bi-file-earmark";
    }

    toggle_favorite(breadcrumb, path, icon, $CLARAMA_USER, dir);
}