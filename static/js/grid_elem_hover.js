var activeDropdownId = null; // track currently opened dropdown menu's id

// Refresh the Element selects inside a grid element interactions dropdown to match current elements
function refreshElementSelectorsInDropdown(dropdownMenu, gridId) {
    try {
        if (!gridId) return;
        const elementsMap = window[gridId + 'elements'] || {};
        const elemIds = Object.keys(elementsMap);
        if (!elemIds.length) return;
        const rows = dropdownMenu.querySelectorAll('.slate-elem-dropdown-item');
        rows.forEach(row => {
            const targetId = row.getAttribute('target-id');
            const uid = row.getAttribute('loop-index');
            if (!targetId || !uid) return;
            const kindSel = dropdownMenu.querySelector(`#interaction-kind-${CSS.escape(targetId)}-${CSS.escape(uid)}`);
            // Only update the element selector when current kind is 'element'
            if (kindSel && kindSel.value && kindSel.value !== 'element') return;
            const sel = dropdownMenu.querySelector(`#interaction-element-${CSS.escape(targetId)}-${CSS.escape(uid)}`);
            if (!sel) return;
            const prev = sel.value;
            // Rebuild options
            sel.innerHTML = '';
            elemIds.forEach(id => {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = id;
                sel.appendChild(opt);
            });
            // Try restore previous selection
            if (prev && elemIds.includes(prev)) {
                sel.value = prev;
            } else {
                // If kind is element and previous no longer exists, pick first and update model
                if (kindSel && kindSel.value === 'element' && elemIds.length) {
                    sel.value = elemIds[0];
                    if (typeof update_interaction_field === 'function') {
                        update_interaction_field(targetId, uid, 'element', sel.value);
                    }
                }
            }
        });
    } catch (e) {
        try { console.error('Failed to refresh element selectors in dropdown', e); } catch(_e) {}
    }
}

function showElementNumberBadges(gridId) {
    const grid = document.querySelector(`.clarama-grid[grid_id="${gridId}"]`);
    if (!grid) return;
    const items = grid.querySelectorAll('.grid-stack-item');

    items.forEach((item, i) => {
        // Try to use the numeric suffix from the element id (e.g., element_7 → "7").
        const id = item.getAttribute('gs-id') || '';
        const m = id.match(/_(\d+)$/);
        const num = m ? m[1] : String(i + 1);

        // Avoid duplicates
        if (item.querySelector(':scope > .gs-idx-badge')) return;

        const badge = document.createElement('div');
        badge.className = 'gs-idx-badge';
        badge.textContent = num;
        item.appendChild(badge);
    });
}

function removeElementNumberBadges(gridId) {
    const grid = document.querySelector(`.clarama-grid[grid_id="${gridId}"]`);
    if (!grid) return;
    grid.querySelectorAll('.gs-idx-badge').forEach(b => b.remove());
}  

document.addEventListener('shown.bs.dropdown', function (event) {
    if (event.target.id == 'navbarAlertDropdown') {
        const $bellIcon = $('#alertsmenu i.bi');
        hasUnseenDanger = false;
        $bellIcon.removeClass('shaking');
        $bellIcon.removeClass('danger');
    }

    const trigger = event.target.closest('.grid-elem-menu');
    if (!trigger) return;

    const dropdown = event.target.closest('[id^="grid-elem-dropdown-"]');
    if (!dropdown) return;

    activeDropdownId = dropdown.id;

    const dropdownMenu = dropdown.querySelector('.dropdown-menu');
    if (!dropdownMenu) return;

    // ensure the Element listboxes reflect the latest grid elements on each open
    const gridId = trigger.getAttribute('elems');
    showElementNumberBadges(gridId);
    refreshElementSelectorsInDropdown(dropdownMenu, gridId);

    // add listeners only to element-related controls to handle parameter-saving when typing/toggling
    const paramInputs = dropdownMenu.querySelectorAll('input[id$="_paramsInput"], input[id$="_refresh"], input[id$="_fit"]');
    paramInputs.forEach(input => {
        const handler = () => {
            const inputId = input.id || '';
            let target = null;
            if (/_paramsInput$/.test(inputId)) {
                target = inputId.replace(/_paramsInput$/, '');
            } else if (/_refresh$/.test(inputId)) {
                target = inputId.replace(/_refresh$/, '');
            } else if (/_fit$/.test(inputId)) {
                target = inputId.replace(/_fit$/, '');
            }
            if (target) {
                try { saveElementParams(target); } catch(e) { try { console.warn('saveElementParams failed', e); } catch(_) {} }
            }
        };
        input.addEventListener('input', handler);
        input.addEventListener('change', handler);
    });
    
    // add hover listeners to items in the dropdown to highlight associated grid element on the grid
    const items = dropdownMenu.querySelectorAll('.slate-elem-dropdown-item');
    items.forEach(item => {
        item.addEventListener('mouseover', () => {
            const elemId = item.getAttribute('elem-id');
            const targetDiv = document.querySelector(`div[id='${elemId}']`);
            if (targetDiv) targetDiv.classList.add('highlight');
        });
        item.addEventListener('mouseout', () => {
            const elemId = item.getAttribute('elem-id');
            const targetDiv = document.querySelector(`div[id='${elemId}']`);
            if (targetDiv) targetDiv.classList.remove('highlight');
        });
    });

    const triggerRect = trigger.getBoundingClientRect();
    const menuWidth = dropdownMenu.offsetWidth;
 
    // check if menu overflowed left
    if (triggerRect.left - menuWidth < 0) {
        dropdownMenu.classList.add('left-align');
    } else {
        dropdownMenu.classList.remove('left-align');
    }
});

// Remove the badges when the menu is closing/closed
document.addEventListener('hide.bs.dropdown', function (event) {
    const trigger = event.target.closest?.('.grid-elem-menu');
    if (!trigger) return;
    const gridId = trigger.getAttribute('elems');
    removeElementNumberBadges(gridId);
});

// When embedded interaction rows finish rendering, repopulate their Element selectors
// This handles the case where the dropdown was opened before the async template loaded.
document.addEventListener('clarama:load:success', function (e) {
    try {
        const target = e.target;
        if (!target || !target.classList) return;
        // Only handle our interaction row renderer loads
        const url = (typeof target.getAttribute === 'function') ? (target.getAttribute('url') || '') : '';
        if (!/explorer\/steps\/grid_edit_interaction/.test(url)) return;
        const dropdownMenu = target.closest('.embedded-dropdown-menu');
        if (!dropdownMenu) return;
        const toggle = dropdownMenu.parentElement ? dropdownMenu.parentElement.querySelector('.grid-elem-menu') : null;
        const gridId = toggle ? toggle.getAttribute('elems') : null;
        // Defer to allow DOM replacement to complete
        setTimeout(() => refreshElementSelectorsInDropdown(dropdownMenu, gridId), 0);
    } catch(err) {
        try { console.warn('Failed to handle clarama:load:success for interaction row', err); } catch(_) {}
    }
});

// Lazy-fill safeguard: if a user focuses an Element selector that has no options yet, populate it on demand
document.addEventListener('focusin', function (e) {
    try {
        const sel = e.target;
        if (!(sel && sel.matches && sel.matches('select[id^="interaction-element-"]'))) return;
        const dropdownMenu = sel.closest('.embedded-dropdown-menu');
        if (!dropdownMenu) return;
        const toggle = dropdownMenu.parentElement ? dropdownMenu.parentElement.querySelector('.grid-elem-menu') : null;
        const gridId = toggle ? toggle.getAttribute('elems') : null;
        if (!gridId) return;
        const elementsMap = window[gridId + 'elements'] || {};
        const ids = Object.keys(elementsMap);
        if (!sel.options.length && ids.length) {
            sel.innerHTML = '';
            ids.forEach(id => {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = id;
                sel.appendChild(opt);
            });
            // Try to preserve the existing linked element or select the first
            const row = sel.closest('.slate-elem-dropdown-item');
            const targetId = row ? row.getAttribute('target-id') : null;
            const uid = row ? row.getAttribute('loop-index') : null;
            const current = row ? row.getAttribute('elem-id') : null;
            if (current && elementsMap[current]) {
                sel.value = current;
            } else {
                sel.value = ids[0];
                if (typeof update_interaction_field === 'function' && targetId && uid) {
                    update_interaction_field(targetId, uid, 'element', sel.value);
                }
            }
        }
    } catch(err) {
        try { console.warn('Lazy-fill for interaction element select failed', err); } catch(_) {}
    }
});

// removes the interaction in the ui
$(document).on('click', '.delete-grid-interaction', function () {
    $(this).closest('li').remove();
});

// newIndex - unique index or id for the interaction
// gelem_target - target grid element id
// selectedValue - selected interaction (type)
// selectedValueUrl - url of selected interaction
// urlParams - extra params to send
// menuItemName - (optional, only for context menu) context menu item label

// newIndex - unique index or id for the interaction
// gelem_target - target grid element id
// selectedValue - selected interaction (type)
// selectedValueUrl - url of selected interaction
// urlParams - extra params to send
// menuItemName - (optional, only for context menu) context menu item label
function addGridInteraction(newIndex, gelem_target, selectedValue, selectedValueUrl, urlParams, wait, menuItemName) {
    const newGI = document.createElement("div");
    newGI.className = "clarama-post-embedded clarama-replaceable";
    let url = `/template/render/explorer/files/_grid_interaction_edit?uid=${newIndex}` +
              `&current_element=${encodeURIComponent(selectedValue||'')}` +
              `&target=${encodeURIComponent(gelem_target)}` +
              `&current_element_url=${encodeURIComponent(selectedValueUrl||'')}` +
              `&current_element_params=${encodeURIComponent(urlParams||'')}` +
              `&do_wait=${wait? 'true':'false'}`;
    if (menuItemName === '__menu__') {
        url += `&is_menu=true`;
    } else if (typeof menuItemName !== 'undefined' && menuItemName !== null && menuItemName !== '') {
        url += `&menu_item_name=${encodeURIComponent(menuItemName)}`;
    }
    newGI.setAttribute("url", url);
    return newGI;
}