(function() {
    'use strict';
    
    let hasUnsavedChanges = false;
    let originalContent = '';
    let isSaving = false;
    let editorElement = null;
    let saveButtonElement = null;
    let editorType = 'slate';
    let initialized = false;
    let gridId = null;

    // Configuration
    function initializeFromDataAttributes() {
        // Look for configuration in data attributes
        const configElement = $('[data-editor-id]').first();
        if (configElement.length === 0) {
            autoDetectConfiguration();
            return;
        }

        const editorId = configElement.data('editor-id');
        const saveButtonId = configElement.data('save-button-id');
        editorType = configElement.data('editor-type') || 'slate';

        editorElement = $('#' + editorId);
        saveButtonElement = $('#' + saveButtonId);

        if (editorElement.length === 0 || saveButtonElement.length === 0) {
            console.warn('Could not find editor or save button elements');
            return;
        }

        initialized = true;
    }

    // Auto-detect configuration for slate editor and other editors
    function autoDetectConfiguration() {
        // Try to detect slate editor first
        const slateGrid = $('.clarama-grid[grid_id]').first();
        const slateSaveButton = $('#save');
        if (slateGrid.length && slateSaveButton.length) {
            editorElement = slateGrid;
            saveButtonElement = slateSaveButton;
            editorType = 'slate';
            gridId = slateGrid.attr('grid_id');
            initialized = true;
            console.log('Detected slate editor with grid_id:', gridId);
            return;
        }

        // Try to detect markdown editor
        if ($('#markdown').length && $('#markdown_save').length) {
            editorElement = $('#markdown');
            saveButtonElement = $('#markdown_save');
            editorType = 'trumbowyg';
            initialized = true;
            console.log('Detected markdown editor');
            return;
        }

        // Try to detect YAML/raw editor
        const rawEditor = $('[id^="content_query_"]');
        if (rawEditor.length) {
            const saveButtonId = rawEditor.attr('savebutton');
            if (saveButtonId && $('#' + saveButtonId).length) {
                editorElement = rawEditor;
                saveButtonElement = $('#' + saveButtonId);
                editorType = rawEditor.attr('editor') || 'textarea';
                initialized = true;
                console.log('Detected raw editor');
                return;
            }
        }

        console.warn('Could not auto-detect editor configuration');
    }

    // Get current content based on editor type
    function getCurrentContent() {
        if (!editorElement) return '';

        switch (editorType) {
            case 'slate':
                return getSlateContent();
            case 'trumbowyg':
                return editorElement.trumbowyg('html');
            case 'monaco':
                // Handle Monaco Editor
                if (window.monaco) {
                    const editor = window.monaco.editor.getEditors().find(e => 
                        e.getDomNode().closest('#' + editorElement.attr('id')) ||
                        e.getDomNode() === editorElement[0]
                    );
                    if (editor) return editor.getValue();
                }
                break;
            case 'codemirror':
                // Handle CodeMirror
                const cmElement = editorElement.find('.CodeMirror')[0] || 
                                 (editorElement[0] && editorElement[0].CodeMirror ? editorElement[0] : null);
                if (cmElement && cmElement.CodeMirror) {
                    return cmElement.CodeMirror.getValue();
                }
                break;
            case 'contenteditable':
                return editorElement.html();
            default:
                return editorElement.val() || editorElement.text();
        }
        return editorElement.val() || editorElement.text();
    }

    // Get slate editor content by serializing the grid structure
    function getSlateContent() {
        if (!editorElement) return '';
        
        try {
            // Capture the current HTML structure of the grid
            const gridHtml = editorElement.html();
            
            // Also capture any form values within the grid
            const formData = {};
            editorElement.find('input, textarea, select').each(function() {
                const element = $(this);
                const name = element.attr('name') || element.attr('id');
                if (name) {
                    if (element.is(':checkbox') || element.is(':radio')) {
                        formData[name] = element.is(':checked');
                    } else {
                        formData[name] = element.val();
                    }
                }
            });
            
            // Return a combination of structure and form data
            return JSON.stringify({
                html: gridHtml,
                formData: formData,
                timestamp: Date.now()
            });
        } catch (e) {
            console.warn('Error getting slate content:', e);
            return editorElement.html() || '';
        }
    }

    // Set up change detection based on editor type
    function setupChangeDetection() {
        if (!editorElement) return;

        // Common events for all editors
        editorElement.on('input change keyup paste blur', function() {
            markAsChanged();
        });

        // Editor-specific event handlers
        switch (editorType) {
            case 'slate':
                // Set up comprehensive change detection for slate editor
                setupSlateChangeDetection();
                break;

            case 'trumbowyg':
                editorElement.on('tbwchange', function() {
                    markAsChanged();
                });
                break;

            case 'monaco':
                if (window.monaco) {
                    setTimeout(() => {
                        const editor = window.monaco.editor.getEditors().find(e => 
                            e.getDomNode().closest('#' + editorElement.attr('id')) ||
                            e.getDomNode() === editorElement[0]
                        );
                        if (editor) {
                            editor.onDidChangeModelContent(() => {
                                markAsChanged();
                            });
                        }
                    }, 1000);
                }
                break;

            case 'codemirror':
                setTimeout(() => {
                    const cmElement = editorElement.find('.CodeMirror')[0] || 
                                     (editorElement[0] && editorElement[0].CodeMirror ? editorElement[0] : null);
                    if (cmElement && cmElement.CodeMirror) {
                        cmElement.CodeMirror.on('change', () => {
                            markAsChanged();
                        });
                    }
                }, 1000);
                break;

            case 'contenteditable':
                editorElement.on('DOMSubtreeModified', function() {
                    markAsChanged();
                });
                // Modern browsers
                if (window.MutationObserver) {
                    const observer = new MutationObserver(() => {
                        markAsChanged();
                    });
                    observer.observe(editorElement[0], {
                        childList: true,
                        subtree: true,
                        characterData: true
                    });
                }
                break;
        }

        // Also watch for changes in form elements within the same form
        const form = editorElement.closest('form');
        if (form.length) {
            form.find('input, select, textarea').not(editorElement).on('change input', function() {
                markAsChanged();
            });
        }
    }

    // Set up change detection specifically for slate editor
    function setupSlateChangeDetection() {
        // Watch for DOM changes within the grid
        if (window.MutationObserver) {
            const observer = new MutationObserver((mutations) => {
                if (!isSaving) {
                    // Check if any meaningful changes occurred
                    const hasSignificantChange = mutations.some(mutation => {
                        // Ignore attribute changes that don't affect content
                        if (mutation.type === 'attributes') {
                            const ignoredAttributes = [
                                'class', 'style', 'data-bs-original-title', 'data-bs-placement',
                                'aria-describedby', 'title', 'data-original-title', 'data-toggle',
                                'data-bs-toggle', 'aria-expanded', 'aria-selected', 'tabindex',
                                'data-sortable-item', 'data-sortable-handle', 'draggable'
                            ];
                            return !ignoredAttributes.includes(mutation.attributeName);
                        }
                        
                        // Ignore changes to elements that are UI-only (tooltips, dropdowns, etc.)
                        if (mutation.target) {
                            const target = $(mutation.target);
                            if (target.closest('.dropdown-menu, .tooltip, .popover, .modal').length) {
                                return false;
                            }
                            
                            // Ignore changes to empty text nodes or whitespace-only changes
                            if (mutation.type === 'characterData') {
                                const newValue = mutation.target.textContent || '';
                                const oldValue = mutation.oldValue || '';
                                // Only consider it a change if non-whitespace content changed
                                return newValue.trim() !== oldValue.trim();
                            }
                        }
                        
                        return true;
                    });
                    
                    if (hasSignificantChange) {
                        // Add a small delay to avoid detecting temporary DOM changes
                        setTimeout(() => {
                            if (!isSaving) {
                                markAsChanged();
                            }
                        }, 100);
                    }
                }
            });
            
            observer.observe(editorElement[0], {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeOldValue: true
            });
        }

        // Watch for form changes within the grid (be more specific)
        editorElement.on('input change', 'input:not([type="hidden"]), textarea, select', function() {
            if (!isSaving) {
                // Only mark as changed if the value actually differs from initial state
                const element = $(this);
                const currentValue = element.val();
                const initialValue = element.data('initial-value');
                
                if (initialValue === undefined) {
                    // Store initial value on first interaction
                    element.data('initial-value', currentValue);
                } else if (currentValue !== initialValue) {
                    markAsChanged();
                }
            }
        });

        // Watch for drag and drop operations (with debouncing)
        let dragTimeout;
        editorElement.on('dragend drop', function() {
            clearTimeout(dragTimeout);
            dragTimeout = setTimeout(() => {
                if (!isSaving) {
                    const currentContent = getCurrentContent();
                    if (currentContent !== originalContent) {
                        markAsChanged();
                    }
                }
            }, 300);
        });

        // Watch for clicks on action buttons that might modify content
        editorElement.on('click', 'button:not(.btn-outline-secondary):not([data-bs-toggle]), .btn:not(.btn-outline-secondary):not([data-bs-toggle])', function(e) {
            const element = $(this);
            
            // Skip if it's the save button, navigation elements, or UI-only buttons
            if (element.is('#save') || 
                element.closest('.dropdown, .modal, .tooltip, .popover').length ||
                element.attr('data-bs-toggle') || 
                element.attr('data-bs-target') ||
                element.hasClass('btn-outline-secondary')) {
                return;
            }
            
            // Only check for changes if the button likely modifies content
            const buttonText = element.text().toLowerCase();
            const modifyingActions = ['add', 'remove', 'delete', 'edit', 'update', 'save', 'create'];
            const isModifyingButton = modifyingActions.some(action => buttonText.includes(action));
            
            if (isModifyingButton) {
                setTimeout(() => {
                    if (!isSaving) {
                        const currentContent = getCurrentContent();
                        if (currentContent !== originalContent) {
                            markAsChanged();
                        }
                    }
                }, 200);
            }
        });

        // Watch for content added/removed via your add content buttons
        $(document).on('click', '.gridaddcontent, [onclick*="add_text"], [onclick*="add_selected_content"]', function() {
            // Only mark as changed after verifying content actually changed
            setTimeout(() => {
                if (!isSaving) {
                    const currentContent = getCurrentContent();
                    if (currentContent !== originalContent) {
                        markAsChanged();
                    }
                }
            }, 1000); // Longer delay to ensure content is fully loaded
        });

        // Store initial values for form elements to compare against later
        setTimeout(() => {
            editorElement.find('input:not([type="hidden"]), textarea, select').each(function() {
                const element = $(this);
                element.data('initial-value', element.val());
            });
        }, 500);
    }

    // Function to mark content as changed
    function markAsChanged() {
        if (!isSaving && initialized) {
            // Double-check that content actually changed before marking
            const currentContent = getCurrentContent();
            if (currentContent !== originalContent) {
                hasUnsavedChanges = true;
                console.log('Content marked as changed');
            }
        }
    }

    // Function to mark content as saved
    function markAsSaved() {
        hasUnsavedChanges = false;
        isSaving = false;
        originalContent = getCurrentContent();
        console.log('Content marked as saved');
    }

    // Function to show unsaved changes dialog
    function showUnsavedChangesDialog() {
        return new Promise((resolve) => {
            const modal = $('#unsaved-changes-modal');
            
            if (modal.length === 0) {
                console.error('Modal not found. Please include saving_prompt_template.html');
                resolve('cancel');
                return;
            }
            
            // Remove any existing event handlers to prevent duplicates
            modal.off('click.unsaved');
            modal.off('hidden.bs.modal.unsaved');
            
            // Handle save and continue
            modal.on('click.unsaved', '#save-and-continue', () => {
                saveContent().then(() => {
                    modal.modal('hide');
                    resolve('save');
                }).catch(() => {
                    resolve('cancel');
                });
            });
            
            // Handle discard changes
            modal.on('click.unsaved', '#discard-changes', () => {
                modal.modal('hide');
                resolve('discard');
            });
            
            // Handle cancel/close
            modal.on('hidden.bs.modal.unsaved', () => {
                resolve('cancel');
            });
            
            modal.modal('show');
        });
    }

    // Function to save content
    function saveContent() {
        return new Promise((resolve, reject) => {
            if (!saveButtonElement) {
                reject('Save button not found');
                return;
            }

            isSaving = true;
            hasUnsavedChanges = false;

            if (editorType === 'slate') {
                const onClickAttr = saveButtonElement.attr('onClick');
                if (onClickAttr) {
                    try {
                        // Execute the onClick function
                        eval(onClickAttr);
                        console.log('Executed save function:', onClickAttr);
                    } catch (e) {
                        console.error('Error executing save function:', e);
                        reject('Error executing save function');
                        return;
                    }
                }
            } else {
                // For other editors, trigger the save button click
                saveButtonElement.trigger('click');
            }
            
            setTimeout(() => {
                markAsSaved();
                resolve();
            }, 500);
        });
    }

    // Function to handle navigation attempts
    function handleNavigation(callback) {
        if (hasUnsavedChanges) {
            showUnsavedChangesDialog().then((action) => {
                if (action === 'save') {
                    callback(true);
                } else if (action === 'discard') {
                    hasUnsavedChanges = false;
                    callback(true);
                } else {
                    callback(false);
                }
            });
        } else {
            callback(true);
        }
    }

    // Initialize when DOM is ready
    $(document).ready(function() {
        initializeFromDataAttributes();
        
        if (!initialized) {
            return;
        }

        console.log('Unsaved changes handler initialized for:', editorType, 'editor');

        // Store original content after a slight delay to ensure everything is loaded
        setTimeout(() => {
            originalContent = getCurrentContent();
            console.log('Original content stored');
            
            // Also store initial form values after content is loaded
            if (editorType === 'slate') {
                editorElement.find('input:not([type="hidden"]), textarea, select').each(function() {
                    const element = $(this);
                    element.data('initial-value', element.val());
                });
            }
        }, 2000);

        // Set up change detection
        setupChangeDetection();

        // Handle save button click
        saveButtonElement.on('click', function (e) {
            // Mark as saving immediately to prevent change detection
            isSaving = true;
            hasUnsavedChanges = false;
            console.log('Save button clicked');
            
            // Let the original save logic run, but mark as saved afterward
            setTimeout(() => {
                markAsSaved();
            }, 1000);
        });

        // Handle beforeunload event (browser navigation, refresh, close)
        $(window).on('beforeunload', function (e) {
            if (hasUnsavedChanges && !isSaving) {
                const message = 'You have unsaved changes. Are you sure you want to leave?';
                e.originalEvent.returnValue = message;
                return message;
            }
        });

        // Override link clicks to check for unsaved changes
        $(document).on('click', 'a[href]:not([href="#"]):not([href^="javascript:"]):not([target="_blank"])', function(e) {
            if (hasUnsavedChanges) {
                e.preventDefault();
                const href = this.href;
                handleNavigation((proceed) => {
                    if (proceed) {
                        window.location.href = href;
                    }
                });
            }
        });

        // Handle popstate event (back/forward buttons)
        $(window).on('popstate', function (e) {
            if (hasUnsavedChanges) {
                e.preventDefault();
                handleNavigation((proceed) => {
                    if (proceed) {
                        history.go(-1);
                    }
                });
            }
        });

        // Handle form submissions to check for unsaved changes
        $('form').on('submit', function(e) {
            if (hasUnsavedChanges && !isSaving) {
                e.preventDefault();
                const form = this;
                handleNavigation((proceed) => {
                    if (proceed) {
                        $(form).off('submit').submit();
                    }
                });
            }
        });
    });
})();