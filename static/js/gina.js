document.addEventListener('DOMContentLoaded', () => {
    const ginaButton        = document.getElementById('gina-button');
    const mainContent       = document.getElementById('main-content');
    const ginaContainer     = document.getElementById('gina-chat-container');
    const ginaButtonGroup   = document.querySelector('.gina-button-group');
    const ginaSaveBtn       = document.querySelector('.gina-save-btn');
    const conversationsHost = document.getElementById('gina-conversations');

    if (!ginaButton || !mainContent || !ginaContainer || !conversationsHost) {
      console.error('GINA: Missing required DOM nodes.');
      return;
    }

    // ===== Auto-resize helpers (new) =========================================
    function readPxVar(el, varName, fallback) {
        const v = getComputedStyle(el).getPropertyValue(varName)?.trim();
        if (!v) return fallback;
        const num = parseInt(v, 10);
        return Number.isFinite(num) ? num : fallback;
    }

    function autoSize(el, { expandFully = false } = {}) {
        if (!el) return;
        // Get per-container variables (fall back to defaults)
        const scope = el.closest('#gina-chat-container') || document.documentElement;
        const minH  = readPxVar(scope, '--gina-input-min', 80);
        const maxH  = readPxVar(scope, '--gina-input-max', 240);

        // Reset height to measure true scrollHeight
        el.style.height = 'auto';

        const full = el.scrollHeight;

        if (expandFully) {
            // Show entire input; remove cap and scrolling
            el.classList.add('expanded');
            el.style.maxHeight = 'none';
            el.style.overflowY = 'hidden';
            el.style.height = full + 'px';
            el.scrollTop = 0;
            return;
        }

        // Normal typing mode: cap at max; scroll if needed
        el.classList.remove('expanded');
        const next = Math.max(minH, Math.min(full, maxH));
        el.style.maxHeight = maxH + 'px';
        el.style.overflowY = (full > maxH) ? 'auto' : 'hidden';
        el.style.height = next + 'px';
    }

    // ===== Global state ======================================================
    let isProcessing    = false;
    let currentQuestion = '';
    let currentAnswer   = '';
    let activeBlock     = null; // the block currently being processed

    // ===== UI toggle
    ginaButton.addEventListener('click', () => {
        const open = ginaContainer.classList.contains('active');
        if (!open) {
            mainContent.classList.add('hidden');
            ginaContainer.classList.add('active');
            ginaButtonGroup?.classList.add('gina-active');
            // focus first available input
            const firstInput = conversationsHost.querySelector('.gina-input');
            setTimeout(() => {
                if (firstInput) {
                    firstInput.focus();
                    autoSize(firstInput);
                }
            }, 300);
        } else {
            ginaContainer.classList.remove('active');
            ginaButtonGroup?.classList.remove('gina-active');
            setTimeout(() => mainContent.classList.remove('hidden'), 300);
        }
    });

    // ===== Helpers

    function setProcessingState(v) {
        isProcessing = v;
        // Also reflect on the active block’s input/button if present
        if (activeBlock) {
            const input = activeBlock.querySelector('.gina-input');
            const btn   = activeBlock.querySelector('.gina-send-btn');
            if (input) {
                if (v) {
                    input.classList.add('locked');
                    input.setAttribute('readonly', 'readonly');
                } else {
                    input.classList.remove('locked');
                    input.removeAttribute('readonly');
                }
            }
            if (btn) btn.disabled = v;
        }
    }

    function toggleSendButtonFor(block) {
        if (!block) return;
        const input         = block.querySelector('.gina-input');
        const sendContainer = block.querySelector('.gina-send-container');
        if (!input || !sendContainer) return;
        const hasText = input.value.trim().length > 0;
        if (hasText && !isProcessing) sendContainer.classList.add('show');
        else sendContainer.classList.remove('show');
    }

    function findKernelId() {
        const candidates = [
            document.querySelector('.clarama-websocket[task_kernel_id]'),
            document.querySelector('[task_kernel_id]'),
            document.getElementById('edit_socket') // fallback
        ].filter(Boolean);

        for (const el of candidates) {
            const kid = el.getAttribute && el.getAttribute('task_kernel_id');
            if (kid) return kid;
        }
        if (window.task_active_socket && window.task_active_socket.kernel_id) {
            return window.task_active_socket.kernel_id;
        }
        return null;
    }

    function safeText(s) {
        return (s == null) ? '' : String(s);
    }

    // Wait until the placeholder div (clarama-replaceable) has been replaced and
    // a .gina-block with the expected id is present and hydrated.
    function waitForRenderedBlock(blockId, timeoutMs = 5000) {
        return new Promise((resolve, reject) => {
            const endAt = Date.now() + timeoutMs;

            function tryFind() {
                const block = conversationsHost.querySelector(`#gina-block-${blockId}.gina-block`);
                const ready = block &&
                    block.querySelector('.gina-input') &&
                    block.querySelector('.gina-send-btn') &&
                    block.querySelector('.gina-output') &&
                    block.querySelector('.gina-output-container');
                if (ready) {
                    resolve(block);
                    return true;
                }
                return false;
            }

            if (tryFind()) return;

            const mo = new MutationObserver(() => {
                if (tryFind()) {
                    mo.disconnect();
                } else if (Date.now() > endAt) {
                    mo.disconnect();
                    reject(new Error('Timeout waiting for block to render'));
                }
            });
            mo.observe(conversationsHost, { childList: true, subtree: true });

            // Failsafe timeout
            setTimeout(() => {
                mo.disconnect();
                if (!tryFind()) reject(new Error('Timeout waiting for block to render'));
            }, timeoutMs);
        });
    }

    function nextBlockId() {
        // Scan the last rendered .gina-block id suffix; fallback to 1
        const last = $(".gina-block").last().attr("id"); 
        if (!last) return 1;
        const m = String(last).match(/(\d+)$/);
        return m ? (parseInt(m[1], 10) + 1) : 1;
    }

    function buildPlaceholder(blockId) {
        const ph = document.createElement('div');
        ph.className = 'clarama-post-embedded clarama-replaceable';
        ph.setAttribute('url', `/template/render/explorer/files/conversation_block?block_id=${blockId}`);
        return ph;
    }

    async function spawnNextConversationTemplate() {
        // Append placeholder
        const blockId = nextBlockId();
        const placeholder = buildPlaceholder(blockId);
        conversationsHost.appendChild(placeholder);

        // IMPORTANT: Call enable_interactions on the PARENT container (like chart_options.js)
        enable_interactions($(conversationsHost));

        try {
            const block = await waitForRenderedBlock(blockId, 6000);
            // Focus, init button visibility & autosize
            const input = block.querySelector('.gina-input');
            if (input) {
                input.focus();
                autoSize(input);
            }
            toggleSendButtonFor(block);

            // Scroll to bottom
            try {
                conversationsHost.scrollTo({ top: conversationsHost.scrollHeight, behavior: 'smooth' });
            } catch {}
        } catch (err) {
            console.error('GINA: failed to render next conversation block:', err);
            try { flash('Failed to load the next conversation block. Please try again.', 'danger'); } catch {}
        }
    }

    // ===== Kernel run + WS interception

    function runQuestionThroughKernel(questionText, forBlock) {
        get_field_values({}, true, function (field_registry) {
            field_registry['clarama_task_kill'] = false;

            const task_kernel_id = findKernelId();
            if (!task_kernel_id) {
                console.error('GINA: No kernel id found on the page.');
                const msg = 'Unable to find a running kernel. Please open any task/session first.';
                try { flash(msg, "danger"); } catch {}
                // write error into this block
                const out = forBlock?.querySelector('.gina-output');
                if (out) {
                    out.classList.remove('loading');
                    out.innerHTML = `<span style="color:#ff6b6b;">Error: ${msg}</span>`;
                }
                setProcessingState(false);
                spawnNextConversationTemplate();
                return;
            }

            const url = $CLARAMA_ENVIRONMENTS_KERNEL_RUN + task_kernel_id;
            const task_registry = {
                streams: [{ main: [{ source: questionText, type: 'question' }] }],
                parameters: field_registry
            };

            $.ajax({
                type: 'POST',
                url,
                datatype: 'html',
                contentType: 'application/json',
                data: JSON.stringify(task_registry),
                success: function (data) {
                    if (data && data['data'] === 'ok') {
                        return;
                    }
                    const err = (data && data['error']) ? data['error'] : 'An error occurred while processing your question.';
                    console.warn('GINA kernel run error:', data);
                    try { flash("Couldn't process question: " + err, "danger"); } catch {}
                    const out = forBlock?.querySelector('.gina-output');
                    if (out) {
                        out.classList.remove('loading');
                        out.innerHTML = `<span style="color:#ff6b6b;">Error: ${safeText(err)}</span>`;
                    }
                    setProcessingState(false);
                    spawnNextConversationTemplate();
                },
                error: function (xhr) {
                    console.error('GINA kernel run network/access error:', xhr);
                    try { flash("Couldn't process question, network or access issue", "danger"); } catch {}
                    const out = forBlock?.querySelector('.gina-output');
                    if (out) {
                        out.classList.remove('loading');
                        out.innerHTML = `<span style="color:#ff6b6b;">Error: network or access issue</span>`;
                    }
                    setProcessingState(false);
                    spawnNextConversationTemplate();
                }
            });
        });
    }

    function installWSInterceptor() {
        if (window.__ginaWSInstalled) return;
        window.__ginaWSInstalled = true;

        function wait() {
            if (typeof task_active_socket !== 'undefined' && task_active_socket && task_active_socket.onmessage) {
                if (!window.originalWebSocketOnMessage) window.originalWebSocketOnMessage = task_active_socket.onmessage;

                task_active_socket.onmessage = function (event) {
                    let dict;
                    try { dict = JSON.parse(event.data); } catch { /* not JSON; pass-through */ }

                    if (isProcessing && activeBlock && dict && dict.class === 'template') {
                        const html  = dict.template || dict.values?.template || '';
                        const outArr = dict.Output || dict.output || dict.values?.output;

                        const isPrintResponseHTML = typeof html === 'string' && html.indexOf('class="print_response"') !== -1;
                        const hasOutputArray      = Array.isArray(outArr) && outArr.length > 0;

                        if (isPrintResponseHTML || hasOutputArray) {
                            let text = '';
                            if (hasOutputArray) {
                                text = outArr.join('\n');
                            } else if (isPrintResponseHTML) {
                                const tmp = document.createElement('div');
                                tmp.innerHTML = html;
                                const pre = tmp.querySelector('.print_response');
                                text = (pre?.textContent || pre?.innerText || '').trim();
                            }

                            currentAnswer = safeText(text).trim();
                            const out = activeBlock.querySelector('.gina-output');
                            if (out) {
                                out.classList.remove('loading');
                                out.classList.add('locked');
                                out.style.whiteSpace = 'pre-wrap';
                                out.textContent = currentAnswer || 'Response received but was empty';
                            }

                            // Mark this block as complete
                            activeBlock.classList.remove('processing');
                            activeBlock = null;

                            setProcessingState(false);
                            try { flash("Question processed successfully", "success"); } catch {}

                            // Append a fresh block
                            spawnNextConversationTemplate();

                            // Let platform continue its default handling
                            if (window.originalWebSocketOnMessage) {
                                window.originalWebSocketOnMessage.call(this, event);
                            }
                            return;
                        }
                    }

                    if (window.originalWebSocketOnMessage) {
                        window.originalWebSocketOnMessage.call(this, event);
                    }
                };
            } else {
                setTimeout(wait, 120);
            }
        }
        wait();
    }

    installWSInterceptor();

    // ===== Delegated events for dynamic blocks (like chart_options.js)
    conversationsHost.addEventListener('input', (e) => {
        if (!e.target.matches('.gina-input')) return;
        autoSize(e.target);
        const block = e.target.closest('.gina-block');
        toggleSendButtonFor(block);
    });

    // Enter => send; Shift+Enter => newline
    conversationsHost.addEventListener('keydown', (e) => {
        if (!e.target.matches('.gina-input') || e.isComposing) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const block = e.target.closest('.gina-block');
            const btn   = block.querySelector('.gina-send-btn');
            btn?.click();
        }
    });

    // Click send
    conversationsHost.addEventListener('click', (e) => {
        const btn = e.target.closest('.gina-send-btn');
        if (!btn) return;
        if (isProcessing) return;

        const block        = btn.closest('.gina-block');
        const input        = block.querySelector('.gina-input');
        const outContainer = block.querySelector('.gina-output-container');
        const out          = block.querySelector('.gina-output');

        const msg = safeText(input?.value).trim();
        if (!msg) return;

        autoSize(input, { expandFully: true });

        // Lock this block’s input & button; show output area
        currentQuestion = msg;
        block.classList.add('processing');
        activeBlock = block;

        btn.disabled = true;
        input.classList.add('locked');
        input.setAttribute('readonly', 'readonly');

        outContainer.style.display = 'block';
        out.classList.add('loading');
        out.textContent = 'Processing your question...';

        // Hide the send bubble
        const sendContainer = block.querySelector('.gina-send-container');
        sendContainer?.classList.remove('show');

        setProcessingState(true);
        runQuestionThroughKernel(msg, block);
    });

    // Save current Convo
    ginaSaveBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!currentQuestion || !currentAnswer) {
            try { flash('No conversation to save', 'warning'); } catch {}
            return;
        }
        try { flash('Conversation saved successfully', 'success'); } catch {}
    });

    // ===== Bootstrapping: ensure there is at least one block and that it’s wired
    (function ensureInitialBlock() {
        const hasBlock = conversationsHost.querySelector('.gina-block');
        if (!hasBlock) {
            // Create first block from template
            const blockId = 1;
            conversationsHost.appendChild(buildPlaceholder(blockId));
            enable_interactions($(conversationsHost));
            // no need to wait here; delegated handlers will work once loaded
        } else {
            // If server rendered the first block, just normalize its UI state
            const firstInput = conversationsHost.querySelector('.gina-input');
            if (firstInput) {
                autoSize(firstInput);
                toggleSendButtonFor(firstInput.closest('.gina-block'));
            }
        }
    })();
});
