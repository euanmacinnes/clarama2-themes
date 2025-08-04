var activeDropdownId = null; // track currently opened dropdown menu's id

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

    // add listener to each input to handle parameter-saving when typing
    const inputs = dropdownMenu.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('input', () => {
            let inputId = input.id;
            let target = inputId.replace(/_paramsInput/g, ''); 
            saveElementParams(target);
        });
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
function addGridInteraction(newIndex, gelem_target, selectedValue, selectedValueUrl, urlParams, wait, menuItemName="") {
    const newGI = document.createElement("div");
    newGI.className = "clarama-post-embedded clarama-replaceable";
    newGI.setAttribute("url", `/template/render/explorer/steps/grid_edit_interaction?uid=${newIndex}&current_element=${selectedValue}&target=${gelem_target}&current_element_url=${selectedValueUrl}&current_element_params=${urlParams}&do_wait=${wait}&menu_item_name=${menuItemName}`);
    return newGI;
}