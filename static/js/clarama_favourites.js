document.addEventListener('DOMContentLoaded', function () {
    load_favorites($CLARAMA_USER);

    const checkFilesLoaded = setInterval(function () {
        if (favoriteFiles.length > 0) { // wait til favoriteFiles is populated
            clearInterval(checkFilesLoaded);
            if (document.getElementById("fav-dropdown") !== null) {
                document.getElementById("fav-dropdown").style.display = "block";
            }

            if (document.getElementById("my-favorites-container") !== null) {
                render_home_favorites();
            }
            render_nav_favorites(); 

            // toggle favs based on whether current pg is in favs
            var starIcon = document.getElementById("page-fav");
            if (starIcon !== null) {
                if (favoriteFiles.some(row => row[1] === window.location.pathname)) {
                    starIcon.classList.remove('bi-star');
                    starIcon.classList.add('bi-star-fill');
                } else {
                    starIcon.classList.remove('bi-star-fill');
                    starIcon.classList.add('bi-star');
                }
            }
        }
    }, 100); // check every 100ms until favs r loaded
});

// this is displayed in clarama home pg
function render_home_favorites() {
    document.getElementById("my-favorites-container").style.display = "block";
    const container = document.getElementById('my-favorites-listing');
    if (!container) return;
    
    // console.log("render_home_favorites favoriteFiles", favoriteFiles);
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

// this is the dropdown that'll appear when favorites dropdown in navbar is selected
function render_nav_favorites() {
    const container = document.getElementById('favorites-listing');
    if (!container) return;

    // console.log("render_nav_favorites favoriteFiles", favoriteFiles);
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