/**
 * Clarama Data JS - Functions for data visualization and manipulation
 * @fileoverview This file provides functions for creating and manipulating data
 * visualizations, including tables and charts, in the Clarama interface.
 */

/**
 * Applies formatting to a chart dataset based on provided format specifications
 * @param {Object} dataset - The chart dataset to format
 * @param {Array} formats - Array of format specifications
 * @returns {Object} The formatted dataset
 * @description Applies visual formatting (colors, line styles, point styles, etc.)
 * to a chart dataset based on matching format specifications
 */
function ChartSeriesFormat(dataset, formats, index = 0) {

    var colorlist = Object.keys(chartColors)
    var colorindex = index % colorlist.length;
    console.log("SERIES formatless colour of " + dataset['id'] + " defaulted to " + colorlist[colorindex]);
    dataset['borderColor'] = chartColors[colorlist[colorindex]];
    dataset['backgroundColor'] = chartColors[colorlist[colorindex]];

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

            if (format['format-col'] !== undefined && format['format-col'] !== '') {
                console.log("SERIES colour of " + dataset['id'] + " set to '" + format['format-col'] + "'");

                if (chartColors[format['format-col']] !== undefined)
                    dataset['borderColor'] = chartColors[format['format-col']]
                else
                    dataset['borderColor'] = format['format-col'];
            } else {
                var colorlist = Object.keys(chartColors)
                var colorindex = index % colorlist.length;
                console.log("SERIES border colour of " + dataset['id'] + " defaulted to " + colorlist[colorindex]);
                dataset['borderColor'] = chartColors[colorlist[colorindex]];
            }

            if (format['format-col-back'] !== undefined && format['format-col-back'] !== '') {
                console.log("SERIES colour of " + dataset['id'] + " SET to '" + format['format-col-back'] + "'");

                if (chartColors[format['format-col-back']] !== undefined)
                    dataset['backgroundColor'] = chartColors[format['format-col-back']]
                else
                    dataset['backgroundColor'] = format['format-col-back'];
            } else {
                var colorlist = Object.keys(chartColors)
                var colorindex = index % colorlist.length;
                console.log("SERIES background colour of " + dataset['id'] + " defaulted to " + colorlist[colorindex]);
                dataset['backgroundColor'] = chartColors[colorlist[colorindex]];
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

function check_field(field_name, dataset, debug = true) {
    if (field_name == undefined)
        return undefined;

    if (field_name in dataset) {
        if (debug)
            console.log("CHECK FIELD " + field_name + " in " + dataset);
        return field_name;
    }

    return undefined;
}

function isNumeric(str) {
    if (typeof str != "string") return false // we only process strings!
    return !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
        !isNaN(parseFloat(str)) // ...and ensure strings of whitespace fail
}

function parseval(destination, field_name, dataset, index = undefined) {

    if (field_name === undefined) {
        console.log("PARSEVAL " + destination + ": " + field_name + " in " + dataset + " = undefined");
        return undefined;
    }

    if (field_name in dataset) {
        var fld = dataset[field_name]

        if (isNumeric(fld)) {
            fld = parseFloat(fld);
        } else {
            if (index !== undefined) // LABEL axis fields need to show the string
                fld = index;
        }
        console.log("PARSEVAL " + destination + ": [" + field_name + "] = " + fld);

        return fld;
    }
    if (isNumeric(field_name)) {
        var val = parseFloat(field_name);
        console.log("PARSEVAL (number)" + destination + ": " + field_name + " = " + val);
        return val;
    }

    console.log("PARSEVAL " + destination + ": " + field_name + " undefined");

    return field_name; // Label fields that aren't an axis should just show the label
}


/**
 * Processes annotation data from form inputs and creates ChartJS annotation objects
 * @param result An object containing ChartJS annotation configurations
 * @param {Object} definition - Annotation definition for given dataset
 * @param {Array} dataset - Array of annotation data
 * @description Takes annotation data from data_edit_chart_series_annotation.html form inputs
 * and converts it into properly formatted annotation objects for ChartJS
 */
function ChartAnnotations(result, definition, dataset, chart_path) {
    if (!dataset || dataset['rows'].length === 0) {
        console.log("Annotation Error: No dataset provided");
        return;
    }

    if (!definition || definition.length === 0) {
        console.log("Annotation Error: No definition provided");
        return;
    }

    let state_val = undefined;

    let ai = Object.keys(result).length;

    if (ai === undefined)
        ai = 0;

    let drows = dataset['rows'][0].length;

    console.log("ANNOTATION DATA " + ai + " of " + drows);
    console.log(definition);

    for (var i = 0; i < drows; i++) {

        let anno = {};

        for (c = 0; c < dataset['cols'].length; c++) {
            col = dataset['cols'][c];
            anno[col] = dataset['rows'][c][i];
        }

        var annoId = 'anno' + (ai + i);

        var annostate = check_field(definition['anno-s'], anno, false);

        // Skip if essential properties are missing
        if (!definition['anno-type'] || (!definition['anno-x'] && !definition['anno-y'])) {
            console.log("Annotation Error: Missing essential properties from definition:");
            console.log(definition);
            return;
        }

        // Skip if the state field is set and the value of the state field is the same (only annotate on changed values of the field)
        if (annostate !== undefined && anno[annostate] === state_val) {
            continue;
        }

        if (annostate !== undefined) {
            console.log("ANNOTATION STATE " + annostate + " = " + anno[annostate] + " (was " + state_val + ")");
        }

        state_val = anno[annostate];

        let unit_axis = definition['anno-u'];

        if (unit_axis === undefined)
            unit_axis = 'y';

        var annoObj = {
            borderWidth: parseInt(definition['anno-width']) || 1,
        };

        // Set border color
        if (definition['anno-col']) {
            annoObj.borderColor = definition['anno-col'];
        }

        // Set background color if provided
        if (definition['anno-col-back']) {
            annoObj.backgroundColor = definition['anno-col-back'];
        }

        // Set dotted line if checked
        if (definition['anno-dt']) {
            annoObj.borderDash = [4, 4];
        }

        console.log(anno);
        console.log(annoObj);
        let image = parseval("anno-i", definition['anno-i'], anno);

        if (image.slice(0, 1) === '/') {
            image = '/content/download' + image;
        }

        if (image.slice(0, 2) === './') {
            image = '/content/download/' + chart_path + image.slice(1);
        }

        let ymin = parseval("anno-y", definition['anno-y'], anno);
        let ymax = parseval("anno-ym", definition['anno-ym'], anno);
        let xmin = parseval('anno-x', definition['anno-x'], anno, i);
        let xmin_raw = parseval('anno-x', definition['anno-x'], anno);
        let xmax = parseval('anno-xm', definition['anno-xm'], anno, i);
        let annolabel = parseval('anno-label', definition['anno-label'], anno);
        let gotx = (xmin !== undefined && xmin !== '');
        let goty = (ymin !== undefined && ymin !== '');
        let gotxm = (xmax !== undefined && xmax !== '');
        let gotym = (ymax !== undefined && ymax !== '');
        let label_position = 'center';

        console.log("ANNOTATION " + annoId + "[" + image + "] (" + xmin + ',' + ymin + '->' + xmax + ',' + ymax + ') : ' + annolabel);
        console.log("ANNOTATION STATE " + annoId + " (" + gotx + ',' + goty + '->' + gotxm + ',' + gotym + ') : ' + annolabel);

        // Handle different annotation types
        switch (definition['anno-type']) {
            case 'hline':
                annoObj['type'] = 'line';
                // Horizontal line
                console.log("horizontal line");
                annoObj.value = ymin;
                annoObj.scaleID = unit_axis
                break;
            case 'vline':
                annoObj['type'] = 'line';
                // Vertical line
                console.log("vertical line");
                annoObj.value = xmin;
                annoObj.scaleID = 'x';

                break;
            case 'line':
                // Line from point to point
                annoObj['type'] = 'line';

                console.log("coordinated line");
                annoObj.xMin = xmin;
                annoObj.yMin = ymin;
                annoObj.xMax = xmax;
                annoObj.yMax = ymax;

                label_position = 'center';
                break;
            case 'point':
                // Line from point to point
                annoObj['type'] = 'point';

                console.log("point");
                annoObj.xValue = xmin_raw;
                annoObj.yValue = ymin;
                annoObj.pointStyle = 'rectRounded';
                annoObj.radius = 10;
                break;

            case 'box':
                if (gotx && goty && gotxm && gotym) {
                    annoObj['type'] = 'box';
                    annoObj.borderRadius = 4;
                    annoObj.borderWidth = 1;
                    annoObj.xMin = xmin;
                    annoObj.yMin = ymin;
                    annoObj.xMax = xmax;
                    annoObj.yMax = ymax;
                }
                break;
            case 'callout':
                console.log("CALLOUT  (" + xmin + ',' + ymin + ') ');
                if (gotx && goty) {
                    annoObj['type'] = 'label'
                    annoObj['position'] = {
                        x: 'center',
                        y: 'center'
                    };
                    annoObj.content = annolabel;
                    annoObj.xAdjust = xmax;
                    annoObj.yAdjust = ymax;
                    annoObj.xValue = xmin_raw;
                    annoObj.yValue = ymin;
                    let pos = 'left';

                    if (xmax > 0)
                        pos = 'right'

                    if (xmax < 0)
                        pos = 'left'

                    if (ymax < 0)
                        pos = 'bottom'

                    if (ymax > 0)
                        pos = 'top'


                    annoObj['callout'] = {
                        display: true,
                        position: pos
                    };
                }
                break;
            case 'bounds':
                // Custom bounds
                if (gotx && goty && gotym) {
                    annoObj['type'] = 'line';
                    annoObj.xMin = xmin;
                    annoObj.xMax = xmax;
                    annoObj.yMin = ymax;
                    annoObj.yMax = ymax;
                }
                break;
        }

        // Add label if provided
        if (definition['anno-label'] || image) {
            if (annolabel === '' || annolabel === undefined || annolabel === null) {
                annolabel = ' ';
            }

            annoObj.label = {
                content: annolabel,
                rotation: 'auto',
                enabled: true,
                display: true,
                position: label_position,
            };

            if (image !== undefined && image !== '') {
                annolabel = new Image();
                annolabel.src = image;
                annoObj.label.content = annolabel;
                annoObj.label.width = "100%";
                annoObj.label.height = "100%";
                annoObj.label.position = 'center';
            }

            // Set label background color to match border if not specified
            if (definition['anno-col'] && !definition['anno-col-back']) {
                annoObj.label.backgroundColor = definition['anno-col'];
            } else if (definition['anno-col-back']) {
                annoObj.label.backgroundColor = definition['anno-col-back'];
            }
        }

        result[annoId] = annoObj;
    }
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
    // Custom series types mapped to a base Chart.js type
    // Map Radial Bar to 'doughnut' so we don't require a custom controller
    'Radial Bar': 'doughnut',
    'RadialBar': 'doughnut',
    'radialbar': 'doughnut',
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

    var series_index = 0;

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

    var user_config = config['advanced_yaml'];

    for (i = 0; i < config['series-groups'].length; i++) {
        console.log("SERIES GROUP " + i + " of " + config['series-groups'].length);
        console.log(config['series-groups'][i]);
        var sg = config['series-groups'][i];
        var label = sg['series-y'];

        var current_dataset_index = sg['series-tab'];

        if (current_dataset_index === undefined) {
            console.log("No dataset specified, using default 0 out of " + data.length + " datasets");
            current_dataset_index = 0;
        } else
            console.log("SERIES GROUP " + i + " using dataset " + current_dataset_index + " out of " + data.length + " datasets");

        var current_dataset = data[current_dataset_index];

        if (!sg['series-x'] || !sg['series-y']) {
            console.warn("Skipping series group due to missing series-x / series-y", sg);
            continue;
        }

        var xaxis_id = current_dataset['cols'].indexOf(sg['series-x']);
        var yaxis_id = current_dataset['cols'].indexOf(sg['series-y']);
        var zaxis_id = current_dataset['cols'].indexOf(sg['series-z']);
        var series_id = current_dataset['cols'].indexOf(sg['series-s']);
        var label_id = current_dataset['cols'].indexOf(sg['series-l']);
        var unit_id = current_dataset['cols'].indexOf(sg['series-u']);
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
            const xaxisRaw = current_dataset['rows'][xaxis_id];
            const yaxisRaw = current_dataset['rows'][yaxis_id];
            let xaxis = Array.isArray(xaxisRaw) ? xaxisRaw.slice() : [];
            let yaxis = Array.isArray(yaxisRaw) ? yaxisRaw.slice() : [];

            if (xaxis !== undefined && yaxis !== undefined) {

                if (time) {
                    let needs_z = "yes";
                    if (xaxis.length > 0) {
                        const probe = xaxis.find(v => v !== undefined && v !== null);
                        if (probe instanceof Date) {
                            needs_z = "done";
                        } else if (typeof probe === "string") {
                            if (probe.indexOf("Z") >= 0) needs_z = "no";
                            else if (probe.indexOf("+00:00") >= 0) needs_z = "00";
                            else needs_z = "yes";
                        }
                    }
                
                    if (needs_z === "yes") {
                        xaxis = xaxis.map(v => new Date(String(v) + 'Z'));
                    } else if (needs_z === "00") {
                        xaxis = xaxis.map(v => {
                            const s = String(v);
                            return new Date(s.substring(0, s.length - 6) + 'Z');
                        });
                    } else if (needs_z === "no") {
                        xaxis = xaxis.map(v => new Date(String(v)));
                    } else if (needs_z === "done") {
                        // already Date objects — leave as-is
                    }
                
                    console.log("Converted X Axis");
                    console.log(xaxis);
                }                

                labels = xaxis


                if (zaxis_id >= 0)
                    zaxis = current_dataset['rows'][zaxis_id];

                if (label_id >= 0)
                    labelaxis = current_dataset['rows'][label_id];

                if (unit_id >= 0)
                    unitaxis = current_dataset['rows'][unit_id];

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
                    series = current_dataset['rows'][series_id];

                    if (unit_id > 0)
                        unit = current_dataset['rows'][unit_id];

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

                                push_dataset(curr, datasets, ChartSeriesFormat(dataset, formats, series_index), category_grouped);

                                series_index++;

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
                    var series_axis = current_dataset['rows'][series_id];
                    var unique_series = [...new Set(series_axis)];
                    if (unit_id > 0) unitaxis = current_dataset['rows'][unit_id];
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
                        push_dataset(label, datasets, ChartSeriesFormat(dataset, formats, series_index), false);

                        series_index++;
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
                    push_dataset(label, datasets, ChartSeriesFormat(dataset, formats, series_index), category_grouped);

                    series_index++;
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
                data: current_dataset['rows'][xaxis_id],
                type: chart_type_map[sg['series-type']],
            }

            if (sg['series-u'] !== "") ChartSeriesAxis(dataset, chart_scales, sg['series-u'], formats)
            else ChartSeriesAxis(dataset, chart_scales, undefined, formats);

            push_dataset(label, datasets, ChartSeriesFormat(dataset, formats, series_index), category_grouped);

            series_index++;

            if (label_id >= 0)
                labels = current_dataset['rows'][label_id]
            else
                labels = current_dataset['rows'][xaxis_id];
        } else
            flash("Didn't find X and Y axis for chart in columns [" + data['cols'] + ']. X: ' + sg['series-x'] + '. Y: ' + sg['series-y']);

        console.log('i' + i);
    }

    var chartColors = {
        blue: 'rgb(54, 162, 235)',
        red: 'rgb(255, 50, 50)',
        orange: 'rgb(255, 159, 64)',
        yellow: 'rgb(255, 205, 86)',
        green: 'rgb(75, 255, 192)',
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
    console.log("FINAL FORMATS: " + (formats ? Object.keys(formats).length : 0));
    if (formats) console.log(formats);

    if (category || category_grouped || category_bulk) {
        const unique_labels = [...new Set(labels)] // Get unique list of labels for the x axis
        console.log("FINAL LABELS: " + unique_labels.length);
        console.log(unique_labels);
        data['labels'] = unique_labels;

        xaxis_scale['labels'] = unique_labels;
    }


    // Process annotations if they exist
    var annotations = {};
    console.log("PROCESSING ANNOTATIONS");
    console.log(config['series-annos']);
    if (config['series-annos']) {
        let annotation_result = {}
        for (i = 0; i < config['series-annos'].length; i++) {
            var sa = config['series-annos'][i];
            var current_dataset_index = sa['anno-tab'];

            if (current_dataset_index === undefined) {
                console.log("No dataset specified, using default 0 out of " + data.length + " datasets");
                current_dataset_index = 0;
            } else
                console.log("SERIES GROUP " + i + " using dataset " + current_dataset_index + " out of " + data.length + " datasets");

            var anno_dataset = data[current_dataset_index];
            console.log("ANNOTATION DATASET");
            console.log(anno_dataset);
            ChartAnnotations(annotation_result, sa, anno_dataset, config['path']);

        }

        annotations = {annotation: {annotations: annotation_result}};
        console.log("FINAL ANNOTATIONS: " + Object.keys(annotations.annotation.annotations).length);
        console.log(annotations);
    }


    // Detect if any series group requires the Radial Bar plugin
    var hasRadialBar = false;
    try {
        var sgs = chart_data && chart_data['chart'] && chart_data['chart']['series-groups'] ? chart_data['chart']['series-groups'] : [];
        for (var si = 0; si < sgs.length; si++) {
            var st = (sgs[si]['series-type'] || '').toString();
            if (st === 'Radial Bar' || st === 'RadialBar' || st.toLowerCase() === 'radialbar') {
                hasRadialBar = true;
                break;
            }
        }
    } catch (e) {
        hasRadialBar = false;
    }

    var chartJS_datasets = {
        datasets: datasets
    }
    if (hasRadialBar && labels !== undefined) {
        chartJS_datasets['labels'] = labels;
    }
    
    console.log("CHART/2D registering radial Bar");
    registerRadialBar();

    var config = {
        data: chartJS_datasets,
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
                // Enable Radial Bar plugin if requested
                radialBar: {
                    enabled: hasRadialBar
                },
                legend: {
                    display: legend_display,
                    position: config['legend'].toLowerCase(),
                    usePointStyle: true,
                },
                // Add annotations if they exist
                ...(annotations || {}),
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
        console.log(user_config);
        config = deepMerge(config, user_config);
    } else {
        console.log("CHART default config, no advanced settings detected");
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
