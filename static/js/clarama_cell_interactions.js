/**
 * Clarama Cell Interactions JS - Functions for handling user interactions with cells
 * @fileoverview This file provides functions to handle various interactions with cells
 * in the Clarama interface, including running cells, inserting and deleting steps,
 * setting output types, and navigating between cells.
 */

/**
 * Starting ID for new steps
 * @type {number}
 */
var new_step_id = 100000000;

/**
 * Closes all currently open debuggers
 * @description Finds all open debuggers and closes them
 */
function closeAllDebuggers() {
    // Find all cells that have debuggers (both static and dynamic)
    $('[id^="debugger_"]').each(function() {
        var debuggerDiv = $(this);
        var debuggerId = debuggerDiv.attr('id');
        var taskIndex = debuggerId.replace('debugger_', '');
        
        console.log("closeAllDebuggers: Processing debugger for task", taskIndex);
        
        // Find the parent cell - try multiple selectors to catch dynamically added cells
        var cellItem = debuggerDiv.closest('.clarama-cell-item');
        if (!cellItem.length) {
            // Fallback: try to find by step attribute
            cellItem = $(`li.clarama-cell-item[step="${taskIndex}"]`);
        }
        if (!cellItem.length) {
            // Another fallback: try to find by data-task-index
            cellItem = $(`li.clarama-cell-item[data-task-index="${taskIndex}"]`);
        }
        
        if (!cellItem.length) {
            console.warn("Could not find cell item for debugger", taskIndex);
            return;
        }
        
        var leftContent = cellItem.find(`#left_content_${taskIndex}`);
        var rightContent = cellItem.find(`#right_content_${taskIndex}`);
        var debugButton = cellItem.find('.celleditdebug');
        
        // Only process if the debugger is currently open
        if (rightContent.length > 0 && !rightContent.hasClass('d-none')) {
            leftContent.removeClass('col-6').addClass('col-6');
            rightContent.addClass('d-none');
            
            debugButton.removeClass('btn-warning');
            debugButton.attr('title', 'Debug (Ctrl-\\)');
            
            var isNotificationCell = cellItem.find('.clarama-cell-content[celltype="notification"]').length > 0;
            if (isNotificationCell) {
                var notificationContents = cellItem.find('.clarama-cell-content[celltype="notification"] .alert-secondary > div');
                if (notificationContents && notificationContents.length > 0) {
                    notificationContents.removeClass('d-flex flex-column');
                    notificationContents.addClass('row');
                }
            }
            
            // Clean up any debugger-specific callbacks
            if (window[`cell_debugger_variables_callback_${taskIndex}`]) {
                window[`cell_debugger_variables_callback_${taskIndex}`] = null;
            }
            if (window[`cell_debugger_callback_${taskIndex}`]) {
                window[`cell_debugger_callback_${taskIndex}`] = null;
            }
        }
    });
}

/**
 * Sets up click handlers for running cells
 * @param {jQuery} parent - jQuery object representing the parent container
 * @description Attaches click event handlers to run buttons within cells
 */
function cell_edit_run(parent) {
    parent.find(".celleditrun").click(function () {
        var cell_button = $(this).closest('.clarama-cell-item');
        var taskIndex = cell_button.attr('step');
        var hasDebuggerOpen = !cell_button.find('#right_content_' + taskIndex).hasClass('d-none');
        console.log(cell_button);
        cell_item_run(cell_button);
        
        if (hasDebuggerOpen) {
            closeAllDebuggers();
            
            setTimeout(function() {
                var currentStep = parseInt(taskIndex);
                if (!isNaN(currentStep)) {
                    var nextCell = $("li.clarama-cell-item[step='" + (currentStep + 1) + "']");
                    if (nextCell.length) {
                        var nextTaskIndex = nextCell.attr('step');
                        if (nextCell.find('.celleditdebug').length > 0) {
                            openDebugger(nextCell, nextTaskIndex);
                        }
                        
                        // Focus on the next cell's editor
                        var nextEditorDiv = nextCell.find(".ace_editor").eq(0);
                        if (nextEditorDiv.length) {
                            var editor = nextEditorDiv.get(0).env.editor;
                            editor.focus();
                            editor.gotoLine(editor.session.getLength() + 1, 0);
                        }
                    }
                }
            }, 100);
        }
    });
}

/**
 * Initialize debugger for new cells
 * @param {jQuery} newElement - The newly created cell element
 */
function initializeNewCellDebugger(newElement) {
    enable_interactions(newElement);
    cell_toggle_debug_view(newElement);
    
    var taskIndex = newElement.attr('step') || newElement.attr('data-task-index');
    
    if (taskIndex) {
        setupConsoleHandlers(newElement, taskIndex);
        
        var debugButton = newElement.find('.celleditdebug');
        if (debugButton.length) {
            debugButton.attr('data-task-index', taskIndex);
        }
        
        var consoleInput = newElement.find('.console-input');
        if (consoleInput.length) {
            consoleInput.attr('data-task-index', taskIndex);
        }
        
        var executeButton = newElement.find('.execute-console');
        if (executeButton.length) {
            executeButton.attr('data-task-index', taskIndex);
        }
    }
}

/**
 * Set up console handlers for a specific cell
 * @param {jQuery} cellElement - The cell element
 * @param {string} taskIndex - The task index
 */
function setupConsoleHandlers(cellElement, taskIndex) {
    var consoleInput = cellElement.find('.console-input');
    var executeButton = cellElement.find('.execute-console');
    
    if (consoleInput.length) {
        consoleInput.off('keypress.console');
        
        // Handle Enter key in console input
        consoleInput.on('keypress.console', function(e) {
            if (e.which == 13) { // Enter key
                const currentCell = $(this).closest('.clarama-cell-item');
                const currentTaskIdx = currentCell.attr('step') || currentCell.attr('data-task-index');
                debug_console_run(currentTaskIdx);
            }
        });
        
        consoleInput.attr('data-task-index', taskIndex);
    }
    
    if (executeButton.length) {
        executeButton.off('click.console');
        
        executeButton.on('click.console', function() {
            const currentCell = $(this).closest('.clarama-cell-item');
            const currentTaskIdx = currentCell.attr('step') || currentCell.attr('data-task-index');
            console.log(`Console Execute clicked: using current task index ${currentTaskIdx}`);
            debug_console_run(currentTaskIdx);
        });
        
        executeButton.attr('data-task-index', taskIndex);
    }
}

/**
 * Sets up handlers for inserting new steps
 * @param {jQuery} parent - jQuery object representing the parent container
 * @description Attaches click event handlers to insert step buttons, handling both
 * new cell creation and insertion of steps before or after existing cells
 */
function cell_insert_step(parent) {
    parent.find(".insert_step").off('click');
    parent.find(".insert_step").on("click", function (event) {
        if ($(this).attr('stream') !== undefined) {
            console.log('cell_insert_step: append new cell at end of stream');
            var steptype = $(this).attr('steptype');
            var stream = $(this).attr('stream');

            var step_stream = $("#stream_" + stream);
            console.log(step_stream);
            var step_stream_file = step_stream.attr('stream-file');

            new_step_id = new_step_id + 1;

            get_html('/step/stream/' + steptype + '/' + new_step_id + '/' + step_stream_file + '/',
                function (new_step) {
                    var $new_element = $(new_step);

                    console.log(step_stream);
                    step_stream.append($new_element);

                    sortUpdate(step_stream);
                    initializeNewCellDebugger($new_element);
                });
        } else {
            console.log('cell_insert_step: insert above existing cell');
            var step_cell = $(this).parents('.clarama-cell-item');
            var step = step_cell.attr('step');
            var steptype = $(this).attr('steptype');

            var step_stream = step_cell.parents(".stream");
            var step_stream_id = step_stream.attr('stream');
            var step_stream_file = step_stream.attr('stream-file');

            var insert_step = step_stream.find("li.clarama-cell-item")[step - 1];

            console.log('cell_insert_step:' + step_cell.attr("id") + '=' + step_stream_id + '@' + step + ' from file ' + step_stream_file);

            var after = false;
            if (event.shiftKey) {
                after = true;
            }

            new_step_id = new_step_id + 1;

            get_html('/step/' + step_stream.attr('stream') + '/' + steptype + '/' + new_step_id + '/' + step_stream_file + '/',
                function (new_step) {
                    var $new_element = $(new_step);

                    if (after) {
                        console.log("appending new step at end of " + step_stream.attr('stream'));
                        $(insert_step).after($new_element);
                    } else {
                        console.log("inserting new step before step " + step);
                        $(insert_step).before($new_element);
                    }

                    sortUpdate(step_stream);
                    initializeNewCellDebugger($new_element);
                });
        }
    });
}

/**
 * Opens debugger for a specific cell
 * @param {jQuery} cellItem - The cell item to open debugger for
 * @param {string} taskIndex - The task index of the cell
 */
function openDebugger(cellItem, taskIndex) {
    closeAllDebuggers();
    
    var leftContent = cellItem.find('#left_content_' + taskIndex);
    var rightContent = cellItem.find('#right_content_' + taskIndex);
    var debugButton = cellItem.find('.celleditdebug');
    var isNotificationCell = cellItem.find('.clarama-cell-content[celltype="notification"]').length > 0;
    var notificationContents = null;

    if (isNotificationCell) {
        notificationContents = cellItem.find('.clarama-cell-content[celltype="notification"] .alert-secondary > div');
    }
    
    leftContent.removeClass('col-6').addClass('col-6');
    rightContent.removeClass('d-none');
    
    debugButton.addClass('btn-warning');
    debugButton.attr('title', 'Hide Debug (Ctrl-\\)');

    if (isNotificationCell && notificationContents && notificationContents.length > 0) {
        notificationContents.removeClass('row');
        notificationContents.addClass('d-flex flex-column');
    }

    setupConsoleHandlers(cellItem, taskIndex);

    cell_debugger_run(cellItem, function(output_text) {
        var taskIndex = cellItem.attr('step') || cellItem.attr('data-task-index');
        populateVariablesList(output_text, taskIndex);
    });
}

/**
 * Sets up handlers for deleting steps
 * @param {jQuery} parent - jQuery object representing the parent container
 * @description Attaches click event handlers to delete step buttons and
 * updates the step ordering after deletion
 */
function cell_delete_step(parent) {
    parent.find(".delete_step").off('click');
    parent.find(".delete_step").on("click", function () {
        var step_type = $(this);
        var step_parent = step_type.parents(".clarama-cell-item");
        var taskIndex = step_parent.attr('step') || step_parent.attr('data-task-index');
        
        if (taskIndex) {
            if (window[`cell_debugger_variables_callback_${taskIndex}`]) {
                window[`cell_debugger_variables_callback_${taskIndex}`] = null;
            }
            if (window[`cell_debugger_callback_${taskIndex}`]) {
                window[`cell_debugger_callback_${taskIndex}`] = null;
            }
        }

        var step_stream = step_parent.parents(".stream");
        step_parent.remove();
        sortUpdate(step_stream);
        closeAllDebuggers();
    });
}

/**
 * Sets up handlers for toggling debug view
 * @param {jQuery} parent - jQuery object representing the parent container
 * @description Attaches click event handlers to debug buttons and toggles
 * the visibility of the debug panel (right content area). Only one debugger
 * can be open at a time.
 */
function cell_toggle_debug_view(parent) {
    parent.find(".celleditdebug").off('click.debug'); // Use namespaced event
    parent.find(".celleditdebug").on("click.debug", function () {
        var debugButton = $(this);
        var cellItem = debugButton.closest('.clarama-cell-item');
        
        // Get task index from multiple possible sources
        var taskIndex = debugButton.attr('data-task-index') || 
                       cellItem.attr('step') || 
                       cellItem.attr('data-task-index');
        
        var rightContent = cellItem.find('#right_content_' + taskIndex);
        
        // Check if THIS cell's debugger is currently open
        var isThisDebuggerOpen = !rightContent.hasClass('d-none');
        
        console.log("Is this debugger open?", isThisDebuggerOpen);
        
        if (isThisDebuggerOpen) {
            closeAllDebuggers();
        } else {
            openDebugger(cellItem, taskIndex);
        }
    });
}

/**
 * Sets the output type for a data cell
 * @param {string} id_template - Base ID for the data cell elements
 * @param {string} value - Output type ('table', 'chart', or 'code')
 * @param {string} Options - ID suffix for the options accordion
 * @description Updates button states and visibility of options based on the selected output type
 */
function datacell_setOutput(id_template, value, Options) {
    $('#' + id_template + '_output').attr('value', value);

    console.log(id_template);
    console.log(value);

    if ((value == undefined) || (value == ''))
        value = 'table';

    if (value == 'table') {
        $('#' + id_template + '_table').removeClass('btn-secondary');
        $('#' + id_template + '_table').addClass('btn-primary');

        $('#' + id_template + '_chart').removeClass('btn-primary');
        $('#' + id_template + '_chart').addClass('btn-secondary');
        $('#' + id_template + '_code').removeClass('btn-primary');
        $('#' + id_template + '_code').addClass('btn-secondary');
    } else if (value == 'chart') {
        $('#' + id_template + '_code').addClass('btn-secondary');
        $('#' + id_template + '_code').removeClass('btn-primary');
        $('#' + id_template + '_table').addClass('btn-secondary');
        $('#' + id_template + '_table').removeClass('btn-primary');


        $('#' + id_template + '_chart').addClass('btn-primary');
        $('#' + id_template + '_chart').removeClass('btn-secondary');
    } else {
        $('#' + id_template + '_code').addClass('btn-primary');
        $('#' + id_template + '_code').removeClass('btn-secondary');

        $('#' + id_template + '_table').addClass('btn-secondary');
        $('#' + id_template + '_table').removeClass('btn-primary');
        $('#' + id_template + '_chart').addClass('btn-secondary');
        $('#' + id_template + '_chart').removeClass('btn-primary');
    }

    if (value === 'table' || value === 'code') {
        // Close the accordion if 'table' or 'code' button is clicked
        let accordion = document.getElementById('collapseOptions_' + Options);
        let bsCollapse = new bootstrap.Collapse(accordion, {toggle: false});
        bsCollapse.hide();
    }

    if (value === 'chart' || value === 'code') {
        // Close the accordion if 'table' or 'code' button is clicked
        let accordion = document.getElementById('collapseTableOptions_' + Options);
        let bsCollapse = new bootstrap.Collapse(accordion, {toggle: false});
        bsCollapse.hide();
    }
}

/**
 * Moves focus to the next cell in sequence
 * @param {jQuery} currentButton - jQuery object representing the current cell's button
 * @description Finds the next cell based on step number and focuses its editor
 * at the end of the content
 */
function moveToNextCell(currentButton) {
    var currentStep = parseInt(currentButton.attr("step"));

    if (!isNaN(currentStep)) {
        var nextCell = $("li.clarama-cell-item[step='" + (currentStep + 1) + "']");

        if (nextCell.length) {
            var nextEditorDiv = nextCell.find(".ace_editor").eq(0);

            if (nextEditorDiv.length) {
                var editor = nextEditorDiv.get(0).env.editor;
                editor.focus();
                editor.gotoLine(editor.session.getLength() + 1, 0);
            }
        }
    }
}

