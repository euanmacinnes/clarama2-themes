// This function is called by the user when they click on a Run button
function task_run(parent) {
    parent.find("#run").click(function () {
        if (check_fields_valid()) {
            console.log("RUNNING");
            // Get only the field values, not the full field definitions, text or code

            socket = $(this).attr("socket")

            $('#task_progress_main').attr('aria-valuenow', 0);

            _task_run(socket);
        }
    });
}

function task_edit_run(parent) {
    parent.find("#editrun").click(function () {
        socket = $(this).attr("socket")
        console.log("RUNNING");
        if (check_fields_valid()) {
            get_field_values({}, true, function (field_registry) { // Get only the field values, not the full field definitions, text or code
                get_fields(false, true, (task_registry) => {
                    task_registry['parameters'] = field_registry

                    field_registry['clarama_task_kill'] = false;

                    task_kernel_id = $("#" + socket).attr("task_kernel_id");
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
                        flash("Saved!");
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