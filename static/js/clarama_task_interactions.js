// This function is called by the user when they click on a Run button
function task_run(parent) {
    // console.log("task_run parent", parent)
    parent.find("#run").click(function () {
        // console.log("inside task_run", parent)
        let topicVal = parent.filter('[topic]').first().attr('topic');
        // console.log("task_run topicVal", topicVal)
        let closestGrid = topicVal ? $(`.clarama-cell-item[topic="${topicVal}"]`).find('.clarama-grid') : $();

        console.log("task_run closestGrid", closestGrid)

        if (check_fields_valid(closestGrid)) {
            console.log("RUNNING");
            try {
                claramaSaveStickyCookies(closestGrid);
            } catch (e) {
                console.log('Sticky flush failed on run', e);
            }
            // Get only the field values, not the full field definitions, text or code

            socket_div = $(this).attr("socket")
            console.log("socket_div", socket_div)

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
        let closestGrid = $('.clarama-grid');
        console.log("RUNNING");
        if (check_fields_valid(closestGrid)) {
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
function ensurePublishConfirmModal() {
    if (document.getElementById('publishConfirmModal')) return;
    const html = `
<div class="modal fade" id="publishConfirmModal" tabindex="-1" aria-labelledby="publishConfirmLabel" aria-hidden="true">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="publishConfirmLabel">Publish Task</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body" id="publishConfirmBody">
        This will generate a publish preview for the current task. Do you want to continue?
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" id="publishConfirmCancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="publishConfirmGo">Generate Preview</button>
      </div>
    </div>
  </div>
</div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

function showPublishWaiting() {
    const body = document.getElementById('publishConfirmBody');
    if (!body) return;
    body.innerHTML = '<div class="d-flex align-items-center"><div class="spinner-border me-3" role="status" aria-hidden="true"></div><div>Please wait, generating preview...</div></div>';
}

function resetPublishConfirmBody() {
    const body = document.getElementById('publishConfirmBody');
    if (!body) return;
    body.textContent = 'This will generate a publish preview for the current task. Do you want to continue?';
}

function task_publish(parent) {
    parent.find("#publish").click(function () {
        try {
            let taskPath = $("#edit_socket").attr("task");
            if (!taskPath) {
                flash("No task file path found to publish", "danger");
                return;
            }

            ensurePublishConfirmModal();
            resetPublishConfirmBody();
            const confirmModalEl = document.getElementById('publishConfirmModal');
            const confirmModal = new bootstrap.Modal(confirmModalEl);
            const goBtn = document.getElementById('publishConfirmGo');
            const cancelBtn = document.getElementById('publishConfirmCancel');

            // Clean previous handlers
            $(goBtn).off('click');
            $(cancelBtn).off('click');

            $(goBtn).on('click', function () {
                // Switch to waiting state
                goBtn.disabled = true;
                cancelBtn.disabled = true;
                showPublishWaiting();

                // Collect task and field info
                get_fields(true, true, (task_registry) => {
                    // Build preview via backend
                    $.ajax({
                        type: 'POST',
                        url: '/content/publish/' + taskPath,
                        datatype: 'json',
                        contentType: 'application/json',
                        data: JSON.stringify({task: task_registry}),
                        success: function (results) {
                            // Restore buttons and close waiting modal
                            goBtn.disabled = false;
                            cancelBtn.disabled = false;
                            try {
                                confirmModal.hide();
                            } catch (_) {
                            }
                            if (results && results['data'] === 'ok') {
                                let res = results['results'];
                                console.log("PREVIEW RESULT", res);
                                let suggested = res['filename'].replace(/\.task\.yaml$/i, '') + '.ai.yaml';
                                $("#publishFileName").val(suggested);
                                // Initialize ACE editor for preview if not already
                                try {
                                    if (window.ace) {
                                        if (!window.__publishAce) {
                                            const ed = ace.edit('publishPreviewEditor');
                                            ed.setTheme('ace/theme/github');
                                            ed.session.setMode('ace/mode/yaml');
                                            ed.session.setUseWrapMode(true);
                                            ed.session.setTabSize(2);
                                            ed.session.setUseSoftTabs(true);
                                            ed.setOptions({
                                                fontSize: '12pt',
                                                showPrintMargin: false,
                                            });
                                            window.__publishAce = ed;
                                        }
                                        window.__publishAce.setValue(res['yaml_text'] || res['yaml'] || '', -1);
                                    } else {
                                        // Fallback: put text into the div
                                        const div = document.getElementById('publishPreviewEditor');
                                        if (div) div.textContent = (res['yaml_text'] || res['yaml'] || '');
                                    }
                                } catch (e) {
                                    console.error('ACE init failed', e);
                                    const div = document.getElementById('publishPreviewEditor');
                                    if (div) div.textContent = (res['yaml_text'] || res['yaml'] || '');
                                }
                                const modal = new bootstrap.Modal(document.getElementById('publishModal'));
                                modal.show();
                                $("#confirmPublishBtn").off('click').on('click', function () {
                                    let fname = $("#publishFileName").val();
                                    let yaml = (window.__publishAce && window.ace) ? window.__publishAce.getValue() : (document.getElementById('publishPreviewEditor')?.textContent || '');
                                    if (!fname || !yaml) {
                                        flash('Missing filename or content', 'danger');
                                        return;
                                    }
                                    // Save using existing content save route
                                    $.ajax({
                                        type: 'POST',
                                        url: '/content/raw/' + fname,
                                        datatype: 'json',
                                        contentType: 'application/json',
                                        data: JSON.stringify({edited_content: yaml}),
                                        success: function (saveres) {
                                            if (saveres && (saveres.data === 'ok' || saveres.success)) {
                                                flash('Published ' + fname, 'success');
                                                modal.hide();
                                            } else {
                                                flash('Failed to save: ' + (saveres && (saveres.error || saveres.message) || 'unknown'), 'danger');
                                            }
                                        },
                                        error: function (e) {
                                            console.error(e);
                                            flash("Error saving file", 'danger');
                                        }
                                    });
                                });
                            } else {
                                flash('Could not build publish preview: ' + (res && (res.error || res.message) || 'unknown'), 'danger');
                                // Keep confirmation modal open for user to retry or cancel
                                resetPublishConfirmBody();
                            }
                        },
                        error: function (e) {
                            console.error(e);
                            flash('Error generating publish preview', 'danger');
                            // Reset UI to allow retry
                            goBtn.disabled = false;
                            cancelBtn.disabled = false;
                            resetPublishConfirmBody();
                        }
                    });
                });
            });

            $(cancelBtn).on('click', function () {
                resetPublishConfirmBody();
            });

            confirmModal.show();
        } catch (e) {
            console.error(e);
            flash('Unexpected error during publish', 'danger');
        }
    });
}

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