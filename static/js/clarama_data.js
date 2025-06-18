/**
 * Clarama Data JS - Functions for data visualization and manipulation
 * @fileoverview This file provides functions for creating and manipulating data
 * visualizations, including tables and charts, in the Clarama interface.
 */

/**
 * Creates a Bootstrap table from provided data
 * @param {string} table_id - ID of the HTML element where the table will be rendered
 * @param {Object} table_data - Data object containing columns and rows
 * @description Transforms the provided data into a format suitable for Bootstrap Table
 * and initializes the table with appropriate options
 */
function bTable(table_id, table_data) {
    var table_columns = [];
    var table_rows = [];
    var headings = [];

    console.log(table_id + " TABLE_DATA");
    //console.log(table_data);
    //hello this is a test

    for (col of table_data['cols']) {
        headings.push(col);
        var col_dict = {
            'field': col,
            'title': col,
            'sortable': true
        }
        table_columns.push(col_dict);
    }

    Object.entries(table_data['rows']).forEach((row) => {
        this_row = row[1];
        //console.log("row " + this_row);
        col_dict = {};
        for (let i = 0; i < this_row.length; i++) {
            var colname = headings[i];
            col_dict[colname] = this_row[i];
        }
        table_rows.push(col_dict);
    });


    $('#' + table_id).bootstrapTable('destroy').bootstrapTable({
        exportDataType: 'all',
        exportOptions: {},
        exportTypes: ['json', 'xml', 'csv', 'txt', 'excel', 'pdf'],
        columns: table_columns,
        data: table_rows,
        onClickRow: function (row, $element, field) {
            // alert(JSON.stringify(row));
            table_selection = {
                row: row,
                field: field
            };
            perform_interact($('#' + table_id), table_selection);
        }
    });
}

/**
 * Applies formatting to a chart dataset based on provided format specifications
 * @param {Object} dataset - The chart dataset to format
 * @param {Array} formats - Array of format specifications
 * @returns {Object} The formatted dataset
 * @description Applies visual formatting (colors, line styles, point styles, etc.)
 * to a chart dataset based on matching format specifications
 */
function ChartSeriesFormat(dataset, formats) {
    console.log('CSF ' + dataset['id']);
    if (formats === undefined) {
        dataset['fill'] = false;
        dataset['stepped'] = false;
        dataset['pointRadius'] = 4;
        dataset['borderWidth'] = 2;
        return dataset;
    }

    for (f = 0; f < formats.length; f++) {
        var format = formats[f];
        var match = true;

        if (format['format-nrx'] == dataset['id']) {
            match = true;
            console.log("CSF MATCHED SERIES " + dataset['id'] + " to format " + format['format-nrx']);
        } else {
            if (format['format-nrx'] != '') {
                try {
                    var re = new RegExp(format['format-nrx']);
                    match = re.test(dataset['id']);

                    if (match)
                        console.log("CSF RegEx MATCHED SERIES " + dataset['id'] + " to format " + format['format-nrx']);
                    //console.log("RexEx test result: " + dataset['id'] + " vs " + format['format-nrx'] + '=' + match)
                } catch (e) {
                    alert("RegEx " + format['format-nrx'] + " caused " + e);
                }
            }
        }

        if (match) {
            if (format['format-lw'] === undefined || format['format-lw'] === '')
                format['format-lw'] = 2;

            if (format['format-pr'] === undefined || format['format-pr'] === '')
                format['format-pr'] = 4;

            if (format['format-ps'] === undefined || format['format-ps'] === '')
                format['format-ps'] = 'circle';


            dataset['fill'] = format['format-f'];
            dataset['stepped'] = format['format-p'];
            dataset['pointRadius'] = format['format-pr'];
            dataset['pointStyle'] = format['format-ps'];
            dataset['borderWidth'] = format['format-lw'];
            dataset['unitAxis'] = format['format-ua'];

            if (format['format-miny'] !== undefined) {

            }

            if (format['format-maxy'] !== undefined) {

            }

            if (format['format-title'] !== undefined && format['format-title'] !== '')
                dataset['label'] = format['format-title'];

            if (format['format-col'] !== undefined) {
                //console.log("SERIES colour of " + dataset['id'] + " set to '" + format['format-col']);

                if (chartColors[format['format-col']] !== undefined)
                    dataset['borderColor'] = chartColors[format['format-col']]
                else
                    dataset['borderColor'] = format['format-col'];
            }

            if (format['format-col-back'] !== undefined) {
                //console.log("SERIES colour of " + dataset['id'] + " set to '" + format['format-col-back']);

                if (chartColors[format['format-col-back']] !== undefined)
                    dataset['backgroundColor'] = chartColors[format['format-col-back']]
                else
                    dataset['backgroundColor'] = format['format-col-back'];
            }

            if (format['format-dt'])
                dataset['borderDash'] = [10, 5];

            // console.log("Matched series " + dataset['label'] + " to '" + format['format-nrx'] + '');
        } else {
            // console.log("NO Matched series " + dataset['label'] + " to '" + format['format-nrx'] + "'");
        }

        dataset['pointHoverRadius'] = 15;
    }

    return dataset;
}

/**
 * Checks if a number is even
 * @param {number} n - The number to check
 * @returns {boolean} True if the number is even, false otherwise
 */
function isEven(n) {
    return n % 2 === 0;
}

/**
 * Extends Array prototype to add an insert method
 * @param {number} index - The index at which to insert items
 * @param {...*} items - The items to insert
 * @description Inserts items at the specified index without removing any elements
 */
Array.prototype.insert = function (index, ...items) {
    this.splice(index, 0, ...items);
};

/**
 * Adds or merges a dataset into a collection of datasets
 * @param {string} name - The name/identifier of the dataset
 * @param {Array} datasets - The collection of datasets to add to
 * @param {Object} dataset - The dataset to add
 * @param {boolean} grouping - Whether to merge with existing datasets of the same name
 * @description If grouping is true and a dataset with the same name exists,
 * the data will be concatenated. Otherwise, the dataset will be inserted at the
 * appropriate position or added to the end.
 */
function push_dataset(name, datasets, dataset, grouping) {
    if (datasets.length === 0) {
        console.log("PUSH adding dataset " + name + "(" + dataset['data'].length + ") " + datasets.length);
        datasets.push(dataset);
        return;
    }

    for (ds = 0; ds < datasets.length; ds++) {
        if (datasets[ds]['id'] === name) {
            if (!grouping) {
                console.log("PUSH inserting dataset " + name + " at " + ds);
                datasets.insert(ds, dataset);
            } else {
                console.log("PUSH grouping dataset " + name + "(" + dataset['data'].length + ") at " + ds);
                datasets[ds]['data'] = datasets[ds]['data'].concat(dataset['data']);  /// This adds the data into the existing dataset
            }
            return;
        }
    }

    console.log("PUSH adding dataset " + name + "(" + dataset['data'].length + ") " + datasets.length);
    datasets.push(dataset);
}

/**
 * Assigns an axis to a chart series based on format specifications
 * @param {Object} dataset - The chart dataset to assign an axis to
 * @param {Object} scales - The scales configuration object for the chart
 * @param {string} axis - The default axis to use
 * @param {Array} formats - Array of format specifications
 * @description Examines the dataset and format specifications to determine
 * the appropriate axis for the dataset, with format specifications taking precedence.
 * This function will be called assuming a unit axis is specified.
 */
function ChartSeriesAxis(dataset, scales, axis, formats) {
    console.log('CSA ' + dataset['id']);
    // First, we're going to loop through the formats to see if there's a specific format override for the current dataset
    if (formats !== undefined) {

        for (f = 0; f < formats.length; f++) {
            var format = formats[f];
            var match = true;

            if (format['format-nrx'] == dataset['id']) {
                match = true;
                console.log("CSA MATCHED SERIES " + dataset['id'] + " to format " + format['format-nrx']);
            } else {
                if (format['format-nrx'] != '') {
                    try {
                        var re = new RegExp(format['format-nrx']);
                        match = re.test(dataset['id']);

                        if (match)
                            console.log("CSA RegEx MATCHED SERIES " + dataset['id'] + " to format " + format['format-nrx']);

                        //console.log("RexEx test result: " + dataset['id'] + " vs " + format['format-nrx'] + '=' + match)
                    } catch (e) {
                        alert("RegEx " + format['format-nrx'] + " caused " + e);
                    }
                }
            }

            if (match) {
                if (format['format-ua'] !== undefined && format['format-ua'] !== '')
                    axis = format['format-ua'];
            }
        }
    }

    if (axis === undefined) {
        console.log("CSA got bored");
        return;
    }

    const keys = Object.keys(scales);
    console.log("UNIT AXIS: " + axis + ' ' + keys.length);
    var found = undefined;
    for (f = 0; f < keys.length; f++) {
        var scale = scales[keys[f]];

        if (scale['title']['text'] === axis) {
            found = keys[f];
            console.log("REUSING " + found);
        }

    }

    if (found === undefined) {
        var custom_yaxis = keys.length

        var pos = 'left';
        if (isEven(custom_yaxis))
            pos = 'right';

        scales['yAxis' + custom_yaxis] = {
            type: 'linear',
//            display: 'auto',
            position: pos,
//            bounds: 'data',
//            clip: true,
//            axis: 'y',
            title: {
                text: axis,
                display: true,
            }
        }

        if (keys.length > 1)
            scales['yAxis' + custom_yaxis]['grid'] = {
                drawOnChartArea: false, // only want the grid lines for one axis to show up
            };

        found = 'yAxis' + custom_yaxis;
    }

    if (found !== undefined) {
        dataset['yAxisID'] = found
    }
}

/**
 * Recursively merges two objects, including nested objects
 * @param {Object} obj1 - The target object to merge into
 * @param {Object} obj2 - The source object to merge from
 * @returns {Object} The merged object (obj1 modified in place)
 * @description Performs a deep merge of obj2 into obj1, recursively handling nested objects.
 * Source: https://medium.com/@abbas.ashraf19/8-best-methods-for-merging-nested-objects-in-javascript-ff3c813016d9
 */
function deepMerge(obj1, obj2) {
    for (let key in obj2) {
        if (obj2.hasOwnProperty(key)) {
            if (obj2[key] instanceof Object && obj1[key] instanceof Object) {
                obj1[key] = deepMerge(obj1[key], obj2[key]);
            } else {
                obj1[key] = obj2[key];
            }
        }
    }
    return obj1;
}

/**
 * Mapping of axis type names to Chart.js axis types
 * @type {Object.<string, string>}
 * @description Maps user-friendly or application-specific axis type names
 * to the corresponding Chart.js axis type values
 */
const axis_type_map = {
    'linear': 'linear',
    'logarithmic': 'logarithmic',
    'time': 'time',
    'timeseries': 'timeseries',
    'category': 'category',
    'category_grouped': 'category',
    'category_bulk': 'category',
}

/**
 * Mapping of chart type names to Chart.js chart types
 * @type {Object.<string, string>}
 * @description Maps user-friendly or application-specific chart type names
 * to the corresponding Chart.js chart type values
 */
const chart_type_map = {
    'Line': 'line',
    'Bar': 'bar',
    'Radar': 'radar',
    'Polar Area': 'polarArea',
    'Doughnut': 'doughnut',
    'Bubble': 'bubble',
    'Pie': 'pie',
    'Scatter': 'scatter',
}

/**
 * Creates a Chart.js chart with the provided data and configuration
 * @param {string} chart_id - ID of the HTML element where the chart will be rendered
 * @param {Object} chart_data - Object containing chart data and configuration
 * @param {Object} chart_data.data - The data to be visualized
 * @param {Object} chart_data.chart - Configuration options for the chart
 * @description Processes the provided data and configuration to create a Chart.js
 * visualization with appropriate scales, datasets, and formatting
 */
function bChart(chart_id, chart_data) {
    var data = chart_data['data'];
    var config = chart_data['chart'];
    var formats = config['series-formats'];

    var aspect_ratio = config['aspect_ratio'];
    var maintain = false;

    if (isNaN(aspect_ratio) || !aspect_ratio) {
        aspect_ratio = 2.5;
        maintain = true;
    }

    var legend_display = config['legend'] != 'Off';


    console.log('CHART aspect ' + aspect_ratio + ' with maintain ' + maintain);
    console.log(config);

    var x_axis_type = config['xaxis-type'] || 'category';

    var time = x_axis_type === 'time';
    var category = x_axis_type === 'category';

    var category_grouped = x_axis_type === 'category_grouped';
    var category_bulk = x_axis_type === 'category_bulk';

    var x_axis_final_type = axis_type_map[x_axis_type];

    var chart_scales = {};
    var xaxis_scale = {
        display: true,
        type: x_axis_final_type,
        title: {
            display: true,
            text: config['xaxis-title'] || 'X Axis'
        }
    };

    var yaxis_scale = {
        type: 'linear',
        display: true,
        position: 'left',
        title: {
            display: true,
            text: 'Y Axis'
        }
    };

    var labels = undefined;

    var datasets = [];

    for (i = 0; i < config['series-groups'].length; i++) {
        var user_config = config['userconfig']
        console.log("SERIES GROUP " + i + " of " + config['series-groups'].length);
        console.log(config['series-groups'][i]);
        var sg = config['series-groups'][i];
        var label = sg['series-y'];

        var xaxis_id = data['cols'].indexOf(sg['series-x']);
        var yaxis_id = data['cols'].indexOf(sg['series-y']);
        var zaxis_id = data['cols'].indexOf(sg['series-z']);
        var series_id = data['cols'].indexOf(sg['series-s']);
        var label_id = data['cols'].indexOf(sg['series-l']);
        var unit_id = data['cols'].indexOf(sg['series-u']);
        var unit = undefined;

        console.log("General chart info: ");
        console.log({
            x: xaxis_id,
            y: yaxis_id,
            z: zaxis_id, s: series_id, l: label_id, u: unit_id, unit: sg['series-u']
        });
        if (unit_id < 0 && sg['series-u'] !== "")
            yaxis_scale['title']['description'] = sg['series-u'];

        if (xaxis_id >= 0 && yaxis_id >= 0) {
            xaxis = data['rows'][xaxis_id];
            yaxis = data['rows'][yaxis_id];

            if (xaxis !== undefined && yaxis !== undefined) {

                if (time) {
                    var needs_z = "yes";
                    if (xaxis.length > 1) {
                        var xz = 0
                        var found = false;

                        while (xz < xaxis.length && !found) {

                            if (xaxis[xz] !== undefined)
                                if (xaxis[xz].indexOf("Z") >= 0) {
                                    needs_z = "no";
                                    found = true;
                                } else {
                                    if (xaxis[xz].indexOf("+00:00") >= 0)
                                        needs_z = "00";
                                    else
                                        needs_z = "yes";
                                    found = true;
                                }

                            xz++;

                            if (xz > 10)
                                found = true;
                        }
                    }

                    if (needs_z === "yes") {
                        for (p = 0; p < xaxis.length; p++) {
                            ndt = new Date(xaxis[p] + 'Z');
                            xaxis[p] = ndt;
                        }
                    } else if (needs_z === "00") {
                        for (p = 0; p < xaxis.length; p++) {
                            var val = xaxis[p];
                            ndt = new Date(val.substring(0, val.length - 6) + 'Z');
                        }
                    } else {
                        for (p = 0; p < xaxis.length; p++) {
                            ndt = new Date(xaxis[p]);
                            xaxis[p] = ndt;
                        }
                    }

                    console.log("Converted X Axis");
                    console.log(xaxis);
                }

                labels = xaxis


                if (zaxis_id >= 0)
                    zaxis = data['rows'][zaxis_id];

                if (label_id >= 0)
                    labelaxis = data['rows'][label_id];

                if (unit_id >= 0)
                    unitaxis = data['rows'][unit_id];

                xaxis_scale['title']['text'] = sg['series-x'];
                yaxis_scale['title']['text'] = sg['series-y'];
                chart_scales['x'] = xaxis_scale;

                if (unit_id < 0 && sg['series-u'] === "") {
                    console.log("No units, creating default Y")
                    chart_scales['y'] = yaxis_scale;
                } else {
                    console.log("Fark");
                }

                //

                var points = [];

                if (series_id >= 0 && !category_bulk) {
                    series = data['rows'][series_id];

                    if (unit_id > 0)
                        unit = data['rows'][unit_id];

                    if (unit === '')
                        unit = undefined;


                    if (series !== undefined) {
                        var curr = series[0];

                        label = curr;

                        for (p = 0; p < xaxis.length; p++) {
                            if (series[p] !== curr)   // then pop the current dataset onto the datasets queue, and reset
                            {
                                dataset = {
                                    id: label,
                                    label: label,
                                    data: points,
                                    type: chart_type_map[sg['series-type']]
                                }

                                if (unit !== undefined) {
                                    console.log("Data Unit Axis");
                                    ChartSeriesAxis(dataset, chart_scales, unit[p - 1], formats);
                                } else if (sg['series-u'] !== "") {
                                    console.log("Labelled Unit Axis");
                                    ChartSeriesAxis(dataset, chart_scales, sg['series-u'], formats);
                                } else {
                                    ChartSeriesAxis(dataset, chart_scales, undefined, formats);
                                }

                                push_dataset(curr, datasets, ChartSeriesFormat(dataset, formats), category_grouped);

                                label = series[p];
                                points = [];
                                curr = series[p];
                            }

                            point = {
                                x: xaxis[p],
                                y: yaxis[p]
                            }

                            if (zaxis_id >= 0)
                                point['z'] = zaxis[p];

                            if (label_id >= 0)
                                point['text'] = labelaxis[p];

                            points.push(point);
                        }
                    }

                } else {
                    if (!category_bulk) {
                        for (p = 0; p < xaxis.length; p++) {
                            point = {
                                x: xaxis[p],
                                y: yaxis[p]
                            }

                            if (label_id >= 0)
                                point['text'] = labelaxis[p];

                            points.push(point);

                        }
                    }
                }

                if (series_id >= 0 && category_bulk) {
                    console.log("CATEGORY BULK");
                    var series_axis = data['rows'][series_id];
                    var unique_series = [...new Set(series_axis)];
                    if (unit_id > 0) unitaxis = data['rows'][unit_id];
                    unit = '';

                    for (s = 0; s < unique_series.length; s++) {
                        var b_points = [];
                        var curr_series = unique_series[s];

                        if (unit_id > 0) {
                            for (p = 0; p < xaxis.length; p++) {
                                var yval = null;
                                if (series_axis[p] === curr_series) {
                                    yval = yaxis[p]
                                    unit = unitaxis[p];
                                }

                                point = {
                                    x: xaxis[p],
                                    y: yval
                                }

                                if (label_id >= 0)
                                    point['text'] = labelaxis[p];

                                b_points.push(point);
                            }
                        } else {

                            for (p = 0; p < xaxis.length; p++) {
                                var yval = null;
                                if (series_axis[p] === curr_series) yval = yaxis[p];

                                point = {
                                    x: xaxis[p],
                                    y: yval
                                }

                                if (label_id >= 0)
                                    point['text'] = labelaxis[p];

                                b_points.push(point);
                            }
                        }

                        if (unit === '')
                            unit = undefined;

                        label = curr_series;
                        dataset = {
                            id: label,
                            label: label,
                            data: b_points,
                            type: chart_type_map[sg['series-type']],
                        }

                        if (unit !== undefined) {
                            ChartSeriesAxis(dataset, chart_scales, unit, formats);
                        } else if (sg['series-u'] !== "")
                            ChartSeriesAxis(dataset, chart_scales, sg['series-u'], formats)
                        else {
                            ChartSeriesAxis(dataset, chart_scales, undefined, formats);
                        }


                        // The label is a bit pointless here, this is a single dataset situation anyway
                        push_dataset(label, datasets, ChartSeriesFormat(dataset, formats), false);


                    }
                } else {
                    var dataset_label = label;

                    if (series_id < 0 && sg['series-s'] !== "")
                        dataset_label = sg['series-s'];

                    dataset = {
                        id: dataset_label,
                        label: dataset_label,
                        data: points,
                        type: chart_type_map[sg['series-type']],
                    }

                    if (unit !== undefined) {
                        if (xaxis.length >= 1)
                            ChartSeriesAxis(dataset, chart_scales, unit[xaxis.length - 1], formats);
                    } else if (sg['series-u'] !== "")
                        ChartSeriesAxis(dataset, chart_scales, sg['series-u'], formats)
                    else {
                        ChartSeriesAxis(dataset, chart_scales, undefined, formats);
                    }


                    // The label is a bit pointless here, this is a single dataset situation anyway
                    push_dataset(label, datasets, ChartSeriesFormat(dataset, formats), category_grouped);
                }

                console.log("DATASETS");
                console.log(datasets.length);
            }
        } else if (xaxis_id > 0) {
            var dataset_label = 'data'

            if (sg['series-s'] !== "") dataset_label = sg['series-s'];

            dataset = {
                id: "dataset" + i,
                label: dataset_label,
                data: data['rows'][xaxis_id],
                type: chart_type_map[sg['series-type']],
            }

            if (sg['series-u'] !== "") ChartSeriesAxis(dataset, chart_scales, sg['series-u'], formats)
            else ChartSeriesAxis(dataset, chart_scales, undefined, formats);

            push_dataset(label, datasets, ChartSeriesFormat(dataset, formats), category_grouped);

            if (label_id >= 0)
                labels = data['rows'][label_id]
            else
                labels = data['rows'][xaxis_id];
        } else
            flash("Didn't find X and Y axis for chart in columns [" + data['cols'] + ']. X: ' + sg['series-x'] + '. Y: ' + sg['series-y']);

        console.log('i' + i);
    }

    var chartColors = {
        red: 'rgb(255, 50, 50)',
        orange: 'rgb(255, 159, 64)',
        yellow: 'rgb(255, 205, 86)',
        green: 'rgb(75, 255, 192)',
        blue: 'rgb(54, 162, 235)',
        purple: 'rgb(153, 102, 255)',
        grey: 'rgb(201, 203, 207)',
        mediumgrey: 'rgb(128, 128, 128)',
        darkgrey: 'rgb(64, 64, 64)',
        black: 'rgb(20, 20, 20)'
    };

    var annotation_example = {
        annotations: {
            alarm1: {
                borderDash: [4, 4],
                // Indicates the type of annotation
                type: 'line',
                borderColor: 'rgb(255, 99, 132)',
                yMin: 85,
                yMax: 95,
                borderWidth: 1,
                label: {
                    content: 'RPM max alarm',
                    enabled: true,
                    display: true,
                    position: 'end',
                    backgroundColor: 'red',
                }
            }
        }
    }


    console.log("FINAL DATASETS: " + datasets.length);
    console.log(datasets);
    console.log("FINAL SCALES: " + Object.keys(chart_scales).length);
    console.log(chart_scales);
    console.log("FINAL FORMATS: " + Object.keys(formats).length);
    console.log(formats);

    var data = {
        datasets: datasets
    }

    if (category || category_grouped || category_bulk) {
        const unique_labels = [...new Set(labels)] // Get unique list of labels for the x axis
        console.log("FINAL LABELS: " + unique_labels.length);
        console.log(unique_labels);
        data['labels'] = unique_labels;
    }


    var config = {
        data: data,
        stacked: false,
        options: {
            responsive: true,
            maintainAspectRatio: maintain,
            aspectRatio: aspect_ratio,
            layout: {
                autoPadding: false,
                padding: {
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0
                }
            },
            animation: false,
            transitions: {active: {animation: {duration: 0}}},
            scales: chart_scales,
            onClick: (event, elements, chart) => {
                chart_id = chart.canvas.id

                if (elements[0]) {
                    const i = elements[0].index;
                    const ds = elements[0].datasetIndex;
                    series = chart.data.datasets[ds].label;
                    x = chart.data.datasets[ds].data[i].x;
                    y = chart.data.datasets[ds].data[i].y;

                    datapoint = {
                        series: series,
                        x: x,
                        y: y
                    }
                    perform_interact($('#' + chart_id), datapoint);
                }
            },
            plugins: {
                legend: {
                    display: legend_display,
                    position: config['legend'].toLowerCase(),
                    usePointStyle: true,
                },
                tooltip: {
                    // filter: function (tooltipItem, data) {
                    //     if (data > 0) return false;
                    //     // Filter logic here
                    //     return true; // or false
                    // },
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';

                            if (context.raw.text)
                                return context.raw.text;

                            if (label) {
                                label += ': ';
                            }
                            if (context.raw.y !== undefined) {
                                label += context.raw.y;
                            } else
                                label += context.raw;


                            return label;
                        }
                    }
                },
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'x',
                        modifierKey: 'ctrl'
                    },
                    zoom: {
                        wheel: {
                            enabled: true,
                            modifierKey: 'ctrl',
                        },
                        drag: {
                            enabled: true,
                            borderColor: 'rgb(54, 162, 235)',
                            borderWidth: 1,
                            backgroundColor: 'rgba(54, 162, 235, 0.3)'
                        },
                        mode: 'x',
                    }
                },
                datalabels: {
                    color: 'rgba(54, 162, 235, 0.3)',
                    labels: {
                        title: null
                    }
                },
                title: {
                    display: config['title'] != '',
                    text: config['title'],
                    font: {
                        size: 22
                    }
                },
                subtitle: {
                    display: config['subtitle'] != '',
                    text: config['subtitle'],
                    font: {
                        size: 18
                    }
                }
            }
        }
    };

    if (user_config !== undefined) {
        console.log("CHART deepMerging");
        config = deepMerge(config, user_config);
    }

    console.log("FINAL CHART");
    console.log(config);

    var chart_id = "c_" + chart_id;
    let chartStatus = Chart.getChart(chart_id); // <canvas> id
    if (chartStatus !== undefined) {
        console.log("Destroying existing chart " + chart_id);
        chartStatus.destroy();
    }
    var chart_element = $('#' + chart_id);
    console.log("Chart: " + chart_id + ' - ');
    console.log(chart_data);
    chart_element.attr("chart", new Chart(chart_element, config));
}
