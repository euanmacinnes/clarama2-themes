 function hoverover_this(elem)
 {
     elem.off('hover');
     elem.hover(function(){
        $($(this).attr("hovertarget") || this).animate({"opacity": 1});
    },function(){
        $($(this).attr("hovertarget") || this).animate({"opacity": $(this).attr('opacity') || 0});
    });
 }

 function hoverover_off(elem)
 {
     elem.off('hover');
     elem.css({ 'opacity' : 1 });
 }

 $(document).ready(function() {
  var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
  var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
  return new bootstrap.Tooltip(tooltipTriggerEl)
})
  });

