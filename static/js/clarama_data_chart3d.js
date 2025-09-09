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

    canvas.setAttribute("datasets", datasets);
    canvas.setAttribute("primitives", dfDictToArrayOfDicts(s_objects));
    initCube(canvas, datasets, s_objects, exampleAxisConfig)
}