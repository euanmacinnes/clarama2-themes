//  Copyright (c) 2024. Euan Duncan Macinnes, euan.d.macinnes@gmail.com, S7479622B - All Rights Reserved

/**
 * Clarama Cell JS - Functions for handling different types of cells in the Clarama interface
 * @fileoverview This file provides functions to extract and process data from various
 * cell types (code, data, text, notification, source, URL, shell).
 */

/**
 * Extracts data from a code cell
 * @param {jQuery} cell - jQuery object representing the code cell
 * @returns {Object} Object containing the cell type and code content
 */
function get_code_cell(cell) {
    var id = cell.attr('id');
    var editor = ace.edit(id);
    var code = editor.getValue();

    console.log("Getting code " + id);

    return {"type": "code", "content": code};
}

/**
 * Gets all tab IDs for a given data cell
 * @param {jQuery} cell - jQuery object representing the data cell
 * @returns {Array} Array of tab IDs
 */
function get_tab_ids(cell) {
    var tab_ids = [];

    // Find all tab content blocks for this cell
    cell.find('.tab-content-block').each(function () {
        var tab_id = $(this).data('tab-id');
        if (tab_id !== undefined && tab_id !== null) {
            tab_ids.push(tab_id);
            console.log("found tab_id: ", tab_id);
        }
    });
    tab_ids = [...new Set(tab_ids)];
    return tab_ids;
}

/**
 * Extracts data from a single tab within a data cell
 * @param {jQuery} cell - jQuery object representing the data cell
 * @param {number} tab_id - The tab ID to extract data from
 * @returns {Object} Object containing the tab's source, content, and editor data
 */
function get_tab_data(cell, tab_id) {
    var dataid = cell.attr('dataid');
    var editor_id = "content_query_" + dataid + "_tab_" + tab_id;

    try {
        var editor = ace.edit(editor_id);
        var code = editor.getValue();
    } catch (e) {
        console.warn("Editor not found for " + editor_id + ", using empty content");
        var code = "";
    }

    // Get source file path from the tab content block
    var source_input_id = "task_step_" + dataid + "_source_" + tab_id;
    var source = $("#" + source_input_id).val() || "";

    return {
        "tab_id": tab_id,
        "source": source,
        "content": code
    };
}

/**
 * Extracts data from a data cell including table and chart configurations and all tabs
 * @param {jQuery} cell - jQuery object representing the data cell
 * @returns {Object} Object containing the cell type, tabs data, output, table and chart configurations
 */
function get_data_cell(cell) {
    var dataid = cell.attr('dataid');

    console.log("Getting data cell " + dataid);

    // Get output type
    var output_id = "task_step_" + dataid + "_output";
    var output = $("#" + output_id).val();

    // Get all tab data
    var tab_ids = get_tab_ids(cell);
    var tabs_data = [];

    tab_ids.forEach(function (tab_id) {
        var tab_data = get_tab_data(cell, tab_id);
        tabs_data.push(tab_data);
    });

    if (tabs_data.length === 0) {
        var legacy_id = "content_query_" + dataid;
        try {
            var editor = ace.edit(legacy_id);
            var code = editor.getValue();
            var source_id = "task_step_" + dataid + "_source";
            var source = $("#" + source_id).val();

            tabs_data.push({
                "tab_id": 0,
                "source": source,
                "content": code
            });
        } catch (e) {
            console.warn("No editor found for legacy or tab format");
        }
    }

    // Extract table configuration
    var table_style = cell.find('.table-style').find('option:selected').attr('id');
    var table_title = cell.find('.table-title').val();
    var table_slate = cell.find('.table-slate').val();
    var table_search = cell.find('.table-search').prop('checked');
    var table_export = cell.find('.table-export').prop('checked');
    var table_filter = cell.find('.table-filter').prop('checked');
    var table_checkbox = cell.find('.table-checkbox').prop('checked');
    var table_multiselect_row = cell.find('.table-multiselect-row').prop('checked');
    var table_pagination = cell.find('.table-pagination').prop('checked');
    var table_sortable = cell.find('.table-sortable').prop('checked');
    var table_pagesize = cell.find('.table-pagesize').val();
    var table_footer = cell.find('.table-footer').prop('checked');

    // Extract chart configuration
    var chart_title = cell.find('.chart-title').val();
    var chart_subtitle = cell.find('.chart-subtitle').val();
    var chart_legend = cell.find('.chart-legend').val();
    var chart_xaxis_type = cell.find('.chart-xaxis-type').val();

    // Chart advanced YAML
    var chart_advanced = cell.find('.chart-advanced');
    var editor = ace.edit(chart_advanced.attr('id'));
    var chart_advanced_yaml = editor.getValue();

    var chart_series_groups = [];
    var chart_series_formats = [];
    var chart_series_annos = [];

    // Extract chart3d configuration
    var chart3d_title = cell.find('.chart3d-title').val();
    var chart3d_legend = cell.find('.chart3d-legend').val();

    // Chart advanced YAML
    var chart3d_advanced = cell.find('.chart3d-advanced');
    var editor3d = ace.edit(chart3d_advanced.attr('id'));
    var chart3d_advanced_yaml = editor3d.getValue();

    var chart3d_series_objs = [];

    // Extract series groups
    var series_groups = cell.find('.chart-series-groups');
    series_groups.each(function () {
        console.log(this);
        var srs = {
            'series-tab': $(this).find('.series-tab').val(),            // Input Source Tab
            'series-type': $(this).find('.series-type').val(),          // Series type
            'series-x': $(this).find('.series-x').val(),                // X axis
            'series-y': $(this).find('.series-y').val(),                // Y axis
            'series-z': $(this).find('.series-z').val(),                // Z axis (e.g. for Bubble)
            'series-ymin': $(this).find('.series-ymin').val(),          // error bar Y MIN
            'series-ymax': $(this).find('.series-ymax').val(),          // error bar Y MAX
            'series-s': $(this).find('.series-s').val(),                // series axis
            'series-u': $(this).find('.series-u').val(),                // unit axis
            'series-l': $(this).find('.series-l').val()                 // label axis (e.g. for point name at X/Y)
        };
        console.log(srs);
        chart_series_groups.push(srs);
    });

    // Extract series formats
    var series_formats = cell.find('.chart-series-formats');
    series_formats.each(function () {
        console.log(this);
        var srs = {
            'format-nrx': $(this).find('.format-nrx').val(),            // name regex
            'format-ua': $(this).find('.format-ua').val(),              // unit axis
            'format-f': $(this).find('.format-f').is(':checked'),       // filled
            'format-p': $(this).find('.format-p').is(':checked'),       // stepped
            'format-dt': $(this).find('.format-dt').is(':checked'),     // dotted
            'format-pr': $(this).find('.format-pr').val(),              // point size
            'format-ps': $(this).find('.format-pointstyle').find('option:selected').attr('id'), // point style
            'format-lw': $(this).find('.format-lw').val(),              // line width
            'format-col': $(this).find('.chart-col').val(),            // colour
            'format-col-back': $(this).find('.chart-col-back').val(),  // background colour
            'format-title': $(this).find('.format-title').val()         // series title
        };
        console.log(srs);
        chart_series_formats.push(srs);
    });

    // Extract series annotations
    var series_annos = cell.find('.chart-series-annotations');
    series_annos.each(function () {
        console.log(this);
        var srs = {
            'anno-tab': $(this).find('.anno-tab').val(),                // Input Source Tab
            'anno-label': $(this).find('.anno-label').val(),            // label
            'anno-i': $(this).find('.anno-i').val(),                    // X axis
            'anno-x': $(this).find('.anno-x').val(),                    // X axis
            'anno-y': $(this).find('.anno-y').val(),                    // Y axis
            'anno-xm': $(this).find('.anno-xm').val(),                  // X MAX axis
            'anno-ym': $(this).find('.anno-ym').val(),                  // Y MAX axis
            'anno-u': $(this).find('.anno-u').val(),                    // unit axis
            'anno-s': $(this).find('.anno-s').val(),                    // state axis
            'anno-dt': $(this).find('.anno-dt').is(':checked'),         // dotted
            'anno-width': $(this).find('.anno-width').val(),            // border width
            'anno-type': $(this).find('.anno-type').find('option:selected').attr('id'), // type
            'anno-col': $(this).find('.chart-col').val(),                // colour
            'anno-col-back': $(this).find('.chart-col-back').val(),      // background colour
        };
        console.log(srs);
        chart_series_annos.push(srs);
    });

    // Extract series objects
    var series_objs = cell.find('.chart3d-series-objects');
    series_objs.each(function () {
        console.log(this);
        const uvVal = $(this).find('.obj-uv').val();
        const colVal = $(this).find('.obj-colour').val();
        var srs = {
            'obj-vertices': $(this).find('.obj-vertices').val(),                                    // Input Vertices
            'obj-edges': $(this).find('.obj-edges').val(),                                          // Input edges
            'obj-uv': (uvVal && uvVal !== 'none') ? uvVal : '',
            'obj-colour': (colVal && colVal !== 'none') ? colVal : '',                              // colour
            'obj-texture': $(this).find('.obj-texture').val() || '',                                // texture file path
            'obj-primitive': $(this).find('.obj-primitive').find('option:selected').attr('id'),     // primitive
        };
        console.log(srs);
        chart3d_series_objs.push(srs);
    });

    var chart = {
        'title': chart_title,
        'subtitle': chart_subtitle,
        'legend': chart_legend,
        'advanced': chart_advanced_yaml,
        'xaxis-type': chart_xaxis_type,
        'series-groups': chart_series_groups,
        'series-formats': chart_series_formats,
        'series-annos': chart_series_annos
    };

    var chart3d = {
        'title': chart3d_title,
        'legend': chart3d_legend,
        'advanced': chart3d_advanced_yaml,
        'series-objects': chart3d_series_objs
    }

    var table = {
        'title': table_title,
        'slate': table_slate,
        'search': table_search,
        'export': table_export,
        'style': table_style,
        'footer': table_footer,
        'filter': table_filter,
        'checkbox': table_checkbox,
        'multiselect-row': table_multiselect_row,
        'pagination': table_pagination,
        'sortable': table_sortable,
        'pagesize': table_pagesize
    };

    // reset the tab_ids to start from 0
    let tabCounter = 0;
    tabs_data.forEach(function (tab_data) {
        const currTabId = tab_data.tab_id;

        chart["series-annos"].forEach(function (series_anno) {
            if (series_anno["anno-tab"] == currTabId) {
                series_anno["anno-tab"] = tabCounter;
            }
        });
        chart["series-groups"].forEach(function (series_group) {
            if (series_group["series-tab"] == currTabId) {
                series_group["series-tab"] = tabCounter;
            }
        });
        chart3d["series-objects"].forEach(function (series_object) {
            if (series_object["obj-vertices"] == currTabId) {
                series_object["obj-vertices"] = tabCounter;
            }
            if (series_object["obj-edges"] == currTabId) {
                series_object["obj-edges"] = tabCounter;
            }
            if (series_object["obj-uv"] !== '' && series_object["obj-uv"] !== 'none' &&
                series_object["obj-uv"] == currTabId) {
                series_object["obj-uv"] = tabCounter;
            }
            if (series_object["obj-colour"] !== '' && series_object["obj-colour"] !== 'none' &&
                series_object["obj-colour"] == currTabId) {
                series_object["obj-colour"] = tabCounter;
            }
        });

        tab_data.tab_id = tabCounter;
        tabCounter++;
    });

    console.log("Table config:", table);
    console.log("Chart config:", chart);
    console.log("Chart3d config:", chart3d);
    console.log("Tabs data:", tabs_data);

    return {
        "type": "data",
        "output": output,
        "tabs": tabs_data,
        "table": table,
        "chart": chart,
        "chart3d": chart3d
    };
}

/**
 * Extracts data from a text/markdown cell
 * @param {jQuery} cell - jQuery object representing the text cell
 * @returns {Object} Object containing the cell type and markdown content
 */
function get_text_cell(cell) {
    var myContent = cell.trumbowyg('html');
    console.log("Getting text " + myContent);
    return {"type": "markdown", "content": myContent};
}

function get_question_cell(cell) {
    var dataid = cell.attr('dataid');

    var id = "content_query_" + dataid;

    var question = $("#" + id).val();

    console.log("Getting question " + question);

    return {
        "type": "question",
        "source": question
    };
}

/**
 * Extracts data from a notification cell
 * @param {jQuery} cell - jQuery object representing the notification cell
 * @returns {Object} Object containing the cell type, message content, and targets
 */
function get_notification_cell(cell) {
    var dataid = cell.attr('dataid');

    var id = "content_query_" + dataid;

    console.log("Getting data " + id);

    var message_content = $("#" + id + "_message_content").trumbowyg('html');
    console.log("MESSAGE CONTENT:")
    console.log(message_content)

    //var targets = $("#" + id + "_targets").val();
    var id = id + "_targets"
    var editor = ace.edit(id);
    var targets = editor.getValue();

    console.log("MESSAGE TARGETS:")
    console.log(targets)


    return {
        "type": "notification",
        "message_content": message_content,
        "targets": targets
    };
}

/**
 * Extracts data from a source cell
 * @param {jQuery} cell - jQuery object representing the source cell
 * @returns {Object} Object containing the cell type and source information
 */
function get_source_cell(cell) {
    var dataid = cell.attr('dataid');

    var id = "content_query_" + dataid;

    console.log("Getting data " + id);

    var source_id = "task_step_" + dataid + "_source";
    var source = $("#" + source_id).val();

    return {
        "type": "source",
        "source": source
    };
}

/**
 * Extracts data from a task cell
 * @param {jQuery} cell - jQuery object representing the task cell
 * @returns {Object} Object containing the cell type and source information
 */
function get_task_cell(cell) {
    var dataid = cell.attr('dataid');

    var id = "content_query_" + dataid;

    console.log("Getting data " + id);

    var task_id = "task_step_" + dataid + "_task";
    var task_ping = "task_step_" + dataid + "_ping";
    var task_timeout = "task_step_" + dataid + "_timeout";

    var task = $("#" + task_id).val();
    var ping = $("#" + task_ping).val();
    var timeout = $("#" + task_timeout).val();

    return {
        "type": "task",
        "task": task,
        "ping": ping,
        "timeout": timeout
    };
}

/**
 * Extracts data from a URL cell
 * @param {jQuery} cell - jQuery object representing the URL cell
 * @returns {Object} Object containing the cell type, mode, URL, and parameters
 */
function get_url_cell(cell) {
    var dataid = cell.attr('dataid');

    var id = "content_query_" + dataid;
    var editor = ace.edit(id + "_params");
    var parameters = editor.getValue();

    var url = $("#" + id + "_url").val();
    var mode = $("#" + id + "_mode").val();

    return {
        "type": "url",
        "mode": mode,
        "url": url,
        "parameters": parameters
    };
}

/**
 * Extracts data from a shell cell
 * @param {jQuery} cell - jQuery object representing the shell cell
 * @returns {Object} Object containing the cell type and shell command content
 */
function get_shell_cell(cell) {
    var id = cell.attr('id')
    var editor = ace.edit(id);
    var code = editor.getValue();

    console.log("Getting shell " + id);

    return {"type": "shell", "content": code};
}

/**
 * Calls the specific get_<cell_type>_cell function to extract the entire cell information
 * @param {jQuery} cell - jQuery object representing the cell
 * @returns {Object} Object containing all cell data based on its type
 * @description Dynamically calls the appropriate getter function based on the cell's type attribute
 */
function get_cell_values(cell) {
    var cell_type = cell.attr("celltype");
    // Get the cell-type specific details
    cell_data = window["get_" + cell_type + "_cell"](cell);


    console.log('cell data: ', cell_data);
    // cell_data["content"] = "locals().keys()";
    return cell_data;
}

/**
 * Extracts data from all cells within a container
 * @param {jQuery} cell_owner - jQuery object representing the container of cells
 * @param {string} topic - Topic/step identifier to associate with the cells
 * @returns {Array} Array of objects containing data from all cells in the container
 * @description Iterates through all cells in the container, extracts their values,
 * and adds common properties like loop-iterable and topic/step.
 */
function get_cell(cell_owner, topic) {
    var owner_cells = [];

    cell_owner.find(".clarama-cell-content").each(
        function (index) {
            var input = $(this);

            //console.log("Getting cell values for " + input.attr('id') + ':' + input.attr('class') + ' = ' + input.attr("celltype"))
            cell = get_cell_values(input);

            // Then let's add in the generic cell information, like the loop
            // we are too low down here, the clarama-cell is near the editable fields far down from clarama-cell-item, so let's go back up to that one
            //console.log("PARENT");
            //console.log(input.closest(".clarama-cell-item"));
            //console.log("CHILD");
            //console.log(input.closest(".clarama-cell-item").find('.loop-iterable'));
            cell['loop-iterable'] = input.closest(".clarama-cell-item").find('.loop-iterable').val();

            if (topic != "") {
                console.log("Getting Cell with STEP: " + topic)
                cell['topic'] = topic;
                cell['step'] = topic;
            }

            owner_cells.push(cell);
        });

    return owner_cells;
}
