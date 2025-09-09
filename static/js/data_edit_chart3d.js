// Default datasets for the demo cube geometry moved outside initCube
window.CUBE_DATA = window.CUBE_DATA || {
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

window.exampleAxisConfig = {
    titleX: 'Longitude (°)',
    titleY: 'Latitude (°)',
    titleZ: 'Altitude (km)',
    minX: -18, maxX: 18,
    minY: -9,  maxY: 9,
    z: { title: 'Altitude (km)', min: 0, max: 10 },
    ticks: {
        x: { step: 6, format: (v) => v.toFixed(0) },
        y: { step: 3, format: (v) => v.toFixed(0) },
        z: { step: 5, format: (v) => v.toFixed(0) }
    }
};

// Build an example line primitive: Mobius strip edge scaled to 10x5x3
(function () {
    function generateMobiusPoints(samples, R, w, vConst) {
        const pts = [];
        const TWO_PI = Math.PI * 2;
        const maxT = 2 * TWO_PI; // 0..4π to close edge for v=const
        for (let i = 0; i < samples; i++) {
            const t = maxT * (i / samples);
            const ct = Math.cos(t), st = Math.sin(t);
            const c2 = Math.cos(t / 2), s2 = Math.sin(t / 2);
            const v = vConst;
            const x = (R + v * c2) * ct;
            const y = (R + v * c2) * st;
            const z = v * s2;
            pts.push([x, y, z]);
        }
        return pts;
    }

    function scaleAndCenter(pts, target) {
        let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (const p of pts) {
            if (p[0] < minX) minX = p[0];
            if (p[0] > maxX) maxX = p[0];
            if (p[1] < minY) minY = p[1];
            if (p[1] > maxY) maxY = p[1];
            if (p[2] < minZ) minZ = p[2];
            if (p[2] > maxZ) maxZ = p[2];
        }
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
        const sx = maxX - minX || 1, sy = maxY - minY || 1, sz = maxZ - minZ || 1;
        const tx = target[0] / sx, ty = target[1] / sy, tz = target[2] / sz;
        for (const p of pts) {
            p[0] = (p[0] - cx) * tx;
            p[1] = (p[1] - cy) * ty;
            p[2] = (p[2] - cz) * tz;
        }
        return pts;
    }

    function toLinePairs(pts) {
        const out = [];
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i], b = pts[i + 1];
            out.push(a[0], a[1], a[2], b[0], b[1], b[2]);
        }
        // close loop
        const a = pts[pts.length - 1], b = pts[0];
        out.push(a[0], a[1], a[2], b[0], b[1], b[2]);
        return new Float32Array(out);
    }

    const samples = 600;
    const R = 2.0, w = 0.7; // base before scaling
    const vConst = w; // edge line on the strip
    let pts = generateMobiusPoints(samples, R, w, vConst);
    pts = scaleAndCenter(pts, [10, 5, 3]);
    CUBE_DATA.mobiusLineEdges = toLinePairs(pts);
})();

// Define default primitives that reference the datasets by name so generalized renderer can draw them
window.CHART3D_DEFAULT_PRIMITIVES = window.CHART3D_DEFAULT_PRIMITIVES || [
    // Render cube corners as points
    {name: 'Cube Points', vertices: 'cubeVertices', mode: 'point'},
    // Render the 12 textured triangles that make the cube faces
    {
        name: 'Cube Triangles',
        vertices: 'cubeTriPositions',
        uv: 'cubeTriUVs',
        mode: 'triangle',
        textureURL: 'https://images.pexels.com/photos/129733/pexels-photo-129733.jpeg?_gl=1*ank8ph*_ga*MzI5MTE5MDI0LjE3NTcwODUyMDk.*_ga_8JE65Q40S6*czE3NTcwODUyMDkkbzEkZzEkdDE3NTcwODUyMTEkajU4JGwwJGgw'
    },
    // Third cube primitive: per-vertex colours (no texture)
    {
        name: 'Cube Triangles (per-vertex colours)',
        vertices: 'cubeTriPositions',
        colors: 'cubeTriColors',
        mode: 'triangle',
        position: {x: -3, y: -1, z: 2},
        rotationDeg: {x: 0, y: 45, z: -30},
    },
    // Second example primitive demonstrating per-primitive position and rotation (degrees)
    {
        name: 'Cube Triangles (offset + rotated)',
        vertices: 'cubeTriPositions',
        uv: 'cubeTriUVs',
        mode: 'triangle',
        // translate by +3 on X, -1 on Y, +0 on Z (world units)
        position: {x: 3, y: -1, z: 0},
        // rotate 30° around X and 45° around Y
        rotationDeg: {x: 30, y: 45, z: 0},
        textureURL: 'https://images.pexels.com/photos/129733/pexels-photo-129733.jpeg?_gl=1*ank8ph*_ga*MzI5MTE5MDI0LjE3NTcwODUyMDk.*_ga_8JE65Q40S6*czE3NTcwODUyMDkkbzEkZzEkdDE3NTcwODUyMTEkajU4JGwwJGgw'
    },
    // Example line primitive: Mobius strip edge scaled to 10x5x3
    {
        name: 'Mobius Strip Line (10x5x3)',
        edges: 'mobiusLineEdges',
        mode: 'line',
        uniformColor: [0.15, 0.6, 0.2, 1.0]
    }
];

(function installChart3DOnce() {
    if (window.__chart3d_boot_installed) return;
    window.__chart3d_boot_installed = true;
  
    const CANVAS_SELECTOR = '.chart3d-canvas-holder > canvas[id^="c_"]';
  
    
  
    // Init canvases added later
    const mo = new MutationObserver((mutList) => {
        for (const m of mutList) {
            for (const n of m.addedNodes) {
            if (!(n instanceof Element)) continue;
    
            if (n.matches && n.matches(CANVAS_SELECTOR) && !n.dataset.cubeInit) {
                initCube(n, window.CUBE_DATA, window.CHART3D_DEFAULT_PRIMITIVES, exampleAxisConfig);
            }
            n.querySelectorAll && n.querySelectorAll(CANVAS_SELECTOR).forEach((c) => {
                if (!c.dataset.cubeInit) {
                initCube(c, window.CUBE_DATA, window.CHART3D_DEFAULT_PRIMITIVES, exampleAxisConfig);
                }
            });
            }
        }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
})();
  

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
} else {
    boot();
}
// test just with the cube first

// test with triangles, points and lines
// then test with the different datasets 
// (vertices would be the same, but the edges would be different)

// optional uv and color
// points (just the vertices)
// lines (vertices + lines)
// traingle (vertices + lines + uv map + color)

// ------------------------------------------------------------
// Per-canvas setup
// ------------------------------------------------------------
// ------------------------------------------------------------
// Per-canvas setup (generalized datasets + primitives)
// ------------------------------------------------------------
function initCube(canvas, datasets = {}, primitives = [], axisConfig = {}) {
    canvas.dataset.cubeInit = "1";

    const gl = canvas.getContext("webgl", {antialias: true, preserveDrawingBuffer: true});
    if (!gl) {
        const msg = document.createElement("div");
        msg.className = "text-danger small";
        msg.textContent = "WebGL not supported on this device/browser.";
        canvas.replaceWith(msg);
        return;
    }

    // --- helpers ------------------------------------------------------------
    function sh(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error("Shader compile error:", gl.getShaderInfoLog(s), "\nSource:\n", src);
            return null;
        }
        return s;
    }

    function prog(vsSrc, fsSrc) {
        const p = gl.createProgram();
        const v = sh(gl.VERTEX_SHADER, vsSrc);
        const f = sh(gl.FRAGMENT_SHADER, fsSrc);
        if (!v || !f) return null;
        gl.attachShader(p, v);
        gl.attachShader(p, f);
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            console.error("Program link error:", gl.getProgramInfoLog(p));
            return null;
        }
        return p;
    }

    // 2D overlay for tick labels & titles
    const wrap = canvas.closest('.chart3d-canvas-holder') || canvas.parentElement || document.body;
    if (getComputedStyle(wrap).position === "static") wrap.style.position = "relative";
    const overlay = document.createElement("canvas");
    overlay.style.position = "absolute";
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "2";
    wrap.appendChild(overlay);
    const ctx2d = overlay.getContext("2d");

    // Style (Matplotlib-ish)
    const STYLE = {
        clear: [1.0, 1.0, 1.0, 1.0],
        grid: [0.85, 0.85, 0.85, 1.0],
        frame: [0.55, 0.55, 0.55, 1.0],
        cube: [0.75, 0.78, 0.90, 1.0],
        point: [0.20, 0.45, 0.90, 1.0],
        ticks: "#666",
        labelPx: 15,
        titlePx: 18,
        titleWeight: "bold",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    };

    // Axis titles (from axisConfig or data-* if present)
    const AXIS_TITLE = {
        x: (axisConfig.titleX || (axisConfig.x && axisConfig.x.title) || canvas.dataset.axisX || "X"),
        y: (axisConfig.titleY || (axisConfig.y && axisConfig.y.title) || canvas.dataset.axisY || "Y"),
        z: (axisConfig.titleZ || (axisConfig.z && axisConfig.z.title) || canvas.dataset.axisZ || "Z")
    };

    // Axis ranges (min/max) from axisConfig or data-*
    function parseNum(v) {
        const n = parseFloat(v);
        return isFinite(n) ? n : null;
    }

    const AXIS_RANGE = {
        x: {
            min: (axisConfig.minX ?? (axisConfig.x && axisConfig.x.min) ?? parseNum(canvas.dataset.axisXMin)),
            max: (axisConfig.maxX ?? (axisConfig.x && axisConfig.x.max) ?? parseNum(canvas.dataset.axisXMax)),
        },
        y: {
            min: (axisConfig.minY ?? (axisConfig.y && axisConfig.y.min) ?? parseNum(canvas.dataset.axisYMin)),
            max: (axisConfig.maxY ?? (axisConfig.y && axisConfig.y.max) ?? parseNum(canvas.dataset.axisYMax)),
        },
        z: {
            min: (axisConfig.minZ ?? (axisConfig.z && axisConfig.z.min) ?? parseNum(canvas.dataset.axisZMin)),
            max: (axisConfig.maxZ ?? (axisConfig.z && axisConfig.z.max) ?? parseNum(canvas.dataset.axisZMax)),
        }
    };

    function hasRange(axis) {
        const r = AXIS_RANGE[axis];
        return r && typeof r.min === 'number' && typeof r.max === 'number' && r.max !== r.min;
    }

    function mapToLabel(axis, t) {
        // Map internal coordinate t in [-Laxis, Laxis] to [min,max] if provided for that axis
        if (!hasRange(axis)) return t;
        const r = AXIS_RANGE[axis];
        const Laxis = axis === 'x' ? axisLenX : (axis === 'y' ? axisLenY : axisLenZ);
        const u = (t + Laxis) / (2 * Laxis); // 0..1
        return r.min + u * (r.max - r.min);
    }

    function formatTick(val) {
        if (Math.abs(val) >= 1000 || Math.abs(val) < 0.001 && val !== 0) return val.toExponential(2);
        const fixed = (Math.abs(val) < 1) ? 3 : 2;
        return (+val.toFixed(fixed)).toString();
    }

    // --- programs (uniform color) -------------------------------------------
    const vsPos = `
        attribute vec3 a_position;
        uniform mat4 u_mvp;
        uniform float u_pointSize;
        void main(){
            gl_Position = u_mvp * vec4(a_position, 1.0);
            gl_PointSize = u_pointSize;
        }
    `;
    const fsUniform = `
        precision mediump float;
        uniform vec4 u_color;
        void main(){ gl_FragColor = u_color; }
    `;
    const fsPointsUniform = `
        precision mediump float;
        uniform vec4 u_color;
        void main(){
            vec2 c = gl_PointCoord - vec2(0.5);
            if (dot(c,c) > 0.25) discard;
            gl_FragColor = u_color;
        }
    `;
    const progLines = prog(vsPos, fsUniform);
    const progTris = prog(vsPos, fsUniform);
    const progPoints = prog(vsPos, fsPointsUniform);

    const locU = (p) => ({
        a_position: gl.getAttribLocation(p, "a_position"),
        u_mvp: gl.getUniformLocation(p, "u_mvp"),
        u_color: gl.getUniformLocation(p, "u_color"),
        u_pointSize: gl.getUniformLocation(p, "u_pointSize"),
    });
    const loc = {
        lines: locU(progLines),
        tris: locU(progTris),
        points: locU(progPoints),
    };

    // --- programs (per-vertex color) ----------------------------------------
    const vsPosColor = `
        attribute vec3 a_position;
        attribute vec4 a_color;
        varying vec4 v_color;
        uniform mat4 u_mvp;
        uniform float u_pointSize;
        void main(){
            gl_Position = u_mvp * vec4(a_position, 1.0);
            gl_PointSize = u_pointSize;
            v_color = a_color;
        }
    `;
    const fsVary = `
        precision mediump float;
        varying vec4 v_color;
        void main(){ gl_FragColor = v_color; }
    `;
    const fsPointsVary = `
        precision mediump float;
        varying vec4 v_color;
        void main(){
            vec2 c = gl_PointCoord - vec2(0.5);
            if (dot(c,c) > 0.25) discard;
            gl_FragColor = v_color;
        }
    `;
    const progLinesVary = prog(vsPosColor, fsVary);
    const progTrisVary = prog(vsPosColor, fsVary);
    const progPointsVary = prog(vsPosColor, fsPointsVary);
    const locV = (p) => ({
        a_position: gl.getAttribLocation(p, "a_position"),
        a_color: gl.getAttribLocation(p, "a_color"),
        u_mvp: gl.getUniformLocation(p, "u_mvp"),
        u_pointSize: gl.getUniformLocation(p, "u_pointSize"),
    });
    const locColor = {
        lines: locV(progLinesVary),
        tris: locV(progTrisVary),
        points: locV(progPointsVary),
    };

    // --- programs (textured triangles) --------------------------------------
    const vsPosUV = `
        attribute vec3 a_position;
        attribute vec2 a_uv;
        varying vec2 v_uv;
        uniform mat4 u_mvp;
        void main(){
            gl_Position = u_mvp * vec4(a_position, 1.0);
            v_uv = a_uv;
        }
    `;
    const fsTex = `
        precision mediump float;
        varying vec2 v_uv;
        uniform sampler2D u_tex;
        void main(){
            gl_FragColor = texture2D(u_tex, v_uv);
        }
    `;
    const progTrisTex = prog(vsPosUV, fsTex);
    const locTex = {
        a_position: gl.getAttribLocation(progTrisTex, "a_position"),
        a_uv: gl.getAttribLocation(progTrisTex, "a_uv"),
        u_mvp: gl.getUniformLocation(progTrisTex, "u_mvp"),
        u_tex: gl.getUniformLocation(progTrisTex, "u_tex"),
    };

    // Axis half-extent per axis. If AXIS_RANGE provides numeric min/max, fit [-L,L] to [min,max]
    // and choose L = max(|min|, |max|) so that 0 is always visible and proportions remain reasonable.
    // Fallback to 3.0 when no range is provided.
    const defaultAxisLen = 3.0;

    function axisHalfExtentFor(axis) {
        const r = AXIS_RANGE[axis];
        if (r && typeof r.min === 'number' && typeof r.max === 'number') {
            const span = r.max - r.min;
            const L = Math.abs(span) / 2;
            return (L > 0 && isFinite(L)) ? L : defaultAxisLen;
        }
        return defaultAxisLen;
    }

    const axisLenX = axisHalfExtentFor('x');
    const axisLenY = axisHalfExtentFor('y');
    const axisLenZ = axisHalfExtentFor('z');

    // Per-axis tick step and size with overrides from axisConfig if provided.
    function numOr(v, d) {
        const n = parseFloat(v);
        return isFinite(n) ? n : d;
    }

    const defaultTickStep = 1.0;
    const defaultTickSize = 0.08;
    const TICK_STEP = {
        x: numOr(axisConfig.tickStepX ?? (axisConfig.x && axisConfig.x.tickStep) ?? (axisConfig.ticks && axisConfig.ticks.x && axisConfig.ticks.x.step), defaultTickStep),
        y: numOr(axisConfig.tickStepY ?? (axisConfig.y && axisConfig.y.tickStep) ?? (axisConfig.ticks && axisConfig.ticks.y && axisConfig.ticks.y.step), defaultTickStep),
        z: numOr(axisConfig.tickStepZ ?? (axisConfig.z && axisConfig.z.tickStep) ?? (axisConfig.ticks && axisConfig.ticks.z && axisConfig.ticks.z.step), defaultTickStep)
    };
    const TICK_SIZE = {
        x: numOr(axisConfig.tickSizeX ?? (axisConfig.x && axisConfig.x.tickSize), defaultTickSize),
        y: numOr(axisConfig.tickSizeY ?? (axisConfig.y && axisConfig.y.tickSize), defaultTickSize),
        z: numOr(axisConfig.tickSizeZ ?? (axisConfig.z && axisConfig.z.tickSize), defaultTickSize)
    };

    function pushLine(a, x1, y1, z1, x2, y2, z2) {
        a.push(x1, y1, z1, x2, y2, z2);
    }

    function getStep(axis) {
        const s = TICK_STEP[axis];
        return (typeof s === 'number' && isFinite(s) && s > 0) ? s : defaultTickStep;
    }

    function buildGridXY(z) {
        const a = [];
        const stepX = getStep('x');
        const stepY = getStep('y');
        for (let x = -axisLenX; x <= axisLenX; x += stepX) pushLine(a, x, -axisLenY, z, x, axisLenY, z);
        for (let y = -axisLenY; y <= axisLenY; y += stepY) pushLine(a, -axisLenX, y, z, axisLenX, y, z);
        return new Float32Array(a);
    }

    function buildGridXZ(y) {
        const a = [];
        const stepX = getStep('x');
        const stepZ = getStep('z');
        for (let x = -axisLenX; x <= axisLenX; x += stepX) pushLine(a, x, y, -axisLenZ, x, y, axisLenZ);
        for (let z = -axisLenZ; z <= axisLenZ; z += stepZ) pushLine(a, -axisLenX, y, z, axisLenX, y, z);
        return new Float32Array(a);
    }

    function buildGridYZ(x) {
        const a = [];
        const stepY = getStep('y');
        const stepZ = getStep('z');
        for (let y = -axisLenY; y <= axisLenY; y += stepY) pushLine(a, x, y, -axisLenZ, x, y, axisLenZ);
        for (let z = -axisLenZ; z <= axisLenZ; z += stepZ) pushLine(a, x, -axisLenY, z, x, axisLenY, z);
        return new Float32Array(a);
    }

    const gridXY = buildGridXY(-axisLenZ);
    const gridXZ = buildGridXZ(-axisLenY);
    const gridYZ = buildGridYZ(-axisLenX);
    const gridXYBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, gridXYBuf);
    gl.bufferData(gl.ARRAY_BUFFER, gridXY, gl.STATIC_DRAW);
    const gridXZBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, gridXZBuf);
    gl.bufferData(gl.ARRAY_BUFFER, gridXZ, gl.STATIC_DRAW);
    const gridYZBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, gridYZBuf);
    gl.bufferData(gl.ARRAY_BUFFER, gridYZ, gl.STATIC_DRAW);

    function buildBoxEdges(Lx, Ly, Lz) {
        const a = [];

        function keep(x1, y1, z1, x2, y2, z2) {
            if ((x1 === -Lx && x2 === -Lx) || (y1 === -Ly && y2 === -Ly) || (z1 === -Lz && z2 === -Lz)) a.push(x1, y1, z1, x2, y2, z2);
        }

        // 12 edges of a cuboid
        keep(-Lx, -Ly, -Lz, Lx, -Ly, -Lz);
        keep(-Lx, Ly, -Lz, Lx, Ly, -Lz);
        keep(-Lx, -Ly, Lz, Lx, -Ly, Lz);
        keep(-Lx, Ly, Lz, Lx, Ly, Lz);

        keep(-Lx, -Ly, -Lz, -Lx, Ly, -Lz);
        keep(Lx, -Ly, -Lz, Lx, Ly, -Lz);
        keep(-Lx, -Ly, Lz, -Lx, Ly, Lz);
        keep(Lx, -Ly, Lz, Lx, Ly, Lz);

        keep(-Lx, -Ly, -Lz, -Lx, -Ly, Lz);
        keep(Lx, -Ly, -Lz, Lx, -Ly, Lz);
        keep(-Lx, Ly, -Lz, -Lx, Ly, Lz);
        keep(Lx, Ly, -Lz, Lx, Ly, Lz);
        return new Float32Array(a);
    }

    const boxEdges = buildBoxEdges(axisLenX, axisLenY, axisLenZ);
    const boxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, boxBuf);
    gl.bufferData(gl.ARRAY_BUFFER, boxEdges, gl.STATIC_DRAW);

    // --- matrices -----------------------------------------------------------
    function mat4Identity() {
        const m = new Float32Array(16);
        m[0] = 1;
        m[5] = 1;
        m[10] = 1;
        m[15] = 1;
        return m;
    }

    function mat4Mul(a, b) {
        const o = new Float32Array(16);
        for (let c = 0; c < 4; c++) {
            for (let r = 0; r < 4; r++) {
                o[c * 4 + r] = a[0 * 4 + r] * b[c * 4 + 0] + a[1 * 4 + r] * b[c * 4 + 1] + a[2 * 4 + r] * b[c * 4 + 2] + a[3 * 4 + r] * b[c * 4 + 3];
            }
        }
        return o;
    }

    function mat4Perspective(fovy, aspect, near, far) {
        const f = 1 / Math.tan(fovy / 2);
        const m = new Float32Array(16);
        m[0] = f / aspect;
        m[5] = f;
        m[11] = -1;
        m[15] = 0;
        m[10] = (far + near) / (near - far);
        m[14] = (2 * far * near) / (near - far);
        return m;
    }

    function mat4Translate(x, y, z) {
        const m = mat4Identity();
        m[12] = x;
        m[13] = y;
        m[14] = z;
        return m;
    }

    function mat4RotateX(a) {
        const c = Math.cos(a), s = Math.sin(a);
        const m = mat4Identity();
        m[5] = c;
        m[6] = s;
        m[9] = -s;
        m[10] = c;
        return m;
    }

    function mat4RotateY(a) {
        const c = Math.cos(a), s = Math.sin(a);
        const m = mat4Identity();
        m[0] = c;
        m[2] = -s;
        m[8] = s;
        m[10] = c;
        return m;
    }

    function mat4RotateZ(a) {
        const c = Math.cos(a), s = Math.sin(a);
        const m = mat4Identity();
        m[0] = c;
        m[1] = s;
        m[4] = -s;
        m[5] = c;
        return m;
    }

    // --- interaction --------------------------------------------------------
    const initDist = 30.0, initRotX = 0, initRotY = 0; // the initial rotation upon loading
    let dist = initDist, rotX = initRotX, rotY = initRotY;
    let dragging = false, lastX = 0, lastY = 0;

    canvas.addEventListener("pointerdown", (e) => {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const rect = canvas.getBoundingClientRect();
        rotY += (e.clientX - lastX) / Math.max(1, rect.width) * Math.PI;
        rotX += (e.clientY - lastY) / Math.max(1, rect.height) * Math.PI;
        rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotX));
        lastX = e.clientX;
        lastY = e.clientY;
        requestAnimationFrame(render);
    });
    window.addEventListener("pointerup", () => {
        dragging = false;
    });
    canvas.addEventListener("wheel", (e) => {
        const zoomGesture = e.ctrlKey || e.metaKey;
        if (!zoomGesture) return;

        e.preventDefault();
        const s = Math.exp(e.deltaY * 0.005);
        dist = Math.max(2.0, dist * s);
        requestAnimationFrame(render);
    }, {passive: false});
    canvas.addEventListener("dblclick", () => {
        rotX = initRotX;
        rotY = initRotY;
        dist = initDist;
        requestAnimationFrame(render);
    });

    // --- resize -------------------------------------------------------------
    const overlayCanvas = overlay; // alias
    function resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const cssH = rect.height || 360;
        const w = Math.max(1, Math.round(rect.width * dpr));
        const h = Math.max(1, Math.round(cssH * dpr));
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
            gl.viewport(0, 0, w, h);
        }
        overlayCanvas.width = w;
        overlayCanvas.height = h;
        requestAnimationFrame(render);
    }

    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    window.addEventListener("resize", resize);
    document.addEventListener("shown.bs.tab", resize, true);
    document.addEventListener("shown.bs.collapse", resize, true);

    // --- project world point -> CSS px --------------------------------------
    function projectToScreen(px, py, pz, mvp, cssW, cssH) {
        const w0 = mvp[3] * px + mvp[7] * py + mvp[11] * pz + mvp[15];
        if (w0 === 0) return null;
        const cx = (mvp[0] * px + mvp[4] * py + mvp[8] * pz + mvp[12]) / w0;
        const cy = (mvp[1] * px + mvp[5] * py + mvp[9] * pz + mvp[13]) / w0;
        const cz = (mvp[2] * px + mvp[6] * py + mvp[10] * pz + mvp[14]) / w0;
        if (w0 <= 0 || cz < -1 || cz > 1) return null;
        return {x: (cx * 0.5 + 0.5) * cssW, y: (1 - (cy * 0.5 + 0.5)) * cssH};
    }

    // --- tick labels & title helpers ----------------------------------------
    function sTick(axis) {
        const s = TICK_SIZE[axis];
        return ((typeof s === 'number' && isFinite(s) && s > 0) ? s : defaultTickSize) * 2.0;
    }

    function drawTickLabelOnEdge(axis, t, MVP, cssW, cssH, pxAway) {
        const Lx = axisLenX, Ly = axisLenY, Lz = axisLenZ;
        let base, near;
        const s = sTick(axis);
        if (axis === "x") {
            base = [t, -Ly, +Lz];
            near = [t, -Ly - s, +Lz + s];
        } else if (axis === "y") {
            base = [+Lx, t, -Lz];
            near = [+Lx + s, t, -Lz - s];
        } else {
            base = [+Lx, -Ly, t];
            near = [+Lx + s, -Ly - s, t];
        }
        const p = projectToScreen(base[0], base[1], base[2], MVP, cssW, cssH);
        const q = projectToScreen(near[0], near[1], near[2], MVP, cssW, cssH);
        if (!p || !q) return;
        let dx = q.x - p.x, dy = q.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        dx = (dx / len) * pxAway;
        dy = (dy / len) * pxAway;
        const labVal = mapToLabel(axis, t);
        ctx2d.fillText(formatTick(labVal), p.x + dx, p.y + dy);
    }

    function edgeLabelPos(axis, t, MVP, cssW, cssH, pxAway) {
        const Lx = axisLenX, Ly = axisLenY, Lz = axisLenZ;
        let base, near;
        const s = sTick(axis);
        if (axis === "x") {
            base = [t, -Ly, +Lz];
            near = [t, -Ly - s, +Lz + s];
        } else if (axis === "y") {
            base = [+Lx, t, -Lz];
            near = [+Lx + s, t, -Lz - s];
        } else {
            base = [+Lx, -Ly, t];
            near = [+Lx + s, -Ly - s, t];
        }
        const p = projectToScreen(base[0], base[1], base[2], MVP, cssW, cssH);
        const q = projectToScreen(near[0], near[1], near[2], MVP, cssW, cssH);
        if (!p || !q) return null;
        let dx = q.x - p.x, dy = q.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        dx = (dx / len) * pxAway;
        dy = (dy / len) * pxAway;
        return {x: p.x + dx, y: p.y + dy};
    }

    // ---------- compile generalized primitives ---------------------------------
    const compiled = [];

    function createCheckerTextureGL(size = 64, squares = 8) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);

        const pixels = new Uint8Array(size * size * 4);
        const step = size / squares;

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = (y * size + x) * 4;
                const cx = Math.floor(x / step);
                const cy = Math.floor(y / step);
                const on = (cx + cy) % 2 === 0;
                const v = on ? 230 : 40;
                pixels[idx + 0] = v;
                pixels[idx + 1] = v;
                pixels[idx + 2] = v;
                pixels[idx + 3] = 255;
            }
        }

        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        return tex;
    }

    // Build a default checker texture once
    const checkerTex = createCheckerTextureGL(64, 8);

    // Texture cache and async loader for URL-based textures
    const textureCache = new Map(); // url -> WebGLTexture | {loading:true, tex:WebGLTexture}

    function isHttpUrl(u) {
        return typeof u === 'string' && /^(https?:)?\/\//i.test(u);
    }

    function getOrLoadTexture(url, onLoaded) {
        if (!url) return checkerTex;
        const cached = textureCache.get(url);
        if (cached && cached !== 'loading') return cached;
        if (cached === 'loading') return checkerTex;
        // mark as loading
        textureCache.set(url, 'loading');

        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        // temporary 1x1 pixel while loading
        const tmp = new Uint8Array([200, 200, 200, 255]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, tmp);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        const img = new Image();
        // allow cross-origin for http(s) sources
        if (isHttpUrl(url)) img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                textureCache.set(url, tex);
                if (typeof onLoaded === 'function') onLoaded(tex);
                requestAnimationFrame(render);
            } catch (e) {
                console.warn('Failed to upload texture image', url, e);
                textureCache.set(url, checkerTex);
                if (typeof onLoaded === 'function') onLoaded(checkerTex);
                requestAnimationFrame(render);
            }
        };
        img.onerror = () => {
            console.warn('Failed to load texture URL:', url);
            textureCache.set(url, checkerTex);
            if (typeof onLoaded === 'function') onLoaded(checkerTex);
            requestAnimationFrame(render);
        };
        try {
            img.src = url;
        } catch (e) {
            console.warn('Invalid texture URL:', url, e);
            textureCache.set(url, checkerTex);
        }
        return checkerTex;
    }

    // Helper: normalize data array from various shapes to a flat Float32Array
    function toFloat32(data, componentsExpected) {
        if (!data) return null;
        // If already a typed array
        if (data instanceof Float32Array) return data;
        if (Array.isArray(data) && data.length > 0) {
            // If flat array of numbers
            if (typeof data[0] === 'number') return new Float32Array(data);
            // If array of arrays: flatten
            if (Array.isArray(data[0])) {
                const out = new Float32Array(data.length * data[0].length);
                let k = 0;
                for (const row of data) {
                    for (const v of row) out[k++] = +v;
                }
                return out;
            }
            // If array of objects with x,y,z or u,v or r,g,b,a
            if (typeof data[0] === 'object') {
                const keysXYZ = ['x', 'y', 'z'];
                const keysXYZU = ['X', 'Y', 'Z'];
                const keysUV = ['u', 'v'];
                const keysUVU = ['U', 'V'];
                const keysRGB = ['r', 'g', 'b', 'a'];
                const keysRGBU = ['R', 'G', 'B', 'A'];
                const out = [];
                for (const row of data) {
                    let used = false;
                    if (!used && row && keysXYZ.every(k => k in row)) {
                        out.push(+row.x, +row.y, +row.z);
                        used = true;
                    }
                    if (!used && row && keysXYZU.every(k => k in row)) {
                        out.push(+row.X, +row.Y, +row.Z);
                        used = true;
                    }
                    if (!used && row && keysUV.every(k => k in row)) {
                        out.push(+row.u, +row.v);
                        used = true;
                    }
                    if (!used && row && keysUVU.every(k => k in row)) {
                        out.push(+row.U, +row.V);
                        used = true;
                    }
                    if (!used && row && keysRGB.every(k => k in row)) {
                        out.push(+row.r, +row.g, +row.b, +(row.a ?? 1));
                        used = true;
                    }
                    if (!used && row && keysRGBU.every(k => k in row)) {
                        out.push(+row.R, +row.G, +row.B, +(row.A ?? 1));
                        used = true;
                    }
                    if (!used) {
                        // fallback: push all numeric values in property order
                        for (const v of Object.values(row)) if (typeof v === 'number') out.push(+v);
                    }
                }
                return new Float32Array(out);
            }
        }
        return null;
    }

    function createBufferAndUpload(target, data) {
        if (!data) return null;
        const buf = gl.createBuffer();
        gl.bindBuffer(target, buf);
        gl.bufferData(target, data, gl.STATIC_DRAW);
        return buf;
    }

    function bytesPerIndex(maxIndex) {
        return (maxIndex <= 255) ? gl.UNSIGNED_BYTE : (maxIndex <= 65535 ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT);
    }

    // Build compiled objects from datasets + primitives
    try {
        const getDS = (name) => {
            if (!name) return null;
            const raw = datasets[name];
            return raw;
        };
        for (const prim of (primitives || [])) {
            try {
                const vertsRaw = getDS(prim.vertices);
                const edgesRaw = getDS(prim.edges);
                const uvRaw = getDS(prim.uv || prim.uvs);
                const colRaw = getDS(prim.color || prim.colour || prim.colors);

                const verts = toFloat32(vertsRaw, 3);
                const edges = toFloat32(edgesRaw, 3); // positions for lines
                const uvs = toFloat32(uvRaw, 2);
                const cols = toFloat32(colRaw);

                const name = prim.name || prim.id || 'obj';

                // Determine mode
                let mode = prim.mode || prim.primitive; // 'point' | 'line' | 'triangle'
                if (!mode) {
                    if (edges && edges.length >= 6) mode = 'line';
                    else if (verts && (verts.length % 9 === 0)) mode = 'triangle';
                    else mode = 'point';
                }

                let program = null;
                let locations = null;
                let usesColorVary = false;
                let usesUniformColor = false;
                let usesTex = false;
                let colorSize = 4;
                let uniformColor = null;

                const vbo = createBufferAndUpload(gl.ARRAY_BUFFER, (mode === 'line' && edges) ? edges : verts);
                let cbo = null, uvbo = null, ebo = null;
                let countVerts = 0, countElems = 0, indexType = gl.UNSIGNED_SHORT;
                let modeGL = gl.POINTS;

                if (mode === 'point') {
                    // points use vertices
                    if (!verts || verts.length < 3) {
                        console.warn('Primitive skipped (no vertices):', name);
                        continue;
                    }
                    countVerts = Math.floor(verts.length / 3);
                    // Choose colors handling
                    if (cols && cols.length >= countVerts * 3) {
                        usesColorVary = true;
                        colorSize = (cols.length === countVerts * 4) ? 4 : 3;
                        cbo = createBufferAndUpload(gl.ARRAY_BUFFER, cols);
                        program = progPointsVary;
                        locations = locColor.points;
                    } else {
                        usesUniformColor = true;
                        uniformColor = prim.uniformColor || STYLE.point;
                        program = progPoints;
                        locations = loc.points;
                    }
                    modeGL = gl.POINTS;
                } else if (mode === 'line') {
                    // lines use edges positions directly
                    const lineData = edges || verts; // fallback to verts if edges missing (interpret as line strip pairs)
                    if (!lineData || lineData.length < 6) {
                        console.warn('Primitive skipped (no edges/verts for lines):', name);
                        continue;
                    }
                    countVerts = Math.floor(lineData.length / 3);
                    if (cols && cols.length >= countVerts * 3) {
                        usesColorVary = true;
                        colorSize = (cols.length === countVerts * 4) ? 4 : 3;
                        cbo = createBufferAndUpload(gl.ARRAY_BUFFER, cols);
                        program = progLinesVary;
                        locations = locColor.lines;
                    } else {
                        usesUniformColor = true;
                        uniformColor = prim.uniformColor || STYLE.cube;
                        program = progLines;
                        locations = loc.lines;
                    }
                    modeGL = gl.LINES;
                } else if (mode === 'triangle' || mode === 'triangles' || mode === 'mesh' || mode === 'trianglestrip' || mode === 'triangle_strip') {
                    if (!verts || verts.length < 9) {
                        console.warn('Primitive skipped (no triangle vertices):', name);
                        continue;
                    }
                    countVerts = Math.floor(verts.length / 3);
                    if (uvs && uvs.length >= (countVerts * 2)) {
                        // textured
                        usesTex = true;
                        uvbo = createBufferAndUpload(gl.ARRAY_BUFFER, uvs);
                        program = progTrisTex;
                        locations = locTex;
                    } else if (cols && cols.length >= countVerts * 3) {
                        // per-vertex color
                        usesColorVary = true;
                        colorSize = (cols.length === countVerts * 4) ? 4 : 3;
                        cbo = createBufferAndUpload(gl.ARRAY_BUFFER, cols);
                        program = progTrisVary;
                        locations = locColor.tris;
                    } else {
                        // uniform color
                        usesUniformColor = true;
                        uniformColor = prim.uniformColor || STYLE.cube;
                        program = progTris;
                        locations = loc.tris;
                    }
                    // Select WebGL draw mode: TRIANGLES for lists, TRIANGLE_STRIP if requested
                    modeGL = (mode === 'trianglestrip' || mode === 'triangle_strip') ? gl.TRIANGLE_STRIP : gl.TRIANGLES;
                } else {
                    console.warn('Unknown primitive mode, skipping:', mode);
                    continue;
                }

                // If this primitive uses texturing and provides a texture URL, load it now (fallback to checker while loading)
                let textureUrl = prim.textureUrl || prim.texture || prim.textureURL;
                let initialTexture = checkerTex;
                if (usesTex && textureUrl) {
                    initialTexture = getOrLoadTexture(textureUrl, (tex) => {
                        // after load, update the compiled object's texture reference
                        const obj = compiled.find(x => x.name === name);
                        if (obj) obj.texture = tex;
                    });
                }

                compiled.push({
                    name,
                    program,
                    locations,
                    vbo,
                    cbo,
                    uvbo,
                    ebo,
                    colorSize,
                    usesColorVary,
                    usesUniformColor,
                    uniformColor,
                    usesTex,
                    texture: initialTexture,
                    hasIndices: false,
                    countVerts,
                    countElems,
                    indexType,
                    modeGL,
                    // store transform directives from primitive (position and rotation in degrees)
                    position: prim.position || {x: 0, y: 0, z: 0},
                    rotationDeg: prim.rotationDeg || {x: 0, y: 0, z: 0},
                });
            } catch (e) {
                console.error('Error compiling primitive:', e);
            }
        }
    } catch (e) {
        console.error('Failed to build primitives:', e);
    }

    // ---------- render -------------------------------------------------------
    function render() {
        const dpr = window.devicePixelRatio || 1;

        gl.enable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.clearColor(STYLE.clear[0], STYLE.clear[1], STYLE.clear[2], STYLE.clear[3]);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        const host = canvas.closest('.chart3d-canvas-holder') || canvas.parentElement || canvas;
        const rect = host.getBoundingClientRect();
        const cssW = Math.max(1, rect.width);
        const cssH = Math.max(1, rect.height);

        const P = mat4Perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100.0);
        const V = mat4Translate(0, 0, -dist);
        const Rx = mat4RotateX(rotX);
        const Ry = mat4RotateY(rotY);
        const M = mat4Mul(Ry, Rx);
        const MVP = mat4Mul(mat4Mul(P, V), M);

        // Grids (back/left/bottom panes)
        gl.useProgram(progLines);
        gl.uniformMatrix4fv(loc.lines.u_mvp, false, MVP);
        gl.uniform4f(loc.lines.u_color, STYLE.grid[0], STYLE.grid[1], STYLE.grid[2], STYLE.grid[3]);

        gl.bindBuffer(gl.ARRAY_BUFFER, gridXYBuf);
        gl.vertexAttribPointer(loc.lines.a_position, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(loc.lines.a_position);
        gl.drawArrays(gl.LINES, 0, gridXY.length / 3);

        gl.bindBuffer(gl.ARRAY_BUFFER, gridXZBuf);
        gl.vertexAttribPointer(loc.lines.a_position, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, gridXZ.length / 3);

        gl.bindBuffer(gl.ARRAY_BUFFER, gridYZBuf);
        gl.vertexAttribPointer(loc.lines.a_position, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, gridYZ.length / 3);

        // Box frame
        gl.uniform4f(loc.lines.u_color, STYLE.frame[0], STYLE.frame[1], STYLE.frame[2], STYLE.frame[3]);
        gl.bindBuffer(gl.ARRAY_BUFFER, boxBuf);
        gl.vertexAttribPointer(loc.lines.a_position, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, boxEdges.length / 3);

        // Removed hardcoded cube rendering path; rely solely on generalized primitives below.

        // ---------- generalized primitives ----------
        for (const o of compiled) {
            gl.useProgram(o.program);

            // compute per-primitive transform (position + rotation in degrees)
            const pos = o.position || {x: 0, y: 0, z: 0};
            const rotD = o.rotationDeg || {x: 0, y: 0, z: 0};
            const toRad = (d) => (d || 0) * Math.PI / 180.0;
            const Rxp = mat4RotateX(toRad(rotD.x));
            const Ryp = mat4RotateY(toRad(rotD.y));
            const Rzp = mat4RotateZ(toRad(rotD.z));
            const Tp = mat4Translate(pos.x || 0, pos.y || 0, pos.z || 0);
            // Model for primitive: Translate * Rz * Ry * Rx
            const Mp = mat4Mul(Tp, mat4Mul(Rzp, mat4Mul(Ryp, Rxp)));
            const MVPp = mat4Mul(MVP, Mp);

            // common: MVP (per primitive)
            if (o.locations.u_mvp) gl.uniformMatrix4fv(o.locations.u_mvp, false, MVPp);

            // attributes
            gl.bindBuffer(gl.ARRAY_BUFFER, o.vbo);
            if (o.locations.a_position !== -1) {
                gl.vertexAttribPointer(o.locations.a_position, 3, gl.FLOAT, false, 0, 0);
                gl.enableVertexAttribArray(o.locations.a_position);
            }

            // point size (if program supports it)
            if (o.locations.u_pointSize) gl.uniform1f(o.locations.u_pointSize, Math.max(4.0, 5.0 * dpr));

            // colors
            if (o.usesColorVary && o.cbo) {
                gl.bindBuffer(gl.ARRAY_BUFFER, o.cbo);
                const locC = o.locations.a_color;
                if (locC !== -1) {
                    gl.vertexAttribPointer(locC, o.colorSize || 4, gl.FLOAT, false, 0, 0);
                    gl.enableVertexAttribArray(locC);
                }
            } else if (o.usesUniformColor) {
                const c = (o.uniformColor || STYLE.point);
                gl.uniform4f(o.locations.u_color, c[0], c[1], c[2], c[3]);
            }

            // texture
            if (o.usesTex && o.uvbo) {
                gl.activeTexture(gl.TEXTURE0);
                if (o.texture) gl.bindTexture(gl.TEXTURE_2D, o.texture);
                gl.uniform1i(o.locations.u_tex, 0);
                gl.bindBuffer(gl.ARRAY_BUFFER, o.uvbo);
                if (o.locations.a_uv !== -1) {
                    gl.vertexAttribPointer(o.locations.a_uv, 2, gl.FLOAT, false, 0, 0);
                    gl.enableVertexAttribArray(o.locations.a_uv);
                }
            }

            // draw
            if (o.hasIndices) {
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, o.ebo);
                gl.drawElements(o.modeGL, o.countElems, o.indexType, 0);
            } else {
                gl.drawArrays(o.modeGL, 0, o.countVerts);
            }
        }

        // ---------- 2D overlay (ticks + titles) ----------
        if (ctx2d.resetTransform) ctx2d.resetTransform(); else ctx2d.setTransform(1, 0, 0, 1, 0, 0);
        ctx2d.clearRect(0, 0, overlay.width, overlay.height);
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Tick labels
        ctx2d.save();
        ctx2d.fillStyle = STYLE.ticks;
        ctx2d.font = `${STYLE.labelPx}px ${STYLE.fontFamily}`;
        ctx2d.textAlign = "center";
        ctx2d.textBaseline = "middle";
        for (let tx = -axisLenX; tx <= axisLenX; tx += getStep('x')) drawTickLabelOnEdge("x", tx, MVP, cssW, cssH, 12);
        for (let ty = -axisLenY; ty <= axisLenY; ty += getStep('y')) drawTickLabelOnEdge("y", ty, MVP, cssW, cssH, 12);
        for (let tz = -axisLenZ; tz <= axisLenZ; tz += getStep('z')) drawTickLabelOnEdge("z", tz, MVP, cssW, cssH, 12);
        ctx2d.restore();

        // Axis titles
        ctx2d.save();
        ctx2d.font = `${STYLE.titleWeight} ${STYLE.titlePx}px ${STYLE.fontFamily}`;
        const titleOutward = 20, titleBelow = 18, titleRight = 14;
        const posX = edgeLabelPos("x", 0, MVP, cssW, cssH, titleOutward);
        if (posX) ctx2d.fillText(AXIS_TITLE.x, posX.x, posX.y + titleBelow);
        const posY = edgeLabelPos("y", 0, MVP, cssW, cssH, titleOutward);
        if (posY) {
            const prev = ctx2d.textAlign;
            ctx2d.textAlign = "left";
            ctx2d.fillText(AXIS_TITLE.y, posY.x + titleRight, posY.y);
            ctx2d.textAlign = prev;
        }
        const posZ = edgeLabelPos("z", 0, MVP, cssW, cssH, titleOutward);
        if (posZ) ctx2d.fillText(AXIS_TITLE.z, posZ.x, posZ.y + titleBelow);
        ctx2d.restore();
    }

    requestAnimationFrame(() => {
        resize();
        render();
    });
}
if (!window.initCube) window.initCube = initCube;
