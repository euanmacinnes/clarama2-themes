window.exampleAxisConfig = {
    titleX: 'Longitude (°)',
    titleY: 'Latitude (°)',
    titleZ: 'Altitude (km)',
    minX: -18, maxX: 18,
    minY: -9, maxY: 9,
    z: {title: 'Altitude (km)', min: 0, max: 10},
    ticks: {
        x: {step: 6, format: (v) => v.toFixed(0)},
        y: {step: 3, format: (v) => v.toFixed(0)},
        z: {step: 5, format: (v) => v.toFixed(0)}
    }
};

// ------------------------------------------------------------
// Per-canvas setup
// ------------------------------------------------------------
// ------------------------------------------------------------
// Per-canvas setup (generalized datasets + primitives)
// ------------------------------------------------------------
function initCube(canvas, datasets = {}, primitives = [], axisConfig = {}) {
    // flash("initCube");
    console.log("initCube DATASETS", datasets);
    console.log("initCube PRIMITIVES", primitives);
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
    overlay.name = "UI-overlay";
    overlay.style.position = "absolute";
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "2";
    wrap.appendChild(overlay);
    const ctx2d = overlay.getContext("2d");
    // --- tooltip DIV (overlays canvas; pointer-through) -------------------------
    const tip = document.createElement('div');
    tip.className = 'chart3d-tooltip';
    Object.assign(tip.style, {
        position: 'absolute',
        zIndex: '3',
        left: '0px',
        top: '0px',
        pointerEvents: 'none',
        background: 'rgba(0,0,0,0.75)',
        color: '#fff',
        padding: '4px 6px',
        borderRadius: '6px',
        font: '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        transform: 'translate(8px, -12px)',
        display: 'none'
    });
    wrap.appendChild(tip);


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
        x: ((axisConfig.titles && axisConfig.titles.x) || "X"),
        y: ((axisConfig.titles && axisConfig.titles.y) || "Y"),
        z: ((axisConfig.titles && axisConfig.titles.z) || "Z")
    };

    // Axis ranges (min/max) from axisConfig or data-*
    function parseNum(v) {
        const n = parseFloat(v);
        return isFinite(n) ? n : null;
    }

    // Separate ranges:
    // - GRAPH_RANGE controls the physical size of the rendered axes (cube extent)
    // - LABEL_RANGE controls the numeric values written on the axes (tick labels)
    const GRAPH_RANGE = {
        x: {
            min: (axisConfig.graph_bounds && axisConfig.graph_bounds.x && axisConfig.graph_bounds.x[0]) ?? (axisConfig.orig_bounds && axisConfig.orig_bounds.x && axisConfig.orig_bounds.x[0]) ?? undefined,
            max: (axisConfig.graph_bounds && axisConfig.graph_bounds.x && axisConfig.graph_bounds.x[1]) ?? (axisConfig.orig_bounds && axisConfig.orig_bounds.x && axisConfig.orig_bounds.x[1]) ?? undefined,
        },
        y: {
            min: (axisConfig.graph_bounds && axisConfig.graph_bounds.y && axisConfig.graph_bounds.y[0]) ?? (axisConfig.orig_bounds && axisConfig.orig_bounds.y && axisConfig.orig_bounds.y[0]) ?? undefined,
            max: (axisConfig.graph_bounds && axisConfig.graph_bounds.y && axisConfig.graph_bounds.y[1]) ?? (axisConfig.orig_bounds && axisConfig.orig_bounds.y && axisConfig.orig_bounds.y[1]) ?? undefined,
        },
        z: {
            min: (axisConfig.graph_bounds && axisConfig.graph_bounds.z && axisConfig.graph_bounds.z[0]) ?? (axisConfig.orig_bounds && axisConfig.orig_bounds.z && axisConfig.orig_bounds.z[0]) ?? undefined,
            max: (axisConfig.graph_bounds && axisConfig.graph_bounds.z && axisConfig.graph_bounds.z[1]) ?? (axisConfig.orig_bounds && axisConfig.orig_bounds.z && axisConfig.orig_bounds.z[1]) ?? undefined,
        }
    };

    const LABEL_RANGE = {
        x: {
            min: (axisConfig.orig_bounds && axisConfig.orig_bounds.x && axisConfig.orig_bounds.x[0]) ?? undefined,
            max: (axisConfig.orig_bounds && axisConfig.orig_bounds.x && axisConfig.orig_bounds.x[1]) ?? undefined,
        },
        y: {
            min: (axisConfig.orig_bounds && axisConfig.orig_bounds.y && axisConfig.orig_bounds.y[0]) ?? undefined,
            max: (axisConfig.orig_bounds && axisConfig.orig_bounds.y && axisConfig.orig_bounds.y[1]) ?? undefined,
        },
        z: {
            min: (axisConfig.orig_bounds && axisConfig.orig_bounds.z && axisConfig.orig_bounds.z[0]) ?? undefined,
            max: (axisConfig.orig_bounds && axisConfig.orig_bounds.z && axisConfig.orig_bounds.z[1]) ?? undefined,
        }
    };

    // ---- Auto axis range from vertex data (expand by ±5 using only X/Y/Z) ----
    function applyAutoAxisRange() {
        const readDS = (n) => (n ? datasets[n] : null);

        // Scan a df_to_dict-like dataset for columns exactly x,y,z (case-insensitive)
        function scanXYZ(df) {
            if (!df || typeof df !== 'object') return null;
            const cols = df.cols || df.columns;
            const rows = df.rows || df.data || df.values;
            const orient = String(df.orientation || df.orient || 'byrow').toLowerCase();
            if (!Array.isArray(cols) || !Array.isArray(rows)) return null;

            const ci = new Map();
            for (let i = 0; i < cols.length; i++) {
                const name = String(cols[i]).trim();
                ci.set(name, i);
                ci.set(name.toLowerCase(), i);
            }
            const ix = ci.get('x') ?? ci.get('X');
            const iy = ci.get('y') ?? ci.get('Y');
            const iz = ci.get('z') ?? ci.get('Z');
            if (ix == null || iy == null || iz == null) return null; // require x,y,z

            const num = (v) => {
                const n = +v;
                return Number.isFinite(n) ? n : null;
            };

            const mm = {
                x: {min: +Infinity, max: -Infinity},
                y: {min: +Infinity, max: -Infinity},
                z: {min: +Infinity, max: -Infinity},
            };

            if (orient === 'byrow' || orient === 'table' || orient === 'json' || orient === '') {
                for (const r of rows) {
                    if (!Array.isArray(r)) continue;
                    const vx = num(r[ix]), vy = num(r[iy]), vz = num(r[iz]);
                    if (vx != null) {
                        if (vx < mm.x.min) mm.x.min = vx;
                        if (vx > mm.x.max) mm.x.max = vx;
                    }
                    if (vy != null) {
                        if (vy < mm.y.min) mm.y.min = vy;
                        if (vy > mm.y.max) mm.y.max = vy;
                    }
                    if (vz != null) {
                        if (vz < mm.z.min) mm.z.min = vz;
                        if (vz > mm.z.max) mm.z.max = vz;
                    }
                }
            } else if (orient === 'bycol' || orient === 'chart') {
                const cx = rows[ix] || [], cy = rows[iy] || [], cz = rows[iz] || [];
                const L = Math.max(cx.length, cy.length, cz.length);
                for (let i = 0; i < L; i++) {
                    const vx = num(cx[i]), vy = num(cy[i]), vz = num(cz[i]);
                    if (vx != null) {
                        if (vx < mm.x.min) mm.x.min = vx;
                        if (vx > mm.x.max) mm.x.max = vx;
                    }
                    if (vy != null) {
                        if (vy < mm.y.min) mm.y.min = vy;
                        if (vy > mm.y.max) mm.y.max = vy;
                    }
                    if (vz != null) {
                        if (vz < mm.z.min) mm.z.min = vz;
                        if (vz > mm.z.max) mm.z.max = vz;
                    }
                }
            } else {
                return null;
            }

            if (!Number.isFinite(mm.x.min) || !Number.isFinite(mm.x.max) ||
                !Number.isFinite(mm.y.min) || !Number.isFinite(mm.y.max) ||
                !Number.isFinite(mm.z.min) || !Number.isFinite(mm.z.max)) {
                return null;
            }
            return mm;
        }

        // 1) Try aggregating from primitives' obj-vertices
        const agg = {
            x: {min: +Infinity, max: -Infinity},
            y: {min: +Infinity, max: -Infinity},
            z: {min: +Infinity, max: -Infinity}
        };
        const updateAgg = (mm) => {
            if (!mm) return;
            if (mm.x.min < agg.x.min) agg.x.min = mm.x.min;
            if (mm.x.max > agg.x.max) agg.x.max = mm.x.max;
            if (mm.y.min < agg.y.min) agg.y.min = mm.y.min;
            if (mm.y.max > agg.y.max) agg.y.max = mm.y.max;
            if (mm.z.min < agg.z.min) agg.z.min = mm.z.min;
            if (mm.z.max > agg.z.max) agg.z.max = mm.z.max;
        };

        let found = false;
        for (const prim of (primitives || [])) {
            const mm = scanXYZ(readDS(prim['obj-vertices']));
            if (mm) {
                updateAgg(mm);
                found = true;
            }
        }
        if (!found) {
            for (const key of Object.keys(datasets || {})) {
                const mm = scanXYZ(datasets[key]);
                if (mm) {
                    updateAgg(mm);
                    found = true;
                }
            }
        }
        if (!found) return;

        const margin = 5;

        function snapWhole(min, max) {
            let lo = Math.floor(min);
            let hi = Math.ceil(max);
            if (lo === hi) {
                lo -= 1;
                hi += 1;
            } // avoid degenerate range
            return {min: lo, max: hi};
        }

        const auto = {
            x: snapWhole(agg.x.min - margin, agg.x.max + margin),
            y: snapWhole(agg.y.min - margin, agg.y.max + margin),
            z: snapWhole(agg.z.min - margin, agg.z.max + margin),
        };

        // Apply to GRAPH_RANGE if missing
        for (const axis of ['x', 'y', 'z']) {
            const g = GRAPH_RANGE[axis] || (GRAPH_RANGE[axis] = {});
            if (!(typeof g.min === 'number' && isFinite(g.min))) g.min = auto[axis].min;
            if (!(typeof g.max === 'number' && isFinite(g.max))) g.max = auto[axis].max;
        }

        // Apply to LABEL_RANGE if not provided/degenerate
        for (const axis of ['x', 'y', 'z']) {
            const r = LABEL_RANGE[axis] || (LABEL_RANGE[axis] = {});
            const provided = (typeof r.min === 'number' && typeof r.max === 'number' &&
                isFinite(r.min) && isFinite(r.max) && r.max !== r.min);
            if (!provided) {
                r.min = auto[axis].min;
                r.max = auto[axis].max;
            }
        }
    }

    applyAutoAxisRange();

    function hasLabelRange(axis) {
        const r = LABEL_RANGE[axis];
        return r && typeof r.min === 'number' && typeof r.max === 'number' && r.max !== r.min;
    }

    function mapToLabel(axis, t) {
        // Map internal coordinate t in [-Laxis, Laxis] to [min,max] from LABEL_RANGE if provided
        if (!hasLabelRange(axis)) return t;
        const r = LABEL_RANGE[axis];
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
        attribute float a_psize;
        uniform mat4 u_mvp;
        uniform float u_pointSize;
        void main(){
            gl_Position = u_mvp * vec4(a_position, 1.0);
            gl_PointSize = (a_psize > 0.0) ? a_psize : u_pointSize;
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
        a_psize: gl.getAttribLocation(p, "a_psize"),
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
        attribute float a_psize;
        attribute vec4 a_color;
        varying vec4 v_color;
        uniform mat4 u_mvp;
        uniform float u_pointSize;
        void main(){
            gl_Position = u_mvp * vec4(a_position, 1.0);
            gl_PointSize = (a_psize > 0.0) ? a_psize : u_pointSize;
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
        a_psize: gl.getAttribLocation(p, "a_psize"),
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
    // --- programs (textured triangles with per-vertex color) ---
    const vsPosUVColor = `
        attribute vec3 a_position;
        attribute vec2 a_uv;
        attribute vec4 a_color;
        varying vec2 v_uv;
        varying vec4 v_color;
        uniform mat4 u_mvp;
        void main(){
            gl_Position = u_mvp * vec4(a_position, 1.0);
            v_uv = a_uv;
            v_color = a_color;
        }
    `;
    const fsTexColor = `
        precision mediump float;
        varying vec2 v_uv;
        varying vec4 v_color;
        uniform sampler2D u_tex;
        void main(){
            gl_FragColor = texture2D(u_tex, v_uv) * v_color;
        }
    `;
    const progTrisTexColor = prog(vsPosUVColor, fsTexColor);
    const locTexColor = {
        a_position: gl.getAttribLocation(progTrisTexColor, "a_position"),
        a_uv: gl.getAttribLocation(progTrisTexColor, "a_uv"),
        a_color: gl.getAttribLocation(progTrisTexColor, "a_color"),
        u_mvp: gl.getUniformLocation(progTrisTexColor, "u_mvp"),
        u_tex: gl.getUniformLocation(progTrisTexColor, "u_tex"),
    };

    const locTex = {
        a_position: gl.getAttribLocation(progTrisTex, "a_position"),
        a_uv: gl.getAttribLocation(progTrisTex, "a_uv"),
        u_mvp: gl.getUniformLocation(progTrisTex, "u_mvp"),
        u_tex: gl.getUniformLocation(progTrisTex, "u_tex"),
    };

    // Axis half-extent per axis. If GRAPH_RANGE provides numeric min/max, fit [-L,L] to [min,max]
    // and choose L = (max - min)/2 for physical size of the cube. Fallback to 3.0 when no range is provided.
    // Note: LABEL_RANGE controls tick label values separately.
    const defaultAxisLen = 3.0;

    function axisHalfExtentFor(axis) {
        const spanFrom = (r) =>
            r && typeof r.min === 'number' && typeof r.max === 'number' &&
            isFinite(r.min) && isFinite(r.max) && r.max !== r.min
                ? Math.abs(r.max - r.min) / 2
                : null;

        // Prefer GRAPH_RANGE; if missing/degenerate, use LABEL_RANGE; else default
        const g = GRAPH_RANGE[axis];
        const l = LABEL_RANGE[axis];
        return spanFrom(g) ?? spanFrom(l) ?? defaultAxisLen;
    }

    const axisLenX = axisHalfExtentFor('x');
    const axisLenY = axisHalfExtentFor('y');
    const axisLenZ = axisHalfExtentFor('z');

    // --- normalize data coords -> internal [-L..+L] using LABEL_RANGE -----------
    function hasFiniteLabelRange(axis) {
        const r = LABEL_RANGE[axis];
        return r && isFinite(r.min) && isFinite(r.max) && r.max !== r.min;
    }

    // Maps a single scalar value v on a given axis into [-L..+L]
    function mapScalarToInternal(axis, v) {
        const r = LABEL_RANGE[axis];
        if (!hasFiniteLabelRange(axis)) return v;
        const L = (axis === 'x') ? axisLenX : (axis === 'y') ? axisLenY : axisLenZ;
        const span = (r.max - r.min) || 1e-6;
        const scale = (2 * L) / span;
        const offset = -L - r.min * scale;
        return v * scale + offset;
    }

    // Accepts any Float32Array of triples [..., x, y, z, ...] and maps in-place
    function normalizeXYZSeq(float32) {
        if (!float32 || float32.length < 3) return float32;
        const out = new Float32Array(float32.length);
        for (let i = 0; i < float32.length; i += 3) {
            out[i] = mapScalarToInternal('x', float32[i]);
            out[i + 1] = mapScalarToInternal('y', float32[i + 1]);
            out[i + 2] = mapScalarToInternal('z', float32[i + 2]);
        }
        return out;
    }

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

    // --- tiny vec/quat helpers ----------------------------------
    function v3(x = 0, y = 0, z = 0) {
        return new Float32Array([x, y, z]);
    }

    function v3dot(a, b) {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }

    function v3cross(a, b) {
        return v3(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);
    }

    function v3len(a) {
        return Math.hypot(a[0], a[1], a[2]);
    }

    function v3norm(a) {
        const L = v3len(a) || 1;
        return v3(a[0] / L, a[1] / L, a[2] / L);
    }

    function quatIdentity() {
        return new Float32Array([0, 0, 0, 1]);
    } // [x,y,z,w]
    function quatMul(a, b) {
        const ax = a[0], ay = a[1], az = a[2], aw = a[3];
        const bx = b[0], by = b[1], bz = b[2], bw = b[3];
        return new Float32Array([
            aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz
        ]);
    }

    function quatNormalize(q) {
        const L = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
        return new Float32Array([q[0] / L, q[1] / L, q[2] / L, q[3] / L]);
    }

    function quatFromAxisAngle(axis, angle) {
        const a = v3norm(axis), s = Math.sin(angle / 2);
        return new Float32Array([a[0] * s, a[1] * s, a[2] * s, Math.cos(angle / 2)]);
    }

    function mat4FromQuat(q) {
        const x = q[0], y = q[1], z = q[2], w = q[3];
        const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y,
            wz = w * z;
        const m = new Float32Array(16);
        m[0] = 1 - 2 * (yy + zz);
        m[4] = 2 * (xy - wz);
        m[8] = 2 * (xz + wy);
        m[12] = 0;
        m[1] = 2 * (xy + wz);
        m[5] = 1 - 2 * (xx + zz);
        m[9] = 2 * (yz - wx);
        m[13] = 0;
        m[2] = 2 * (xz - wy);
        m[6] = 2 * (yz + wx);
        m[10] = 1 - 2 * (xx + yy);
        m[14] = 0;
        m[3] = 0;
        m[7] = 0;
        m[11] = 0;
        m[15] = 1;
        return m;
    }

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
    const initDist = 13.0;
    let dist = initDist;
    let dragging = false;

    // current orientation as a quaternion
    let qOrient = quatIdentity();

    // last arcball vector under the cursor while dragging
    let lastArc = null;

    // Map a pointer event to an arcball vector on the unit sphere in view space
    function arcballVecFromEvent(e) {
        const rect = canvas.getBoundingClientRect();
        // normalised device coords in [-1, 1]
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = ((rect.bottom - e.clientY) / rect.height) * 2 - 1; // invert Y
        // project (x,y) onto a unit sphere (trackball)
        const r2 = x * x + y * y;
        const z = r2 <= 1 ? Math.sqrt(1 - r2) : 0;
        const v = v3(x, y, z);
        // normalise (important when outside the unit circle)
        return v3norm(v);
    }

    // Cached matrices/viewport for hover picking
    let lastMVP = null, lastCssW = 0, lastCssH = 0;

    canvas.addEventListener("pointerdown", (e) => {
        dragging = true;
        lastArc = arcballVecFromEvent(e);
        canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const cur = arcballVecFromEvent(e);
        // rotation between lastArc -> cur
        const axis = v3cross(lastArc, cur);
        const dot = Math.min(1, Math.max(-1, v3dot(lastArc, cur)));
        const angle = Math.acos(dot); // radians

        if (v3len(axis) > 1e-6 && angle > 1e-6) {
            const dq = quatFromAxisAngle(axis, angle);
            qOrient = quatNormalize(quatMul(dq, qOrient));
        }
        lastArc = cur;
        requestAnimationFrame(render);
    });

    window.addEventListener("pointerup", () => {
        dragging = false;
        lastArc = null;
    });

    canvas.addEventListener("wheel", (e) => {
        const zoomGesture = e.ctrlKey || e.metaKey;
        if (!zoomGesture) return;

        e.preventDefault();
        const s = Math.exp(e.deltaY * 0.001);
        dist = Math.max(2.0, dist * s);
        requestAnimationFrame(render);
    }, {passive: false});

    canvas.addEventListener("dblclick", () => {
        qOrient = quatIdentity();
        dist = initDist;
        requestAnimationFrame(render);
    });

    // --- hover picking ----------------------------------------------------------
    function fmtTick(v) {
        return formatTick(v);
    }

    canvas.addEventListener('pointermove', (e) => {
        if (dragging || !lastMVP) {
            tip.style.display = 'none';
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const dpr = window.devicePixelRatio || 1;
        const pickR = 12 * dpr;
        const pickR2 = pickR * pickR;

        let best = null; // {o, idx, sx, sy, d2}

        for (const o of compiled) {
            if (o.modeGL !== gl.POINTS || !o.vertsN) continue;

            // per-primitive transform
            const pos = o.position || {x: 0, y: 0, z: 0};
            const rotD = o.rotationDeg || {x: 0, y: 0, z: 0};
            const toRad = d => (d || 0) * Math.PI / 180.0;
            const Rxp = mat4RotateX(toRad(rotD.x));
            const Ryp = mat4RotateY(toRad(rotD.y));
            const Rzp = mat4RotateZ(toRad(rotD.z));
            const Tp = mat4Translate(pos.x || 0, pos.y || 0, pos.z || 0);
            const Mp = mat4Mul(Tp, mat4Mul(Rzp, mat4Mul(Ryp, Rxp)));
            const MVPp = mat4Mul(lastMVP, Mp);

            const arr = o.vertsN;
            for (let i = 0; i < arr.length; i += 3) {
                const p = projectToScreen(arr[i], arr[i + 1], arr[i + 2], MVPp, lastCssW, lastCssH);
                if (!p) continue;
                const dx = p.x - mx, dy = p.y - my;
                const d2 = dx * dx + dy * dy;
                if (d2 <= pickR2 && (!best || d2 < best.d2)) best = {o, idx: i / 3, sx: p.x, sy: p.y, d2};
            }
        }

        if (!best) {
            tip.style.display = 'none';
            return;
        }

        const vx = best.o.vertsN[best.idx * 3 + 0];
        const vy = best.o.vertsN[best.idx * 3 + 1];
        const vz = best.o.vertsN[best.idx * 3 + 2];

        const lx = mapToLabel('x', vx);
        const ly = mapToLabel('y', vy);
        const lz = mapToLabel('z', vz);

        tip.textContent = `(${fmtTick(lx)}, ${fmtTick(ly)}, ${fmtTick(lz)})`;
        tip.style.left = `${best.sx}px`;
        tip.style.top = `${best.sy}px`;
        tip.style.display = 'block';
    });

    // hide tooltip while user acts
    canvas.addEventListener('pointerdown', () => {
        tip.style.display = 'none';
    });
    canvas.addEventListener('wheel', () => {
        tip.style.display = 'none';
    }, {passive: true});
    canvas.addEventListener('dblclick', () => {
        tip.style.display = 'none';
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

    // Texture cache and async loader for URL-based textures
    const textureCache = new Map();

    function isHttpUrl(u) {
        return typeof u === 'string' && /^(https?:)?\/\//i.test(u);
    }

    function getOrLoadTexture(url, onLoaded) {
        console.info('Requesting Texture:', url);
        if (!url) {
            console.info('Texture has no URL, request rejected');
            return;
        }
        console.info('Loading Texture:', url);
        const cached = textureCache.get(url);
        if (cached && cached !== 'loading') {
            console.info('Returning cached texture');
            return cached;
        }
        if (cached === 'loading') {
            console.info('New texture, not loaded, Creating Texture while loading occurs');
            return;
        }
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
                console.info('Texture ' + url + ' loaded from HTTP, uploading to GPU');
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
                requestAnimationFrame(render);
            }
        };
        img.onerror = () => {
            console.error('Failed to load texture URL:', url);
            requestAnimationFrame(render);
        };
        try {
            img.src = url;
        } catch (e) {
            console.warn('Invalid texture URL:', url, e);
        }
    }

    // Helper: convert df_to_dict-like data using specified column names into a flat Float32Array
    // New signature: toFloat32(data, columnNamesOrCount)
    // - If columnNamesOrCount is an array or string -> treat as requested column names
    // - If it's a number -> legacy behavior (componentsExpected) using generic inference
    function toFloat32(data, columnNamesOrCount) {
        if (!data) {
            return null;
        }

        // Helper: coerce to finite number, default 0
        const num = (v) => {
            const n = +v;
            return Number.isFinite(n) ? n : 0;
        };

        // If caller passed column names, attempt df-dict path first
        let requestedCols = null;
        if (Array.isArray(columnNamesOrCount)) {
            requestedCols = columnNamesOrCount.map(c => String(c).toLowerCase());
        } else if (typeof columnNamesOrCount === 'string') {
            requestedCols = [columnNamesOrCount.toLowerCase()];
        }

        // df_to_dict-like object: {cols:[...], orientation:'byrow'|'bycol', rows:[...]}
        if (requestedCols && typeof data === 'object' && !Array.isArray(data)) {
            const cols = data.cols || data.columns;
            const orientation = ((data.orientation || data.orient || 'byrow') + '').toLowerCase();
            const rows = data.rows || data.data || data.values;
            if (Array.isArray(cols) && Array.isArray(rows)) {
                // Build column index map (case-insensitive match)
                const colIndex = new Map();
                for (let i = 0; i < cols.length; i++) {
                    const name = String(cols[i]).toLowerCase();
                    if (!colIndex.has(name)) colIndex.set(name, i);
                }
                const idxs = [];
                for (const rc of requestedCols) {
                    const ci = colIndex.get(rc);
                    if (ci === undefined) {
                        console.warn('toFloat32: missing column', rc);
                        return null;
                    }
                    idxs.push(ci);
                }

                const out = [];
                if (orientation === 'byrow' || orientation === 'table' || orientation === 'json' || orientation === '') {
                    for (let r = 0; r < rows.length; r++) {
                        const row = rows[r];
                        if (!Array.isArray(row)) continue;
                        for (let k = 0; k < idxs.length; k++) {
                            out.push(num(row[idxs[k]]));
                        }
                    }
                } else if (orientation === 'bycol' || orientation === 'chart') {
                    const maxLen = rows.reduce((m, col) => Math.max(m, Array.isArray(col) ? col.length : 0), 0);
                    for (let r = 0; r < maxLen; r++) {
                        for (let k = 0; k < idxs.length; k++) {
                            const colArr = rows[idxs[k]];
                            const v = Array.isArray(colArr) ? colArr[r] : undefined;
                            out.push(num(v));
                        }
                    }
                } else {
                    console.warn('toFloat32: unknown orientation', orientation);
                    return null;
                }
                console.info("FLOAT32 For array " + columnNamesOrCount, idxs, out);
                return new Float32Array(out);
            }
        }
        flash("Unknown dataset format");
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
    const getDS = (name) => {
        if (name === '' || name === undefined) {
            return null
        }

        const raw = datasets[name];
        return raw;
    };
    for (const prim of (primitives || [])) {
        const vertsRaw = getDS(prim['obj-vertices']);
        const edgesRaw = getDS(prim['obj-edges']);
        const uvRaw = getDS(prim['obj-uv']);
        const colRaw = getDS(prim['obj-color'] || prim['obj-colour']);

        const verts = toFloat32(vertsRaw, ['x', 'y', 'z']);
        const edges = toFloat32(edgesRaw, ['x1', 'y1', 'z1', 'x2', 'y2', 'z2']); // positions for lines
        const uvs = toFloat32(uvRaw, ['u', 'v']);
        const cols = toFloat32(colRaw, ['r', 'g', 'b', 'a']);

        const name = prim.name || prim.id || 'obj';

        // Determine mode
        let mode = prim['obj-primitive']; // 'point' | 'line' | 'triangle'
        if (!mode) {
            if (edges && edges.length >= 6) mode = 'line';
            else if (verts && (verts.length % 9 === 0)) mode = 'triangle';
            else mode = 'point';
        }

        const hasPS = vertsRaw && (vertsRaw.cols || vertsRaw.columns || []).some(c => String(c).toLowerCase() === 'ps');
        const pointsizes = (mode === 'point' && hasPS) ? toFloat32(vertsRaw, ['ps']) : null;

        // Normalize positions so data ranges fit the axis cube
        const vertsN = normalizeXYZSeq(verts);
        const edgesN = normalizeXYZSeq(edges);

        let program = null;
        let locations = null;
        let usesColorVary = false;
        let usesUniformColor = false;
        let usesTex = false;
        let colorSize = 4;
        let uniformColor = null;

        const vboSource = (mode === 'line' && edgesN) ? edgesN : vertsN;
        const vbo = createBufferAndUpload(gl.ARRAY_BUFFER, vboSource);
        let psbo = createBufferAndUpload(gl.ARRAY_BUFFER, pointsizes);
        let cbo = null, uvbo = null, ebo = null;
        let countVerts = 0, countElems = 0, indexType = gl.UNSIGNED_SHORT;
        let modeGL = gl.POINTS;

        if (mode === 'point') {
            // points use vertices
            if (!vertsN || vertsN.length < 3) {
                console.warn('Primitive skipped (no vertices):', name);
                continue;
            }
            countVerts = Math.floor(vertsN.length / 3);
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
            const lineData = edgesN || vertsN; // fallback to verts if edges missing (interpret as line strip pairs)
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
            if (!vertsN || vertsN.length < 9) {
                console.warn('Primitive skipped (no triangle vertices):', name);
                continue;
            }
            countVerts = Math.floor(vertsN.length / 3);
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

        // If this primitive uses texturing and provides a texture URL, load it now
        let textureUrl = prim['obj-texture-absolute'];
        let initialTexture;
        if (usesTex && textureUrl) {
            // flash("Loading texture " + textureUrl);
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
            psbo,
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
            // CPU-side verts for hover picking (only for points)
            vertsN: (modeGL === gl.POINTS) ? vertsN : null,
        });
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
        const M = mat4FromQuat(qOrient);
        const MVP = mat4Mul(mat4Mul(P, V), M);

        // cache for hover picking
        lastCssW = cssW;
        lastCssH = cssH;
        lastMVP = MVP;

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

            if (o.locations.u_mvp) gl.uniformMatrix4fv(o.locations.u_mvp, false, MVPp);

            // attributes
            gl.bindBuffer(gl.ARRAY_BUFFER, o.vbo);
            if (o.locations.a_position !== -1) {
                gl.vertexAttribPointer(o.locations.a_position, 3, gl.FLOAT, false, 0, 0);
                gl.enableVertexAttribArray(o.locations.a_position);
            }

            // point size (if program supports it)
            if (o.locations.u_pointSize) gl.uniform1f(o.locations.u_pointSize, Math.max(4.0, 5.0 * dpr));

            if (o.psbo && o.locations.a_psize !== -1) {
                gl.bindBuffer(gl.ARRAY_BUFFER, o.psbo);
                gl.vertexAttribPointer(o.locations.a_psize, 1, gl.FLOAT, false, 0, 0);
                gl.enableVertexAttribArray(o.locations.a_psize);
            }

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
                gl.bindTexture(gl.TEXTURE_2D, o.texture);
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

            // cleanup: disable attributes to prevent state leakage to next primitives
            if (o.locations.a_position !== -1) gl.disableVertexAttribArray(o.locations.a_position);
            if (o.locations.a_psize !== -1) gl.disableVertexAttribArray(o.locations.a_psize);
            if (o.locations.a_color !== -1) gl.disableVertexAttribArray(o.locations.a_color);
            if (o.locations.a_uv !== -1) gl.disableVertexAttribArray(o.locations.a_uv);
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
