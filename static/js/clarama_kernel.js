/*
 * # Copyright (c) 2025. Euan Duncan Macinnes, euan.d.macinnes@gmail.com, S7479622B - All Rights Reserved
 */

/* Common Clarama Kernel helpers */
(function () {
    function toArray(x) {
        return Array.prototype.slice.call(x || []);
    }

    function $(sel, root) {
        return (root || document).querySelector(sel);
    }

    function $all(sel, root) {
        return toArray((root || document).querySelectorAll(sel));
    }

    function showAlert(msg) {
        var alert = $("#kernelInfoModalAlert");
        if (!alert) return;
        alert.classList.remove("d-none");
        alert.textContent = msg;
    }

    function clearAlert() {
        var alert = $("#kernelInfoModalAlert");
        if (!alert) return;
        alert.classList.add("d-none");
        alert.textContent = "";
    }

    function renderTable(data) {
        var table = $("#kernelInfoTable");
        if (!table) {
            return;
        }
        var thead = table.querySelector("thead");
        var tbody = table.querySelector("tbody");
        thead.innerHTML = "";
        tbody.innerHTML = "";

        if (data == null) {
            showAlert("No data returned.");
            return;
        }

        // If full API wrapper
        if (data.data && data.results) {
            if (data.data !== 'ok') {
                showAlert(data.error || 'Request failed');
                return;
            }
            data = data.results;
        }

        // Special case: table-shaped JSON with orientation: 'by row'
        try {
            var orientation = (data && (data.orientation || data.Orientation || data.ORIENTATION));
            if (orientation && String(orientation).toLowerCase() === 'byrow' && (Array.isArray(data.cols) || Array.isArray(data.columns)) && Array.isArray(data.rows)) {
                var cols = Array.isArray(data.cols) ? data.cols : data.columns;
                // Render header
                var headRow0 = document.createElement('tr');
                cols.forEach(function (c) {
                    var th0 = document.createElement('th');
                    th0.textContent = String(c);
                    headRow0.appendChild(th0);
                });
                thead.appendChild(headRow0);
                // Render body
                data.rows.forEach(function (r) {
                    var tr0 = document.createElement('tr');
                    // allow row as array or object keyed by column name
                    if (Array.isArray(r)) {
                        cols.forEach(function (_, idx) {
                            var td0 = document.createElement('td');
                            var v0 = r[idx];
                            td0.textContent = (typeof v0 === 'object') ? JSON.stringify(v0) : (v0 == null ? '' : String(v0));
                            tr0.appendChild(td0);
                        });
                    } else if (r && typeof r === 'object') {
                        cols.forEach(function (colName) {
                            var td1 = document.createElement('td');
                            var v1 = r[colName];
                            td1.textContent = (typeof v1 === 'object') ? JSON.stringify(v1) : (v1 == null ? '' : String(v1));
                            tr0.appendChild(td1);
                        });
                    }
                    tbody.appendChild(tr0);
                });
                return;
            }
        } catch (e) {
            // Ignore and fall back
        }

        if (Array.isArray(data)) {
            if (data.length === 0) {
                showAlert("Empty list.");
                return;
            }
            if (typeof data[0] === 'object' && data[0] !== null) {
                // list of dicts
                var cols = Object.keys(data[0]);
                var headRow = document.createElement('tr');
                cols.forEach(function (c) {
                    var th = document.createElement('th');
                    th.textContent = c;
                    headRow.appendChild(th);
                });
                thead.appendChild(headRow);
                data.forEach(function (row) {
                    var tr = document.createElement('tr');
                    cols.forEach(function (c) {
                        var td = document.createElement('td');
                        var v = row[c];
                        td.textContent = (typeof v === 'object') ? JSON.stringify(v) : (v == null ? '' : String(v));
                        tr.appendChild(td);
                    });
                    tbody.appendChild(tr);
                });
            } else {
                // list of scalars
                var headRow2 = document.createElement('tr');
                var th2 = document.createElement('th');
                th2.textContent = 'value';
                headRow2.appendChild(th2);
                thead.appendChild(headRow2);
                data.forEach(function (v) {
                    var tr2 = document.createElement('tr');
                    var td2 = document.createElement('td');
                    td2.textContent = String(v);
                    tr2.appendChild(td2);
                    tbody.appendChild(tr2);
                });
            }
            return;
        }

        if (typeof data === 'object') {
            // dict -> two column table
            var headRow3 = document.createElement('tr');
            var thk = document.createElement('th');
            thk.textContent = 'key';
            headRow3.appendChild(thk);
            var thv = document.createElement('th');
            thv.textContent = 'value';
            headRow3.appendChild(thv);
            thead.appendChild(headRow3);
            Object.keys(data).forEach(function (k) {
                var tr3 = document.createElement('tr');
                var tdk = document.createElement('td');
                tdk.textContent = k;
                tr3.appendChild(tdk);
                var tdv = document.createElement('td');
                var v = data[k];
                tdv.textContent = (typeof v === 'object') ? JSON.stringify(v) : (v == null ? '' : String(v));
                tr3.appendChild(tdv);
                tbody.appendChild(tr3);
            });
            return;
        }

        // Fallback
        var headRow4 = document.createElement('tr');
        var th4 = document.createElement('th');
        th4.textContent = 'value';
        headRow4.appendChild(th4);
        thead.appendChild(headRow4);
        var tr4 = document.createElement('tr');
        var td4 = document.createElement('td');
        td4.textContent = String(data);
        tr4.appendChild(td4);
        tbody.appendChild(tr4);
    }

    function openKernelInfo(kernelId) {
        clearAlert();
        var idEl = $("#kernelInfoModalKernelId");
        if (idEl) idEl.textContent = kernelId || '-';
        var modalEl = $("#kernelInfoModal");
        if (!modalEl) {
            return;
        }
        try {
            var m = bootstrap.Modal.getOrCreateInstance(modalEl);
            m.show();
        } catch (e) {
            console.warn('Bootstrap modal not available', e);
        }

        if (!kernelId) {
            showAlert('No kernel id');
            return;
        }

        // Determine environment from the websocket task container, if available
        var envEl = document.querySelector('.clarama-websocket.clarama-task[environment]');
        var envVal = envEl ? (envEl.getAttribute('environment') || '').trim() : '';
        var base = (window.$CLARAMA_ENV_KERNEL_INFO || '/web/data/execute/environment/');
        var url = base + encodeURIComponent(envVal);

        fetch(url, {
            headers: {'Accept': 'application/json', 'Content-Type': 'application/json'},
            method: "post",
            body: JSON.stringify({})
        })
            .then(function (r) {
                return r.json();
            })
            .then(function (json) {
                renderTable(json);
            })
            .catch(function (err) {
                showAlert('Error: ' + err);
            });
    }

    function getKernelIdFromStatusButton(btn) {
        if (!btn) return '';
        var data = btn.getAttribute('data-kernel-id');
        if (data && data.trim().length > 0) return data.trim();
        var t = (btn.textContent || '').trim();
        // Often shows the raw id
        return t;
    }

    function wireKernelButtons() {
        // Known IDs used in templates
        var ids = ['edit-kernel-status', 'run-kernel-status', 'explore-kernel-status'];
        ids.forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.classList.add('clarama-kernel-id');
            if (!el.dataset.wired) {
                el.dataset.wired = '1';
                el.style.cursor = 'pointer';
                el.title = (el.title || 'Click to view kernel info');
                el.addEventListener('click', function () {
                    openKernelInfo(getKernelIdFromStatusButton(el));
                });
            }
        });
    }

    // Expose helper in case other code wants to open directly
    window.ClaramaKernel = {openKernelInfo: openKernelInfo};

    // global URL base from header if available
    document.addEventListener('DOMContentLoaded', function () {
        // From the common header we can define a URL in a global if available
        if (!window.$CLARAMA_ENV_KERNEL_INFO) {
            try {
                var el = document.querySelector('script#clarama-globals');
                if (el) {
                    // no-op; placeholder if global script injects values
                }
            } catch (e) {
            }
        }
        wireKernelButtons();
    });
})();
