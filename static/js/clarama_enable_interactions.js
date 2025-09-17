function toolbar_interactions(toolbar) {
    toolbar.find(".toolbar-container").each(function () {
        const $container = $(this);
        const $hoverLine = $container.find('.hover-line');
        const $toolbar = $container.find('.floating-toolbar');

        $hoverLine.on('click', function (e) {
            const rect = $hoverLine[0].getBoundingClientRect();
            const scrollTop = $(window).scrollTop();

            // Position toolbar right above the line
            $toolbar.css({
                top: rect.top + scrollTop - $toolbar.outerHeight() - 5,
                left: e.clientX - ($toolbar.outerWidth() / 2)
            });

            $toolbar.toggleClass('visible');
        });

        // Hide toolbar when clicking outside
        $(document).on('click', function (e) {
            if (!$toolbar.is(e.target) &&
                !$toolbar.has(e.target).length &&
                !$hoverLine.is(e.target)) {
                $toolbar.removeClass('visible');
            }
        });
    });

}

function enable_interactions(parent, reload = false, runtask = false) {
    console.log('initialising interactions on ' + parent.attr('id') + ':' + parent.attr("class"));

    //      parent.find('.clarama-execute').execute();
    parent.find(".dropdown-toggle").dropdown();
    parent.find('.clarama-field-select2').initselect();
    parent.find('.source-editor').editor();
    parent.find('.text-editor').trumbowyg({
        autogrow: true,
        autogrowOnEnter: true,
        removeformatPasted: true,
        btns: [
            ['viewHTML'],
            ['historyUndo', 'historyRedo'],
            ['formatting'],
            ['fontsize', 'foreColor', 'backColor'],
            ['strong', 'em', 'del'],
            ['mathml'],
            ['superscript', 'subscript'],
            ['link'],
            ['justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'],
            ['unorderedList', 'orderedList', 'indent', 'outdent'],
            ['horizontalRule'],
            ['removeformat'],
        ]
    });

    toolbar_interactions(parent);

    var task_parent = parent.find('.clarama-task')
    task_run(task_parent);
    task_save(task_parent);
    task_publish(task_parent);
    task_edit_run(task_parent);
    task_parent.find('.clarama-websocket').enablesocket();

    parent.find('.clarama-sortable-color').enablesortcolor();
    parent.find('.clarama-sortable').enablesort();
    cell_edit_run(parent);

    var cell_parent = parent.find('.clarama-cell-item')

    cell_insert_step(parent);
    cell_delete_step(parent);
    cell_toggle_insights_view(parent);

    var fields = parent.find('.clarama-field');

    //console.log("FIELD interactions");
    //console.log(fields);
    fields.filter('.clarama-change-field').interact_change();
    fields.filter('.clarama-select-field').interact_select();
    fields.filter('.clarama-now-field').interact_now();
    fields.filter('.clarama-button-field').interact_button();
    fields.filter('.clarama-delay-field').interact_delay();
    fields.filter('.clarama-editor-field').interact_editor();
    fields.filter('.clarama-rtf-field').interact_rtf();
    fields.filter('.clarama-daterange').daterangepicker({
        timePicker: true,
        timePickerSeconds: true,
        alwaysShowCalendars: true,
        ranges: {
            'Today': [moment(), moment()],
            'Yesterday': [moment().subtract(1, 'days'), moment().subtract(1, 'days')],
            'Last 7 Days': [moment().subtract(6, 'days'), moment()],
            'Last 30 Days': [moment().subtract(29, 'days'), moment()],
            'This Month': [moment().startOf('month'), moment().endOf('month')],
            'Last Month': [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')]
        }
    });
    hoverover_this(parent.find('.hoverover'));

    // Wire kernel info click handlers for dynamically loaded content
    try {
        parent.find('#edit-kernel-status, #run-kernel-status, #explore-kernel-status').each(function(){
            var $el = $(this);
            if($el.data('wired')) return;
            $el.data('wired', 1);
            $el.css('cursor','pointer');
            if(!$el.attr('title')){ $el.attr('title','Click to view kernel info'); }
            $el.on('click', function(){
                var kid = $el.data('kernel-id') || $.trim($el.text());
                if(window.ClaramaKernel && window.ClaramaKernel.openKernelInfo){
                    window.ClaramaKernel.openKernelInfo(kid);
                } else {
                    console.warn('ClaramaKernel not available to open kernel info');
                }
            });
        });
    } catch(e) { console.warn('Kernel info wiring failed', e); }

    if (reload) {
        parent.find('.clarama-post-embedded').attr('clarama_loaded', false);
        parent.find('.clarama-embedded').attr('clarama_loaded', false);
    }

    if (runtask) {
        console.log("runtask autorun")
        parent.find('.clarama-post-embedded').attr('autorun', true);
        parent.find('.clarama-embedded').attr('autorun', true);
    }

    parent.find('.clarama-post-embedded').load_post();
    parent.find('.clarama-embedded').load();
    Prism.highlightAll(); // Manually trigger highlighting
}