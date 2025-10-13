/*
 * # Copyright (c) 2025. Euan Duncan Macinnes, euan.d.macinnes@gmail.com, S7479622B - All Rights Reserved
 */

/**
 * Clarama Streaming Data Table
 *
 * Provides bTableStream(table_id, options) which subscribes to a Clarama websocket
 * topic and incrementally renders rows into a Bootstrap Table as chunks arrive.
 *
 * Server stream frames expected (byrow orientation):
 *  - { type: 'start', cols: [...], info: {query, resultset?} }
 *  - { type: 'chunk', chunk_no: N, rows: [[...], ...], resultset?: N }
 *  - { type: 'end', last_chunk_no?: N, resultset?: N }
 *  - { type: 'error', error: '...', resultset?: N }
 *
 * Chunks can arrive out of order; we buffer by chunk_no and flush in-order.
 *
 * Multiple resultsets are supported with tabs - each resultset gets its own tab.
 */

(function (global) {
    'use strict';

    // helper to interpret truthy hidden flags from YAML/JSON
    function __isHidden(v) {
        return v === true || v === 'true' || v === 1 || v === '1';
    }

    // Ordered assembler for chunk frames
    class ClaramaStreamAssembler {
        constructor(onRows) {
            this.onRows = onRows; // function(rowsArray)
            this.nextExpected = 0;
            this.buffer = new Map();
        }

        reset() {
            this.nextExpected = 0;
            this.buffer.clear();
        }

        onChunk(chunk) {
            const n = Number(chunk.chunk_no ?? 0);
            const rows = Array.isArray(chunk.rows) ? chunk.rows : [];
            if (n === this.nextExpected) {
                this.onRows(rows);
                this.nextExpected++;
                // Flush any consecutively buffered chunks
                while (this.buffer.has(this.nextExpected)) {
                    const buffered = this.buffer.get(this.nextExpected);
                    this.buffer.delete(this.nextExpected);
                    this.onRows(buffered);
                    this.nextExpected++;
                }
            } else if (n > this.nextExpected) {
                this.buffer.set(n, rows);
            } else {
                // Late/duplicate chunk; ignore or re-append as needed; default ignore
                // console.debug('Duplicate/late chunk', n);
            }
        }
    }

    // Convert rows (array of arrays) to array of dicts using provided headings
    function rowsToDicts(rows, headings) {
        const out = [];
        for (const r of rows) {
            const o = {};
            for (let i = 0; i < headings.length; i++) {
                o[headings[i]] = r[i];
            }
            out.push(o);
        }
        return out;
    }

    // bTableStream API (now uses central ClaramaStream via clarama_websocket.js)
    function bTableStream(table_id, options) {
        // Ensure any previous stream for this table is stopped to avoid duplicate handlers
        try {
            const $existing = $('#' + table_id);
            const prevStop = $existing && $existing.data && $existing.data('claramaStreamUnregister');
            if (typeof prevStop === 'function') {
                try {
                    prevStop();
                } catch (e) { /* noop */
                }
                // Clear stored reference
                try {
                    $existing.data('claramaStreamUnregister', null);
                } catch (e) { /* noop */
                }
            }
        } catch (e) { /* noop */
        }
        const topic = options && options.topic;
        if (!topic) throw new Error('bTableStream requires options.topic');

        // Build a mapping of column name -> metadata {display_name, description, hidden}
        const colMetaMap = {};
        try {
            const metaArr = (options && Array.isArray(options.columns_meta)) ? options.columns_meta : [];
            for (const m of metaArr) {
                if (m && m.name) {
                    colMetaMap[String(m.name)] = {
                        display_name: m.display_name,
                        description: m.description,
                        hidden: m.hidden
                    };
                }
            }
        } catch (e) {
            // ignore
        }

        console.log('bTableStream column meta-map', colMetaMap);

        const $container = $('#' + table_id);
        let $tabsRoot = null; // wrapper that will hold tabs and tab-content when needed

        // Track resultsets and their tables
        const resultsets = new Map(); // resultset index -> {headings, assembler, $table}
        // Buffer for chunks that may arrive before the start frame per resultset
        const preStartChunks = new Map(); // resultset index -> Array<chunkMsg>
        // Diagnostics log per resultset capturing arrival order of frames
        const diagLogs = new Map(); // resultset index -> Array<{t, n, last, ts}>
        let hasMultipleResultsets = false;
        let tabsCreated = false;

        // Create a new table for a resultset
        function createTableForResultset(resultsetIndex, headings) {
            // Create a unique ID for this resultset's table
            const tableId = `${table_id}_rs${resultsetIndex}`;

            // If this is the first resultset, use the original container
            // Otherwise, create a new div for this resultset's table
            let $table;
            if (resultsets.size === 0 && !tabsCreated) {
                $table = $container;
            } else {
                // If we haven't created tabs yet but now have multiple resultsets, create the tab structure
                if (!tabsCreated) {
                    createTabStructure();
                }

                // Ensure we have a tabs root to append into
                const $navTabs = $tabsRoot ? $tabsRoot.find('.nav-tabs') : $();
                const $tabContentWrap = $tabsRoot ? $tabsRoot.find('.tab-content') : $();

                // Check if tab already exists
                if ($(`#tab_${tableId}`).length === 0) {
                    // Add a new tab
                    const $tabLink = $(`<li class="nav-item"><a class="nav-link" id="tab_${tableId}_link" data-toggle="tab" href="#tab_${tableId}" role="tab">Resultset ${resultsetIndex}</a></li>`);
                    $navTabs.append($tabLink);

                    // Add a new tab content
                    const $tabContent = $(`<div class="tab-pane fade" id="tab_${tableId}" role="tabpanel"></div>`);
                    $tabContentWrap.append($tabContent);

                    // Create a table inside the tab content
                    $tabContent.append(`<table id="${tableId}"></table>`);
                    $table = $(`#${tableId}`);

                    // If this is the second resultset (first tab creation), make the first tab active
                    if (resultsets.size === 1) {
                        $navTabs.find('.nav-link').first().addClass('active');
                        $tabContentWrap.find('.tab-pane').first().addClass('show active');
                    }
                } else {
                    $table = $(`#${tableId}`);
                }
            }

            // Create an assembler for this resultset
            const assembler = new ClaramaStreamAssembler((rows) => {
                if (!headings || headings.length === 0) return; // not started yet
                const dicts = rowsToDicts(rows, headings);
                try {
                    $table.bootstrapTable('append', dicts);
                } catch (e) {
                    console.error('bootstrapTable append failed', e);
                }
            });

            // Initialize the bootstrap table
            const table_columns = headings.map(col => {
                const meta = colMetaMap[col] || {};
                const title = (meta.display_name && String(meta.display_name).trim()) ? String(meta.display_name) : col;
                const c = {field: col, title: title, sortable: true};
                if (meta.description) c.titleTooltip = String(meta.description);
                if (__isHidden(meta.hidden)) c.visible = false;
                return c;
            });
            try {
                $table.bootstrapTable('destroy').bootstrapTable({
                    exportDataType: 'all', exportTypes: ['json', 'xml', 'csv', 'txt', 'excel', 'pdf'],
                    columns: table_columns, data: [],
                    onClickRow: function (row, $element, field) {
                        if (typeof perform_interact === 'function') {
                            perform_interact($table, {row, field});
                        }
                    }
                });
                // Apply tooltip via title attribute on header cells as a fallback
                setTimeout(() => {
                    try {
                        const $ths = $table.closest('.bootstrap-table').find('th');
                        $ths.each(function () {
                            const field = $(this).data('field');
                            const meta = colMetaMap[field] || {};
                            if (meta && meta.description) {
                                this.setAttribute('title', String(meta.description));
                            }
                        });
                    } catch (e) {
                    }
                }, 0);
            } catch (e) {
                console.error('bootstrapTable init failed', e);
            }
            // Attach diagnostics button
            try {
                attachDiagnosticsUI($table, resultsetIndex);
            } catch (e) { /* noop */
            }

            // Store the resultset info
            resultsets.set(resultsetIndex, {headings, assembler, $table});

            return {headings, assembler, $table};
        }

        // Create the tab structure for multiple resultsets
        function createTabStructure() {
            // The container is a <table>. We need to create an external wrapper to host tabs.
            const $tableEl = $container; // original table element

            // Build a wrapper just before the table and then move the table into the first tab-pane
            $tabsRoot = $('<div class="clarama-resultset-tabs"></div>');
            $tableEl.before($tabsRoot);

            $tabsRoot.append(`
                <ul class="nav nav-tabs" role="tablist"></ul>
                <div class="tab-content"></div>
            `);

            // If we already have a resultset (0), move it to the first tab
            if (resultsets.size === 1) {
                const firstResultset = resultsets.get(0);
                if (firstResultset) {
                    const firstTableId = `${table_id}_rs0`;

                    // Create the first tab
                    const $tabLink = $(`<li class="nav-item"><a class="nav-link active" id="tab_${firstTableId}_link" data-toggle="tab" href="#tab_${firstTableId}" role="tab">Resultset 0</a></li>`);
                    $tabsRoot.find('.nav-tabs').append($tabLink);

                    // Create the first tab content with the original table
                    const $tabContent = $(`<div class="tab-pane fade show active" id="tab_${firstTableId}" role="tabpanel"></div>`);
                    $tabsRoot.find('.tab-content').append($tabContent);

                    // Move the original table element into the tab content
                    $tabContent.append($tableEl);

                    // Update the reference in the resultset to the now-moved table
                    firstResultset.$table = $(`#${table_id}`);
                }
            }

            tabsCreated = true;
        }

        // Attach a small diagnostics '?' icon to the table header to show chunk arrival order
        function attachDiagnosticsUI($table, resultsetIndex) {
            try {
                const $wrapper = $table.closest('.bootstrap-table');
                if (!$wrapper || $wrapper.length === 0) return;
                // Find or create toolbar container
                let $toolbar = $wrapper.find('.fixed-table-toolbar');
                if ($toolbar.length === 0) {
                    $toolbar = $('<div class="fixed-table-toolbar"></div>');
                    // Prepend so it shows above the table
                    $wrapper.prepend($toolbar);
                }
                // Ensure a container for custom tools
                let $tools = $toolbar.find('.bs-bars');
                if ($tools.length === 0) {
                    $tools = $('<div class="bs-bars" role="toolbar"></div>');
                    $toolbar.append($tools);
                }
                // If button already exists for this resultset, skip
                const btnId = `diag_btn_${$table.attr('id')}`;
                if ($(`#${btnId}`).length) return;
                const $btn = $(`<button type="button" id="${btnId}" class="btn btn-sm btn-light" title="Show stream diagnostics">?</button>`);
                // Slight styling
                $btn.css({marginLeft: '6px'});
                $btn.on('click', function () {
                    try {
                        const log = diagLogs.get(resultsetIndex) || [];
                        if (!log.length) {
                            alert('No diagnostics recorded yet.');
                            return;
                        }
                        const lines = log.map((e, idx) => {
                            const ts = new Date(e.ts).toLocaleTimeString();
                            if (e.t === 'chunk') return `${idx + 1}. [${ts}] chunk ${e.n}`;
                            if (e.t === 'start') return `${idx + 1}. [${ts}] start`;
                            if (e.t === 'end') return `${idx + 1}. [${ts}] end${(e.last !== undefined && e.last !== null && e.last !== '') ? ` last_chunk_no=${e.last}` : ''}`;
                            if (e.t === 'error') return `${idx + 1}. [${ts}] error`;
                            return `${idx + 1}. [${ts}] ${e.t}`;
                        });
                        alert(`Stream diagnostics for resultset ${resultsetIndex}:\n\n` + lines.join('\n'));
                    } catch (e) {
                        alert('Failed to show diagnostics: ' + e);
                    }
                });
                $tools.append($btn);
            } catch (e) { /* noop */
            }
        }

        let unregister = function () {
        };

        function __cleanup(reason) {
            try {
                if (unregister) unregister();
            } catch (e) { /* noop */
            }
            try {
                $container.data('claramaStreamUnregister', null);
            } catch (e) { /* noop */
            }
            try {
                preStartChunks.clear();
            } catch (e) { /* noop */
            }
            try {
                resultsets.clear();
            } catch (e) { /* noop */
            }
            // No need to destroy tables here; the page may keep them for viewing results
        }

        function onFrame(msg) {
            console.log('onFrame', msg);
            const type = msg && msg.type;
            if (!type) return;

            // Get resultset index from the message or info
            let resultsetIndex = 0;
            try {
                if (msg.resultset !== undefined) {
                    resultsetIndex = Number(msg.resultset);
                } else if (msg.info && msg.info.resultset !== undefined) {
                    resultsetIndex = Number(msg.info.resultset);
                }
            } catch (e) {
                resultsetIndex = 0;
            }

            // Track if we have multiple resultsets
            if (resultsetIndex > 0 && !hasMultipleResultsets) {
                hasMultipleResultsets = true;
            }

            // Get or create the resultset data
            let resultsetData = resultsets.get(resultsetIndex);

            // Record diagnostics entry for arrival order
            try {
                let arr = diagLogs.get(resultsetIndex);
                if (!arr) {
                    arr = [];
                    diagLogs.set(resultsetIndex, arr);
                }
                arr.push({t: type, n: (msg && msg.chunk_no), last: (msg && msg.last_chunk_no), ts: Date.now()});
            } catch (e) { /* noop */
            }

            if (type === 'start') {
                const headings = msg.cols || [];

                // If a duplicate 'start' arrives with identical columns after data has begun, ignore to prevent clearing the table
                if (resultsetData && Array.isArray(resultsetData.headings)) {
                    const prev = resultsetData.headings || [];
                    const sameCols = (prev.length === headings.length) && prev.every((v, i) => v === headings[i]);
                    const progressed = (resultsetData.assembler && Number(resultsetData.assembler.nextExpected) > 0);
                    if (sameCols && progressed) {
                        try {
                            console.warn(`Ignoring duplicate start for resultset ${resultsetIndex} to prevent table reset`);
                        } catch (e) {
                        }
                        return;
                    }
                }

                // Create or reset the resultset
                if (resultsetData) {
                    resultsetData.headings = headings;
                    resultsetData.assembler.reset();

                    // Reinitialize the table
                    const table_columns = headings.map(col => {
                        const meta = colMetaMap[col] || {};
                        const title = (meta.display_name && String(meta.display_name).trim()) ? String(meta.display_name) : col;
                        const c = {field: col, title: title, sortable: true};
                        if (meta.description) c.titleTooltip = String(meta.description);
                        if (meta.hidden === true || meta.hidden === 'true' || meta.hidden === 1 || meta.hidden === '1') c.visible = false;
                        return c;
                    });
                    try {
                        resultsetData.$table.bootstrapTable('destroy').bootstrapTable({
                            exportDataType: 'all', exportTypes: ['json', 'xml', 'csv', 'txt', 'excel', 'pdf'],
                            columns: table_columns, data: [],
                            onClickRow: function (row, $element, field) {
                                if (typeof perform_interact === 'function') {
                                    perform_interact(resultsetData.$table, {row, field});
                                }
                            }
                        });
                        // Apply tooltip via title attribute on header cells as a fallback
                        setTimeout(() => {
                            try {
                                const $ths = resultsetData.$table.closest('.bootstrap-table').find('th');
                                $ths.each(function () {
                                    const field = $(this).data('field');
                                    const meta = colMetaMap[field] || {};
                                    if (meta && meta.description) {
                                        this.setAttribute('title', String(meta.description));
                                    }
                                });
                            } catch (e) {
                            }
                        }, 0);
                    } catch (e) {
                        console.error('bootstrapTable init failed', e);
                    }
                    // Re-attach diagnostics button after reinit
                    try {
                        attachDiagnosticsUI(resultsetData.$table, resultsetIndex);
                    } catch (e) { /* noop */
                    }
                } else {
                    // Create a new resultset
                    resultsetData = createTableForResultset(resultsetIndex, headings);
                }

                // Flush any chunks that arrived early (before start) for this resultset
                try {
                    const early = preStartChunks.get(resultsetIndex);
                    if (early && early.length) {
                        // No strict need to sort; assembler can buffer out-of-order
                        early.forEach(ch => {
                            try {
                                resultsetData.assembler.onChunk(ch);
                            } catch (e) { /* noop */
                            }
                        });
                        preStartChunks.delete(resultsetIndex);
                    }
                } catch (e) { /* noop */
                }

                if (options && options.onopen) options.onopen(msg);
            } else if (type === 'chunk') {
                // If start hasn't arrived yet, buffer the chunk for this resultset and return
                if (!resultsetData) {
                    let arr = preStartChunks.get(resultsetIndex);
                    if (!arr) {
                        arr = [];
                        preStartChunks.set(resultsetIndex, arr);
                    }
                    arr.push(msg);
                    console.warn(`Buffered early chunk for resultset ${resultsetIndex} (chunk_no=${msg && msg.chunk_no}) until start frame arrives`);
                    return;
                }

                resultsetData.assembler.onChunk(msg);
            } else if (type === 'end') {
                try {
                    __cleanup('end');
                } catch (e) { /* noop */
                }
                if (options && options.onend) options.onend(msg);
            } else if (type === 'error') {
                console.error('Stream error', msg.error || msg);
                try {
                    __cleanup('error');
                } catch (e) { /* noop */
                }
                if (options && options.onerror) options.onerror(msg);
            }
        }

        unregister = (window.ClaramaStream && window.ClaramaStream.register) ? window.ClaramaStream.register(topic, onFrame) : function () {
        };
        // Store unregister on the table element so a subsequent bTableStream call can dispose the previous one
        try {
            $container.data('claramaStreamUnregister', unregister);
        } catch (e) { /* noop */
        }
        // Auto-unregister on window unload to prevent leaks
        try {
            $(window).on('unload.bTableStream_' + table_id, function () {
                try {
                    unregister();
                } catch (e) {
                }
            });
        } catch (e) { /* noop */
        }

        // return an API to allow caller to stop listening and access resultset info
        return {
            stop: function () {
                try {
                    __cleanup('stop');
                } catch (e) {
                }
            },
            getResultsets: () => Array.from(resultsets.keys()),
            hasMultipleResultsets: () => hasMultipleResultsets,
            activateTab: (resultsetIndex) => {
                if (tabsCreated) {
                    const tableId = `${table_id}_rs${resultsetIndex}`;
                    $(`#tab_${tableId}_link`).tab('show');
                }
            }
        };
    }

    // expose
    global.bTableStream = bTableStream;
    global.ClaramaStreamAssembler = ClaramaStreamAssembler;

})(window);
