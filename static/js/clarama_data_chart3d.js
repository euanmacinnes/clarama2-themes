const CUBE_DATA = {
    cubeVertices: new Float32Array([
        -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1,
        -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1
    ]),
    cubeEdges: new Uint16Array([
        0, 1, 1, 2, 2, 3, 3, 0,
        4, 5, 5, 6, 6, 7, 7, 4,
        0, 4, 1, 5, 2, 6, 3, 7
    ]),
    // 36 vertices (positions) for a cube [-1..+1], two triangles per face.
    cubeTriPositions: new Float32Array([
        // FRONT  (z = +1)
        -1, -1, 1, 1, -1, 1, 1, 1, 1,
        -1, -1, 1, 1, 1, 1, -1, 1, 1,

        // BACK   (z = -1)
        1, -1, -1, -1, -1, -1, -1, 1, -1,
        1, -1, -1, -1, 1, -1, 1, 1, -1,

        // LEFT   (x = -1)
        -1, -1, -1, -1, 1, -1, -1, 1, 1,
        -1, -1, -1, -1, 1, 1, -1, -1, 1,

        // RIGHT  (x = +1)
        1, -1, -1, 1, 1, -1, 1, 1, 1,
        1, -1, -1, 1, 1, 1, 1, -1, 1,

        // TOP    (y = +1)
        -1, 1, -1, 1, 1, -1, 1, 1, 1,
        -1, 1, -1, 1, 1, 1, -1, 1, 1,

        // BOTTOM (y = -1)
        -1, -1, -1, 1, -1, -1, 1, -1, 1,
        -1, -1, -1, 1, -1, 1, -1, -1, 1,
    ]),
    // Matching per-vertex UVs (each face is a neat [0..1] square)
    cubeTriUVs: new Float32Array([
        // FRONT
        0, 0, 1, 0, 1, 1,
        0, 0, 1, 1, 0, 1,

        // BACK
        0, 0, 1, 0, 1, 1,
        0, 0, 1, 1, 0, 1,

        // LEFT
        0, 0, 1, 0, 1, 1,
        0, 0, 1, 1, 0, 1,

        // RIGHT
        0, 0, 1, 0, 1, 1,
        0, 0, 1, 1, 0, 1,

        // TOP
        0, 0, 1, 0, 1, 1,
        0, 0, 1, 1, 0, 1,

        // BOTTOM
        0, 0, 1, 0, 1, 1,
        0, 0, 1, 1, 0, 1,
    ]),
    // Per-vertex RGBA colors for the 12 cube triangles (6 faces x 2 tris x 3 verts)
    // Each face uses a distinct color; colors are repeated per vertex
    cubeTriColors: new Float32Array([
        // FRONT (red)
        1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1,
        1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1,

        // BACK (green)
        0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
        0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,

        // LEFT (blue)
        0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1,
        0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1,

        // RIGHT (yellow)
        1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1,
        1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1,

        // TOP (magenta)
        1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1,
        1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1,

        // BOTTOM (cyan)
        0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1,
        0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1,
    ]),
};

function bChart3d(chart_id, chart_data) {
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
}