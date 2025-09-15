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

(function(global){
    'use strict';

    // Ordered assembler for chunk frames
    class ClaramaStreamAssembler{
        constructor(onRows){
            this.onRows = onRows; // function(rowsArray)
            this.nextExpected = 0;
            this.buffer = new Map();
        }
        reset(){
            this.nextExpected = 0;
            this.buffer.clear();
        }
        onChunk(chunk){
            const n = Number(chunk.chunk_no ?? 0);
            const rows = Array.isArray(chunk.rows) ? chunk.rows : [];
            if(n === this.nextExpected){
                this.onRows(rows);
                this.nextExpected++;
                // Flush any consecutively buffered chunks
                while(this.buffer.has(this.nextExpected)){
                    const buffered = this.buffer.get(this.nextExpected);
                    this.buffer.delete(this.nextExpected);
                    this.onRows(buffered);
                    this.nextExpected++;
                }
            } else if (n > this.nextExpected){
                this.buffer.set(n, rows);
            } else {
                // Late/duplicate chunk; ignore or re-append as needed; default ignore
                // console.debug('Duplicate/late chunk', n);
            }
        }
    }

    // Convert rows (array of arrays) to array of dicts using provided headings
    function rowsToDicts(rows, headings){
        const out = [];
        for(const r of rows){
            const o = {};
            for(let i=0;i<headings.length;i++){
                o[ headings[i] ] = r[i];
            }
            out.push(o);
        }
        return out;
    }

    // bTableStream API (now uses central ClaramaStream via clarama_websocket.js)
    function bTableStream(table_id, options){
        const topic = options && options.topic;
        if(!topic) throw new Error('bTableStream requires options.topic');

        const $container = $('#' + table_id);
        let $tabsRoot = null; // wrapper that will hold tabs and tab-content when needed

        // Track resultsets and their tables
        const resultsets = new Map(); // resultset index -> {headings, assembler, $table}
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
                try { $table.bootstrapTable('append', dicts); }
                catch (e) { console.error('bootstrapTable append failed', e); }
            });

            // Initialize the bootstrap table
            const table_columns = headings.map(col => ({ field: col, title: col, sortable: true }));
            try {
                $table.bootstrapTable('destroy').bootstrapTable({
                    exportDataType: 'all', exportTypes: ['json', 'xml', 'csv', 'txt', 'excel', 'pdf'],
                    columns: table_columns, data: [],
                    onClickRow: function (row, $element, field) {
                        if (typeof perform_interact === 'function') { perform_interact($table, { row, field }); }
                    }
                });
            } catch (e) { console.error('bootstrapTable init failed', e); }

            // Store the resultset info
            resultsets.set(resultsetIndex, { headings, assembler, $table });

            return { headings, assembler, $table };
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

        function onFrame(msg){
            const type = msg && msg.type; if(!type) return;

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

            if(type === 'start'){
                const headings = msg.cols || [];

                // Create or reset the resultset
                if (resultsetData) {
                    resultsetData.headings = headings;
                    resultsetData.assembler.reset();

                    // Reinitialize the table
                    const table_columns = headings.map(col => ({ field: col, title: col, sortable: true }));
                    try {
                        resultsetData.$table.bootstrapTable('destroy').bootstrapTable({
                            exportDataType: 'all', exportTypes: ['json', 'xml', 'csv', 'txt', 'excel', 'pdf'],
                            columns: table_columns, data: [],
                            onClickRow: function (row, $element, field) {
                                if (typeof perform_interact === 'function') { perform_interact(resultsetData.$table, { row, field }); }
                            }
                        });
                    } catch (e) { console.error('bootstrapTable init failed', e); }
                } else {
                    // Create a new resultset
                    resultsetData = createTableForResultset(resultsetIndex, headings);
                }

                if(options && options.onopen) options.onopen(msg);
            } else if(type === 'chunk'){
                // Create resultset if it doesn't exist (shouldn't happen, but just in case)
                if (!resultsetData) {
                    console.warn(`Received chunk for resultset ${resultsetIndex} without start frame`);
                    return;
                }

                resultsetData.assembler.onChunk(msg);
            } else if(type === 'end'){
                if(options && options.onend) options.onend(msg);
            } else if(type === 'error'){
                console.error('Stream error', msg.error || msg);
                if(options && options.onerror) options.onerror(msg);
            }
        }

        const unregister = (window.ClaramaStream && window.ClaramaStream.register) ? window.ClaramaStream.register(topic, onFrame) : function(){};

        // return an API to allow caller to stop listening and access resultset info
        return { 
            stop: unregister,
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
