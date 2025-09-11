/*
 * # Copyright (c) 2025. Euan Duncan Macinnes, euan.d.macinnes@gmail.com, S7479622B - All Rights Reserved
 */

// Stream management: inline rename, add new stream below, delete stream with confirmation
(function () {
    function uniqueStreamName(base) {
        var name = base || 'new';
        var candidate = name;
        var i = 1;
        while (document.getElementById('panelsStayOpen-heading' + candidate) || document.getElementById('stream_' + candidate)) {
            candidate = name + '_' + i;
            i += 1;
        }
        return candidate;
    }

    function updateStreamIds($sectionRoot, oldName, newName, internalTopic) {
        // header and collapse ids
        var $header = $sectionRoot.prev('h2.accordion-header');
        if (!$header.length) {
            $header = $sectionRoot.siblings('h2.accordion-header').filter(function () {
                return $(this).find('.stream-title-text').text().trim() === oldName;
            }).first();
        }
        var $button = $header.find('button.accordion-button');
        var $collapse = $sectionRoot;

        $header.attr('id', 'panelsStayOpen-heading' + newName);
        $button.attr('data-bs-target', '#panelsStayOpen-collapse' + newName);
        $button.attr('aria-controls', 'panelsStayOpen-collapse' + newName);
        $collapse.attr('id', 'panelsStayOpen-collapse' + newName);
        $collapse.attr('aria-labelledby', 'panelsStayOpen-heading' + newName);

        // Update UL and attributes
        var $ul = $collapse.find('ul.stream').first();
        if ($ul.length) {
            $ul.attr('id', 'stream_' + newName);
            $ul.attr('stream', newName);
            var oldStreamNameAttr = $ul.attr('stream-name');
            if (oldStreamNameAttr) {
                var newStreamNameAttr = (internalTopic || '').length ? (internalTopic + '_stream_' + newName + '_step') : oldStreamNameAttr.replace('_stream_' + oldName + '_', '_stream_' + newName + '_');
                $ul.attr('stream-name', newStreamNameAttr);
            }
        }
    }

    function bindStreamHandlers(context) {
        var $root = context ? $(context) : $(document);

        // Inline rename: click on title span to edit
        $root.off('click', '.stream-title-text').on('click', '.stream-title-text', function (e) {
            var $text = $(this);
            var $title = $text.closest('.stream-title');
            var current = $text.text().trim();
            if (current === 'main') return; // cannot rename main
            var $input = $title.find('.stream-title-input');
            $input.val(current).show().focus().select();
            $text.hide();
            // Prevent Bootstrap accordion toggle and event bubbling
            e.preventDefault();
            e.stopPropagation();
        });

        function applyRename($input) {
            var $title = $input.closest('.stream-title');
            var oldName = $title.attr('data-stream');
            var newName = ($input.val() || '').trim();
            if (!newName || newName === oldName) {
                $input.hide();
                $title.find('.stream-title-text').show();
                return;
            }
            // Ensure uniqueness
            if (document.getElementById('stream_' + newName) || document.getElementById('panelsStayOpen-heading' + newName)) {
                flash('A stream named ' + newName + ' already exists', 'warning');
                return;
            }
            // Update DOM
            $title.attr('data-stream', newName);
            $title.find('.stream-title-text').text(newName).show();
            $input.hide();

            // Update IDs/attributes
            var $collapse = $title.closest('.accordion-header').next('.accordion-collapse');
            var internalTopic = $('#edit_socket').attr('topic') || $('.clarama-websocket').attr('topic') || '';
            updateStreamIds($collapse, oldName, newName, internalTopic);
        }

        $root.off('keydown', '.stream-title-input').on('keydown', '.stream-title-input', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                applyRename($(this));
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                $(this).hide().closest('.stream-title').find('.stream-title-text').show();
            }
        });
        // Prevent clicks inside the input from toggling the accordion
        $root.off('click', '.stream-toolbar-button').on('click', '.stream-toolbar-button', function (e) {
            e.preventDefault();
            e.stopPropagation();
        });

        $root.off('blur', '.stream-title-input').on('blur', '.stream-title-input', function () {
            applyRename($(this));
        });

        // Add new stream below
        $root.off('click', '.stream-insert-below').on('click', '.stream-insert-below', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var $btn = $(this);
            // Prefer inserting after the wrapper that contains both header and collapse to avoid nesting
            var $section = $btn.closest('.stream-toolbar-container');
            var $header = $btn.closest('h2.accordion-header');
            var $collapse = $header.next('.accordion-collapse');
            var newName = uniqueStreamName('new');
            var internal_topic = $('#edit_socket').attr('topic') || ($('.clarama-websocket').attr('topic') || '');
            var file_url = $('.clarama-task-save').attr('url') || $('button#save').attr('url') || '';

            var payload = {
                internal_topic: internal_topic,
                file_url: file_url,
                stream: newName,
                steps: [],
                is_first: false
            };

            $.ajax({
                type: 'POST',
                url: '/template/render/explorer/files/_stream_section',
                contentType: 'application/json',
                data: JSON.stringify(payload),
                success: function (html) {
                    // Insert new stream section as a sibling (not nested inside the previous stream's body)
                    if ($section && $section.length) {
                        $(html).insertAfter($section);
                        bindStreamHandlers($section.parent());
                    } else if ($collapse && $collapse.length) {
                        $(html).insertAfter($collapse);
                        bindStreamHandlers($collapse.parent());
                    } else {
                        // Fallback: append to accordion item
                        var $accordionItem = $btn.closest('.accordion-item');
                        $accordionItem.append(html);
                        bindStreamHandlers($accordionItem);
                    }
                    flash('Added stream ' + newName, 'success');
                },
                error: function (xhr) {
                    console.log('Render failed', xhr);
                    flash('Could not render new stream', 'danger');
                }
            });
        });

        // Delete stream
        $root.off('click', '.stream-delete').on('click', '.stream-delete', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var $btn = $(this);
            var $section = $btn.closest('.stream-toolbar-container');
            var $titleText = $section.find('.stream-title-text').first();
            var name = ($titleText.text() || '').trim();
            if (name === 'main') return; // protection
            var $modal = $('#confirmDeleteStreamModal');
            $modal.find('.stream-name').text(name);
            $modal.data('target-section', $section);
            var bsModal = new bootstrap.Modal($modal[0]);
            bsModal.show();
        });

        // Confirm delete
        $(document).off('click', '#confirmDeleteStreamBtn').on('click', '#confirmDeleteStreamBtn', function () {
            var $modal = $('#confirmDeleteStreamModal');
            var $section = $modal.data('target-section');
            if ($section && $section.length) {
                $section.remove();
                flash('Deleted stream', 'success');
            }
            try {
                bootstrap.Modal.getInstance($modal[0]).hide();
            } catch (e) {
            }
        });
    }

    // Initialize on DOM ready
    $(function () {
        bindStreamHandlers(document);
    });
})();
