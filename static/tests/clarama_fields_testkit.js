/*
 * # Copyright (c) 2025. Euan Duncan Macinnes, euan.d.macinnes@gmail.com, S7479622B - All Rights Reserved
 */

/* Clarama Fields Standalone Test Kit
 * Utilities to mount clarama fields via clarama-post-embedded and verify behaviors:
 * 1) dynamic load via /render/embed/
 * 2) default values from .field.yaml
 * 3) capture via get_field_values()
 * 4) interaction events trigger without errors
 * 5) multiple instances do not conflict
 */
(function(global){
    'use strict';

    // Root for server-relative calls; override by setting window.$CLARAMA_ROOT before using the kit
    if(typeof global.$CLARAMA_ROOT === 'undefined') global.$CLARAMA_ROOT = '';

    // Ensure jQuery exists
    function $(sel){ return global.jQuery(sel); }

    function ensureDeps(){
        if(!global.jQuery){ console.warn('jQuery not loaded; tests may fail'); }
        if(typeof global.enable_interactions !== 'function'){
            console.warn('enable_interactions not available; loading may not initialize interactions');
        }
        if(typeof global.get_field_values !== 'function'){
            console.warn('get_field_values not available; value capture test will fail');
        }
    }

    // Render two instances of the specified .field.yaml (relative to content root)
    // opts: { yamlPath, container, title }
    function renderFieldTwice(opts){
        ensureDeps();
        const yamlPath = opts.yamlPath;
        const $container = $(opts.container || '#app');
        const title = opts.title || yamlPath;
        const url = '/render/embed/' + yamlPath;
        const html = [
            '<div class="card mb-3">',
            ' <div class="card-header"><b>', title, '</b></div>',
            ' <div class="card-body">',
            '   <div class="row g-3">',
            '     <div class="col-md-6">',
            '       <div id="fieldA" class="clarama-post-embedded" url="', url, '"></div>',
            '     </div>',
            '     <div class="col-md-6">',
            '       <div id="fieldB" class="clarama-post-embedded" url="', url, '"></div>',
            '     </div>',
            '   </div>',
            '   <div class="mt-3">',
            '     <button id="btnCapture" class="btn btn-primary btn-sm">get_field_values()</button>',
            '     <button id="btnTrigger" class="btn btn-outline-secondary btn-sm ms-2">Trigger Interaction</button>',
            '   </div>',
            '   <pre class="mt-2 bg-light p-2" id="out"></pre>',
            ' </div>',
            '</div>'
        ].join('');
        $container.append(html);

        // Initialize interactions and load
        if(typeof global.enable_interactions === 'function'){
            global.enable_interactions($(document.body));
        }

        // Wire capture
        $('#btnCapture').on('click', function(){
            try{
                const values = global.get_field_values('test', false, function(){});
                $('#out').text(JSON.stringify(values, null, 2));
            }catch(e){
                $('#out').text('get_field_values failed: ' + e);
            }
        });

        // Attempt to trigger the most common interactions
        $('#btnTrigger').on('click', function(){
            try{
                // Heuristic: fire change/input/click events on common elements within both instances
                ['fieldA','fieldB'].forEach(id=>{
                    const $root = $('#'+id);
                    $root.find('input[type=text], input[type=number], input[type=password], textarea').first().trigger('input').trigger('change');
                    $root.find('input[type=checkbox], input[type=radio]').first().prop('checked', function(i,v){return !v}).trigger('change');
                    $root.find('select').first().val(function(i,v){ return v; }).trigger('change');
                    $root.find('button, .clarama-button-field').first().trigger('click');
                });
                $('#out').text('Triggered interactions. Check console for any errors.');
            }catch(e){ $('#out').text('Trigger failed: '+e); }
        });
    }

    // Utility to show current default values by reading DOM value attributes (best-effort after load)
    function readDefaults(container){
        const $c = $(container || document.body);
        const vals = {};
        $c.find('.clarama-field').each(function(){
            const $f = $(this);
            const name = $f.attr('name') || $f.attr('id');
            let v = null;
            if($f.is(':checkbox')) v = $f.is(':checked');
            else if($f.is('select')) v = $f.val();
            else v = $f.val();
            vals[name] = v;
        });
        return vals;
    }

    global.ClaramaFieldTestKit = {
        renderFieldTwice: renderFieldTwice,
        readDefaults: readDefaults
    };
})(window);
