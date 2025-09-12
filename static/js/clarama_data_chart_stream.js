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

(function(global){
    'use strict';

    class ClaramaStreamAssembler{
        constructor(onRows){ this.onRows = onRows; this.nextExpected = 0; this.buffer = new Map(); }
        reset(){ this.nextExpected = 0; this.buffer.clear(); }
        onChunk(chunk){
            const n = Number(chunk.chunk_no ?? 0);
            const rows = Array.isArray(chunk.rows) ? chunk.rows : [];
            if(n === this.nextExpected){
                this.onRows(rows); this.nextExpected++;
                while(this.buffer.has(this.nextExpected)){
                    const r = this.buffer.get(this.nextExpected); this.buffer.delete(this.nextExpected);
                    this.onRows(r); this.nextExpected++;
                }
            } else if (n > this.nextExpected){ this.buffer.set(n, rows); }
        }
    }

    // Light port of ChartSeriesFormat from non-streaming charts
    function ChartSeriesFormat(dataset, formats, index = 0){
        const palette = defaultColors;
        const color = palette[index % palette.length];
        dataset.borderColor = dataset.borderColor || color;
        dataset.backgroundColor = dataset.backgroundColor || color;
        if(!formats || !Array.isArray(formats) || !formats.length){
            dataset.fill = dataset.fill ?? false;
            dataset.stepped = dataset.stepped ?? false;
            dataset.pointRadius = dataset.pointRadius ?? 3;
            dataset.borderWidth = dataset.borderWidth ?? 2;
            return dataset;
        }
        const id = dataset.id || dataset.label || '';
        for(let f=0; f<formats.length; f++){
            const fmt = formats[f] || {}; let match = false;
            if(fmt['format-nrx'] === id){ match = true; }
            else if(fmt['format-nrx']){ try{ match = new RegExp(fmt['format-nrx']).test(id); }catch(e){ match = false; } }
            if(match){
                const lw = (fmt['format-lw'] === undefined || fmt['format-lw'] === '') ? 2 : fmt['format-lw'];
                const pr = (fmt['format-pr'] === undefined || fmt['format-pr'] === '') ? 3 : fmt['format-pr'];
                const ps = (fmt['format-ps'] === undefined || fmt['format-ps'] === '') ? 'circle' : fmt['format-ps'];
                dataset.fill = fmt['format-f'];
                dataset.stepped = fmt['format-p'];
                dataset.pointRadius = pr;
                dataset.pointStyle = ps;
                dataset.borderWidth = lw;
                dataset.unitAxis = fmt['format-ua'];
                if(fmt['format-title']) dataset.label = fmt['format-title'];
                if(fmt['format-col']){
                    const col = chartColors && chartColors[fmt['format-col']] ? chartColors[fmt['format-col']] : fmt['format-col'];
                    if(col) dataset.borderColor = col;
                }
                if(fmt['format-col-back']){
                    const colb = chartColors && chartColors[fmt['format-col-back']] ? chartColors[fmt['format-col-back']] : fmt['format-col-back'];
                    if(colb) dataset.backgroundColor = colb;
                }
                break;
            }
        }
        return dataset;
    }

    // Simple color palette fallback
    const defaultColors = [
        '#e6194b','#3cb44b','#ffe119','#4363d8','#f58231','#911eb4','#46f0f0','#f032e6','#bcf60c','#fabebe',
        '#008080','#e6beff','#9a6324','#fffac8','#800000','#aaffc3','#808000','#ffd8b1','#000075','#808080'
    ];

    const axis_type_map = {
        'time': 'time',
        'category': 'category',
        'category_grouped': 'category',
        'category_bulk': 'category'
    };

    // Compute an optimal time step for the current zoom range and canvas width
    function computeTimeStep(rangeMs, widthPx){
        const targetPoints = Math.max(50, Math.min(1000, Math.floor(widthPx / 3))); // aim ~1 point per 3px
        const rawStep = rangeMs / targetPoints;
        // snap to friendly units
        const units = [
            { name: 'millisecond', ms: 1 },
            { name: '5 milliseconds', ms: 5 },
            { name: '10 milliseconds', ms: 10 },
            { name: '50 milliseconds', ms: 50 },
            { name: '100 milliseconds', ms: 100 },
            { name: '250 milliseconds', ms: 250 },
            { name: '500 milliseconds', ms: 500 },
            { name: 'second', ms: 1000 },
            { name: '5 seconds', ms: 5000 },
            { name: '10 seconds', ms: 10000 },
            { name: '15 seconds', ms: 15000 },
            { name: '30 seconds', ms: 30000 },
            { name: 'minute', ms: 60000 },
            { name: '2 minutes', ms: 120000 },
            { name: '5 minutes', ms: 300000 },
            { name: '10 minutes', ms: 600000 },
            { name: '15 minutes', ms: 900000 },
            { name: '30 minutes', ms: 1800000 },
            { name: 'hour', ms: 3600000 },
            { name: '2 hours', ms: 7200000 },
            { name: '3 hours', ms: 10800000 },
            { name: '6 hours', ms: 21600000 },
            { name: '12 hours', ms: 43200000 },
            { name: 'day', ms: 86400000 },
            { name: '2 days', ms: 172800000 },
            { name: '7 days', ms: 604800000 },
            { name: '14 days', ms: 1209600000 },
            { name: 'month', ms: 2629800000 },
            { name: '3 months', ms: 7889400000 },
            { name: '6 months', ms: 15778800000 },
            { name: 'year', ms: 31557600000 }
        ];
        let best = units[0];
        for(const u of units){ if(u.ms >= rawStep){ best = u; break; } }
        return { stepMs: best.ms, unitName: best.name, targetPoints };
    }

    function bChartStream(chart_id, options){
        if(!global.Chart){ console.error('Chart.js not found'); }
        const topic = options && options.topic; if(!topic) throw new Error('bChartStream requires options.topic');

        const canvas = document.getElementById(chart_id);
        const ctx = canvas.getContext('2d');
        let chart = null; let cols = [];

        // dynamic pushing function configured on start
        let pushRows = function(rows){};

        // current topic registration
        let unregister = null;
        let currentTopic = topic;

        function restartStream(newTopic){
            try{ if(unregister){ unregister(); unregister = null; } }catch(e){}
            currentTopic = newTopic;
            // reset datasets
            if(chart){
                for(const ds of chart.data.datasets){ ds.data = []; }
                chart.update('none');
            }
            // re-register
            if(window.ClaramaStream && window.ClaramaStream.register){ unregister = window.ClaramaStream.register(currentTopic, onMessageFrame); }
        }

        const assembler = new ClaramaStreamAssembler((rows)=>{
            if(!chart) return;
            pushRows(rows);
            chart.update('none');
        });

        function onMessageFrame(msg){
            const type = msg && msg.type; if(!type) return;
            if(type === 'start'){
                cols = Array.isArray(msg.cols) ? msg.cols : [];
                const startInfo = msg.info || {};
                const startChartCfg = startInfo.chart || options.chart || {};

                // x-axis handling
                const xaxisType = startChartCfg['xaxis-type'] || options.xaxisType || 'time';
                const x_scale_type = axis_type_map[xaxisType] || 'time';
                const isTime = x_scale_type === 'time';

                // legend display
                const legend_display = startChartCfg['legend'] === undefined ? true : (startChartCfg['legend'] !== 'Off');

                // annotations (Chart.js annotation plugin expected to be registered externally if used)
                const annotations = startChartCfg['annotations'] || startChartCfg['chart-annotations'] || undefined;

                // aspect ratio handling
                let aspect_ratio = startChartCfg['aspect_ratio'];
                let maintain = false;
                if(isNaN(aspect_ratio) || !aspect_ratio){ aspect_ratio = 2.5; maintain = true; }

                // series formats
                const series_formats = startChartCfg['series-formats'] || [];

                // Determine building mode: series-groups or simple y_cols
                const series_groups = Array.isArray(startChartCfg['series-groups']) ? startChartCfg['series-groups'] : [];

                // Prepare datasets container
                const datasets = [];
                const datasetIndexByKey = new Map(); // for dynamic creation per series value

                function ensureDataset(key, baseLabel, baseColorIndex){
                    if(datasetIndexByKey.has(key)) return datasetIndexByKey.get(key);
                    const color = defaultColors[datasets.length % defaultColors.length];
                    const ds = { id: key, label: baseLabel || key, data: [], borderColor: color, backgroundColor: color, fill: false, pointRadius: 3, tension: 0.1 };
                    ChartSeriesFormat(ds, series_formats, datasets.length);
                    datasets.push(ds);
                    const idx = datasets.length - 1;
                    datasetIndexByKey.set(key, idx);
                    return idx;
                }

                if(series_groups.length > 0){
                    const sg = series_groups[0] || {};
                    const x_name = sg['series-x'] || cols[0];
                    const y_name = sg['series-y'] || cols[1];
                    const s_name = sg['series-s'];
                    const l_name = sg['series-l'];

                    const xi = cols.indexOf(x_name);
                    const yi = cols.indexOf(y_name);
                    const si = s_name ? cols.indexOf(s_name) : -1;
                    const li = l_name ? cols.indexOf(l_name) : -1;

                    if(si < 0 && yi >= 0){ ensureDataset(y_name, y_name, 0); }

                    pushRows = function(rows){
                        for(const r of rows){
                            const xv = xi >= 0 ? r[xi] : r[0];
                            if(yi >= 0){
                                if(si >= 0){
                                    const kval = r[si];
                                    const lbl = (li >= 0 ? r[li] : `${y_name}:${kval}`);
                                    const key = `${y_name}::${kval}`;
                                    const idx = ensureDataset(key, lbl);
                                    chart.data.datasets[idx].data.push({ x: xv, y: r[yi] });
                                } else {
                                    const idx = ensureDataset(y_name, y_name);
                                    chart.data.datasets[idx].data.push({ x: xv, y: r[yi] });
                                }
                            }
                        }
                    };
                } else {
                    const x_col_name = options.x_col;
                    const y_cols = options.y_cols || cols.filter((c,i)=> i!== (x_col_name ? cols.indexOf(x_col_name) : 0));
                    const x_index = x_col_name ? cols.indexOf(x_col_name) : 0;
                    const y_indexes = y_cols.map(c=> cols.indexOf(c)).filter(i=> i>=0);
                    for(let i=0;i<y_cols.length;i++){ ensureDataset(y_cols[i], y_cols[i], i); }
                    pushRows = function(rows){
                        for(const r of rows){
                            const xv = r[x_index];
                            for(let i=0;i<y_indexes.length;i++){
                                const yi = y_indexes[i];
                                const key = y_cols[i];
                                const idx = ensureDataset(key, key, i);
                                chart.data.datasets[idx].data.push({ x: xv, y: r[yi] });
                            }
                        }
                    };
                }

                const data = { datasets };
                const baseOptions = {
                    parsing: true,
                    maintainAspectRatio: maintain,
                    aspectRatio: aspect_ratio,
                    scales: {
                        x: { type: x_scale_type, time: x_scale_type === 'time' ? { unit: 'auto' } : undefined },
                        y: { type: 'linear', beginAtZero: false }
                    },
                    plugins: { 
                        legend: { display: legend_display },
                        zoom: isTime ? {
                            pan: { enabled: true, mode: 'x', modifierKey: 'ctrl' },
                            zoom: {
                                wheel: { enabled: true, modifierKey: 'ctrl' },
                                drag: { enabled: true, borderColor: 'rgb(54, 162, 235)', borderWidth: 1, backgroundColor: 'rgba(54, 162, 235, 0.3)' },
                                mode: 'x',
                                onZoomComplete: ({chart}) => {
                                    try{
                                        const scale = chart.scales.x;
                                        const min = scale.min; const max = scale.max;
                                        if(min==null || max==null) return;
                                        const rangeMs = (new Date(max)).valueOf() - (new Date(min)).valueOf();
                                        const widthPx = canvas.clientWidth || canvas.width || 800;
                                        const { stepMs, unitName, targetPoints } = computeTimeStep(rangeMs, widthPx);
                                        const detail = { start: new Date(min), end: new Date(max), startISO: new Date(min).toISOString(), endISO: new Date(max).toISOString(), rangeMs, widthPx, stepMs, unitName, targetPoints, restartStream };
                                        const evt = new CustomEvent('clarama:zoom-range', { detail });
                                        canvas.dispatchEvent(evt);
                                        if(options && typeof options.onZoomRefetch === 'function'){ options.onZoomRefetch(detail); }
                                    }catch(e){ console.error('zoom compute failed', e); }
                                },
                                onZoomReset: ({chart}) => {
                                    try{
                                        const evt = new CustomEvent('clarama:zoom-reset', { detail: { restartStream } });
                                        canvas.dispatchEvent(evt);
                                        if(options && typeof options.onZoomReset === 'function') options.onZoomReset({ restartStream });
                                    }catch(e){}
                                }
                            }
                        } : undefined
                    }
                };
                if(annotations){
                    baseOptions.plugins = baseOptions.plugins || {};
                    baseOptions.plugins.annotation = baseOptions.plugins.annotation || {};
                    baseOptions.plugins.annotation.annotations = annotations;
                }
                const chart_type = options.chart_type || startChartCfg['chart-type'] || 'line';
                const chart_options_override = options.chart_options || startChartCfg['chart-options'] || {};

                const cfg = { type: chart_type, data, options: Object.assign({}, baseOptions, chart_options_override) };

                if(chart){ chart.destroy(); }
                chart = new Chart(ctx, cfg);
                assembler.reset();
                if(options && options.onopen) options.onopen();
            } else if (type === 'chunk'){
                assembler.onChunk(msg);
            } else if (type === 'end'){
                if(options && options.onend) options.onend(msg);
            } else if (type === 'error'){
                console.error('Stream error', msg.error || msg);
                if(options && options.onerror) options.onerror(msg);
            }
        }

        // register first listener
        if(window.ClaramaStream && window.ClaramaStream.register){ unregister = window.ClaramaStream.register(currentTopic, onMessageFrame); }

        // expose chart and helpers for external access
        if(!global.__claramaCharts) global.__claramaCharts = {};
        global.__claramaCharts[chart_id] = ()=>chart;
        if(!global.__claramaStreamRestart) global.__claramaStreamRestart = {};
        global.__claramaStreamRestart[chart_id] = restartStream;

        return { restartStream, stop: function(){ if(unregister){ unregister(); unregister=null; } } };
    }

    global.bChartStream = bChartStream;
    global.ClaramaStreamAssembler = global.ClaramaStreamAssembler || ClaramaStreamAssembler;

})(window);
