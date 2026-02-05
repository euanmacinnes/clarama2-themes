function bChart3d(chart_id, chart_data) {
    // let us just hardcode the cube data for now
    // then we load the cube up.
    var datasets = chart_data['data'];
    var config = chart_data['chart'];
    var s_objects = config['series-objects'];
    console.log('bChart3d chart_data: ', chart_data);
    console.log('bChart3d data: ', datasets);
    console.log('bChart3d config: ', config);
    console.log('bChart3d series-objects: ', s_objects);
    var canvas = $('#c_' + chart_id).get(0);
    console.log('bChart3d canvas: ', canvas);

    // Build axis configuration from config (GraphScaler-compatible: original and graph bounds)
    function toNum(v) {
        if (v === undefined || v === null || v === '') return undefined;
        var n = parseFloat(v);
        return isFinite(n) ? n : undefined;
    }

    var axisCfg = config['axis'] || {};
    var axisConfig = {
        titles: axisCfg['titles'] || {},
        orig_bounds: axisCfg['orig_bounds'] || {},
        graph_bounds: {x: [-3, 3], y: [-3, 3], z: [-3, 3]}
    };

    console.log('bChart3d axisConfig: ', axisConfig);
    canvas.setAttribute("datasets", datasets);
    const primArray = dfDictToArrayOfDicts(s_objects);
    canvas.setAttribute("primitives", primArray);
    initCube(canvas, datasets, primArray, axisConfig)

    try {
        if (canvas !== undefined) {
            console.log("Destroying existing chart " + chart_id + " in canvas " + canvas);
            canvas.destroy();
        }
    } catch (e) {
    }

    var chart_element = $('#' + chart_id);
    console.log("Chart: " + chart_id + ' - ');
    console.log(chart_data);
    chart_element.attr("chart", new Chart(chart_element, config));
}
