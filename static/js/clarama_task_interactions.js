// This function is called by the user when they click on a Run button
function task_run(parent) {
    // console.log("task_run parent", parent)
    parent.find("#run").click(function () {
        // console.log("inside task_run", parent)
        let topicVal = parent.filter('[topic]').first().attr('topic');
        // console.log("task_run topicVal", topicVal)
        let closestGrid = topicVal ? $(`.clarama-cell-item[topic="${topicVal}"]`).find('.clarama-grid') : $();
        // console.log("task_run closestGrid", closestGrid)

        if (check_fields_valid(closestGrid)) {
            console.log("RUNNING");
            // Get only the field values, not the full field definitions, text or code

            socket_div = $(this).attr("socket")
            console.log("socket_div",socket_div)

            $('#task_progress_main').attr('aria-valuenow', 0);

            // isHidden = $(this).attr("hiddenCM")
            // console.log("checking where _task_run: task_run")
            _task_run(socket_div, false, closestGrid);
        }
    });
}

function task_edit_run(parent) {
    parent.find("#editrun").click(function () {
        socket_div = $(this).attr("socket")
        // console.log("inside task_edit_run", parent)
        console.log("RUNNING");
        if (check_fields_valid()) {
            // console.log("checking where get_field_values is called: task_edit_run")
            get_field_values({}, true, function (field_registry) { // Get only the field values, not the full field definitions, text or code
                get_fields(false, true, (task_registry) => {
                    task_registry['parameters'] = field_registry

                    field_registry['clarama_task_kill'] = false;

                    task_kernel_id = $("#" + socket_div).attr("task_kernel_id");
                    url = $CLARAMA_ENVIRONMENTS_KERNEL_RUN + task_kernel_id;

                    // Pass in the task's user-defined parameters from the field_registry, and paste into the header the internal configuration
                    const task = get_url(url, field_registry);

                    console.log("Running Task " + task);

                    $.ajax({
                        type: 'POST',
                        url: url,
                        datatype: "html",
                        contentType: 'application/json',
                        data: JSON.stringify(task_registry),
                        success: function (data) {
                            if (data['data'] == 'ok') {
                                console.log('Submission was successful.');
                                console.log(data);
                                // flash("Executing!");
                            } else {
                                console.log('Submission was successful.');
                                console.log(data);
                                flash("Couldn't run content: " + data['error']);
                            }
                        },
                        error: function (data) {
                            console.log('An error occurred.');
                            console.log(data);
                            flash("Couldn't run editable content, access denied", "danger");
                        }
                    })
                });
            });
        }
    });
}

// This function is called by the user when they click on a Save button
function task_save(parent) {
    parent.find("#save").click(function () {
        console.log("SAVING");
        let url = "/content/save/" + $(this).attr("url");

        get_fields(true, true, function (task_registry) { // Get the kitchen sink

            console.log(task_registry);


            $.ajax({
                type: 'POST',
                url: url,
                datatype: "html",
                contentType: 'application/json',
                data: JSON.stringify(task_registry),
                success: function (data) {
                    if (data['data'] === 'ok') {
                        console.log('Submission was successful.');
                        console.log(data);
                        flash("Saved!", "success");
                    } else {
                        console.log('Submission was not successful.');
                        console.log(data);
                        flash("Couldn't save content: " + data['error'], "danger");
                    }
                },
                error: function (data) {
                    console.log('An error occurred.');
                    console.log(data);
                    flash("Couldn't save content, access denied", "danger");
                }
            })
        });

    });
}