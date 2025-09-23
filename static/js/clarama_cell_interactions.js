/**
 * Clarama Cell Interactions JS - Functions for handling user interactions with cells
 * @fileoverview This file provides functions to handle various interactions with cells
 * in the Clarama interface, including running cells, toggling the cell insights,
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
 * Closes all currently open insights
 * @description Finds all open insights and closes them
 */
function closeAllinsights() {
    $('[id^="insights_"]').each(function () {
        var insightsDiv = $(this);
        var taskIndex = insightsDiv.attr('id').replace('insights_', '');
        var cellItem = insightsDiv.closest('.clarama-cell-item');
        if (!cellItem.length) cellItem = $(`li.clarama-cell-item[step="${taskIndex}"]`);
        if (!cellItem.length) cellItem = $(`li.clarama-cell-item[data-task-index="${taskIndex}"]`);
        if (!cellItem.length) return;

        var rightContent = cellItem.find(`#right_content_${taskIndex}`);
        var oldBtn = cellItem.find('.celleditinsights');
        var bar = cellItem.find('.insights-toggle-bar');

        // Only process if the insights is currently open
        if (rightContent.length && !rightContent.hasClass('d-none')) {
            teardownDragDivider(cellItem);
            rightContent.addClass('d-none');

            if (oldBtn.length) {
                oldBtn.removeClass('btn-warning').attr('title', 'Insights (Ctrl-\\)');
            }

            if (bar.length) {
                bar.removeClass('open').attr('title', 'Insights (Ctrl-\\)');
                var headerBulb = cellItem.find(`#insight_bulb_${taskIndex}`);
                if (headerBulb.length) {
                    headerBulb
                        .removeClass('bi-lightbulb insight-bulb-glow')
                        .addClass('bi-lightbulb-off');
                }

                if (bar.length) {
                    const icon = bar.find('i');
                    if (icon.length) {
                        icon.removeClass('bi-lightbulb').addClass('bi-lightbulb-off');
                    }
                }
            }

            var isNotificationCell = cellItem.find('.clarama-cell-content[celltype="notification"]').length > 0;
            if (isNotificationCell) {
                var notificationContents = cellItem.find('.clarama-cell-content[celltype="notification"] .alert-secondary > div');
                if (notificationContents && notificationContents.length > 0) {
                    notificationContents.removeClass('d-flex flex-column');
                    notificationContents.addClass('row');
                }
            }

            // Clean up any insights-specific callbacks
            if (window[`cell_insights_variables_callback_${taskIndex}`]) {
                window[`cell_insights_variables_callback_${taskIndex}`] = null;
            }
            if (window[`cell_insights_callback_${taskIndex}`]) {
                window[`cell_insights_callback_${taskIndex}`] = null;
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
        var hasinsightsOpen = !cell_button.find('#right_content_' + taskIndex).hasClass('d-none');
        cell_item_run(cell_button);

        if (hasinsightsOpen) {
            closeAllinsights();

            setTimeout(function () {
                var currentStep = parseInt(taskIndex);
                if (!isNaN(currentStep)) {
                    var nextCell = $("li.clarama-cell-item[step='" + (currentStep + 1) + "']");
                    if (nextCell.length) {
                        var nextTaskIndex = nextCell.attr('step');
                        if (nextCell.find('.celleditinsights').length > 0) {
                            openInsights(nextCell, nextTaskIndex);
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
 * Initialize insights for new cells
 * @param {jQuery} newElement - The newly created cell element
 */
function initializeNewCellinsights(newElement) {
    enable_interactions(newElement);
    cell_toggle_insights_view(newElement);

    var taskIndex = newElement.attr('step') || newElement.attr('data-task-index');
    if (taskIndex) {
        newElement.find('.insights-toggle-bar').attr('data-task-index', taskIndex);

        var consoleInput = newElement.find('.console-input');
        if (consoleInput.length) consoleInput.attr('data-task-index', taskIndex);

        var executeButton = newElement.find('.execute-console');
        if (executeButton.length) executeButton.attr('data-task-index', taskIndex);
    }

    syncInsightsConsole(taskIndex);
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
                    initializeNewCellinsights($new_element);
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
                    initializeNewCellinsights($new_element);
                });
        }
    });
}

/**
 * Opens insights for a specific cell
 * @param {jQuery} cellItem - The cell item to open insights for
 * @param {string} taskIndex - The task index of the cell
 */
function openInsights(cellItem, taskIndex) {
    closeAllinsights();

    var leftContent = cellItem.find('#left_content_' + taskIndex);
    var rightContent = cellItem.find('#right_content_' + taskIndex);
    var oldBtn = cellItem.find('.celleditinsights');       // may or may not exist
    var bar = cellItem.find('.insights-toggle-bar');    // new vertical bar
    var isNotificationCell = cellItem.find('.clarama-cell-content[celltype="notification"]').length > 0;
    var notificationContents = null;

    if (isNotificationCell) {
        notificationContents = cellItem.find('.clarama-cell-content[celltype="notification"] .alert-secondary > div');
    }

    rightContent.removeClass('d-none');
    setupDragDivider(cellItem, taskIndex);
    syncInsightsConsole(taskIndex);

    // Visual states / titles
    if (oldBtn.length) {
        oldBtn.addClass('btn-warning').attr('title', 'Hide insights (Ctrl-\\)');
    }
    if (bar.length) {
        bar.addClass('open').attr('title', 'Hide insights (Ctrl-\\)');
        var headerBulb = cellItem.find(`#insight_bulb_${taskIndex}`);
        if (headerBulb.length) {
            headerBulb
                .removeClass('bi-lightbulb-off')
                .addClass('bi-lightbulb insight-bulb-glow');
        }

        // Vertical bar icon -> ON
        if (bar.length) {
            const icon = bar.find('i');
            if (icon.length) {
                icon.removeClass('bi-lightbulb-off').addClass('bi-lightbulb');
            }
        }
    }

    if (isNotificationCell && notificationContents && notificationContents.length > 0) {
        notificationContents.removeClass('row').addClass('d-flex flex-column');
    }

    cell_insights_variables_run(cellItem, function (output_text) {
        var idx = cellItem.attr('step') || cellItem.attr('data-task-index');
        populateVariablesList(output_text, idx);
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
            if (window[`cell_insights_variables_callback_${taskIndex}`]) {
                window[`cell_insights_variables_callback_${taskIndex}`] = null;
            }
            if (window[`cell_insights_callback_${taskIndex}`]) {
                window[`cell_insights_callback_${taskIndex}`] = null;
            }
        }

        var step_stream = step_parent.parents(".stream");
        step_parent.remove();
        sortUpdate(step_stream);
        closeAllinsights();
    });
}

/**
 * Sets up handlers for toggling insights view
 * @param {jQuery} parent - jQuery object representing the parent container
 * @description Attaches click event handlers to insights buttons and toggles
 * the visibility of the insights panel (right content area). Only one insights
 * can be open at a time.
 */
function cell_toggle_insights_view(parent) {
    parent.find(".celleditinsights, .insights-toggle-bar").off('click.insights');
    parent.find(".celleditinsights, .insights-toggle-bar").on("click.insights", function () {
        var insightsControl = $(this);
        var cellItem = insightsControl.closest('.clarama-cell-item');

        var taskIndex = insightsControl.attr('data-task-index') ||
            cellItem.attr('step') ||
            cellItem.attr('data-task-index');

        var rightContent = cellItem.find('#right_content_' + taskIndex);
        var isOpen = !rightContent.hasClass('d-none');

        if (isOpen) {
            closeAllinsights();
        } else {
            openInsights(cellItem, taskIndex);
        }
    });
}

/**
 * Set the CSS custom property that controls the split ratio.
 * The value is read by CSS to size left/right panes responsively.
 *
 * @param {HTMLElement} rowEl - The `.content-row` element.
 * @param {number} ratio - Ratio in [0, 1] for left pane width.
 * @returns {void}
 */
function setRatio(rowEl, ratio) {
    rowEl.style.setProperty('--split-ratio', String(ratio));
}

/**
 * Get the divider's visual width in pixels.
 * Falls back to 8px if the element has no measurable width yet.
 *
 * @param {HTMLElement} rowEl - The `.content-row` element (unused, reserved for symmetry).
 * @param {HTMLElement} [dividerEl] - The divider element.
 * @returns {number} Width in pixels.
 */
function getDividerWidth(rowEl, dividerEl) {
    return (dividerEl?.getBoundingClientRect().width) || 8;
}


function getBarWidth(rowEl) {
    const bar = rowEl.querySelector('.insights-toggle-bar');
    return bar ? bar.getBoundingClientRect().width : 0;
}


/**
 * Compute available horizontal space (in px) for the two panes combined,
 * i.e., the row width minus the divider width.
 *
 * @param {HTMLElement} rowEl - The `.content-row` element.
 * @param {HTMLElement} [dividerEl] - The divider element.
 * @returns {number} Available width in pixels (≥ 0).
 */
function getAvail(rowEl, dividerEl) {
    const rect = rowEl.getBoundingClientRect();
    return Math.max(0, rect.width - getDividerWidth(rowEl, dividerEl) - getBarWidth(rowEl));
}

/**
 * Apply a split ratio to a jQuery-wrapped row by setting its CSS var.
 *
 * @param {jQuery} row - jQuery object for the `.content-row` element.
 * @param {number} ratio - Ratio in [0, 1] for left pane width.
 * @returns {void}
 */
function applyRatio(row, ratio) {
    const rowEl = row[0];
    setRatio(rowEl, ratio);
}

/**
 * Initialize and enable the draggable divider for a cell.
 * - Ensures the right pane is visible and the row is marked as split.
 * - Creates the divider if missing and wires up mouse/touch/keyboard handlers.
 * - Enforces minimum pane widths (in px) via clamped ratio.
 * - Persists the ratio in localStorage (`cellSplitRatio_<taskIndex>`).
 * - Uses a ResizeObserver to keep the layout valid on container resize.
 *
 * @param {jQuery} cellItem - jQuery object for the cell `<li.clarama-cell-item>`.
 * @param {string|number} taskIndex - The cell's step index used for IDs and storage.
 * @returns {void}
 */
function setupDragDivider(cellItem, taskIndex) {
    const row = cellItem.find('.content-row');
    const left = cellItem.find('#left_content_' + taskIndex);
    const right = cellItem.find('#right_content_' + taskIndex);

    right.removeClass('d-none');
    row.addClass('split-active');

    let divider = row.find('.drag-divider');
    if (!divider.length) {
        divider = $('<div class="drag-divider" role="separator" aria-orientation="vertical" tabindex="0"></div>');
        left.after(divider);
    }

    const rowEl = row[0];
    const dividerEl = divider[0];
    const MIN_PX = 400; // min width of the left and right pane

    let ratio = parseFloat(localStorage.getItem('cellSplitRatio_' + taskIndex));
    if (!(ratio > 0 && ratio < 1)) ratio = 0.5;
    applyRatio(row, ratio);

    // Clamp function that respects current container width
    function clampRatio(r) {
        const avail = getAvail(rowEl, dividerEl);
        if (!avail) return 0.5;
        const minR = Math.min(0.5, MIN_PX / avail);
        return Math.max(minR, Math.min(1 - minR, r));
    }

    // Drag logic
    let dragging = false;

    function onMove(e) {
        if (!dragging) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const rect = rowEl.getBoundingClientRect();
        const avail = getAvail(rowEl, dividerEl);
        let leftPx = clientX - rect.left - (getDividerWidth(rowEl, dividerEl) / 2);
        leftPx = Math.max(MIN_PX, Math.min(avail - MIN_PX, leftPx));
        ratio = clampRatio(avail ? (leftPx / avail) : 0.5);
        applyRatio(row, ratio);
    }

    function onUp() {
        if (!dragging) return;
        dragging = false;
        $('body').removeClass('dragging');
        localStorage.setItem('cellSplitRatio_' + taskIndex, String(ratio));
        $(document).off('.cellsplit_' + taskIndex);
    }

    divider
        .off('.cellsplit_' + taskIndex)
        .on('mousedown.cellsplit_' + taskIndex + ' touchstart.cellsplit_' + taskIndex, (e) => {
            e.preventDefault();
            dragging = true;
            $('body').addClass('dragging');
            $(document)
                .on('mousemove.cellsplit_' + taskIndex + ' touchmove.cellsplit_' + taskIndex, onMove)
                .on('mouseup.cellsplit_' + taskIndex + ' touchend.cellsplit_' + taskIndex + ' touchcancel.cellsplit_' + taskIndex, onUp);
        })
        .on('keydown.cellsplit_' + taskIndex, (e) => {
            const avail = getAvail(rowEl, dividerEl);
            const step = 10 / Math.max(avail, 1);
            if (e.key === 'ArrowLeft') ratio -= step;
            else if (e.key === 'ArrowRight') ratio += step;
            else return;
            ratio = clampRatio(ratio);
            applyRatio(row, ratio);
            localStorage.setItem('cellSplitRatio_' + taskIndex, String(ratio));
            e.preventDefault();
        });

    // Keep the split correct on container resize
    const ro = new ResizeObserver(() => {
        ratio = clampRatio(ratio);
        applyRatio(row, ratio);
        localStorage.setItem('cellSplitRatio_' + taskIndex, String(ratio));
    });
    ro.observe(rowEl);
    row.data('resizeObserver', ro);
}

/**
 * Tear down the draggable divider for a cell.
 * - Removes `split-active` and the divider element.
 * - Clears the CSS ratio variable.
 * - Disconnects the ResizeObserver.
 *
 *
 * @param {jQuery} cellItem - jQuery object for the cell `<li.clarama-cell-item>`.
 * @param {string|number} [taskIndex] - Optional step index (not required by current implementation).
 * @returns {void}
 */
function teardownDragDivider(cellItem) {
    const row = cellItem.find('.content-row');
    row.removeClass('split-active');
    const ro = row.data('resizeObserver');
    if (ro) {
        ro.disconnect();
        row.removeData('resizeObserver');
    }
    row[0].style.removeProperty('--split-ratio');
    row.find('.drag-divider').remove();
}

/**
 * Sets the output type for a data cell
 * @param {string} id_template - Base ID for the data cell elements
 * @param {string} value - Output type ('table', 'chart', or 'code')
 * @param {string} Options - ID suffix for the options accordion
 * @description Updates button states and visibility of options based on the selected output type
 */
function datacell_setOutput(id_template, value, Options) {
    if (!value) value = 'table';
    $('#' + id_template + '_output').val(value);

    const types = ['table', 'chart', 'chart3d', 'code'];

    types.forEach(t => {
        const $btn = $('#' + id_template + '_' + t);
        const isActive = (t === value);
        // swap your theme classes
        $btn.toggleClass('btn-c2', isActive)
            .toggleClass('btn-c2-secondary', !isActive)
            .attr('aria-pressed', isActive ? 'true' : 'false');
    });

    // ['Chart3d', 'Chart', 'Table',' Diagram'].forEach(suffix => {
    //     const tabContent = document.getElementById(`collapse${suffix}Options_` + Options);
    //     if (tabContent) {
    //         bootstrap.Collapse.getOrCreateInstance(tabContent, { toggle: false }).hide();
    //     }
    // });


    if (value == 'table') {
        $('#' + id_template + '_table').removeClass('btn-secondary');
        $('#' + id_template + '_table').addClass('btn-primary');

        $('#' + id_template + '_chart').removeClass('btn-primary');
        $('#' + id_template + '_chart').addClass('btn-secondary');
        $('#' + id_template + '_diagram').removeClass('btn-primary');
        $('#' + id_template + '_diagram').addClass('btn-secondary');
        $('#' + id_template + '_chart3d').removeClass('btn-primary');
        $('#' + id_template + '_chart3d').addClass('btn-secondary');
        $('#' + id_template + '_code').removeClass('btn-primary');
        $('#' + id_template + '_code').addClass('btn-secondary');
    } else if (value == 'chart') {
        $('#' + id_template + '_code').addClass('btn-secondary');
        $('#' + id_template + '_code').removeClass('btn-primary');
        $('#' + id_template + '_table').addClass('btn-secondary');
        $('#' + id_template + '_table').removeClass('btn-primary');
        $('#' + id_template + '_diagram').addClass('btn-secondary');
        $('#' + id_template + '_diagram').removeClass('btn-primary');
        $('#' + id_template + '_chart3d').addClass('btn-secondary');
        $('#' + id_template + '_chart3d').removeClass('btn-primary');

        $('#' + id_template + '_chart').addClass('btn-primary');
        $('#' + id_template + '_chart').removeClass('btn-secondary');
    } else if (value == 'diagram') {
        $('#' + id_template + '_code').addClass('btn-secondary');
        $('#' + id_template + '_code').removeClass('btn-primary');
        $('#' + id_template + '_table').addClass('btn-secondary');
        $('#' + id_template + '_table').removeClass('btn-primary');
        $('#' + id_template + '_chart').addClass('btn-secondary');
        $('#' + id_template + '_chart').removeClass('btn-primary');
        $('#' + id_template + '_chart3d').addClass('btn-secondary');
        $('#' + id_template + '_chart3d').removeClass('btn-primary');

        $('#' + id_template + '_diagram').addClass('btn-primary');
        $('#' + id_template + '_diagram').removeClass('btn-secondary');
    } else if (value == 'chart3d') {
        $('#' + id_template + '_code').addClass('btn-secondary');
        $('#' + id_template + '_code').removeClass('btn-primary');
        $('#' + id_template + '_table').addClass('btn-secondary');
        $('#' + id_template + '_table').removeClass('btn-primary');
        $('#' + id_template + '_chart').addClass('btn-secondary');
        $('#' + id_template + '_chart').removeClass('btn-primary');
        $('#' + id_template + '_diagram').addClass('btn-secondary');
        $('#' + id_template + '_diagram').removeClass('btn-primary');

        $('#' + id_template + '_chart3d').addClass('btn-primary');
        $('#' + id_template + '_chart3d').removeClass('btn-secondary');
    } else {
        // default to code
        $('#' + id_template + '_code').addClass('btn-primary');
        $('#' + id_template + '_code').removeClass('btn-secondary');

        $('#' + id_template + '_table').addClass('btn-secondary');
        $('#' + id_template + '_table').removeClass('btn-primary');
        $('#' + id_template + '_chart').addClass('btn-secondary');
        $('#' + id_template + '_chart').removeClass('btn-primary');
        $('#' + id_template + '_diagram').addClass('btn-secondary');
        $('#' + id_template + '_diagram').removeClass('btn-primary');
        $('#' + id_template + '_chart3d').addClass('btn-secondary');
        $('#' + id_template + '_chart3d').removeClass('btn-primary');
    }

    if (value === 'chart3d' || value === 'table' || value === 'chart' || value === 'diagram' || value === 'code') {
        // Close the accordion if one of the buttons is clicked

        // close the 3d chart options
        let accordion = document.getElementById('collapseChart3dOptions_' + Options);
        let bsCollapse = new bootstrap.Collapse(accordion, {toggle: false});
        bsCollapse.hide();

        // close the chart options
        accordion = document.getElementById('collapseChartOptions_' + Options);
        bsCollapse = new bootstrap.Collapse(accordion, {toggle: false});
        bsCollapse.hide();

        // close the diagram options
        accordion = document.getElementById('collapseDiagramOptions_' + Options);
        bsCollapse = new bootstrap.Collapse(accordion, {toggle: false});
        bsCollapse.hide();

        // close the table options
        accordion = document.getElementById('collapseTableOptions_' + Options);
        bsCollapse = new bootstrap.Collapse(accordion, {toggle: false});
        bsCollapse.hide();

        // close the code options
        accordion = document.getElementById('collapseCodeOptions_' + Options);
        bsCollapse = new bootstrap.Collapse(accordion, {toggle: false});
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

    switch (cellType) {
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

        case 'question':
            content = get_question_cell(targetCell);
            break;

        case 'task':
            content = get_task_cell(targetCell);
            break;

        case 'url':
            content = get_url_cell(targetCell);
            break;

        case 'data':
            content = get_data_cell(targetCell);
            break;

        case 'test':
            content = get_test_cell(targetCell);
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
    $('[id^="results_"]').on('contextmenu', function (e) {
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
    $('.panel').on('contextmenu', function (e) {
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
    $(document).on('click', function (e) {
        if (!$(e.target).closest('#panel-context-menu, #output-context-menu').length) {
            $('#panel-context-menu').hide();
            $('#output-context-menu').hide();
        }
    });

    $(document).on('contextmenu', function (e) {
        if (!$(e.target).closest('.panel, .cell-editor, [id^="results_"]').length) {
            $('#panel-context-menu').hide();
            $('#output-context-menu').hide();
        }
    });

    $(window).on('scroll', function () {
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

        get_html(newStepUrl, function (new_step) {
            const windowScrollTop = $(window).scrollTop();
            const $new_element = $(new_step);

            currentContextCell.after($new_element);

            sortUpdate(targetStream);
            initializeNewCellinsights($new_element);

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

                embeddedElement.load_post(function () {
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

// Auto-open/close Insights based on focused cell
(function attachAutoOpenInsights() {
    const OPEN_DEBOUNCE_MS = 120;
    let lastMark = null;

    function debounce(fn, wait) {
        let t = null;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    const maybeActivate = debounce(function (cellItem) {
        if (!cellItem || !cellItem.length) return;

        const taskIndex =
            cellItem.attr('step') || cellItem.attr('data-task-index');
        if (!taskIndex) return;

        const hasInsights = cellItem.find('.celleditinsights, .insights-toggle-bar').length;

        if (!hasInsights) {
            const mark = `close:${taskIndex}`;
            if (lastMark !== mark) {
                closeAllinsights();
                lastMark = mark;
            }
            return;
        }

        if (lastMark === String(taskIndex)) return; // already opened for this one
        openInsights(cellItem, taskIndex);
        lastMark = String(taskIndex);
    }, OPEN_DEBOUNCE_MS);

    // Focus anywhere inside the left pane
    $(document).on('focusin.autoinsights', '.clarama-cell-item .left-content', function () {
        maybeActivate($(this).closest('.clarama-cell-item'));
    });

    // Mouse clicking non-focusable parts of the left pane
    $(document).on('mousedown.autoinsights', '.clarama-cell-item .left-content', function (e) {
        if (document.activeElement && $(document.activeElement).closest(this).length) return;
        maybeActivate($(this).closest('.clarama-cell-item'));
    });

    $(document).on('focusin.autoinsights', '.clarama-cell-item .ace_text-input', function () {
        maybeActivate($(this).closest('.clarama-cell-item'));
    });
})();
  
  
