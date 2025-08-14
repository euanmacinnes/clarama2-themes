document.addEventListener('DOMContentLoaded', () => {
    // --- DOM refs -------------------------------------------------------------
    const ginaButton      = document.getElementById('gina-button');
    const mainContent     = document.getElementById('main-content');
    const ginaContainer   = document.getElementById('gina-chat-container');    
    const ginaButtonGroup = document.querySelector('.gina-button-group');
    const ginaSaveBtn     = document.querySelector('.gina-save-btn');
    const historyHost     = document.getElementById('gina-conversations');      
    const latestHost      = document.getElementById('gina-latest');
    const splash          = getSplash();
  
    if (!ginaContainer || !historyHost || !latestHost) {
        console.error('GINA: Missing required DOM nodes (#gina-chat-container / #gina-conversations / #gina-latest).');
        return;
    }
  
    // --- Progressive height config -------------------------------------------
    const HEIGHT_VH_START = 20;  // used only once there are messages
    const HEIGHT_VH_MAX   = 80;  // soft cap
    const GROWTH_K        = 0.35; // higher = faster growth per message
    const EMPTY_PX_HEIGHT = 250;  // fixed empty-state height in px
  
    function getSplash() { 
        return document.getElementById('gina-splash'); 
    }      

    function historyCount() {
        return historyHost.querySelectorAll('.gina-block').length;
    }

    function computeHeightVH(n) {
        return HEIGHT_VH_START + (HEIGHT_VH_MAX - HEIGHT_VH_START) * (1 - Math.exp(-GROWTH_K * n));
    }

    function applyPanelHeight() {
        const n = historyCount();
        if (n === 0) { // no messages yet
            ginaContainer.style.height = `${EMPTY_PX_HEIGHT}px`;
            return;
        }
        const vh = computeHeightVH(n);
        ginaContainer.style.height = `${vh}vh`;
    }
  
    function stickHistoryToBottom() {
        historyHost.scrollTop = historyHost.scrollHeight;
    }
  
    // --- Splash control -------------------------------------------------------
    function hideSplash(animated = true) {
        const splash = getSplash();
        if (!splash) return;
        if (splash.dataset.hidden === '1') return;
        splash.dataset.hidden = '1';
        if (animated) {
            splash.classList.add('hide');
            setTimeout(() => splash.remove(), 400);
        } else {
            splash.remove();
        }
    }
  
    // --- Utils: autosize textarea --------------------------------------------
    function readPxVar(el, varName, fallback) {
        const v = getComputedStyle(el).getPropertyValue(varName)?.trim();
        if (!v) return fallback;
        const num = parseInt(v, 10);
        return Number.isFinite(num) ? num : fallback;
    }

    function autoSize(el, { expandFully = false } = {}) {
        if (!el) return;
        const scope = el.closest('#gina-chat-container') || document.documentElement;
        const minH  = readPxVar(scope, '--gina-input-min', 80);
        const maxH  = readPxVar(scope, '--gina-input-max', 240);
    
        el.style.height = 'auto';
        const full = el.scrollHeight;
    
        if (expandFully) {
            el.classList.add('expanded');
            el.style.maxHeight = 'none';
            el.style.overflowY = 'hidden';
            el.style.height = full + 'px';
            el.scrollTop = 0;
            return;
        }
    
        el.classList.remove('expanded');
        const next = Math.max(minH, Math.min(full, maxH));
        el.style.maxHeight = maxH + 'px';
        el.style.overflowY = (full > maxH) ? 'auto' : 'hidden';
        el.style.height = next + 'px';
    }
  
    // --- State ----------------------------------------------------------------
    let isProcessing = false;
    let currentQuestion = '';
    let currentAnswer = '';
    let activeBlock = null;
  
    // --- Voice input (Web Speech API) -----------------------------------------
    let recognition = null;
    let isListening = false;
    let listeningBlock = null;   // the block whose input we are filling
    let listeningBtn = null;     // the mic button being toggled
    let listeningInput = null;   // textarea element
    let baseInputValue = '';     // value at the start of recording
  
    function getRecognition() {
        if (recognition) return recognition;
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return null;
        recognition = new SpeechRecognition();
        recognition.lang = (document.documentElement.lang || 'en-UK');
        recognition.continuous = false;
        recognition.interimResults = true;
    
        recognition.onstart = () => {
            isListening = true;
            toggleMicUI(true);
        };
        recognition.onresult = (event) => {
            if (!listeningInput) return;
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
            }
            const joiner = baseInputValue && !/\s$/.test(baseInputValue) ? ' ' : '';
            listeningInput.value = (baseInputValue + joiner + transcript).trimStart();
            autoSize(listeningInput);
            toggleSendButtonFor(listeningBlock);
        };
        recognition.onerror = (e) => {
            toggleMicUI(false);
            isListening = false;
            if (e && e.error === 'no-speech') {
            flash('No speech detected', 'warning');
            } else if (e && e.error === 'not-allowed') {
            flash('Microphone permission denied', 'danger');
            } else {
            flash('Voice input error', 'danger');
            }
        };
        recognition.onend = () => {
            toggleMicUI(false);
            isListening = false;
            listeningBlock = null;
            listeningBtn = null;
            listeningInput = null;
            baseInputValue = '';
        };
    
        return recognition;
    }
  
    function toggleMicUI(active) {
        if (!listeningBtn) return;
        const icon = listeningBtn.querySelector('i');
        listeningBtn.classList.toggle('recording', !!active);
        listeningBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
        if (icon) {
            icon.className = active ? 'bi bi-stop-circle' : 'bi bi-mic';
        }
        if (listeningInput) {
            if (active) {
                listeningInput.placeholder = 'Listening… speak now';
            } else {
                listeningInput.placeholder = 'Type your question...';
            }
        }
    }
  
    function startListening(block, btn) {
        const rec = getRecognition();
        if (!rec) {
            flash('Voice input is not supported in this browser.', 'warning');
            return;
        }
    
        const input = block.querySelector('.gina-input');
        if (!input) return;
    
        listeningBlock = block;
        listeningBtn = btn;
        listeningInput = input;
        baseInputValue = input.value || '';
    
        try {
            rec.start(); // must be triggered by user gesture
        } catch (_) {
            // If already started, ignore
        }
    }
  
    function stopListening() {
        if (!recognition || !isListening) return;
        try { 
            recognition.stop(); 
        } catch (_) {}
    }

    // --- Reset to a fresh conversation ---------------------------------------
    async function resetConversation() {
        // Stop any voice capture
        if (typeof stopListening === 'function') { try { stopListening(); } catch(_){} }
    
        historyHost.innerHTML = '';
        latestHost.innerHTML  = '';
        ginaContainer.style.height = `${EMPTY_PX_HEIGHT}px`;
    
        // Restore splash
        let splashNode = document.getElementById('gina-splash');
        if (!splashNode) {
            splashNode = document.createElement('div');
            splashNode.id = 'gina-splash';
            splashNode.className = 'gina-splash';
            splashNode.textContent = 'Hello! I am GINA!';
            ginaContainer.prepend(splashNode);
        } else {
            splashNode.classList.remove('hide');
            splashNode.dataset.hidden = '0';
        }
    
        // Reset transient state
        isProcessing = false;
        currentQuestion = '';
        currentAnswer = '';
        activeBlock = null;
    
        // Inject fresh composer
        const firstId = 1;
        latestHost.appendChild(buildPlaceholder(firstId));
        enable_interactions($(latestHost));
    
        const block = await waitForRenderedBlock(firstId, 8000);
        const firstInput = block.querySelector('.gina-input');
        if (firstInput) { firstInput.focus(); autoSize(firstInput); }

        applyPanelHeight();
    }
   
    // --- Visibility toggle ----------------------------------------------------
    if (ginaButton) {
        ginaButton.addEventListener('click', () => {
            const open = ginaContainer.classList.contains('active');
            if (!open) {
                resetConversation();
                mainContent?.classList.add('hidden');
                ginaContainer.classList.add('active');
                ginaButtonGroup?.classList.add('gina-active');
                const firstInput = ginaContainer.querySelector('.gina-input');
                setTimeout(() => {
                    if (firstInput) { firstInput.focus(); autoSize(firstInput); }
                }, 200);
            } else {
                ginaContainer.classList.remove('active');
                ginaButtonGroup?.classList.remove('gina-active');
                setTimeout(() => mainContent?.classList.remove('hidden'), 250);
            }
        });
    }
  
    // --- Helpers --------------------------------------------------------------
    function setProcessingState(v) {
        isProcessing = v;
        if (activeBlock) {
            const input = activeBlock.querySelector('.gina-input');
            const btn   = activeBlock.querySelector('.gina-send-btn');
            if (input) {
                if (v) { 
                    input.classList.add('locked'); input.setAttribute('readonly','readonly'); 
                }
                else { 
                    input.classList.remove('locked'); input.removeAttribute('readonly'); 
                }
            }
            if (btn) btn.disabled = v;
        }
        if (v && isListening) stopListening();
    }
  
    function toggleSendButtonFor(block) {
        if (!block) return;
        const input = block.querySelector('.gina-input');
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
            document.getElementById('conversation_socket')
        ].filter(Boolean);
        for (const el of candidates) {
            const kid = el.getAttribute && el.getAttribute('task_kernel_id');
            if (kid) return kid;
        }
        if (window.task_active_socket && window.task_active_socket.kernel_id) return window.task_active_socket.kernel_id;
        return null;
    }
  
    const safeText = (s) => (s == null ? '' : String(s));
  
    function waitForRenderedBlock(blockId, timeoutMs = 8000) {
        return new Promise((resolve, reject) => {
            const endAt = Date.now() + timeoutMs;
    
            function tryFind() {
                const block = ginaContainer.querySelector(`#gina-block-${blockId}.gina-block`);
                const ready = block &&
                    block.querySelector('.gina-input') &&
                    block.querySelector('.gina-send-btn') &&
                    block.querySelector('.gina-output') &&
                    block.querySelector('.gina-output-container') &&
                    block.querySelector('.gina-mic-btn');
                if (ready) { 
                    resolve(block); return true; 
                }
                return false;
            }
            if (tryFind()) return;
    
            const mo = new MutationObserver(() => {
                if (tryFind()) { 
                    mo.disconnect(); 
                } else if (Date.now() > endAt) { 
                    mo.disconnect(); reject(new Error('Timeout waiting for block to render')); 
                }
            });
            mo.observe(ginaContainer, { childList: true, subtree: true });
    
            setTimeout(() => { 
                mo.disconnect(); 
                if (!tryFind()) reject(new Error('Timeout waiting for block to render')); 
            }, timeoutMs);
        });
    }
  
    function nextBlockId() {
        const last = [...ginaContainer.querySelectorAll('.gina-block')].pop()?.id;
        if (!last) return 1;
        const m = String(last).match(/(\d+)$/);
        return m ? (parseInt(m[1], 10) + 1) : 1;
    }
  
    function buildPlaceholder(blockId) {
        const ph = document.createElement('div');
        ph.className = 'clarama-post-embedded clarama-replaceable';
        ph.setAttribute('url', `/template/render/explorer/files/gina_conversation_block?block_id=${blockId}`);
        return ph;
    }
  
    async function spawnNextConversationTemplate() {
        const blockId = nextBlockId();
        const placeholder = buildPlaceholder(blockId);
        latestHost.appendChild(placeholder);
    
        enable_interactions($(latestHost));
    
        try {
            const block = await waitForRenderedBlock(blockId, 8000);
            const input = block.querySelector('.gina-input');
            if (input) { input.focus(); autoSize(input); }
            toggleSendButtonFor(block);
            applyPanelHeight();
        } catch (err) {
            console.error('GINA: failed to render next conversation block:', err);
            flash('Failed to load the next conversation block. Please try again.', 'danger');
        }
    }
  
    // --- Kernel call ---------------------------------------------------
    function runQuestionThroughKernel(questionText, forBlock) {
        get_field_values({}, true, function (field_registry) {
            field_registry['clarama_task_kill'] = false;
    
            const task_kernel_id = findKernelId();
            if (!task_kernel_id) {
                const msg = 'Unable to find a running kernel.';
                console.error('GINA:', msg);
                flash(msg, "danger");
                const out = forBlock?.querySelector('.gina-output');
                if (out) { out.classList.remove('loading'); out.innerHTML = `<span style="color:#ff6b6b;">Error: ${msg}</span>`; }
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
                        // WebSocket will deliver the response
                        return;
                    }
                    const err = (data && data['error']) ? data['error'] : 'An error occurred while processing your question.';
                    flash("Couldn't process question: " + err, "danger");
                    const out = forBlock?.querySelector('.gina-output');
                    if (out) { 
                        out.classList.remove('loading'); out.innerHTML = `<span style="color:#ff6b6b;">Error: ${safeText(err)}</span>`; 
                    }
                    setProcessingState(false);
                    spawnNextConversationTemplate();
                },
                error: function () {
                    flash("Couldn't process question, network or access issue", "danger");
                    const out = forBlock?.querySelector('.gina-output');
                    if (out) { 
                        out.classList.remove('loading'); out.innerHTML = `<span style="color:#ff6b6b;">Error: network or access issue</span>`; 
                    }
                    setProcessingState(false);
                    spawnNextConversationTemplate();
                }
            });
        });
    }
  
    // --- WebSocket interceptor -------------------------------------------------
    function installWSInterceptor() {
        if (window.__ginaWSInstalled) return;
        window.__ginaWSInstalled = true;
    
        function wait() {
            if (typeof task_active_socket !== 'undefined' && task_active_socket && task_active_socket.onmessage) {
                if (!window.originalWebSocketOnMessage) window.originalWebSocketOnMessage = task_active_socket.onmessage;
        
                task_active_socket.onmessage = function (event) {
                    let dict;
                    dict = JSON.parse(event.data);
                    console.log('dict: ', dict);
        
                    if (isProcessing && activeBlock && dict && dict.class === 'template') {
                        const html   = dict.template || dict.values?.template || '';
                        const outArr = dict.Output || dict.output || dict.values?.output;
                        const isPrintResponseHTML = typeof html === 'string' && html.indexOf('class="print_response"') !== -1;
                        const hasOutputArray = Array.isArray(outArr) && outArr.length > 0;
            
                        if (isPrintResponseHTML || hasOutputArray) {
                            let text = '';
                            if (hasOutputArray) {
                                text = outArr.join('\n');
                            } else {
                                const tmp = document.createElement('div');
                                tmp.innerHTML = html;
                                const pre = tmp.querySelector('.print_response');
                                text = (pre?.textContent || pre?.innerText || '').trim();
                            }
            
                            currentAnswer = (text || '').trim();
                            const out = activeBlock.querySelector('.gina-output');
                            if (out) {
                                out.classList.remove('loading');
                                out.classList.add('locked');
                                out.style.whiteSpace = 'pre-wrap';
                                out.textContent = currentAnswer || 'Response received but was empty';
                            }
            
                            // Move the finished block from latest → history 
                            if (activeBlock.parentElement === latestHost) {
                                historyHost.appendChild(activeBlock);
                                stickHistoryToBottom();
                            }
            
                            // Clear state & spawn a fresh composer
                            activeBlock.classList.remove('processing');
                            activeBlock = null;
                            setProcessingState(false);
                            flash("Question processed successfully", "success");
            
                            // Height grows smoothly as history grows
                            applyPanelHeight();
            
                            // Spawn a fresh input block
                            spawnNextConversationTemplate();
            
                            if (window.originalWebSocketOnMessage) window.originalWebSocketOnMessage.call(this, event);
                            return;
                        }
                    }
        
                    if (window.originalWebSocketOnMessage) window.originalWebSocketOnMessage.call(this, event);
                };
            } else {
                setTimeout(wait, 120);
            }
        }
        wait();
    }
    installWSInterceptor();
  
    // --- Delegated events (latest + history) ----------------------------------
    ginaContainer.addEventListener('input', (e) => {
        if (!e.target.matches('.gina-input')) return;
        autoSize(e.target);
        toggleSendButtonFor(e.target.closest('.gina-block'));
    });
  
    // Enter => send; Shift+Enter => newline
    ginaContainer.addEventListener('keydown', (e) => {
        if (!e.target.matches('.gina-input') || e.isComposing) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const block = e.target.closest('.gina-block');
            block?.querySelector('.gina-send-btn')?.click();
        }
    });
  
    // Clicks (mic + send)
    ginaContainer.addEventListener('click', (e) => {
        // Mic toggle
        const micBtn = e.target.closest('.gina-mic-btn');
        if (micBtn && !isProcessing) {
            const block = micBtn.closest('.gina-block');
            // Toggle start/stop on same block
            if (isListening && block === listeningBlock) {
            stopListening();
            } else {
            startListening(block, micBtn);
            }
            return; // do not fall-through to send
        }
    
        // Send
        const btn = e.target.closest('.gina-send-btn');
        if (!btn || isProcessing) return;
    
        const block        = btn.closest('.gina-block');
        const inputWrapper = block.querySelector('.gina-input-wrapper');
        const input        = block.querySelector('.gina-input');
        const outContainer = block.querySelector('.gina-output-container');
        const out          = block.querySelector('.gina-output');
    
        const msg = (input?.value ?? '').trim();
        if (!msg) return;
    
        hideSplash(true);
    
        // If we were listening, stop it before sending
        if (isListening) stopListening();
    
        // Expand fully so the full message height is captured, then render bubble
        autoSize(input, { expandFully: true });
    
        const userBubble = document.createElement('div');
        userBubble.className = 'gina-msg user';
        userBubble.textContent = msg;               // textContent guards against HTML injection
        inputWrapper.classList.add('finalized');    // flips wrapper to flex/right in CSS
        inputWrapper.innerHTML = '';
        inputWrapper.appendChild(userBubble);
    
        block.classList.add('chat-mode');           // enable bubble layout for this block
    
        // Lock + show output + begin processing
        currentQuestion = msg;
        block.classList.add('processing');
        activeBlock = block;
    
        btn.disabled = true;
        outContainer.style.display = 'block';
        out.classList.add('loading');
        out.textContent = 'Processing your question...';
    
        block.querySelector('.gina-send-container')?.classList.remove('show');
    
        setProcessingState(true);
        runQuestionThroughKernel(msg, block);
    });
  
    // --- Save current Q/A (optional) ------------------------------------------
    ginaSaveBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!currentQuestion || !currentAnswer) {
            flash('No conversation to save', 'warning'); 
            return;
        }
        flash('Conversation saved successfully', 'success');
    });
  
    // --- Bootstrapping: ensure there's an active block in latest --------------
    (function ensureInitialBlock() {
        // Set initial height and splash visibility
        applyPanelHeight();
        if (historyCount() > 0) hideSplash(false);
    
        const hasActive = latestHost.querySelector('.gina-block');
        if (!hasActive) {
            const blockId = 1;
            latestHost.appendChild(buildPlaceholder(blockId));
            enable_interactions($(latestHost));
        } else {
            const input = latestHost.querySelector('.gina-input');
            if (input) { 
            autoSize(input); toggleSendButtonFor(input.closest('.gina-block')); 
            }
        }
        stickHistoryToBottom();
    })();
  
    // Keep scroller/height feeling right on viewport changes
    window.addEventListener('resize', () => {
        applyPanelHeight();
        if (historyCount() > 0) stickHistoryToBottom();
    });
});
  