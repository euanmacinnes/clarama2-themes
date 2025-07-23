/**
 * Clarama Cell Interactions JS - Functions for handling user interactions with cells
 * @fileoverview This file provides functions to handle various interactions with cells
 * in the Clarama interface, including running cells, toggling the cell debugger, 
 * inserting and deleting steps, copy and pasting cells, clearing the outputs of the cells,
 * setting output types, and navigating between cells.
 */

/**
 * Starting ID for new steps
 * @type {number}
 */
var new_step_id = 100000000;

let currentCellResults = null;
let currentContextCell = null;
window.copiedCellData = null;

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
    parent.find(".celleditdebug").off('click.debug');
    parent.find(".celleditdebug").on("click.debug", function () {
        var debugButton = $(this);
        var cellItem = debugButton.closest('.clarama-cell-item');
        
        var taskIndex = debugButton.attr('data-task-index') || 
                       cellItem.attr('step') || 
                       cellItem.attr('data-task-index');
        
        var rightContent = cellItem.find('#right_content_' + taskIndex);
        var isThisDebuggerOpen = !rightContent.hasClass('d-none');

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

/**
 * Extract content from different cell types
 * @param {jQuery} cell - The cell element to extract content from
 * @returns {Object} - The extracted cell content
 */
function extractCellContent(cell) {
    const cellType = cell.attr('steptype');
    const taskIndex = cell.attr('step');
    const targetCell = cell.find('.left-content').find('.clarama-cell-content');
    let content = {};
    
    console.log('Extracting content for cell type:', cellType, 'task index:', taskIndex);
    
    switch(cellType) {
        case 'shell':
            content = get_shell_cell(targetCell);
            break;    

        case 'code':
            content = get_code_cell(targetCell);
            break;
            
        case 'markdown':
            content = get_text_cell(targetCell);
            break;
        
        case 'notification':
            content = get_notification_cell(targetCell);
            break;
                                
        case 'source':
            content = get_source_cell(targetCell);
            break;

        case 'task':
            content = get_source_cell(targetCell);
            content.type = 'task';
            break;
            
        case 'url':
            content = get_url_cell(targetCell);
            break;
            
        case 'data':
            content = get_data_cell(targetCell);
            break;                    
            
        default:
            console.warn('Unknown cell type:', cellType);
            flash('could not copy cell', 'danger');
    }
    
    console.log('content: ', content);
    return content;
}

/**
 * Initialize context menu event handlers
 */
function initializeCellCopyPaste() {
    // Hide both context menus initially
    $('#panel-context-menu').hide();
    $('#output-context-menu').hide();

    $('#output-context-menu').children()[0].onclick = clearCellOutput;
    $('#panel-context-menu').children()[0].onclick = taskCellCopy;
    $('#panel-context-menu').children()[1].onclick = taskCellPaste;

    // Right-click event on cell results
    $('[id^="results_"]').on('contextmenu', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        currentCellResults = $(this);
        $('#panel-context-menu').hide();
        
        let mouseX = e.clientX;
        let mouseY = e.clientY;
        
        const $contextMenu = $('#output-context-menu');
        
        $contextMenu.css({
            display: 'block',
            position: 'fixed', 
            left: mouseX + 'px',
            top: mouseY + 'px',
            zIndex: 1000
        });
        
        return false;
    });
    
    // Right-click event on panel
    $('.panel').on('contextmenu', function(e) {
        e.preventDefault();
        e.stopPropagation(); 

        currentContextCell = $(this).closest('.clarama-cell-item');
        $('#output-context-menu').hide();
        
        let mouseX = e.clientX;
        let mouseY = e.clientY;
        
        const $contextMenu = $('#panel-context-menu');
        
        $contextMenu.css({
            display: 'block',
            position: 'fixed', 
            left: mouseX + 'px',
            top: mouseY + 'px',
            zIndex: 1000
        });
        
        return false;
    });
    
    // Hide context menus when clicking elsewhere
    $(document).on('click', function(e) {
        if (!$(e.target).closest('#panel-context-menu, #output-context-menu').length) {
            $('#panel-context-menu').hide();
            $('#output-context-menu').hide();
        }
    });

    $(document).on('contextmenu', function(e) {
        if (!$(e.target).closest('.panel, .cell-editor, [id^="results_"]').length) {
            $('#panel-context-menu').hide();
            $('#output-context-menu').hide();
        }
    });
    
    $(window).on('scroll', function() {
        $('#panel-context-menu').hide();
        $('#output-context-menu').hide();
    });
}

/**
 * Clear the output of a cell
 */
function clearCellOutput() {
    $('#output-context-menu').hide();
    
    if (currentCellResults) {
        const cellOffset = currentCellResults.offset();
        const windowScrollTop = $(window).scrollTop();
        
        currentCellResults.empty();
        
        requestAnimationFrame(() => {
            $(window).scrollTop(windowScrollTop);
        });
        
        currentCellResults = null; 
    }
}

/**
 * Copy a cell's content to the clipboard buffer
 */
function taskCellCopy() {
    $('#panel-context-menu').hide();
    
    if (!currentContextCell) {
        console.warn('No cell selected for copy operation');
        return;
    }
    
    try {
        const windowScrollTop = $(window).scrollTop();
        const stepType = currentContextCell.attr('steptype');
        const cellContent = extractCellContent(currentContextCell);
        
        window.copiedCellData = {
            stepType: stepType,
            cellContent: cellContent,
        };
        
        console.log('Copied cell data:', window.copiedCellData);
        flash('Cell copied successfully', 'success');
        
        requestAnimationFrame(() => {
            $(window).scrollTop(windowScrollTop);
        });
        
    } catch (error) {
        console.error('Error copying cell:', error);
        flash('Failed to copy cell.', 'danger');
        
        requestAnimationFrame(() => {
            $(window).scrollTop(windowScrollTop);
        });
    }
}

/**
 * Paste a previously copied cell
 */
function taskCellPaste() {
    $('#panel-context-menu').hide();

    if (!window.copiedCellData) {
        console.warn('No cell data to paste');
        flash('No cell to paste. Please copy a cell first.', 'danger');
        return;
    }
    
    if (!currentContextCell) {
        console.warn('No target cell selected for paste');
        return;
    }
    
    try {
        const windowScrollTop = $(window).scrollTop();
        const targetStream = currentContextCell.closest('.stream');
        const targetStreamId = targetStream.attr('stream');
        const targetStreamFile = targetStream.attr('stream-file');
        
        new_step_id = new_step_id + 1;
        const newStepUrl = '/step/' + targetStreamId + '/' + window.copiedCellData.stepType + '/' + new_step_id + '/' + targetStreamFile + '/';
        
        get_html(newStepUrl, function(new_step) {
            const windowScrollTop = $(window).scrollTop();
            const $new_element = $(new_step);

            currentContextCell.after($new_element);

            sortUpdate(targetStream);
            initializeNewCellDebugger($new_element);

            if (window.copiedCellData.loopIterable) {
                const loopInput = $new_element.find('.loop-iterable');
                if (loopInput.length) {
                    loopInput.val(window.copiedCellData.loopIterable);
                    toggle_loop(loopInput);
                }
            }

            const embeddedElement = $new_element.find('.clarama-post-embedded');
            if (embeddedElement.length > 0) {
                const jsonContent = JSON.stringify(window.copiedCellData.cellContent);
                embeddedElement.attr('json', jsonContent);
                embeddedElement.attr("clarama_loaded", "false");
                embeddedElement.attr("autorun", "true");
                
                embeddedElement.load_post(function() {
                    flash('Cell pasted successfully', 'success');
                    enable_interactions($new_element);
                });
            } else {
                flash('Cell created but content could not be loaded', 'danger');
            }
        });

        requestAnimationFrame(() => {
            $(window).scrollTop(windowScrollTop);
        });

    } catch (error) {
        console.error('Error pasting cell:', error);
        flash('Failed to paste cell. Please try again.', 'danger');
        
        requestAnimationFrame(() => {
            $(window).scrollTop(windowScrollTop);
        });
    }
}
