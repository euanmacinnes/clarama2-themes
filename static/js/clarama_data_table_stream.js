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
 *  - { type: 'chunk', chunk_no: N, rows: [[...], ...] }
 *  - { type: 'end', last_chunk_no?: N }
 *  - { type: 'error', error: '...' }
 *
 * Chunks can arrive out of order; we buffer by chunk_no and flush in-order.
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

        const $table = $('#' + table_id);
        let headings = [];
        const assembler = new ClaramaStreamAssembler((rows)=>{
            if(!headings || headings.length === 0) return; // not started yet
            const dicts = rowsToDicts(rows, headings);
            try{ $table.bootstrapTable('append', dicts); }
            catch(e){ console.error('bootstrapTable append failed', e); }
        });

        function onFrame(msg){
            const type = msg && msg.type; if(!type) return;
            if(type === 'start'){
                headings = msg.cols || [];
                assembler.reset();
                const table_columns = headings.map(col => ({ field: col, title: col, sortable: true }));
                try{
                    $table.bootstrapTable('destroy').bootstrapTable({
                        exportDataType: 'all', exportTypes: ['json','xml','csv','txt','excel','pdf'],
                        columns: table_columns, data: [],
                        onClickRow: function(row, $element, field){
                            if(typeof perform_interact === 'function'){ perform_interact($table, { row, field }); }
                        }
                    });
                    if(options && options.onopen) options.onopen();
                }catch(e){ console.error('bootstrapTable init failed', e); }
            } else if(type === 'chunk'){
                assembler.onChunk(msg);
            } else if(type === 'end'){
                if(options && options.onend) options.onend(msg);
            } else if(type === 'error'){
                console.error('Stream error', msg.error || msg);
                if(options && options.onerror) options.onerror(msg);
            }
        }

        const unregister = (window.ClaramaStream && window.ClaramaStream.register) ? window.ClaramaStream.register(topic, onFrame) : function(){};

        // return an API to allow caller to stop listening
        return { stop: unregister };
    }

    // expose
    global.bTableStream = bTableStream;
    global.ClaramaStreamAssembler = ClaramaStreamAssembler;

})(window);
