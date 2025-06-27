function get_url(url, field_registry) {
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);

    var queryparams = field_registry;
    const entries = urlParams.entries();

    for (const entry of entries) {
        //console.log(entry);
        if (queryparams[entry[0]] === undefined) {
            //console.log('adding entry '+ entry[0] + '=' + entry[1]);
            queryparams[entry[0]] = entry[1];
        } else {
            //console.log(entry + ' existed, ignoring');
        }
    }

    //console.log(queryparams);

    var new_url = $CLARAMA_ROOT + url + '?' + jQuery.param(queryparams);
    //console.log(new_url);
    return new_url;
}

function _task_run(socket) {
    json_div = socket + '_args';

    get_field_values({}, true, function (field_registry) {
        var field_merged = field_registry;

        console.log("CLARAMA_TASK.js : TASK RUN Socket " + socket_div + " looking for " + json_div)
        var json_data = document.getElementById(json_div)


        if (json_data != null) {
            var json_element = JSON.parse(json_data.innerHTML);
            field_merged = Object.assign({}, field_registry, json_element);

            //if (json_element != null && json_element.value == '') {
            //console.log("found json element for task in " + json_div);
            //console.log(field_merged);
        } else {
            console.warn("CLARAMA_TASK.js : " + json_div + " div containing JSON is missing")
        }

        var task_socket = $("#" + socket);

        field_merged['clarama_task_kill'] = task_socket.attr("task_kill");

        task_kernel_id = task_socket.attr("task_kernel_id");
        url = $CLARAMA_ENVIRONMENTS_TASK_RUN + task_kernel_id;

        // Pass in the task's user-defined parameters from the field_registry, and paste into the header the internal configuration

        const task = get_url(url, {});

        console.log("CLARAMA_TASK.js: Running Task " + task + ' with ' + json_data);

        // No point sending custom headers here, CORS will nerf any custom headers, so send as params ....
        fetch(task,
            {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                method: "post",
                body: JSON.stringify(field_merged)
            })
            .then((response) => {
                console.log("CLARAMA_TASK.js: TASK RUN RESPONSE " + task);
                console.log(response);
            });
        /*fetch(task)
            .then((response) => {
                console.log("TASK RUN RESPONSE " + task);
                console.log(response);
            });*/
    });
}


function cell_item_run(cell_button) {
    console.log("CLARAMA_TASK.js: RUNNING");
    get_field_values({}, true, function (field_registry) { // Get only the field values, not the full field definitions, text or code
        var task_registry = get_cell_fields(cell_button);
        task_registry['parameters'] = field_registry

        console.log("CLARAMA_TASK.js: cell_edit_run Getting Socket");
        socket = $("#edit_socket");

        field_registry['clarama_task_kill'] = false;

        console.log("CLARAMA_TASK.js: cell_edit_run Getting Kernel");
        task_kernel_id = socket.attr("task_kernel_id");
        url = $CLARAMA_ENVIRONMENTS_KERNEL_RUN + task_kernel_id;

        // Pass in the task's user-defined parameters from the field_registry, and paste into the header the internal configuration
        const task = get_url(url, field_registry);

        console.log("CLARAMA_TASK.js: Running Task " + task);

        $.ajax({
            type: 'POST',
            url: url,
            datatype: "html",
            contentType: 'application/json',
            data: JSON.stringify(task_registry),
            success: function (data) {
                if (data['data'] == 'ok') {
                    console.log('CLARAMA_TASK.js: Submission was successful.');
                    console.log(data);
                    // flash("CLARAMA_TASK.js: Executing!");

                    moveToNextCell(cell_button);
                } else {
                    console.log('CLARAMA_TASK.js: Submission was successful.');
                    console.log(data);
                    flash("Couldn't run content: " + data['error']);
                }
            },
            error: function (data) {
                console.log('An error occurred.');
                console.log(data);
                flash("Couldn't run editable content, access denied", "danger");
            }
        });
    });
}