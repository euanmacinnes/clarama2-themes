window.__ginaInsightsHandshakeSent = window.__ginaInsightsHandshakeSent || {};
window.__ginaInsightsHandshakeDone = window.__ginaInsightsHandshakeDone || {};
window.__ginaChatActive = window.__ginaChatActive || {};
window.__ginaStreamBuf = window.__ginaStreamBuf || {};
window.__ginaStreamIdleTimer = window.__ginaStreamIdleTimer || {};

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

/** Normalize any incoming stream chunk to string */
function normalizeChunk(chunk) {
    if (Array.isArray(chunk)) return chunk.join("");
    if (chunk && typeof chunk === "object") {
        if (chunk.text) {
            return chunk.text;
        } else {
            return "";
        }
    }
    return typeof chunk === "string" ? chunk : "";
}

// Keep a small idle timer per cell to mark stream end
window.__ginaIdleTimers = window.__ginaIdleTimers || Object.create(null);

/** Get jQuery cell element by task index */
function getCellByTask(taskIndex) {
    return $(`li.clarama-cell-item[step="${taskIndex}"]`);
}

function setConsoleEnabled(taskIndex, enabled) {
    const $input = $(`#console_input_${taskIndex}`);
    const $sendBtn = $(`.execute-console[step="${taskIndex}"], .execute-console[data-task-index="${taskIndex}"]`);

    $input.prop('disabled', !enabled)
          .attr('aria-disabled', String(!enabled))
          .toggleClass('console-disabled', !enabled);

    $sendBtn.prop('disabled', !enabled);
}

function setConsoleVisible(taskIndex, visible) {
    const $wrap = $(`#insights_${taskIndex} .insights-console`);
    $wrap.toggleClass('d-none', !visible);
  }
  
  function setConsolePlaceholder(taskIndex, text) {
    const $input = $(`#console_input_${taskIndex}`);
    if ($input.length) $input.attr('placeholder', text);
  }
  
function configureConsoleForActiveTab(taskIndex, activeTabId) {
    if (activeTabId.startsWith(`insights-chat-tab-`)) {
        setConsoleVisible(taskIndex, true);
        set_console_mode(taskIndex, "gina");
        return;
    }
    if (activeTabId.startsWith(`insights-code-inspector-tab-`) || activeTabId.startsWith(`insights-variables-tab-`)) {
        setConsoleVisible(taskIndex, true);
        set_console_mode(taskIndex, "python");
        return;
    }
    if (activeTabId.startsWith(`insights-data-inspector-tab-`)) {
        setConsoleVisible(taskIndex, true);
        set_console_mode(taskIndex, "data");
        return;
    }
    // hide the console for "preview" and "global fields" tabs
    if (activeTabId.startsWith(`insights-preview-tab-`) || activeTabId.startsWith(`insights-global-fields-tab-`)) {
        setConsoleVisible(taskIndex, false);
        return;
    }

    setConsoleVisible(taskIndex, true);
}

function finalizePreviousReplyBubble(taskIndex) {
    const $prev = $(`#insights_gina_chat_${taskIndex} #gina_stream_${taskIndex}`);
    if (!$prev.length) return;

    const $span = $prev.find('.stream-text');
    if ($span.length) {
        const text = $span.text();
        $span.replaceWith(document.createTextNode(text));
    }
    // mark as a normal reply bubble and drop the streaming id
    $prev.removeAttr('id').removeClass('insights-gina-chat-reply').addClass('insights-gina-chat-assistant');
}

/** Ensure a streaming Reply bubble exists and return its key pieces */
function ensureStreamBubble(taskIndex) {
    if (!is_chat_tab_active(taskIndex)) return null;
    const streamId = `gina_stream_${taskIndex}`;
    if (!document.getElementById(streamId)) {
        appendChatBubbleViaTemplate(taskIndex, "reply", streamId);
    }
    return streamId;
}

/** Stream loop: arms websocket callback key and handles idle close */
function armStream(taskIndex, onChunk) {
    const cbKey = `cell_insights_chat_callback_${taskIndex}`; // <-- changed
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

/** Smooth scroll to bottom of chat if present */
function scrollChatToBottom(taskIndex) {
    const $chat = $(`#insights_gina_chat_${taskIndex}`);
    if ($chat.length) $chat.scrollTop($chat[0].scrollHeight);
}

/** Clear all chat bubbles for a given task and reset stream state */
function clear_insights_gina_chat(taskIndex) {
    const $chat = $(`#insights_gina_chat_${taskIndex}`);
    if ($chat.length) $chat.empty();

    // Kill any pending stream timers/callbacks for this task
    const cbKey = `cell_insights_variables_callback_${taskIndex}`;
    try { delete window[cbKey]; } catch(_) {}
    clearTimeout(window.__ginaStreamIdleTimer?.[taskIndex]);

    // Reset stream flags/buffers
    if (window.__ginaStreamBuf) delete window.__ginaStreamBuf[taskIndex];
    if (window.__ginaChatActive) delete window.__ginaChatActive[taskIndex];
}

// --- Template helpers (place near the top utilities) -----------------
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

function cleanStreamText(text, append) {
    if (!append) {
        // strip leading spaces/newlines on a fresh write,
        // and collapse 3+ blank lines to 2
        return String(text || "")
            .replace(/^\s+/, "")
            .replace(/\n{3,}/g, "\n\n");
    }
    return String(text || "");
}
  
function setStreamText(streamId, text, { append = false } = {}) {
    const el = document.getElementById(streamId);
    if (!el) { setTimeout(() => setStreamText(streamId, text, { append }), 16); return; }
  
    const bubble = el.querySelector(".insights-gina-chat-bubble");
    if (!bubble) return;
  
    // Ensure an HTML container (when rendering markdown/code)
    let htmlDiv = bubble.querySelector(".stream-html");
    let textSpan = bubble.querySelector(".stream-text");
  
    // Create .stream-html once and remove .stream-text to avoid duplicate content
    if (!htmlDiv) {
        htmlDiv = document.createElement("div");
        htmlDiv.className = "stream-html";
        if (textSpan) {
            textSpan.remove();
        } 
        bubble.appendChild(htmlDiv);
    }
    // Build/append buffer safely
    const next = String(text || "");
    if (append && htmlDiv.__buffer) {
        htmlDiv.__buffer += next;
    } else {
        htmlDiv.__buffer = next;
    }

    htmlDiv.innerHTML = markdownToHtml(htmlDiv.__buffer);
    return;
}  

/** POST a task request to kernel (shared shape) */
function postToKernel(taskIndex, streamSpec, parameters = null) {
    const socket_div = $("#edit_socket");
    const task_kernel_id = socket_div.attr("task_kernel_id");
    const url = $CLARAMA_ENVIRONMENTS_KERNEL_RUN + task_kernel_id;

    const $cell = getCellByTask(taskIndex);
    const task_registry = get_cell_fields($cell);

    // fill stream
    const spec = task_registry.streams[0].main[0];
    spec.target = streamSpec.target;
    spec.type = streamSpec.type;
    spec.clear = !!streamSpec.clear;
    if ("source" in streamSpec) spec.source = streamSpec.source;
    if ("content" in streamSpec) spec.content = streamSpec.content;

    // parameters
    task_registry.parameters = parameters || {};

    return $.ajax({
        type: "POST",
        url,
        dataType: "json",
        contentType: "application/json",
        data: JSON.stringify(task_registry)
    });
}

/** Set insight behaviour for Python console execution */
function set_insight_behaviour(task_registry, code_command, field_registry, isInspecting = false) {
    if (!isInspecting) task_registry.streams[0].main[0].target = "insights";
    task_registry.streams[0].main[0].type = "code";
    task_registry.streams[0].main[0].content = code_command;
    task_registry.streams[0].main[0].clear = false;
    task_registry.parameters = field_registry;
}

/** Toggle console placeholder/mode per tab */
function set_console_mode(taskIndex, mode) {
    const $input = $(`#console_input_${taskIndex}`);
    if (!$input.length) return;
    if (mode === "gina") {
        $input.attr("placeholder", "Message GINA…").data("console-mode", "gina");
    }else if (mode === "data") {
        $input.attr("placeholder", "Enter data command").data("console-mode", "data");
    } else {
        $input.attr("placeholder", "Enter Python command.").data("console-mode", "python");
    }
}

function get_console_mode(taskIndex) {
    const $tabs = $(`#insightsTabs_${taskIndex}`);
    const activeId = ($tabs.find('.nav-link.active').attr('id') || '');
    return activeId.startsWith(`insights-chat-tab-`) ? 'gina' : 'python';
}

function is_chat_tab_active(taskIndex) {
    return get_console_mode(taskIndex) === 'gina';
}  

/* ====================================================================== */
/* CHAT WITH GINA (INSIGHTS PANE)                                         */
/* ====================================================================== */

/** Send a message via the Insights console to GINA */
function cell_insights_gina_run(cell_button, questionText) {
    const taskIndex =
        (cell_button && (cell_button.attr("step") || cell_button.attr("data-task-index"))) || null;

    if (!taskIndex) { console.warn("GINA chat: No taskIndex found"); return; }

    // Only allow in chat tab
    if (!is_chat_tab_active(taskIndex)) {
        console.debug("GINA chat suppressed: not on Chat tab");
        return;
    }

    // Resolve text (argument or console input)
    const $input = $(`#console_input_${taskIndex}`);
    let text = questionText.trim();
    if (!text && $input.length) {
        text = ($input.val() || "").trim();
    }
    if (!text) return;
    if ($input.is(':disabled')) return;
    if ($input.length) $input.val("");

    if (text.trim().toLowerCase() === "/reset") {
        // Clear UI immediately
        clear_insights_gina_chat(taskIndex);

        // Send '/reset' to kernel WITHOUT creating bubbles
        get_field_values({}, true, function (field_registry) {
            field_registry.clarama_task_kill = false;
            postToKernel(taskIndex, {
                target: "insights",
                type: "question",
                source: text,
                clear: false
            }, field_registry).done((data) => {
                console.log("GINA reset sent");
            }).fail(() => {
                flash("Couldn't process reset, network or access issue", "danger");
            });
        });

        return;
    }

    // --- normal chat path below ---
    try {
        const bubbleId = `gina_user_${taskIndex}_${Date.now()}`;
        appendChatBubbleViaTemplate(taskIndex, "user", bubbleId);
        setStreamText(bubbleId, text, { append: false });
        scrollChatToBottom(taskIndex);
    } catch (e) { console.warn("GINA chat: unable to render user bubble", e); }

    finalizePreviousReplyBubble(taskIndex);

    const streamId = ensureStreamBubble(taskIndex);
    window.__ginaChatActive[taskIndex] = true;
    window.__ginaStreamBuf[taskIndex] = "";

    setConsoleEnabled(taskIndex, false);
    setStreamText(streamId, "thinking...", { append: false });
    scrollChatToBottom(taskIndex);

    armStream(taskIndex, (s) => {
        window.__ginaStreamBuf[taskIndex] += s;
        setStreamText(streamId, window.__ginaStreamBuf[taskIndex], { append: false });
        scrollChatToBottom(taskIndex);
    });

    get_field_values({}, true, function (field_registry) {
        field_registry.clarama_task_kill = false;
        postToKernel(taskIndex, {
            target: "insights",
            type: "question",
            source: text,
            clear: false
        }, field_registry);
    });
}

/** One-time /init handshake when Chat tab opens for a task */
function initaliseInsightsGina(taskIndex) {
    if (!taskIndex) return;
    if (window.__ginaInsightsHandshakeSent[taskIndex] || window.__ginaInsightsHandshakeDone[taskIndex]) return;
  
    window.__ginaInsightsHandshakeSent[taskIndex] = true;
    window.__ginaChatActive[taskIndex] = true;
    window.__ginaStreamBuf[taskIndex] = "";
  
    armStream(taskIndex, (s) => {
        // Create bubble lazily on first chunk
        let streamId = document.getElementById(`gina_stream_${taskIndex}`) ? `gina_stream_${taskIndex}` : ensureStreamBubble(taskIndex);
        window.__ginaStreamBuf[taskIndex] += s;
        setStreamText(streamId, window.__ginaStreamBuf[taskIndex], { append: false });
        scrollChatToBottom(taskIndex);
    });
  
    get_field_values({}, true, function (field_registry) {
        field_registry.clarama_task_kill = false;
        postToKernel(
            taskIndex, 
            { 
                target: "insights", 
                type: "question", 
                source: "/init", 
                clear: false 
            }, 
            field_registry
        )
        .always(() => { window.__ginaInsightsHandshakeDone[taskIndex] = true; });
    });
}  

/* ====================================================================== */
/* VARIABLES TAB                                                           */
/* ====================================================================== */

/** Create a plain variable button (direct) */
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

/** Template-based variable button (kept for compatibility) */
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

/** Parse & render variables list output */
function populateVariablesList(output, taskIndex) {
    const host = $(`#variables_${taskIndex}`)[0];
    if (!host) { console.error("Variables list element not found for task", taskIndex); return; }

    try {
        if (output === null || output === undefined || output === "None" || output === "") {
            host.innerHTML = "";
            host.appendChild(createEmptyVariablesMessage("No variables found"));
            return;
        }

        // Decode HTML entities
        const temp = document.createElement("div");
        temp.innerHTML = String(output);
        let decoded = temp.textContent || temp.innerText || String(output);

        // Split into names
        let names = parseVariableString(decoded).map(name => {
            const div = document.createElement("div");
            div.innerHTML = name;
            let n = div.textContent || div.innerText || "";
            if ((n.startsWith('"') && n.endsWith('"')) || (n.startsWith("'") && n.endsWith("'"))) {
                n = n.slice(1, -1);
            }
            return n.trim();
        });

        // Filter internal/system names
        names = names.filter(n =>
            n && typeof n === "string" &&
            !n.startsWith("_") && !["In", "Out", "get_ipython", "exit", "quit"].includes(n)
        );

        host.innerHTML = "";
        if (names.length) {
            const container = createVariablesContainer(taskIndex);
            populateVariablesContainer(container, names, taskIndex);
            host.appendChild(container);
        } else {
            host.appendChild(createEmptyVariablesMessage());
        }
    } catch (e) {
        console.error("Error parsing variables:", e);
        const err = createEmptyVariablesMessage(`Error parsing variables: ${e.message}`);
        err.className = "text-danger p-3";
        host.innerHTML = "";
        host.appendChild(err);
        flash("Error parsing variables: " + e, "danger");
    }
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

    window[`cell_insights_variables_callback_${taskIndex}`] = function (output) {
        populateVariablesList(output, taskIndex);
        if (outputCallback) outputCallback(output);
        delete window[runningKey];
    };

    get_field_values({}, true, function (field_registry) {
        const task_registry = get_cell_fields(cell_button);
        set_insight_behaviour(task_registry, "print(list(locals().keys()));", field_registry);

        const socket_div = $("#edit_socket");
        field_registry.clarama_task_kill = false;

        const task_kernel_id = socket_div.attr("task_kernel_id");
        const url = $CLARAMA_ENVIRONMENTS_KERNEL_RUN + task_kernel_id;

        $.ajax({
            type: "POST",
            url,
            dataType: "json",
            contentType: "application/json",
            data: JSON.stringify(task_registry)
        }).done((data) => {
            if (data && data.data === "ok") {
                console.log("Insights submission ok for task", shownIndex);
                flash(`Cell ${shownIndex} insight toggled on`, "success");
                set_console_mode(taskIndex, "gina");
            } else {
                const err = data && data.error ? data.error : "Unknown error";
                console.log("Insights submission failed for task", taskIndex);
                $(`#variables_${taskIndex}`).html(`<div class="text-danger p-3">Error loading variables: ${err}</div>`);
                flash("Couldn't run insight content: " + err, "danger");
                window[`cell_insights_variables_callback_${taskIndex}`] = null;
                delete window[runningKey];
            }
        }).fail(() => {
            console.log("Insights AJAX error for task", taskIndex);
            $(`#variables_${taskIndex}`).html('<div class="text-danger p-3">Error loading variables</div>');
            flash("Couldn't run insight content, access denied", "danger");
            window[`cell_insights_variables_callback_${taskIndex}`] = null;
            delete window[runningKey];
        });
    });
}

/* CONSOLE (PYTHON MODE)      
                                                  */
function insight_console_run(taskIndex, code) {
    const $cell = getCellByTask(taskIndex);
    if (!$cell.length) { console.error("Cell element not found for task index", taskIndex); return; }

    const shownIndex = $cell.closest("li.clarama-cell-item").find("button.step-label").text().trim();
    const executionKey = `console_executing_${taskIndex}`;
    if (window[executionKey]) {
        console.log("Console execution already in progress for task", taskIndex);
        return;
    }

    // Resolve input
    if (!code) {
        let input = document.getElementById(`console_input_${taskIndex}`) || $cell.find(".console-input")[0];
        if (input && !input.id) {
            console.warn(`Console input found via fallback; syncing ID for task ${taskIndex}.`);
            input.id = `console_input_${taskIndex}`;
        }
        if (!input) { console.error("Console input not found for task", taskIndex); return; }
        code = (input.value || "").trim();
        input.value = "";
    }
    if (!code) { console.log("No code to execute for task", taskIndex); return; }

    window[executionKey] = true;

    // Callback to receive console result
    window[`cell_insights_callback_${taskIndex}`] = function (output) {
        const outEl = document.getElementById(`console_output_${taskIndex}`) || $cell.find(".console-output")[0];
        if (outEl) outEl.textContent = output;
        delete window[executionKey];
    };

    get_field_values({}, true, function (field_registry) {
        const task_registry = get_cell_fields($cell);
        set_insight_behaviour(task_registry, code, field_registry);

        const socket_div = $("#edit_socket");
        field_registry.clarama_task_kill = false;

        const task_kernel_id = socket_div.attr("task_kernel_id");
        const url = $CLARAMA_ENVIRONMENTS_KERNEL_RUN + task_kernel_id;

        console.log("Console execution: running for task", taskIndex);

        $.ajax({
            type: "POST",
            url,
            dataType: "json",
            contentType: "application/json",
            data: JSON.stringify(task_registry)
        }).done((data) => {
            if (!(data && data.data === "ok")) {
                delete window[`cell_insights_callback_${taskIndex}`];
                delete window[executionKey];
            }
        }).fail(() => {
            flash("Console execution failed: access denied", "danger");
            delete window[`cell_insights_callback_${taskIndex}`];
            delete window[executionKey];
        });
    });
}

/* ====================================================================== */
/* VARIABLE INSPECTION                                                     */
/* ====================================================================== */

function inspectVariable(varName, taskIndex) {
    console.log("Inspecting variable:", varName, "in task:", taskIndex);

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
            const task_registry = get_cell_fields($cell);

            const codeChecker = `
from pprint import pprint
import pandas as pd
import inspect
try:
    val = ${vName}
    if isinstance(val, pd.DataFrame):
        print(val.info())
    elif inspect.isclass(val) or inspect.isclass(type(val)) or inspect.isfunction(val) or inspect.ismethod(val) or inspect.ismodule(val) or inspect.isbuiltin(val):
        help(${vName})
    else:
        pprint(${vName})
except NameError:
    print(f"Variable '${vName}' is not defined")
except Exception as e:
    print(f"Error inspecting variable '${vName}': {e}")
    try:
        print(${vName})
    except:
        print(f"Could not display variable '${vName}'")
`.trim();

            set_insight_behaviour(task_registry, codeChecker, field_registry, true);

            const socket_div = $("#edit_socket");
            const task_kernel_id = socket_div.attr("task_kernel_id");
            const url = $CLARAMA_ENVIRONMENTS_KERNEL_RUN + task_kernel_id;

            $.ajax({
                type: "POST",
                url,
                dataType: "json",
                contentType: "application/json",
                data: JSON.stringify(task_registry)
            }).done((data) => {
                if (!(data && data.data === "ok")) {
                    delete window[`cell_insights_callback_${tIdx}`];
                    delete window[inspectionKey];
                }
            }).fail((error) => {
                console.log("inspectVariable AJAX error for task", tIdx, ":", error);
                flash("Couldn't inspect variable", "danger");
                delete window[`cell_insights_callback_${tIdx}`];
                delete window[inspectionKey];
            });
        });
    }, 200)(varName, taskIndex);
}

function resetConsole(taskIndex) {
    const el = document.getElementById(`console_input_${taskIndex}`);
    if (!el) return;
    el.value = "";
    el.style.height = "auto"; // collapse back to single-line height
}

$(document).on("shown.bs.tab", 'button[id*="-tab-"][id^="insights-"]', function () {
    const id = this.id;
    const taskIndex = id.split("-").pop();
    configureConsoleForActiveTab(taskIndex, id);
    if (id.startsWith("insights-chat-tab-")) {
        initaliseInsightsGina(taskIndex);
    }
});  

// Click “play” on console
$(document).on("click", ".execute-console", function () {
    const taskIndex = $(this).data("task-index");
    const $cell = getCellByTask(taskIndex);
    const mode = get_console_mode(taskIndex);
  
    if (mode === "gina") {
        const $input = $(`#console_input_${taskIndex}`);
        cell_insights_gina_run($cell, $input.val());
    } else {
        insight_console_run(taskIndex);
    }
    resetConsole(taskIndex);
});

// Press Enter in console input (Shift+Enter for newline)
$(document).on("keydown", ".console-input", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const taskIndex = $(this).data("task-index");
        const $cell = getCellByTask(taskIndex);
        const mode = get_console_mode(taskIndex);

        if (mode === "gina") {
            cell_insights_gina_run($cell, $(this).val());
        } else {
            insight_console_run(taskIndex);
        }
        resetConsole(taskIndex);
    }
});

$(document).on("input", ".console-input", function () {
    this.style.height = "auto";
    this.style.height = this.scrollHeight + "px";
});

// On initial load: if a Chat tab is already active, set mode + /init
$(function () {
    $('[id^="insightsTabs_"]').each(function () {
        const taskIndex = this.id.replace("insightsTabs_", "");
        const activeId = ($(this).find('.nav-link.active').attr('id') || '');
        configureConsoleForActiveTab(taskIndex, activeId);
        if (activeId.startsWith('insights-chat-tab-')) {
            initaliseInsightsGina(taskIndex);
        }
    });
});  