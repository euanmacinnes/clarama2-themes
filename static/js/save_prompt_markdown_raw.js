(function() {
    'use strict';
    
    let hasUnsavedChanges = false;
    let originalContent = '';
    let isSaving = false;
    let editorElement = null;
    let saveButtonElement = null;
    let editorType = 'textarea';
    let initialized = false;

    // Configuration
    function initializeFromDataAttributes() {
        const configElement = $('[data-editor-id]').first();
        if (configElement.length === 0) {
            autoDetectConfiguration();
            return;
        }

        const editorId = configElement.data('editor-id');
        const saveButtonId = configElement.data('save-button-id');
        editorType = configElement.data('editor-type') || 'textarea';

        editorElement = $('#' + editorId);
        saveButtonElement = $('#' + saveButtonId);

        if (editorElement.length === 0 || saveButtonElement.length === 0) {
            console.warn('Unsaved changes handler: Could not find editor or save button elements');
            return;
        }

        initialized = true;
    }

    // Auto-detect configuration for backward compatibility
    function autoDetectConfiguration() {
        // Try to detect markdown editor
        if ($('#markdown').length && $('#markdown_save').length) {
            editorElement = $('#markdown');
            saveButtonElement = $('#markdown_save');
            editorType = 'trumbowyg';
            initialized = true;
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
                return;
            }
        }

        console.warn('Unsaved changes handler: Could not auto-detect editor configuration');
    }

    // Get current content based on editor type
    function getCurrentContent() {
        if (!editorElement) return '';

        switch (editorType) {
            case 'trumbowyg':
                return editorElement.trumbowyg('html');
            case 'monaco':
                // Handle Monaco Editor
                if (window.monaco) {
                    const editor = window.monaco.editor.getEditors().find(e => 
                        e.getDomNode().closest('#' + editorElement.attr('id'))
                    );
                    if (editor) return editor.getValue();
                }
                break;
            case 'codemirror':
                // Handle CodeMirror
                const cmElement = editorElement.find('.CodeMirror')[0];
                if (cmElement && cmElement.CodeMirror) {
                    return cmElement.CodeMirror.getValue();
                }
                break;
            default:
                return editorElement.val() || editorElement.text();
        }
        return editorElement.val() || editorElement.text();
    }

    function setupChangeDetection() {
        if (!editorElement) return;

        editorElement.on('input change keyup paste blur', function() {
            markAsChanged();
        });

        switch (editorType) {
            case 'trumbowyg':
                editorElement.on('tbwchange', function() {
                    markAsChanged();
                });
                break;

            case 'monaco':
                if (window.monaco) {
                    setTimeout(() => {
                        const editor = window.monaco.editor.getEditors().find(e => 
                            e.getDomNode().closest('#' + editorElement.attr('id'))
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
                    const cmElement = editorElement.find('.CodeMirror')[0];
                    if (cmElement && cmElement.CodeMirror) {
                        cmElement.CodeMirror.on('change', () => {
                            markAsChanged();
                        });
                    }
                }, 1000);
                break;
        }
    }

    function markAsChanged() {
        if (!isSaving && initialized) {
            hasUnsavedChanges = true;
        }
    }

    // Function to mark content as saved
    function markAsSaved() {
        hasUnsavedChanges = false;
        isSaving = false;
        originalContent = getCurrentContent();
    }

    // Function to show unsaved changes dialog
    function showUnsavedChangesDialog() {
        return new Promise((resolve) => {
            const modal = $('#unsaved-changes-modal');
            
            if (modal.length === 0) {
                console.error('Unsaved changes handler: Modal not found. Please include saving_prompt_template.html');
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
            console.log('save');

            saveButtonElement.trigger('click');
            
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

    $(document).ready(function() {
        initializeFromDataAttributes();
        
        if (!initialized) {
            return;
        }

        // Store original content
        setTimeout(() => {
            originalContent = getCurrentContent();
        }, 100);

        // Set up change detection
        setupChangeDetection();

        // Handle save button click
        saveButtonElement.on('click', function (e) {
            // Mark as saving immediately to prevent change detection
            isSaving = true;
            hasUnsavedChanges = false;
            
            // Let the original save logic run, but mark as saved afterward
            setTimeout(() => {
                markAsSaved();
            }, 100);
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