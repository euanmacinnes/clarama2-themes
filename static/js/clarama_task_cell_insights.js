window.__ginaInsightsHandshakeSent = window.__ginaInsightsHandshakeSent || {};
window.__ginaInsightsHandshakeDone = window.__ginaInsightsHandshakeDone || {};
window.__ginaChatActive            = window.__ginaChatActive || {};
window.__ginaStreamBuf             = window.__ginaStreamBuf || {};
window.__ginaStreamIdleTimer       = window.__ginaStreamIdleTimer || {};
window.__ginaIdleTimers            = window.__ginaIdleTimers || Object.create(null);

/* ---------------------------------------------------------------------- */
/* Utilities                                                              */
/* ---------------------------------------------------------------------- */

function debounce(fn, wait, immediate) {
    let timeout;
    return function debounced(...args) {
        const ctx = this;
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            timeout = null;
            if (!immediate) fn.apply(ctx, args);
        }, wait);
        if (callNow) fn.apply(ctx, args);
    };
}

/**
 * Stop piping messages into the Chat bubble for this task.
 */
function pauseChatStream(taskIndex) {
    if (!taskIndex) return;
    const cbKey = `cell_insights_chat_callback_${taskIndex}`;
    window.__ginaChatActive[taskIndex] = false;
    try { delete window[cbKey]; } catch (_) {}
    try {
        if (window.__ginaStreamIdleTimer && window.__ginaStreamIdleTimer[taskIndex]) {
            clearTimeout(window.__ginaStreamIdleTimer[taskIndex]);
        }
    } catch (_) {}
}

/** Ensure console reflects the currently active tab for a task */
function syncInsightsConsole(taskIndex) {
    if (!taskIndex) return;
    // Find the active tab button inside this task's tabs host
    const tabsHost = document.getElementById(`insightsTabs_${taskIndex}`);
    if (!tabsHost) return;
    const activeBtn =
        tabsHost.querySelector('.nav-link.active') ||
        tabsHost.querySelector('[data-bs-toggle="tab"].active');
    if (!activeBtn) return;

    // Normalize a "role" from id/target/text for resilience
    const id     = activeBtn.id || "";
    const target = activeBtn.getAttribute('data-bs-target') || "";
    const label  = (activeBtn.textContent || "").toLowerCase();
    const blob   = `${id} ${target} ${label}`;

    let role = "python"; // default for non-chat/non-data tabs
    if (/chat/.test(blob))       role = "gina";
    else if (/data\s*inspector|insights-data|data\-inspector/.test(blob)) role = "data";
    else if (/code\s*inspector|insights-code|code\-inspector/.test(blob)) role = "python";
    // Variables / Preview / Global Fields -> python mode as per your spec

    // Apply mode
    set_console_mode(taskIndex, role);
    if (role === "gina") {
        // Re-arm chat streaming when Chat tab is active
        try { initialiseInsightsGina(taskIndex); } catch (_) {}
    } else {
        // Make sure chat stream doesn't grab stdout in non-chat tabs
        try { pauseChatStream(taskIndex); } catch (_) {}
    }
}

/** Normalize any incoming stream chunk to string */
function normalizeChunk(chunk) {
    if (Array.isArray(chunk)) return chunk.join("");
    if (chunk && typeof chunk === "object") {
        return chunk.text ? chunk.text : "";
    }
    return typeof chunk === "string" ? chunk : "";
}

function resolveTaskIndexFromNode(node) {
    if (!node) return null;
    const cellItem = node.closest ? node.closest('li.clarama-cell-item') : null;
    if (cellItem) {
        // Prefer right/left content ids like right_content_12 / left_content_12
        const right = cellItem.querySelector('.right-content[id^="right_content_"]');
        const left  = cellItem.querySelector('.left-content[id^="left_content_"]');
        const idFrom = (el) => {
            if (!el || !el.id) return null;
            const m = el.id.match(/_(\d+)$/);
            return m ? m[1] : null;
        };
        const idx = idFrom(right) || idFrom(left);
        if (idx) return idx;
    }
    // Fallback: nearest chat tab pane id `insights-chat-{i}`
    const chatPane = node.closest ? node.closest('[id^="insights-chat-"]') : null;
    if (chatPane && chatPane.id) {
        const m = chatPane.id.match(/insights-chat-(\d+)$/);
        if (m) return m[1];
    }
    return null;
}    

/** Quick DOM helpers */
function getCellByTask(taskIndex) {
    return $(`li.clarama-cell-item[step="${taskIndex}"]`);
}
function getActiveTabId(taskIndex) {
    const $tabs = $(`#insightsTabs_${taskIndex}`);
    return ($tabs.find(".nav-link.active").attr("id") || "");
}
function tabIs(activeId, prefix) {
    return activeId.startsWith(prefix);
}

/* ---------------------------------------------------------------------- */
/* Kernel Helpers                                                         */
/* ---------------------------------------------------------------------- */

function getKernelUrl() {
    const socket_div = $("#edit_socket");
    const task_kernel_id = socket_div.attr("task_kernel_id");
    return $CLARAMA_ENVIRONMENTS_KERNEL_RUN + task_kernel_id;
}

/** Read all fields from the current cell and return task_registry */
function buildTaskRegistry($cell) {
    // Prefer existing get_cell_fields() util if present
    const reg = get_cell_fields($cell) || {};
    if (!reg.streams || !reg.streams[0]) reg.streams = [{ main: [{}] }];
    if (!reg.streams[0].main) reg.streams[0].main = [{}];
    if (!reg.streams[0].main[0]) reg.streams[0].main[0] = {};
    return reg;
}

/** Ensure stream scaffold (main[0]) and return it */
function ensureStreamScaffold(task_registry) {
    if (!task_registry.streams || !task_registry.streams[0]) task_registry.streams = [{ main: [{}] }];
    if (!task_registry.streams[0].main) task_registry.streams[0].main = [{}];
    if (!task_registry.streams[0].main[0]) task_registry.streams[0].main[0] = {};
    return task_registry.streams[0].main[0];
}

/** Generic POST to kernel with given registry (returns jqXHR) */
function ajaxRun(task_registry, failMsg = "Kernel request failed") {
    const url = getKernelUrl();
    return $.ajax({
        type: "POST",
        url,
        dataType: "json",
        contentType: "application/json",
        data: JSON.stringify(task_registry)
    }).fail(() => {
        flash(failMsg, "danger");
    });
}

/** Build and send a kernel post (shared shape) */
function postToKernel(taskIndex, streamSpec, parameters = null, failMsg = "Kernel request failed") {
    const $cell = getCellByTask(taskIndex);
    const task_registry = buildTaskRegistry($cell);
    const spec = ensureStreamScaffold(task_registry);

    spec.target = "insights";
    spec.type   = streamSpec.type;
    spec.clear  = !!streamSpec.clear;

    if ("source" in streamSpec)  spec.source  = streamSpec.source;
    if ("content" in streamSpec) spec.content = streamSpec.content;
    if ("output" in streamSpec)  spec.output  = streamSpec.output;
    if ("tabs"   in streamSpec)  spec.tabs    = streamSpec.tabs;

    task_registry.parameters = parameters || {};
    return ajaxRun(task_registry, failMsg);
}

/** Configure Python execution spec for console/inspect */
function set_insight_behaviour(task_registry, code_command, field_registry, isInspecting = false) {
    const spec = ensureStreamScaffold(task_registry);
    if (!isInspecting) spec.target = "insights";
    spec.type    = "code";
    spec.content = code_command;
    spec.clear   = false;
    task_registry.parameters = field_registry;
}

/* ---------------------------------------------------------------------- */
/* Console Controls                                                        */
/* ---------------------------------------------------------------------- */

function setConsoleEnabled(taskIndex, enabled) {
    const $input  = $(`#console_input_${taskIndex}`);
    const $sendBtn = $(`.execute-console[step="${taskIndex}"], .execute-console[data-task-index="${taskIndex}"]`);

    $input
        .prop("disabled", !enabled)
        .attr("aria-disabled", String(!enabled))
        .toggleClass("console-disabled", !enabled);

    $sendBtn.prop("disabled", !enabled);
}

function setConsoleVisible(taskIndex, visible) {
    const $wrap = $(`#insights_${taskIndex} .insights-console`);
    $wrap.toggleClass("d-none", !visible);
}

function setConsolePlaceholder(taskIndex, text) {
    const $input = $(`#console_input_${taskIndex}`);
    if ($input.length) $input.attr("placeholder", text);
}

/** Toggle console placeholder/mode per tab */
function set_console_mode(taskIndex, mode) {
    const $input = $(`#console_input_${taskIndex}`);
    if (!$input.length) return;
    if (mode === "gina") {
        $input.attr("placeholder", "Message GINA…").data("console-mode", "gina");
        $input.removeClass("font-monospace");
    } else if (mode === "data") {
        $input.attr("placeholder", "Enter data command").data("console-mode", "data");
        $input.addClass("font-monospace");
    } else {
        $input.attr("placeholder", "Enter Python command.").data("console-mode", "python");
        $input.addClass("font-monospace");
    }
}

/** Determine console mode from active tab */
function get_console_mode(taskIndex) {
    const activeId = getActiveTabId(taskIndex);
    if (tabIs(activeId, "insights-chat-tab-")) return "gina";
    if (tabIs(activeId, "insights-data-inspector-tab-")) return "data";
    return "python";
}

function is_chat_tab_active(taskIndex) {
    return get_console_mode(taskIndex) === "gina";
}

/** Ensure console reflects the currently active tab for a task */
function syncInsightsConsole(taskIndex) {
    const activeId = getActiveTabId(taskIndex) || "";
    configureConsoleForActiveTab(taskIndex, activeId);
    if (activeId.startsWith("insights-chat-tab-")) {
        initialiseInsightsGina(taskIndex);
    }
}

/** Configure console for currently active tab id */
function configureConsoleForActiveTab(taskIndex, activeTabId) {
    const hide = tabIs(activeTabId, "insights-preview-tab-") || tabIs(activeTabId, "insights-global-fields-tab-");
    setConsoleVisible(taskIndex, !hide);
}

/* ---------------------------------------------------------------------- */
/* Chat bubbles + streaming                                                */
/* ---------------------------------------------------------------------- */

function finalizePreviousReplyBubble(taskIndex) {
    const $prev = $(`#insights_gina_chat_${taskIndex} #gina_stream_${taskIndex}`);
    if (!$prev.length) return;

    const $span = $prev.find(".stream-text");
    if ($span.length) {
        const text = $span.text();
        $span.replaceWith(document.createTextNode(text));
    }
    $prev.removeAttr("id").removeClass("insights-gina-chat-reply").addClass("insights-gina-chat-assistant");
}

/** Load a bubble template into chat area */
function appendChatBubbleViaTemplate(taskIndex, role, streamId) {
    const $chat = $(`#insights_gina_chat_${taskIndex}`);
    if (!$chat.length) return null;

    const params = new URLSearchParams({ role, stream_id: streamId });
    const chatBubble = $(`<div class="clarama-post-embedded clarama-replaceable">`)
        .attr("url", `/template/render/explorer/files/_cell_insights_gina_chat_block?${params}`);

    $chat.append(chatBubble);
    enable_interactions($chat);
    return chatBubble;
}

/** If no stream bubble, create one and return its id */
function ensureStreamBubble(taskIndex) {
    if (!is_chat_tab_active(taskIndex)) return null;
    const streamId = `gina_stream_${taskIndex}`;
    if (!document.getElementById(streamId)) {
        appendChatBubbleViaTemplate(taskIndex, "reply", streamId);
    }
    return streamId;
}

/** Smooth scroll to bottom of chat if present */
function scrollChatToBottom(taskIndex) {
    const $chat = $(`#insights_gina_chat_${taskIndex}`);
    if ($chat.length) $chat.scrollTop($chat[0].scrollHeight);
}

/** Minimal whitespace cleanup (kept for compatibility) */
function cleanStreamText(text, append) {
    if (!append) {
        return String(text || "").replace(/^\s+/, "").replace(/\n{3,}/g, "\n\n");
    }
    return String(text || "");
}

/** Render streaming text into the current bubble (markdown aware) */
function setStreamText(streamId, text, { append = false } = {}) {
    const el = document.getElementById(streamId);
    if (!el) { setTimeout(() => setStreamText(streamId, text, { append }), 16); return; }

    const bubble = el.querySelector(".insights-gina-chat-bubble");
    if (!bubble) return;

    let htmlDiv = bubble.querySelector(".stream-html");
    let textSpan = bubble.querySelector(".stream-text");

    // Ensure HTML container (render markdown/code), remove text span to avoid duplication
    if (!htmlDiv) {
        htmlDiv = document.createElement("div");
        htmlDiv.className = "stream-html";
        if (textSpan) textSpan.remove();
        bubble.appendChild(htmlDiv);
    }

    const next = String(text || "");
    if (append && htmlDiv.__buffer) htmlDiv.__buffer += next;
    else htmlDiv.__buffer = next;

    // markdownToHtml is expected to be globally available
    htmlDiv.innerHTML = markdownToHtml(htmlDiv.__buffer);
    attachCodeInsertBars(htmlDiv);
}

/** Stream loop: arms websocket callback key and handles idle close */
function armStream(taskIndex, onChunk) {
    const cbKey = `cell_insights_chat_callback_${taskIndex}`;
    let sawFirstChunk = false;

    function scheduleIdleClose() {
        clearTimeout(window.__ginaStreamIdleTimer[taskIndex]);
        window.__ginaStreamIdleTimer[taskIndex] = setTimeout(() => {
            window.__ginaChatActive[taskIndex] = false;
            try { delete window[cbKey]; } catch (_) {}
            finalizePreviousReplyBubble(taskIndex);
            setConsoleEnabled(taskIndex, true);
        }, 1500);
    }

    const handler = function (chunk) {
        const string = normalizeChunk(chunk);
        if (string) {
            onChunk(string);
            if (!sawFirstChunk) { sawFirstChunk = true; }
            scheduleIdleClose();
        }
        if (window.__ginaChatActive[taskIndex]) {
            setTimeout(() => { window[cbKey] = handler; }, 0);
        }
    };

    window[cbKey] = handler;
}

function clear_insights_gina_chat(taskIndex) {
    const $chat = $(`#insights_gina_chat_${taskIndex}`);
    if ($chat.length) $chat.empty();

    const chatKey = `cell_insights_chat_callback_${taskIndex}`;
    try { delete window[chatKey]; } catch (_) {}
    clearTimeout(window.__ginaStreamIdleTimer?.[taskIndex]);

    if (window.__ginaStreamBuf) delete window.__ginaStreamBuf[taskIndex];
    if (window.__ginaChatActive) delete window.__ginaChatActive[taskIndex];
}

/* ---------------------------------------------------------------------- */
/* DATA MODE                                                               */
/* ---------------------------------------------------------------------- */

/** Resolve current Data Inspector "source" value depending on cell mode */
function resolveDataSource(taskIndex) {
    // Source-Edit mode: presence of the single source input implies source-edit
    const sourceInputEl = document.getElementById(`task_step_${taskIndex}_source`);
    if (sourceInputEl) {
        return {
            mode: "source-edit",
            source: String(sourceInputEl.value || "").trim(),
            tabId: null
        };
    }

    // Data-Editor with tabs: use active tab's source field
    const container = document.querySelector(`#dataEditTabContentContainer_${taskIndex}`);
    if (!container) return { mode: "none", source: "", tabId: null };

    const pane = container.querySelector(".tab-pane.show.active") || container.querySelector(".tab-pane");
    const tabId = (pane && pane.getAttribute("data-tab-id")) || "0";
    const tabSourceInput = document.getElementById(`task_step_${taskIndex}_source_${tabId}`);
    const sourceVal = tabSourceInput ? String(tabSourceInput.value || "").trim() : "";

    return { mode: "tabbed", source: sourceVal, tabId };
}

/** Send a dataQuery via the Insights console to kernel (Data Inspector tab) */
function cell_insights_data_run(cell_button, dataQuery) {
    const taskIndex = (cell_button && (cell_button.attr("step") || cell_button.attr("data-task-index"))) || null;
    if (!taskIndex) { console.warn("Insights Data Inspector: No taskIndex found"); return; }

    const activeTabId = getActiveTabId(taskIndex);
    if (!tabIs(activeTabId, "insights-data-inspector-tab-")) {
        console.debug("Data run suppressed: not on Data Inspector tab");
        return;
    }

    // Read command from argument or console
    const $input = $(`#console_input_${taskIndex}`);
    let query = String(dataQuery || "").trim();
    if (!query && $input.length) query = String($input.val() || "").trim();
    if (!query) return;
    if ($input.is(":disabled")) return;

    pauseChatStream(taskIndex);

    get_field_values({}, true, function (field_registry) {
        field_registry.clarama_task_kill = false;

        const { mode, source, tabId } = resolveDataSource(taskIndex);
        const $cell = getCellByTask(taskIndex);
        const task_registry = buildTaskRegistry($cell);
        const spec = ensureStreamScaffold(task_registry);

        spec.target = "insights";
        spec.type   = "data";
        spec.output = "table";
        spec.clear  = true;
        spec.source = source;
        spec.content = query;

        console.log("spec: ", spec);

        // If tabbed, keep spec.tabs aligned to active tab
        if (mode === "tabbed" && tabId != null) {
            spec.tabs = Array.isArray(spec.tabs) ? spec.tabs : [];
            let foundIdx = spec.tabs.findIndex(t => String(t?.tab_id ?? "") === String(tabId));
            if (foundIdx < 0) {
                spec.tabs.push({ tab_id: Number(tabId) || 0 });
                foundIdx = spec.tabs.length - 1;
            }
            spec.tabs[foundIdx] = Object.assign({}, spec.tabs[foundIdx], {
                tab_id: Number(tabId) || 0,
                source,
                content: query
            });
        }

        task_registry.parameters = field_registry;

        window.__insightsDataRoute = window.__insightsDataRoute || {};
        window.__insightsDataRoute[taskIndex] = { active: true, at: Date.now() };

        ajaxRun(task_registry, "Data query failed: access/network issue");
    });
}

/* ---------------------------------------------------------------------- */
/* CODE INSPECTOR                                                         */
/* ---------------------------------------------------------------------- */

function getAceEditorForTask(taskIndex) {
    const left = document.getElementById(`left_content_${taskIndex}`);
    if (!left) return null;
    const aceHost = left.querySelector('.ace_editor');
    if (!aceHost || !window.ace || typeof window.ace.edit !== 'function') return null;
    if (!aceHost.id) aceHost.id = `ace_${taskIndex}_${Date.now()}`;
    return window.ace.edit(aceHost.id);
}

function getCurrentCodeAndCursor(taskIndex) {
    const editor = getAceEditorForTask(taskIndex);
    if (!editor) return { code: "", row: 1, column: 1, ok: false };
    const code = editor.getValue();
    const pos = editor.getCursorPosition();
    return { code, row: (pos.row ?? 0) + 1, column: (pos.column ?? 0) + 1, ok: true };
}

function renderCodeInspectorResult(taskIndex, text) {
    const host = document.getElementById(`code-inspector-results-${taskIndex}`);
    if (!host) return;
    host.innerHTML = "";
    const pre = document.createElement("pre");
    pre.className = "code-response font-monospace mb-0";
    pre.textContent = String(text ?? "");
    host.appendChild(pre);
}

function cell_insights_code_inspect_reload(taskIndex) {
    const $cell = getCellByTask(taskIndex);
    if (!$cell.length) { console.error("Cell not found for task", taskIndex); return; }

    // Pull latest code + cursor from Ace
    const { code, row, column, ok } = getCurrentCodeAndCursor(taskIndex);
    if (!ok) {
        renderCodeInspectorResult(taskIndex, "Editor not ready. Click Reload again once the editor has mounted.");
        observeEditorReady(taskIndex);
        return;
    }

    const cbName = `cell_insights_code_inspector_callback_${taskIndex}`;
    window[cbName] = function (output) {
        renderCodeInspectorResult(taskIndex, output);
    };

    // kernel function "inspect_code" is not exposed yet
    const py = `
_code = ${JSON.stringify(code)}
_row = ${row}
_col = ${column}
try:
    _out = inspect_code(_code, _row, _col)
    print("" if _out is None else str(_out))
except Exception as e:
    print(str(e))
`.trim();

    // Send to kernel
    get_field_values({}, true, function (field_registry) {
        const task_registry = buildTaskRegistry($cell);
        set_insight_behaviour(task_registry, py, field_registry);
        pauseChatStream(taskIndex);

        renderCodeInspectorResult(taskIndex, "… inspecting at row " + row + ", col " + column + " …");

        ajaxRun(task_registry, "Code inspection failed: access/network issue").done((data) => {
            if (!(data && data.data === "ok")) {
                renderCodeInspectorResult(taskIndex, "Could not inspect code");
            }
        }).fail(() => {
            renderCodeInspectorResult(taskIndex, "Could not inspect code");
        });
    });
}

/* ---------------------------------------------------------------------- */
/* CHAT WITH GINA (INSIGHTS PANE)                                         */
/* ---------------------------------------------------------------------- */

function cell_insights_gina_run(cell_button, questionText) {
    const taskIndex = (cell_button && (cell_button.attr("step") || cell_button.attr("data-task-index"))) || null;
    if (!taskIndex) { console.warn("GINA chat: No taskIndex found"); return; }

    if (!is_chat_tab_active(taskIndex)) {
        console.debug("GINA chat suppressed: not on Chat tab");
        return;
    }

    // Resolve text (argument or console input)
    const $input = $(`#console_input_${taskIndex}`);
    let text = String(questionText || "").trim();
    if (!text && $input.length) text = String($input.val() || "").trim();
    if (!text) return;
    if ($input.is(":disabled")) return;
    if ($input.length) $input.val("");

    if (text.trim().toLowerCase() === "/reset") {
        clear_insights_gina_chat(taskIndex);
        get_field_values({}, true, function (field_registry) {
            field_registry.clarama_task_kill = false;
            postToKernel(
                taskIndex,
                {
                    type: "question",
                    source: text,
                    clear: false
                },
                field_registry,
                "Couldn't process reset, network or access issue"
            );
        });
        return;
    }

    // User bubble
    try {
        const bubbleId = `gina_user_${taskIndex}_${Date.now()}`;
        appendChatBubbleViaTemplate(taskIndex, "user", bubbleId);
        setStreamText(bubbleId, text, { append: false });
        scrollChatToBottom(taskIndex);
    } catch (e) {
        console.warn("GINA chat: unable to render user bubble", e);
    }

    // Prepare reply streaming bubble
    finalizePreviousReplyBubble(taskIndex);
    const streamId = ensureStreamBubble(taskIndex);

    window.__ginaChatActive[taskIndex] = true;
    window.__ginaStreamBuf[taskIndex] = "";

    setConsoleEnabled(taskIndex, false);
    setStreamText(streamId, "thinking...", { append: false });
    scrollChatToBottom(taskIndex);

    // Stream handler
    armStream(taskIndex, (s) => {
        window.__ginaStreamBuf[taskIndex] += s;
        setStreamText(streamId, window.__ginaStreamBuf[taskIndex], { append: false });
        scrollChatToBottom(taskIndex);
    });

    // Send question to kernel
    get_field_values({}, true, function (field_registry) {
        field_registry.clarama_task_kill = false;
        postToKernel(taskIndex, { type: "question", source: text, clear: false }, field_registry);
    });
}

function attachCodeInsertBars(rootEl) {
    const pres = rootEl.querySelectorAll('pre.ginacode:not(.__barified)');
    pres.forEach(pre => {
        pre.classList.add('__barified');

        let wrap = pre.closest('.ginacode-wrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.className = 'ginacode-wrap';
            pre.parentNode.insertBefore(wrap, pre);
            wrap.appendChild(pre);
        }
        if (wrap.querySelector('.code-insert-bar')) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'code-insert-bar';
        btn.title = 'Insert code to the left editor';
        btn.setAttribute('aria-label', 'Insert code to the left editor');
        btn.innerHTML = '<i class="bi bi-arrow-bar-left" aria-hidden="true"></i>';

        (function primeDisabled() {
            const idx = resolveTaskIndexFromNode(btn);
            if (idx && !findEditorInLeft(idx)) {
                btn.classList.add('disabled');
                observeEditorReady(idx);
            }
        })();

        btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();

            const idx = resolveTaskIndexFromNode(btn);
            if (!idx) return;

            if (!findEditorInLeft(idx)) {
                btn.classList.add('disabled');
                observeEditorReady(idx);
                return;
            }
            btn.classList.remove('disabled');

            const codeEl = pre.querySelector('code');
            const codeText = codeEl ? codeEl.textContent : (pre.textContent || '');
            insertCodeIntoAceEditor(idx, codeText);

            btn.classList.add('active');
            setTimeout(() => btn.classList.remove('active'), 180);
        });

        wrap.appendChild(btn);
    });
}

function resolveTaskIndexFromChat(rootEl) {
    const pane = rootEl.closest('[id^="insights-chat-"]');
    if (!pane) return null;
    const m = pane.id.match(/insights-chat-(\d+)/);
    return m ? m[1] : null;
}

function insertCodeIntoAceEditor(taskIndex, text) {
    if (!text) return;

    // If a focused input/textarea inside left-content, insert at caret
    let left = document.getElementById(`left_content_${taskIndex}`);
    if (!left) {
        // Fallback: find the left pane inside this cell’s DOM
        const cell = getCellByTask(taskIndex);
        if (cell && cell.length) {
            left = cell[0].querySelector('.left-content[id^="left_content_"]') || null;
        }
    }
    if (!left) return;

    const active = document.activeElement;
    if (active && left.contains(active) && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
        const start = active.selectionStart ?? active.value.length;
        const end   = active.selectionEnd ?? start;
        const before = active.value.slice(0, start);
        const after  = active.value.slice(end);
        active.value = before + text + after;
        const pos = start + text.length;
        active.selectionStart = active.selectionEnd = pos;
        active.dispatchEvent(new Event('input', { bubbles: true }));
        return;
    }

    // Try to find an Ace host inside the left content
    const aceHost = left.querySelector('.ace_editor');
    if (aceHost && window.ace && typeof window.ace.edit === 'function') {
        // ensure the host has an id for ace.edit
        if (!aceHost.id) aceHost.id = `ace_${taskIndex}_${Date.now()}`;
        const editor = window.ace.edit(aceHost.id);
        try {
            const Range = window.ace.require && window.ace.require("ace/range").Range;
            // insert at current cursor (or end-of-doc)
            const pos = editor.getCursorPosition();
            editor.session.insert(pos, text);
            editor.focus();
            return;
        } catch (_) {
            // fall through to contentEditable / append
        }
    }
}

function findEditorInLeft(taskIndex) {
    const left = document.getElementById(`left_content_${taskIndex}`);
    if (!left) return null;

    // 1) Ace host (preferred)
    const ace = left.querySelector('.ace_editor');
    if (ace) return ace;

    return null;
}

function observeEditorReady(taskIndex) {
    let left = document.getElementById(`left_content_${taskIndex}`);
    if (!left) {
        // If left pane isn't mounted yet, poll briefly and then bail out cleanly
        setTimeout(() => observeEditorReady(taskIndex), 60);
        return;
    }

    // If already present, just enable right away.
    if (findEditorInLeft(taskIndex)) {
        toggleBarsForTask(taskIndex, /*enabled=*/true);
        return;
    }

    const obs = new MutationObserver(() => {
        if (findEditorInLeft(taskIndex)) {
            toggleBarsForTask(taskIndex, /*enabled=*/true);
            obs.disconnect();
        }
    });
    obs.observe(left, { childList: true, subtree: true });
}    

/** Enable/disable all insert bars that belong to this task's chat tab */
function toggleBarsForTask(taskIndex, enabled) {
    let pane = document.getElementById(`insights-chat-${taskIndex}`);
    if (!pane) {
        const cell = getCellByTask(taskIndex);
        if (cell && cell.length) {
            pane = cell[0].querySelector(`#insights-chat-${taskIndex}`) ||
                   cell[0].querySelector('[id^="insights-chat-"]');
        }
    }
    if (!pane) return;
    pane.querySelectorAll('.code-insert-bar').forEach(btn => {
        if (enabled) btn.classList.remove('disabled');
        else btn.classList.add('disabled');
    });
}

/** (/init) handshake for Chat with GINA. If `force` is true, always send. */
function initialiseInsightsGina(taskIndex, force = false) {
    if (!taskIndex) return;
    if (!force && (window.__ginaInsightsHandshakeSent[taskIndex] || window.__ginaInsightsHandshakeDone[taskIndex])) return;
    window.__ginaInsightsHandshakeSent[taskIndex] = true;
    window.__ginaChatActive[taskIndex] = true;
    window.__ginaStreamBuf[taskIndex] = "";

    armStream(taskIndex, (s) => {
        const streamEl = document.getElementById(`gina_stream_${taskIndex}`);
        const sid = streamEl ? `gina_stream_${taskIndex}` : ensureStreamBubble(taskIndex);
        window.__ginaStreamBuf[taskIndex] += s;
        setStreamText(sid, window.__ginaStreamBuf[taskIndex], { append: false });
        scrollChatToBottom(taskIndex);
    });

    // Build JSON payload from the cell
    let cellContent = "{}";
    const $cell = getCellByTask(taskIndex);
    if ($cell && $cell.length) {
        cellContent = JSON.stringify(extractCellContent($cell));
    }
    const initCommand = `/init ${cellContent}`;
    // console.log('initCommand: ', initCommand);

    get_field_values({}, true, function (field_registry) {
        field_registry.clarama_task_kill = false;
        postToKernel(
            taskIndex,
            { type: "question", source: initCommand, clear: false },
            field_registry
        ).always(() => { window.__ginaInsightsHandshakeDone[taskIndex] = true; });
    });
}

/* ---------------------------------------------------------------------- */
/* VARIABLES TAB                                                           */
/* ---------------------------------------------------------------------- */

function createVariableButtonDirect(varName, taskIndex) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "variable-item";
    button.setAttribute("data-variable", varName);
    button.setAttribute("data-task-index", taskIndex);

    const span = document.createElement("span");
    span.className = "variable-name";
    span.textContent = varName;

    button.appendChild(span);
    return button;
}

/** Template-based variable button (kept for compatibility if needed) */
function createVariableButton(varName, taskIndex) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "variable-item clarama-post-embedded clarama-replaceable";
    button.setAttribute("data-variable", varName);
    button.setAttribute("data-task-index", taskIndex);

    const params = new URLSearchParams({ variable_name: varName, task_index: taskIndex });
    button.setAttribute("url", `/template/render/explorer/files/_cell_insights_variable_button?${params.toString()}`);
    return button;
}

function createVariablesContainer(taskIndex) {
    const div = document.createElement("div");
    div.className = "variables-horizontal-container";
    div.id = `variables_container_${taskIndex}`;
    div.setAttribute("data-task-index", taskIndex);
    return div;
}

function createEmptyVariablesMessage(message = "No user variables found") {
    const div = document.createElement("div");
    div.className = "text-muted p-3";
    div.textContent = message;
    return div;
}

/** Split respecting quotes (helper for parseVariableString) */
function splitRespectingQuotes(str) {
    const out = [];
    let cur = "";
    let inQuotes = false;
    let quote = null;

    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if ((ch === '"' || ch === "'") && !inQuotes) { inQuotes = true; quote = ch; continue; }
        if (ch === quote && inQuotes) { inQuotes = false; quote = null; continue; }
        if (ch === "," && !inQuotes) { if (cur.trim()) out.push(cur.trim()); cur = ""; continue; }
        if (ch !== '"' && ch !== "'") cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

/** Parse Python list string to names */
function parseVariableString(s) {
    let str = String(s || "").trim();
    if (str.startsWith("[") && str.endsWith("]")) {
        const inner = str.slice(1, -1).trim();
        if (!inner) return [];
        return splitRespectingQuotes(inner);
    }
    return [str];
}

/** Populate a variables container with buttons */
function populateVariablesContainer(container, variableNames, taskIndex) {
    // cleanup listeners
    container.querySelectorAll(".variable-item").forEach(btn => {
        if (btn._variableClickHandler) btn.removeEventListener("click", btn._variableClickHandler);
    });

    container.innerHTML = "";
    const frag = document.createDocumentFragment();

    variableNames.forEach(name => {
        const btn = createVariableButtonDirect(name, taskIndex);
        frag.appendChild(btn);
    });

    container.appendChild(frag);
    attachVariableClickHandlers(container, taskIndex);
}

function categoryContainerIds(taskIndex) {
    return {
        modules:    `variables_modules_${taskIndex}`,
        classes:    `variables_classes_${taskIndex}`,
        methods:    `variables_methods_${taskIndex}`,
        objects:    `variables_objects_${taskIndex}`,
        primitives: `variables_primitives_${taskIndex}`,
        data:       `variables_data_${taskIndex}`
    };
}

function createEmptyMsg(msg) {
    const div = document.createElement("div");
    div.className = "text-muted p-3";
    div.textContent = msg;
    return div;
}

function renderCategoryList(targetId, names, taskIndex) {
    const host = document.getElementById(targetId);
    if (!host) return;
    host.innerHTML = "";
    if (!names || !names.length) {
        host.appendChild(createEmptyMsg("Nothing here yet"));
        return;
    }
    const container = createVariablesContainer(taskIndex);
    populateVariablesContainer(container, names, taskIndex);
    host.appendChild(container);
}

/** When we receive a mapping {name: "modules"|"objects"|"primitives"|"data"} */
function populateVariablesByCategory(mapping, taskIndex) {
    const ids = categoryContainerIds(taskIndex);
    const buckets = { modules: [], classes: [], methods: [], objects: [], primitives: [], data: [] };

    try {
        // mapping may be a JSON string
        const mapObj = (typeof mapping === "string") ? JSON.parse(mapping) : mapping;
        Object.entries(mapObj || {}).forEach(([name, cat]) => {
            const key = (String(cat || "").toLowerCase());
            if (key === "modules")      buckets.modules.push(name);
            else if (key === "classes") buckets.classes.push(name);
            else if (key === "methods") buckets.methods.push(name);
            else if (key === "objects") buckets.objects.push(name);
            else if (key === "primitives") buckets.primitives.push(name);
            else if (key === "data")    buckets.data.push(name);
            else buckets.objects.push(name); // default bucket
        });
    } catch (e) {
        // If parsing fails, dump everything into Objects so we still show something
        console.warn("Failed to parse variables mapping; falling back:", e);
        const names = Array.isArray(mapping) ? mapping : [];
        buckets.objects = names;
    }

    renderCategoryList(ids.modules,    buckets.modules,    taskIndex);
    renderCategoryList(ids.classes,    buckets.classes,    taskIndex);
    renderCategoryList(ids.methods,    buckets.methods,    taskIndex);
    renderCategoryList(ids.objects,    buckets.objects,    taskIndex);
    renderCategoryList(ids.primitives, buckets.primitives, taskIndex);
    renderCategoryList(ids.data,       buckets.data,       taskIndex);
}

/** Attach debounced click handlers to variable buttons */
function attachVariableClickHandlers(container, taskIndex) {
    container.querySelectorAll(".variable-item").forEach(button => {
        if (button._variableClickHandler) {
            button.removeEventListener("click", button._variableClickHandler);
        }
        button._variableClickHandler = debounce(function (e) {
            e.preventDefault(); e.stopPropagation();
            const varName = this.dataset.variable;
            container.querySelectorAll(".variable-item").forEach(b => b.classList.remove("selected"));
            this.classList.add("selected");
            inspectVariable(varName, taskIndex);
        }, 150);
        button.addEventListener("click", button._variableClickHandler);
    });
}

/** Legacy jQuery plugin binding (kept for compatibility) */
$.fn.interact_variable = function () {
    return this.each(function () {
        const $this = $(this);
        $this.off("click.variable");
        const handler = debounce(function (e) {
            e.preventDefault(); e.stopPropagation();
            const varName = this.dataset.variable;
            const taskIndex = this.dataset.taskIndex;
            const container = this.closest(".variables-horizontal-container");
            $(container).find(".variable-item").removeClass("selected");
            $(this).addClass("selected");
            inspectVariable(varName, taskIndex);
        }, 150);
        $this.on("click.variable", handler);
    });
};

/** Execute “list variables” in the cell kernel and render them */
function cell_insights_variables_run(cell_button, outputCallback) {
    const taskIndex = cell_button.attr("step") || cell_button.attr("data-task-index");
    const shownIndex = cell_button.closest("li.clarama-cell-item").find("button.step-label").text().trim();

    const runningKey = `cell_insights_running_${taskIndex}`;
    if (window[runningKey]) {
        console.log("Cell insights already running for task", taskIndex);
        return;
    }
    window[runningKey] = true;

    // Kernel callback: receives JSON mapping "name" -> category
    window[`cell_insights_variables_callback_${taskIndex}`] = function (output) {
        populateVariablesByCategory(output, taskIndex);
        if (outputCallback) outputCallback(output);
        delete window[runningKey];
    };

    get_field_values({}, true, function (field_registry) {
        const $cell = getCellByTask(taskIndex);
        const task_registry = buildTaskRegistry($cell);

        const code = `
import sys, json, types, inspect
try:
    import numpy as _np
except Exception:
    class _FakeNP: pass
    _np = _FakeNP()
try:
    import pandas as _pd
except Exception:
    class _FakePD: pass
    _pd = _FakePD()

def _is_np_array(x):
    try:
        return isinstance(x, _np.ndarray)
    except Exception:
        return False

def _is_pd(x):
    try:
        import pandas as _pdx
        return isinstance(x, (_pdx.DataFrame, _pdx.Series))
    except Exception:
        return False

def _is_classlike(x):
    return inspect.isclass(x) or isinstance(x, type)

def _is_methodlike(x):
    return (
        inspect.isfunction(x)
        or inspect.ismethod(x)
        or inspect.isbuiltin(x)
        or inspect.ismethoddescriptor(x)
        or inspect.isroutine(x)
        or isinstance(x, types.BuiltinFunctionType)
        or isinstance(x, types.MethodType)
    )

def _is_primitive(x):
    return isinstance(x, (str, int, float, bool, bytes, complex))

def _is_data(x):
    # dict/list/tuple/set OR numpy/pandas
    return isinstance(x, (dict, list, tuple, set)) or _is_np_array(x) or _is_pd(x)

categories = {}
for _name, _val in list(locals().items()):
    if _name.startswith("_") or _name in ("In","Out","get_ipython","exit","quit"):
        continue
    try:
        if inspect.ismodule(_val):
            categories[_name] = "modules"
        elif _is_classlike(_val):
            categories[_name] = "classes"
        elif _is_methodlike(_val):
            categories[_name] = "methods"
        elif _is_primitive(_val):
            categories[_name] = "primitives"
        elif _is_data(_val):
            categories[_name] = "data"
        elif hasattr(_val, "__class__") and _val.__class__ is not object:
            categories[_name] = "classes"
        else:
            categories[_name] = "objects"
    except Exception:
        categories[_name] = "objects"

print(json.dumps(categories))
        `.trim();

        set_insight_behaviour(task_registry, code, field_registry);
        pauseChatStream(taskIndex);

        ajaxRun(task_registry).done((data) => {
            if (data && data.data === "ok") {
                console.log("Variables classification submitted for task", shownIndex);
            } else {
                const err = data && data.error ? data.error : "Unknown error";
                console.log("Variables classification failed for task", taskIndex);
                const ids = categoryContainerIds(taskIndex);
                [ids.modules, ids.classes, ids.methods, ids.objects, ids.primitives, ids.data].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.innerHTML = `<div class="text-danger p-3">Error loading variables: ${err}</div>`;
                });
                flash("Couldn't run variables classification: " + err, "danger");
                window[`cell_insights_variables_callback_${taskIndex}`] = null;
                delete window[runningKey];
            }
        }).fail(() => {
            console.log("Variables AJAX error for task", taskIndex);
            const ids = categoryContainerIds(taskIndex);
            [ids.modules, ids.classes, ids.methods, ids.objects, ids.primitives, ids.data].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = '<div class="text-danger p-3">Error loading variables</div>';
            });
            flash("Couldn't run variables classification, access denied", "danger");
            window[`cell_insights_variables_callback_${taskIndex}`] = null;
            delete window[runningKey];
        });
    });
}


/* ---------------------------------------------------------------------- */
/* CONSOLE (PYTHON MODE)                                                  */
/* ---------------------------------------------------------------------- */

function cell_insights_code_run(taskIndex, code) {
    const $cell = getCellByTask(taskIndex);
    if (!$cell.length) {
        console.error("Cell element not found for task index", taskIndex);
        return;
    }

    const resultsElId = `code-results-${taskIndex}`;
    const resultsEl = document.getElementById(resultsElId);

    const legacyOutEl =
        document.getElementById(`console_output_${taskIndex}`) ||
        $cell.find(".console-output")[0] ||
        null;

    const writeTarget = resultsEl || legacyOutEl;
    if (!writeTarget) {
        console.warn(`No results container found for task ${taskIndex} (looked for #${resultsElId}).`);
    }

    // Resolve code from console if not provided
    if (!code) {
        let input = document.getElementById(`console_input_${taskIndex}`) || $cell.find(".console-input")[0];
        if (input && !input.id) input.id = `console_input_${taskIndex}`;
        if (!input) { console.error("Console input not found for task", taskIndex); return; }
        code = String(input.value || "").trim();
        input.value = "";
    }
    if (!code) { return; }

    pauseChatStream(taskIndex);

    const executionKey = `console_executing_${taskIndex}`;
    if (window[executionKey]) {
        console.log("Console execution already in progress for task", taskIndex);
        return;
    }
    window[executionKey] = true;

    // Small helper to render into the Code Inspector results well
    function renderToResults(text) {
        if (!writeTarget) return;
        // If we’re writing into the Code Inspector panel, clear it and show fresh <pre>
        if (resultsEl) {
            resultsEl.innerHTML = "";
            const pre = document.createElement("pre");
            pre.className = "code-response";
            pre.textContent = String(text ?? "");
            resultsEl.appendChild(pre);
        } else {
            // Legacy fallback
            writeTarget.textContent = String(text ?? "");
        }
    }

    // Unique callback (the kernel should call this when output is ready)
    window[`cell_insights_callback_${taskIndex}`] = function (output) {
        renderToResults(output);
        delete window[executionKey];
    };

    // Fire the request
    get_field_values({}, true, function (field_registry) {
        const task_registry = buildTaskRegistry($cell);
        set_insight_behaviour(task_registry, code, field_registry);

        ajaxRun(task_registry, "Console execution failed: access denied")
            .done((data) => {
                if (!(data && data.data === "ok")) {
                    // If the kernel didn’t accept the job, clear the callback + lock
                    delete window[`cell_insights_callback_${taskIndex}`];
                    delete window[executionKey];
                    renderToResults("Error: kernel did not accept job.");
                }
            })
            .fail(() => {
                delete window[`cell_insights_callback_${taskIndex}`];
                delete window[executionKey];
                renderToResults("Network or access error while executing code.");
            });
    });
}

/* ---------------------------------------------------------------------- */
/* VARIABLE INSPECTION                                                     */
/* ---------------------------------------------------------------------- */

function inspectVariable(varName, taskIndex) {
    console.log("Inspecting variable:", varName, "in task:", taskIndex);

    // clear the cell output before inspecting
    const cell_output = $(`#results_${taskIndex}`);
    cell_output.empty();

    debounce(function (vName, tIdx) {
        const $cell = getCellByTask(tIdx);
        if (!$cell.length) { console.error("Cell not found for task", tIdx); return; }

        const inspectionKey = `variable_inspecting_${tIdx}`;
        window[inspectionKey] = true;

        // unique callback
        if (window[`cell_insights_callback_${tIdx}`]) delete window[`cell_insights_callback_${tIdx}`];
        window[`cell_insights_callback_${tIdx}`] = function () {
            delete window[inspectionKey];
        };

        get_field_values({}, true, function (field_registry) {
            const task_registry = buildTaskRegistry($cell);

            const codeChecker = `
from pprint import pprint
import inspect, io

# Optional imports for detection (don’t fail if missing)
try:
    import numpy as _np
except Exception:
    _np = None
try:
    import pandas as _pd
except Exception:
    _pd = None

def _is_np_array(x):
    return (_np is not None) and isinstance(x, _np.ndarray)

def _is_pd_df(x):
    return (_pd is not None) and isinstance(x, _pd.DataFrame)

def _is_pd_series(x):
    return (_pd is not None) and isinstance(x, _pd.Series)

def _is_primitive(x):
    return isinstance(x, (str, int, float, bool, bytes, complex))

def _is_data(x):
    return (
        isinstance(x, (dict, list, tuple, set))
        or _is_np_array(x) or _is_pd_df(x) or _is_pd_series(x)
    )

try:
    val = ${vName}
    # --- DATA PREVIEWS ---
    if _is_pd_df(val):
        buf = io.StringIO()
        # capture df.info() into buffer to avoid printing "None"
        val.info(buf=buf)
        info_str = buf.getvalue().rstrip()
        try:
            head_str = val.head(5).to_string(index=False, max_rows=5, max_cols=10)
        except Exception:
            head_str = str(val.head(5))
        print(info_str)
        print("\\nPreview (head):")
        print(head_str)
    elif _is_pd_series(val):
        try:
            print(val.head(10).to_string(index=False))
        except Exception:
            print(val.head(10))
    elif _is_np_array(val):
        shape = getattr(val, "shape", None)
        dtype = getattr(val, "dtype", None)
        print(f"numpy.ndarray  shape={shape}  dtype={dtype}")
        # safe small slice preview
        try:
            print(val[:5])
        except Exception:
            pass
    elif isinstance(val, (dict, list, tuple, set)):
        try:
            preview_len = len(val)
        except Exception:
            preview_len = "?"
        try:
            if isinstance(val, dict):
                items = list(val.items())[:10]
                pprint(dict(items))
            else:
                pprint(list(val)[:10])
        except Exception:
            pprint(val)

    # --- CODE-ISH / DEFS / MODULES ---
    elif inspect.ismodule(val) or inspect.isfunction(val) or inspect.ismethod(val) or inspect.isbuiltin(val) or isinstance(val, type) or inspect.isclass(val):
        help(val)

    # --- PRIMITIVES / EVERYTHING ELSE ---
    elif _is_primitive(val):
        pprint(val)
    else:
        help(val)

except NameError:
    print(f"Variable '${vName}' is not defined")
except Exception as e:
    print(f"Error inspecting variable '${vName}': {e}")
    try:
        pprint(${vName})
    except Exception:
        print(f"Could not display variable '${vName}'")
`.trim();

            set_insight_behaviour(task_registry, codeChecker, field_registry, true);

            ajaxRun(task_registry, "Couldn't inspect variable")
                .done((data) => {
                    if (!(data && data.data === "ok")) {
                        delete window[`cell_insights_callback_${tIdx}`];
                        delete window[inspectionKey];
                    }
                })
                .fail((error) => {
                    console.log("inspectVariable AJAX error for task", tIdx, ":", error);
                    delete window[`cell_insights_callback_${tIdx}`];
                    delete window[inspectionKey];
                });
        });
    }, 200)(varName, taskIndex);
}

/* ---------------------------------------------------------------------- */
/* Console UX helpers                                                      */
/* ---------------------------------------------------------------------- */

function getActiveConsoleInput(taskIndex) {
    const pane = document.querySelector(`#insightsTabsContent_${taskIndex} .tab-pane.show.active`);
    if (!pane) return null;
    const input = pane.querySelector('.console-input');
    return input || null;
}

function resetConsole(taskIndex) {
    const el = getActiveConsoleInput(taskIndex);
    if (!el) return;
    el.value = "";
    el.style.height = "auto";
}

/* ---------------------------------------------------------------------- */
/* Tab + Console event wiring                                              */
/* ---------------------------------------------------------------------- */

$(document).on("shown.bs.tab", 'button[id*="-tab-"][id^="insights-"]', function () {
    const id = this.id;
    const taskIndex = id.split("-").pop();
    configureConsoleForActiveTab(taskIndex, id);
    if (id.startsWith("insights-chat-tab-")) {
        initialiseInsightsGina(taskIndex);
    }
});

// Click: Reload button in Code Inspector
$(document).on('click', '.code-inspector-reload', function (ev) {
    ev.preventDefault();
    const taskIndex = $(this).data('taskIndex') || $(this).attr('data-task-index');
    if (taskIndex) cell_insights_code_inspect_reload(taskIndex);
});

// When user switches to the Code Inspector tab, reload automatically
document.addEventListener('shown.bs.tab', function (e) {
    const btn = e.target; // newly activated tab button
    if (!btn.id) return;
    const m = btn.id.match(/^insights-code-inspector-tab-(\d+)$/);
    if (!m) return;
    const taskIndex = m[1];
    // Console should be python for this tab already; refresh inspector now
    cell_insights_code_inspect_reload(taskIndex);
});

/* Click “Run” on console */
$(document).on("click", ".execute-console", function () {
    const taskIndex = $(this).data("task-index");
    const explicitMode = $(this).data("mode");
    const $cellItem = getCellByTask(taskIndex);
    const input = getActiveConsoleInput(taskIndex);
    const text = input ? String($(input).val() || "") : "";
    const mode = explicitMode || $(input).data("mode") || get_console_mode(taskIndex);

    if (mode === "gina") {
        cell_insights_gina_run($cellItem, text);
        resetConsole(taskIndex);
    } else if (mode === "data") {
        cell_insights_data_run($cellItem, text);
    } else {
        cell_insights_code_run(taskIndex, text);
        resetConsole(taskIndex);
    }
});

// Clear-chat button: mimic typing '/reset' in Chat with GINA
$(document).on("click", ".clear-chat", function () {
    const taskIndex = $(this).data("task-index");
    const $cellItem = getCellByTask(taskIndex);
    cell_insights_gina_run($cellItem, "/reset");
});

/* Press Enter in console input (Shift+Enter for newline) */
$(document).on("keydown", ".console-input", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const taskIndex = $(this).data("task-index");
        const mode = $(this).data("mode") || get_console_mode(taskIndex);
        const $cellItem = getCellByTask(taskIndex);

        if (mode === "gina") {
            cell_insights_gina_run($cellItem, $(this).val());
            resetConsole(taskIndex);
        } else if (mode === "data") {
            cell_insights_data_run($cellItem, $(this).val());
        } else {
            cell_insights_code_run(taskIndex, $(this).val());
            resetConsole(taskIndex);
        }
    }
});

/* Auto-grow textarea */
$(document).on("input", ".console-input", function () {
    this.style.height = "auto";
    this.style.height = this.scrollHeight + "px";
});

/* On initial load: if a Chat tab is already active, set mode + /init */
$(function () {
    $('[id^="insightsTabs_"]').each(function () {
        const taskIndex = this.id.replace("insightsTabs_", "");
        const activeId = ($(this).find(".nav-link.active").attr("id") || "");
        configureConsoleForActiveTab(taskIndex, activeId);
        if (activeId.startsWith("insights-chat-tab-")) {
            initialiseInsightsGina(taskIndex);
        }
    });
});

$(document)
    .off('shown.bs.tab.insights')
    .on('shown.bs.tab.insights', '[data-bs-toggle="tab"]', function () {
        // Only react for tabs inside an Insights tabs host
        const tabsHost = this.closest('[id^="insightsTabs_"]');
        if (!tabsHost || !tabsHost.id) return;
        const taskIndex = tabsHost.id.replace('insightsTabs_', '');
        if (!taskIndex) return;
    
        syncInsightsConsole(taskIndex);
        const id = this.id || "";
        if (id.startsWith("insights-chat-tab-")) {
            try { initialiseInsightsGina(taskIndex); } catch (_){}
        }
    });
