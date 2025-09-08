/*
 * # Copyright (c) 2025. Euan Duncan Macinnes, euan.d.macinnes@gmail.com, S7479622B - All Rights Reserved
 */

(function(window, $){
  function init(container, options){
    const opts = $.extend({
      fields: {},
      previewUrl: '/api/preview_global_field',
      initialExpression: '',
      onChange: null
    }, options||{});
    const $root = $(container);
    $root.addClass('gfe-root');
    const html = [
      '<div class="gfe-toolbar mb-2">',
      '  <select class="form-select form-select-sm gfe-field-select" style="max-width:300px; display:inline-block;">',
      '    <option value="">Select field to insert...</option>',
      '  </select>',
      '  <button type="button" class="btn btn-sm btn-secondary ms-2 gfe-insert">Insert [[field]]</button>',
      '  <div class="d-inline-flex align-items-center ms-3 gfe-options">',
      '    <label class="me-1 small text-muted">Layout:</label>',
      '    <select class="form-select form-select-sm gfe-layout" style="max-width:160px; display:inline-block;">',
      '      <option value="">(none)</option>',
      '      <option value="list">list</option>',
      '      <option value="sql">sql</option>',
      '      <option value="in">in</option>',
      '      <option value="where">where</option>',
      '      <option value="search">search</option>',
      '    </select>',
      '    <input type="text" class="form-control form-control-sm ms-2 gfe-extension" placeholder=":extension (optional)" style="width:220px;">',
      '    <input type="text" class="form-control form-control-sm ms-2 gfe-mapto" placeholder="map (from=>to) optional" style="width:220px;">',
      '    <button type="button" class="btn btn-sm btn-outline-secondary ms-2 gfe-insert-advanced" title="Insert with options">Insert with options</button>',
      '  </div>',
      '</div>',
      '<div class="gfe-editor mb-2">',
      '  <textarea class="form-control gfe-expression" rows="5" placeholder="Type expression with [[field]] placeholders..."></textarea>',
      '</div>',
      '<div class="gfe-result alert alert-secondary small" style="display:none;"></div>'
    ].join('');
    $root.html(html);

    // populate fields
    const $sel = $root.find('.gfe-field-select');
    Object.keys(opts.fields).sort().forEach(k=>{
      $sel.append('<option value="'+$('<div>').text(k).html()+'">'+k+'</option>');
    });

    const $ta = $root.find('.gfe-expression');
    if(opts.initialExpression){ $ta.val(opts.initialExpression); }

    function insertToken(token){
      const ta = $ta.get(0);
      const start = ta.selectionStart || 0;
      const end = ta.selectionEnd || 0;
      const val = $ta.val();
      const newVal = val.substring(0,start) + token + val.substring(end);
      $ta.val(newVal);
      // restore caret after token
      const pos = start + token.length;
      ta.setSelectionRange(pos,pos);
      ta.focus();
      if(typeof opts.onChange==='function') opts.onChange(newVal);
    }

    $root.on('click', '.gfe-insert', function(){
      const f = $sel.val();
      if(!f) return;
      insertToken('[[ '+f+' ]]');
    });

    $root.on('click', '.gfe-insert-advanced', function(){
      const f = $sel.val();
      if(!f) return;
      const layout = ($root.find('.gfe-layout').val()||'').trim();
      const ext = ($root.find('.gfe-extension').val()||'');
      const mapto = ($root.find('.gfe-mapto').val()||'').trim();
      let key = f;
      if(mapto){
        // allow user to type either "to" only (assume from is selected field) or full from=>to
        if(mapto.includes('=>')){
          key = mapto; // assume full mapping provided
        }else{
          key = f + '=>'+ mapto;
        }
      }
      let token = '[[ ' + key;
      if(layout){ token += ':'+layout; }
      if(layout){ token += ':' + ext; } else if(ext){ /* no layout but ext set; ignore per grammar */ }
      token += ' ]]';
      insertToken(token);
    });

    $sel.on('change', function(){
      updateExpressionFromControls();
    });

    // Debounce helper
    function debounce(fn, wait){
      let t; return function(){
        const ctx=this, args=arguments; clearTimeout(t);
        t = setTimeout(function(){ fn.apply(ctx, args); }, wait);
      };
    }

    // Build a token from current controls without modifying the textarea
    function buildTokenFromControls(){
      const f = $sel.val();
      if(!f) return '';
      const layout = ($root.find('.gfe-layout').val()||'').trim();
      const ext = ($root.find('.gfe-extension').val()||'');
      const mapto = ($root.find('.gfe-mapto').val()||'').trim();
      let key = f;
      if(mapto){
        key = mapto.includes('=>') ? mapto : (f + '=>'+ mapto);
      }
      let token = '[[ ' + key;
      if(layout){ token += ':'+layout; }
      if(layout){ token += ':' + ext; }
      token += ' ]]';
      return token;
    }

    // Create suitable example varlist based on layout
    function buildExampleFieldsForLayout(layout, fromKey, base){
      const example = $.extend(true, {}, base || {});
      const ensureList = function(){
        if(!Array.isArray(example[fromKey])) example[fromKey] = ['alpha','beta'];
      };
      switch(layout){
        case 'list':
        case 'sql':
        case 'in':
        case 'where':
          ensureList();
          break;
        case 'search':
          if(!example.hasOwnProperty('search')) example.search = 'san';
          // for search, field list not required; but if fromKey missing, add a sample value list to look realistic
          if(!example.hasOwnProperty(fromKey)) example[fromKey] = ['sample'];
          break;
        default:
          // simple substitution
          if(example[fromKey] === undefined) example[fromKey] = 'example';
      }
      return example;
    }

    function showResult(ok, text){
      const $r = $root.find('.gfe-result');
      $r.removeClass('alert-success alert-danger alert-secondary')
        .addClass(ok? 'alert-success':'alert-danger')
        .text(text)
        .show();
    }

    function showLive(text){
      showResult(true, 'Live preview: ' + String(text));
    }

    function livePreview(){
      const token = buildTokenFromControls();
      if(!token){
        // If no field selected for controls, fallback to previewing the current textarea
        if($ta.val().trim() === ''){ $root.find('.gfe-result').hide(); return; }
        doPreview($ta.val(), opts.fields, true);
        return;
      }
      // Build an expression just from this token for non-invasive preview
      const expr = token;
      // Determine fromKey for example varlist (part before mapping if present)
      const inside = token.replace(/^\[\[\s*/, '').replace(/\s*\]\]$/, '');
      const parts = inside.split(':');
      const keyPart = parts[0];
      const layout = (parts[1]||'').trim();
      const fromKey = keyPart.includes('=>') ? keyPart.split('=>')[0].trim() : keyPart.trim();
      const fields = buildExampleFieldsForLayout(layout, fromKey, opts.fields);
      doPreview(expr, fields, true);
    }

    const doPreview = debounce(function(expression, fields, live){
      $.ajax({
        url: opts.previewUrl,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ expression: expression, fields: fields })
      }).done(function(res){
        if(res && res.status==='ok'){
          if(live) showLive(res.result); else showResult(true, String(res.result));
        }else{
          showResult(false, (res && res.error) || 'Unknown error');
        }
      }).fail(function(xhr){
        const msg = (xhr.responseJSON && xhr.responseJSON.error) || xhr.responseText || 'Request failed';
        showResult(false, msg);
      });
    }, 250);

    function updateExpressionFromControls(){
      const token = buildTokenFromControls();
      $ta.val(token || '');
      if((token||'').trim()===''){
        $root.find('.gfe-result').hide();
      }
      $ta.trigger('input');
    }
    function scheduleLivePreview(){ livePreview(); }

    // Trigger live preview on controls and text input (and also update textarea)
    $root.on('input', '.gfe-layout, .gfe-extension, .gfe-mapto', updateExpressionFromControls);
    $root.on('change', '.gfe-layout, .gfe-mapto, .gfe-field-select', updateExpressionFromControls);

    $ta.on('input', function(){
      if(typeof opts.onChange==='function') opts.onChange($ta.val());
      // also live preview the current expression when user types
      if($ta.val().trim() !== '') doPreview($ta.val(), opts.fields, true);
    });


    return {
      getExpression: function(){ return $ta.val(); },
      setExpression: function(v){ $ta.val(v); },
      setFields: function(dict){ opts.fields = dict||{}; $sel.find('option:not(:first)').remove(); Object.keys(opts.fields).sort().forEach(k=>{$sel.append('<option value="'+$('<div>').text(k).html()+'">'+k+'</option>');}); }
    };
  }

  window.GlobalFieldEditor = { init: init };
})(window, jQuery);
