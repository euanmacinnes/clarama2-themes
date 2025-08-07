function set_environment(environment) {
    flash("Changing environment to " + environment);
    $('#kernel_status').html('Loading');
    $('#environment').html('...');

    let socket_element = $("#edit_socket");
    socket_element.attr("environment", environment);
    socket_starting = false;
    run_socket(socket_element, false);
}

function reset_environment(environment) {
    flash("Resetting environment to " + environment);
    $('#kernel_status').html('Restarting..');
    $('#environment').html('...');
    let socket_element = $("#edit_socket");
    socket_element.attr("environment", environment);
    socket_starting = false;
    run_socket(socket_element, true);
}

let task_active_socket = undefined;

let socket_address = '';

let socket_starting = false;

let socket_taskQueue = [];

let socket_topics = ['clarama-systemwide'];

function topic_subscribe() {
    console.log("CLARAMA_WEBSOCKET.JS registering topics");
    console.log(socket_topics);
    task_active_socket.send(JSON.stringify({topics: socket_topics}));
}

function processTaskMessages() {
    topic_subscribe();

    socket_taskQueue.forEach(message => {
        get_task(message.embedded, message.task_url, message.socket_id, message.autorun);
    });
    socket_taskQueue = [];
}

function enqueueTaskMessage(topic, embedded, task_url, socket_id, autorun) {
    if (socket_topics.indexOf(topic) === -1) {
        socket_topics.push(topic);
        console.log("CLARAMA_WEBSOCKET.js: TOPICS");
        console.log(socket_topics);
    }

    if (task_active_socket !== undefined)
        if (task_active_socket.readyState === WebSocket.OPEN) {
            task_active_socket.send(JSON.stringify({topics: socket_topics}));
            console.log("CLARAMA_WEBSOCKET.js: TASK " + task_url + " executing");
            get_task(embedded, task_url, socket_id, autorun);
            return;
        } else {
            console.log("CLARAMA_WEBSOCKET.js: TASK " + task_url + " socket was not open");
        }
    else {
        console.log("CLARAMA_WEBSOCKET.js: TASK " + task_url + " socket undefined, pushing on queue");
    }


    let task_message = {
        'topic': topic,
        'embedded': embedded,
        'task_url': task_url,
        'socket_id': socket_id,
        'autorun': autorun
    };

    socket_taskQueue.push(task_message);
}

function get_task(embedded, task_url, socket_id, autorun) {
    console.log("CLARAMA_WEBSOCKET.js: TASK " + task_url + " getting");

    const topic = new URLSearchParams(task_url.split('?')[1]).get('topic');
    let element_id = null;

    if (topic) {
        const match = topic.match(/element_(\d+)_/);
        if (match) {
            element_id = parseInt(match[1], 10);
        }
    }

    console.log('current_elem: ', element_id);
    let elementsObjects = [];

    for (let prop in window) {
        if (prop.endsWith('elements') && typeof window[prop] === 'object' && window[prop] !== null) {
            if (!elementsObjects.find(item => item.name === prop)) {
                elementsObjects.push({ name: prop, obj: window[prop] });
            }
        }
    }

    let waitInteractions = [];
    let currentElementData = null;

    elementsObjects.forEach(elementsData => {    
        const targetId = `element_${element_id}`;
    
        if (elementsData.obj.hasOwnProperty(targetId)) {
            const elementData = elementsData.obj[targetId];
            currentElementData = elementData;
    
            if (elementData && Array.isArray(elementData.links)) {
                waitInteractions = elementData.links.filter(link => link.wait === true || link.wait === 'true');
    
                if (waitInteractions.length > 0) {
                    console.log(`Element "${targetId}" has ${waitInteractions.length} wait interaction(s):`);
                    waitInteractions.forEach((interaction, index) => {
                        console.log(`  [${index + 1}] UID: ${interaction.uid || 'N/A'}, Element: ${interaction.element || 'N/A'}`);
                    });
                } else {
                    console.log(`Element "${targetId}" has no wait interactions (${elementData.links.length} total interactions)`);
                }
            } else {
                console.log(`Element "${targetId}" has no links/interactions`);
            }
        } else {
            console.log(`Element "${targetId}" not found in ${elementsData.name}`);
        }
    });

    // If there are wait interactions, set up waiting mechanism
    if (waitInteractions.length > 0) {
        console.log(`CLARAMA_WEBSOCKET.js: Element ${element_id} waiting for ${waitInteractions.length} interactions to resume`);
        
        // Store the pending task execution details
        const pendingTaskKey = `pendingTask_${element_id}`;
        window[pendingTaskKey] = {
            embedded: embedded,
            task_url: task_url,
            socket_id: socket_id,
            autorun: autorun,
            waitingFor: waitInteractions.map(interaction => interaction.element),
            resumedFrom: new Set() // Track which elements have sent resume messages
        };
        
        console.log(`CLARAMA_WEBSOCKET.js: Task execution for element ${element_id} deferred until resume messages received from:`, 
                   window[pendingTaskKey].waitingFor);
        
        // Don't proceed with task execution - wait for resume messages
        return;
    }

    // No wait interactions - proceed with normal task execution
    executeTask(embedded, task_url, socket_id, autorun);
}

function executeTask(embedded, task_url, socket_id, autorun) {
    fetch(task_url)
        .then((response) => {
            if (response.ok) {
                console.log("CLARAMA_WEBSOCKET.js: TASK " + task_url + " response " + response.status);
                return response.json();
            }
            console.log(response);
            return Promise.reject(response);
        })
        .then((task_response) => {

            // console.log(JSON.stringify(task_response, null, 2));
            let kernel_id = task_response['results']['kernel_id']
            let task_environment = task_response['results']['environment_name']
            let environment_file = task_response['results']['environment']

            embedded.attr('task_kernel_id', kernel_id);
            console.log("CLARAMA_WEBSOCKET.js: TASK " + task_url + " connected to kernel " + kernel_id)

            let active_selector = ('#environment_' + environment_file).replaceAll('.', "_");

            $("#kernel_status").html(kernel_id);
            $("#environment").html(task_environment);
            $(".environments").removeClass('active');
            $(active_selector).addClass('active');

            if (autorun === 'True') {
                _task_run(socket_id)
            }
        })
        .catch((error) => {
            flash('WEBSOCKET TASK ' + task_url + " error " + error, category = 'danger');
        });
}

function handleTaskInteractionResume(resumeMessage) {
    const { step_id, instance } = resumeMessage;
    
    let resumingElementId = null;
    if (step_id) {
        const match = step_id.match(/(?:step_|element_)(\d+)/);
        if (match) {
            resumingElementId = `element_${match[1]}`;
        }
    }
    
    if (!resumingElementId) {
        console.log("CLARAMA_WEBSOCKET.js: Could not extract element ID from step_id:", step_id);
        return;
    }
    
    console.log(`CLARAMA_WEBSOCKET.js: Received task_interaction_resume from ${resumingElementId}`);
    
    // Check all pending tasks to see which ones are waiting for this element
    for (let prop in window) {
        if (prop.startsWith('pendingTask_')) {
            const pendingTask = window[prop];
            const waitingElementId = prop.replace('pendingTask_', 'element_');
            
            if (pendingTask && pendingTask.waitingFor && pendingTask.waitingFor.includes(resumingElementId)) {
                console.log(`CLARAMA_WEBSOCKET.js: Element ${waitingElementId} was waiting for ${resumingElementId}`);
                
                // Mark this element as resumed
                pendingTask.resumedFrom.add(resumingElementId);
                
                console.log(`CLARAMA_WEBSOCKET.js: Element ${waitingElementId} has received resume from:`, 
                           Array.from(pendingTask.resumedFrom));
                console.log(`CLARAMA_WEBSOCKET.js: Element ${waitingElementId} still waiting for:`, 
                           pendingTask.waitingFor.filter(elem => !pendingTask.resumedFrom.has(elem)));
                
                // Check if all required elements have sent resume messages
                const allResumed = pendingTask.waitingFor.every(elem => pendingTask.resumedFrom.has(elem));
                
                if (allResumed) {
                    console.log(`CLARAMA_WEBSOCKET.js: All wait interactions complete for ${waitingElementId}, proceeding with task execution`);
                    executeTask(pendingTask.embedded, pendingTask.task_url, pendingTask.socket_id, pendingTask.autorun);
                    
                    // Clean up the pending task
                    delete window[prop];
                } else {
                    console.log(`CLARAMA_WEBSOCKET.js: Element ${waitingElementId} still waiting for more resume messages`);
                }
            }
        }
    }
}

function socket_task(embedded, task, topic, reset_environment) {
    let mode = embedded.attr("mode"); // For passing internally to the kernel, so that the kernel knows it's original mode
    let autorun = embedded.attr("autorun");
    let socket_id = embedded.attr("id");
    let refresh = embedded.attr("refresh");
    let environment = embedded.attr("environment");
    let env_url = '';
    if (environment !== undefined) {
        env_url = '&environment=' + environment;
        refresh = true;
        console.log("CLARAMA_WEBSOCKET.js: overriding environment with " + env_url);
    }

    let playbutton = $('.kernel-play-button');

    playbutton.addClass("btn-secondary")
    playbutton.removeClass("btn-primary")

    let task_url = $CLARAMA_ROOT + $CLARAMA_ENVIRONMENTS_TASK_OPEN + task + '?topic=' + topic + '&mode=' + mode + '&refresh=' + refresh + '&reset-environment=' + reset_environment + env_url;

    enqueueTaskMessage(topic, embedded, task_url, socket_id, autorun);
}

function start_socket(reconnect = false, embedded) {

    if (task_active_socket !== undefined) {
        if (task_active_socket.readyState !== WebSocket.OPEN) {
            console.log("CLARAMA_WEBSOCKET.JS resetting socket with state " + task_active_socket.readyState);
            task_active_socket.close();
            task_active_socket = undefined;
        }
    }

    if (task_active_socket === undefined) {
        let webSocket = new WebSocket(socket_address);

        task_active_socket = webSocket;
        console.log("CLARAMA_WEBSOCKET.JS start_socket " + task_active_socket);

        webSocket.onerror = function (event) {
            onError(event, socket_address, webSocket)
        };

        webSocket.onopen = function (event) {
            onOpen(event, socket_address, reconnect)
            processTaskMessages();
        };

        webSocket.onclose = function (event) {
            onClose(event, socket_address, webSocket, embedded)
        };

        webSocket.onmessage = function (event) {
            onMessage(event, socket_address, webSocket)
        };
    }
}

function run_socket(embedded, reset_environment) {
    let task = embedded.attr("task")
    let topic = embedded.attr("topic");

    embedded.attr("socket_time", Date.now());

    if (task !== undefined && topic !== undefined) {
        console.log("CLARAMA_WEBSOCKET.js: TASK " + task + " TOPIC " + topic + " RUNNING");
        socket_task(embedded, task, topic, reset_environment);
    }

    if (!socket_starting) {
        console.log("CLARAMA_WEBSOCKET.js: Starting WebSocket");
        socket_starting = true;
        let startingTopic = $("#currentUser").attr("username");

        if (socket_topics.indexOf(startingTopic) === -1) {
            socket_topics.push(startingTopic);
        }

        let socket_url = $CLARAMA_ROOT + $CLARAMA_WEBSOCKET_REGISTER + startingTopic;
        console.log("CLARAMA_WEBSOCKET.js:  SUBSCRIBING " + topic + " WebSocket " + socket_url);


        fetch(socket_url)
            .then((response) => response.json())
            .then((response) => {

                let server = response['results']['socket'] // USe the websocket-provided address
                let uuid = response['results']['uuid']
                let topic = response['results']['topic']

                if ($CLARAMA_WEBSOCKET_DYNAMIC === 'True') {
                    server = location.origin.replace(/^http/, 'ws') + '/ws/';
                    console.log("Using Dynamic Websocket address from browser origin " + server);
                } else
                    console.log("Using Preconfigured Websocket address " + server);

                let websocket_address = (server + uuid + '/');


                console.log("CLARAMA_WEBSOCKET.js: Creating " + socket_url + " Websocket on " + websocket_address + " for " + uuid);

                socket_address = websocket_address;
                start_socket(false, embedded)
            });
    }
}


// This function is called on document load to set up the websocket connection for a task
// It will expect the div to have the task, topic and results_id attributes set for:
// task: the task file to call the environments service with
// topic: the task topic to call the environments service with
// results_id the id of the div to paste the results back into
$.fn.enablesocket = function () {
    return this.each(function () {
        console.log("Enabling socket " + $(this).attr('id'))
        console.log($(this));
        let embedded = $(this);
        run_socket(embedded, false);
    });
}

function replace_keys(text, key_dict) {
    Object.entries(key_dict).forEach(([key, value]) => {
        if (key !== 'array') {
            //console.log('key ' + key);
            let replace_key = "{" + key + "_content}";
            const regEx = new RegExp(replace_key, "g");
            text = text.replace(regEx, value);
        }
    });

    return text;
}

// https://stackoverflow.com/questions/18673860/defining-a-html-template-to-append-using-jquery

function process_template(template_id, substitutions, target_div) {
    if (target_div === undefined) {
        console.warn("Skipping template " + template_id + ", target_div is undefined");
        return;
    }

    let template_object = $("template#" + template_id);

    if (template_object == null) {
        console.log("Template " + template_id + " not found");
    } else {
        //console.log("template#" + full_template_id);
        let template = template_object.html();
        let target_class = replace_keys(template_object.attr("target_class"), substitutions);

        //console.log("target_class: " + target_class || "")

        if (template == null)
            console.log("Template " + template_id + " not found");
        else {
            //console.log("Template " + template_id + " FOUND with " + substitutions);
            Object.entries(substitutions).forEach(([key, value]) => {
                if (key === 'array') {
                    const array_start = template.indexOf("<!--{array:start}-->");
                    const array_end = template.indexOf("<!--{array:end}-->");

                    const array_template = template.slice(array_start + 20, array_end - 1);
                    let array_result = "";
                    console.log("VALUE" + value);
                    try {
                        value.forEach((element) => array_result = array_result + array_template.replace("{array:value}", element));
                    } catch {
                    }

                    template = template.slice(0, array_start - 1) + array_result + template.slice(array_end + 18);
                } else {
                    //console.log('key ' + key);
                    let replace_key = "{" + key + "_content}";
                    const regEx = new RegExp(replace_key, "g");
                    template = template.replace(regEx, value);
                }
            });

            let target_id = target_div.attr("id") + '.' + target_class
            console.log('FINAL TARGET for Template: ' + target_div.attr("id") + '.' + target_class);
            let target = target_div.find('.' + target_class).first();

            if (target === undefined)
                console.log("Error, could not find class " + target_class + " on object #" + target_div.attr("id") + " for template " + template_id);
            else {
                let final_template = template.replace("<!--", "").replace("-->", "");
                console.log("FINAL TEMPLATE " + final_template + " sending to " + target);
                let $elements = $(final_template);
                target.append($elements);
                enable_interactions($elements);
            }
        }
    }
}

// On receipt of a websocket message from the server. The kernels will send messages of dicts
// in which one of the keys, "type" indicates the type of message, which then correlates with the HTML template to use
// to render that message
// Fixed section of onMessage function in CLARAMA_WEBSOCKET.js

function onMessage(event, socket_url, webSocket) {
    let dict = JSON.parse(event.data);

    if ('class' in dict) {
        console.log("WEBSOCKET.js: Processing Socket Message " + dict['class']);
        try {
            if (dict['class'] === "ping") {
                console.log('ping back ' + new Date() + ' ' + task_active_socket);
                task_active_socket.send('ping');
            }

            if (dict['class'] === "message" && dict['type'] === "task_interaction_resume") {
                console.log("WEBSOCKET.js: Received task_interaction_resume message");
                console.log(dict);
                handleTaskInteractionResume(dict);
            }

            if (dict['class'] === "layout") {
                var cols = dict['values']['width'];
                var rows = dict['values']['height'];
                let resulter = "#" + dict['step_id'];

                let tableHtml = '<table class="table table-bordered">';
                for (let r = 0; r < rows; r++) {
                    tableHtml += '<tr>';
                    for (let c = 0; c < cols; c++) {
                        var cell_class = dict['step_id'] + "_" + c + "_" + r;
                        tableHtml += '<td width="' + 1 / cols + '" id="' + cell_class + '"><span class="cell-results"></span></td>';
                    }
                    tableHtml += '</tr>';
                }
                tableHtml += '</table>';

                let target = $(resulter).find('.cell-results').first();
                let $elements = $(tableHtml);
                target.append($elements);

                console.log("CLARAMA_WEBSOCKET.js: Generated layout table with " + cols + " columns and " + rows + " rows");
            }

            if (dict['class'] === "alert") {
                flash(dict['message'], dict['category']);
            }

            if (dict['class'] === "template") {
                let output_text = dict['values']['output'];
                let step_id = dict['step_id'];

                console.log("Template message received - Step ID:", step_id, "Output:", output_text);

                // Extract task index from step_id (assuming format like "step_123")
                let taskIndex = null;
                if (step_id) {
                    let match = step_id.match(/step_(\d+)/);
                    if (match) {
                        taskIndex = match[1];
                    } else {
                        taskIndex = step_id.replace(/\D/g, ''); // Remove non-digits
                    }
                }

                if (taskIndex && output_text !== undefined) {
                    // Check for console callback first
                    let consoleCallbackKey = 'cell_debugger_console_callback_' + taskIndex;
                    let variablesCallbackKey = 'cell_debugger_variables_callback_' + taskIndex;
                    let generalCallbackKey = 'cell_debugger_callback_' + taskIndex;

                    if (typeof window[consoleCallbackKey] === "function") {
                        console.log("Found console callback, calling with output:", output_text);
                        try {
                            window[consoleCallbackKey](output_text);
                            delete window[consoleCallbackKey];
                        } catch (e) {
                            console.error("Error calling console debugger callback:", e);
                        }
                    } else if (typeof window[variablesCallbackKey] === "function") {
                        console.log("Found variables callback, calling with output:", output_text);
                        try {
                            window[variablesCallbackKey](output_text);
                            delete window[variablesCallbackKey];
                        } catch (e) {
                            console.error("Error calling variables debugger callback:", e);
                        }
                    } else if (typeof window[generalCallbackKey] === "function") {
                        console.log("Found general callback, calling with output:", output_text);
                        try {
                            window[generalCallbackKey](output_text);
                            delete window[generalCallbackKey];
                        } catch (e) {
                            console.error("Error calling general debugger callback:", e);
                        }
                    } else {
                        let debuggerCallbacks = Object.keys(window).filter(key => key.startsWith('cell_debugger_callback_'));
                        console.log("Available debugger callbacks:", debuggerCallbacks);

                        if (debuggerCallbacks.length === 1) {
                            console.log("Using single available callback:", debuggerCallbacks[0]);
                            try {
                                window[debuggerCallbacks[0]](output_text);
                                delete window[debuggerCallbacks[0]];
                            } catch (e) {
                                console.error("Error calling single debugger callback:", e);
                            }
                        } else {
                            console.log("No callback found, trying direct population for task:", taskIndex);
                            if (taskIndex) {
                                try {
                                    populateVariablesList(output_text, taskIndex);
                                } catch (e) {
                                    console.error("Error calling populateVariablesList directly:", e);
                                }
                            }
                        }
                    }
                }

                // Process the template normally
                let resulter = "#" + step_id;
                console.log("WEBSOCKET.js TEMPLATE RESULTER --[" + resulter + ']--' + $(resulter));
                process_template(dict['type'], dict['values'], $(resulter));
            }

            if (dict['class'] === "template_array") {
                Object.entries(dict['results']).forEach(([key, value]) => {
                    console.log("template_array for key " + key);
                    let new_dict = dict['values'] || {};
                    new_dict['array'] = value;
                    let resulter = "#" + dict['step_id'];
                    console.log("WEBSOCKET MESSAGE:" + dict['step_id']);
                    console.log("TEMPLATE ARRAY RESULTER --[" + resulter + ']--');
                    process_template(dict['type'], new_dict, $(resulter));
                });
            }

            if (dict['class'] === "template_table") {
                let resulter = "#" + dict['step_id'];
                console.log("CLARAMA_WEBSOCKET.js: WEBSOCKET TABLE MESSAGE:" + webSocket.url);
                process_template(dict['type'], dict['values'], $(resulter));
                bTable(dict['values']['table_id'], dict['results']);
            }

            if (dict['class'] === "template_chart") {
                let resulter = "#" + dict['step_id'];
                console.log("CLARAMA_WEBSOCKET.js: WEBSOCKET CHART MESSAGE:" + webSocket.url + " " + dict['step_id']);
                console.log($(resulter));
                process_template(dict['type'], dict['values'], $(resulter));
                bChart(dict['values']['chart_id'], dict['results']);
            }

            if (dict['type'] === 'task_step_started') {
                let spinner = "#" + dict['step_id'];
                $(spinner).find('.cell-spin').animate({"opacity": 1});
                if (dict['values']['clear'] == true) { // clear the cell output if 'clear' == true
                    $(spinner).find('.cell-results').empty();
                }
                $(spinner).find('.cell-timing').empty();
            }

            let task_progress = $('#task_progress_main');

            if (dict['type'] === 'task_step_completed' || dict['type'] === 'task_step_exception') {
                if ('step_number' in dict) {
                    if (dict['step_number'] > -1) {
                        let max = task_progress.attr("max");
                        task_progress.width((100 * dict['step_number'] / max).toString() + '%');
                    }
                }

                let spinner = "#" + dict['step_id'];
                $(spinner).find('.cell-spin').animate({"opacity": 0});

                if (dict['type'] === 'task_step_exception') {
                    task_progress.addClass("bg-danger");
                }
            }

        } catch (err) {
            console.log(err);
            console.log('CLARAMA_WEBSOCKET.js: exception raised processing:');
            console.log(dict);
        }
    } else if ('progress' in dict) {
        $('#task_progress_' + dict['stream']).attr('aria-valuenow', dict['step_number']);
    } else {
        console.log("CLARAMA_WEBSOCKET.js: WTF was this: " + dict);
    }

    console.log(task_active_socket);
}

function onOpen(event, socket_url, reconnect) {
    console.log('CLARAMA_WEBSOCKET.js: WebSocket Connection established ' + Date.now() + ' on ' + socket_url);
    let kernel_status = $('#kernel_status');
    kernel_status.add("bi-check-circle")
    kernel_status.add("text-success")
    kernel_status.remove("bi-hourglass-split")

    let playbutton = $('.kernel-play-button');

    playbutton.removeClass("btn-secondary")
    playbutton.addClass("btn-primary")

    if (reconnect) {
        console.log("Reconnecting " + reconnect);
        flash("SOCKET connected", "info");
    }
}

function onClose(event, socket_url, webSocket, embedded) {
    console.log('CLARAMA_WEBSOCKET.js: WebSocket Connection CLOSED ' + Date.now() + ' on ' + socket_url + " on socket " + webSocket);
    // flash("SOCKET lost", "danger");
    setTimeout(function () {
        socket_starting = false;
        run_socket(embedded, false);
    }, 100)
}

function onError(event, socket_url, webSocket) {
    console.log("CLARAMA_WEBSOCKET.js: WebSocket Error [" + event.data + "] from " + socket_url + " on socket " + webSocket);
    //alert("SOCKET error " + event.data, "danger");
}
