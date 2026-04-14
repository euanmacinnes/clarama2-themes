var activeDropdownId = null; // track currently opened dropdown menu's id

function clearSlateHighlightById(elemId) {
    if (!elemId) return;
    const t = document.querySelector(`#${CSS.escape(elemId)}`);
    if (t) t.classList.remove('highlight');
}

(function ensureElementPickerStyles(){
    if (document.getElementById('element-picker-style')) return;
    const style = document.createElement('style');
    style.id = 'element-picker-style';
    style.textContent = `
    .element-picker-menu {
    position: fixed; z-index: 3000; background: #fff; border: 1px solid #dee2e6;
    border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,.12); padding: 6px 0;
    max-height: 280px; overflow: auto; min-width: 120px;
    }
    .element-picker-item { padding: 6px 10px; line-height: 1.2; cursor: pointer; user-select: none; white-space: nowrap; }
    .element-picker-item:hover { background: #f0f6ff; }
    `;
    document.head.appendChild(style);
})();

function getElemSuffix(id) {
    const m = (id || '').match(/_(\d+)$/);
    return m ? m[1] : id;
}

function ensureSelectOptions(selectEl, ids) {
    const have = new Set(Array.from(selectEl.options).map(o => o.value));
    let changed = false;

    if (!selectEl.options.length) {
        ids.forEach(id => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = getElemSuffix(id);
            selectEl.appendChild(opt);
        });
        changed = true;
    } else {
        ids.forEach(id => {
            if (!have.has(id)) {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = getElemSuffix(id);
            selectEl.appendChild(opt);
            changed = true;
            }
        });
    }
    return changed;
}

function closeElementPicker(dropdownMenu) {
    const m = dropdownMenu && dropdownMenu.__elementPickerMenu;
    if (m && m.parentNode) m.parentNode.removeChild(m);
    if (dropdownMenu) dropdownMenu.__elementPickerMenu = null;
}

function openElementPicker(selectEl, dropdownMenu, gridId) {
    closeElementPicker(dropdownMenu); // only one per menu

    const elementsMap = window[gridId + 'elements'] || {};
    const ids = Object.keys(elementsMap);
    if (!ids.length) return;
    ensureSelectOptions(selectEl, ids);

    const rect = selectEl.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'element-picker-menu';
    menu.style.left = rect.left + 'px';
    menu.style.top  = (rect.bottom + 4) + 'px';
    menu.style.minWidth = rect.width + 'px';

    // prevent clicks inside from closing the Bootstrap dropdown
    const stop = (e) => e.stopPropagation();
    menu.addEventListener('pointerdown', stop);
    menu.addEventListener('click', stop);

    ids.forEach(id => {
        const item = document.createElement('div');
        item.className = 'element-picker-item';
        item.dataset.elemId = id;
        item.textContent = getElemSuffix(id);

        item.addEventListener('pointerenter', () => {
            // live hover highlight
            if (dropdownMenu.__currentHighlighted && dropdownMenu.__currentHighlighted !== id) {
                clearSlateHighlightById(dropdownMenu.__currentHighlighted);
            }
            const t = document.querySelector(`#${CSS.escape(id)}`);
            if (t) {
                t.classList.add('highlight');
                dropdownMenu.__currentHighlighted = id;
            }
        });

        item.addEventListener('click', () => {
            if (!Array.from(selectEl.options).some(o => o.value === id)) {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = getElemSuffix(id);
                selectEl.appendChild(opt);
            }
            selectEl.value = id;
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            closeElementPicker(dropdownMenu);
        });

        menu.appendChild(item);
    });

    document.body.appendChild(menu);
    dropdownMenu.__elementPickerMenu = menu;

    // close on outside click or Esc
    const onDown = (e) => {
        if (menu.contains(e.target) || e.target === selectEl) return;
        closeElementPicker(dropdownMenu);
    };
    const onEsc = (e) => {
        if (e.key === 'Escape') closeElementPicker(dropdownMenu);
    };

    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onEsc, true);

    // teardown bindings when menu is removed
    const observer = new MutationObserver(() => {
        if (!menu.isConnected) {
            document.removeEventListener('pointerdown', onDown, true);
            document.removeEventListener('keydown', onEsc, true);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true });
}

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
                opt.textContent = id.match(/_(\d+)$/)[1];
                sel.appendChild(opt);
            });
            // Try restore previous selection
            if (prev && elemIds.includes(prev)) {
                sel.value = prev;
                if (row) row.setAttribute('elem-id', sel.value);
            } else {
                // If kind is element and previous no longer exists, pick first and update model
                if (kindSel && kindSel.value === 'element' && elemIds.length) {
                    sel.value = elemIds[0];
                    if (row) row.setAttribute('elem-id', sel.value);
                    update_interaction_field(targetId, uid, 'element', sel.value);
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

const gridMenuOpenCount = new Map();

function increaseGridOpen(gridId) {
    const n = (gridMenuOpenCount.get(gridId) || 0) + 1;
    gridMenuOpenCount.set(gridId, n);
    showElementNumberBadges(gridId);
}

function decreaseGridOpen(gridId) {
    const n = (gridMenuOpenCount.get(gridId) || 0) - 1;
    gridMenuOpenCount.set(gridId, Math.max(0, n));
    setTimeout(() => {
        if ((gridMenuOpenCount.get(gridId) || 0) === 0) {
            const anyOpen = !!document.querySelector(
                `.dropdown-menu.show[data-grid-id="${CSS.escape(gridId)}"]`
            );
            if (!anyOpen) removeElementNumberBadges(gridId);
        }
    }, 0);
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
    refreshElementSelectorsInDropdown(dropdownMenu, gridId);

    const menu = trigger.querySelector('.dropdown-menu');
    if (menu) menu.setAttribute('data-grid-id', gridId);
    increaseGridOpen(gridId);

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
                saveElementParams(target);
            }
        };
        input.addEventListener('input', handler);
        input.addEventListener('change', handler);
    });
    
    // Track the currently highlighted element for this menu
    dropdownMenu.__currentHighlighted = null;

    if (!dropdownMenu.__hoverDelegated) {
        dropdownMenu.addEventListener('mouseover', (e) => {
            const row = e.target.closest('.slate-elem-dropdown-item');
            if (!row || !dropdownMenu.contains(row)) return;

            const elemId = row.getAttribute('elem-id');
            if (!elemId) return;

            if (dropdownMenu.__currentHighlighted && dropdownMenu.__currentHighlighted !== elemId) {
                clearSlateHighlightById(dropdownMenu.__currentHighlighted);
            }
            const targetDiv = document.querySelector(`#${CSS.escape(elemId)}`);
            if (targetDiv) {
                targetDiv.classList.add('highlight');
                dropdownMenu.__currentHighlighted = elemId;
            }
        });

        dropdownMenu.addEventListener('mouseout', (e) => {
            const fromRow = e.target.closest('.slate-elem-dropdown-item');
            if (!fromRow || !dropdownMenu.contains(fromRow)) return;
            const toEl = e.relatedTarget;
            if (toEl && fromRow.contains(toEl)) return;

            const elemId = fromRow.getAttribute('elem-id');
            if (!elemId) return;

            if (dropdownMenu.__currentHighlighted === elemId) {
                clearSlateHighlightById(elemId);
                dropdownMenu.__currentHighlighted = null;
            }
        });

        dropdownMenu.__hoverDelegated = true;
    }

    if (!dropdownMenu.__pickerDelegated) {
        // Open our overlay instead of native select popup
        dropdownMenu.addEventListener('mousedown', (e) => {
            const sel = e.target.closest('select[id^="interaction-element-"]');
            if (!sel || !dropdownMenu.contains(sel)) return;
            e.preventDefault();
            e.stopPropagation();
            const elementsMap = window[gridId + 'elements'] || {};
            ensureSelectOptions(sel, Object.keys(elementsMap));
            openElementPicker(sel, dropdownMenu, gridId);
        });

        // Keep highlight and row attribute in sync when selection changes
        dropdownMenu.addEventListener('change', (e) => {
            const sel = e.target;
            if (!(sel && sel.matches && sel.matches('select[id^="interaction-element-"]'))) return;
        
            const row = sel.closest('.slate-elem-dropdown-item');
            const newId = sel.value;
            if (!row || !newId) return;
        
            // Update the data model on the row so hover reads the latest target
            row.setAttribute('elem-id', newId);
        
            // Refresh the highlight immediately
            if (dropdownMenu.__currentHighlighted && dropdownMenu.__currentHighlighted !== newId) {
                clearSlateHighlightById(dropdownMenu.__currentHighlighted);
            }
            const t = document.querySelector(`#${CSS.escape(newId)}`);
            if (t) {
                // Only add highlight if the row is currently hovered, or just always add:
                if (row.matches(':hover')) {
                    t.classList.add('highlight');
                    dropdownMenu.__currentHighlighted = newId;
                } else {
                    // If not hovered, just update the pointer so the next hover uses the new id
                    dropdownMenu.__currentHighlighted = null;
                }
            }
        });

        dropdownMenu.__pickerDelegated = true;
    }

    const elementSelects = dropdownMenu.querySelectorAll('select[id^="interaction-element-"]');

    elementSelects.forEach(sel => {
        if (sel.dataset.pickerWired === '1') return;

        sel.addEventListener('mousedown', (e) => {
            e.preventDefault(); 
            e.stopPropagation(); 
            openElementPicker(sel, dropdownMenu, gridId);
        });

        sel.addEventListener('change', () => {
            const id = sel.value;
            if (!id) return;
            if (dropdownMenu.__currentHighlighted && dropdownMenu.__currentHighlighted !== id) {
                clearSlateHighlightById(dropdownMenu.__currentHighlighted);
            }
            const targetDiv = document.querySelector(`#${CSS.escape(id)}`);
            if (targetDiv) {
                targetDiv.classList.add('highlight');
                dropdownMenu.__currentHighlighted = id;
            }
        });

        sel.dataset.pickerWired = '1';
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
    decreaseGridOpen(gridId);
});

document.addEventListener('hidden.bs.dropdown', function (event) {
    const trigger = event.target.closest?.('.grid-elem-menu');
    if (!trigger) return;
  
    const dropdown = event.target.closest('[id^="grid-elem-dropdown-"]');
    if (!dropdown) return;
  
    const dropdownMenu = dropdown.querySelector('.dropdown-menu');
    if (!dropdownMenu) return;
  
    // Clear highlight
    if (dropdownMenu.__currentHighlighted) {
        clearSlateHighlightById(dropdownMenu.__currentHighlighted);
        dropdownMenu.__currentHighlighted = null;
    }
    // Close any overlay picker
    closeElementPicker(dropdownMenu);
  
    // Allow clean rewire next time
    dropdownMenu.querySelectorAll('.slate-elem-dropdown-item').forEach(item => {
        delete item.dataset.hoverWired;
    });
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
        console.warn('Failed to handle clarama:load:success for interaction row', err);
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
                opt.textContent = id.match(/_(\d+)$/)[1];
                sel.appendChild(opt);
            });
            // Try to preserve the existing linked element or select the first
            const row = sel.closest('.slate-elem-dropdown-item');
            const targetId = row ? row.getAttribute('target-id') : null;
            const uid = row ? row.getAttribute('loop-index') : null;
            const current = row ? row.getAttribute('elem-id') : null;
            if (current && elementsMap[current]) {
                sel.value = current;
                if (row) row.setAttribute('elem-id', sel.value);
            } else {
                sel.value = ids[0];
                if (row) row.setAttribute('elem-id', sel.value);

                if (targetId && uid) {
                    update_interaction_field(targetId, uid, 'element', sel.value);
                }
            }
        }
    } catch(err) {
        try { console.warn('Lazy-fill for interaction element select failed', err); } catch(_) {}
    }
});

// removes the interaction in the ui as well as unhighlights the element
$(document).on('click', '.delete-grid-interaction', function () {
    const $row = $(this).closest('li');
    if ($row && $row.length) {
        const elemId = $row.attr('elem-id');
        if (elemId) {
            clearSlateHighlightById(elemId);
        }
    }
    $row.remove();
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