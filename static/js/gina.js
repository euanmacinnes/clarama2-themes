// Handshake + welcome de-dupe flags
window.__ginaHandshakeSent = false;
window.__ginaHandshakeDone = false;
window.__ginaWelcomeShown = false;
window.waitingForAiUserInput = true; // locked until ai_user_input

// THIS WILL BE CALLED AS SOON AS THE KERNEL IS REGISTERED. THIS EVENT IS SPECIFIED IN THE DIV
// SEE gina.html for the DIV definition
function gina_kernel_registered(kernel_id) {
    // There is NOTHING TO DO HERE
    // Trigger the blank question when Gina is opened, otherwise we are warming up the LLM on every single web page
    // The kernel ID is automatically inserted as HTML into a DIV called "kernel_status" if it is present on screen.
    // Class the div accordingly
}

// THIS WILL BE CALLED ON MESSAGE RECEIVED TO PROCESS CUSTOM MESSAGES
function gina_kernel_message(dict, socket_url, webSocket, socket_div) {
    return dict;
    // the main websocket decodes the event as a dict straight away, so we can process it here

    // 1) Handshake → unlock inputs
    if (dict && dict.type === "ai_user_input") {
        console.log("GINA handshake received.");
        window.__ginaHandshakeDone = true;
        window.waitingForAiUserInput = false;
        window.__ginaSetInputsEnabled && window.__ginaSetInputsEnabled(true, "Type your question.");
        return;
    }

    // 2) Answer (either a welcome/system message OR a reply to the user's turn)
    if (dict && dict["class"] === "template" && dict["type"] === "task_step_result") {
        const reply = html_decode(dict.values.output[0]);
        console.log('reply: ', reply)
        const container = document.getElementById("gina-chat-container");

        // If there is NO block currently processing, this is a system/welcome reply.
        const hasProcessing = !!container?.querySelector("#gina-latest .gina-block.processing");
        if (!hasProcessing) {
            if (window.__ginaWelcomeShown) return;
            window.__ginaWelcomeShown = true;
            window.__ginaSetInputsEnabled && window.__ginaSetInputsEnabled(true, "Type your question.");
            return;
        }

        let block =
            (window.__ginaGetActiveBlock && window.__ginaGetActiveBlock()) ||
            container?.querySelector("#gina-latest .gina-block.processing") ||
            container?.querySelector("#gina-conversations .gina-block.processing") ||
            container?.querySelector("#gina-latest .gina-block.chat-mode");

        if (!block) {
            block = container?.querySelector("#gina-latest .gina-block");
        }

        const out = block?.querySelector(".gina-output");
        const outContainer = block?.querySelector(".gina-output-container");
        if (outContainer) outContainer.style.display = "block";
        if (out) {
            out.classList.remove("loading");
            out.style.whiteSpace = "pre-wrap";
            out.textContent = reply || "";
        }

        // User turn is "finalized" only if the block is in chat mode (we replaced the textarea with a user bubble)
        const isFinalizedUserTurn =
            block?.classList.contains("chat-mode") ||
            !!block?.querySelector(".gina-input-wrapper.finalized");

        if (isFinalizedUserTurn) {
            block.classList.remove("processing");
            window.__ginaClearProcessingGuard && window.__ginaClearProcessingGuard();
            window.__ginaSetProcessingState && window.__ginaSetProcessingState(false);

            // Clear the active reference before moving it away
            if (window.__ginaGetActiveBlock && block === window.__ginaGetActiveBlock()) {
                window.__ginaSetActiveBlock && window.__ginaSetActiveBlock(null);
                window.__ginaActiveTurnId = null;
            }

            window.__ginaMoveBlockToHistory && window.__ginaMoveBlockToHistory(block);
            window.__ginaSpawnNext && window.__ginaSpawnNext();
        } else {
            // Welcome/system message — keep the composer in place
            window.__ginaSetInputsEnabled && window.__ginaSetInputsEnabled(true, "Type your question.");
        }

        window.__ginaCheckDocking && window.__ginaCheckDocking();
        return dict;
    }

    // 3) Error → show error bubble and continue flow
    if (dict && dict["class"] === "message" && dict["type"] === "task_step_exception") {
        const container = document.getElementById("gina-chat-container");
        const block = (window.__ginaGetActiveBlock && window.__ginaGetActiveBlock()) ||
            container?.querySelector("#gina-latest .gina-block.processing");
        const msg = (dict.values && dict.values.error) ? String(dict.values.error) : "An error occurred.";
        window.__ginaFinalizeBlockAfterError && window.__ginaFinalizeBlockAfterError(block, msg);
        // Clear the active reference on error too
        window.__ginaSetActiveBlock && window.__ginaSetActiveBlock(null);
        window.__ginaActiveTurnId = null;
        return;
    }

    return dict;
}

function findKernelId() {
    return $('#gina_socket').attr('task_kernel_id');
}

// --- Kernel call ----------------------------------------------------------
function runQuestionThroughKernel(questionText, forBlock) {
    get_field_values({}, true, function (field_registry) {
        field_registry["clarama_task_kill"] = false;

        const task_kernel_id = findKernelId();
        if (!task_kernel_id) {
            const msg = "Unable to find a running kernel. Please open any task/session first.";
            console.error("GINA:", msg);
            flash(msg, "danger");
            if (forBlock) finalizeBlockAfterError(forBlock, `Error: ${msg}`);
            return;
        }

        const url = $CLARAMA_ENVIRONMENTS_KERNEL_RUN + task_kernel_id;
        const task_registry = {
            streams: [{ main: [{ source: questionText, type: "question" }] }],
            parameters: field_registry
        };

        $.ajax({
            type: "POST",
            url,
            datatype: "html",
            contentType: "application/json",
            data: JSON.stringify(task_registry),
            success: function (data) {
                if (data && data["data"] === "ok") {
                    // WebSocket will deliver the response
                    return;
                }
                const err = (data && data["error"]) ? data["error"] : "An error occurred while processing your question.";
                flash("Couldn't process question: " + err, "danger");
                if (forBlock) finalizeBlockAfterError(forBlock, `Error: ${err}`);
            },
            error: function () {
                flash("Couldn't process question, network or access issue", "danger");
                if (forBlock) finalizeBlockAfterError(forBlock, "Error: network or access issue");
            }
        });
    });
}

// Main UI bootstrap
document.addEventListener("DOMContentLoaded", () => {
    // --- DOM refs -------------------------------------------------------------
    const ginaButton = document.getElementById("gina-button");
    const mainContent = document.getElementById("main-content");
    const ginaContainer = document.getElementById("gina-chat-container");
    const ginaButtonGroup = document.querySelector(".gina-button-group");
    const ginaSaveBtn = document.querySelector(".gina-save-btn");
    const ginaNewChatBtn = document.querySelector(".gina-new-chat-btn");
    const historyHost = document.getElementById("gina-conversations");
    const latestHost = document.getElementById("gina-latest");

    function getSplash() {
        return document.getElementById("gina-splash");
    }

    // --- Floating (centered) -> Docked (under navbar) helpers ----------------
    const navbar = document.querySelector("nav.navbar");

    function navbarOffsetPx() {
        const h = (navbar && navbar.getBoundingClientRect && navbar.getBoundingClientRect().height)
            ? navbar.getBoundingClientRect().height : 64;
        return Math.max(0, Math.round(h)) + 8; // breathing room
    }

    function setNavbarOffsetVar() {
        const px = navbarOffsetPx();
        document.documentElement.style.setProperty("--navbar-offset", px + "px");
    }

    function floatingMaxHeight() {
        return window.innerHeight - navbarOffsetPx() - 20;
    }

    function isFloating() {
        return ginaContainer.classList.contains("mode-floating");
    }

    function enterDocked() {
        ginaContainer.classList.add("mode-docked");
        ginaContainer.classList.remove("mode-floating");
        syncMainCollapse();
        // Once docked, the page is the only scroller
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }

    function checkDocking() {
        if (!ginaContainer.classList.contains("active")) return;

        setNavbarOffsetVar();

        if (!isFloating()) { // already docked
            syncMainCollapse();
            return;
        }

        const maxH = floatingMaxHeight();
        const rect = ginaContainer.getBoundingClientRect();

        // Measure untransformed content height (not affected by the 0.9 scale)
        const inputCol = ginaContainer.querySelector(".gina-input-container");
        const controls = ginaContainer.querySelector(".gina-controls");
        const contentH =
            (controls?.scrollHeight || 0) +
            (historyHost?.scrollHeight || 0) +
            (latestHost?.scrollHeight || 0) + 24;

        // Take the largest of all available measurements
        const h = Math.max(
            ginaContainer.scrollHeight || 0,
            inputCol?.scrollHeight || 0,
            rect.height || 0,
            contentH
        );

        // Visual cues while floating
        const bottomOver = rect.bottom >= (window.innerHeight - 8);
        const spaceBelow = window.innerHeight - rect.bottom;

        const latestInput = ginaContainer.querySelector("#gina-latest .gina-input");
        const inputFull = latestInput ? latestInput.scrollHeight : 0;

        if ((h > maxH + 4) || bottomOver || spaceBelow < 12 || (inputFull + 40 > maxH)) {
            enterDocked();
        } else {
            syncMainCollapse();
        }
    }

    function historyCount() {
        return historyHost.querySelectorAll(".gina-block").length;
    }

    function stickHistoryToBottom() {
        if (ginaContainer.classList.contains("mode-docked")) {
            window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
        } else {
            // when floating, keep as-is; no inner scrolling needed
        }
    }

    // --- Splash control -------------------------------------------------------
    function getSplashHost() {
        const controls = ginaContainer.querySelector(".gina-controls");
        if (!controls) return ginaContainer;
        let holder = controls.querySelector(".gina-splash-holder");
        if (!holder) {
            holder = document.createElement("div");
            holder.className = "gina-splash-holder flex-grow-1 d-flex justify-content-center align-items-center";
            // Try to place between first and second child
            if (controls.children.length >= 2) {
                controls.insertBefore(holder, controls.children[1]);
            } else {
                controls.appendChild(holder);
            }
        }
        return holder;
    }

    function hideSplash(animated = true) {
        const splash = getSplash();
        if (!splash) return;
        if (splash.dataset.hidden === "1") return;
        splash.dataset.hidden = "1";
        if (animated) {
            splash.classList.add("hide");
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

    function measureOneLineHeight(el) {
        const cached = el.dataset.oneLineH;
        if (cached) return parseFloat(cached);

        const cs = window.getComputedStyle(el);
        const clone = document.createElement("textarea");
        clone.value = "X"; // single line
        [
            "font-size", "font-family", "font-weight", "font-style", "line-height",
            "padding-top", "padding-bottom", "padding-left", "padding-right",
            "border-top-width", "border-bottom-width", "box-sizing",
            "letter-spacing", "text-transform", "word-spacing", "white-space",
            "text-indent", "tab-size"
        ].forEach(p => clone.style[p] = cs.getPropertyValue(p));

        clone.style.position = "absolute";
        clone.style.visibility = "hidden";
        clone.style.height = "auto";
        clone.style.minHeight = "0";
        clone.style.maxHeight = "none";
        clone.style.overflow = "hidden";
        clone.style.width = el.clientWidth + "px"; // match current width

        document.body.appendChild(clone);
        const oneLineH = Math.ceil(clone.scrollHeight);
        document.body.removeChild(clone);

        el.dataset.oneLineH = String(oneLineH);
        return oneLineH;
    }

    function autoSize(el, { expandFully = false } = {}) {
        if (!el) return;

        const scope = el.closest("#gina-chat-container") || document.documentElement;
        const minH = readPxVar(scope, "--gina-input-min", 51);
        const maxH = readPxVar(scope, "--gina-input-max", 240);

        // measure content
        el.style.height = "auto";
        const full = Math.ceil(el.scrollHeight);

        const isEmpty = (el.value || "").trim() === "";
        const oneLineH = measureOneLineHeight(el);
        const isOneLine = full <= (oneLineH + 1); // tolerance for sub-pixel

        if (!expandFully && (isEmpty || isOneLine)) {
            el.classList.add("is-singleline");
            el.style.height = minH + "px";
            el.style.maxHeight = maxH + "px";
            el.style.overflowY = "hidden";
            return;
        } else {
            el.classList.remove("is-singleline");
        }

        // Show full text when sending
        if (expandFully) {
            el.classList.add("expanded");
            el.style.maxHeight = "none";
            el.style.overflowY = "hidden";
            el.style.height = full + "px";
            el.scrollTop = 0;
            return;
        }

        const next = Math.max(minH, full);
        el.style.maxHeight = "none";
        el.style.overflowY = "hidden";
        el.style.height = next + "px";
    }

    // --- State ----------------------------------------------------------------
    let isProcessing = false;
    let activeBlock = null;
    let currentQuestion = "";
    let currentAnswer = "";

    // --- Voice input (Web Speech API) ----------------------------------------
    let recognition = null;
    let isListening = false;
    let listeningBlock = null;   // the block whose input we are filling
    let listeningBtn = null;     // the mic button being toggled
    let listeningInput = null;   // textarea element
    let baseInputValue = "";    // value at the start of recording

    function getRecognition() {
        if (recognition) return recognition;
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return null;

        recognition = new SpeechRecognition();
        recognition.lang = (document.documentElement.lang || "en-UK");
        recognition.continuous = false;
        recognition.interimResults = true;

        recognition.onstart = () => {
            isListening = true;
            toggleMicUI(true);
        };

        recognition.onresult = (event) => {
            if (!listeningInput) return;
            let transcript = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            const joiner = baseInputValue && !/\s$/.test(baseInputValue) ? " " : "";
            listeningInput.value = (baseInputValue + joiner + transcript).trimStart();
            autoSize(listeningInput);
            toggleSendButtonFor(listeningBlock);
        };

        recognition.onerror = (e) => {
            toggleMicUI(false);
            isListening = false;
            if (e && e.error === "no-speech") {
                flash("No speech detected", "warning");
            } else if (e && e.error === "not-allowed") {
                flash("Microphone permission denied", "danger");
            } else {
                flash("Voice input error", "danger");
            }
        };

        recognition.onend = () => {
            toggleMicUI(false);
            isListening = false;
            listeningBlock = null;
            listeningBtn = null;
            listeningInput = null;
            baseInputValue = "";
        };

        return recognition;
    }

    function toggleMicUI(active) {
        if (!listeningBtn) return;
        const icon = listeningBtn.querySelector("i");
        listeningBtn.classList.toggle("recording", !!active);
        listeningBtn.setAttribute("aria-pressed", active ? "true" : "false");
        if (icon) {
            icon.className = active ? "bi bi-stop-circle" : "bi bi-mic";
        }
        if (listeningInput) {
            if (active) {
                listeningInput.placeholder = "Listening… speak now";
            } else {
                listeningInput.placeholder = "Type your question...";
            }
        }
    }

    function startListening(block, btn) {
        const rec = getRecognition();
        if (!rec) {
            flash("Voice input is not supported in this browser.", "warning");
            return;
        }

        const input = block.querySelector(".gina-input");
        if (!input) return;

        listeningBlock = block;
        listeningBtn = btn;
        listeningInput = input;
        baseInputValue = input.value || "";

        try {
            rec.start();
        } catch (_) {
            /* already started */
        }
    }

    function stopListening() {
        if (!recognition || !isListening) return;
        try {
            recognition.stop();
        } catch (_) {
            // ignore
        }
    }

    // --- Reset to a fresh conversation ---------------------------------------
    async function resetConversation() {
        // Stop any voice capture
        stopListening();

        historyHost.innerHTML = "";
        latestHost.innerHTML = "";

        // Restore splash
        let splashNode = document.getElementById("gina-splash");
        if (!splashNode) {
            splashNode = document.createElement("div");
            splashNode.id = "gina-splash";
            splashNode.className = "gina-splash";
            splashNode.textContent = "Hello! I am GINA!";
            getSplashHost().appendChild(splashNode);
        } else {
            splashNode.classList.remove("hide");
            splashNode.dataset.hidden = "0";
        }

        // Reset transient state
        isProcessing = false;
        currentQuestion = "";
        currentAnswer = "";
        activeBlock = null;

        // Inject fresh composer
        const firstId = 1;
        latestHost.appendChild(buildPlaceholder(firstId));
        enable_interactions($(latestHost));

        const block = await waitForRenderedBlock(firstId, 8000);
        const firstInput = block.querySelector(".gina-input");
        if (firstInput) {
            firstInput.focus();
            autoSize(firstInput);
        }

        checkDocking();
    }

    // --- Visibility toggle ----------------------------------------------------
    if (ginaButton) {
        ginaButton.addEventListener("click", () => {
            if (!window.__ginaHandshakeDone && !window.__ginaHandshakeSent) {
                window.__ginaHandshakeSent = true;
                window.waitingForAiUserInput = true;
                window.__ginaSetInputsEnabled && window.__ginaSetInputsEnabled(false, "GINA is getting ready...");
                runQuestionThroughKernel("");
            }
            const open = ginaContainer.classList.contains("active");
            if (!open) {
                mainContent?.classList.add("hidden");
                ginaContainer.classList.add("active", "mode-floating");
                ginaButtonGroup?.classList.add("gina-active");
                setNavbarOffsetVar();
                requestAnimationFrame(checkDocking);
                const firstInput = ginaContainer.querySelector(".gina-input");
                setTimeout(() => {
                    if (firstInput) {
                        firstInput.focus();
                        autoSize(firstInput);
                    }
                }, 200);
            } else {
                ginaContainer.classList.remove("active", "mode-floating", "mode-docked");
                ginaButtonGroup?.classList.remove("gina-active");
                mainContent?.classList.remove("collapsed");
                setTimeout(() => mainContent?.classList.remove("hidden"), 0);
            }
        });
    }

    // --- Helpers --------------------------------------------------------------
    function setProcessingState(v) {
        isProcessing = v;
        if (activeBlock) {
            const input = activeBlock.querySelector(".gina-input");
            const btn = activeBlock.querySelector(".gina-send-btn");
            if (input) {
                if (v) {
                    input.classList.add("locked");
                    input.setAttribute("readonly", "readonly");
                } else {
                    input.classList.remove("locked");
                    input.removeAttribute("readonly");
                }
            }
            if (btn) btn.disabled = v;
        }
        if (v && isListening) stopListening();
    }

    // --- Processing guards to avoid stuck 'Processing...' ---
    let __processingGuardTimer = null;

    function clearProcessingGuard() {
        if (__processingGuardTimer) {
            clearTimeout(__processingGuardTimer);
            __processingGuardTimer = null;
        }
    }

    function startProcessingGuard() {
        clearProcessingGuard();
        __processingGuardTimer = setTimeout(() => {
            try {
                console.warn("GINA: unlocking input after timeout safeguard.");
                clearProcessingGuard();
                setProcessingState(false);
                checkDocking();
                const locked = document.querySelector(".gina-input.locked") || document.querySelector("#gina-latest .gina-input[readonly]");
                if (locked) {
                    locked.removeAttribute("readonly");
                    locked.classList.remove("locked");
                }
            } catch (err) {
                console.warn("GINA: processing guard error:", err);
            }
        }, 30000);
    }

    function toggleSendButtonFor(block) {
        if (!block) return;
        const input = block.querySelector(".gina-input");
        const sendContainer = block.querySelector(".gina-send-container");
        if (!input || !sendContainer) return;
        const hasText = input.value.trim().length > 0;
        if (hasText && !isProcessing && !input.hasAttribute("readonly")) {
            sendContainer.classList.add("show");
        } else {
            sendContainer.classList.remove("show");
        }
    }

    function syncMainCollapse() {
        const docked = ginaContainer.classList.contains("mode-docked");
        if (docked) {
            mainContent?.classList.add("collapsed");
        } else {
            mainContent?.classList.remove("collapsed");
        }
    }

    function waitForRenderedBlock(blockId, timeoutMs = 8000) {
        return new Promise((resolve, reject) => {
            const endAt = Date.now() + timeoutMs;

            function tryFind() {
                const block = ginaContainer.querySelector(`#gina-block-${blockId}.gina-block`);
                const ready = block &&
                    block.querySelector(".gina-input") &&
                    block.querySelector(".gina-send-btn") &&
                    block.querySelector(".gina-output") &&
                    block.querySelector(".gina-output-container") &&
                    block.querySelector(".gina-mic-btn");
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
                    reject(new Error("Timeout waiting for block to render"));
                }
            });
            mo.observe(ginaContainer, { childList: true, subtree: true });
            setTimeout(() => {
                mo.disconnect();
                if (!tryFind()) reject(new Error("Timeout waiting for block to render"));
            }, timeoutMs);
        });
    }

    function nextBlockId() {
        const last = [...ginaContainer.querySelectorAll(".gina-block")].pop()?.id;
        if (!last) return 1;
        const m = String(last).match(/(\d+)$/);
        return m ? (parseInt(m[1], 10) + 1) : 1;
    }

    function buildPlaceholder(blockId) {
        const ph = document.createElement("div");
        ph.className = "clarama-post-embedded clarama-replaceable";
        ph.setAttribute("url", `/template/render/explorer/files/gina_conversation_block?block_id=${blockId}`);
        return ph;
    }

    async function spawnNextConversationTemplate() {
        const blockId = nextBlockId();
        const placeholder = buildPlaceholder(blockId);
        latestHost.appendChild(placeholder);
        enable_interactions($(latestHost));
        try {
            const block = await waitForRenderedBlock(blockId, 8000);
            const input = block.querySelector(".gina-input");
            if (input) {
                input.focus();
                autoSize(input);
            }
            toggleSendButtonFor(block);
            checkDocking();
        } catch (err) {
            console.error("GINA: failed to render next conversation block:", err);
            flash("Failed to load the next conversation block. Please try again.", "danger");
        }
    }

    function moveBlockToHistory(block) {
        if (!block) return;
        if (block.parentElement === latestHost) {
            historyHost.appendChild(block);
        }
    }

    function finalizeBlockAfterError(forBlock, message) {
        // Ensure output is visible and styled
        const outContainer = forBlock?.querySelector(".gina-output-container");
        const out = forBlock?.querySelector(".gina-output");
        if (outContainer) outContainer.style.display = "block";
        if (out) {
            out.classList.remove("loading");
            out.style.whiteSpace = "pre-wrap";
            out.innerHTML = `<span style="color:#ff6b6b;">${message}</span>`;
        }

        // Treat error like a completed turn
        moveBlockToHistory(forBlock);
        stickHistoryToBottom?.();
        setProcessingState?.(false);
        checkDocking?.();

        spawnNextConversationTemplate();
    }

    function setInputsEnabled(enabled, placeholderText = "Type your question...") {
        const inputs = ginaContainer.querySelectorAll(".gina-input");
        inputs.forEach((inp) => {
            if (enabled) {
                inp.removeAttribute("readonly");
                inp.classList.remove("locked");
                inp.placeholder = "Type your question...";
            } else {
                inp.setAttribute("readonly", "readonly");
                inp.classList.add("locked");
                inp.placeholder = placeholderText || "GINA is getting ready...";
            }
            autoSize(inp);
        });
        const sendBtns = ginaContainer.querySelectorAll(".gina-send-btn");
        sendBtns.forEach((btn) => btn.disabled = !enabled);
    }

    const __ginaObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const n of m.addedNodes) {
                if (n && n.nodeType === 1 && n.classList && n.classList.contains("assistant")) {
                    clearProcessingGuard();
                    setProcessingState(false);
                    checkDocking();
                }
            }
        }
    });
    __ginaObserver.observe(historyHost, { childList: true, subtree: true });

    // --- Delegated events (latest + history) ---------------------------------
    ginaContainer.addEventListener("input", (e) => {
        if (!e.target.matches(".gina-input")) return;
        autoSize(e.target);
        checkDocking();
        toggleSendButtonFor(e.target.closest(".gina-block"));
    });

    // Clicks (mic + send)
    ginaContainer.addEventListener("click", (e) => {
        // Mic toggle
        const micBtn = e.target.closest(".gina-mic-btn");
        if (micBtn && !isProcessing) {
            if (window.waitingForAiUserInput) return; // locked during handshake
            const block = micBtn.closest(".gina-block");
            if (isListening && block === listeningBlock) {
                stopListening();
            } else {
                startListening(block, micBtn);
            }
            return; // do not fall-through to send
        }

        // Send
        const btn = e.target.closest(".gina-send-btn");
        if (!btn || isProcessing || btn.disabled) return;

        const block = btn.closest(".gina-block");
        const inputWrapper = block.querySelector(".gina-input-wrapper");
        const input = block.querySelector(".gina-input");
        const outContainer = block.querySelector(".gina-output-container");
        const out = block.querySelector(".gina-output");

        if (input?.hasAttribute("readonly")) return; // locked

        const msg = (input?.value ?? "").trim();
        if (!msg) return;

        hideSplash(true);

        // If we were listening, stop it before sending
        if (isListening) stopListening();

        // Expand fully so the full message height is captured, then render bubble
        autoSize(input, { expandFully: true });

        const userBubble = document.createElement("div");
        userBubble.className = "gina-msg user";
        userBubble.textContent = msg;               // textContent guards against HTML injection
        inputWrapper.classList.add("finalized");    // flips wrapper to flex/right in CSS
        inputWrapper.innerHTML = "";
        inputWrapper.appendChild(userBubble);

        block.classList.add("chat-mode");           // enable bubble layout for this block

        // Lock + show output + begin processing
        currentQuestion = msg;
        block.classList.add("processing");
        activeBlock = block;

        btn.disabled = true;
        outContainer.style.display = "block";
        out.classList.add("loading");
        out.textContent = "Processing your question...";

        block.querySelector(".gina-send-container")?.classList.remove("show");

        setProcessingState(true);
        startProcessingGuard();
        runQuestionThroughKernel(msg, block);
    });

    ginaContainer.addEventListener("keydown", (e) => {
        if (!e.target.matches(".gina-input")) return;
        // Send on Enter, but allow Shift+Enter for new lines
        if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            const block = e.target.closest(".gina-block");
            const btn = block?.querySelector(".gina-send-btn");
            if (btn && !btn.disabled) btn.click();
        }
    });

    // --- Helpers for saving ---------------------------------------------------
    let savedConversationPath = null;
    let savedConversationTitle = null;

    // Collect finished turns from the UI
    function collectConversationTurns() {
        const turns = [];

        // 1) All completed blocks in history
        const blocks = [...historyHost.querySelectorAll(".gina-block")];
        for (const b of blocks) {
            const q = b.querySelector(".gina-msg.user")?.textContent?.trim();
            const a = b.querySelector(".gina-output")?.textContent?.trim();
            if (q) turns.push({ role: "user", content: q });
            if (a) turns.push({ role: "assistant", content: a });
        }

        // 2) Also include the latest block if it's in chat mode
        const latest = latestHost.querySelector(".gina-block.chat-mode");
        if (latest) {
            const q = latest.querySelector(".gina-msg.user")?.textContent?.trim();
            const a = latest.querySelector(".gina-output")?.textContent?.trim();
            if (q) {
                turns.push({ role: "user", content: q });
                if (a) turns.push({ role: "assistant", content: a });
            }
        }
        return turns;
    }

    // Slug from first message (used only on first save)
    function slugify(s, fallback = "conversation") {
        const slug = (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        return slug || fallback;
    }

    async function ensureConversationsFolder(username) {
        const url = `/render/new/Users/${encodeURIComponent(username)}/?` +
            `new_content=${encodeURIComponent("conversations")}&` +
            `new_content_type=${encodeURIComponent("folder")}`;
        execute_json_url(url, false);
    }

    ginaNewChatBtn?.addEventListener("click", async (e) => {
        e.preventDefault();
      
        // Force floating mode
        ginaContainer.classList.add("active", "mode-floating");
        ginaContainer.classList.remove("mode-docked");
      
        // Hide & collapse the page content while floating
        mainContent?.classList.add("hidden", "collapsed");
      
        // Ensure CSS vars and layout are up to date
        setNavbarOffsetVar();
        requestAnimationFrame(checkDocking);
      
        await resetConversation();
        const firstInput = document.querySelector("#gina-latest .gina-input");
        if (firstInput) firstInput.focus();
    });

    // --- Save current chat as a conversation file  ----
    ginaSaveBtn?.addEventListener("click", async (e) => {
        e.preventDefault();

        const turns = collectConversationTurns();
        if (turns.length === 0) {
            flash("No conversation to save", "warning");
            return;
        }

        const username = $("#currentUser").attr("username");
        await ensureConversationsFolder(username);

        if (!savedConversationPath) {
            const firstUserTurn = turns.find((t) => t.role === "user")?.content || "Conversation";
            savedConversationTitle = slugify(firstUserTurn.slice(0, 60));
            const createUrl = `/render/new/Users/${encodeURIComponent(username)}/conversations/` +
                `?new_content=${encodeURIComponent(savedConversationTitle)}&` +
                `new_content_type=${encodeURIComponent("conversation")}`;
            try {
                execute_json_url(createUrl, false);
                flash("Conversation file saved", "success");
            } catch (_) {
                flash("Could not save conversation", "danger");
            }
        }
    });

    // --- Bootstrapping: ensure there's an active block in latest --------------
    (function ensureInitialBlock() {
        checkDocking();
        if (historyCount() > 0) hideSplash(false);

        const hasActive = latestHost.querySelector(".gina-block");
        if (!hasActive) {
            const blockId = 1;
            latestHost.appendChild(buildPlaceholder(blockId));
            enable_interactions($(latestHost));
        } else {
            const input = latestHost.querySelector(".gina-input");
            if (input) {
                autoSize(input);
                toggleSendButtonFor(input.closest(".gina-block"));
            }
        }
        stickHistoryToBottom();
    })();

    // --- Ensure splash is visible on first load ------------------------------
    (function ensureSplashOnFirstLoad() {
        try {
            const hasHistory = (typeof historyCount === 'function') ? (historyCount() > 0) : false;
            const existing = document.getElementById("gina-splash");
            if (!hasHistory && !existing) {
                const node = document.createElement("div");
                node.id = "gina-splash";
                node.className = "gina-splash";
                node.textContent = "Hello! I am GINA!";
                const host = (typeof getSplashHost === 'function')
                    ? getSplashHost()
                    : document.querySelector("#gina-chat-container .gina-controls") || document.getElementById("gina-chat-container");
                host && host.appendChild(node);
            }
        } catch (e) {
            console.warn("GINA: could not ensure splash on first load:", e);
        }
    })();

    // Keep scroller/height feeling right on viewport changes
    window.addEventListener("resize", () => {
        checkDocking();
        if (historyCount() > 0) stickHistoryToBottom();
    });

    // Expose helpers for websocket callbacks
    window.__ginaSetInputsEnabled = setInputsEnabled;
    window.__ginaClearProcessingGuard = clearProcessingGuard;
    window.__ginaSetProcessingState = setProcessingState;
    window.__ginaMoveBlockToHistory = moveBlockToHistory;
    window.__ginaSpawnNext = spawnNextConversationTemplate;
    window.__ginaFinalizeBlockAfterError = finalizeBlockAfterError;
    window.__ginaCheckDocking = checkDocking;
});
