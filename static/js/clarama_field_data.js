/*
 * # Copyright (c) 2025. Euan Duncan Macinnes, euan.d.macinnes@gmail.com, S7479622B - All Rights Reserved
 */

// Centralized single-value field datasource initializer
// For field types: string, date, datetime, daterange, hidden, code (ACE), rich text (Trumbowyg)
// If a field has a data.source configured, templates will render a sourceurl attribute.
// On load, we fetch the datasource via AJAX and set the field value to the first row / first column result.

(function(){
    function log(){ try { console.log.apply(console, ['[clarama_field_data]'].concat([].slice.call(arguments))); } catch(e){} }

    function firstCellFromResult(data){
        if (!data) return undefined;
        // Expected format based on other datasource consumers
        // { data: 'ok', results: { rows: [...], headings: [...] } }
        try{
            if (data.data !== 'ok'){
                return undefined;
            }
            var results = data.results || {};
            var rows = results.rows || [];
            if (!rows.length) return undefined;
            var row0 = rows[0];
            // Support row as array or object
            if (Array.isArray(row0)){
                return row0.length ? row0[0] : undefined;
            }
            // If object, pick the first key in headings if present, else first enumerable key
            var headings = results.headings || Object.keys(row0);
            if (headings && headings.length && (row0[headings[0]] !== undefined)){
                return row0[headings[0]];
            }
            var keys = Object.keys(row0);
            return keys.length ? row0[keys[0]] : undefined;
        }catch(err){
            log('Error parsing datasource result', err);
            return undefined;
        }
    }

    function buildQuery(){
        var original_url = $('.embedded').eq(0).attr('original_url');
        var values = {};
        try{
            if (typeof get_field_values === 'function'){
                values = get_field_values({}, true, undefined);
            }
        }catch(err){ log('get_field_values error', err); }
        return JSON.stringify({ search: '', values: values, original_url: original_url });
    }

    function setValueForElement($el, value){
        if (value === undefined || value === null) return;
        var ft = $el.attr('fieldtype');
        // ACE editor
        if (ft === 'aceeditor'){
            try{
                var id = $el.attr('id');
                if (id){ var editor = ace.edit(id); editor.setValue(String(value), -1); }
            }catch(err){ log('ACE set error', err); }
            return;
        }
        // Trumbowyg rich text
        if (ft === 'trumbowyg'){
            try{ $el.trumbowyg('html', String(value)); }catch(err){ log('Trumbowyg set error', err); }
            return;
        }
        // Daterange input (uses daterangepicker)
        if ($el.hasClass('clarama-daterange')){
            try{
                // If value looks like "start - end" or ISO range, attempt to split; otherwise set raw value
                if (typeof value === 'string' && value.includes(' - ')){
                    var parts = value.split(' - ');
                    var start = window.moment ? moment(parts[0]) : parts[0];
                    var end = window.moment ? moment(parts[1]) : parts[1];
                    if ($el.data('daterangepicker')){
                        $el.data('daterangepicker').setStartDate(start);
                        $el.data('daterangepicker').setEndDate(end);
                    }
                }
                $el.val(String(value)).trigger('change');
            }catch(err){ log('Daterange set error', err); }
            return;
        }
        // Default HTML input/textarea/hidden/date/datetime
        try{
            $el.val(String(value));
            $el.trigger('change');
        }catch(err){ log('Generic value set error', err); }
    }

    function initSingleValueDatasource(context){
        var $ctx = context ? $(context) : $(document);
        // Candidate selectors: inputs and textareas with sourceurl or editors with fieldtype markers
        var $targets = $ctx.find('.clarama-field').filter(function(){
            var $el = $(this);
            if ($el.attr('clarama_data_set')) return false; // already initialized
            var ft = $el.attr('fieldtype');
            var supported = (ft === 'html' || ft === 'aceeditor' || ft === 'trumbowyg');
            if (!supported) return false;
            return !!$el.attr('sourceurl');
        });

        $targets.each(function(){
            var $el = $(this);
            var url = $el.attr('sourceurl');
            if (!url) return;
            $el.attr('clarama_data_set', '1');
            log('Fetching single-value data from', url, 'for', this);
            $.ajax({
                url: url,
                dataType: 'json',
                contentType: 'application/json; charset=utf-8',
                type: 'POST',
                data: buildQuery(),
                success: function(data){
                    var val = firstCellFromResult(data);
                    log('Datasource value', val, 'for', url);
                    setValueForElement($el, val);
                },
                error: function(xhr){
                    log('Error fetching datasource', url, xhr && xhr.responseText);
                }
            });
        });
    }

    // Expose and auto-run on DOM ready
    window.initSingleValueDatasource = initSingleValueDatasource;
    $(document).ready(function(){
        initSingleValueDatasource(document);
        // Retry shortly after to ensure editors (ACE/Trumbowyg/Daterangepicker) are initialized
        setTimeout(function(){ initSingleValueDatasource(document); }, 500);
    });
})();
