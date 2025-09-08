var favoriteFilesHeader = "";
var favoriteFiles = [];
var favoriteFileExists = false;

function load_favorites(username) {
    const favoritesUrl = `/render/raw/Users/${username}/favorites.fav`;
    fetch($CLARAMA_ROOT + favoritesUrl)
        .then(response => response.text())
        .then(html => {
            try {
                const paths = $(html).filter('.source-editor.form-control').html();

                if (!paths) {
                    console.warn("No favorites.md found or content is empty.");
                    favoriteFilesHeader = "filename,path,icon,dir";
                    favoriteFiles = [];
                    favoriteFileExists = false;
                    return;
                }

                favoriteFileExists = true;
                const lines = paths.trim().split('\n');
                favoriteFilesHeader = lines[0];

                // .slice(1) to remove header
                // .map(...) to remove any quotes or extra space
                const rows = lines.slice(1).map(line => line.split(',').map(value => value.trim().replace(/["""]/g, '')));
                favoriteFiles = rows.map(row => row);
                favoriteFiles.sort((a, b) => {
                    // sort all folders first then all files
                    if (a[3] !== b[3]) {
                        return a[3] === "folder" ? -1 : 1;
                    }

                    // if both same type, sort alphabetically
                    return a[0].localeCompare(b[0], undefined, {numeric: true, sensitivity: 'base'});
                });

                console.log(favoriteFiles);
            } catch (err) {
                console.log(`Error parsing CSV: ${err.message}`);
            }
        })
        .catch((error) => {
            console.warn('Error loading favorites:' + error);
        });
}

// toggle a file as a favorite
function toggle_favorite(filename, path, icon, username, dir) {
    console.log("filename: " + filename);
    console.log("path: " + path);
    console.log("icon: " + icon);
    console.log("username: " + username);
    console.log("dir: " + dir);
    const isFavorite = favoriteFiles.some(row => row[1] === path);

    if (isFavorite) {
        // Remove from favorites
        favoriteFiles = favoriteFiles.filter(row => row[1] !== path);
    } else {
        // Add to favorites
        favoriteFiles.push([filename, path, icon, dir]);
    }

    console.log(favoriteFiles)
    save_favorites(username);
}

// save the updated list of favorites to favorites.md
function save_favorites(username) {
    const uniqueFavorites = [...new Set(favoriteFiles)]; // Remove duplicates
    const content = uniqueFavorites.join('\n'); // Convert array to string with newlines

    if (!favoriteFileExists) {
        var new_content = "favorites";
        var new_content_type = "markdown";
        var file = `/render/new/Users/${username}/?new_content=` + encodeURIComponent(new_content) + "&new_content_type=" + encodeURIComponent(new_content_type);
        execute_json_url(file, false);
    }

    const postUrl = `/content/raw/Users/${username}/favorites.fav`;
    const formData = new FormData();

    // Append content as a Blob to ensure file creation or update
    formData.append("file", new Blob([content], {type: "text/markdown"}), "favorites.fav");

    var data = {
        task_action: "save",
        edited_content: [favoriteFilesHeader, ...favoriteFiles.map(path => path.map(value => `"${value}"`).join(','))].join('\n')
    }

    $.ajax({
        type: 'POST',
        url: postUrl,
        datatype: "html",
        contentType: 'application/json',
        data: JSON.stringify(data),
        success: function (data) {
            console.log('Submission was successful.');
            console.log(data);
        },
        error: function (data) {
            console.log('An error occurred.');
            console.log(data);
        }
    })

    fetch(postUrl, {
        method: "POST",
        body: formData
    })
        .then(response => {
            console.log(response)
            if (response.ok) {
                console.log(favoriteFiles)
                console.log('Favorites updated successfully!');
                updateFavoritesUI();
            } else {
                console.error('Failed to update favorites.md');
            }
        })
        .catch(error => console.error('Error saving favorites:', error));
}

function updateFavoritesUI() {
    const myFavoritesContainer = document.getElementById("my-favorites-listing");
    if (myFavoritesContainer) {
        myFavoritesContainer.innerHTML = "";
        render_home_favorites();
    }

    const favoritesContainer = document.getElementById("favorites-listing");
    if (favoritesContainer) {
        favoritesContainer.innerHTML = "";
        render_nav_favorites();
    }

    var starIcon = document.getElementById("page-fav");
    if (starIcon !== null) {
        if (favoriteFiles.some(row => row[1] === window.location.pathname)) {
            starIcon.classList.remove('bi-star');
            starIcon.classList.add('bi-star-fill'); // Mark as favorite
        } else {
            starIcon.classList.remove('bi-star-fill');
            starIcon.classList.add('bi-star');
        }
    }
}