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

                    listItem.removeClass("bg-primary");
                    listItem.addClass("bg-secondary");

                    $('.step-label', listItem).each(function () {
                        var label = $(this)
                        label.html('' + (index + 1))
                    });
                });

                $('.panel', panelList).last().removeClass("bg-secondary");
                $('.panel', panelList).last().addClass("bg-primary");
            }
        });
    });
};

function sortUpdate(panelList) {
    $('.clarama-cell-item', panelList).each(function (index, elem) {
        var streamname = $(this).parent(".stream").attr('stream-name');
        console.log("SORT UPDATE " + index + " with streamname " + streamname);
        $(this).attr('id', streamname + '_' + (index + 1));
        $(this).attr('step', index + 1);
    });

    $('.panel', panelList).each(function (index, elem) {
        var listItem = $(elem);

        listItem.removeClass("bg-primary");
        listItem.addClass("bg-secondary");

        $('.step-label', listItem).each(function () {
            var label = $(this)
            label.html('<p class="step-label">' + (index + 1) + '</p>')
        });
    });

    $('.panel', panelList).last().removeClass("bg-secondary");
    $('.panel', panelList).last().addClass("bg-primary");
}

$.fn.enablesort = function () {
    return this.each(function () {
        var panelList = $(this);

        panelList.sortable({
            // Only make the .draggable-heading child elements support dragging.
            // Omit this to make then entire <li>...</li> draggable.
            handle: '.draggable-heading'
        });

        panelList.on('sortupdate'), function () {
            sortUpdate(panelList);

        };
    });
};