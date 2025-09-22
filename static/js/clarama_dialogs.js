/*
 * # Copyright (c) 2025. Euan Duncan Macinnes, euan.d.macinnes@gmail.com, S7479622B - All Rights Reserved
 */

/*
 * Clarama Dialogs - Centralized modal helpers for Bootstrap/jQuery
 * Provides:
 *   - ClaramaDialogs.ensureModal(id, opts)
 *   - ClaramaDialogs.showModal(opts) -> returns jQuery modal element
 *   - ClaramaDialogs.confirm(opts) -> Promise<boolean>
 *   - ClaramaDialogs.loadTemplateModal(templatePath, title?, opts?) -> Promise<jQuery>
 *
 * Usage via data-attributes on trigger elements:
 *   <button class="clarama-dialog"
 *           data-dialog="template"
 *           data-template="help/opcua_server_config"
 *           data-title="OPC-UA YAML Example">Help</button>
 *   <button class="clarama-dialog"
 *           data-dialog="confirm"
 *           data-message="Replace config?"
 *           data-confirm-text="Replace"
 *           data-cancel-text="Cancel">Replace</button>
 */
(function(window, $){
  if(!$){ return; }

  const DEFAULT_IDS = {
    help: 'clarama-generic-modal',
    confirm: 'clarama-confirm-modal'
  };

  function ensureModal(id, options){
    const opts = $.extend({
      title: 'Dialog',
      body: '<div class="text-muted">...</div>',
      size: '', // '', 'modal-lg', 'modal-sm'
      footer: null, // html or function($m)
      static: false // backdrop static
    }, options||{});

    let $m = $('#'+id);
    if($m.length === 0){
      const html = [
        '<div class="modal fade" id="'+id+'" tabindex="-1" aria-hidden="true">',
        '  <div class="modal-dialog '+(opts.size||'')+'">',
        '    <div class="modal-content">',
        '      <div class="modal-header">',
        '        <h5 class="modal-title">'+opts.title+'</h5>',
        '        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>',
        '      </div>',
        '      <div class="modal-body">'+opts.body+'</div>',
        '      <div class="modal-footer">'+(typeof opts.footer==='string'? opts.footer: '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>')+'</div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join('');
      $('body').append(html);
      $m = $('#'+id);
      if(typeof opts.footer === 'function'){
        opts.footer($m);
      }
    } else {
      // refresh title/body/footer if already exists
      $m.find('.modal-title').html(opts.title || 'Dialog');
      $m.find('.modal-body').html(opts.body || '');
      if(typeof opts.footer === 'string'){
        $m.find('.modal-footer').html(opts.footer);
      } else if(typeof opts.footer === 'function'){
        $m.find('.modal-footer').empty();
        opts.footer($m);
      }
    }
    return $m;
  }

  function showBootstrapModal($m, staticBackdrop){
    try {
      const el = $m.get(0);
      const inst = new bootstrap.Modal(el, {backdrop: staticBackdrop? 'static': true, keyboard: !staticBackdrop});
      inst.show();
      return inst;
    } catch(e) {
      // jQuery fallback
      $m.modal({backdrop: staticBackdrop? 'static': true, keyboard: !staticBackdrop, show: true});
      return null;
    }
  }

  function showModal(options){
    const opts = $.extend({ id: DEFAULT_IDS.help }, options||{});
    const $m = ensureModal(opts.id, opts);
    showBootstrapModal($m, !!opts.static);
    return $m;
  }

  function confirm(options){
    const opts = $.extend({
      id: DEFAULT_IDS.confirm,
      title: 'Confirm action',
      message: 'Are you sure?',
      confirmText: 'OK',
      cancelText: 'Cancel',
      confirmClass: 'btn-primary'
    }, options||{});
    const footerHtml = [
      '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">'+opts.cancelText+'</button>',
      '<button type="button" class="btn '+opts.confirmClass+' btn-confirm">'+opts.confirmText+'</button>'
    ].join('');
    const $m = ensureModal(opts.id, { title: opts.title, body: '<div class="confirm-message">'+$('<div>').text(opts.message).html()+'</div>', footer: footerHtml });
    return new Promise(function(resolve){
      let resolved = false;
      function cleanup(){ $m.off('click', '.btn-confirm'); $m.off('hidden.bs.modal'); }
      $m.on('click', '.btn-confirm', function(){
        resolved = true; cleanup();
        try{ (bootstrap.Modal.getInstance($m.get(0))||new bootstrap.Modal($m.get(0))).hide(); }catch(e){ $m.modal('hide'); }
        resolve(true);
      });
      $m.on('hidden.bs.modal', function(){ if(!resolved){ cleanup(); resolve(false); } });
      showBootstrapModal($m, true);
    });
  }

  function loadTemplateModal(templatePath, title, opts){
    const options = $.extend({ id: DEFAULT_IDS.help, title: title || 'Help', size: 'modal-lg modal-dialog-scrollable' }, opts||{});
    const $m = ensureModal(options.id, { title: options.title, body: '<div class="text-muted">Loading...</div>', size: options.size, footer: '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>' });
    showBootstrapModal($m, false);
    return $.ajax({
      url: '/template/render/' + templatePath,
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({})
    }).done(function(html){
      $m.find('.modal-body').html(html);
      try{ Prism.highlightAll(); }catch(e){}
    }).fail(function(xhr){
      const msg = (xhr.responseJSON && xhr.responseJSON.error) || xhr.responseText || 'Failed to load template';
      $m.find('.modal-body').html('<div class="alert alert-danger">'+ $('<div>').text(msg).html() +'</div>');
    }).then(function(){ return $m; });
  }

  // Auto-wiring for elements with class .clarama-dialog
  $(document).on('click', '.clarama-dialog', function(){
    const $btn = $(this);
    const kind = ($btn.data('dialog')||'').toString();
    if(kind === 'confirm'){
      confirm({
        title: $btn.data('title') || 'Confirm action',
        message: $btn.data('message') || 'Are you sure?',
        confirmText: $btn.data('confirmText') || $btn.data('confirm-text') || 'OK',
        cancelText: $btn.data('cancelText') || $btn.data('cancel-text') || 'Cancel',
        confirmClass: $btn.data('confirmClass') || $btn.data('confirm-class') || 'btn-primary'
      }).then(function(ok){
        $btn.trigger('clarama:confirm', [ok]);
      });
      return false;
    }
    if(kind === 'template'){
      const tpl = $btn.data('template');
      if(!tpl){ return; }
      const ttl = $btn.data('title') || 'Help';
      loadTemplateModal(tpl, ttl);
      return false;
    }
    // default: simple modal with content from data-body
    showModal({
      id: ($btn.data('id')||DEFAULT_IDS.help),
      title: $btn.data('title') || 'Dialog',
      body: $btn.data('body') || '<div class="text-muted">...</div>'
    });
    return false;
  });

  window.ClaramaDialogs = {
    ensureModal: ensureModal,
    showModal: showModal,
    confirm: confirm,
    loadTemplateModal: loadTemplateModal
  };
})(window, window.jQuery);
