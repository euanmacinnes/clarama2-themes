/**
 * Set the active Clarama environment and (re)run the socket for the edit panel.
 *
 * Side effects:
 * - Updates UI labels (#kernel_status, #environment)
 * - Stores the selected environment on #edit_socket element
 * - Restarts websocket workflow by calling run_socket
 *
 * @param {string} environment - Environment name or id to activate.
 */
function set_environment(environment) {
    flash("Changing environment to " + environment);
    $('#edit-kernel-status').html('Loading');
    $('#environment').html('...');

    let socket_element = $("#edit_socket");
    socket_element.attr("environment", environment);
    socket_starting = false;
    run_socket(socket_element, true, false);
}

/**
 * Reset the currently selected environment and restart the kernel.
 *
 * Side effects:
 * - Shows a restarting message
 * - Forces refresh flag and restarts websocket workflow
 *
 * @param {string} environment - Environment name or id to reset.
 */
function reset_environment(environment) {
    flash("Resetting environment to " + environment);
    $('#edit-kernel-status').html('Restarting..');
    $('#environment').html('...');
    let socket_element = $("#edit_socket");
    socket_element.attr("environment", environment);
    socket_element.attr("refresh", true);
    socket_starting = false;
    run_socket(socket_element, false, true);
}

let task_active_socket = undefined;

let socket_address = '';

let socket_starting = false;

let socket_taskQueue = [];

let socket_topics = ['clarama-systemwide'];

/**
 * Send the current topic subscriptions to the active websocket.
 * Requires an open task_active_socket.
 */
function topic_subscribe() {
    // console.log("CLARAMA_WEBSOCKET.JS registering topics. This is universal for ALL socket divs, as there is only ONE actual websocket on the page");
    // console.log(socket_topics);
    task_active_socket.send(JSON.stringify({topics: socket_topics}));
}

/**
 * Subscribe to topics and flush the queued task messages once the socket is open.
 */
function processTaskMessages() {
    topic_subscribe();

    socket_taskQueue.forEach(message => {
        get_task(message.embedded, message.task_url, message.socket_id, message.autorun, message.kernel_status);
    });
    socket_taskQueue = [];
}


/**
 * Send the current topic subscriptions to the active websocket.
 * Requires an open task_active_socket.
 */
function update_topics(topic) {
    if (task_active_socket !== undefined)
        if (task_active_socket.readyState === WebSocket.OPEN) {
            // console.log("CLARAMA_WEBSOCKET.JS updating universal topics for page to " + socket_topics);
            task_active_socket.send(JSON.stringify({topics: socket_topics}));
            return;
        } else {
            console.warn("CLARAMA_WEBSOCKET.js: update_topic socket was not open");
        }
    else {
        console.warn("CLARAMA_WEBSOCKET.js: update_topic  socket undefined, pushing on queue");
    }
}

/**
 * Subscribe to topic
 */
function add_topic(topic) {
    if (socket_topics.indexOf(topic) === -1) {
        socket_topics.push(topic);
        //console.log("CLARAMA_WEBSOCKET.js: ADD TOPIC " + topic);
        //console.log(socket_topics);
    }
    update_topics(topic);
}

/**
 * Unsubscribe from topic
 */
function remove_topic(topic) {
    const idx = socket_topics.indexOf(topic);
    if (idx !== -1) {
        socket_topics.splice(idx, 1);
        //console.log("CLARAMA_WEBSOCKET.js: REMOVE TOPIC " + topic);
        //console.log(socket_topics);
    }

    update_topics(topic);
}

/**
 * Queue or immediately execute a task message depending on socket state.
 *
 * @param {string} topic - Topic to subscribe for this task.
 * @param {JQuery} embedded - jQuery-wrapped element holding attributes for the task.
 * @param {string} task_url - Fully formed URL to obtain a kernel and task metadata.
 * @param {string} socket_id - Id of the socket DOM element.
 * @param {string|boolean} autorun - Whether to auto-run the task when ready.
 */
function enqueueTaskMessage(topic, embedded, task_url, socket_id, autorun, kernel_status) {
    add_topic(topic);

    let task_message = {
        'topic': topic,
        'embedded': embedded,
        'task_url': task_url,
        'socket_id': socket_id,
        'autorun': autorun,
        'kernel_status': kernel_status,
    };

    // If the socket is open, execute immediately; otherwise, queue for later
    try {
        if (task_active_socket && task_active_socket.readyState === WebSocket.OPEN) {
            get_task(task_message.embedded, task_message.task_url, task_message.socket_id, task_message.autorun, task_message.kernel_status);
            return;
        }
    } catch (e) {
        // fall back to queueing
    }

    socket_taskQueue.push(task_message);
}

/**
 * Resolve task prerequisites and handle wait-interaction orchestration before executing a task.
 *
 * - Parses the topic for element id
 * - Checks for links with wait=true to defer execution until a resume message arrives
 *
 * @param {JQuery} embedded
 * @param {string} task_url
 * @param {string} socket_id
 * @param {string|boolean} autorun
 */
function get_task(embedded, task_url, socket_id, autorun, kernel_status) {
    //console.log("CLARAMA_WEBSOCKET.js: GET TASK " + task_url + " getting, with kernel_status " + kernel_status);

    const topic = new URLSearchParams(task_url.split('?')[1]).get('topic');
    let element_id = null;

    if (topic) {
        const match = topic.match(/element_(\d+)_/);
        if (match) {
            element_id = parseInt(match[1], 10);
        }
    }

    // console.log('current_elem: ', element_id);
    let elementsObjects = [];

    for (let prop in window) {
        if (prop.endsWith('elements') && typeof window[prop] === 'object' && window[prop] !== null) {
            if (!elementsObjects.find(item => item.name === prop)) {
                elementsObjects.push({name: prop, obj: window[prop]});
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
                    //console.log(`Element "${targetId}" has ${waitInteractions.length} wait interaction(s):`);
                    waitInteractions.forEach((interaction, index) => {
                        console.log(`  [${index + 1}] UID: ${interaction.uid || 'N/A'}, Element: ${interaction.element || 'N/A'}`);
                    });
                } else {
                    //console.log(`Element "${targetId}" has no wait interactions (${elementData.links.length} total interactions)`);
                }
            } else {
                //console.log(`Element "${targetId}" has no links/interactions`);
            }
        } else {
            console.warn(`Element "${targetId}" not found in ${elementsData.name}`);
        }
    });

    // If there are wait interactions, set up waiting mechanism
    if (waitInteractions.length > 0) {
        //console.log(`CLARAMA_WEBSOCKET.js: Element ${element_id} waiting for ${waitInteractions.length} interactions to resume`);

        // Store the pending task execution details
        const pendingTaskKey = `pendingTask_${element_id}`;
        window[pendingTaskKey] = {
            embedded: embedded,
            task_url: task_url,
            socket_id: socket_id,
            autorun: autorun,
            kernel_status: kernel_status,
            waitingFor: waitInteractions.map(interaction => interaction.element),
            resumedFrom: new Set() // Track which elements have sent resume messages
        };

        console.log(`CLARAMA_WEBSOCKET.js: GET TASK Task execution for element ${element_id} deferred until resume messages received from:`,
            window[pendingTaskKey].waitingFor);

        // Don't proceed with task execution - wait for resume messages
        return;
    }

    // No wait interactions - proceed with normal task execution
    executeTask(embedded, task_url, socket_id, autorun, kernel_status);
}

/**
 * Execute a task by calling the task_url. On success, stores kernel id/environment and updates UI.
 * Triggers _task_run if autorun === 'True'.
 *
 * @param {JQuery} embedded
 * @param {string} task_url
 * @param {string} socket_id
 * @param {string|boolean} autorun
 */
function executeTask(embedded, task_url, socket_id, autorun, kernel_status) {
    var fetch_options = {
        method: 'POST',
        body: JSON.stringify({}),
        headers: {
            'Content-Type': 'application/json'
        }
    };
    fetch(task_url, fetch_options)
        .then((response) => {
            if (response.ok) {
                // console.log("CLARAMA_WEBSOCKET.js: TASK " + task_url + " response " + response.status);
                return response.json();
            }

            console.error("WEBSOCKET executeTask ERROR calling", task_url, response);
            return Promise.reject(response);
        })
        .then((task_response) => {
            if (task_response['data'] == 'error')
                alert(task_response['error'] + ' on ' + task_url);

            // console.log(JSON.stringify(task_response, null, 2));
            let kernel_id = task_response['results']['kernel_id'];
            let task_environment = task_response['results']['environment_name'];
            let environment_file = task_response['results']['environment'];

            if (kernel_id === undefined)
                console.error('undefined kernel for ' + task_url, task_response);


            embedded.attr('task_kernel_id', kernel_id);
            //console.log("CLARAMA_WEBSOCKET.js: EXECUTE TASK " + task_url + " connected to kernel " + kernel_id)

            let active_selector = ('#environment_' + environment_file).replaceAll('.', "_");

            let kernel_ready = embedded.attr('onkernel');

            if (kernel_ready !== undefined) {
                window[kernel_ready](kernel_id, task_environment, environment_file);
            }

            if (kernel_status !== undefined) {
                $("#" + kernel_status).html(kernel_id);

                if (!kernel_status.includes('gina'))
                    $("#environment").html(task_environment);
            }
            $(".environments").removeClass('active');
            $(active_selector).addClass('active');

            if (autorun === 'True') {
                _task_run(socket_id);
            }
        })
        .catch((error) => {
            flash('WEBSOCKET TASK ' + task_url + " error " + error, category = 'danger');
        });
}

/**
 * Handle task_interaction_resume messages to unblock pending tasks waiting on other elements.
 *
 * @param {{step_id: string, instance?: string}} resumeMessage - Message containing the originating element id.
 */
function handleTaskInteractionResume(resumeMessage) {
    const {step_id, instance} = resumeMessage;

    let resumingElementId = null;
    if (step_id) {
        const match = step_id.match(/(?:step_|element_)(\d+)/);
        if (match) {
            resumingElementId = `element_${match[1]}`;
        }
    }

    if (!resumingElementId) {
        console.error("CLARAMA_WEBSOCKET.js: Could not extract element ID from step_id:", step_id);
        return;
    }

    // console.log(`CLARAMA_WEBSOCKET.js: Received task_interaction_resume from ${resumingElementId}`);

    // Check all pending tasks to see which ones are waiting for this element
    for (let prop in window) {
        if (prop.startsWith('pendingTask_')) {
            const pendingTask = window[prop];
            const waitingElementId = prop.replace('pendingTask_', 'element_');

            if (pendingTask && pendingTask.waitingFor && pendingTask.waitingFor.includes(resumingElementId)) {
                // console.log(`CLARAMA_WEBSOCKET.js: Element ${waitingElementId} was waiting for ${resumingElementId}`);

                // Mark this element as resumed
                pendingTask.resumedFrom.add(resumingElementId);

                //console.log(`CLARAMA_WEBSOCKET.js: Element ${waitingElementId} has received resume from:`,
                    Array.from(pendingTask.resumedFrom));
                //console.log(`CLARAMA_WEBSOCKET.js: Element ${waitingElementId} still waiting for:`,
                    pendingTask.waitingFor.filter(elem => !pendingTask.resumedFrom.has(elem)));

                // Check if all required elements have sent resume messages
                const allResumed = pendingTask.waitingFor.every(elem => pendingTask.resumedFrom.has(elem));

                if (allResumed) {
                    //console.log(`CLARAMA_WEBSOCKET.js: All wait interactions complete for ${waitingElementId}, proceeding with task execution`);
                    executeTask(pendingTask.embedded, pendingTask.task_url, pendingTask.socket_id, pendingTask.autorun, pendingTask.kernel_status);

                    // Clean up the pending task
                    delete window[prop];
                } else {
                    //console.log(`CLARAMA_WEBSOCKET.js: Element ${waitingElementId} still waiting for more resume messages`);
                }
            }
        }
    }
}

/**
 * Build the task_url and enqueue it for execution, adding environment and kernel refresh flags.
 *
 * @param {JQuery} embedded
 * @param {string} task
 * @param {string} topic
 * @param {boolean} refresh_kernel - Forces reusing a fresh kernel for the task.
 * @param {boolean} reset_environment - Whether to reset environment (pod) before executing task.
 */
function socket_task(embedded, task, topic, refresh_kernel, reset_environment) {
    let mode = embedded.attr("mode"); // For passing internally to the kernel, so that the kernel knows it's original mode
    let autorun = embedded.attr("autorun");
    let socket_id = embedded.attr("id");
    let refresh = embedded.attr("refresh");
    let environment = embedded.attr("environment");
    let task_new = embedded.attr("task_new");
    let task_type = embedded.attr("task_type");
    let task_kernel_status = embedded.attr("kernel-status");
    let env_url = '';
    if (environment !== undefined) {
        env_url = '&environment=' + environment;

        //refresh = true;
        //console.log("CLARAMA_WEBSOCKET.js: overriding environment with " + env_url);
    }

    if (refresh_kernel === true) refresh = true;

    let playbutton = $('.kernel-play-button');

    playbutton.addClass("btn-secondary")
    playbutton.removeClass("btn-primary")

    let task_url = $CLARAMA_ROOT + $CLARAMA_ENVIRONMENTS_TASK_OPEN + task
        + '?topic=' + topic
        + '&mode=' + mode
        + '&refresh=' + refresh
        + '&reset-environment=' + reset_environment + env_url
        + '&task_new=' + task_new
        + '&task_type=' + task_type;

    enqueueTaskMessage(topic, embedded, task_url, socket_id, autorun, task_kernel_status);
}

/**
 * Open a websocket if none exists; attach event handlers and process queued tasks.
 * If an existing socket is not OPEN, it will be closed and replaced.
 *
 * @param {boolean} [reconnect=false] - Whether this is a reconnect attempt.
 * @param {JQuery} embedded - Element used by downstream run_socket on reconnects.
 */
function start_socket(reconnect = false, embedded) {

    if (task_active_socket !== undefined) {
        if (task_active_socket.readyState !== WebSocket.OPEN) {
            //console.log("CLARAMA_WEBSOCKET.JS resetting socket with state " + task_active_socket.readyState);
            task_active_socket.close();
            task_active_socket = undefined;
        }
    }

    if (task_active_socket === undefined) {
        let webSocket = new WebSocket(socket_address);

        task_active_socket = webSocket;
        //console.log("CLARAMA_WEBSOCKET.JS start_socket " + task_active_socket);

        webSocket.onerror = function (event) {
            onError(event, socket_address, webSocket, embedded)
        };

        webSocket.onopen = function (event) {
            onOpen(event, socket_address, reconnect, embedded)
            processTaskMessages();
        };

        webSocket.onclose = function (event) {
            onClose(event, socket_address, webSocket, embedded)
        };

        webSocket.onmessage = function (event) {
            onMessage(event, socket_address, webSocket, embedded)
        };
    }
}

/**
 * Initializes and manages the WebSocket connection using the provided embedded element and configuration.
 * It sets up socket connection details, manages task and topic subscriptions, and initiates WebSocket communication.
 *
 * @param {Object} embedded - The embedded HTML element used as the source for WebSocket tasks and topics.
 * @param {boolean} refresh_kernel - Indicates whether a kernel refresh is requested for the initial task.
 * @param {boolean} reset_environment - Indicates whether the WebSocket environment should be reset before establishing a connection.
 * @return {void} This function does not return any value.
 */
function run_socket(embedded, refresh_kernel, reset_environment) {
    let task = embedded.attr("task")
    let topic = embedded.attr("topic");

    embedded.attr("socket_time", Date.now());

    if (task !== undefined && topic !== undefined) {
        console.log("CLARAMA_WEBSOCKET.js: RUN SOCKET " + task + " TOPIC " + topic + " RUNNING");
        socket_task(embedded, task, topic, refresh_kernel, reset_environment);
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
                start_socket(false, embedded);
            });
    }
}


// This function is called on document load to set up the websocket connection for a task
// It will expect the div to have the task, topic and results_id attributes set for:
// task: the task file to call the environments service with
// topic: the task topic to call the environments service with
// results_id the id of the div to paste the results back into
/**
 * jQuery plugin to initialize socket behavior on selected elements.
 * Expects attributes: task, topic on the element.
 */
$.fn.enablesocket = function () {
    return this.each(function () {
        console.log("Enabling socket " + $(this).attr('id'))
        console.log($(this));
        let embedded = $(this);
        run_socket(embedded, false);
    });
}

/**
 * Replace {key_content} tokens in a string using values in key_dict.
 *
 * @param {string} text - Template text containing tokens.
 * @param {Object} key_dict - Replacement map.
 * @returns {string} Processed text.
 */
function replace_keys(text, key_dict) {
    if (text === undefined || text === '' || text === null) return text;

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

/**
 * Render a <template> by id into the target_div, performing token substitutions.
 * Supports array blocks delimited by <!--{array:start}--> ... <!--{array:end}-->.
 *
 * @param {string} template_id - The template element id.
 * @param {Object} substitutions - Key/value pairs, plus optional 'array' key as an array of values.
 * @param {JQuery} target_div - jQuery target element to append rendered content into.
 */
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

// ---- Element protocol helpers ----
function _findElementRootByName(name) {
    // Prefer elements marked with data-element-name
    let $root = $("[data-element-name='" + name + "']");
    if ($root.length === 0) {
        // Fallback to id selector
        $root = $("#" + name);
    }
    return $root;
}

function _readFieldValue($field) {
    if (!$field || $field.length === 0) return null;
    const type = ($field.attr('type') || '').toLowerCase();
    const tag = ($field.prop('tagName') || '').toLowerCase();

    if (type === 'checkbox') return $field.prop('checked');
    if (tag === 'select') return $field.val();
    return $field.val();
}

function _writeFieldValue($field, value) {
    if (!$field || $field.length === 0) return false;
    const type = ($field.attr('type') || '').toLowerCase();
    const tag = ($field.prop('tagName') || '').toLowerCase();

    if (type === 'checkbox') {
        $field.prop('checked', !!value).trigger('change');
        return true;
    }
    if (tag === 'select') {
        $field.val(value).trigger('change');
        if ($field.hasClass('select2-hidden-accessible')) {
            $field.trigger('change.select2');
        }
        return true;
    }
    $field.val(value).trigger('input').trigger('change');
    return true;
}

function _postKernelCode(kernelId, request_id, code, topic) {
    const url = $CLARAMA_ROOT + $CLARAMA_ENVIRONMENTS_KERNEL_RUN + kernelId;
    const payload = {
        streams: [{
            main: [{
                type: 'request',
                topic: topic || '',
                request_id: request_id,
                content: code
            }]
        }],
        parameters: {}
    };
    return fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
}

function handleElementMessage(dict, socket_div) {
    const name = dict.name;
    const action = dict.action;
    const field = dict.field;
    const request_id = dict.request_id;

    const kernelId = socket_div.attr('task_kernel_id');
    const topic = socket_div.attr('topic') || '';

    if (!action) return;

    // Actions that require a named root element
    const $root = name ? _findElementRootByName(name) : null;

    if (action === 'bind') {
        // no-op for now; could highlight or verify presence
        return;
    }

    if (action === 'set') {
        if (!$root || $root.length === 0) return;
        const $field = field ? $root.find("[name='" + field + "']").first() : $root.find('input,select,textarea').first();
        _writeFieldValue($field, dict.value);
        return;
    }

    if (action === 'get') {
        if (!kernelId) {
            console.warn('Element get: missing kernel id on socket div');
            return;
        }
        if (!$root || $root.length === 0) return;
        const $field = field ? $root.find("[name='" + field + "']").first() : $root.find('input,select,textarea').first();
        const value = _readFieldValue($field);

        _postKernelCode(kernelId, request_id, value, topic);
        return;
    }

    if (action === 'list') {
        if (!kernelId) {
            console.warn('Element list: missing kernel id on socket div');
            return;
        }
        // Find all elements with class 'clarama-field'
        const names = [];
        $('.clarama-field').each(function () {
            const $el = $(this);
            const n = $el.attr('data-element-name') || $el.attr('id') || $el.attr('name');
            if (n) names.push(n);
        });
        const unique = Array.from(new Set(names));
        _postKernelCode(kernelId, request_id, JSON.stringify(unique), topic);
        return;
    }
}

// Simple global stream dispatcher to allow components to receive raw stream frames via the central websocket
window.ClaramaStream = window.ClaramaStream || (function () {
    const handlers = {}; // topic -> Set<function>

    function register(topic, fn) {
        const t = topic || '*';
        console.log('ClaramaStream.register', t, fn, handlers);
        if (!handlers[t]) handlers[t] = new Set();
        handlers[t].add(fn);
        return function unregister() {
            try {
                const set = handlers[t];
                if (set) set.delete(fn);
            } catch (e) {
                // noop
            }
        };
    }

    function dispatch(topic, msg) {
        const t = topic || '*';
        console.log('ClaramaStream.dispatch', t, msg, handlers);
        const hs = handlers[t];
        if (hs && hs.forEach) {
            hs.forEach(fn => {
                try {
                    fn(msg, t);
                } catch (e) {
                    console.error('Stream handler error', e);
                }
            });
        }
        // Also dispatch to wildcard handlers
        if (t !== '*') {
            const ws = handlers['*'];
            if (ws && ws.forEach) {
                ws.forEach(fn => {
                    try {
                        fn(msg, t);
                    } catch (e) {
                        // noop
                    }
                });
            }
        }
    }

    return {register, dispatch};
})();

// On receipt of a websocket message from the server. The kernels will send messages of dicts
// in which one of the keys, "type" indicates the type of message, which then correlates with the HTML template to use
// to render that message
// Fixed section of onMessage function in CLARAMA_WEBSOCKET.js

/**
 * WebSocket onmessage handler. Routes messages by class/type and updates UI accordingly.
 * Handles: ping, layout, alerts, template(s), charts/tables, task progress, and resume events.
 *
 * @param {MessageEvent} event
 * @param {string} socket_url
 * @param {WebSocket} webSocket
 */
function onMessage(event, socket_url, webSocket, socket_div) {
    // Detect simple heartbeat pong messages before any JSON parsing
    try {
        if (typeof event.data === 'string') {
            const trimmed = event.data.trim().toLowerCase();
            if (trimmed === 'pong') {
                // Received pong heartbeat; no further action required
                console.log('CLARAMA_WEBSOCKET.js: Received pong heartbeat');
                return;
            }
        }
    } catch (e) { /* noop */
    }

    let dict;
    try {
        dict = JSON.parse(event.data);
    } catch (e) {
        // Not JSON (e.g., control frames or plain text heartbeat); ignore
        return;
    }
    //console.log("WEBSOCKET.js: onMessage " + dict['class']);
    // console.log("dict: ", dict);

    let message_event = socket_div.attr('onmessage');

    if (message_event !== undefined) {
        dict = window[message_event](dict, socket_url, webSocket, socket_div);

        if (dict === undefined)
            return;

        console.log("Message event: ", dict);
    }

    if ('class' in dict) {
        //console.log("WEBSOCKET.js: Processing Socket Message " + dict['class']);
        try {
            if (dict['class'] === "ping") {
                //console.log('ping back ' + new Date() + ' ' + task_active_socket);
                task_active_socket.send('ping');
            }

            if (dict['class'] === "message" && dict['type'] === "task_interaction_resume") {
                console.log("WEBSOCKET.js: Received task_interaction_resume message");
                console.log(dict);
                handleTaskInteractionResume(dict);
            }

            if (dict['class'] === 'element') {
                handleElementMessage(dict, socket_div);
                return;
            }

            if (dict['class'] === "file") {
                // Dispatch global window events for file messages
                try {
                    //flash(JSON.stringify(dict));
                    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                        window.dispatchEvent(new CustomEvent('clarama:file', {detail: dict}));
                        if (dict['action']) {
                            window.dispatchEvent(new CustomEvent('clarama:file:' + dict['action'], {detail: dict}));
                        }
                    }
                } catch (e) {
                }
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


            if (dict['class'] === "insights_inspector_template") {
                const stepId = String(dict.step_id || "");
                const m = stepId.match(/step_(\d+)/);
                const taskIndex = m ? m[1] : stepId.replace(/\D/g, "");

                const output = (dict && dict.values && typeof dict.values.output !== 'undefined')
                    ? dict.values.output
                    : (typeof dict.output !== 'undefined' ? dict.output : "");
                let chunk = Array.isArray(output) ? output.join("") : (output != null ? String(output) : "");
                chunk = html_decode(chunk);
                if (taskIndex && window.__claramaRunIntent && window.__claramaRunIntent[taskIndex]) {
                    window.__claramaRunIntent[taskIndex].sawChat = true;
                }

                const cbInspect = "cell_insights_inspect_callback_" + taskIndex;

                if (typeof window[cbInspect] === "function") {
                    try {
                        window[cbInspect](chunk);
                    } catch (e) {
                        console.error(e);
                    }
                    return; // handled by code console (keep callback for subsequent chunks)
                }
            }

            if (dict['class'] === "insights_code_template") {
                const stepId = String(dict.step_id || "");
                const m = stepId.match(/step_(\d+)/);
                const taskIndex = m ? m[1] : stepId.replace(/\D/g, "");

                const output = (dict && dict.values && typeof dict.values.output !== 'undefined')
                    ? dict.values.output
                    : (typeof dict.output !== 'undefined' ? dict.output : "");
                let chunk = Array.isArray(output) ? output.join("") : (output != null ? String(output) : "");
                chunk = html_decode(chunk);

                const cbCode = "cell_insights_code_callback_" + taskIndex;

                if (typeof window[cbCode] === "function") {
                    try {
                        window[cbCode](chunk);
                    } catch (e) {
                        console.error(e);
                    }
                    return; // handled by code console (keep callback for subsequent chunks)
                }
            }

            if (dict['class'] === "insights_variables_template") {
                const stepId = String(dict.step_id || "");
                const m = stepId.match(/step_(\d+)/);
                const taskIndex = m ? m[1] : stepId.replace(/\D/g, "");

                const output = (dict && dict.values && typeof dict.values.output !== 'undefined')
                    ? dict.values.output
                    : (typeof dict.output !== 'undefined' ? dict.output : "");
                let chunk = Array.isArray(output) ? output.join("") : (output != null ? String(output) : "");
                chunk = html_decode(chunk);

                const cbVars = "cell_insights_variables_callback_" + taskIndex;

                // Otherwise deliver to variables
                if (typeof window[cbVars] === "function") {
                    try {
                        window[cbVars](chunk);
                    } catch (e) {
                        console.error(e);
                    }
                    return; // handled by variables (keep callback for subsequent chunks)
                }
            }

            if (dict['class'] === "insights_chat_template") {
                const stepId = String(dict.step_id || "");
                const m = stepId.match(/step_(\d+)/);
                const taskIndex = m ? m[1] : stepId.replace(/\D/g, "");

                if (taskIndex && window.__claramaRunIntent && window.__claramaRunIntent[taskIndex]) {
                    window.__claramaRunIntent[taskIndex].sawChat = true;
                }

                const output = (dict && dict.values && typeof dict.values.output !== 'undefined')
                    ? dict.values.output
                    : (typeof dict.output !== 'undefined' ? dict.output : "");
                let chunk = Array.isArray(output) ? output.join("") : (output != null ? String(output) : "");
                chunk = html_decode(chunk);

                if (taskIndex) {
                    const cbChat = "cell_insights_chat_callback_" + taskIndex;

                    // If a chat stream callback is already active, just deliver the chunk.
                    if (typeof window[cbChat] === "function") {
                        try {
                            window[cbChat](chunk);
                        } catch (e) {
                            console.error(e);
                        }
                        return; // handled by chat (keep callback for subsequent chunks)
                    }

                    try {
                        // Open insights if closed
                        if (!isInsightsOpen(taskIndex)) {
                            const $cell = getCellByTask(taskIndex);
                            if ($cell && $cell.length) {
                                openInsights($cell, taskIndex);
                            }
                        }

                        // Ensure the Chat tab is active
                        const chatBtnId = `insights-chat-tab-${taskIndex}`;
                        const chatBtn = document.getElementById(chatBtnId);
                        if (chatBtn) {
                            const Tab = (window.bootstrap && window.bootstrap.Tab) ? window.bootstrap.Tab : null;
                            if (Tab) {
                                Tab.getOrCreateInstance(chatBtn).show();
                            } else {
                                chatBtn.click?.();
                            }
                        }

                        // After opening + tab switch, try to deliver chunk again if a callback is now wired
                        const cbChatNow = "cell_insights_chat_callback_" + taskIndex;
                        if (typeof window[cbChatNow] === "function") {
                            try {
                                window[cbChatNow](chunk);
                            } catch (e) {
                                console.error(e);
                            }
                            return;
                        }
                    } catch (e) {
                        console.error("Auto-open Insights for chat failed:", e);
                    }
                }

                return; // nothing to deliver
            }

            if (dict['class'] === "progress_bar") {
                let resulter = "#" + dict['step_id'];

                console.log("WEBSOCKET.js: PROGRESS BAR Received progress_bar message", dict, $(resulter));
                const id = dict['id'];
                const percentVal = (dict['percent'] != null) ? Math.round(dict['percent']) : 0;
                const sub = {
                    id: id,
                    title: dict['title'] || 'Working',
                    percent: percentVal,
                    elapsed: (dict['elapsed_sec'] != null) ? dict['elapsed_sec'].toFixed(1) : '0.0',
                    avg: (dict['avg_per_item_sec'] != null) ? dict['avg_per_item_sec'].toFixed(2) : '0.00',
                    eta: (dict['eta_sec'] != null) ? dict['eta_sec'].toFixed(1) : '—'
                };
                if (dict['event'] === 'show') {
                    // create if not exists
                    if ($(`#pb_${id}`).length === 0) {
                        process_template('progress_bar_item', sub, $(resulter));
                    }
                }
                if (dict['event'] === 'show' || dict['event'] === 'update') {
                    // update fields
                    $(`#pb_${id}_bar`).css('width', `${percentVal}%`);
                    $(`#pb_${id}_percent`).text(`${percentVal}%`);
                    $(`#pb_${id}_elapsed`).text(`t: ${sub.elapsed}s`);
                    $(`#pb_${id}_avg`).text(`avg: ${sub.avg}s`);
                    $(`#pb_${id}_eta`).text(`eta: ${sub.eta}s`);
                }
                if (dict['event'] === 'hide') {
                    const card = $(`#pb_${id}`);
                    card.fadeOut(400, function () {
                        $(this).remove();
                    });
                }
            } else if (dict['class'] === "template") {
                let output_text = dict['values']['output'];
                let step_id = dict['step_id'];

                console.log("Template message received - ", dict['type'], "Step ID:", step_id, "Output:", output_text);

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

            if (dict['class'] === "template_table_stream") {
                let resulter = "#" + dict['step_id'];
                console.log("CLARAMA_WEBSOCKET.js: WEBSOCKET TABLE MESSAGE:" + webSocket.url);
                process_template(dict['type'], dict['values'], $(resulter));
                var options = dict['values']
                var handle = bTableStream(dict['values']['table_id'], options);
                console.log("WEBSOCKET TABLE STREAM OPTIONS: ");
                console.log(options);
                add_topic(options['topic'])
                startLiveStream(false, options['query'], options['topic'], options['url']);

            }

            if (dict['class'] === "template_chart_stream") {
                let resulter = "#" + dict['step_id'];
                console.log("CLARAMA_WEBSOCKET.js: WEBSOCKET CHART MESSAGE:" + webSocket.url + " " + dict['step_id']);
                console.log($(resulter));
                process_template(dict['type'], dict['values'], $(resulter));
                bChartStream(dict['values']['chart_id'], dict['values']);
            }

            if (dict['class'] === "template_chart3d") {
                let resulter = "#" + dict['step_id'];
                console.log("CLARAMA_WEBSOCKET.js: WEBSOCKET CHART3D MESSAGE:" + webSocket.url + " " + dict['step_id']);
                console.log($(resulter));
                process_template(dict['type'], dict['values'], $(resulter));
                bChart3d(dict['values']['chart_id'], dict['results']);
            }

            if (dict['class'] === 'task_memory') {
                $("#kernel_memory_free").text(dict['values']['free'] + '%');
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
                    const stepId = String(dict.step_id || "");
                    const mStep = stepId.match(/step_(\d+)/);
                    const taskIndex = mStep ? mStep[1] : stepId.replace(/\D/g, "");
                    if (taskIndex && window.__claramaRunIntent && window.__claramaRunIntent[taskIndex]) {
                        window.__claramaRunIntent[taskIndex].sawException = true;
                    }
                }

                // Auto-close Insights after a successful run if no chat arrived
                try {
                    if (dict['type'] === 'task_step_completed') {
                        const stepId = String(dict.step_id || "");
                        const mStep = stepId.match(/step_(\d+)/);
                        const taskIndex = mStep ? mStep[1] : stepId.replace(/\D/g, "");

                        if (taskIndex && window.__claramaRunIntent && window.__claramaRunIntent[taskIndex]) {
                            const intent = window.__claramaRunIntent[taskIndex];
                            if (intent.hadInsightsOpen && !intent.sawChat && !intent.sawException) {
                                closeAllinsights();
                            }
                            delete window.__claramaRunIntent[taskIndex];
                        }
                    }
                } catch (e) {
                    console.error('Post-run Insights autoclose failed', e);
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
        // Attempt to route raw stream frames (start/chunk/end/error) through ClaramaStream
        try {
            if (dict.type === 'start' || dict.type === 'chunk' || dict.type === 'end' || dict.type === 'error') {
                const t = dict.topic;
                console.log("CLARAMA_WEBSOCKET.js: Routing raw stream frame to ClaramaStream", dict, t);
                if (window.ClaramaStream && typeof window.ClaramaStream.dispatch === 'function') {
                    window.ClaramaStream.dispatch(t, dict);
                    return;
                }
            }
        } catch (e) { /* fallthrough to log */
            console.error('CLARAMA_WEBSOCKET.js ClaramaStream error', e);
        }
        console.log("CLARAMA_WEBSOCKET.js: WTF was this: ", dict);
    }

    //console.log(task_active_socket);
}

/**
 * WebSocket onopen handler. Updates UI and announces reconnection.
 *
 * @param {Event} event
 * @param {string} socket_url
 * @param {boolean} reconnect
 */
function onOpen(event, socket_url, reconnect, socket_div) {
    console.log('CLARAMA_WEBSOCKET.js: WebSocket Connection established ' + Date.now() + ' on ' + socket_url);
    let kernel_status = $('#kernel_status');
    kernel_status.add("bi-check-circle")
    kernel_status.add("text-success")
    kernel_status.remove("bi-hourglass-split")

    let opened_event = socket_div.attr('onopen');

    if (opened_event !== undefined) {
        console.log("Opening event: " + opened_event);
        window[opened_event]();
    }

    let playbutton = $('.kernel-play-button');

    playbutton.removeClass("btn-secondary")
    playbutton.addClass("btn-primary")

    if (reconnect) {
        console.log("Reconnecting " + reconnect);
        flash("SOCKET connected", "info");
    }
}

/**
 * WebSocket onclose handler. Schedules a quick reconnect via run_socket.
 *
 * @param {CloseEvent} event
 * @param {string} socket_url
 * @param {WebSocket} webSocket
 * @param {JQuery} embedded
 */
function onClose(event, socket_url, webSocket, socket_div) {
    console.log('CLARAMA_WEBSOCKET.js: WebSocket Connection CLOSED ' + Date.now() + ' on ' + socket_url + " on socket " + webSocket);
    // flash("SOCKET lost", "danger");
    setTimeout(function () {
        socket_starting = false;
        run_socket(socket_div, false);
    }, 100)
}

/**
 * WebSocket onerror handler. Logs the error.
 *
 * @param {Event} event
 * @param {string} socket_url
 * @param {WebSocket} webSocket
 */
function onError(event, socket_url, webSocket, socket_div) {
    console.log("CLARAMA_WEBSOCKET.js: WebSocket Error [" + event.data + "] from " + socket_url + " on socket " + webSocket);
    //alert("SOCKET error " + event.data, "danger");
}


// Ensure global access to topic management functions, including alias for common typo
(function () {
    if (typeof window !== 'undefined') {
        try {
            window.add_topic = window.add_topic || add_topic;
        } catch (e) {
            // ignore if not defined yet
        }
        try {
            window.remove_topic = window.remove_topic || remove_topic;
        } catch (e) {
        }

        window.onClaramaFileEvent = function (actionOrHandler, handler) {
            const isAction = typeof actionOrHandler === 'string';
            const ev = isAction ? ('clarama:file:' + actionOrHandler) : 'clarama:file';
            const fn = isAction ? handler : actionOrHandler;
            if (typeof fn === 'function') window.addEventListener(ev, fn);
        };
        window.offClaramaFileEvent = function (actionOrHandler, handler) {
            const isAction = typeof actionOrHandler === 'string';
            const ev = isAction ? ('clarama:file:' + actionOrHandler) : 'clarama:file';
            const fn = isAction ? handler : actionOrHandler;
            if (typeof fn === 'function') window.removeEventListener(ev, fn);
        };
    }
})();
