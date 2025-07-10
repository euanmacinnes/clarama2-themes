/* clarama_task_cell_debugger.html */

function cell_debugger_run(cell_button, outputCallback) {    
    var taskIndex = cell_button.attr('step') || cell_button.attr('data-task-index');
    console.log("Debug running for task index:", taskIndex);
    
    // Set up callback specific to this task index
    window['cell_debugger_callback_' + taskIndex] = function(output) {
        console.log("Debugger callback received output for task", taskIndex, ":", output);
        populateVariablesList(output, taskIndex, false); 
        
        // Call the original callback if provided
        if (outputCallback) {
            outputCallback(output);
        }
    };

    get_field_values({}, true, function (field_registry) {
        var task_registry = get_cell_fields(cell_button);
        task_registry['streams'][0]['main'][0]['type'] = 'code';
        task_registry['streams'][0]['main'][0]['content'] = 'list(locals().keys());';
        task_registry['parameters'] = field_registry;
        
        var socket_div = $("#edit_socket");
        
        field_registry['clarama_task_kill'] = false;
        
        var task_kernel_id = socket_div.attr("task_kernel_id");
        var url = $CLARAMA_ENVIRONMENTS_KERNEL_RUN + task_kernel_id;
        
        const task = get_url(url, field_registry);
        
        $.ajax({
            type: 'POST',
            url: url,
            datatype: "html",
            contentType: 'application/json',
            data: JSON.stringify(task_registry),
            success: function (data) {
                console.log('task_registry: ', task_registry);
                console.log('CLARAMA_TASK_CELL_DEBUGGER.js: Debug response received for task', taskIndex, ':', data);
                
                if (data['data'] == 'ok') {
                    console.log('CLARAMA_TASK_CELL_DEBUGGER.js: Debug submission was successful for task', taskIndex);
                    flash(`Cell ${taskIndex} debug submitted successfully`, "success");
                    
                    // The actual output will come via WebSocket in the onMessage function
                    console.log("Debug task submitted for task", taskIndex, ", waiting for WebSocket response...");
                    
                } else {
                    console.log('CLARAMA_TASK_CELL_DEBUGGER.js: Debug submission was not successful for task', taskIndex);
                    var variablesList = $('#variables_' + taskIndex);
                    variablesList.html('<div class="text-danger p-3">Error loading variables: ' + data['error'] + '</div>');
                    flash("Couldn't run debug content: " + data['error'], "danger");
                    window['cell_debugger_callback_' + taskIndex] = null;
                }
            },
            error: function (data) {
                console.log('An error occurred in debug run for task', taskIndex);
                console.log(data);
                var variablesList = $('#variables_' + taskIndex);
                variablesList.html('<div class="text-danger p-3">Error loading variables</div>');
                flash("Couldn't run debug content, access denied", "danger");
                window['cell_debugger_callback_' + taskIndex] = null;
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

    window['cell_debugger_callback_' + taskIndex] = function(output) {
        console.log("Variable inspection output for task", taskIndex, "(not updating variable list):", output);
        // You can add UI code here to display output
    };

    get_field_values({}, true, function(field_registry) {
        var task_registry = get_cell_fields($(`li.clarama-cell-item[step="${taskIndex}"]`));

        // Python snippet that captures help() output or variable value 
        const codeChecker = `
val_str = str(${varName})
if val_str.startswith("<"):
    help(${varName})
else:
    print(${varName})
`;
        task_registry['streams'][0]['main'][0]['type'] = 'code';
        task_registry['streams'][0]['main'][0]['content'] = codeChecker;
        task_registry['parameters'] = field_registry;

        var socket_div = $("#edit_socket");
        var task_kernel_id = socket_div.attr("task_kernel_id");
        var url = $CLARAMA_ENVIRONMENTS_KERNEL_RUN + task_kernel_id;

        const taskUrl = get_url(url, field_registry);
        console.log("InspectVariable: Running inspection at", taskUrl, "for task", taskIndex);

        $.ajax({
            type: 'POST',
            url: url,
            datatype: "json", 
            contentType: 'application/json',
            data: JSON.stringify(task_registry),
            success: function (data) {
                console.log('CLARAMA_TASK_CELL_DEBUGGER.js: Inspection successful for task', taskIndex); 
            },
            error: function (error) {
                console.log("InspectVariable AJAX error for task", taskIndex, ":", error);
                flash("Couldn't inspect variable", "danger");
            }
        });
    });
}


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

function createVariablesContainer(taskIndex) {
    const container = document.createElement("div");
    container.className = "variables-horizontal-container";
    container.setAttribute("id", `variables_container_${taskIndex}`);
    container.setAttribute("data-task-index", taskIndex);
    return container;
}

function createEmptyVariablesMessage(message = "No user variables found") {
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "text-muted p-3";
    emptyDiv.textContent = message;
    return emptyDiv;
}

function createVariablesLoadingState() {
    const loadingDiv = document.createElement("div");
    loadingDiv.className = "text-muted d-flex align-items-center";
    
    const spinner = document.createElement("div");
    spinner.className = "spinner-border spinner-border-sm me-2 debug-spinner";
    spinner.setAttribute("role", "status");
    
    const spinnerText = document.createElement("span");
    spinnerText.className = "visually-hidden";
    spinnerText.textContent = "Loading...";
    
    const loadingText = document.createElement("span");
    loadingText.textContent = "Loading variables...";
    
    spinner.appendChild(spinnerText);
    loadingDiv.appendChild(spinner);
    loadingDiv.appendChild(loadingText);
    
    return loadingDiv;
}

// ========================================
// VARIABLE POPULATION FUNCTIONS
// ========================================

function populateVariablesContainer(container, variableNames, taskIndex, useTemplate = false) {
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    variableNames = variableNames.map(name => {
        const div = document.createElement("div");
        div.innerHTML = name;
        let decoded = div.textContent || div.innerText || "";

        if (
            (decoded.startsWith('"') && decoded.endsWith('"')) ||
            (decoded.startsWith("'") && decoded.endsWith("'"))
        ) {
            decoded = decoded.slice(1, -1);
        }
        return decoded;
    });

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

function populateVariablesList(output, taskIndex, useTemplate = false) {
    const variablesList = $(`#variables_${taskIndex}`)[0];
    
    try {
        // console.log("RAW locals().keys() output: >>>" + output + "<<<");
        // console.log("Type of output:", typeof output);
        // console.log("Output is array:", Array.isArray(output));
        // console.log("Output length:", output ? (output.length || 'no length property') : 'null/undefined');

        let variableNames = [];

        if (output === null || output === undefined || output === 'None' || output === '') {
            // console.log("No output or empty output received");
            const emptyMessage = createEmptyVariablesMessage("No variables found");
            variablesList.innerHTML = '';
            variablesList.appendChild(emptyMessage);
            return;
        }

        if (output.length === 1 && typeof output[0] === 'string') {
            // console.log("Array contains single string element, parsing:", output[0]);
            let stringToParse = output[0];
            
            if (stringToParse.startsWith("[") && stringToParse.endsWith("]")) {
                let innerContent = stringToParse.slice(1, -1).trim();
                
                if (innerContent.length === 0) {
                    variableNames = [];
                } else {
                    variableNames = innerContent.split(',').map(item => {
                        return item.trim().replace(/^['"]|['"]$/g, '');
                    }).filter(item => item.length > 0);
                }
            } else {
                variableNames = [stringToParse];
            }
        } else {
            variableNames = output;
        }

        // console.log("Variables before filtering:", variableNames);

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

        // console.log("Variables after filtering:", variableNames);

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

// ========================================
// CLICK HANDLER FUNCTIONS
// ========================================

function attachVariableClickHandlers(container, taskIndex) {
    const variableButtons = container.querySelectorAll('.variable-item');
    
    variableButtons.forEach(button => {
        if (button._variableClickHandler) {
            button.removeEventListener('click', button._variableClickHandler);
        }
        
        button._variableClickHandler = function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const varName = this.dataset.variable;
            const taskIdx = this.dataset.taskIndex;
            
            // console.log("Variable clicked:", varName, "Task:", taskIdx);
            
            container.querySelectorAll('.variable-item').forEach(btn => {
                btn.classList.remove('selected');
            });
            
            this.classList.add('selected');
            
            inspectVariable(varName, taskIdx);
        };
        
        button.addEventListener('click', button._variableClickHandler);
    });
}

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
        
        $this.off('click.variable');
        
        $this.on('click.variable', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const varName = this.dataset.variable;
            const taskIndex = this.dataset.taskIndex;
            const container = this.closest('.variables-horizontal-container');
                        
            $(container).find('.variable-item').removeClass('selected');
            
            $(this).addClass('selected');
            
            inspectVariable(varName, taskIndex);
        });
    });
};
