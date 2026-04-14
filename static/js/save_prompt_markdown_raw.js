let initialContent = null;
let hasUnsavedChanges = false;
let isNavigating = false;
let pendingAction = null; 
let modalInstance = null;

$(document).ready(() => {
    setTimeout(() => {
        captureInitialContent();
        setupModalHandlers();
    }, 500);
    setupNavigationListeners();
    setupChangeDetection();
    setupSaveHooks();
});

function captureInitialContent() {
    initialContent = getEditorContent();
    console.log("Initial content captured");
}

function getEditorContent() {
    const markdownEl = document.getElementById('markdown');
    if (markdownEl && typeof $(markdownEl).trumbowyg === 'function') {
        return $(markdownEl).trumbowyg('html');
    }
    const rawEl = document.querySelector('.source-editor');
    if (!rawEl) return '';
    if (rawEl.tagName.toLowerCase() === 'textarea' || rawEl.tagName.toLowerCase() === 'input') {
        return rawEl.value;
    }
    return rawEl.textContent || rawEl.innerText || '';
}

function checkForUnsavedChanges() {
    return new Promise((resolve) => {
        const current = getEditorContent();
        hasUnsavedChanges = current !== initialContent;
        resolve(hasUnsavedChanges);
    });
}

function setupChangeDetection() {
    // Use debounced input listener
    let timeoutId;
    const debouncedCheck = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            checkForUnsavedChanges();
        }, 500);
    };

    if ($('#markdown').length) {
        $('#markdown').on('tbwchange keyup input', debouncedCheck);
    } else {
        $('.source-editor').on('input', debouncedCheck);
    }
}

function setupNavigationListeners() {
    $(document).on('click', 'a[href]:not([href^="#"]):not([target="_blank"])', function(e) {
        if (isNavigating) return; // Already navigating, do nothing

        e.preventDefault();
        const href = $(this).attr('href');

        checkForUnsavedChanges().then(changed => {
            if (changed) {
                // Show modal and store the pending navigation action
                pendingAction = { type: 'navigate', target: href };
                showUnsavedChangesModal();
            } else {
                isNavigating = true;
                window.location.href = href;
            }
        });
    });

    // Intercept form submits unless they have .no-prompt class
    $(document).on('submit', 'form:not(.no-prompt)', function(e) {
        if (isNavigating) return;

        e.preventDefault();
        const form = this;

        checkForUnsavedChanges().then(changed => {
            if (changed) {
                pendingAction = { type: 'submit', target: form };
                showUnsavedChangesModal();
            } else {
                isNavigating = true;
                form.submit();
            }
        });
    });
}

function setupSaveHooks() {
    $(document).ajaxSuccess((event, xhr, settings) => {
        if (settings.url && settings.url.includes('/content/save/')) {
            const response = xhr.responseJSON;
            if (response && response.data === 'ok') {
                updateInitialContentAfterSave();

                if (modalInstance && pendingAction) {
                    modalInstance.hide();
                    executePendingAction();
                }
            }
        }
    });

    // Also hook save button clicks to update initial content shortly after
    $(document).on('click', '#markdown_save, #content_editor_raw_save', () => {
        setTimeout(() => {
            updateInitialContentAfterSave();

            // If modal open and pending action exists, close modal and execute
            if (modalInstance && pendingAction) {
                modalInstance.hide();
                executePendingAction();
            }
        }, 1000);
    });
}

function updateInitialContentAfterSave() {
    captureInitialContent();
    hasUnsavedChanges = false;
    console.log("Content marked as saved");
}

function showUnsavedChangesModal() {
    // Close GINA if it is currently open
    if (window.__ginaCloseIfOpen && typeof window.__ginaCloseIfOpen === 'function') {
        window.__ginaCloseIfOpen();
    }

    if (!modalInstance) {
        modalInstance = new bootstrap.Modal(document.getElementById('unsaved-changes-modal'), {
            backdrop: 'static',
            keyboard: false
        });
    }
    modalInstance.show();
}

function setupModalHandlers() {
    $('#save-and-continue').off('click').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        // Disable buttons to prevent double click
        disableModalButtons(true);

        // Trigger save button click
        const saveBtn = document.getElementById('markdown_save') || document.getElementById('content_editor_raw_save');
        if (saveBtn) {
            saveBtn.click();
            // Wait for AJAX success to proceed (handled in ajaxSuccess)
        } else {
            console.warn("Save button not found, proceeding anyway");
            hasUnsavedChanges = false;
            modalInstance.hide();
            executePendingAction();
        }
    });

    $('#discard-changes').off('click').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        hasUnsavedChanges = false;
        disableModalButtons(false);
        modalInstance.hide();
        executePendingAction();
    });

    $('#cancel-changes').off('click').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        disableModalButtons(false);
        modalInstance.hide();

        // Clear pending action, user canceled navigation
        pendingAction = null;
    });
}

function disableModalButtons(disable) {
    $('#save-and-continue').prop('disabled', disable);
    $('#discard-changes').prop('disabled', disable);
    $('#cancel-changes').prop('disabled', disable);
}

function executePendingAction() {
    if (!pendingAction) {
        console.warn("No pending action to execute");
        isNavigating = false;
        return;
    }

    isNavigating = true;

    const { type, target } = pendingAction;

    if (type === 'navigate' && typeof target === 'string') {
        pendingAction = null;
        window.location.href = target;
    } else if (type === 'submit' && target && typeof target.submit === 'function') {
        pendingAction = null;
        target.submit();
    } else {
        console.warn("Unknown pending action or invalid target", pendingAction);
        isNavigating = false;
        pendingAction = null;
    }
}
