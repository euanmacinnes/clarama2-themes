/*
 * Copyright (c) 2025. Euan Duncan Macinnes, euan.d.macinnes@gmail.com, S7479622B - All Rights Reserved
 */

let lastMouseEvent = null;
var currentModalAddContentPath = "";

// this exists because add_selected_content() has a promise n the onlcick will call add_selected_content() but it wont be able to catch err onclick
function handle_add_selected_content(url, selecte_v = "") {
    add_selected_content(url, selecte_v)
        .then(() => {
            console.log("success");
        })
        .catch((err) => {
            console.error("error", err);
        });
}

$(document).on('contextmenu', function (event) {
    const cm = document.getElementById('contextMenu');
    if (!cm) return;

    if ($('#contextMenu').data('contextType') === 'table') return;

    const target = event.target.closest('.grid-stack-item');
    const grid = event.target.closest('.clarama-grid');
    if (!target) return;
    if (!grid) return;

    const elementId = $(target).attr('gs-id');
    const gridId = $(grid).attr('grid_id');
    console.log("elementId", elementId);
    console.log("gridId", gridId);

    const elementInteractions = eval(gridId + "elements[elementId]['links']");
    if (!elementInteractions) return;
    const menuInteractions = [];

    if (elementInteractions === undefined) return;

    if (elementInteractions.length === 0) return;
    for (let i = 0; i < elementInteractions.length; i++) {
        const interaction = elementInteractions[i];
        if (interaction.contextMenu) {
            menuInteractions.push(interaction);
        }
    }
    // console.log("menuInteractions", menuInteractions);
    // console.log("menuInteractions length", menuInteractions.length);
    if (menuInteractions.length === 0) return;

    // only hide original context menu if thrs context menu interactions
    event.preventDefault();

    // if it is a table, the context menu shld do it like onClickRow in bTable() 
    let table_selection = null;
    const row = event.target.closest('tr');
    if (row && row.closest('table')) {
        const $tr = $(row);
        const $table = $tr.closest('table');
        const table_id = $table.attr('id');

        if (table_id) {
            const rowIndex = $tr.data('index');
            const rowData = $('#' + table_id).bootstrapTable('getData')[rowIndex];
            let field = null;
            $tr.children('td').each(function (i, td) {
                const rect = td.getBoundingClientRect();
                if (event.clientX >= rect.left && event.clientX <= rect.right &&
                    event.clientY >= rect.top && event.clientY <= rect.bottom) {
                    field = $('#' + table_id).bootstrapTable('getVisibleColumns')[i]?.field || null;
                }
            });
            if (rowData) {
                table_selection = {row: rowData, field: field};
            }
        }
    }
    // console.log("table_selection", table_selection)

    const $contextMenu = $('#contextMenu');
    $contextMenu.data('elementId', elementId)
    $contextMenu.data('tableSelection', table_selection ? JSON.stringify(table_selection) : '')

    $contextMenu.html(menuInteractions.map((interaction, i) => {
        return `<button class="dropdown-item" data-url="${interaction.url}" data-elem="${interaction.element}" data-params="${interaction.params}">${interaction.menu_item_name}</button>`;
    }).join(''));

    $contextMenu.find('button').on('click', function (e) {
        const $button = $(this);

        get_field_values({}, true, function (field_registry) {
            const rawTableSelection = $contextMenu.data('tableSelection') || '';
            const table_selection = rawTableSelection ? JSON.parse(rawTableSelection) : {};
            const field_values = merge_dicts(field_registry, table_selection);
            console.log("field_values", field_values);

            const url = $button.data('url');
            // console.log('Clicked menu item URL:', url);
            const elem = $button.data('elem');
            // console.log('Clicked menu item elem:', elem);
            const params = $button.data('params');
            // console.log('Clicked menu item params:', params);

            const fileU = $contextMenu.attr('file_path');
            // console.log('fileU', fileU)

            if (elem == "modal") showModalWithContent(fileU, url, field_values, true);
            else if (elem.includes("element_")) {
                $("#" + elem).html('').append(showInteractionContent(fileU, 'run', url + "?" + params, field_values, true));
                enable_interactions($("#" + elem));
            } else if (elem == "hidden") {
                // this prob isnt the most ideal way but i think itll do for now since autorun isnt work
                playHiddenContent(fileU, url, field_values, true);
                const interval = setInterval(() => {
                    const runBtn = $("#run");
                    const socketId = $("#" + runBtn.attr("socket")).attr("task_kernel_id");

                    // ensure that runBtn exists n socket has an Id before simulating the click on the task run btn
                    if (runBtn && socketId) {
                        runBtn.attr("hiddenCM", "true")
                        runBtn.click();
                        clearInterval(interval); // this will stop looping n finding the runBtn n socketId

                        flash("hidden content ran");
                    }
                }, 300);
            } else if (elem == "tab") {
                triggerTabInteraction(fileU, url, field_values, true);
            }
            $contextMenu.addClass('d-none');
        });
    });

    $contextMenu.css({
        top: `${event.pageY - 100}px`,
        left: `${event.pageX}px`
    });
    $contextMenu.removeClass('d-none');
    $contextMenu.data('elementId', elementId);
});

document.addEventListener('click', (event) => {
    const cm = document.getElementById('contextMenu');
    if (!cm) return;

    if (cm.classList.contains('d-none')) return;
    if (cm.contains(event.target)) return;
    cm.classList.add('d-none');
});

// this is to know where to display the popup interaction
document.addEventListener('mousemove', function (e) {
    lastMouseEvent = e;
});

function showModalWithContent(field, url, field_values = "", contextM = false) {
    $('#interactionModal').modal('show');
    const iModal = document.getElementById("interactionModalBody");
    iModal.innerHTML = '';
    iModal.append(showInteractionContent(field, 'modal', url, field_values, contextM));
    enable_interactions($("#interactionModalBody"), true, true);
}

function playHiddenContent(field, url, field_values = "", contextM = false) {
    const iModal = document.getElementById("interactionModalBody");
    iModal.innerHTML = '';
    iModal.append(showInteractionContent(field, 'modal', url, field_values, contextM));
    enable_interactions($("#interactionModalBody"), true, true);
}

function filePath(field) {
    // console.log("grid interactions FILE PATH");
    // console.log(field);
    // console.log(field.closest(".clarama-grid"));
    return field.closest(".clarama-grid").attr("file_path");
}

function triggerTabInteraction(field, url, field_values = "", contextM = false) {
    console.log("triggerTabInteraction field_values", field_values);

    let final_field;
    if (!contextM) final_field = filePath(field);
    else final_field = field;
 
    let fullUrl = "/content/default/" + resolveRelativeFilePath(final_field, url);
    if (fullUrl.charAt(fullUrl.length - 1) == "?") fullUrl = fullUrl.slice(0, -1);
    console.log('triggerTabInteraction fullUrl', fullUrl);
    console.log('triggerTabInteraction data', JSON.stringify(field_values));
    
    fetch($CLARAMA_ROOT + fullUrl + "?b64params=" + btoa(JSON.stringify(field_values)),
        {
            // headers: {
            //     'Accept': 'application/json',
            //     'Content-Type': 'application/json'
            // },
            method: "get",
            // body: JSON.stringify(field_values)
        })
        .then(response => response.text())
        .then(htmlContent => {
            console.log("htmlContent", htmlContent)
            const newWindow = window.open("", "_blank");
            if (newWindow) {
                newWindow.document.write(htmlContent);
                newWindow.document.close();
            } else {
                alert("Popup blocked! Please allow popups for this site.");
            }
        })
        .catch((error) => {
            console.error('Error fetching HTML:', error);
        });
}

function showPopupNearMouse(field, url, field_values = "") {
    console.log("showPopupNearMouse field", field)
    console.log("showPopupNearMouse url", url)
    console.log("showPopupNearMouse field_values", field_values)
    const ipopup = document.getElementById('interactionPopup');
    console.log("showPopupNearMouse ipopup", ipopup)
    console.log("showPopupNearMouse lastMouseEvent", lastMouseEvent)

    if (lastMouseEvent) {
        const popupMaxWidthPercent = 43;
        const viewportWidth = window.innerWidth;
        const popupMaxWidth = viewportWidth * (popupMaxWidthPercent / 100);
        const mouseX = lastMouseEvent.pageX;
        const mouseY = lastMouseEvent.pageY;

        // check if popup overflowed past right
        if (mouseX + popupMaxWidth > viewportWidth) {
            ipopup.style.left = 'unset';
            ipopup.style.right = (viewportWidth - mouseX) + 'px';
        } else {
            ipopup.style.right = 'unset';
            ipopup.style.left = mouseX + 'px';
        }

        ipopup.style.top = (mouseY - 150) + 'px';
    }

    ipopup.style.display = 'block';
    ipopup.innerHTML = '';
    ipopup.append(showInteractionContent(field, 'popup', url, field_values));
    enable_interactions($("#interactionPopup"), true);

    // add eventlistener only when popup fullt rendered
    setTimeout(() => {
        // this will detect clicks outside the popup so that the popup will close
        const hideOnClick = (e) => {
            if (!ipopup.contains(e.target)) {
                ipopup.style.display = 'none';
                document.removeEventListener('mousedown', hideOnClick);
            }
        };
        document.addEventListener('mousedown', hideOnClick);
    }, 0);
}

function showInteractionContent(field, interaction, relativeP, field_values, contextM = false) {
    let currentP;
    let ICurl;
    let file_path;

    if (!contextM) file_path = filePath(field);
    else file_path = field;

    if (file_path[0] === '/') {
        currentP = ($CLARAMA_ROOT + '/render/popup' + file_path);
    } else {
        currentP = ($CLARAMA_ROOT + '/render/popup' + '/' + file_path);
    }
    // console.log("fileurl/path", '{{ file_url | path }}');

    let currentSegments = currentP.split('/');
    let relativeSegments = relativeP.split('/');
    for (let segment of relativeSegments) {
        if (segment === '..') {
            currentSegments.pop();
        } else if (segment !== '.' && segment !== '') {
            currentSegments.push(segment);
        }
    }

    ICurl = $CLARAMA_ROOT + currentSegments.join('/');

    // console.log("$CLARAMA_ROOT", $CLARAMA_ROOT)
    // console.log("ICurl", ICurl)

    const newIC = document.createElement("div");
    newIC.className = "clarama-post-embedded clarama-replaceable";
    newIC.setAttribute("url", `${ICurl}`);
    newIC.setAttribute("json", JSON.stringify(field_values));
    // newIC.setAttribute("autorun", "True");
    return newIC;
}
