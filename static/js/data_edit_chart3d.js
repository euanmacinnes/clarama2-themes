function boot() {
    document.querySelectorAll('canvas[id^="chart3d-"]').forEach((c) => {
        if (!c.dataset.cubeInit) initCube(c);
    });
}
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
function initCube(canvas, datasets = {}, primitives = []) {
    canvas.dataset.cubeInit = "1";

    const gl = canvas.getContext("webgl", { antialias: true, preserveDrawingBuffer: true });
    if (!gl) {
        const msg = document.createElement("div");
        msg.className = "text-danger small";
        msg.textContent = "WebGL not supported on this device/browser.";
        canvas.replaceWith(msg);
        return;
    }

    // --- helpers ------------------------------------------------------------
    function getSelectedPrimitive() {
        // returns 'point' | 'line' | 'triangle'
        return $('.chart3d-series-objects .obj-primitive option:selected').attr('id') || 'point';
    }

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
    const wrap = canvas.parentElement || document.body;
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
        grid:  [0.85, 0.85, 0.85, 1.0],
        frame: [0.55, 0.55, 0.55, 1.0],
        cube:  [0.75, 0.78, 0.90, 1.0],
        point: [0.20, 0.45, 0.90, 1.0],
        ticks: "#666",
        labelPx: 15,
        titlePx: 18,
        titleWeight: "bold",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    };

    // Axis titles (from data-* if present)
    const AXIS_TITLE = {
        x: canvas.dataset.axisX || "X",
        y: canvas.dataset.axisY || "Y",
        z: canvas.dataset.axisZ || "Z"
    };

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
    const progLines  = prog(vsPos, fsUniform);
    const progTris   = prog(vsPos, fsUniform);
    const progPoints = prog(vsPos, fsPointsUniform);

    const locU = (p) => ({
        a_position: gl.getAttribLocation(p, "a_position"),
        u_mvp:      gl.getUniformLocation(p, "u_mvp"),
        u_color:    gl.getUniformLocation(p, "u_color"),
        u_pointSize:gl.getUniformLocation(p, "u_pointSize"),
    });
    const loc = {
        lines:  locU(progLines),
        tris:   locU(progTris),
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
    const progLinesVary  = prog(vsPosColor, fsVary);
    const progTrisVary   = prog(vsPosColor, fsVary);
    const progPointsVary = prog(vsPosColor, fsPointsVary);
    const locV = (p) => ({
        a_position: gl.getAttribLocation(p, "a_position"),
        a_color:    gl.getAttribLocation(p, "a_color"),
        u_mvp:      gl.getUniformLocation(p, "u_mvp"),
        u_pointSize:gl.getUniformLocation(p, "u_pointSize"),
    });
    const locColor = {
        lines:  locV(progLinesVary),
        tris:   locV(progTrisVary),
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
        a_uv:       gl.getAttribLocation(progTrisTex, "a_uv"),
        u_mvp:      gl.getUniformLocation(progTrisTex, "u_mvp"),
        u_tex:      gl.getUniformLocation(progTrisTex, "u_tex"),
    };

    // --- cube + grids ------------------------------------
    const vertices = new Float32Array([
        -1,-1,-1,  1,-1,-1,  1, 1,-1, -1, 1,-1,
        -1,-1, 1,  1,-1, 1,  1, 1, 1, -1, 1, 1
    ]);
    const edges = new Uint16Array([
        0,1, 1,2, 2,3, 3,0,
        4,5, 5,6, 6,7, 7,4,
        0,4, 1,5, 2,6, 3,7
    ]);

    // 36 vertices (positions) for a cube [-1..+1], two triangles per face.
    const cubeTriPositions = new Float32Array([
        // FRONT  (z = +1)
        -1,-1, 1,   1,-1, 1,   1, 1, 1,
        -1,-1, 1,   1, 1, 1,  -1, 1, 1,
    
        // BACK   (z = -1)
        1,-1,-1,  -1,-1,-1,  -1, 1,-1,
        1,-1,-1,  -1, 1,-1,   1, 1,-1,
    
        // LEFT   (x = -1)
        -1,-1,-1,  -1, 1,-1,  -1, 1, 1,
        -1,-1,-1,  -1, 1, 1,  -1,-1, 1,
    
        // RIGHT  (x = +1)
        1,-1,-1,   1, 1,-1,   1, 1, 1,
        1,-1,-1,   1, 1, 1,   1,-1, 1,
    
        // TOP    (y = +1)
        -1, 1,-1,   1, 1,-1,   1, 1, 1,
        -1, 1,-1,   1, 1, 1,  -1, 1, 1,
    
        // BOTTOM (y = -1)
        -1,-1,-1,   1,-1,-1,   1,-1, 1,
        -1,-1,-1,   1,-1, 1,  -1,-1, 1,
    ]);
    
    // Matching per-vertex UVs (each face is a neat [0..1] square)
    const cubeTriUVs = new Float32Array([
        // FRONT
        0,0,  1,0,  1,1,
        0,0,  1,1,  0,1,
    
        // BACK
        0,0,  1,0,  1,1,
        0,0,  1,1,  0,1,
    
        // LEFT
        0,0,  1,0,  1,1,
        0,0,  1,1,  0,1,
    
        // RIGHT
        0,0,  1,0,  1,1,
        0,0,  1,1,  0,1,
    
        // TOP
        0,0,  1,0,  1,1,
        0,0,  1,1,  0,1,
    
        // BOTTOM
        0,0,  1,0,  1,1,
        0,0,  1,1,  0,1,
    ]);
    
    // Buffers for triangles
    const vboCubeTri = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vboCubeTri);
    gl.bufferData(gl.ARRAY_BUFFER, cubeTriPositions, gl.STATIC_DRAW);
    
    const uvboCubeTri = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvboCubeTri);
    gl.bufferData(gl.ARRAY_BUFFER, cubeTriUVs, gl.STATIC_DRAW);  
  
    const vboCube = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vboCube);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    const eboCube = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, eboCube);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, edges, gl.STATIC_DRAW);

    const axisLen  = 3.0;   // half-extent
    const tickStep = 1.0;
    const tickSize = 0.08;
    function pushLine(a, x1,y1,z1, x2,y2,z2) { a.push(x1,y1,z1, x2,y2,z2); }
    function buildGridXY(z) { const a=[]; for (let x=-axisLen;x<=axisLen;x+=tickStep) pushLine(a,x,-axisLen,z,x,axisLen,z);
                              for (let y=-axisLen;y<=axisLen;y+=tickStep) pushLine(a,-axisLen,y,z,axisLen,y,z); return new Float32Array(a); }
    function buildGridXZ(y) { const a=[]; for (let x=-axisLen;x<=axisLen;x+=tickStep) pushLine(a,x,y,-axisLen,x,y,axisLen);
                              for (let z=-axisLen;z<=axisLen;z+=tickStep) pushLine(a,-axisLen,y,z,axisLen,y,z); return new Float32Array(a); }
    function buildGridYZ(x) { const a=[]; for (let y=-axisLen;y<=axisLen;y+=tickStep) pushLine(a,x,y,-axisLen,x,y,axisLen);
                              for (let z=-axisLen;z<=axisLen;z+=tickStep) pushLine(a,x,-axisLen,z,x,axisLen,z); return new Float32Array(a); }
    const gridXY = buildGridXY(-axisLen);
    const gridXZ = buildGridXZ(-axisLen);
    const gridYZ = buildGridYZ(-axisLen);
    const gridXYBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, gridXYBuf); gl.bufferData(gl.ARRAY_BUFFER, gridXY, gl.STATIC_DRAW);
    const gridXZBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, gridXZBuf); gl.bufferData(gl.ARRAY_BUFFER, gridXZ, gl.STATIC_DRAW);
    const gridYZBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, gridYZBuf); gl.bufferData(gl.ARRAY_BUFFER, gridYZ, gl.STATIC_DRAW);

    function buildBoxEdges(L) {
        const a = [];
        function keep(x1,y1,z1, x2,y2,z2) {
            if ((x1===-L && x2===-L) || (y1===-L && y2===-L) || (z1===-L && z2===-L)) a.push(x1,y1,z1, x2,y2,z2);
        }
        keep(-L,-L,-L,  L,-L,-L); keep(-L, L,-L,  L, L,-L); keep(-L,-L, L,  L,-L, L); keep(-L, L, L,  L, L, L);
        keep(-L,-L,-L, -L, L,-L); keep( L,-L,-L,  L, L,-L); keep(-L,-L, L, -L, L, L); keep( L,-L, L,  L, L, L);
        keep(-L,-L,-L, -L,-L, L); keep( L,-L,-L,  L,-L, L); keep(-L, L,-L, -L, L, L); keep( L, L,-L,  L, L, L);
        return new Float32Array(a);
    }
    const boxEdges = buildBoxEdges(axisLen);
    const boxBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, boxBuf); gl.bufferData(gl.ARRAY_BUFFER, boxEdges, gl.STATIC_DRAW);

    // --- matrices -----------------------------------------------------------
    function mat4Identity(){const m=new Float32Array(16);m[0]=1;m[5]=1;m[10]=1;m[15]=1;return m;}
    function mat4Mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++){for(let r=0;r<4;r++){o[c*4+r]=a[0*4+r]*b[c*4+0]+a[1*4+r]*b[c*4+1]+a[2*4+r]*b[c*4+2]+a[3*4+r]*b[c*4+3];}}return o;}
    function mat4Perspective(fovy,aspect,near,far){const f=1/Math.tan(fovy/2);const m=new Float32Array(16);m[0]=f/aspect;m[5]=f;m[11]=-1;m[15]=0;m[10]=(far+near)/(near-far);m[14]=(2*far*near)/(near-far);return m;}
    function mat4Translate(x,y,z){const m=mat4Identity();m[12]=x;m[13]=y;m[14]=z;return m;}
    function mat4RotateX(a){const c=Math.cos(a),s=Math.sin(a);const m=mat4Identity();m[5]=c;m[6]=s;m[9]=-s;m[10]=c;return m;}
    function mat4RotateY(a){const c=Math.cos(a),s=Math.sin(a);const m=mat4Identity();m[0]=c;m[2]=-s;m[8]=s;m[10]=c;return m;}

    // --- interaction --------------------------------------------------------
    const initDist = 14.0, initRotX = 0.3, initRotY = -0.4;
    let dist = initDist, rotX = initRotX, rotY = initRotY;
    let dragging = false, lastX = 0, lastY = 0;

    canvas.addEventListener("pointerdown", (e) => {
        dragging = true; lastX = e.clientX; lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const rect = canvas.getBoundingClientRect();
        rotY += (e.clientX - lastX) / Math.max(1, rect.width)  * Math.PI;
        rotX += (e.clientY - lastY) / Math.max(1, rect.height) * Math.PI;
        rotX = Math.max(-Math.PI/2, Math.min(Math.PI/2, rotX));
        lastX = e.clientX; lastY = e.clientY;
        requestAnimationFrame(render);
    });
    window.addEventListener("pointerup", () => { dragging = false; });
    canvas.addEventListener("wheel", (e) => {
        const zoomGesture = e.ctrlKey || e.metaKey;
        if (!zoomGesture) return;

        e.preventDefault();
        const s = Math.exp(e.deltaY * 0.005);
        dist = Math.max(2.0, dist * s);
        requestAnimationFrame(render);
    }, { passive: false });
    canvas.addEventListener("dblclick", () => { rotX = initRotX; rotY = initRotY; dist = initDist; requestAnimationFrame(render); });

    // --- resize -------------------------------------------------------------
    const overlayCanvas = overlay; // alias
    function resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const cssH = rect.height || 360;
        const w = Math.max(1, Math.round(rect.width * dpr));
        const h = Math.max(1, Math.round(cssH      * dpr));
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w; canvas.height = h;
            gl.viewport(0, 0, w, h);
        }
        overlayCanvas.width  = w;
        overlayCanvas.height = h;
        requestAnimationFrame(render);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener("resize", resize);
    document.addEventListener("shown.bs.tab", resize, true);
    document.addEventListener("shown.bs.collapse", resize, true);

    // --- project world point -> CSS px --------------------------------------
    function projectToScreen(px, py, pz, mvp, cssW, cssH) {
        const w0 = mvp[3]*px + mvp[7]*py + mvp[11]*pz + mvp[15];
        if (w0 === 0) return null;
        const cx = (mvp[0]*px + mvp[4]*py + mvp[8]*pz + mvp[12]) / w0;
        const cy = (mvp[1]*px + mvp[5]*py + mvp[9]*pz + mvp[13]) / w0;
        const cz = (mvp[2]*px + mvp[6]*py + mvp[10]*pz + mvp[14]) / w0;
        if (w0 <= 0 || cz < -1 || cz > 1) return null;
        return { x: (cx * 0.5 + 0.5) * cssW, y: (1 - (cy * 0.5 + 0.5)) * cssH };
    }

    // --- tick labels & title helpers ----------------------------------------
    const L = axisLen;
    const sTick = tickSize * 2.0;
    function drawTickLabelOnEdge(axis, t, MVP, cssW, cssH, pxAway) {
        let base, near;
        if (axis === "x") { base=[ t, -L, +L ]; near=[ t, -L - sTick, +L + sTick ]; }
        else if (axis === "y") { base=[ +L,  t, -L ]; near=[ +L + sTick, t, -L - sTick ]; }
        else { base=[ +L, -L,  t ]; near=[ +L + sTick, -L - sTick, t ]; }
        const p = projectToScreen(base[0], base[1], base[2], MVP, cssW, cssH);
        const q = projectToScreen(near[0], near[1], near[2], MVP, cssW, cssH);
        if (!p || !q) return;
        let dx = q.x - p.x, dy = q.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        dx = (dx / len) * pxAway; dy = (dy / len) * pxAway;
        ctx2d.fillText(String(t), p.x + dx, p.y + dy);
    }
    function edgeLabelPos(axis, t, MVP, cssW, cssH, pxAway) {
        let base, near;
        if (axis === "x") { base=[ t, -L, +L ]; near=[ t, -L - sTick, +L + sTick ]; }
        else if (axis === "y") { base=[ +L,  t, -L ]; near=[ +L + sTick, t, -L - sTick ]; }
        else { base=[ +L, -L,  t ]; near=[ +L + sTick, -L - sTick, t ]; }
        const p = projectToScreen(base[0], base[1], base[2], MVP, cssW, cssH);
        const q = projectToScreen(near[0], near[1], near[2], MVP, cssW, cssH);
        if (!p || !q) return null;
        let dx = q.x - p.x, dy = q.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        dx = (dx / len) * pxAway; dy = (dy / len) * pxAway;
        return { x: p.x + dx, y: p.y + dy };
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

    // ---------- render -------------------------------------------------------
    function render() {
        const dpr = window.devicePixelRatio || 1;

        gl.enable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.clearColor(STYLE.clear[0], STYLE.clear[1], STYLE.clear[2], STYLE.clear[3]);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        const rect = canvas.getBoundingClientRect();
        const cssW = Math.max(1, rect.width);
        const cssH = Math.max(1, rect.height);

        const P  = mat4Perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100.0);
        const V  = mat4Translate(0, 0, -dist);
        const Rx = mat4RotateX(rotX);
        const Ry = mat4RotateY(rotY);
        const M  = mat4Mul(Ry, Rx);
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

        const primitive = getSelectedPrimitive();

        // POINTS ONLY
        if (primitive === 'point') {
            gl.useProgram(progPoints);
            gl.bindBuffer(gl.ARRAY_BUFFER, vboCube);
            gl.vertexAttribPointer(loc.points.a_position, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(loc.points.a_position);
            gl.uniformMatrix4fv(loc.points.u_mvp, false, MVP);
            gl.uniform4f(
                loc.points.u_color,
                STYLE.point[0], STYLE.point[1], STYLE.point[2], STYLE.point[3]
            );
            // slightly larger for visibility; scaled by DPR
            gl.uniform1f(loc.points.u_pointSize, Math.max(4.0, 6.0 * (window.devicePixelRatio || 1)));
            gl.drawArrays(gl.POINTS, 0, vertices.length / 3);

        // LINES + POINTS
        } else if (primitive === 'line') {
            // 1) edges
            gl.useProgram(progLines);
            gl.bindBuffer(gl.ARRAY_BUFFER, vboCube);
            gl.vertexAttribPointer(loc.lines.a_position, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(loc.lines.a_position);
            gl.uniformMatrix4fv(loc.lines.u_mvp, false, MVP);
            gl.uniform4f(
                loc.lines.u_color,
                STYLE.cube[0], STYLE.cube[1], STYLE.cube[2], STYLE.cube[3]
            );
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, eboCube);
            gl.drawElements(gl.LINES, edges.length, gl.UNSIGNED_SHORT, 0);

            // 2) overlay vertices as points for clarity
            gl.useProgram(progPoints);
            gl.bindBuffer(gl.ARRAY_BUFFER, vboCube);
            gl.vertexAttribPointer(loc.points.a_position, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(loc.points.a_position);
            gl.uniformMatrix4fv(loc.points.u_mvp, false, MVP);
            gl.uniform4f(
                loc.points.u_color,
                STYLE.point[0], STYLE.point[1], STYLE.point[2], STYLE.point[3]
            );
            gl.uniform1f(loc.points.u_pointSize, Math.max(4.0, 5.0 * (window.devicePixelRatio || 1)));
            gl.drawArrays(gl.POINTS, 0, vertices.length / 3);

        } else if (primitive === 'triangle') {
            // --- draw textured triangles using UVs (NO INDICES) ---
            gl.useProgram(progTrisTex);
            gl.uniformMatrix4fv(locTex.u_mvp, false, MVP);
        
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, checkerTex);   // or any image you loaded
            gl.uniform1i(locTex.u_tex, 0);
        
            // positions
            gl.bindBuffer(gl.ARRAY_BUFFER, vboCubeTri);
            gl.vertexAttribPointer(locTex.a_position, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(locTex.a_position);
        
            // uvs
            gl.bindBuffer(gl.ARRAY_BUFFER, uvboCubeTri);
            gl.vertexAttribPointer(locTex.a_uv, 2, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(locTex.a_uv);
        
            // 36 vertices -> 12 triangles
            gl.drawArrays(gl.TRIANGLES, 0, 36);
        
            // --- overlay the original wireframe edges for clarity ---
            gl.useProgram(progLines);
            gl.uniformMatrix4fv(loc.lines.u_mvp, false, MVP);
            gl.uniform4f(loc.lines.u_color, STYLE.frame[0], STYLE.frame[1], STYLE.frame[2], STYLE.frame[3]);
        
            gl.bindBuffer(gl.ARRAY_BUFFER, vboCube);
            gl.vertexAttribPointer(loc.lines.a_position, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(loc.lines.a_position);
        
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, eboCube);
            gl.drawElements(gl.LINES, edges.length, gl.UNSIGNED_SHORT, 0);
        } else {
            console.error('no primtive selected!')
            return;
        }

        // ---------- generalized primitives ----------
        for (const o of compiled) {
            gl.useProgram(o.program);

            // common: MVP
            if (o.locations.u_mvp) gl.uniformMatrix4fv(o.locations.u_mvp, false, MVP);

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
        if (ctx2d.resetTransform) ctx2d.resetTransform(); else ctx2d.setTransform(1,0,0,1,0,0);
        ctx2d.clearRect(0, 0, overlay.width, overlay.height);
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Tick labels
        ctx2d.save();
        ctx2d.fillStyle = STYLE.ticks;
        ctx2d.font = `${STYLE.labelPx}px ${STYLE.fontFamily}`;
        ctx2d.textAlign = "center";
        ctx2d.textBaseline = "middle";
        for (let t = -axisLen; t <= axisLen; t += tickStep) {
            drawTickLabelOnEdge("x", t, MVP, cssW, cssH, 12);
            drawTickLabelOnEdge("y", t, MVP, cssW, cssH, 12);
            drawTickLabelOnEdge("z", t, MVP, cssW, cssH, 12);
        }
        ctx2d.restore();

        // Axis titles
        ctx2d.save();
        ctx2d.font = `${STYLE.titleWeight} ${STYLE.titlePx}px ${STYLE.fontFamily}`;
        const titleOutward = 20, titleBelow = 18, titleRight = 14;
        const posX = edgeLabelPos("x", 0, MVP, cssW, cssH, titleOutward);
        if (posX) ctx2d.fillText(AXIS_TITLE.x, posX.x, posX.y + titleBelow);
        const posY = edgeLabelPos("y", 0, MVP, cssW, cssH, titleOutward);
        if (posY) { const prev = ctx2d.textAlign; ctx2d.textAlign = "left"; ctx2d.fillText(AXIS_TITLE.y, posY.x + titleRight, posY.y); ctx2d.textAlign = prev; }
        const posZ = edgeLabelPos("z", 0, MVP, cssW, cssH, titleOutward);
        if (posZ) ctx2d.fillText(AXIS_TITLE.z, posZ.x, posZ.y + titleBelow);
        ctx2d.restore();
    }

    requestAnimationFrame(() => { resize(); render(); });
}
