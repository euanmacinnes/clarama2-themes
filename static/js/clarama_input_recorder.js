/*
 * # Copyright (c) 2025. Euan Duncan Macinnes, euan.d.macinnes@gmail.com, S7479622B - All Rights Reserved
 */

// Clarama Input Recorder
// Records user interactions and can export as a YAML test with config and blocks.
(function () {
    const STORAGE_KEY = 'clarama_input_recorder_events_v1';
    const STATE_KEY = 'clarama_input_recorder_state_v1';
    const DEFAULT_CONFIG = {
        browser: 'chromium',
        headless: true,
        viewport: {width: 1280, height: 720},
        timeout: 30000,
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        trace: 'retain-on-failure'
    };

    let isRecording = false;
    let sessionStart = Date.now();

    function loadState() {
        try {
            const s = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
            isRecording = !!s.isRecording;
            sessionStart = s.sessionStart || Date.now();
        } catch (e) {
            isRecording = false;
            sessionStart = Date.now();
        }
    }

    function saveState() {
        localStorage.setItem(STATE_KEY, JSON.stringify({isRecording, sessionStart}));
    }

    function loadEvents() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch (e) {
            return [];
        }
    }

    function saveEvents(events) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    }

    function pushEvent(evt) {
        const events = loadEvents();
        events.push(evt);
        saveEvents(events);
    }

    function serializeTarget(e) {
        const t = e.target;
        if (!t) return {};
        const desc = {};
        try {
            if (t.id) desc.selector = '#' + t.id;
            else if (t.name) desc.selector = `[name="${t.name}"]`;
            else if (t.getAttribute) {
                const ar = t.getAttribute('aria-label');
                if (ar) desc.ariaLabel = ar;
            }
            desc.tag = (t.tagName || '').toLowerCase();
            desc.type = t.type || '';
            if (t.innerText && t.innerText.trim()) desc.text = t.innerText.trim().slice(0, 120);
            if (t.placeholder) desc.placeholder = t.placeholder;
            if (t.value != null && typeof t.value === 'string') desc.value = t.value;
            // role
            const role = t.getAttribute ? (t.getAttribute('role') || '') : '';
            if (role) desc.role = role;
        } catch (err) {
        }
        return desc;
    }

    function onClick(e) {
        if (!isRecording) return;
        const d = serializeTarget(e);
        pushEvent({type: 'click', when: Date.now(), url: location.href, target: d});
    }

    function onInput(e) {
        if (!isRecording) return;
        const d = serializeTarget(e);
        pushEvent({type: 'input', when: Date.now(), url: location.href, target: d, value: e.target && e.target.value});
    }

    function onKeydown(e) {
        if (!isRecording) return;
        // Avoid capturing keys in our own UI
        const el = e.target;
        if (el && el.closest && el.closest('#clarama-recorder-widget')) return;
        pushEvent({type: 'key', when: Date.now(), url: location.href, key: e.key});
    }

    function onSubmit(e) {
        if (!isRecording) return;
        const d = serializeTarget(e);
        pushEvent({type: 'submit', when: Date.now(), url: location.href, target: d});
    }

    function onBeforeUnload() {
        if (!isRecording) return;
        // mark navigation
        pushEvent({type: 'navigate', when: Date.now(), from: location.href});
    }

    function onLoad() {
        if (!isRecording) return;
        pushEvent({type: 'goto', when: Date.now(), to: location.href});
    }

    function start() {
        if (isRecording) return;
        isRecording = true;
        sessionStart = Date.now();
        saveState();
        window.addEventListener('click', onClick, true);
        window.addEventListener('input', onInput, true);
        window.addEventListener('change', onInput, true);
        window.addEventListener('keydown', onKeydown, true);
        window.addEventListener('submit', onSubmit, true);
        window.addEventListener('beforeunload', onBeforeUnload, true);
        onLoad();
        flashMsg('Recording started');
        updateRecordingUI(true);
    }

    function stop() {
        if (!isRecording) return;
        isRecording = false;
        saveState();
        window.removeEventListener('click', onClick, true);
        window.removeEventListener('input', onInput, true);
        window.removeEventListener('change', onInput, true);
        window.removeEventListener('keydown', onKeydown, true);
        window.removeEventListener('submit', onSubmit, true);
        window.removeEventListener('beforeunload', onBeforeUnload, true);
        flashMsg('Recording stopped');
        updateRecordingUI(false);
        // After stopping, offer export
        setTimeout(showExportModal, 100);
    }

    function clear() {
        saveEvents([]);
        flashMsg('Recording cleared');
    }

    function eventsToYaml() {
        const events = loadEvents();
        const blocks = [];
        const actions = [];
        // Start with initial goto if present or current URL
        let started = false;
        for (const ev of events) {
            if (ev.type === 'goto') {
                actions.push({type: 'goto', url: ev.to});
                started = true;
            }
            if (!started) {
                actions.push({type: 'goto', url: ev.url || location.href});
                started = true;
            }
            if (ev.type === 'click') {
                const step = targetToAction(ev);
                if (step) actions.push(step);
            } else if (ev.type === 'input') {
                const step = targetToFillAction(ev);
                if (step) actions.push(step);
            } else if (ev.type === 'key') {
                actions.push({
                    type: 'get_by_role',
                    role: 'document',
                    name: '',
                    actions: [{type: 'press', key: ev.key}]
                });
            } else if (ev.type === 'submit') {
                const step = targetToAction(ev, 'click');
                if (step) actions.push(step);
            } else if (ev.type === 'navigate') {
                // no-op, will be followed by goto on next load
            }
        }
        if (actions.length) {
            blocks.push({name: 'Recorded Block', actions: actions});
        }
        const test = Object.assign({}, DEFAULT_CONFIG, {blocks});
        const obj = {test};
        return yamlStringify(obj);
    }

    function targetToAction(ev, forced = 'click') {
        const t = ev.target || {};
        if (t.role || t.text) {
            // prefer role if present (button, link)
            const name = t.text || t.ariaLabel || t.placeholder || '';
            const role = t.role || guessRole(t);
            if (role) {
                return {type: 'get_by_role', role, name, actions: [{type: forced}]};
            }
        }
        if (t.selector) {
            return {type: 'page_locator', selector: t.selector, actions: [{type: forced}]};
        }
        return null;
    }

    function targetToFillAction(ev) {
        const t = ev.target || {};
        const name = t.placeholder || t.text || t.ariaLabel || t.name || '';
        const role = t.role || (t.tag === 'input' || t.tag === 'textarea' ? 'textbox' : '');
        if (role) {
            return {type: 'get_by_role', role, name, actions: [{type: 'fill', value: ev.value || t.value || ''}]};
        }
        if (t.selector) {
            return {type: 'page_locator', selector: t.selector, actions: [{type: 'fill', value: ev.value || ''}]};
        }
        return null;
    }

    function guessRole(t) {
        if (t.tag === 'button') return 'button';
        if (t.tag === 'a') return 'link';
        if (t.tag === 'input' || t.tag === 'textarea') return 'textbox';
        return '';
    }

    function yamlStringify(obj) {
        // minimal YAML serializer tailored to our expected structure
        function indent(n) {
            return '  '.repeat(n);
        }

        function writeVal(v, level) {
            if (v == null) return 'null';
            if (typeof v === 'boolean' || typeof v === 'number') return String(v);
            if (typeof v === 'string') {
                if (/[:#\-\n]/.test(v) || v.trim() !== v) return JSON.stringify(v);
                return v;
            }
            if (Array.isArray(v)) {
                if (v.length === 0) return '[]';
                let out = '\n';
                for (const item of v) {
                    if (typeof item === 'object') {
                        out += indent(level) + '- ' + writeObj(item, level + 1).trimStart();
                    } else {
                        out += indent(level) + '- ' + writeVal(item, level + 1) + '\n';
                    }
                }
                return out;
            }
            // object
            return '\n' + writeObj(v, level);
        }

        function writeObj(o, level) {
            let out = '';
            for (const k of Object.keys(o)) {
                out += indent(level) + k + ': ' + writeVal(o[k], level + 1);
                if (!String(out).endsWith('\n')) out += '\n';
            }
            return out;
        }

        return writeObj(obj, 0);
    }

    function updateRecordingUI(on) {
        try {
            const btn = document.getElementById('recorder-toggle');
            const icon = document.getElementById('recorder-icon');
            const label = document.getElementById('recorder-label');
            if (!btn || !icon) return;
            if (on) {
                icon.classList.remove('bi-record-circle');
                icon.classList.add('bi-stop-circle');
                icon.style.color = '#28a745';
                btn.classList.add('rec-glow');
                if (label) label.textContent = 'Stop';
                btn.title = 'Stop Recording';
            } else {
                icon.classList.remove('bi-stop-circle');
                icon.classList.add('bi-record-circle');
                icon.style.color = '#dc3545';
                btn.classList.remove('rec-glow');
                if (label) label.textContent = '';
                btn.title = 'Start Recording';
            }
        } catch (e) {
        }
    }

    function downloadYaml(yamlText) {
        const blob = new Blob([yamlText], {type: 'text/yaml'});
        const a = document.createElement('a');
        const ts = new Date(sessionStart).toISOString().replace(/[:.]/g, '-');
        a.href = URL.createObjectURL(blob);
        a.download = `recorded_test_${ts}.yaml`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    // Simple floating widget
    function injectWidget() {
        if (document.getElementById('clarama-recorder-widget')) return;
        const w = document.createElement('div');
        w.id = 'clarama-recorder-widget';
        w.style.position = 'fixed';
        w.style.right = '10px';
        w.style.bottom = '12px';
        w.style.zIndex = '2147483647';
        w.style.background = 'rgba(0,0,0,0.7)';
        w.style.color = '#fff';
        w.style.borderRadius = '8px';
        w.style.padding = '8px 10px';
        w.style.fontSize = '12px';
        w.style.fontFamily = 'system-ui, sans-serif';
        w.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
        w.innerHTML = `
      <div style="display:flex;gap:6px;align-items:center;">
        <span style="font-weight:600">Recorder</span>
        <button id="clarama-rec-start" class="btn btn-sm btn-success">Start</button>
        <button id="clarama-rec-stop" class="btn btn-sm btn-warning">Stop</button>
        <button id="clarama-rec-export" class="btn btn-sm btn-light">Export</button>
        <button id="clarama-rec-clear" class="btn btn-sm btn-danger">Clear</button>
      </div>`;
        document.body.appendChild(w);
        const qs = (id) => document.getElementById(id);
        qs('clarama-rec-start').onclick = function () {
            try {
                if (window.showRecorderCountdown) {
                    window.showRecorderCountdown(3, start);
                } else {
                    start();
                }
            } catch (e) {
                start();
            }
        };
        qs('clarama-rec-stop').onclick = stop;
        qs('clarama-rec-export').onclick = function () {
            downloadYaml(eventsToYaml());
        };
        qs('clarama-rec-clear').onclick = clear;
    }

    function showExportModal() {
        try {
            const yaml = eventsToYaml();
            // If application has flash/toast system
            console.log('Recorded YAML:\n' + yaml);
        } catch (e) {
            console.error(e);
        }
    }

    function flashMsg(msg) {
        try {
            if (window.flash) {
                window.flash(msg, 'info');
                return;
            }
        } catch (e) {
        }
        console.log('[Clarama Recorder] ' + msg);
    }

    // Recorder UI helpers moved from root.html
    function ensureRecGlowCss() {
        try {
            if (!document.getElementById('rec-glow-style')) {
                const st = document.createElement('style');
                st.id = 'rec-glow-style';
                st.textContent = `@keyframes recPulse {0%{box-shadow:0 0 0 0 rgba(40,167,69,0.6);}70%{box-shadow:0 0 0 12px rgba(40,167,69,0);}100%{box-shadow:0 0 0 0 rgba(40,167,69,0);}} .rec-glow{animation: recPulse 1.5s infinite; border-color:#28a745 !important;}`;
                document.head.appendChild(st);
            }
        } catch (e) {
        }
    }

    function ensureRecorderModal() {
        if (document.getElementById('recorderCountdownModal')) return;
        const modalHtml = `
  <div class="modal fade" id="recorderCountdownModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content" style="background-color:#1e1e1e;color:#fff;border:1px solid #2a2a2a;">
        <div class="modal-header">
          <h5 class="modal-title">Recording will start</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <p>Recording will begin in <span id="recorder-countdown" class="fw-bold">3</span> seconds.</p>
          <p class="mb-0 small text-white-50">You can cancel to avoid capturing unintended input.</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" id="recorder-cancel-btn">Cancel</button>
          <button type="button" class="btn btn-success" id="recorder-start-now">Start now</button>
        </div>
      </div>
    </div>
  </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    function showRecorderCountdown(seconds, onProceed) {
        try {
            ensureRecorderModal();
        } catch (e) {
        }
        const modalEl = document.getElementById('recorderCountdownModal');
        if (!modalEl) {
            onProceed && onProceed();
            return;
        }
        const cdEl = document.getElementById('recorder-countdown');
        const cancelBtn = document.getElementById('recorder-cancel-btn');
        const startNow = document.getElementById('recorder-start-now');
        let remaining = seconds;
        let cancelled = false;
        let timerId = null;
        if (cdEl) cdEl.textContent = String(remaining);
        const bsModal = new bootstrap.Modal(modalEl, {backdrop: 'static', keyboard: false});

        function cleanup() {
            if (cancelBtn) cancelBtn.onclick = null;
            if (startNow) startNow.onclick = null;
            if (timerId) {
                clearInterval(timerId);
                timerId = null;
            }
        }

        if (cancelBtn) cancelBtn.onclick = () => {
            cancelled = true;
            cleanup();
            bsModal.hide();
        };
        if (startNow) startNow.onclick = () => {
            cancelled = false;
            cleanup();
            bsModal.hide();
            onProceed && onProceed();
        };
        bsModal.show();
        timerId = setInterval(() => {
            remaining -= 1;
            if (remaining <= 0) {
                clearInterval(timerId);
                timerId = null;
                if (!cancelled) {
                    bsModal.hide();
                    onProceed && onProceed();
                }
            }
            if (cdEl) cdEl.textContent = String(Math.max(0, remaining));
        }, 1000);
    }

    function wireNavbarRecorder() {
        try {
            const btn = document.getElementById('recorder-toggle');
            const icon = document.getElementById('recorder-icon');
            const label = document.getElementById('recorder-label');
            if (!btn || !icon) return;

            function isRecOn() {
                try {
                    const s = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
                    return !!s.isRecording;
                } catch (e) {
                    return false;
                }
            }

            function setState(on) {
                updateRecordingUI(on);
            }

            setState(isRecOn());
            btn.addEventListener('click', () => {
                const on = isRecOn();
                if (!on) {
                    showRecorderCountdown(3, () => {
                        if (window.ClaramaRecorder) {
                            window.ClaramaRecorder.start();
                        } else {
                            const s = {isRecording: true, sessionStart: Date.now()};
                            localStorage.setItem(STATE_KEY, JSON.stringify(s));
                        }
                        setTimeout(() => setState(true), 100);
                    });
                } else {
                    if (window.ClaramaRecorder) {
                        window.ClaramaRecorder.stop();
                    } else {
                        const s = {isRecording: false, sessionStart: Date.now()};
                        localStorage.setItem(STATE_KEY, JSON.stringify(s));
                    }
                    setTimeout(() => setState(false), 100);
                }
            });
            // Hide floating widget start/stop to avoid duplicate controls
            setTimeout(() => {
                const st = document.getElementById('clarama-rec-start');
                const sp = document.getElementById('clarama-rec-stop');
                if (st) st.style.display = 'none';
                if (sp) sp.style.display = 'none';
            }, 600);
        } catch (e) {
            console.warn('Navbar recorder wiring failed', e);
        }
    }

    // Initialize
    document.addEventListener('DOMContentLoaded', function () {
        loadState();
        injectWidget();
        ensureRecGlowCss();
        wireNavbarRecorder();
        // expose countdown for other scripts if needed
        window.showRecorderCountdown = showRecorderCountdown;
        if (isRecording) {
            // Reinstate listeners for persistence across reloads
            start();
            updateRecordingUI(true);
        } else {
            updateRecordingUI(false);
        }
    });

    // Expose globally for potential advanced use
    window.ClaramaRecorder = {start, stop, clear, exportYaml: () => eventsToYaml(), downloadYaml};
})();
