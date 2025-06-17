function set_environment(environment) {
    flash("Changing environment to " + environment);
    $('#kernel_status').html('Loading');
    $('#environment').html('...');
    let socket = $("#edit_socket");
    socket.attr("environment", environment);
    run_socket(socket, false);
}

function reset_environment(environment) {
    flash("Resetting environment to " + environment);
    $('#kernel_status').html('Restarting..');
    $('#environment').html('...');
    let socket = $("#edit_socket");
    socket.attr("environment", environment);
    run_socket(socket, true);
}

let socket = undefined;

let socket_address = '';

let socket_starting = false;

let socket_taskQueue = [];

let socket_topics = ['clarama-systemwide'];

function processTaskMessages() {
    socket.send(JSON.stringify({topics: socket_topics}));

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

    if (socket !== undefined)
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({topics: socket_topics}));
            get_task(embedded, task_url, socket_id, autorun);
            return;
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
    fetch(task_url)
        .then((response) => {
            if (response.ok) {
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
            flash(task_url + " error " + error, category = 'danger');
        });
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

function start_socket(reconnect = false) {
    let webSocket = new WebSocket(socket_address);

    socket = webSocket;

    webSocket.onerror = function (event) {
        onError(event, socket_address, webSocket)
    };

    webSocket.onopen = function (event) {
        onOpen(event, socket_address, reconnect)
        processTaskMessages();
    };

    webSocket.onclose = function (event) {
        onClose(event, socket_address, webSocket)
    };

    webSocket.onmessage = function (event) {
        onMessage(event, socket_address, webSocket)
    };
}

function run_socket(embedded, reset_environment) {
    let task = embedded.attr("task")
    let topic = embedded.attr("topic");

    embedded.attr("socket_time", Date.now());

    if (task !== undefined && topic !== undefined)
        socket_task(embedded, task, topic, reset_environment);

    if (!socket_starting) {
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
                //console.log(response);

                let server = response['results']['socket'] // USe the websocket-provided address
                let uuid = response['results']['uuid']
                let topic = response['results']['topic']

                if ($CLARAMA_WEBSOCKET_DYNAMIC === 'True') {
                    server = location.origin.replace(/^http/, 'ws') + '/ws/';
                    console.log("Using Dynamic Websocket address from browser origin " + server);
                } else
                    console.log("Using Preconfigured Websocket address " + server);

                let websocket_address = (server + uuid + '/');


                console.log("CLARAMA_WEBSOCKET.js: Creating " + socket_url + " Websocket on " + websocket_address + " for " + startingTopic);

                socket_address = websocket_address;
                start_socket(false)


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
function onMessage(event, socket_url, webSocket) {
    let dict = JSON.parse(event.data);

    if ('class' in dict) {
        console.log("WEBSOCKET.js: Processing Socket Message " + dict['class']);
        try {
            if (dict['class'] === "ping") {
                console.log("ping");
            }

            if (dict['class'] === "layout") {
                var cols = dict['values']['width'];
                var rows = dict['values']['height'];
                let resulter = "#" + dict['step_id'];

                // Generate table HTML
                let tableHtml = '<table class="table table-bordered">';

                // Create rows and columns
                for (let r = 0; r < rows; r++) {
                    tableHtml += '<tr>';
                    for (let c = 0; c < cols; c++) {
                        var cell_class = dict['step_id'] + "_" + c + "_" + r;
                        tableHtml += '<td width="' + 1 / cols + '" id="' + cell_class + '"><span class="cell-results"></span></td>';
                    }
                    tableHtml += '</tr>';
                }
                tableHtml += '</table>';

                // Add the table to the resulter
                let target = $(resulter).find('.cell-results').first();
                let $elements = $(tableHtml);
                target.append($elements);
                //$(resulter).html(tableHtml);

                console.log("CLARAMA_WEBSOCKET.js: Generated layout table with " + cols + " columns and " + rows + " rows");
            }

            if (dict['class'] === "alert") {
                flash(dict['message'], dict['category']);
            }

            if (dict['class'] === "template") {
                let resulter = "#" + dict['step_id'];
                //console.log("WEBSOCKET MESSAGE:" + dict['step_id']);
                //console.log(dict);
                //console.log("TEMPLATE RESULTER --[" + resulter + ']--');
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
                })
            }

            if (dict['class'] === "template_table") {
                let resulter = "#" + dict['step_id'];
                console.log("CLARAMA_WEBSOCKET.js: WEBSOCKET TABLE MESSAGE:" + webSocket.url);
                process_template(dict['type'], dict['values'], $(resulter));
                // Draw the table ID first, then let's put in the data
                bTable(dict['values']['table_id'], dict['results']);
            }

            if (dict['class'] === "template_chart") {
                let resulter = "#" + dict['step_id'];
                console.log("CLARAMA_WEBSOCKET.js: WEBSOCKET CHART MESSAGE:" + webSocket.url + " " + dict['step_id']);
                console.log($(resulter));
                process_template(dict['type'], dict['values'], $(resulter));
                // Draw the table ID first, then let's put in the data
                bChart(dict['values']['chart_id'], dict['results']);
            }


            if (dict['type'] === 'task_step_started') {
                let spinner = "#" + dict['step_id'];
                //console.log("SPINNING --[" + spinner + ']--');
                $(spinner).find('.cell-spin').animate({"opacity": 1});
                $(spinner).find('.cell-results').empty();
                $(spinner).find('.cell-timing').empty();

                //console.log("TASK STEP STARTED " + target)
            }

            let task_progress = $('#task_progress_main');

            if (dict['type'] === 'task_step_completed' || dict['type'] === 'task_step_exception') {
                //console.log("Step done " + dict['type'] + " " + dict['step_id'])
                if ('step_number' in dict)
                    if (dict['step_number'] > -1) {
                        //console.log("Setting progress " + dict['step_number'])

                        let max = task_progress.attr("max");

                        task_progress.width((100 * dict['step_number'] / max).toString() + '%');
                    }

                let spinner = "#" + dict['step_id'];
                $(spinner).find('.cell-spin').animate({"opacity": 0});

                if (dict['type'] === 'task_step_exception')
                    task_progress.addClass("bg-danger")
            }

        } catch (err) {
            console.log(err);
            console.log('CLARAMA_WEBSOCKET.js: exception raised processing:');
            console.log(dict);
        }
    } else if ('progress' in dict) {
        $('#task_progress_' + dict['stream']).attr('aria-valuenow', dict['step_number']);
    } else {
        console.log("CLARAMA_WEBSOCKET.js: WTF was this: " + dict)
    }
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

function onClose(event, socket_url, webSocket) {
    console.log('CLARAMA_WEBSOCKET.js: WebSocket Connection CLOSED ' + Date.now() + ' on ' + socket_url + " on socket " + webSocket);
    // flash("SOCKET lost", "danger");
    setTimeout(function () {
        start_socket(true);
    }, 100)
}

function onError(event, socket_url, webSocket) {
    console.log("CLARAMA_WEBSOCKET.js: WebSocket Error [" + event.data + "] from " + socket_url + " on socket " + webSocket);
    //alert("SOCKET error " + event.data, "danger");
}
