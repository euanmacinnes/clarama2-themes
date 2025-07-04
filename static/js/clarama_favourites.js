document.addEventListener('DOMContentLoaded', function () {
    load_favorites($CLARAMA_USER);

    const checkFilesLoaded = setInterval(function () {
        if (favoriteFiles.length > 0) { // Wait until favoriteFiles is populated
            clearInterval(checkFilesLoaded);
            if (document.getElementById("fav-dropdown") !== null) {
                document.getElementById("fav-dropdown").style.display = "block";
            }

            if (document.getElementById("my-favorites-container") !== null) {
                render_my_favorites(); // Render the content
            }
            render_favorites(); // Render the content

            var starIcon = document.getElementById("page-fav");
            if (starIcon !== null) {
                if (favoriteFiles.some(row => row[1] === window.location.pathname)) {
                    starIcon.classList.remove('bi-star');
                    starIcon.classList.add('bi-star-fill'); // Mark as favorite
                } else {
                    starIcon.classList.remove('bi-star-fill'); // Unmark as favorite
                    starIcon.classList.add('bi-star');
                }
            }
        }
    }, 100); // Check every 100ms

    const breadcrumbList = document.querySelector(".root-nav");
    const breadcrumbItems = Array.from(breadcrumbList.querySelectorAll(".nav-item"));
    console.log(breadcrumbItems);
    console.log(breadcrumbItems.length);
    const maxItems = 4;

    if (breadcrumbItems.length > maxItems) {
        const first = breadcrumbItems[0];
        const keepCount = maxItems - 2;
        const lastItems = breadcrumbItems.slice(-keepCount);
        const middleItems = breadcrumbItems.slice(1, -keepCount);
        const ellipsisLi = document.createElement("li");
        ellipsisLi.className = "nav-item breadcrumb-ellipsis d-flex align-items-center";
        ellipsisLi.innerHTML = `
            <i class="nav-link bi bi-chevron-right p-0"></i>
            <span class="nav-link px-2">...</span>
            <ul class="hidden-items list-unstyled m-0 py-0 px-2">
                ${middleItems.map((item, index) => {
                    const clone = item.cloneNode(true);
                    if (index === 0) {
                        const icon = clone.querySelector('i');
                        if (icon) icon.remove();
                    }
                    return `<li class="d-flex flex-row align-items-center">${clone.innerHTML}</li>`;
                }).join('')}
            </ul>
        `;
    
        breadcrumbList.innerHTML = "";
        breadcrumbList.appendChild(first);
        breadcrumbList.appendChild(ellipsisLi);
        lastItems.forEach(item => breadcrumbList.appendChild(item));    
    }
});

// this is displayed in clarama home pg
function render_my_favorites() {
    document.getElementById("my-favorites-container").style.display = "block";
    const container = document.getElementById('my-favorites-listing');
    console.log(favoriteFiles)

    favoriteFiles.forEach((file, index) => {
        const decodedUrl = decodeURIComponent(file[1]); // so that %20 shows as a space

        container.innerHTML += `
          <div class="list-group-item list-group-item-action d-flex flex-row align-items-center justify-content-between border-0 p-3">
            <a href="${file[1]}" class="d-flex flex-row align-items-center p-0 text-center text-decoration-none">
              <div class="rounded-4 bg-secondary-subtle p-3">
                <i class="bi ${file[2]} text-dark" style="font-size: 1.8rem; margin: 0 auto;"></i>
              </div>
              <div class="ps-3 text-start" style="max-width: 240px;">
                <p class="card-title text-dark fw-medium text-truncate">${file[0]}</p>
                <p class="card-subtitle text-body-secondary text-break fst-italic">${decodedUrl}</p6>
              </div>
            </a>            
            <i class="bi bi-star-fill text-warning text-center" style="font-size: 1.5rem; cursor: pointer; " onclick="toggle_favorite('${file[0]}', '${file[1]}', '${file[2]}', $CLARAMA_USER, '${file[3]}')" ></i>
          </div>
        `;
    });
}

// this is the dropdown that'll appear when favorites dropdown is selected
function render_favorites() {
    const container = document.getElementById('favorites-listing');
    console.log(favoriteFiles)

    favoriteFiles.forEach((file, index) => {
        const decodedUrl = decodeURIComponent(file[1]); // so that %20 shows as a space

        container.innerHTML += `
          <div class="list-group-item list-group-item-action d-flex flex-row align-items-center justify-content-between border-0 p-3">
            <a href="${file[1]}" class="d-flex flex-column align-items-start p-0 text-decoration-none">
              <div class="d-flex flex-row align-items-center">
                <i class="bi ${file[2]} text-dark" style="font-size: 1.2rem; margin: 0 auto;"></i>
                <p class="card-title text-dark fw-medium text-truncate ms-2">${file[0]}</p>
              </div>
              <p class="card-subtitle text-body-secondary text-break fst-italic" style="font-size: 10px;">${decodedUrl}</p>
            </a>            
            <i class="bi bi-star-fill text-warning ps-3" style="font-size: 1.2rem; cursor: pointer;" onclick="toggle_favorite('${file[0]}', '${file[1]}', '${file[2]}', $CLARAMA_USER, '${file[3]}')" ></i>
          </div>
        `;
    });
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