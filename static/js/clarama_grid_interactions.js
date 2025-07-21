/*
 * Copyright (c) 2025. Euan Duncan Macinnes, euan.d.macinnes@gmail.com, S7479622B - All Rights Reserved
 */

let lastMouseEvent = null;
var currentModalAddContentPath = "";

document.addEventListener('contextmenu', (event) => {
    if (contextMenu.dataset.contextType === 'table') return;

    console.log("in grid interaction")
    const target = event.target.closest('.grid-stack-item');
    const grid = event.target.closest('.clarama-grid');
    if (!target) return;

    event.preventDefault();

    const elementId = target.getAttribute('gs-id');
    const gridId = grid.getAttribute('grid_id');


    console.log("elementId", elementId);
    console.log("gridId", gridId);


    const elementInteractions = eval(gridId + "elements[elementId]['links']");
    //const elementInteractions = elements[elementId]['links'];

    const menuInteractions = [];

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

    console.log("table_selection", table_selection)

    contextMenu.dataset.elementId = elementId;
    contextMenu.dataset.tableSelection = table_selection ? JSON.stringify(table_selection) : '';

    contextMenu.innerHTML = menuInteractions.map((interaction, i) => {
        if (interaction.element == "tab") {
            return `<a href="${interaction.url}" target="_blank" class="text-decoration-none text-black">
                    <button class="dropdown-item datasource" data-url="${interaction.url}" data-elem="${interaction.element}" data-params="${interaction.params}">${interaction.menu_item_name}</button>
                </a>`
        } else {
            return `<button class="dropdown-item" data-url="${interaction.url}" data-elem="${interaction.element}" data-params="${interaction.params}">${interaction.menu_item_name}</button>`;
        }
    }).join('');

    contextMenu.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', (e) => {
            get_field_values({}, true, function (field_registry) {
                const rawTableSelection = contextMenu.dataset.tableSelection || '';
                const table_selection = rawTableSelection ? JSON.parse(rawTableSelection) : {};
                const field_values = merge_dicts(field_registry, table_selection);
                console.log("field_values", field_values);

                const url = button.dataset.url;
                console.log('Clicked menu item URL:', url);
                const elem = button.dataset.elem;
                console.log('Clicked menu item elem:', elem);
                const params = button.dataset.params;
                console.log('Clicked menu item params:', params);
                if (elem == "modal") showModalWithContent(url, field_values);
                else if (elem.includes("element_")) {
                    document.getElementById(elem).innerHTML = "";
                    document.getElementById(elem).append(showInteractionContent('run', url + "?" + params));
                    enable_interactions($(`#${elem}`));
                } else if (elem == "hidden") {
                    // this prob isnt the most ideal way but i think itll do for now since autorun isnt work
                    playHiddenContent(url, field_values);
                    const interval = setInterval(() => {
                        const runBtn = $("#run");
                        const socketId = $("#" + runBtn.attr("socket")).attr("task_kernel_id");

                        // ensure that runBtn exists n socket has an Id before simulating the click on the task run btn
                        if (runBtn && socketId) {
                            runBtn.attr("hiddenCM", "true")
                            runBtn.click();
                            clearInterval(interval); // this will stop looping n finding the runBtn n socketId

                            // show alert or modal
                        }
                    }, 300);
                }
                contextMenu.classList.add('d-none');
            });
        });
    });

    contextMenu.style.top = `${event.pageY - 100}px`;
    contextMenu.style.left = `${event.pageX}px`;
    contextMenu.classList.remove('d-none');

    contextMenu.dataset.elementId = elementId;
});

document.addEventListener('click', (event) => {
    if (contextMenu.classList.contains('d-none')) return;
    if (contextMenu.contains(event.target)) return;
    contextMenu.classList.add('d-none');
});

document.addEventListener('mousemove', function (e) {
    lastMouseEvent = e;
});

function showModalWithContent(url, parameters = "") {
    $('#interactionModal').modal('show');
    const iModal = document.getElementById("interactionModalBody");
    iModal.innerHTML = '';
    iModal.append(showInteractionContent('modal', url, parameters));
    enable_interactions($("#interactionModalBody"), true, true);
}

function playHiddenContent(url, parameters = "") {
    const iModal = document.getElementById("interactionModalBody");
    iModal.innerHTML = '';
    iModal.append(showInteractionContent('modal', url, parameters));
    enable_interactions($("#interactionModalBody"), true, true);
}

function triggerTabInteraction(url, parameters = "") {
    // console.log("parameters", parameters)
    let fullUrl = "/content/default/" + resolveRelativeFilePath("{{ file_url | path }}", url);
    window.open(fullUrl, "_blank");
}

function showPopupNearMouse(url, parameters = "") {
    const ipopup = document.getElementById('interactionPopup');
    // console.log("ipopup", ipopup)

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
    ipopup.append(showInteractionContent('popup', url, parameters));
    enable_interactions($("#interactionPopup"), true);

    document.addEventListener('click', function hideOnClick(e) {
        if (!ipopup.contains(e.target)) {
            ipopup.style.display = 'none';
            document.removeEventListener('click', hideOnClick);
        }
    });
}

function showInteractionContent(interaction, relativeP, parameters) {
    let currentP;
    let ICurl;

    if (relativeP === "/System/Slates/Tasks/Issue_Details.task.yaml") {
        ICurl = '/render/popup' + relativeP;
    } else {
        if ('{{ file_url | path }}'[0] === '/') {
            currentP = ($CLARAMA_ROOT + '/render/popup' + '{{ file_url | path }}');
        } else {
            currentP = ($CLARAMA_ROOT + '/render/popup' + '/{{ file_url | path }}');
        }
        console.log("fileurl/path", '{{ file_url | path }}');

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
    }
    // console.log("$CLARAMA_ROOT", $CLARAMA_ROOT)
    // console.log("ICurl", ICurl)

    const newIC = document.createElement("div");
    newIC.className = "clarama-post-embedded clarama-replaceable";
    newIC.setAttribute("url", `${ICurl}`);
    newIC.setAttribute("json", JSON.stringify(parameters));
    // newIC.setAttribute("autorun", "True");
    return newIC;
}
