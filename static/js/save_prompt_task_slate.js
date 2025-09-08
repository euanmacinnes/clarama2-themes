let initialState = null;
let initialSlateState = null; // For grid/slate data
let hasUnsavedChanges = false;
let isNavigating = false;

$(document).ready(function() {
    // Capture initial state after page loads
    setTimeout(() => {
        captureInitialState();
        captureInitialSlateState();
        setupModalHandlers();
    }, 1000);
    
    setupNavigationListeners();
    setupChangeDetection();
    setupSaveHooks();
});

function captureInitialState() {
    if (typeof get_fields === 'function') {
        get_fields(true, true, function(task_registry) {
            if (task_registry && task_registry.streams && task_registry.streams[0] && task_registry.streams[0].main) {
                initialState = JSON.stringify(task_registry.streams[0].main);
                console.log("Initial task state captured");
            }
        });
    }
}

function captureInitialSlateState() {
    if (typeof saveGrid === 'function') {
        try {
            const slateData = saveGrid();
            initialSlateState = JSON.stringify(slateData);
            console.log("Initial slate state captured");
        } catch (error) {
            console.log("Could not capture initial slate state:", error);
        }
    }
}

function checkForUnsavedChanges() {
    return new Promise((resolve) => {
        let hasTaskChanges = false;
        let hasSlateChanges = false;
        
        const checkPromises = [];
        
        if (typeof get_fields === 'function' && initialState) {
            const taskPromise = new Promise((taskResolve) => {
                get_fields(true, true, function(task_registry) {
                    if (task_registry && task_registry.streams && task_registry.streams[0] && task_registry.streams[0].main) {
                        const currentState = JSON.stringify(task_registry.streams[0].main);
                        hasTaskChanges = currentState !== initialState;
                    }
                    taskResolve(hasTaskChanges);
                });
            });
            checkPromises.push(taskPromise);
        }
        
        if (typeof saveGrid === 'function' && initialSlateState) {
            const slatePromise = new Promise((slateResolve) => {
                try {
                    const currentSlateState = JSON.stringify(saveGrid());
                    hasSlateChanges = currentSlateState !== initialSlateState;
                } catch (error) {
                    console.log("Error checking slate changes:", error);
                    hasSlateChanges = false;
                }
                slateResolve(hasSlateChanges);
            });
            checkPromises.push(slatePromise);
        }
        
        if (checkPromises.length === 0) {
            resolve(false);
            return;
        }
        
        Promise.all(checkPromises).then((results) => {
            const hasChanges = results.some(result => result === true);
            hasUnsavedChanges = hasChanges;
            resolve(hasChanges);
        });
    });
}

function setupNavigationListeners() {
    $(window).on('beforeunload', function(e) {
        if (isNavigating) return; 
        
        if (hasUnsavedChanges) {
            const message = 'You have unsaved changes. Are you sure you want to leave?';
            e.returnValue = message;
            return message;
        }
    });
    
    $(document).on('click', 'a[href]:not([href^="#"]):not([target="_blank"])', function(e) {
        if (isNavigating) return;
        
        e.preventDefault();
        const href = $(this).attr('href');
        
        // Check current state in real-time
        checkForUnsavedChanges().then(hasChanges => {
            if (hasChanges) {
                showUnsavedChangesModal(href, 'navigate');
            } else {
                // No changes, proceed with navigation
                window.location.href = href;
            }
        });
    });
    
    $(document).on('submit', 'form:not(.no-prompt)', function(e) {
        if (isNavigating) return;
        
        e.preventDefault();
        const form = this;
        
        // Check current state in real-time
        checkForUnsavedChanges().then(hasChanges => {
            if (hasChanges) {
                showUnsavedChangesModal(form, 'submit');
            } else {
                // No changes, proceed with form submission
                form.submit();
            }
        });
    });
    
    $(document).on('click', '.clarama-task-stop, .clarama-task-editrun, #kernel_status:not(.dropdown-toggle)', function(e) {
        if (isNavigating) return;
        
        if (
            $(this).hasClass('dropdown-toggle') ||
            $(this).attr('data-bs-toggle') === 'dropdown' ||
            $(this).hasClass('clarama-task-stop') ||
            $(this).hasClass('clarama-task-editrun') ||
            $(this).is('#kernel_status')
        ) {
            return;
        }
        
        
        e.preventDefault();
        const button = this;
        
        checkForUnsavedChanges().then(hasChanges => {
            if (hasChanges) {
                showUnsavedChangesModal(button, 'button');
            } else {
                executeOriginalAction(button, 'button');
            }
        });
    });
    
    $(document).on('click', '.dropdown-item.environments', function(e) {
        if (isNavigating) return;
        
        const isInEnvironmentDropdown = $(this).closest('ul[aria-labelledby="environment"]').length > 0;
        
        if (isInEnvironmentDropdown) {
            return; // Let the default behavior happen (don't prevent default)
        }
        
        e.preventDefault();
        const item = this;
        const onclickAttr = $(this).attr('onclick');
        
        checkForUnsavedChanges().then(hasChanges => {
            if (hasChanges) {
                showUnsavedChangesModal({
                    element: item,
                    onclick: onclickAttr
                }, 'dropdown-item');
            } else {
                // Execute the original onclick function
                if (onclickAttr) {
                    eval(onclickAttr);
                }
            }
        });
    });
}

function setupChangeDetection() {
    let checkTimeout;
    
    function debouncedCheck() {
        clearTimeout(checkTimeout);
        checkTimeout = setTimeout(() => {
            // Update the cached flag for beforeunload events
            checkForUnsavedChanges().then(hasChanges => {
                hasUnsavedChanges = hasChanges;
            });
        }, 500);
    }
    
    // Form input changes (for task pages)
    $(document).on('input change', 'input, textarea, select', debouncedCheck);
    $(document).on('input', '[contenteditable]', debouncedCheck);
    $(document).on('sortupdate', '.clarama-sortable-color', debouncedCheck);
    
    // Grid/slate specific changes
    if (typeof window.grid !== 'undefined' || typeof saveGrid === 'function') {
        // Listen for grid changes if grid exists
        $(document).on('change added removed resized moved', '.grid-stack', debouncedCheck);
        $(document).on('input change', '[id$="_paramsInput"], [id$="_refresh"], [id$="_fit"], [id$="_layout"]', debouncedCheck);
        $(document).on('click', '.slate-elem-dropdown-item .delete-grid-interaction', debouncedCheck);
        $(document).on('input', '[id^="element_"][id*="textarea"]', debouncedCheck);
        $(document).on('input change', '#gs_columnRange, #settings_table_source', debouncedCheck);
    }
}

function setupSaveHooks() {
    // Hook into AJAX success for save operations
    $(document).ajaxSuccess(function(event, xhr, settings) {
        if (settings.url && settings.url.includes('/content/save/')) {
            const response = xhr.responseJSON;
            if (response && response.data === 'ok') {
                updateInitialStateAfterSave();
            }
        }
    });
    
    // Also hook into the save button click for slate pages
    $(document).on('click', '#save', function() {
        // Wait a bit for the save to complete, then update states
        setTimeout(() => {
            updateInitialStateAfterSave();
        }, 1000);
    });
}

/**
 * Show the unsaved changes modal
 */
function showUnsavedChangesModal(target, actionType) {
    const modal = new bootstrap.Modal(document.getElementById('unsaved-changes-modal'));
    
    $('#unsaved-changes-modal').data('target', target);
    $('#unsaved-changes-modal').data('actionType', actionType);
    
    modal.show();
}

/**
 * Set up modal button handlers
 */
function setupModalHandlers() {
    $('#save-and-continue').off('click.modal');
    $('#discard-changes').off('click.modal');
    $('#cancel-changes').off('click.modal');
    
    // Save and continue button
    $('#save-and-continue').on('click.modal', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('unsaved-changes-modal'));
        const target = $('#unsaved-changes-modal').data('target');
        const actionType = $('#unsaved-changes-modal').data('actionType');
        
        isNavigating = true;
        
        try {
            const saveButton = document.getElementById('save');
            if (saveButton) {
                $(saveButton).off('click.unsaved');
                saveButton.click();
            } else {
                console.log("Save button not found!");
            }
        } catch (error) {
            console.error("Error clicking save button:", error);
        }
        
        setTimeout(() => {
            hasUnsavedChanges = false;
            
            if (modal) {
                modal.hide();
            }
            
            // Execute the original action
            executeOriginalAction(target, actionType);
        }, 800); 
    });
    
    // Discard changes button  
    $('#discard-changes').on('click.modal', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('unsaved-changes-modal'));
        const target = $('#unsaved-changes-modal').data('target');
        const actionType = $('#unsaved-changes-modal').data('actionType');
        
        isNavigating = true;
        hasUnsavedChanges = false;
        
        if (modal) {
            modal.hide();
        }
        
        executeOriginalAction(target, actionType);
    });
    
    // Cancel button
    $('#cancel-changes').on('click.modal', function(e) {
        console.log("Cancel clicked!");
        e.preventDefault();
        e.stopPropagation();
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('unsaved-changes-modal'));
        if (modal) {
            modal.hide();
        }
    });
}

function executeOriginalAction(target, actionType) {
    console.log("Executing original action:", actionType, target);
    
    switch (actionType) {
        case 'navigate':
            console.log("Navigating to:", target);
            window.location.href = target;
            break;
        case 'submit':
            console.log("Submitting form:", target);
            if (target && target.submit) {
                target.submit();
            }
            break;
        case 'button':
            console.log("Clicking button:", target);
            if (target && target.click) {
                target.click();
            }
            break;
        case 'dropdown-item':
            console.log("Executing dropdown item:", target);
            if (target && target.onclick) {
                eval(target.onclick);
            }
            break;
        default:
            console.log("Unknown action type:", actionType);
    }
}

function updateInitialStateAfterSave() {
    setTimeout(() => {
        captureInitialState();
        captureInitialSlateState();
        hasUnsavedChanges = false;
        console.log("Initial states updated after save");
    }, 500);
}

function checkUnsavedChanges() {
    return checkForUnsavedChanges();
}

function markChangesSaved() {
    updateInitialStateAfterSave();
}

// Export functions for global access
window.checkUnsavedChanges = checkUnsavedChanges;
window.markChangesSaved = markChangesSaved;