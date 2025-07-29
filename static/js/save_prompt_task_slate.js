let initialState = null;
let initialSlateState = null; // For grid/slate data
let hasUnsavedChanges = false;
let isNavigating = false;

$(document).ready(function() {
    // Capture initial state after page loads
    setTimeout(() => {
        captureInitialState();
        captureInitialSlateState();
    }, 1000);
    
    setupNavigationListeners();
    setupModalHandlers();
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
        
        if ($(this).hasClass('dropdown-toggle') || $(this).attr('data-bs-toggle') === 'dropdown') {
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
    // Save and continue button
    $('#save-and-continue').on('click', function() {
        const modal = bootstrap.Modal.getInstance(document.getElementById('unsaved-changes-modal'));
        const target = $('#unsaved-changes-modal').data('target');
        const actionType = $('#unsaved-changes-modal').data('actionType');
        
        // Trigger save - check which type of save to use
        if (typeof saveGrid === 'function' && $('#save[onclick*="save("]').length > 0) {
            // This is a slate page, trigger the slate save
            $('#save').click();
        } else {
            // This is a task page, trigger the task save
            $('#save').click();
        }
        
        // Wait for save to complete, then continue
        setTimeout(() => {
            isNavigating = true;
            hasUnsavedChanges = false;
            modal.hide();
            
            // Execute the original action
            executeOriginalAction(target, actionType);
        }, 1500); // Longer timeout for slate saves
    });
    
    // Discard changes button
    $('#discard-changes').on('click', function() {
        const modal = bootstrap.Modal.getInstance(document.getElementById('unsaved-changes-modal'));
        const target = $('#unsaved-changes-modal').data('target');
        const actionType = $('#unsaved-changes-modal').data('actionType');
        
        isNavigating = true;
        hasUnsavedChanges = false;
        modal.hide();
        
        // Execute the original action
        executeOriginalAction(target, actionType);
    });
    
    // Cancel button - just close the modal
    $('#cancel-changes').on('click', function() {
        const modal = bootstrap.Modal.getInstance(document.getElementById('unsaved-changes-modal'));
        modal.hide();
    });
    
    // Reset navigation flag when modal is hidden without action
    $('#unsaved-changes-modal').on('hidden.bs.modal', function() {
        // Only reset if we're not in the middle of navigating
        setTimeout(() => {
            if (isNavigating) {
                isNavigating = false;
            }
        }, 100);
    });
}

/**
 * Execute the original action that was intercepted
 */
function executeOriginalAction(target, actionType) {
    switch (actionType) {
        case 'navigate':
            window.location.href = target;
            break;
        case 'submit':
            $(target).off('submit.unsaved').trigger('submit');
            break;
        case 'button':
            const $button = $(target);
            const $tempButton = $button.clone(false);
            $tempButton.insertAfter($button);
            $tempButton[0].click();
            $tempButton.remove();
            break;
        case 'dropdown-item':
            if (target.onclick) {
                eval(target.onclick);
            }
            break;
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