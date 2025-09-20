/*
 Radial Bar Chart plugin for Chart.js

 Usage:
 new Chart(ctx, {
   type: 'doughnut', // base type doesn't matter; plugin draws its own visualization
   data: {
     labels: ['A', 'B', 'C', 'D'],
     datasets: [{ data: [35, 70, 55, 90] }]
   },
   options: {
     plugins: {
       radialBar: {
         enabled: true,
         // configuration (all optional)
         startAngle: -90,         // degrees
         totalAngle: 360,         // degrees span for bars
         max: null,               // max value; if null uses max(data)
         innerRadius: 20,         // px from center for innermost bar start
         barThickness: 18,        // px ring thickness
         barSpacing: 8,           // px gap between bars
         trackColor: 'rgba(0,0,0,0.06)', // ring background
         colors: null,            // array of bar colors, auto if null
         roundedCaps: true,       // draw rounded ends
         showLabels: true,        // draw labels
         labelColor: '#444',
         valueColor: '#111',
         labelFont: { family: 'Arial, sans-serif', size: 11, style: '', weight: '' },
         valueFont: { family: 'Arial, sans-serif', size: 12, style: 'normal', weight: 'bold' },
         labelFormat: (label, value, max) => label, // function or string pattern
         valueFormat: (value, max) => String(value),
       }
     }
   }
 });
 */
(function () {
    if (!window || !window.Chart) return;

    const TAU = Math.PI * 2;
    const toRad = (deg) => deg * Math.PI / 180;

    const defaultPalette = [
        '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
        '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab'
    ];

    const plugin = {
        id: 'radialBarPlugin',
        afterDraw(chart, args, opts) {
            const cfg = chart?.options?.plugins?.radialBar;
            if (!cfg || !cfg.enabled) return;

            // Safely get data
            const ds = chart.data?.datasets?.[0];
            const values = (ds && Array.isArray(ds.data)) ? ds.data.map(Number) : [];
            const labels = Array.isArray(chart.data?.labels) ? chart.data.labels : values.map((_, i) => String(i + 1));
            if (!values.length) return;

            const ctx = chart.ctx;
            const {left, right, top, bottom} = chart.chartArea;
            const cx = (left + right) / 2;
            const cy = (top + bottom) / 2;
            // radius budget: from center to min edge minus padding
            const maxRadius = Math.max(0, Math.min(right - left, bottom - top) / 2);

            // Options with defaults
            const startAngleDeg = isFinite(cfg.startAngle) ? cfg.startAngle : -90;
            const totalAngleDeg = isFinite(cfg.totalAngle) ? cfg.totalAngle : 360;
            const startAngle = toRad(startAngleDeg);
            const totalAngle = toRad(totalAngleDeg);
            const n = values.length;
            const innerRadius = Math.min(maxRadius, Math.max(0, Number(cfg.innerRadius ?? 16)));
            const thickness = Math.max(2, Number(cfg.barThickness ?? 14));
            const spacing = Math.max(0, Number(cfg.barSpacing ?? 6));
            const roundedCaps = cfg.roundedCaps !== false;
            const trackColor = cfg.trackColor ?? 'rgba(0,0,0,0.05)';
            const colors = Array.isArray(cfg.colors) && cfg.colors.length ? cfg.colors : defaultPalette;
            const showLabels = cfg.showLabels !== false;
            const labelColor = cfg.labelColor ?? '#444';
            const valueColor = cfg.valueColor ?? '#111';
            const labelFont = normalizeFont(cfg.labelFont, {
                family: defaultFontFamily(ctx),
                size: 11,
                style: '',
                weight: ''
            });
            const valueFont = normalizeFont(cfg.valueFont, {
                family: defaultFontFamily(ctx),
                size: 12,
                style: 'normal',
                weight: 'bold'
            });

            const maxValue = isFinite(cfg.max) && cfg.max > 0 ? cfg.max : Math.max(...values);
            const ringsHeight = n * thickness + (n - 1) * spacing;
            const usableRadius = Math.max(0, maxRadius - innerRadius);
            const neededRadius = ringsHeight;
            const scale = neededRadius > 0 ? Math.min(1, usableRadius / neededRadius) : 1;

            // Draw each ring from inner to outer
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(0);
            ctx.lineCap = roundedCaps ? 'round' : 'butt';

            for (let i = 0; i < n; i++) {
                const r0 = innerRadius + (i * (thickness + spacing)) * scale;
                const r1 = r0 + thickness * scale;
                const rMid = (r0 + r1) / 2;
                const radius = rMid;
                const v = Math.max(0, values[i] ?? 0);
                const frac = maxValue > 0 ? Math.min(1, v / maxValue) : 0;
                const sweep = totalAngle * frac;
                const endAngle = startAngle + sweep;

                // Track ring (full arc)
                if (trackColor) {
                    ctx.beginPath();
                    ctx.strokeStyle = trackColor;
                    ctx.lineWidth = (r1 - r0);
                    ctx.arc(0, 0, radius, startAngle, startAngle + totalAngle);
                    ctx.stroke();
                }

                // Bar arc
                ctx.beginPath();
                ctx.strokeStyle = colors[i % colors.length];
                ctx.lineWidth = (r1 - r0);
                if (sweep > 0) {
                    ctx.arc(0, 0, radius, startAngle, endAngle);
                    ctx.stroke();
                }

                // Labels
                if (showLabels) {
                    const label = (labels[i] ?? '').toString();
                    const labelText = formatMaybe(cfg.labelFormat, label, v, maxValue);
                    const valueText = formatMaybe(cfg.valueFormat, v, maxValue, label);

                    const textAngle = startAngle + Math.max(sweep, toRad(1)) / 2; // center of arc or small offset
                    const tx = Math.cos(textAngle) * (radius);
                    const ty = Math.sin(textAngle) * (radius);

                    // Draw label above value slightly towards center
                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    // label
                    if (labelText) {
                        ctx.font = toFontString(labelFont);
                        ctx.fillStyle = labelColor;
                        ctx.fillText(labelText, tx, ty - Math.max(10, (r1 - r0) * 0.15));
                    }

                    // value
                    if (valueText) {
                        ctx.font = toFontString(valueFont);
                        ctx.fillStyle = valueColor;
                        ctx.fillText(valueText, tx, ty + Math.max(0, (r1 - r0) * 0.15));
                    }

                    ctx.restore();
                }
            }

            ctx.restore();
        }
    };

    function defaultFontFamily(ctx) {
        // try Chart.js defaults if available
        try {
            return (window.Chart.defaults?.font?.family) || ctx.font?.split(',')?.[0] || 'Arial, sans-serif';
        } catch (e) {
            return 'Arial, sans-serif';
        }
    }

    function normalizeFont(font, fallback) {
        const f = font || {};
        return {
            family: f.family || fallback.family,
            size: isFinite(f.size) ? f.size : fallback.size,
            style: f.style || fallback.style || 'normal',
            weight: f.weight || fallback.weight || 'normal'
        };
    }

    function toFontString(f) {
        return `${f.style || 'normal'} ${f.weight || 'normal'} ${Math.round(f.size)}px ${f.family}`;
    }

    function isFinite(x) {
        return typeof x === 'number' && Number.isFinite(x);
    }

    function formatMaybe(fmt, value, max, label) {
        if (typeof fmt === 'function') return fmt(value, max, label);
        if (typeof fmt === 'string') {
            return fmt
                .replace(/\{label\}/g, String(label ?? ''))
                .replace(/\{value\}/g, String(value ?? ''))
                .replace(/\{max\}/g, String(max ?? ''));
        }
        return value == null ? '' : String(value);
    }

    // Register globally
    try {
        window.Chart.register(plugin);
        // Expose for debugging
        window.RadialBarChartPlugin = plugin;
    } catch (e) {
        // ignore
    }
})();
