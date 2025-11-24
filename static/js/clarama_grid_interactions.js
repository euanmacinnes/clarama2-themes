/*
 * Copyright (c) 2025. Euan Duncan Macinnes, euan.d.macinnes@gmail.com, S7479622B - All Rights Reserved
 */

let lastMouseEvent = null;
var currentModalAddContentPath = "";

// Ensure resolveRelativeFilePath is globally accessible
if (typeof window !== 'undefined' && typeof window.resolveRelativeFilePath !== 'function') {
    window.resolveRelativeFilePath = function (currentPath, relativePath) {
        try {
            if (!currentPath) return (relativePath || '').replace(/^\.\//, '');
            // If relativePath looks absolute (starts with http(s):// or begins with /content or /render etc.), just normalize slashes and strip leading "./"
            const absLike = /^(https?:)?\/\//i.test(relativePath) || /^\/(content|render|template)\//.test(relativePath || '');
            if (absLike) {
                return (relativePath || '').replace(/^\.\//, '').replace(/^\/+/, '');
            }
            const baseParts = String(currentPath).split('/').filter(Boolean);
            const rel = String(relativePath || '').replace(/^\.\//, '');
            const relativeParts = rel.split('/').filter(Boolean);
            for (const part of relativeParts) {
                if (part === '..') {
                    baseParts.pop();
                } else if (part !== '.') {
                    baseParts.push(part);
                }
            }
            return baseParts.join('/');
        } catch (e) {
            console.warn('resolveRelativeFilePath fallback error:', e);
            return String(relativePath || '').replace(/^\.\//, '');
        }
    };
}

// this exists because add_selected_content() has a promise n the onlcick will call add_selected_content() but it wont be able to catch err onclick
function handle_add_selected_content(url, selecte_v = "") {
    add_selected_content(url, selecte_v)
        .then(() => {
            // console.log("success");
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
    // console.log("elementId", elementId);
    // console.log("gridId", gridId);

    let elementInteractions = eval(gridId + "elements[elementId]['links']");
    if (!Array.isArray(elementInteractions)) { elementInteractions = []; }
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

    // if it is a chart, capture nearest point details
    let chart_selection = null;
    try {
        const canvas = event.target.closest('canvas');
        if (canvas && window.Chart && typeof Chart.getChart === 'function') {
            const chart = Chart.getChart(canvas);
            if (chart && typeof chart.getElementsAtEventForMode === 'function') {
                const elements = chart.getElementsAtEventForMode(event, 'nearest', {intersect: true}, true);
                if (elements && elements.length > 0) {
                    const el = elements[0];
                    const datasetIndex = el.datasetIndex;
                    const index = el.index;
                    const dataset = (chart.data && chart.data.datasets) ? (chart.data.datasets[datasetIndex] || {}) : {};
                    const labels = (chart.data && chart.data.labels) ? chart.data.labels : [];
                    const dataArr = dataset.data || [];
                    const dataPoint = dataArr[index];
                    const value = (dataPoint && typeof dataPoint === 'object' && ('y' in dataPoint)) ? dataPoint.y : dataPoint;
                    chart_selection = {
                        datasetIndex: datasetIndex,
                        index: index,
                        datasetId: dataset.id || '',
                        datasetLabel: dataset.label || '',
                        label: labels[index],
                        value: value,
                        raw: dataPoint
                    };
                }
            }
        }
    } catch (err) {
        console.warn('Chart selection detection failed:', err);
    }

    const $contextMenu = $('#contextMenu');
    $contextMenu.data('elementId', elementId)
    $contextMenu.data('tableSelection', table_selection ? JSON.stringify(table_selection) : '')
    $contextMenu.data('chartSelection', chart_selection ? JSON.stringify(chart_selection) : '')

    $contextMenu.html(menuInteractions.map((interaction, i) => {
        return `<button class="dropdown-item" data-url="${interaction.url}" data-elem="${interaction.element}" data-params="${interaction.params}">${interaction.menu_item_name}</button>`;
    }).join(''));

    $contextMenu.find('button').on('click', function (e) {
        const $button = $(this);
        var closestGrid = $button.closest(".clarama-grid");
        // console.log("contextMenu closestGrid", closestGrid);

        // console.log("checking where get_field_values is called: contextmenu")
        get_field_values({}, true, function (field_registry) {
            const rawTableSelection = $contextMenu.data('tableSelection') || '';
            const rawChartSelection = $contextMenu.data('chartSelection') || '';
            const table_selection = rawTableSelection ? JSON.parse(rawTableSelection) : {};
            const chart_selection = rawChartSelection ? JSON.parse(rawChartSelection) : {};
            const field_values = merge_dicts(merge_dicts(field_registry, table_selection), chart_selection);
            // console.log("field_values", field_values);

            const url = $button.data('url');
            // console.log('Clicked menu item URL:', url);
            const elem = $button.data('elem');
            // console.log('Clicked menu item elem:', elem);
            const params = $button.data('params');
            // console.log('Clicked menu item params:', params);

            const fileU = $contextMenu.attr('file_path');
            // console.log('fileU', fileU)

            // Build augmented query params to include context selections
            const extraParams = [];
            if (table_selection && table_selection.row) {
                try {
                    extraParams.push('row=' + encodeURIComponent(JSON.stringify(table_selection.row)));
                } catch (e) {
                }
            }
            if (table_selection && table_selection.field) {
                try {
                    extraParams.push('field=' + encodeURIComponent(table_selection.field));
                } catch (e) {
                }
            }
            if (chart_selection && Object.keys(chart_selection).length) {
                try {
                    extraParams.push('chart_selection=' + encodeURIComponent(JSON.stringify(chart_selection)));
                } catch (e) {
                }
            }
            const baseParams = (params || '').toString().trim();
            const query = [baseParams, extraParams.join('&')].filter(Boolean).join('&');
            const finalUrl = url + (query ? ('?' + query) : '');

            if (elem == "modal") showModalWithContent(fileU, finalUrl, field_values, true);
            else if (elem.includes("element_")) {
                $("#" + elem).html('').append(showInteractionContent(fileU, 'run', finalUrl, field_values, true));
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
        }, closestGrid);
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

// initially, each record has an interaction modal, 
// but itll somehow make some of the interaction modal not load
// so i put the interaction Modal and popup html in root.html so thrs only 1 of it instead of multiple
// and that solved the loading prob 
// function showModalWithContent(closestGrid, field, url, field_values = "", contextM = false) {
//     console.log("showModalWithContent closestGrid ", closestGrid)
//     console.log("showModalWithContent closestGrid find", closestGrid.closest('.clarama-slate-record').find('.interactionModal'))
//     closestGrid.closest('.clarama-slate-record').find('.interactionModal').modal('show');
//     const $iModalBody = closestGrid.closest('.clarama-slate-record').find('.interactionModalBody');
//     console.log("showModalWithContent iModalBody", $iModalBody)
//     $iModalBody.empty();
//     $iModalBody.append(showInteractionContent(field, 'modal', url, field_values, contextM));
//     enable_interactions($iModalBody, true, true);
// }

// BUT somehow the record json disappeared from the task params after i put the interaction modal n popup html in root.html, 
// but shldnt be a big prob for now since thrs hidden fields
// tbh idk why itll disappear, but the record did pass to the interaction tho but im guessing because when the task runs, itll get the field values agn which will override
function showModalWithContent(field, url, field_values = "", contextM = false) {
    $('#interactionModal').modal('show');
    const $modal = $('#interactionModal');
    const $body  = $('#interactionModalBody');

    $body.html('');
    $body.append(showInteractionContent(field, 'modal', url, field_values, contextM));
    enable_interactions($body, true, true);

    $modal.one('shown.bs.modal', function () {
        try {
            const fv  = (field_values && typeof field_values === 'object') ? field_values : {};
            const row = fv.row || {};
            if (!row || typeof row !== 'object') return;

            const entries = Object.entries(row);
            if (!entries.length) return;

            const normalise = s => String(s || '')
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_');

            const pending = new Set(entries.map(([label]) => normalise(label)));

            const tick = setInterval(() => {
                entries.forEach(([label, rawVal]) => {
                    const inputName = normalise(label);
                    if (!pending.has(inputName)) return;

                    const $field = $body.find(`[name="${inputName}"]`);
                    if (!$field.length) return;

                    const idVal   = rawVal != null ? String(rawVal) : null;
                    const textVal = idVal || '';

                    if ($field.is('select')) {
                        const idKey     = $field.attr('id_column');      // which row key is the ID?
                        const valueKey  = $field.attr('value_column');   // which row key is the label?
                        const selectKey = $field.attr('select_column');  // optional "display" column

                        if (idKey || valueKey || selectKey) {
                            if (idKey && row[idKey] != null) {
                                idVal = String(row[idKey]);
                            }
                            if (valueKey && row[valueKey] != null) {
                                textVal = String(row[valueKey]);
                            } else if (selectKey && row[selectKey] != null) {
                                textVal = String(row[selectKey]);
                            } else if (!textVal && idVal) {
                                textVal = idVal;
                            }
                        }

                        const id   = idVal || textVal;
                        const text = textVal || idVal || '';

                        $field.find('option[data-autoinjected="1"]').remove();

                        if (id) {
                            if ($field.find(`option[value="${id.replace(/"/g, '&quot;')}"]`).length === 0) {
                                const opt = new Option(text, id, true, true);
                                opt.setAttribute('data-autoinjected', '1');
                                $field.append(opt);
                            }

                            $field.val(id).trigger('change');
                        } else {
                            $field.val(text).trigger('change');
                        }
                    } else {
                        const v = idVal || textVal;
                        $field.val(v).trigger('change');
                    }

                    pending.delete(inputName);
                });

                if (!pending.size) {
                    clearInterval(tick);
                }
            }, 100);
        } catch (e) {
            console.warn('modal prefill failed', e);
        }
    });

    $modal.one('hidden.bs.modal', function () {
        $body.empty();
    });
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

function getOriginalUrlFromField(field) {
    try {
        if (!field) return undefined;
        // If a jQuery object was passed
        var $el = (field.jquery) ? field : $(field);
        var ou = $el.closest('.embedded').attr('original_url');
        if (ou === undefined || ou === null || ou === '') {
            // fallback to first embedded on page
            try {
                ou = $('.embedded').eq(0).attr('original_url');
            } catch (_) {
            }
        }
        return ou;
    } catch (e) {
        try {
            console.warn('getOriginalUrlFromField failed', e);
        } catch (_) {
        }
        return undefined;
    }
}

function triggerTabInteraction(field, url, field_values = "", contextM = false) {
    // console.log("triggerTabInteraction field_values", field_values);

    let final_field;
    if (!contextM) final_field = filePath(field);
    else final_field = field;

    let fullUrl = "/content/default/" + resolveRelativeFilePath(final_field, url);
    if (fullUrl.charAt(fullUrl.length - 1) == "?") fullUrl = fullUrl.slice(0, -1);
    // console.log('triggerTabInteraction fullUrl', fullUrl);
    // Ensure original_url is included in field_values for tab interactions
    try {
        if (field_values && typeof field_values === 'object') {
            if (!('original_url' in field_values) || !field_values.original_url) {
                var ou = contextM ? (field_values.original_url || undefined) : getOriginalUrlFromField(field);
                if (!ou) {
                    try {
                        ou = $('.embedded').eq(0).attr('original_url');
                    } catch (_) {
                    }
                }
                if (ou) field_values.original_url = ou;
            }
        } else {
            field_values = {};
            var ou2 = contextM ? undefined : getOriginalUrlFromField(field);
            if (!ou2) {
                try {
                    ou2 = $('.embedded').eq(0).attr('original_url');
                } catch (_) {
                }
            }
            if (ou2) field_values.original_url = ou2;
        }
    } catch (e) {
        try {
            console.warn('Failed to ensure original_url for tab', e);
        } catch (_) {
        }
    }
    //console.log('triggerTabInteraction data', JSON.stringify(field_values));

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
            //console.log("htmlContent", htmlContent)
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
    //console.log("showPopupNearMouse field", field)
    //console.log("showPopupNearMouse url", url)
    //console.log("showPopupNearMouse field_values", field_values)
    const ipopup = document.getElementById('interactionPopup');
    //console.log("showPopupNearMouse ipopup", ipopup)
    //console.log("showPopupNearMouse lastMouseEvent", lastMouseEvent)

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
    try {
        if (!field_values || typeof field_values !== 'object') field_values = {};
        if (!('original_url' in field_values) || !field_values.original_url) {
            var ou3 = contextM ? (field_values.original_url || undefined) : getOriginalUrlFromField(field);
            if (!ou3) {
                try {
                    ou3 = $('.embedded').eq(0).attr('original_url');
                } catch (_) {
                }
            }
            if (ou3) field_values.original_url = ou3;
        }
    } catch (e) {
        try {
            console.warn('Failed to ensure original_url for interaction content', e);
        } catch (_) {
        }
    }
    newIC.setAttribute("json", JSON.stringify(field_values));
    // newIC.setAttribute("autorun", "True");
    return newIC;
}

function setInteractionSrcExpanded(target, uid, expanded) {
    const wrap = document.getElementById(`interaction-src-wrap-${target}-${uid}`);
    const btn = document.getElementById(`interaction-src-toggle-${target}-${uid}`);
    if (!wrap || !btn) return;

    wrap.classList.toggle('d-none', !expanded);
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    btn.style.display = expanded ? 'none' : '';

    const icon = btn.querySelector('i');
    if (icon) {
        icon.classList.remove('bi-chevron-left');
        icon.classList.add('bi-chevron-right');
    }
}

function exposeInteractionSourcesUnder($scope) {
    try {
        const root = ($scope && $scope.length) ? $scope[0] : document;
        const urlInputs = root.querySelectorAll('input[id^="interaction-url-"]');
        urlInputs.forEach(inp => {
            const id = String(inp.id || '');
            if (!id.startsWith('interaction-url-')) return;
            // id format: interaction-url-<target>-<uid>  (uid is last token)
            const suffix = id.substring('interaction-url-'.length);
            const parts = suffix.split('-');
            const uid = parts.pop();
            const target = parts.join('-');

            // (1) Apply your existing show/hide rules based on URL value
            onInteractionUrlInput(target, uid, inp.value || '');

            // (2) If the action type is 'modal', force-expand the source area
            const typeSel =
                document.getElementById(`interaction-element-${target}-${uid}`) ||
                document.getElementById(`interaction-elem-${target}-${uid}`);
            const selected = typeSel && (typeSel.value || '').toLowerCase();
            if (selected === 'modal') {
                setInteractionSrcExpanded(target, uid, true);
                const paramsWrap = document.getElementById(`interaction-params-wrap-${target}-${uid}`);
                if (paramsWrap) {
                    paramsWrap.classList.remove('d-none');
                    paramsWrap.classList.add('d-inline-flex');
                }
            }
        });
    } catch (e) {
        try { console.warn('exposeInteractionSourcesUnder failed', e); } catch (_) {}
    }
}

function toggleInteractionSrc(target, uid) {
    setInteractionSrcExpanded(target, uid, true);
    const urlInput = document.getElementById(`interaction-url-${target}-${uid}`);
    if (urlInput) urlInput.focus();
}

function onInteractionUrlInput(target, uid, val) {
    update_interaction_field(target, uid, 'url', val);
    const paramsWrap = document.getElementById(`interaction-params-wrap-${target}-${uid}`);
    const hasValue = !!String(val || '').trim();
    if (paramsWrap) {
        paramsWrap.classList.toggle('d-none', !hasValue);
        paramsWrap.classList.toggle('d-inline-flex', hasValue);
    }
    // Auto-expand when user starts typing; auto-collapse if cleared
    const btn = document.getElementById(`interaction-src-toggle-${target}-${uid}`);
    const expanded = btn && btn.getAttribute('aria-expanded') === 'true';
    if (!expanded && hasValue) setInteractionSrcExpanded(target, uid, true);
    if (expanded && !hasValue) setInteractionSrcExpanded(target, uid, false);
}

// Run once on initial load
try {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => exposeInteractionSourcesUnder($(document.body)));
    } else {
        exposeInteractionSourcesUnder($(document.body));
    }
} catch (_) {}

// Listen for content saved events to refresh embedded elements inside grids
(function () {
    try {
        if (typeof window !== 'undefined' && !window.__claramaGridSavedListener) {
            window.__claramaGridSavedListener = true;
            window.addEventListener('onContentSaved', function (ev) {
                try {
                    var detail = ev && ev.detail ? ev.detail : {};
                    // Try extract a URL from the payload
                    var savedUrl = detail.url;
                    if (!savedUrl) return;
                    savedUrl = '/render/embed' + String(savedUrl);

                    // Find all grids (editing grids will be present in DOM); keep scope limited to grids
                    var $grids = $('.clarama-edit-grid');
                    $grids.each(function () {
                        var $grid = $(this);
                        // Match embedded widgets by exact url attribute
                        var $targets = $grid.find('.clarama-post-embedded, .clarama-embedded').filter(function () {
                            var u = $(this).attr('url') || '';
                            return u === savedUrl;
                        });
                        if ($targets.length === 0) return;

                        $targets.each(function () {
                            var $el = $(this);
                            try {
                                // Mark not loaded to allow reload
                                $el.attr('clarama_loaded', false);
                                // Prefer POST reload for post-embedded
                                if ($el.hasClass('clarama-post-embedded') && typeof $el.load_post === 'function') {
                                    $el.load_post();
                                } else if ($el.hasClass('clarama-embedded') && typeof $el.load === 'function') {
                                    $el.load();
                                } else if (typeof $.fn.load_post === 'function' && $el.hasClass('clarama-post-embedded')) {
                                    $el.load_post();
                                }
                            } catch (e) {
                                try {
                                    console.warn('Grid saved reload failed', e);
                                } catch (_) {
                                }
                            }
                        });
                    });
                } catch (e) {
                    try {
                        console.warn('onContentSaved handler error', e);
                    } catch (_) {
                    }
                }
            });
        }
    } catch (e) {
        try {
            console.warn('Failed installing onContentSaved grid listener', e);
        } catch (_) {
        }
    }
})();
