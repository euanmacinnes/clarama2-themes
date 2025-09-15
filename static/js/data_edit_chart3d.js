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


// test with triangles, points and lines
// then test with the different datasets 
// (vertices would be the same, but the edges would be different)

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
    flash("initCube");
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

    console.log(GRAPH_RANGE);
    console.log(LABEL_RANGE);

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
        a_uv:       gl.getAttribLocation(progTrisTexColor, "a_uv"),
        a_color:    gl.getAttribLocation(progTrisTexColor, "a_color"),
        u_mvp:      gl.getUniformLocation(progTrisTexColor, "u_mvp"),
        u_tex:      gl.getUniformLocation(progTrisTexColor, "u_tex"),
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
            out[i    ] = mapScalarToInternal('x', float32[i    ]);
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
    function v3(x=0,y=0,z=0){ return new Float32Array([x,y,z]); }
    function v3dot(a,b){ return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
    function v3cross(a,b){ return v3(a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]); }
    function v3len(a){ return Math.hypot(a[0],a[1],a[2]); }
    function v3norm(a){ const L=v3len(a)||1; return v3(a[0]/L,a[1]/L,a[2]/L); }

    function quatIdentity(){ return new Float32Array([0,0,0,1]); } // [x,y,z,w]
    function quatMul(a,b){
        const ax=a[0], ay=a[1], az=a[2], aw=a[3];
        const bx=b[0], by=b[1], bz=b[2], bw=b[3];
        return new Float32Array([
            aw*bx + ax*bw + ay*bz - az*by,
            aw*by - ax*bz + ay*bw + az*bx,
            aw*bz + ax*by - ay*bx + az*bw,
            aw*bw - ax*bx - ay*by - az*bz
        ]);
    }
    
    function quatNormalize(q){
        const L=Math.hypot(q[0],q[1],q[2],q[3])||1;
        return new Float32Array([q[0]/L,q[1]/L,q[2]/L,q[3]/L]);
    }

    function quatFromAxisAngle(axis, angle){
        const a=v3norm(axis), s=Math.sin(angle/2);
        return new Float32Array([a[0]*s, a[1]*s, a[2]*s, Math.cos(angle/2)]);
    }

    function mat4FromQuat(q){
        const x=q[0], y=q[1], z=q[2], w=q[3];
        const xx=x*x, yy=y*y, zz=z*z, xy=x*y, xz=x*z, yz=y*z, wx=w*x, wy=w*y, wz=w*z;
        const m=new Float32Array(16);
        m[0]=1-2*(yy+zz); m[4]=2*(xy- wz); m[8 ]=2*(xz+wy); m[12]=0;
        m[1]=2*(xy+wz);   m[5]=1-2*(xx+zz); m[9 ]=2*(yz-wx); m[13]=0;
        m[2]=2*(xz-wy);   m[6]=2*(yz+wx);   m[10]=1-2*(xx+yy); m[14]=0;
        m[3]=0;           m[7]=0;           m[11]=0;          m[15]=1;
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

    // Build a 4x4 matrix that maps original data space (orig_bounds) to graph space (graph_bounds)
    function buildBoundsMatrix(axisCfg) {
        try {
            const ob = (axisCfg && axisCfg.orig_bounds) || {};
            const gb = (axisCfg && axisCfg.graph_bounds) || {x: [-3, 3], y: [-3, 3], z: [-3, 3]};
            const m = mat4Identity();
            const axes = ['x', 'y', 'z'];
            const diagIdx = [0, 5, 10]; // x, y, z scale positions
            const trIdx = [12, 13, 14]; // x, y, z translation positions
            for (let i = 0; i < 3; i++) {
                const ax = axes[i];
                const o = ob && Array.isArray(ob[ax]) ? ob[ax] : [undefined, undefined];
                const g = gb && Array.isArray(gb[ax]) ? gb[ax] : [-3, 3];
                const omin = Number(o[0]);
                const omax = Number(o[1]);
                const gmin = Number(g[0]);
                const gmax = Number(g[1]);
                let s = 1, t = 0;
                if (Number.isFinite(omin) && Number.isFinite(omax) && omin !== omax && Number.isFinite(gmin) && Number.isFinite(gmax)) {
                    s = (gmax - gmin) / (omax - omin);
                    t = gmin - omin * s;
                } else if (Number.isFinite(gmin) && Number.isFinite(gmax)) {
                    // Degenerate data range: collapse to midpoint of target range
                    s = 0;
                    t = (gmin + gmax) / 2;
                }
                m[diagIdx[i]] = s;
                m[trIdx[i]] = t;
            }
            return m;
        } catch (e) {
            console.warn('buildBoundsMatrix failed, using identity:', e);
            return mat4Identity();
        }
    }

    // Global bounds transform used for all primitives: maps orig_bounds → graph_bounds
    const M_bounds = buildBoundsMatrix(axisConfig || {});

    // --- interaction --------------------------------------------------------
    const initDist = 14.0, initRotX = 0.3, initRotY = -0.3; // the initial rotation upon loading
    let dist = initDist, rotX = initRotX, rotY = initRotY;
    let dragging = false, lastX = 0, lastY = 0;

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
        const dot  = Math.min(1, Math.max(-1, v3dot(lastArc, cur)));
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
    function fmtTick(v) { return formatTick(v); }

    canvas.addEventListener('pointermove', (e) => {
        if (dragging || !lastMVP) { tip.style.display = 'none'; return; }

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
            const pos = o.position || {x:0,y:0,z:0};
            const rotD = o.rotationDeg || {x:0,y:0,z:0};
            const toRad = d => (d||0) * Math.PI/180.0;
            const Rxp = mat4RotateX(toRad(rotD.x));
            const Ryp = mat4RotateY(toRad(rotD.y));
            const Rzp = mat4RotateZ(toRad(rotD.z));
            const Tp  = mat4Translate(pos.x||0, pos.y||0, pos.z||0);
            const Mp  = mat4Mul(Tp, mat4Mul(Rzp, mat4Mul(Ryp, Rxp)));
            const MVPp = mat4Mul(lastMVP, Mp);

            const arr = o.vertsN;
            for (let i = 0; i < arr.length; i += 3) {
                const p = projectToScreen(arr[i], arr[i+1], arr[i+2], MVPp, lastCssW, lastCssH);
                if (!p) continue;
                const dx = p.x - mx, dy = p.y - my;
                const d2 = dx*dx + dy*dy;
                if (d2 <= pickR2 && (!best || d2 < best.d2)) best = {o, idx: i/3, sx: p.x, sy: p.y, d2};
            }
        }

        if (!best) { tip.style.display = 'none'; return; }

        const vx = best.o.vertsN[best.idx*3 + 0];
        const vy = best.o.vertsN[best.idx*3 + 1];
        const vz = best.o.vertsN[best.idx*3 + 2];

        const lx = mapToLabel('x', vx);
        const ly = mapToLabel('y', vy);
        const lz = mapToLabel('z', vz);

        tip.textContent = `(${fmtTick(lx)}, ${fmtTick(ly)}, ${fmtTick(lz)})`;
        tip.style.left = `${best.sx}px`;
        tip.style.top  = `${best.sy}px`;
        tip.style.display = 'block';
    });

    // hide tooltip while user acts
    canvas.addEventListener('pointerdown', () => { tip.style.display = 'none'; });
    canvas.addEventListener('wheel', () => { tip.style.display = 'none'; }, {passive:true});
    canvas.addEventListener('dblclick', () => { tip.style.display = 'none'; });


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
        if (!url) return;
        const cached = textureCache.get(url);
        if (cached && cached !== 'loading') return cached;
        if (cached === 'loading') return;
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
                requestAnimationFrame(render);
            }
        };
        img.onerror = () => {
            console.warn('Failed to load texture URL:', url);
            requestAnimationFrame(render);
        };
        try {
            img.src = url;
        } catch (e) {
            console.warn('Invalid texture URL:', url, e);
        }
        return;
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
            requestedCols = columnNamesOrCount;
        } else if (typeof columnNamesOrCount === 'string') {
            requestedCols = [columnNamesOrCount];
        }

        // df_to_dict-like object: {cols:[...], orientation:'byrow'|'bycol', rows:[...]}
        if (requestedCols && typeof data === 'object' && !Array.isArray(data)) {
            const cols = data.cols || data.columns;
            const orientation = ((data.orientation || data.orient || 'byrow') + '').toLowerCase();
            const rows = data.rows || data.data || data.values;
            if (Array.isArray(cols) && Array.isArray(rows)) {
                // Build column index map (case-insensitive match fallback)
                const colIndex = new Map();
                for (let i = 0; i < cols.length; i++) {
                    const name = String(cols[i]);
                    colIndex.set(name, i);
                    colIndex.set(name.toLowerCase(), i);
                }
                const idxs = [];
                for (const rc of requestedCols) {
                    const exact = colIndex.get(rc);
                    const ci = (exact !== undefined) ? exact : colIndex.get(String(rc).toLowerCase());
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

    // Extract integer index arrays from df_to_dict-like dataset given column names
    function toIndices(data, cols) {
        if (!data || !cols || cols.length === 0) return null;
        const colsMeta = data.cols || data.columns;
        const orientation = ((data.orientation || data.orient || 'byrow') + '').toLowerCase();
        const rows = data.rows || data.data || data.values;
        if (!Array.isArray(colsMeta) || !Array.isArray(rows)) return null;
        const colIndex = new Map();
        for (let i = 0; i < colsMeta.length; i++) {
            const name = String(colsMeta[i]);
            colIndex.set(name, i);
            colIndex.set(name.toLowerCase(), i);
        }
        const idxs = [];
        for (const c of cols) {
            const exact = colIndex.get(c);
            const ci = (exact !== undefined) ? exact : colIndex.get(String(c).toLowerCase());
            if (ci === undefined) return null;
            idxs.push(ci);
        }
        const out = [];
        if (orientation === 'byrow' || orientation === 'table' || orientation === 'json' || orientation === '') {
            for (let r = 0; r < rows.length; r++) {
                const row = rows[r];
                if (!Array.isArray(row)) continue;
                for (let k = 0; k < idxs.length; k++) {
                    const v = +row[idxs[k]];
                    out.push(Number.isFinite(v) ? v : 0);
                }
            }
        } else if (orientation === 'bycol' || orientation === 'chart') {
            const maxLen = rows.reduce((m, col) => Math.max(m, Array.isArray(col) ? col.length : 0), 0);
            for (let r = 0; r < maxLen; r++) {
                for (let k = 0; k < idxs.length; k++) {
                    const colArr = rows[idxs[k]];
                    const v = Array.isArray(colArr) ? +colArr[r] : 0;
                    out.push(Number.isFinite(v) ? v : 0);
                }
            }
        } else {
            return null;
        }
        // choose index type based on max
        let maxIndex = 0;
        for (let i = 0; i < out.length; i++) if (out[i] > maxIndex) maxIndex = out[i];
        const use32 = (maxIndex > 65535);
        return use32 ? new Uint32Array(out) : (maxIndex > 255 ? new Uint16Array(out) : new Uint8Array(out));
    }

    // Extract a single numeric column (e.g., 'strip') as Int32Array
    function toIntColumn(data, colName) {
        if (!data || !colName) return null;
        const arr = toFloat32(data, [colName]);
        if (!arr) return null;
        const out = new Int32Array(arr.length);
        for (let i = 0; i < arr.length; i++) out[i] = Math.trunc(arr[i]);
        return out;
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
                // interpret edges dataset as indices to save data
                const indicesLine = edgesRaw ? toIndices(edgesRaw, ['i0', 'i1']) : null; // for LINES
                const indicesTri = edgesRaw ? toIndices(edgesRaw, ['i0', 'i1', 'i2']) : null; // for TRIANGLES
                const indicesLineStrip = edgesRaw ? toIndices(edgesRaw, ['i']) : null; // for LINE_STRIP per strip order
                const stripIds = edgesRaw ? toIntColumn(edgesRaw, 'strip') : null;
                const edgesPos = edgesRaw ? toFloat32(edgesRaw, ['x', 'y', 'z']) : null; // legacy positions for lines
                const uvs = toFloat32(uvRaw, ['u', 'v']);
                const cols = toFloat32(colRaw, ['r', 'g', 'b', 'a']);

        const name = prim.name || prim.id || 'obj';

                // Determine mode
                let mode = prim['obj-primitive']; // 'point' | 'line' | 'triangle'
                if (!mode) {
                    if (indicesLine && indicesLine.length >= 2) mode = 'line';
                    else if (indicesTri && indicesTri.length >= 3) mode = 'triangle';
                    else mode = 'point';
                }

        let program = null;
        let locations = null;
        let usesColorVary = false;
        let usesUniformColor = false;
        let usesTex = false;
        let colorSize = 4;
        let uniformColor = null;

                const vbo = createBufferAndUpload(gl.ARRAY_BUFFER, verts);
                let cbo = null, uvbo = null, ebo = null;
                let countVerts = 0, countElems = 0, indexType = gl.UNSIGNED_SHORT;
                let modeGL = gl.POINTS;

                function detectIndexType(idxArr) {
                    if (!idxArr) return gl.UNSIGNED_SHORT;
                    if (idxArr instanceof Uint32Array) return gl.UNSIGNED_INT;
                    if (idxArr instanceof Uint16Array) return gl.UNSIGNED_SHORT;
                    return gl.UNSIGNED_BYTE;
                }

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
                    // lines: prefer index-based draw if provided
                    if (indicesLine && indicesLine.length >= 2) {
                        ebo = createBufferAndUpload(gl.ELEMENT_ARRAY_BUFFER, indicesLine);
                        indexType = detectIndexType(indicesLine);
                        countElems = indicesLine.length;
                        if (cols && verts) {
                            usesColorVary = false;
                        }
                        // choose shader
                        if (cols && cols.length >= (verts ? (verts.length / 3) * 3 : 0)) {
                            usesColorVary = true;
                            colorSize = (cols.length % 4 === 0) ? 4 : 3;
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
                    } else {
                        // legacy: use edgesPos or verts as direct positions
                        const lineData = edgesPos || verts;
                        if (!lineData || lineData.length < 6) {
                            console.warn('Primitive skipped (no edges/verts for lines):', name);
                            continue;
                        }
                        // upload legacy positions into vbo instead
                        if (edgesPos) {
                            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
                            gl.bufferData(gl.ARRAY_BUFFER, edgesPos, gl.STATIC_DRAW);
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
                    }
                } else if (mode === 'line_strip') {
                    // Build one or more line strips from indicesLineStrip, grouped by stripIds if present
                    if (!indicesLineStrip || indicesLineStrip.length < 2) {
                        console.warn('Primitive skipped (no indices for line_strip):', name);
                        continue;
                    }
                    // Group indices by strip id if available
                    const stripsMap = new Map();
                    if (stripIds && stripIds.length === indicesLineStrip.length) {
                        for (let i = 0; i < stripIds.length; i++) {
                            const s = stripIds[i];
                            if (!stripsMap.has(s)) stripsMap.set(s, []);
                            stripsMap.get(s).push(indicesLineStrip[i]);
                        }
                    } else {
                        stripsMap.set(0, Array.from(indicesLineStrip));
                    }
                    // For each strip, push a compiled object and continue to next prim (skip single push below)
                    for (const [sid, arr] of stripsMap.entries()) {
                        const idxArr = (arr instanceof Uint8Array || arr instanceof Uint16Array || arr instanceof Uint32Array) ? arr : (function () {
                            // choose type based on max
                            let maxI = 0;
                            for (let k = 0; k < arr.length; k++) if (arr[k] > maxI) maxI = arr[k];
                            if (maxI > 65535) return new Uint32Array(arr); else if (maxI > 255) return new Uint16Array(arr); else return new Uint8Array(arr);
                        })();
                        compiled.push({
                            name: name + '_strip_' + sid,
                            program: progLines,
                            locations: loc.lines,
                            vbo,
                            cbo: null,
                            uvbo: null,
                            ebo: createBufferAndUpload(gl.ELEMENT_ARRAY_BUFFER, idxArr),
                            colorSize: 4,
                            usesColorVary: false,
                            usesUniformColor: true,
                            uniformColor: prim.uniformColor || STYLE.cube,
                            usesTex: false,
                            texture: null,
                            hasIndices: true,
                            countVerts: Math.floor((verts ? verts.length : 0) / 3),
                            countElems: idxArr.length,
                            indexType: detectIndexType(idxArr),
                            modeGL: gl.LINE_STRIP,
                            transformMatrix: (function () {
                                const tm = prim['transform-matrix-data'];
                                return (Array.isArray(tm) && tm.length === 16) ? tm : null;
                            })(),
                        });
                    }
                    continue; // handled
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
                    // Indices if provided (for TRIANGLES). For triangle_strip, drawArrays without indices.
                    if (indicesTri && !(mode === 'trianglestrip' || mode === 'triangle_strip')) {
                        ebo = createBufferAndUpload(gl.ELEMENT_ARRAY_BUFFER, indicesTri);
                        indexType = detectIndexType(indicesTri);
                        countElems = indicesTri.length;
                        modeGL = gl.TRIANGLES;
                    } else {
                        modeGL = (mode === 'trianglestrip' || mode === 'triangle_strip') ? gl.TRIANGLE_STRIP : gl.TRIANGLES;
                    }
                } else {
                    console.warn('Unknown primitive mode, skipping:', mode);
                    continue;
                }

        // If this primitive uses texturing and provides a texture URL, load it now
        let textureUrl = prim['obj-texture-absolute'];
        let initialTexture;
        if (usesTex && textureUrl) {
            flash("Loading texture " + textureUrl);
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
                    hasIndices: !!ebo,
                    countVerts,
                    countElems,
                    indexType,
                    modeGL,
                    // transformation matrix (4x4) if provided; otherwise identity will be used at render time
                    transformMatrix: (function () {
                        const tm = prim['transform-matrix-data'];
                        return (Array.isArray(tm) && tm.length === 16) ? tm : null;
                    })(),
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
        const M = mat4FromQuat(qOrient);
        const MVP = mat4Mul(mat4Mul(P, V), M);

        // cache for hover picking
        lastCssW = cssW;
        lastCssH = cssH;
        lastMVP  = MVP;

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

// Convert a df_to_dict output to an array of row objects
// Accepts shapes like: {cols:[...], orientation:'byrow'|'bycol', rows:[...]}
// Returns array of objects [{col1: v11, col2: v12, ...}, ...]
function dfDictToArrayOfDicts(obj) {
    try {
        if (!obj || typeof obj !== 'object') return null;

        // If already an array of plain objects, pass through
        if (Array.isArray(obj) && obj.length > 0 && typeof obj[0] === 'object' && !Array.isArray(obj[0])) {
            return obj;
        }

        const cols = obj.cols || obj.columns;
        const orientation = (obj.orientation || obj.orient || '').toLowerCase();
        const rows = obj.rows || obj.data || obj.values;

        if (!Array.isArray(cols) || !Array.isArray(rows)) return null;
        if (cols.length === 0) return [];

        const out = [];
        if (orientation === 'byrow' || orientation === 'table' || orientation === 'json' || orientation === '') {
            // rows: array of arrays matching columns
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                if (!Array.isArray(r)) continue;
                const o = {};
                for (let c = 0; c < cols.length; c++) o[cols[c]] = r[c];
                out.push(o);
            }
            return out;
        }
        if (orientation === 'bycol' || orientation === 'chart') {
            // rows: array per column
            const n = rows.length;
            // Build by column; align by row index
            const maxLen = rows.reduce((m, col) => Math.max(m, Array.isArray(col) ? col.length : 0), 0);
            for (let i = 0; i < maxLen; i++) {
                const o = {};
                for (let c = 0; c < cols.length; c++) {
                    const colArr = rows[c];
                    o[cols[c]] = Array.isArray(colArr) ? colArr[i] : undefined;
                }
                out.push(o);
            }
            return out;
        }

        // Fallback: if rows look like objects with column keys, normalize
        if (rows.length > 0 && typeof rows[0] === 'object' && !Array.isArray(rows[0])) {
            return rows;
        }

        return null;
    } catch (e) {
        console.warn('dfDictToArrayOfDicts failed:', e);
        return null;
    }
}

// Expose globally for other modules to use
if (!window.dfDictToArrayOfDicts) window.dfDictToArrayOfDicts = dfDictToArrayOfDicts;
