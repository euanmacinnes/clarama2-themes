// ========================================
// DEBUGGER FUNCTIONS
// ========================================

/**
 * Sets up debug behavior for a task registry
 * @param {Object} task_registry - The task registry object
 * @param {string} code_command - The code to execute
 * @param {Object} field_registry - The field registry object
 */
function set_debug_behaviour(task_registry, code_command, field_registry) {
    task_registry['streams'][0]['main'][0]['type'] = 'code';
    task_registry['streams'][0]['main'][0]['content'] = code_command;
    task_registry['streams'][0]['main'][0]['clear'] = false;
    task_registry['parameters'] = field_registry;
}

/**
 * Executes the main cell debugger to list variables
 * @param {jQuery} cell_button - The cell button element
 * @param {Function} outputCallback - Optional callback for output
 */
function cell_debugger_run(cell_button, outputCallback) {    
    const taskIndex = cell_button.attr('step') || cell_button.attr('data-task-index');
    const shownIndex = cell_button.closest('li.clarama-cell-item').find('button.step-label').text().trim();
    
    // Prevent multiple simultaneous runs
    const runningKey = `cell_debugger_running_${taskIndex}`;
    if (window[runningKey]) {
        console.log("Cell debugger already running for task", taskIndex);
        return;
    }
    window[runningKey] = true;
    
    window['cell_debugger_variables_callback_' + taskIndex] = function(output) {
        console.log("Variables debugger callback received output for task", taskIndex, ":", output);
        populateVariablesList(output, taskIndex, false);
        
        if (outputCallback) {
            outputCallback(output);
        }
        
        // Clear running flag
        delete window[runningKey];
    };

    get_field_values({}, true, function (field_registry) {
        const task_registry = get_cell_fields(cell_button);
        set_debug_behaviour(task_registry, 'print(list(locals().keys()));', field_registry);
        const socket_div = $("#edit_socket");
        
        field_registry['clarama_task_kill'] = false;
        
        const task_kernel_id = socket_div.attr("task_kernel_id");
        const url = $CLARAMA_ENVIRONMENTS_KERNEL_RUN + task_kernel_id;
        
        $.ajax({
            type: 'POST',
            url: url,
            datatype: "html",
            contentType: 'application/json',
            data: JSON.stringify(task_registry),
            success: function(data) {
                if (data['data'] == 'ok') {
                    console.log('CLARAMA_TASK_CELL_DEBUGGER.js: Debug submission was successful for task', shownIndex);
                    flash(`Cell ${shownIndex} debug toggled on`, "success");
                } else {
                    console.log('CLARAMA_TASK_CELL_DEBUGGER.js: Debug submission was not successful for task', taskIndex);
                    const variablesList = $('#variables_' + taskIndex);
                    variablesList.html('<div class="text-danger p-3">Error loading variables: ' + data['error'] + '</div>');
                    flash("Couldn't run debug content: " + data['error'], "danger");
                    window['cell_debugger_variables_callback_' + taskIndex] = null;
                    delete window[runningKey];
                }
            },
            error: function(data) {
                console.log('An error occurred in debug run for task', taskIndex);
                console.log(data);
                const variablesList = $('#variables_' + taskIndex);
                variablesList.html('<div class="text-danger p-3">Error loading variables</div>');
                flash("Couldn't run debug content, access denied", "danger");
                window['cell_debugger_variables_callback_' + taskIndex] = null;
                delete window[runningKey];
            }
        });
    });
}

/**
 * Runs Python code from the debug console input
 * @param {string} taskIndex - The task index
 * @param {string} code - The Python code to execute (optional, will get from input if not provided)
 */
function debug_console_run(taskIndex, code) {
    const cellElement = $(`li.clarama-cell-item[step="${taskIndex}"]`);
    if (!cellElement.length) {
        console.error("Cell element not found for task index", taskIndex);
        return;
    }
    
    const currentTaskIndex = cellElement.attr('step') || cellElement.attr('data-task-index');
    const shownIndex = cellElement.closest('li.clarama-cell-item').find('button.step-label').text().trim();
    const executionKey = `console_executing_${currentTaskIndex}`;
    if (window[executionKey]) {
        console.log("Console execution already in progress for task", currentTaskIndex);
        return;
    }
    
    if (!code) {
        let consoleInput = document.getElementById(`console_input_${currentTaskIndex}`);
        
        if (!consoleInput) {
            consoleInput = cellElement.find('.console-input')[0];
            if (consoleInput) {
                console.warn(`Console input found via fallback method for task ${currentTaskIndex}. IDs may be out of sync.`);
                consoleInput.id = `console_input_${currentTaskIndex}`;
            }
        }
        
        if (!consoleInput) {
            console.error("Console input not found for task", currentTaskIndex);
            return;
        }
        
        code = consoleInput.value.trim();
        consoleInput.value = '';
    }
    
    if (!code) {
        console.log("No code to execute for task", taskIndex);
        return;
    }
    
    window[executionKey] = true;
    
    // Use the current task index for the callback function name
    window[`cell_debugger_callback_${currentTaskIndex}`] = function(output) {
        console.log("Console callback received output for task", currentTaskIndex, ":", output);
        
        let consoleOutput = document.getElementById(`console_output_${currentTaskIndex}`);
        
        if (!consoleOutput) {
            consoleOutput = cellElement.find('.console-output')[0];
        }
        
        if (consoleOutput) {
            consoleOutput.textContent = output;
        }
        
        delete window[executionKey];
    };

    get_field_values({}, true, function(field_registry) {
        const task_registry = get_cell_fields(cellElement);
        set_debug_behaviour(task_registry, code, field_registry);
        
        const socket_div = $("#edit_socket");
        field_registry['clarama_task_kill'] = false;
        
        const task_kernel_id = socket_div.attr("task_kernel_id");
        const url = $CLARAMA_ENVIRONMENTS_KERNEL_RUN + task_kernel_id;
        const taskUrl = get_url(url, field_registry);
        console.log("Console execution: Running code at", taskUrl, "for task", currentTaskIndex);

        $.ajax({
            type: 'POST',
            url: url,
            datatype: "json",
            contentType: 'application/json',
            data: JSON.stringify(task_registry),
            success: function(data) {
                if (data['data'] == 'ok') {
                    console.log('Console code submitted successfully for task', currentTaskIndex);
                } else {
                    console.log('Console execution was not successful for task', currentTaskIndex);
                    delete window[`cell_debugger_callback_${currentTaskIndex}`];
                    delete window[executionKey];
                }
            },
            error: function(error) {
                flash("Console execution failed: access denied", "danger");
                delete window[`cell_debugger_callback_${currentTaskIndex}`];
                delete window[executionKey];
            }
        });
    });
}

/**
 * Inspects a variable and displays its value
 * If variable is a class, display 'help(variable_name)' instead
 * @param {string} varName - The name of the variable to inspect
 * @param {string} taskIndex - The task index
 */
function inspectVariable(varName, taskIndex) {
    console.log("Inspecting variable:", varName, "in task:", taskIndex);
    debounce(function(varName, taskIndex) {
        const cellElement = $(`li.clarama-cell-item[step="${taskIndex}"]`);
        if (!cellElement.length) {
            console.error("Cell element not found for task index", taskIndex);
            return;
        }
        
        const currentTaskIndex = cellElement.attr('step') || cellElement.attr('data-task-index');
        const inspectionKey = `variable_inspecting_${currentTaskIndex}`;
        
        if (window[inspectionKey]) {
            console.log("Variable inspection already in progress for task", currentTaskIndex);
            return;
        }
        
        window[inspectionKey] = true;
    
        // Clean up any existing callback
        if (window[`cell_debugger_callback_${currentTaskIndex}`]) {
            delete window[`cell_debugger_callback_${currentTaskIndex}`];
        }
    
        window[`cell_debugger_callback_${currentTaskIndex}`] = function(output) {
            delete window[inspectionKey];
        };
    
        get_field_values({}, true, function(field_registry) {
            const task_registry = get_cell_fields(cellElement);
    
            // Python snippet that captures help() output or variable value, uses pprint for better formatting
            const codeChecker = `
from pprint import pprint
import pandas as pd
try:
    val = ${varName}
    val_str = str(val)
    
    # Check if it's a pandas DataFrame
    if isinstance(val, pd.DataFrame):
        print(val.info())
    # Check if it's a class/function/method (starts with <)
    elif val_str.startswith("<"):
        help(${varName})
    else:
        pprint(${varName})
except NameError:
    print(f"Variable '${varName}' is not defined")
except Exception as e:
    print(f"Error inspecting variable '${varName}': {e}")
`;

            set_debug_behaviour(task_registry, codeChecker, field_registry);
    
            const socket_div = $("#edit_socket");
            const task_kernel_id = socket_div.attr("task_kernel_id");
            const url = $CLARAMA_ENVIRONMENTS_KERNEL_RUN + task_kernel_id;
    
            $.ajax({
                type: 'POST',
                url: url,
                datatype: "json",
                contentType: 'application/json',
                data: JSON.stringify(task_registry),
                success: function(data) {
                    if (data['data'] !== 'ok') {
                        console.log('Variable inspection was not successful for task', currentTaskIndex);
                        delete window[`cell_debugger_callback_${currentTaskIndex}`];
                        delete window[inspectionKey];
                    }
                },
                error: function(error) {
                    console.log("InspectVariable AJAX error for task", currentTaskIndex, ":", error);
                    flash("Couldn't inspect variable", "danger");
                    delete window[`cell_debugger_callback_${currentTaskIndex}`];
                    delete window[inspectionKey];
                }
            });
        });
    }, 200)(varName, taskIndex);
}

/**
 * Debounce function to limit how often a function can be called
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @param {boolean} immediate - Whether to execute immediately
 * @returns {Function} Debounced function
 */
function debounce(func, wait, immediate) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            timeout = null;
            if (!immediate) func.apply(this, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(this, args);
    };
}

// ========================================
// UI CREATION FUNCTIONS
// ========================================

/**
 * Creates a direct variable button (no template)
 * @param {string} varName - Variable name
 * @param {string} taskIndex - Task index
 * @returns {HTMLElement} Button element
 */
function createVariableButtonDirect(varName, taskIndex) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "variable-item";
    button.setAttribute("data-variable", varName);
    button.setAttribute("data-task-index", taskIndex);
    
    const span = document.createElement("span");
    span.className = "variable-name";
    span.textContent = varName;
    button.appendChild(span);
    
    return button;
}

/**
 * Creates a variable button with template support
 * @param {string} varName - Variable name
 * @param {string} taskIndex - Task index
 * @returns {HTMLElement} Button element
 */
function createVariableButton(varName, taskIndex) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "variable-item clarama-post-embedded clarama-replaceable";
    button.setAttribute("data-variable", varName);
    button.setAttribute("data-task-index", taskIndex);
    
    const params = new URLSearchParams({
        variable_name: varName,
        task_index: taskIndex
    });
    
    button.setAttribute("url", `/template/render/explorer/files/_cell_debugger_variable_button?${params.toString()}`);
    return button;
}

/**
 * Creates a container for variables
 * @param {string} taskIndex - Task index
 * @returns {HTMLElement} Container element
 */
function createVariablesContainer(taskIndex) {
    const container = document.createElement("div");
    container.className = "variables-horizontal-container";
    container.setAttribute("id", `variables_container_${taskIndex}`);
    container.setAttribute("data-task-index", taskIndex);
    return container;
}

/**
 * Creates an empty variables message
 * @param {string} message - Message to display
 * @returns {HTMLElement} Message element
 */
function createEmptyVariablesMessage(message = "No user variables found") {
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "text-muted p-3";
    emptyDiv.textContent = message;
    return emptyDiv;
}

// ========================================
// VARIABLE POPULATION FUNCTIONS
// ========================================

/**
 * Populates a variables container with variable buttons
 * @param {HTMLElement} container - Container element
 * @param {Array} variableNames - Array of variable names
 * @param {string} taskIndex - Task index
 * @param {boolean} useTemplate - Whether to use template support
 */
function populateVariablesContainer(container, variableNames, taskIndex, useTemplate = false) {
    // Clear existing content and event listeners
    const existingButtons = container.querySelectorAll('.variable-item');
    existingButtons.forEach(button => {
        if (button._variableClickHandler) {
            button.removeEventListener('click', button._variableClickHandler);
        }
    });
    
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();

    variableNames.forEach(varName => {
        const button = useTemplate ? 
            createVariableButton(varName, taskIndex) : 
            createVariableButtonDirect(varName, taskIndex);
        fragment.appendChild(button);
    });
    
    container.appendChild(fragment);
    
    if (useTemplate) {
        enable_interactions($(container));
        
        setTimeout(() => {
            attachVariableClickHandlers(container, taskIndex);
        }, 100);
    } else {
        attachVariableClickHandlers(container, taskIndex);
    }
}

/**
 * Populates the variables list with parsed output
 * @param {*} output - Raw output from Python execution
 * @param {string} taskIndex - Task index
 * @param {boolean} useTemplate - Whether to use template support
 */
function populateVariablesList(output, taskIndex, useTemplate = false) {
    const variablesList = $(`#variables_${taskIndex}`)[0];
    
    if (!variablesList) {
        console.error("Variables list element not found for task", taskIndex);
        return;
    }
    
    try {
        let variableNames = [];

        if (output === null || output === undefined || output === 'None' || output === '') {
            console.log("No output or empty output received");
            const emptyMessage = createEmptyVariablesMessage("No variables found");
            variablesList.innerHTML = '';
            variablesList.appendChild(emptyMessage);
            return;
        }

        let stringToParse = output;
        
        // Decode HTML entities first
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = stringToParse;
        stringToParse = tempDiv.textContent || tempDiv.innerText || stringToParse;
        
        variableNames = parseVariableString(stringToParse);

        // Clean up variable names
        variableNames = variableNames.map(name => {
            const div = document.createElement("div");
            div.innerHTML = name;
            let decoded = div.textContent || div.innerText || "";
    
            // Remove surrounding quotes
            if ((decoded.startsWith('"') && decoded.endsWith('"')) ||
                (decoded.startsWith("'") && decoded.endsWith("'"))) {
                decoded = decoded.slice(1, -1);
            }
            return decoded.trim();
        });

        // Filter out empty strings and system variables
        variableNames = variableNames.filter(name => {
            return name && 
                   name.length > 0 && 
                   typeof name === 'string' &&
                   !name.startsWith('_') && 
                   name !== 'In' && 
                   name !== 'Out' && 
                   name !== 'get_ipython' &&
                   name !== 'exit' &&
                   name !== 'quit';
        });

        if (variableNames.length > 0) {
            const container = createVariablesContainer(taskIndex);
            populateVariablesContainer(container, variableNames, taskIndex, useTemplate);
            
            variablesList.innerHTML = '';
            variablesList.appendChild(container);
        } else {
            const emptyMessage = createEmptyVariablesMessage();
            variablesList.innerHTML = '';
            variablesList.appendChild(emptyMessage);
        }

    } catch (e) {
        console.error('Error parsing variables:', e);
        const errorMessage = createEmptyVariablesMessage(`Error parsing variables: ${e.message}`);
        errorMessage.className = "text-danger p-3";
        variablesList.innerHTML = '';
        variablesList.appendChild(errorMessage);
        flash('Error parsing variables: ' + e, 'danger');
    }
}

/**
 * Parse a string representation of a Python list into individual variable names
 * @param {string} stringToParse - The string to parse (e.g., "['var1', 'var2', 'var3']")
 * @returns {string[]} Array of variable names
 */
function parseVariableString(stringToParse) {
    let variableNames = [];
    
    stringToParse = stringToParse.trim();
    
    if (stringToParse.startsWith("[") && stringToParse.endsWith("]")) {
        let innerContent = stringToParse.slice(1, -1).trim();
        
        console.log("Inner content:", innerContent);
        
        if (innerContent.length === 0) {
            return [];
        }
        
        variableNames = splitRespectingQuotes(innerContent);
        
        console.log("After splitRespectingQuotes:", variableNames);
        
    } else {
        variableNames = [stringToParse];
    }
    
    return variableNames;
}

/**
 * Split a string by commas while respecting quoted strings
 * @param {string} str - The string to split
 * @returns {string[]} Array of split strings
 */
function splitRespectingQuotes(str) {
    console.log("splitRespectingQuotes input:", str);
    
    const result = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = null;
    
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        
        if ((char === '"' || char === "'") && !inQuotes) {
            // Start of quoted string
            inQuotes = true;
            quoteChar = char;
            // Don't include the quote in the result
        } else if (char === quoteChar && inQuotes) {
            // End of quoted string
            inQuotes = false;
            quoteChar = null;
            // Don't include the quote in the result
        } else if (char === ',' && !inQuotes) {
            // Comma outside of quotes - split here
            if (current.trim()) {
                result.push(current.trim());
            }
            current = '';
        } else if (char !== '"' && char !== "'") {
            // Only add non-quote characters
            current += char;
        }
    }
    
    if (current.trim()) {
        result.push(current.trim());
    }
    
    return result;
}

// ========================================
// CLICK HANDLER FUNCTIONS
// ========================================

/**
 * Attaches click handlers to variable buttons with debouncing
 * @param {HTMLElement} container - Container element
 * @param {string} taskIndex - Task index
 */
function attachVariableClickHandlers(container, taskIndex) {
    const variableButtons = container.querySelectorAll('.variable-item');
    
    variableButtons.forEach(button => {
        // Remove existing handler if present
        if (button._variableClickHandler) {
            button.removeEventListener('click', button._variableClickHandler);
        }
        
        // Create debounced click handler
        button._variableClickHandler = debounce(function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const varName = this.dataset.variable;
            const taskIdx = this.dataset.taskIndex;
            
            container.querySelectorAll('.variable-item').forEach(btn => {
                btn.classList.remove('selected');
            });
            
            this.classList.add('selected');
            
            inspectVariable(varName, taskIdx);
        }, 150);
        
        button.addEventListener('click', button._variableClickHandler);
    });
}

/**
 * Handles variable button click (legacy function, now uses debounced handler)
 * @param {HTMLElement} button - Button element
 */
function handleVariableClick(button) {
    const varName = button.dataset.variable;
    const taskIndex = button.dataset.taskIndex;
    const container = button.closest('.variables-horizontal-container');
        
    container.querySelectorAll('.variable-item').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    button.classList.add('selected');
    
    inspectVariable(varName, taskIndex);
}

$.fn.interact_variable = function() {
    return this.each(function() {
        const $this = $(this);
        
        // Remove existing handlers
        $this.off('click.variable');
        
        const debouncedHandler = debounce(function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const varName = this.dataset.variable;
            const taskIndex = this.dataset.taskIndex;
            const container = this.closest('.variables-horizontal-container');
            
            // Update UI immediately
            $(container).find('.variable-item').removeClass('selected');
            $(this).addClass('selected');
            
            // Inspect variable
            inspectVariable(varName, taskIndex);
        }, 150);
        
        $this.on('click.variable', debouncedHandler);
    });
};