//  Copyright (c) 2024. Euan Duncan Macinnes, euan.d.macinnes@gmail.com, S7479622B - All Rights Reserved

function _arrayBufferToBase64(buffer) {
    var binary = '';
    var bytes = new Uint8Array(buffer);
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

// This file is responsible for reading all field values (calling the relevant routines for specific cells in clarama_cells.js)
// gathering that data, and separately then saving this JSON on the server

// It also contains the initialisation for enhanced controls that aren't simple HTML form elements, like select2,
// color editors, ACE text editors, and draggable sortable listboxes, with colour coding (e.g. the task steps)

/**
 * Scans for DIV's that are classed as clarama-field, and then looks for a panel_name element inside that div
 * which then returns the value of each field in a dict.
 *
 * This is used by the task & slate to just get a dict of current field values needed before submitting a task
 *
 */
function get_field_values(registry, raw, field_submit) {
    // Raw is used to run the fields. raw is false, when saving the fields (so we don't want to save the field values of e.g. a selected file in this case

    var files_done = true;
    var result = {}

    var original_url = $("#embedded").attr('original_url');

    if (original_url !== undefined) {
        result['original_url'] = original_url;
    }

    $('.clarama-field').each(
        function (index) {
            var input = $(this);
            // var panel = $("#panel_" + input.attr('name'));
            // console.log("Input Field " + input.attr("id") + ':' + input.attr('fieldtype'));

            switch (input.attr('fieldtype')) {
                case 'html':
                    var inputval = input.val();

                    if (input.prop('type') === 'checkbox') {
                        console.log("CHECKBOX");
                        inputval = input.prop('checked');
                    }
                    result[input.attr('name')] = inputval;
                    //console.log('Field (HTML)' + input.attr('name') + ': ' + inputval);
                    break;

                case 'aceeditor':
                    var editor = ace.edit(input.attr('id'));
                    result[input.attr('name')] = editor.getValue();
                    //console.log('Field (ACE)' + input.attr('name') + ': ' + editor.getValue());
                    break;

                case 'trumbowyg':
                    // console.log('trumbowyg' + input.trumbowyg('html'));
                    result[input.attr('name')] = input.trumbowyg('html');
                    //console.log('Field (trumbowyg)' + input.attr('name') + ': ' + input.trumbowyg('html'));
                    break;
            }
        }
    );

    if (raw && field_submit !== undefined)
        $('.clarama-field').each(
            function (index) {
                var input = $(this);
                // var panel = $("#panel_" + input.attr('name'));
                console.log("Input Field " + input.attr("id") + ':' + input.val());

                switch (input.attr('fieldtype')) {
                    case 'file':
                        if (input.val() !== '') {
                            console.log('CLARAMA_FIELDS.js: file field');
                            console.log(input);
                            files_done = false;
                            var fileval = input[0].files[0];
                            var fr = new FileReader();
                            fr.onload = function () {
                                console.log('CLARAMA_FIELDS.js: file field LOADED');
                                var data = fr.result;

                                result[input.attr('name')] = {
                                    'filename': input.val(),
                                    'filedatab64': _arrayBufferToBase64(data)
                                };

                                console.log(result[input.attr('name')]);

                                registry = result;

                                field_submit(registry);
                            };
                            fr.readAsArrayBuffer(fileval);
                        } else {
                            result[input.attr('name')] = {
                                'filename': '',
                                'filedatab64': '',
                            };

                            registry = result;
                            field_submit(registry);
                        }
                }
            }
        );


    if (files_done) {
        if (raw)
            registry = result;
        else {
            this_grid = saveGrid();
            registry['fieldgrid'] = {
                'elements': this_grid['elements'],
                'children': this_grid['grid']['children'],
                'values': result
            };
        }

        console.log(registry);

        if (field_submit !== undefined)
            field_submit(registry);
        else
            return registry;
    }
}

function check_fields_valid() {
    var valid = true;
    console.log("CLARAMA_FIELDS.js: Input Validity Check");
    $('.clarama-field').each(
        function (index) {
            var input = $(this);
            // var panel = $("#panel_" + input.attr('name'));

            if (input.prop('type') !== 'checkbox') {
                if (input.is(':required')) {
                    var inputval = '';

                    switch (input.attr('fieldtype')) {
                        case 'html':
                            inputval = input.val();
                            break;

                        case 'aceeditor':
                            var editor = ace.edit(input.attr('id'));
                            inputval = editor.getValue();
                            break;

                        case 'trumbowyg':
                            inputval = input.trumbowyg('html');
                            break;
                    }
                    console.log(inputval);
                    if ((inputval === '') || (inputval === undefined) || (Array.isArray(inputval) && (inputval.length === 0))) {
                        valid = false;
                        input.tooltip('show');
                    }
                    console.log("Input Field " + input.attr("id") + ':' + inputval + ':' + valid);
                } else {
                    console.log("Input Field " + input.attr("id") + ': not required');
                }
            }
        }
    );

    return valid;
}


/**
 * saveGrid is in the _grid_edit.html and is dynamically generated with the saved grid definition inside the HTML
 */
function get_fields(fields, cell, field_submit) {
    let socket_div = $("#edit_socket");

    var registry = {
        'streams': [],
        'environment': socket_div.attr("environment")
    }

    $('.stream').each(
        function (index) {
            var stream = $(this);

            var current_stream = stream.attr("stream")

            var stream_cells = get_cell(stream, "");

            console.log("Saving stream " + current_stream);
            stream_dict = {};
            stream_dict[current_stream] = stream_cells;
            registry['streams'].push(stream_dict);
        });

    if (fields) {
        get_field_values(registry, false, field_submit);
        // Get the field grid

    } else
        field_submit(registry);
}


/**
 * Enable the custom daterange dropdown, using a custom attribute "data", parsed for JSON, to use to define custom
 * date ranges
 */
$.fn.daterange = function () {
    return this.each(function () {
        let embedded = $(this);

        let data = embedded.attr("data");

        let date_ranges = {};

        if (typeof data !== "undefined") {
            const range_data = JSON.parse(data);

            if ('dateranges' in range_data) {
                for (const [key, value] of Object.entries(range_data['dateranges']).reverse()) {
                    let range_name = value['name'];
                    let erred = false;
                    let start = moment();
                    let end = moment();

                    try {
                        start = eval(value['start']);
                    } catch (err) {
                        console.log("Error in code for the start for date range " + range_name)
                        start = moment();
                        erred = true;
                    }

                    try {
                        end = eval(value['end']);
                    } catch (err) {
                        console.log("Error in code for the end for date range " + range_name)
                        end = moment();
                        erred = true;
                    }

                    if (erred) range_name = range_name + " ERROR";

                    const custom_range = [start, end];
                    date_ranges[range_name] = custom_range;
                }

            }


        }


        let default_date_range = 'Last 7 Days';

        let start = moment().subtract(29, 'days');
        let end = moment();

        if (default_date_range in date_ranges) {
            start = date_ranges[default_date_range][0];
            end = date_ranges[default_date_range][1];
        }


        embedded.daterangepicker({
            startDate: start,
            endDate: end,
            showDropdowns: true,
            timePicker: true,
            linkedCalendars: false,
            ranges: date_ranges,
        });
    });
}

/**
 * Initialise the select2, with any options present in the file, and enabling any data connectivity if data connectivity
 * is specified in the DIV (a sourceurl for retrieving JSON data is specified).
 */
$.fn.initselect = function () {
    return this.each(function () {
        var embedded = $(this);
        if (!embedded.attr("clarama_data_set")) {
            if (embedded.attr("sourceurl")) {
                console.log("Enabling data for select2: " + embedded.attr("sourceurl"))

                var close_on_select = embedded.attr("close_on_select");

                if (close_on_select === undefined)
                    close_on_select = false

                embedded.select2({
                    selectionCssClass: "select2-select",
                    closeOnSelect: close_on_select,
                    dataType: 'json',
                    minimumResultsForSearch: 1,
                    ajax: {
                        url: embedded.attr("sourceurl"),
                        dataType: 'json',
                        contentType: "application/json; charset=utf-8",
                        type: "POST",
                        data: function (params) {
                            var values = get_field_values({}, true, undefined);
                            var query = {
                                search: params.term,
                                values: values
                            }
                            //console.log("Fetching data " + params.term + " from " + embedded.attr("sourceurl"))
                            return JSON.stringify(query);
                        },
                        processResults: function (data) {
                            console.log("Results")
                            console.log(data)


                            var resultarr = [];
                            var rows = data['results']['rows'];
                            var headings = ['id', 'text', 'selected', 'disabled']
                            var hcount = headings.length;

                            if (data['data'] != 'ok') {
                                var error_lines = data['error'].split(/\r?\n/)
                                var i = 0
                                for (var r in error_lines) {

                                    if (r !== undefined) {
                                        if (typeof error_lines[r] !== 'function') {
                                            var result = {};
                                            result['id'] = 'error' + i;
                                            result['text'] = error_lines[r];
                                            resultarr.push(result);
                                            i = i + 1;
                                        }
                                    }
                                }
                            } else {
                                for (var row in rows) {
                                    var result = {};
                                    for (var i = 0; i < hcount; i++) {
                                        result[headings[i]] = rows[row][i];
                                    }

                                    resultarr.push(result);
                                }
                            }

                            console.log(resultarr);
                            return {
                                results: resultarr
                            };
                        }
                    }
                });
            } else {
                embedded.select2({width: "100%", closeOnSelect: embedded.attr('closeOnSelect') || false});
            }

            embedded.attr("clarama_data_set", true)
        }
    });
}

$.fn.editor = function () {
    return this.each(function () {
        var embedded = $(this);

        var editor_tag = embedded.attr("id");

        if (embedded.attr("editor")) {
            var editor_mode = embedded.attr("editor")
            var savebutton = embedded.attr("savebutton")
            var editor = ace.edit(editor_tag);
            editor.setTheme("ace/theme/tomorrow");
            editor.session.setMode("ace/mode/" + editor_mode);
            editor.setOptions({
                fontSize: 16,
                fontFamily: "Consolas,Monaco,'Andale Mono','Ubuntu Mono',monospace !important",
                maxLines: 75
            });

            $('#' + savebutton).click(function () {
                var data = {
                    task_action: "save",
                    edited_content: editor.getValue()
                }

                console.log('Saving .. ' + editor.getValue())

                $.ajax({
                    type: 'POST',
                    url: $(location).attr('href'),
                    datatype: "html",
                    contentType: 'application/json',
                    data: JSON.stringify(data),
                    success: function (data) {
                        console.log('Submission was successful.');
                        console.log(data);
                        flash("Saved!", "success");
                    },
                    error: function (data) {
                        console.log('An error occurred.');
                        console.log(data);
                        flash("An error occured.", "danger");
                    }
                })
            });
        }
    });
}

/**
 * Cell Navigation and Execution Functions
 * Provides keyboard shortcuts for navigating and executing cells
 */
function initializeCellNavigation() {
    let currentCellIndex = null;
    
    function getAllCells() {
        return $('.clarama-cell-item').toArray().sort((a, b) => {
            const aStep = parseInt($(a).attr('step'));
            const bStep = parseInt($(b).attr('step'));
            return aStep - bStep;
        });
    }
    
    function getCurrentCell() {
        let currentCell = null;
        
        // Check if any cell editor has focus
        $('.cell-editor').each(function() {
            if ($(this).is(':focus') || $(this).find(':focus').length > 0) {
                currentCell = $(this).closest('.clarama-cell-item')[0];
                return false; // break
            }
        });
        
        // If no cell has focus, try to find the last clicked cell
        if (!currentCell && currentCellIndex !== null) {
            const cells = getAllCells();
            if (currentCellIndex < cells.length) {
                currentCell = cells[currentCellIndex];
            }
        }
        
        // If still no cell, default to the first cell
        if (!currentCell) {
            const cells = getAllCells();
            if (cells.length > 0) {
                currentCell = cells[0];
                currentCellIndex = 0;
            }
        }
        
        return currentCell;
    }
    
    function moveToNextCell(currentCell) {
        const cells = getAllCells();
        const currentIndex = cells.indexOf(currentCell);
        
        if (currentIndex !== -1 && currentIndex < cells.length - 1) {
            const nextCell = cells[currentIndex + 1];
            currentCellIndex = currentIndex + 1;
            
            // Focus on the next cell's editor
            const nextEditor = $(nextCell).find('.cell-editor').first();
            if (nextEditor.length > 0) {
                nextEditor.focus();
                
                // If there's a text input or textarea in the editor, focus on it
                const textInput = nextEditor.find('input[type="text"], textarea, .ace_text-input').first();
                if (textInput.length > 0) {
                    textInput.focus();
                }
            }
            
            return nextCell;
        }
        
        return null;
    }
    
    function runCurrentCell(cell) {
        if (!cell) return false;
        
        const $cell = $(cell);
        const runButton = $cell.find('.celleditrun').first();
        if (runButton.length > 0) {
            runButton.click();
            return true;
        }
        
        return false;
    }
    
    // Event handlers
    $(document).on('click', '.clarama-cell-item', function() {
        const cells = getAllCells();
        currentCellIndex = cells.indexOf(this);
    });
    
    $(document).on('focus', '.cell-editor, .cell-editor input, .cell-editor textarea', function() {
        const cell = $(this).closest('.clarama-cell-item')[0];
        if (cell) {
            const cells = getAllCells();
            currentCellIndex = cells.indexOf(cell);
        }
    });
    
    $(document).on('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.keyCode === 13) {
            e.preventDefault();
            
            const currentCell = getCurrentCell();
            if (!currentCell) return;
            
            const wasRun = runCurrentCell(currentCell);
            const nextCell = moveToNextCell(currentCell);
        }
    });
}

$(document).ready(function() {
    initializeCellNavigation();
});

