function get_cell_fields(cell_owner) {
    var registry = {'streams': []}

    this_grid = saveGrid();
    // Get the field grid
    registry['fieldgrid'] = {
        'elements': this_grid['elements'],
        'children': this_grid['grid']['children']
    };

    var stream_cells = get_cell(cell_owner, cell_owner.attr('id'));

    console.log("Saving stream " + stream_cells);
    stream_dict = {};
    stream_dict['main'] = stream_cells;
    registry['streams'].push(stream_dict);

    return registry;
}

$.fn.enablesortcolor = function () {
    return this.each(function () {
        var panelList = $(this);

        panelList.sortable({
            // Only make the .draggable-heading child elements support dragging.
            // Omit this to make then entire <li>...</li> draggable by the user.
            handle: '.draggable-heading',
            update: function () {
                var streamname = $(this).parent("#stream").attr('stream-name');
                $('.clarama-cell-item', panelList).each(function (index, elem) {
                    $(this).attr('id', streamname + '_' + (index + 1));
                });

                $('.panel', panelList).each(function (index, elem) {
                    var listItem = $(elem);

                    $('.step-label', listItem).each(function () {
                        $(this).html('' + (index + 1))
                    });
                });

                $('.panel', panelList).last().css('background', '#6af');
            }
        });
    });
};

function applyLastPanel(panelList) {
    $('.panel', panelList).removeClass('last-panel');
    $('.panel', panelList).last().addClass('last-panel');
}

$.fn.enablesortcolor = function () {
    return this.each(function () {
        var panelList = $(this);

        panelList.sortable({
            handle: '.draggable-heading',
            update: function () {
                var streamname = $(this).closest('.stream').attr('stream-name');

                $('.clarama-cell-item', panelList).each(function (index) {
                    $(this).attr('id', streamname + '_' + (index + 1));
                });

                $('.panel', panelList).each(function (index) {
                    $('.step-label', this).html('' + (index + 1));
                });

                applyLastPanel(panelList);
            }
        });

        applyLastPanel(panelList);
    });
};

function sortUpdate(panelList) {
    $('.clarama-cell-item', panelList).each(function (index) {
        var streamname = $(this).closest('.stream').attr('stream-name');
        var oldStep = $(this).attr('step');
        var newStep = index + 1;

        $(this).attr('id', streamname + '_' + newStep).attr('step', newStep);
        if (oldStep !== newStep) updateInsightsIds($(this), oldStep, newStep);
    });

    $('.panel', panelList).each(function (index) {
        $('.step-label', this).html('<p class="step-label">' + (index + 1) + '</p>');
    });

    applyLastPanel(panelList);
}

function updateInsightsIds(cellElement, oldStep, newStep) {
    console.log(`Updating Insights IDs from ${oldStep} to ${newStep} for cell:`, cellElement);

    const A_STEP = String(oldStep);
    const B_STEP = String(newStep);
    const SUFFIX_RX_UNDERSCORE = new RegExp(`(_)${
        A_STEP.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')
    }$`);
    const SUFFIX_RX_DASH = new RegExp(`(-)${
        A_STEP.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')
    }$`);
    const ANY_REF_RX = new RegExp(`([_\\-])${
        A_STEP.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')
    }(?!\\d)`, 'g'); // e.g. insights-chat-1, left_content_1

    function renameAttrRef($el, attr) {
        const val = $el.attr(attr);
        if (!val) return;
        let next = val;
        // Replace plain suffixes …-1 / …_1
        next = next.replace(ANY_REF_RX, `$1${B_STEP}`);
        // Replace hash refs: data-bs-target="#insights-chat-1"
        next = next.replace(ANY_REF_RX, `$1${B_STEP}`);
        if (next !== val) $el.attr(attr, next);
    }

    function sweep(container) {
        container.find('*').each(function () {
            const $n = $(this);
            // id
            const id = $n.attr('id');
            if (id) {
                let nid = id.replace(SUFFIX_RX_UNDERSCORE, `_${
                    B_STEP
                }`).replace(SUFFIX_RX_DASH, `-${
                    B_STEP
                }`).replace(ANY_REF_RX, `$1${B_STEP}`);
                if (nid !== id) $n.attr('id', nid);
            }
            // common ref attrs
            ['for','aria-controls','aria-labelledby','data-bs-target','data-target','href']
                .forEach(a => renameAttrRef($n, a));
            // task index
            const dti = $n.attr('data-task-index');
            if (dti === A_STEP) $n.attr('data-task-index', B_STEP);
        });
    }

    // ---- left/right shells first ---------------------------------------
    const $left  = cellElement.find(`#left_content_${A_STEP}`);
    const $right = cellElement.find(`#right_content_${A_STEP}`);
    if ($left.length)  $left.attr('id', `left_content_${B_STEP}`);
    if ($right.length) $right.attr('id', `right_content_${B_STEP}`);

    // insights root
    const $insights = cellElement.find(`#insights_${A_STEP}`);
    if ($insights.length) $insights.attr('id', `insights_${B_STEP}`);

    // results & editor hosts
    const $results = cellElement.find(`#results_${A_STEP}`);
    if ($results.length) $results.attr('id', `results_${B_STEP}`);
    const $stepHost = cellElement.find(`#step_main_${A_STEP}, #step_*_${A_STEP}`);
    $stepHost.each(function(){
        const cur = this.id;
        const next = cur.replace(SUFFIX_RX_UNDERSCORE, `_${B_STEP}`);
        if (next !== cur) this.id = next;
    });

    // ---- FULL SWEEP within the cell (tabs, panes, buttons, etc.) -------
    sweep(cellElement);

    // Ensure toggle bars & key controls carry the new task index
    cellElement.find('.insights-toggle-bar, .celleditinsights, .execute-console, .clear-chat, .code-inspector-reload')
        .each(function(){ $(this).attr('data-task-index', B_STEP); });
}

$.fn.enablesort = function () {
    return this.each(function () {
        var panelList = $(this);

        panelList.sortable({
            // Only make the .draggable-heading child elements support dragging.
            // Omit this to make then entire <li>...</li> draggable.
            handle: '.draggable-heading'
        });

        panelList.on('sortupdate', function () {
            sortUpdate(panelList);
        });

        applyLastPanel(panelList);
    });
};