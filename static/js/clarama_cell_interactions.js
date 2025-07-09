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
    $('.clarama-cell-item').each(function() {
        var cellItem = $(this);
        var taskIndex = cellItem.attr('step') || cellItem.attr('data-task-index');
        
        if (!taskIndex) {
            return;
        }
        
        var leftContent = cellItem.find('#left_content_' + taskIndex);
        var rightContent = cellItem.find('#right_content_' + taskIndex);
        var debugButton = cellItem.find('.celleditdebug');
        
        console.log("closeAllDebuggers: Found elements for task", taskIndex, {
            leftContent: leftContent.length,
            rightContent: rightContent.length,
            debugButton: debugButton.length,
            isRightContentHidden: rightContent.hasClass('d-none')
        });
        
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
        }
    });
}

/**
 * Opens debugger for a specific cell
 * @param {jQuery} cellItem - The cell item to open debugger for
 * @param {string} taskIndex - The task index of the cell
 */
function openDebugger(cellItem, taskIndex) {
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

    cell_debugger_run(cellItem, function(output_text) {
        console.log("GOT locals keys output:", output_text);
        var taskIndex = cellItem.attr('step') || cellItem.attr('data-task-index');
        populateVariablesList(output_text, taskIndex);
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
 * Sets up handlers for inserting new steps
 * @param {jQuery} parent - jQuery object representing the parent container
 * @description Attaches click event handlers to insert step buttons, handling both
 * new cell creation and insertion of steps before or after existing cells
 */
function cell_insert_step(parent) {
    var cell_button = $(this).closest('.clarama-cell-item');

    parent.find(".insert_step").off('click');
    parent.find(".insert_step").on("click", function (event) {

        if ($(this).attr('stream') !== undefined) // Then hopefully it's the NEW CELL appending at the bottom. $(this) is the clicked button
        {
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
                    enable_interactions($new_element);
                });
        } else {
            console.log('cell_insert_step: insert above existing cell');
            var step_cell = $(this).parents('.clarama-cell-item'); // This should be the clarama-cell-item class, the li
            var step = step_cell.attr('step');
            var steptype = $(this).attr('steptype');

            var step_stream = step_cell.parents(".stream");
            var step_stream_id = step_stream.attr('stream');
            var step_stream_file = step_stream.attr('stream-file');

            var insert_step = step_stream.find("li.clarama-cell-item")[step - 1];


            console.log('cell_insert_step:' + step_cell.attr("id") + '=' + step_stream_id + '@' + step + ' from file ' + step_stream_file);


            var after = false;

            if (event.shiftKey) {
                after = true
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
                    enable_interactions($new_element);
                });
        }

        //alert("Insert " + step_type.attr("steptype") + ", stream " + step_parent.attr('stream') + " step " +  step_parent.attr('step'));

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

        var step_stream = step_parent.parents(".stream");

        step_parent.remove();

        sortUpdate(step_stream);
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
    parent.find(".celleditdebug").off('click');
    parent.find(".celleditdebug").on("click", function () {
        var debugButton = $(this);
        var cellItem = debugButton.closest('.clarama-cell-item');
        
        // Get task index from multiple possible sources
        var taskIndex = debugButton.attr('data-task-index') || 
                       cellItem.attr('step') || 
                       cellItem.attr('data-task-index');
        
        console.log("Debug button clicked for task:", taskIndex);
        
        var rightContent = cellItem.find('#right_content_' + taskIndex);
        
        // Check if THIS cell's debugger is currently open
        var isThisDebuggerOpen = !rightContent.hasClass('d-none');
        
        console.log("Is this debugger open?", isThisDebuggerOpen);
        
        if (isThisDebuggerOpen) {
            // If this debugger is open, just close all debuggers
            console.log("Closing all debuggers");
            closeAllDebuggers();
        } else {
            // If this debugger is closed, close all others and open this one
            console.log("Closing all debuggers and opening this one");
            closeAllDebuggers();
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

