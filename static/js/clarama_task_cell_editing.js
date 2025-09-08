function get_cell_fields(cell_owner) {
    var registry = {'streams': []}

    this_grid = saveGrid();
    // Get the field grid
    registry['fieldgrid'] = {
        'elements': this_grid['elements'],
        'children': this_grid['grid']['children']
    };

    var stream_cells = get_cell(cell_owner, cell_owner.attr('id'));

    console.log("Saving stream " + stream_cells);
    stream_dict = {};
    stream_dict['main'] = stream_cells;
    registry['streams'].push(stream_dict);

    return registry;
}

$.fn.enablesortcolor = function () {
    return this.each(function () {
        var panelList = $(this);

        panelList.sortable({
            // Only make the .draggable-heading child elements support dragging.
            // Omit this to make then entire <li>...</li> draggable by the user.
            handle: '.draggable-heading',
            update: function () {
                var streamname = $(this).parent("#stream").attr('stream-name');
                $('.clarama-cell-item', panelList).each(function (index, elem) {
                    $(this).attr('id', streamname + '_' + (index + 1));
                });

                $('.panel', panelList).each(function (index, elem) {
                    var listItem = $(elem);

                    listItem.removeClass("bg-primary");
                    listItem.addClass("bg-secondary");

                    $('.step-label', listItem).each(function () {
                        var label = $(this)
                        label.html('' + (index + 1))
                    });
                });

                $('.panel', panelList).last().removeClass("bg-secondary");
                $('.panel', panelList).last().addClass("bg-primary");
            }
        });
    });
};

function sortUpdate(panelList) {
    $('.clarama-cell-item', panelList).each(function (index, elem) {
        var streamname = $(this).parent(".stream").attr('stream-name');
        var oldStep = $(this).attr('step');
        var newStep = index + 1;
        
        console.log("SORT UPDATE " + index + " with streamname " + streamname + " - changing step from " + oldStep + " to " + newStep);
        
        $(this).attr('id', streamname + '_' + newStep);
        $(this).attr('step', newStep);
        
        if (oldStep !== newStep) {
            updateDebuggerIds($(this), oldStep, newStep);
        }
    });

    $('.panel', panelList).each(function (index, elem) {
        var listItem = $(elem);

        listItem.removeClass("bg-primary");
        listItem.addClass("bg-secondary");

        $('.step-label', listItem).each(function () {
            var label = $(this)
            label.html('<p class="step-label">' + (index + 1) + '</p>')
        });
    });

    $('.panel', panelList).last().removeClass("bg-secondary");
    $('.panel', panelList).last().addClass("bg-primary");

    reinitializeConsoleHandlers(panelList);
}

function updateDebuggerIds(cellElement, oldStep, newStep) {
    console.log(`Updating debugger IDs from ${oldStep} to ${newStep} for cell:`, cellElement);
    
    // Update debugger container ID
    var debuggerContainer = cellElement.find(`#debugger_${oldStep}`);
    if (debuggerContainer.length) {
        debuggerContainer.attr('id', `debugger_${newStep}`);
    }
    
    // Update left and right content IDs
    var leftContent = cellElement.find(`#left_content_${oldStep}`);
    if (leftContent.length) {
        leftContent.attr('id', `left_content_${newStep}`);
    }
    
    var rightContent = cellElement.find(`#right_content_${oldStep}`);
    if (rightContent.length) {
        rightContent.attr('id', `right_content_${newStep}`);
    }
    
    // Update variables container ID
    var variablesContainer = cellElement.find(`#variables_${oldStep}`);
    if (variablesContainer.length) {
        variablesContainer.attr('id', `variables_${newStep}`);
    }
    
    // Update variables container with data-task-index
    var variablesContainerWithIndex = cellElement.find(`#variables_container_${oldStep}`);
    if (variablesContainerWithIndex.length) {
        variablesContainerWithIndex.attr('id', `variables_container_${newStep}`);
        variablesContainerWithIndex.attr('data-task-index', newStep);
    }
    
    // Update console input/output IDs
    var consoleInput = cellElement.find(`#console_input_${oldStep}`);
    if (consoleInput.length) {
        consoleInput.attr('id', `console_input_${newStep}`);
        consoleInput.attr('data-task-index', newStep);
    } else {
        // Fallback: find by class and update
        var consoleInputByClass = cellElement.find('.console-input');
        if (consoleInputByClass.length) {
            consoleInputByClass.attr('id', `console_input_${newStep}`);
            consoleInputByClass.attr('data-task-index', newStep);
        }
    }
    
    var consoleOutput = cellElement.find(`#console_output_${oldStep}`);
    if (consoleOutput.length) {
        consoleOutput.attr('id', `console_output_${newStep}`);
    } else {
        // Fallback: find by class and update
        var consoleOutputByClass = cellElement.find('.console-output');
        if (consoleOutputByClass.length) {
            consoleOutputByClass.attr('id', `console_output_${newStep}`);
        }
    }
    
    // Update debug button data-task-index
    var debugButton = cellElement.find('.celleditdebug');
    if (debugButton.length) {
        debugButton.attr('data-task-index', newStep);
    }
    
    // Update execute button data-task-index
    var executeButton = cellElement.find('.execute-console');
    if (executeButton.length) {
        executeButton.attr('data-task-index', newStep);
    }
    
    // Update any variable buttons
    var variableButtons = cellElement.find('.variable-item');
    variableButtons.each(function() {
        $(this).attr('data-task-index', newStep);
    });
    
    // Update results container ID
    var resultsContainer = cellElement.find(`#results_${oldStep}`);
    if (resultsContainer.length) {
        resultsContainer.attr('id', `results_${newStep}`);
    }
    
    // Update step editor container ID 
    cellElement.find('[id*="_' + oldStep + '"]').each(function() {
        var currentId = $(this).attr('id');
        if (currentId.endsWith('_' + oldStep)) {
            var newId = currentId.replace(new RegExp('_' + oldStep + '$'), '_' + newStep);
            $(this).attr('id', newId);
        }
    });
    
    // Move any existing callback functions to the new step index
    if (window[`cell_debugger_variables_callback_${oldStep}`]) {
        window[`cell_debugger_variables_callback_${newStep}`] = window[`cell_debugger_variables_callback_${oldStep}`];
        window[`cell_debugger_variables_callback_${oldStep}`] = null;
    }
    
    if (window[`cell_debugger_callback_${oldStep}`]) {
        window[`cell_debugger_callback_${newStep}`] = window[`cell_debugger_callback_${oldStep}`];
        window[`cell_debugger_callback_${oldStep}`] = null;
    }
    
    // Clean up any execution flags
    if (window[`console_executing_${oldStep}`]) {
        window[`console_executing_${newStep}`] = window[`console_executing_${oldStep}`];
        delete window[`console_executing_${oldStep}`];
    }
}

function reinitializeConsoleHandlers(stream) {
    stream.find('.clarama-cell-item').each(function() {
        const cellElement = $(this);
        const taskIndex = cellElement.attr('step') || cellElement.attr('data-task-index');
        
        if (taskIndex) {
            setupConsoleHandlers(cellElement, taskIndex);
        }
    });
}

$.fn.enablesort = function () {
    return this.each(function () {
        var panelList = $(this);

        panelList.sortable({
            // Only make the .draggable-heading child elements support dragging.
            // Omit this to make then entire <li>...</li> draggable.
            handle: '.draggable-heading'
        });

        panelList.on('sortupdate'), function () {
            sortUpdate(panelList);

        };
    });
};