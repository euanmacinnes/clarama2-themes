/*
 * # Copyright (c) 2025. Euan Duncan Macinnes, euan.d.macinnes@gmail.com, S7479622B - All Rights Reserved
 */

/**
 * Clarama Streaming Data Chart (Chart.js)
 *
 * Provides bChartStream(chart_id, options) which subscribes to a Clarama websocket
 * topic and incrementally appends points to a Chart.js chart as chunks arrive.
 *
 * Expected stream frames (byrow orientation):
 *  - { type: 'start', cols: [...], info: {...} }
 *  - { type: 'chunk', chunk_no: N, rows: [[...], ...] }
 *  - { type: 'end', last_chunk_no?: N }
 *  - { type: 'error', error: '...' }
 *
 * Usage:
 *  bChartStream('canvas_id', {
 *     topic: 'my_topic',
 *     x_col: 'time',
 *     y_cols: ['value'], // or multiple series
 *     chart_type: 'line', // default
 *     chart_options: { ... } // optional Chart.js config overrides
 *  })
 */

(function (global) {
    'use strict';

    class ClaramaStreamAssembler {
        constructor(onRows) {
            this.onRows = onRows;
            this.nextExpected = 0;
            this.buffer = new Map();
        }

        reset() {
            this.nextExpected = 0;
            this.buffer.clear();
        }

        onChunk(chunk) {
            const n = Number(chunk.chunk_no ?? 0);
            if (n === this.nextExpected) {
                const rows = Array.isArray(chunk.rows) ? chunk.rows : [];
                this.onRows(rows, chunk);
                this.nextExpected++;
                while (this.buffer.has(this.nextExpected)) {
                    const ch = this.buffer.get(this.nextExpected);
                    this.buffer.delete(this.nextExpected);
                    const r = Array.isArray(ch.rows) ? ch.rows : [];
                    this.onRows(r, ch);
                    this.nextExpected++;
                }
            } else if (n > this.nextExpected) {
                this.buffer.set(n, chunk);
            }
        }
    }

    // Light port of ChartSeriesFormat from non-streaming charts
    function ChartSeriesFormat(dataset, formats, index = 0) {
        const palette = defaultColors;
        const color = palette[index % palette.length];
        dataset.borderColor = dataset.borderColor || color;
        dataset.backgroundColor = dataset.backgroundColor || color;
        if (!formats || !Array.isArray(formats) || !formats.length) {
            dataset.fill = dataset.fill ?? false;
            dataset.stepped = dataset.stepped ?? false;
            dataset.pointRadius = dataset.pointRadius ?? 3;
            dataset.borderWidth = dataset.borderWidth ?? 2;
            return dataset;
        }
        const id = dataset.id || dataset.label || '';
        for (let f = 0; f < formats.length; f++) {
            const fmt = formats[f] || {};
            let match = false;
            if (fmt['format-nrx'] === id) {
                match = true;
            } else if (fmt['format-nrx']) {
                try {
                    match = new RegExp(fmt['format-nrx']).test(id);
                } catch (e) {
                    match = false;
                }
            }
            if (match) {
                const lw = (fmt['format-lw'] === undefined || fmt['format-lw'] === '') ? 2 : fmt['format-lw'];
                const pr = (fmt['format-pr'] === undefined || fmt['format-pr'] === '') ? 3 : fmt['format-pr'];
                const ps = (fmt['format-ps'] === undefined || fmt['format-ps'] === '') ? 'circle' : fmt['format-ps'];
                dataset.fill = fmt['format-f'];
                dataset.stepped = fmt['format-p'];
                dataset.pointRadius = pr;
                dataset.pointStyle = ps;
                dataset.borderWidth = lw;
                dataset.unitAxis = fmt['format-ua'];
                if (fmt['format-type']) dataset.type = fmt['format-type'];
                if (fmt['format-title']) dataset.label = fmt['format-title'];
                if (fmt['format-col']) {
                    const col = chartColors && chartColors[fmt['format-col']] ? chartColors[fmt['format-col']] : fmt['format-col'];
                    if (col) dataset.borderColor = col;
                }
                if (fmt['format-col-back']) {
                    const colb = chartColors && chartColors[fmt['format-col-back']] ? chartColors[fmt['format-col-back']] : fmt['format-col-back'];
                    if (colb) dataset.backgroundColor = colb;
                }
                break;
            }
        }
        return dataset;
    }

    // Simple color palette fallback
    const defaultColors = [
        '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe',
        '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080'
    ];

    const axis_type_map = {
        'time': 'time',
        'timeseries': 'timeseries',
        'linear': 'linear',
        'logarithmic': 'logarithmic',
        'category': 'category',
        'category_grouped': 'category',
        'category_bulk': 'category'
    };

    function getAxisScaleType(axisId) {
        try {
            if (!chart || !chart.options || !chart.options.scales) return undefined;
            const key = axisId || 'y';
            const sc = chart.options.scales[key];
            return sc && sc.type;
        } catch (e) {
            return undefined;
        }
    }

    function isLogScaleForDataset(ds) {
        const axisId = ds && ds.yAxisID ? ds.yAxisID : 'y';
        return getAxisScaleType(axisId) === 'logarithmic';
    }

    function ensureCategoryLabel(label) {
        if (!chart) return -1;
        const data = chart.data || (chart.data = {});
        const labels = data.labels || (data.labels = []);
        let idx = labels.indexOf(label);
        if (idx === -1) {
            labels.push(label);
            idx = labels.length - 1;
            // pad all datasets to new labels length - ensure matching x for each index
            const dsets = data.datasets || [];
            for (const ds of dsets) {
                while (ds.data.length < labels.length) {
                    const l = labels[ds.data.length];
                    ds.data.push({x: l, y: null});
                }
            }
        }
        return idx;
    }

    function setDatasetValueAt(ds, catIdx, label, y, lval, zval) {
        if (!chart) return;
        const labels = chart.data.labels || [];
        while (ds.data.length < labels.length) {
            const l = labels[ds.data.length];
            ds.data.push({x: l, y: null});
        }
        const pt = {x: label, y: y};
        if (lval !== undefined) pt.l = lval;
        if (zval !== undefined) pt.r = Number(zval);
        ds.data[catIdx] = pt;
    }

    // Compute an optimal time step for the current zoom range and canvas width
    function computeTimeStep(rangeMs, widthPx) {
        const targetPoints = Math.max(50, Math.min(1000, Math.floor(widthPx / 3))); // aim ~1 point per 3px
        const rawStep = rangeMs / targetPoints;
        // snap to friendly units
        const units = [
            {name: 'millisecond', ms: 1},
            {name: '5 milliseconds', ms: 5},
            {name: '10 milliseconds', ms: 10},
            {name: '50 milliseconds', ms: 50},
            {name: '100 milliseconds', ms: 100},
            {name: '250 milliseconds', ms: 250},
            {name: '500 milliseconds', ms: 500},
            {name: 'second', ms: 1000},
            {name: '5 seconds', ms: 5000},
            {name: '10 seconds', ms: 10000},
            {name: '15 seconds', ms: 15000},
            {name: '30 seconds', ms: 30000},
            {name: 'minute', ms: 60000},
            {name: '2 minutes', ms: 120000},
            {name: '5 minutes', ms: 300000},
            {name: '10 minutes', ms: 600000},
            {name: '15 minutes', ms: 900000},
            {name: '30 minutes', ms: 1800000},
            {name: 'hour', ms: 3600000},
            {name: '2 hours', ms: 7200000},
            {name: '3 hours', ms: 10800000},
            {name: '6 hours', ms: 21600000},
            {name: '12 hours', ms: 43200000},
            {name: 'day', ms: 86400000},
            {name: '2 days', ms: 172800000},
            {name: '7 days', ms: 604800000},
            {name: '14 days', ms: 1209600000},
            {name: 'month', ms: 2629800000},
            {name: '3 months', ms: 7889400000},
            {name: '6 months', ms: 15778800000},
            {name: 'year', ms: 31557600000}
        ];
        let best = units[0];
        for (const u of units) {
            if (u.ms >= rawStep) {
                best = u;
                break;
            }
        }
        return {stepMs: best.ms, unitName: best.name, targetPoints};
    }

    function bChartStream(chart_id, options) {
        if (!global.Chart) {
            console.error('Chart.js not found');
        }
        const singleTopic = options && options.topic;
        const sourceTopicsOpt = options && options.source_topics; // array aligned to series-groups OR map {series_tab: topic}
        if (!singleTopic && !sourceTopicsOpt) throw new Error('bChartStream requires options.topic or options.source_topics');

        const canvas = document.getElementById(chart_id);
        const ctx = canvas.getContext('2d');
        let chart = null;

        // Track multiple topic registrations and per-topic state
        const registrations = []; // list of unregister fns
        const topicStates = new Map(); // topic -> { cols, assembler, sgIndex, pushRows }

        // Shared datasets across topics
        const datasets = [];
        const datasetIndexByKey = new Map();

        function ensureYAxisForUnit(unitVal) {
            if (!chart) return null;
            if (unitVal === undefined || unitVal === null || unitVal === '') return null;
            const axisId = 'y_' + String(unitVal);
            const scales = chart.options.scales || (chart.options.scales = {});
            if (!scales[axisId]) {
                const prev = chart._claramaUnitLastSide || 'right';
                const nextSide = (prev === 'left') ? 'right' : 'left';
                chart._claramaUnitLastSide = nextSide;
                scales[axisId] = {type: 'linear', beginAtZero: false, position: nextSide};
            }
            return axisId;
        }

        // Helpers from initial config (may be overridden by start frame chart config)
        const baseChartCfg = options.chart || {};
        const xaxisTypeDefault = baseChartCfg['xaxis-type'] || options.xaxisType || 'time';
        const legendDefault = baseChartCfg['legend'];
        const annotationsDefault = baseChartCfg['annotations'] || baseChartCfg['chart-annotations'];
        const seriesFormatsDefault = baseChartCfg['series-formats'] || [];
        const seriesGroupsDefault = Array.isArray(baseChartCfg['series-groups']) ? baseChartCfg['series-groups'] : [];
        const chartTypeDefault = options.chart_type || baseChartCfg['chart-type'] || 'line';
        const chartOptionsOverrideDefault = options.chart_options || baseChartCfg['chart-options'] || {};

        function ensureDataset(key, baseLabel, baseColorIndex, formatsArg, groupSeriesType) {
            if (datasetIndexByKey.has(key)) return datasetIndexByKey.get(key);
            const color = defaultColors[datasets.length % defaultColors.length];
            const ds = {
                id: key,
                label: baseLabel || key,
                data: [],
                borderColor: color,
                backgroundColor: color,
                fill: false,
                pointRadius: 3,
                tension: 0.1
            };
            // Apply series formats (start-provided or defaults)
            ChartSeriesFormat(ds, formatsArg || seriesFormatsDefault, datasets.length);
            if (groupSeriesType && !ds.type) ds.type = groupSeriesType;
            // If unitAxis provided by formats, bind/create axis now
            if (ds.unitAxis) {
                const yid = ensureYAxisForUnit(ds.unitAxis);
                if (yid) ds.yAxisID = yid;
            }
            datasets.push(ds);
            const idx = datasets.length - 1;
            datasetIndexByKey.set(key, idx);
            return idx;
        }

        // Heuristic: detect if a value should be converted to a Date
        function toDateMaybe(val) {
            if (val === null || val === undefined) return val;
            if (val instanceof Date) return val;
            // Strings: try ISO or Date.parse-able with light normalization
            if (typeof val === 'string') {
                // Quick reject for empty or obviously non-date short strings
                if (val.length < 4) return val;
                let s = val.trim();
                // Normalize space-separated to ISO T
                if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?$/.test(s)) {
                    s = s.replace(' ', 'T');
                }
                // If ISO-like without timezone, assume Z (UTC)
                if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?$/.test(s)) {
                    s = s + 'Z';
                }
                // Handle +00:00 without colon
                if (/^.+[\+\-]\d{2}$/.test(s)) {
                    s = s + ':00';
                }
                const t = Date.parse(s);
                if (!isNaN(t)) return new Date(t);
                return val;
            }
            // Numbers: treat as epoch seconds/millis
            if (typeof val === 'number' && isFinite(val)) {
                if (val > 1e12) return new Date(val);            // ms since epoch
                if (val > 1e9) return new Date(val * 1000);      // sec since epoch
                return val;
            }
            return val;
        }

        function buildPushRowsForGroup(topic, cols, sg, globalFormats, isTimeScale) {
            // Determine indices
            const x_name = sg['series-x'] || cols[0];
            const y_name = sg['series-y'] || cols[1];
            const s_name = sg['series-s'];
            const l_name = sg['series-l'];
            const z_name = sg['series-z'];
            const group_series_type = sg['series-type'];
            const tab_no = (sg['series-tab'] !== undefined && sg['series-tab'] !== null) ? sg['series-tab'] : 0;

            const xi = cols.indexOf(x_name);
            const yi = cols.indexOf(y_name);
            const si = s_name ? cols.indexOf(s_name) : -1;
            const li = l_name ? cols.indexOf(l_name) : -1;
            const zi = z_name ? cols.indexOf(z_name) : -1;

            // Determine if x column name suggests a date/time
            const nameImpliesDate = (x_name || '').toString().match(/date|time|timestamp|dt|ts/i) !== null;

            // Pre-create single-series dataset if no series-s
            if (si < 0 && yi >= 0) {
                ensureDataset(`d${tab_no}:${y_name}`, `${y_name} [${tab_no}]`, 0, globalFormats, group_series_type);
            }

            return function pushRows(rows, chunk) {
                if (!chart) return;
                const sv = chunk && chunk.sv !== undefined ? chunk.sv : undefined;
                const uv = chunk && chunk.uv !== undefined ? chunk.uv : undefined;

                // On first chunk processed by this chart: if no Unit axis provided,
                // create the default 'y' axis. Otherwise, rely on unit-specific axes.
                try {
                    if (!chart._claramaFirstChunkHandled) {
                        const scales = chart.options.scales || (chart.options.scales = {});
                        const hasDefaultY = !!scales.y;
                        const hasUnit = (uv !== undefined && uv !== null && String(uv) !== '');
                        if (!hasDefaultY && !hasUnit) {
                            scales.y = {type: 'linear', beginAtZero: false};
                            chart._claramaDefaultYCreated = true;
                            if (typeof chart.update === 'function') chart.update('none');
                        }
                        chart._claramaFirstChunkHandled = true;
                    }
                } catch (e) { /* noop */
                }

                const axisId = (uv !== undefined && uv !== null && uv !== '') ? ensureYAxisForUnit(uv) : null;

                for (const r of rows) {
                    let xv = xi >= 0 ? r[xi] : r[0];
                    if (isTimeScale || nameImpliesDate) {
                        xv = toDateMaybe(xv);
                    }
                    if (yi >= 0) {
                        if (sv !== undefined && sv !== null && sv !== '') {
                            const lbl = String(sv);
                            const key = `d${tab_no}:${y_name}::sv:${lbl}`;
                            const idx = ensureDataset(key, lbl, undefined, globalFormats, group_series_type);
                            const ds = chart.data.datasets[idx];
                            if (group_series_type && !ds.type) ds.type = group_series_type;
                            if (ds.unitAxis && !axisId) {
                                const ya = ensureYAxisForUnit(ds.unitAxis);
                                if (ya) ds.yAxisID = ya;
                            } else if (axisId) {
                                ds.yAxisID = axisId;
                            }
                            let yv = r[yi];
                            if (isLogScaleForDataset(ds) && !(yv > 0)) yv = null;
                            const catMode = chart && (chart._claramaXAxisTypeName === 'category_grouped' || chart._claramaXAxisTypeName === 'category_bulk');
                            if (catMode) {
                                const catLabel = String(xv);
                                const catIdx = ensureCategoryLabel(catLabel);
                                setDatasetValueAt(ds, catIdx, catLabel, yv, (li >= 0 ? r[li] : undefined), (zi >= 0 ? r[zi] : undefined));
                            } else {
                                const point = {x: xv, y: yv};
                                if (li >= 0) point.l = r[li];
                                if (zi >= 0) point.r = Number(r[zi]);
                                ds.data.push(point);
                            }
                        } else if (si >= 0) {
                            const kval = r[si];
                            const lbl = (li >= 0 ? r[li] : `${y_name}:${kval} [${tab_no}]`);
                            const key = `d${tab_no}:${y_name}::${kval}`;
                            const idx = ensureDataset(key, lbl, undefined, globalFormats, group_series_type);
                            const ds = chart.data.datasets[idx];
                            if (group_series_type && !ds.type) ds.type = group_series_type;
                            if (ds.unitAxis && !axisId) {
                                const ya = ensureYAxisForUnit(ds.unitAxis);
                                if (ya) ds.yAxisID = ya;
                            } else if (axisId) {
                                ds.yAxisID = axisId;
                            }
                            let yv = r[yi];
                            if (isLogScaleForDataset(ds) && !(yv > 0)) yv = null;
                            const catMode = chart && (chart._claramaXAxisTypeName === 'category_grouped' || chart._claramaXAxisTypeName === 'category_bulk');
                            if (catMode) {
                                const catLabel = String(xv);
                                const catIdx = ensureCategoryLabel(catLabel);
                                setDatasetValueAt(ds, catIdx, catLabel, yv, (li >= 0 ? r[li] : undefined), (zi >= 0 ? r[zi] : undefined));
                            } else {
                                const point = {x: xv, y: yv};
                                if (li >= 0) point.l = r[li];
                                if (zi >= 0) point.r = Number(r[zi]);
                                ds.data.push(point);
                            }
                        } else {
                            const key = `d${tab_no}:${y_name}`;
                            const idx = ensureDataset(key, `${y_name} [${tab_no}]`, undefined, globalFormats, group_series_type);
                            const ds = chart.data.datasets[idx];
                            if (group_series_type && !ds.type) ds.type = group_series_type;
                            if (ds.unitAxis && !axisId) {
                                const ya = ensureYAxisForUnit(ds.unitAxis);
                                if (ya) ds.yAxisID = ya;
                            } else if (axisId) {
                                ds.yAxisID = axisId;
                            }
                            let yv = r[yi];
                            if (isLogScaleForDataset(ds) && !(yv > 0)) yv = null;
                            const catMode = chart && (chart._claramaXAxisTypeName === 'category_grouped' || chart._claramaXAxisTypeName === 'category_bulk');
                            if (catMode) {
                                const catLabel = String(xv);
                                const catIdx = ensureCategoryLabel(catLabel);
                                setDatasetValueAt(ds, catIdx, catLabel, yv, (li >= 0 ? r[li] : undefined), (zi >= 0 ? r[zi] : undefined));
                            } else {
                                const point = {x: xv, y: yv};
                                if (li >= 0) point.l = r[li];
                                if (zi >= 0) point.r = Number(r[zi]);
                                ds.data.push(point);
                            }
                        }
                    }
                }
            }
        }

        function initChartIfNeeded(startChartCfg, xScaleOverride, xAxisTypeName) {
            if (chart) return;
            const xaxisType = startChartCfg['xaxis-type'] || xaxisTypeDefault || 'time';
            const cfgScale = axis_type_map[xaxisType] || 'time';
            const x_scale_type = xScaleOverride || cfgScale;
            const isTime = x_scale_type === 'time';
            const legend_display = (startChartCfg['legend'] === undefined) ? (legendDefault === undefined ? true : (legendDefault !== 'Off')) : (startChartCfg['legend'] !== 'Off');
            const annotations = startChartCfg['annotations'] || startChartCfg['chart-annotations'] || annotationsDefault;
            let aspect_ratio = startChartCfg['aspect_ratio'] || baseChartCfg['aspect_ratio'];
            let maintain = false;
            if (isNaN(aspect_ratio) || !aspect_ratio) {
                aspect_ratio = 2.5;
                maintain = true;
            }

            const data = {datasets};
            // Persist axis type name for downstream logic (e.g., category_grouped/bulk behaviors)
            try {
                chart && (chart._claramaXAxisTypeName = xAxisTypeName || (startChartCfg['xaxis-type'] || xaxisTypeDefault || 'time'));
            } catch (e) {
            }
            try {
                if (xAxisTypeName === 'category_grouped' || xAxisTypeName === 'category_bulk' || xaxisType === 'category_grouped' || xaxisType === 'category_bulk') {
                    if (!data.labels) data.labels = [];
                }
            } catch (e) {
            }
            const baseOptions = {
                // Enable index-based parsing for category alignment when labels are provided
                parsing: true,
                maintainAspectRatio: maintain,
                aspectRatio: aspect_ratio,
                scales: {
                    x: {
                        type: x_scale_type,
                        time: (x_scale_type === 'time' || x_scale_type === 'timeseries') ? {unit: 'auto'} : undefined
                    }
                    // Intentionally omit default 'y' axis at start; will be created on first chunk if needed
                },
                plugins: {
                    legend: {display: legend_display},
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                try {
                                    const dsLabel = context.dataset && context.dataset.label ? context.dataset.label + ': ' : '';
                                    const y = context.parsed && context.parsed.y != null ? context.parsed.y : (context.raw && context.raw.y);
                                    const l = context.raw && context.raw.l ? String(context.raw.l) : '';
                                    return l ? (dsLabel + y + ' (' + l + ')') : (dsLabel + y);
                                } catch (e) {
                                    return undefined;
                                }
                            }
                        }
                    },
                    zoom: isTime ? {
                        pan: {enabled: true, mode: 'x', modifierKey: 'ctrl'},
                        zoom: {
                            wheel: {enabled: true, modifierKey: 'ctrl'},
                            drag: {
                                enabled: true,
                                borderColor: 'rgb(54, 162, 235)',
                                borderWidth: 1,
                                backgroundColor: 'rgba(54, 162, 235, 0.3)'
                            },
                            mode: 'x',
                            onZoomComplete: ({chart}) => {
                                try {
                                    const scale = chart.scales.x;
                                    const min = scale.min;
                                    const max = scale.max;
                                    if (min == null || max == null) return;
                                    const rangeMs = (new Date(max)).valueOf() - (new Date(min)).valueOf();
                                    const widthPx = canvas.clientWidth || canvas.width || 800;
                                    const {stepMs, unitName, targetPoints} = computeTimeStep(rangeMs, widthPx);
                                    const detail = {
                                        start: new Date(min),
                                        end: new Date(max),
                                        startISO: new Date(min).toISOString(),
                                        endISO: new Date(max).toISOString(),
                                        rangeMs,
                                        widthPx,
                                        stepMs,
                                        unitName,
                                        targetPoints,
                                        restartStream
                                    };
                                    const evt = new CustomEvent('clarama:zoom-range', {detail});
                                    canvas.dispatchEvent(evt);
                                    if (options && typeof options.onZoomRefetch === 'function') {
                                        options.onZoomRefetch(detail);
                                    }
                                } catch (e) {
                                    console.error('zoom compute failed', e);
                                }
                            },
                            onZoomReset: ({chart}) => {
                                try {
                                    const evt = new CustomEvent('clarama:zoom-reset', {detail: {restartStream}});
                                    canvas.dispatchEvent(evt);
                                    if (options && typeof options.onZoomReset === 'function') options.onZoomReset({restartStream});
                                } catch (e) {
                                }
                            }
                        }
                    } : undefined
                }
            };
            if (annotations) {
                baseOptions.plugins = baseOptions.plugins || {};
                baseOptions.plugins.annotation = baseOptions.plugins.annotation || {};
                baseOptions.plugins.annotation.annotations = annotations;
            }
            const chart_type = startChartCfg['chart-type'] || chartTypeDefault;
            const chart_options_override = startChartCfg['chart-options'] || chartOptionsOverrideDefault;
            // Merge predefined scales from startChartCfg if provided (enables predefined custom y-axes)
            if (startChartCfg && startChartCfg.scales && typeof startChartCfg.scales === 'object') {
                baseOptions.scales = Object.assign({}, baseOptions.scales, startChartCfg.scales);
            }
            const cfg = {type: chart_type, data, options: Object.assign({}, baseOptions, chart_options_override)};
            chart = new Chart(ctx, cfg);
        }

        function onMessageFrameFactory(boundTopic, sgIndex) {
            return function onMessageFrame(msg) {
                const type = msg && msg.type;
                if (!type) return;
                let state = topicStates.get(boundTopic);
                if (!state) {
                    state = {
                        cols: [], assembler: null, sgIndex: sgIndex, pushRows: function () {
                        }
                    };
                    topicStates.set(boundTopic, state);
                }
                if (type === 'start') {
                    state.cols = Array.isArray(msg.cols) ? msg.cols : [];
                    const startInfo = msg.info || {};
                    const startChartCfg = startInfo.chart || baseChartCfg || {};
                    const series_groups = Array.isArray(startChartCfg['series-groups']) ? startChartCfg['series-groups'] : seriesGroupsDefault;

                    // Resolve which series-group to use: prefer bound sgIndex, else info.group/index, else 0
                    let useIndex = (typeof state.sgIndex === 'number') ? state.sgIndex : (typeof startInfo.group === 'number' ? startInfo.group : 0);
                    if (useIndex < 0) useIndex = 0;
                    const sg = series_groups[useIndex] || series_groups[0] || {};

                    // Determine x scale using optional datatypes from stream start
                    const dtypes = Array.isArray(msg.datatypes) ? msg.datatypes.map(v => (v == null ? null : String(v).toLowerCase())) : null;
                    const x_name = sg['series-x'] || state.cols[0];
                    const xi = state.cols.indexOf(x_name);
                    const nameImpliesDate = (x_name || '').toString().match(/date|time|timestamp|dt|ts/i) !== null;
                    const timeTypes = new Set(['date', 'datetime', 'time', 'timestamp']);
                    let xScaleDerived = null;
                    if (dtypes && xi >= 0 && xi < dtypes.length) {
                        const t = dtypes[xi];
                        if (timeTypes.has(t)) xScaleDerived = 'time'; else xScaleDerived = 'category';
                    } else {
                        // Fallback to config or name heuristic
                        if (nameImpliesDate) xScaleDerived = 'time';
                        else {
                            const xTypeCfg = (startChartCfg['xaxis-type'] || xaxisTypeDefault || 'time');
                            xScaleDerived = axis_type_map[xTypeCfg] || 'time';
                        }
                    }

                    const xTypeNameCfg = (startChartCfg['xaxis-type'] || xaxisTypeDefault || 'time');

                    // Init chart (first start only) with derived scale
                    initChartIfNeeded(startChartCfg, xScaleDerived, xTypeNameCfg);

                    // Build pusher for this topic/group using the same scale decision
                    const isTimeScale = (xScaleDerived === 'time');
                    state.pushRows = buildPushRowsForGroup(boundTopic, state.cols, sg, startChartCfg['series-formats'] || seriesFormatsDefault, isTimeScale);

                    // Fresh assembler per topic
                    state.assembler = new ClaramaStreamAssembler((rows, chunk) => {
                        state.pushRows(rows, chunk);
                        if (chart) chart.update('none');
                    });

                    if (options && options.onopen) try {
                        options.onopen({topic: boundTopic, group: useIndex});
                    } catch (e) {
                    }
                } else if (type === 'chunk') {
                    if (state && state.assembler) {
                        state.assembler.onChunk(msg);
                    }
                } else if (type === 'end') {
                    if (options && options.onend) try {
                        options.onend(Object.assign({topic: boundTopic}, msg));
                    } catch (e) {
                    }
                } else if (type === 'error') {
                    console.error('Stream error', msg.error || msg);
                    if (options && options.onerror) try {
                        options.onerror(Object.assign({topic: boundTopic}, msg));
                    } catch (e) {
                    }
                }
            }
        }

        function registerTopic(topic, sgIndex) {
            if (!window.ClaramaStream || !window.ClaramaStream.register) return null;
            const unregister = window.ClaramaStream.register(topic, onMessageFrameFactory(topic, sgIndex));
            registrations.push(unregister);
            return unregister;
        }

        function resolveTopicMapping() {
            const mapping = [];
            // If array provided, align with series-groups order indexes
            if (Array.isArray(sourceTopicsOpt)) {
                for (let i = 0; i < sourceTopicsOpt.length; i++) {
                    const t = sourceTopicsOpt[i];
                    if (!t) continue;
                    mapping.push({topic: t, group: i});
                }
                return mapping;
            }
            // If object map provided (series-tab -> topic)
            if (sourceTopicsOpt && typeof sourceTopicsOpt === 'object') {
                const entries = Object.entries(sourceTopicsOpt);
                for (const [k, v] of entries) {
                    const idx = Number(k);
                    if (!isNaN(idx)) mapping.push({topic: v, group: idx});
                }
                return mapping;
            }
            // Fallback: single topic bound to group 0
            if (singleTopic) {
                return [{topic: singleTopic, group: 0}];
            }
            return mapping;
        }

        function restartStream(newTopics) {
            // newTopics may be string (single) or same structure as source_topics
            try {
                registrations.forEach(u => {
                    try {
                        u();
                    } catch (e) {
                    }
                });
            } catch (e) {
            }
            registrations.length = 0;
            topicStates.clear();
            // Reset datasets data
            if (chart) {
                for (const ds of datasets) {
                    ds.data = [];
                }
                chart.update('none');
            }

            let binding;
            if (typeof newTopics === 'string') {
                binding = [{topic: newTopics, group: 0}];
            } else if (Array.isArray(newTopics) || (newTopics && typeof newTopics === 'object')) {
                binding = (function (st) {
                    sourceTopicsOpt = st;
                    return resolveTopicMapping();
                })(newTopics);
            } else {
                binding = resolveTopicMapping();
            }
            binding.forEach(({topic, group}) => registerTopic(topic, group));
        }

        // Initial registration(s)
        let binding = resolveTopicMapping();
        if (binding.length === 0 && singleTopic) {
            binding = [{topic: singleTopic, group: 0}];
        }
        binding.forEach(({topic, group}) => registerTopic(topic, group));

        // expose chart and helpers for external access
        if (!global.__claramaCharts) global.__claramaCharts = {};
        global.__claramaCharts[chart_id] = () => chart;
        if (!global.__claramaStreamRestart) global.__claramaStreamRestart = {};
        global.__claramaStreamRestart[chart_id] = restartStream;

        return {
            restartStream, stop: function () {
                try {
                    registrations.forEach(u => {
                        try {
                            u();
                        } catch (e) {
                        }
                    });
                } catch (e) {
                }
            }
        };
    }

    function startLiveStream(isChart, query, topic, sourceFile) {
        // Trigger data/execute/stream_query on the selected source file
        const url = '/web' + encodeURIComponent(sourceFile);
        const body = {query: query, topic: topic, chunk_size: 200};

        console.log("DATA/STREAMING/START", url, body);
        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body)
        }).then(r => r.json()).then(j => {
            console.log('stream_query response', j);
        }).catch(err => {
            console.error('stream_query call failed', err);
            alert('Failed to call stream_query: ' + err);
        });
    }


    global.bChartStream = bChartStream;
    global.startLiveStream = startLiveStream;
    global.ClaramaStreamAssembler = global.ClaramaStreamAssembler || ClaramaStreamAssembler;


})(window);

