function bChart3d(canvas, chart_id, chart_data) {
    // let us just hardcode the cube data for now
    // then we load the cube up.
    var data = chart_data['data'];
    var config = chart_data['chart'];
    var s_objects = config['series-objects'];
    console.log('bChart3d chart_data: ', chart_data);
    console.log('bChart3d data: ', data);
    console.log('bChart3d cube_data: ', CUBE_DATA);
    console.log('bChart3d config: ', config);
    console.log('bChart3d series-objects: ', s_objects);

    initCube(canvas, CUBE_DATA, CHART3D_DEFAULT_PRIMITIVES, exampleAxisConfig)
}