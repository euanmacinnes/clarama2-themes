//  Copyright (c) 2024. Euan Duncan Macinnes, euan.d.macinnes@gmail.com, S7479622B - All Rights Reserved

/**
 * Clarama Embedded JS - Functions for dynamic content loading and script execution
 * @fileoverview This file provides functions for loading HTML content dynamically,
 * executing scripts within embedded content, and managing AJAX requests for both
 * GET and POST operations.
 */

// Running scripting in innerHTML from https://ghinda.net/article/script-tags/
/**
 * Runs an array of async functions in sequential order
 * @param {Array<Function>} arr - Array of functions to execute sequentially
 * @param {Function} callback - Callback function to execute after all functions complete
 * @param {number} [index=0] - Current index in the array (used for recursion)
 * @description Executes each function in the array, waiting for its callback before
 * proceeding to the next function. Source: https://ghinda.net/article/script-tags/
 */
function seq(arr, callback, index) {
    // first call, without an index
    if (typeof index === 'undefined') {
        index = 0
    }

    try {

        arr[index](function () {
            index++;
            if (index === arr.length) {
                callback()
            } else {
                seq(arr, callback, index)
            }
        })
    } catch (error) {
    }
}

/**
 * Triggers a DOMContentLoaded event
 * @description Creates and dispatches a synthetic DOMContentLoaded event
 * to notify the document that all scripts have been loaded and executed
 */
function scriptsDone() {
    var DOMContentLoadedEvent = document.createEvent('Event')
    DOMContentLoadedEvent.initEvent('DOMContentLoaded', true, true)
    document.dispatchEvent(DOMContentLoadedEvent)
}

/**
 * Inserts a script element into the document
 * @param {HTMLScriptElement} $script - The original script element to process
 * @param {Function} callback - Function to call after script is loaded or executed
 * @description Creates a new script element based on the original, either loading
 * an external script or executing inline script content, then removes the original
 */
function insertScript($script, callback) {
    let s = document.createElement('script');
    s.type = 'text/javascript'
    if ($script.src) {
        s.onload = callback
        s.onerror = callback
        s.src = $script.src
    } else {
        s.textContent = $script.innerText
    }

    // re-insert the script tag so it executes.
    document.head.appendChild(s)

    // clean-up
    $script.parentNode.removeChild($script)

    // run the callback immediately for inline scripts
    if (!$script.src) {
        callback()
    }
}

var current_embedded = '';

window.onerror = function (message, source, lineno, colno, error) {
    try {
        console.error("Global error:", message);
        console.error("Source:", source, "Line No:", lineno, "Col No:", colno, "Last embedded", current_embedded);

        // Attempt to fetch and log the exact source code line where the error occurred
        if (source && typeof lineno === 'number' && lineno > 0) {
            fetch(source, { cache: 'no-store' })
                .then(r => r.ok ? r.text() : Promise.reject(new Error("Failed to fetch source: " + r.status)))
                .then(txt => {
                    const lines = txt.split(/\r?\n/);
                    const idx = Math.max(0, lineno - 1);
                    const contextStart = Math.max(0, idx - 2);
                    const contextEnd = Math.min(lines.length - 1, idx + 2);
                    const context = [];
                    for (let i = contextStart; i <= contextEnd; i++) {
                        const marker = (i === idx) ? '>>' : '  ';
                        context.push(`${marker} ${i + 1}: ${lines[i]}`);
                    }
                    console.error("Offending source (±2 lines):\n" + context.join("\n"));
                })
                .catch(err => {
                    console.warn('Unable to retrieve error source code:', err);
                });
        }

        if (error && error.stack) {
            console.error('Stack trace:', error.stack);
        }
    } catch (inner) {
        // Swallow any logging errors to avoid recursive onerror
    }
    return true; // Prevent default error handling
}

// https://html.spec.whatwg.org/multipage/scripting.html
var runScriptTypes = [
    'application/javascript',
    'application/ecmascript',
    'application/x-ecmascript',
    'application/x-javascript',
    'text/ecmascript',
    'text/javascript',
    'text/javascript1.0',
    'text/javascript1.1',
    'text/javascript1.2',
    'text/javascript1.3',
    'text/javascript1.4',
    'text/javascript1.5',
    'text/jscript',
    'text/livescript',
    'text/x-ecmascript',
    'text/x-javascript'
]

/**
 * Finds and executes all script tags within a container
 * @param {HTMLElement} $container - The container element to search for scripts
 * @description Identifies all script tags within the container that have a valid
 * JavaScript MIME type (or no type attribute), and executes them sequentially
 * to preserve execution order
 */
function runScripts($container) {
    // get scripts tags from a node
    var $scripts = $container.querySelectorAll('script')
    var runList = []
    var typeAttr

    [].forEach.call($scripts, function ($script) {
        typeAttr = $script.getAttribute('type')

        // only run script tags without the type attribute
        // or with a javascript mime attribute value
        if (!typeAttr || runScriptTypes.indexOf(typeAttr) !== -1) {
            runList.push(function (callback) {
                console.log('Running script ' + $script.innerHTML);
                insertScript($script, callback);
            })
        }
    })

    // insert the script tags sequentially
    // to preserve execution order
    seq(runList, scriptsDone)
}

/**
 * Loads HTML content from a URL into a specified element
 * @param {string} url - The URL to fetch HTML content from
 * @param {jQuery} element - jQuery object representing the element to load content into
 * @description Fetches HTML content from the specified URL, displays it in the
 * target element, and executes any scripts contained within the loaded content
 */
function loadHTML(url, element) {
    element.html('<p>Loading...</p>');

    fetch($CLARAMA_ROOT + url)
        .then((response) => response.text())
        .then((html) => {
            //console.log('Loaded ' + $CLARAMA_ROOT + url)
            //console.log(html)
            var $element = document.getElementById(element)
            try {
                $element.innerHTML = html;
            } catch (err) {
                $element.innerHTML = err.message;
            }
            runScripts($element)
        })
        .catch((error) => {
            console.warn('Error loading ' + $CLARAMA_ROOT + url)
            console.warn(error);
        });
}

$.fn.load_post = function (onfinished, args, json) {
    if (args === undefined)
        args = {debug_theme: $CLARAMA_DEBUG_THEME};

    if (json === undefined)
        json = {};

    return this.each(function () {
        var embedded = $(this);
        console.log("POST loading " + embedded.attr("class") + " = " + embedded.attr("url") + JSON.stringify(args));

        if (embedded.attr("clarama_loaded") !== "true") {

            console.log("embedded.attr(autorun) loadpost", embedded.attr("autorun"))
            embedded.html('<div class="d-flex justify-content-center align-items-center"><div class="loading-spinner"></div></div>')
                .promise()
                .done(function () {
                    var url = embedded.attr("url");
                    var json_div = embedded.attr("post_json");
                    var json_attr = embedded.attr("json");
                    var json_encoded_class = embedded.attr("encoded_record_class");

                    if (json_encoded_class !== undefined) {
                        console.log("JSON encoded record class " + json_encoded_class);
                    } else
                        console.log("NO JSON encoded record class on " + embedded.attr("id"));

                    var json_encoded = embedded.closest('.' + json_encoded_class).attr("encoded_json");

                    //console.log("Looking for " + json_div + " for " + url)
                    var json_element = document.getElementById(json_div);

                    var json_payload = json;

                    if (url.split("?")[0] == "/render/embed/") {
                        url = "";
                    }

                    if (json_element !== undefined) {
                        try {
                            var je = $("<textarea/>").html(json_element.innerHTML).text(); // Hack to get json from a div element (which will be just text)
                            json_payload = JSON.parse(je);
                            console.log("CLARAMA_EMBEDDED: JSON Payload from div " + json_div);
                        } catch {
                            // Ignore, leave it as blank JSON to default the content (e.g. for new steps)
                        }
                    }

                    if (json_attr !== undefined) {
                        try {
                            console.log("JSON Payload attr " + json_attr);
                            json_payload = JSON.parse(json_attr);
                        } catch {

                        }
                    }

                    if (json_encoded !== undefined) {
                        try {
                            console.log("JSON Payload B64 encoded " + json_encoded);
                            json_payload = JSON.parse(atob(json_encoded));
                            json_payload['original_url'] = embedded.closest(".embedded").attr("original_url");
                        } catch {
                            console.error("Error decoding JSON");
                        }
                    }

                    console.log("JSON Payload for " + url);
                    console.log(json_payload);
                    console.log("url", url);
                    const final_url = merge_url_params(url, args);

                    fetch($CLARAMA_ROOT + final_url,
                        {
                            headers: {
                                'Accept': 'application/json',
                                'Content-Type': 'application/json'
                            },
                            method: "post",
                            body: JSON.stringify(json_payload)
                        })
                        .then((response) => {
                            // 1. check response.ok
                            if (response.ok) {
                                return response.text();
                            }

                            throw new Error('HTTP error ' + response.status);
                            //return Promise.reject(response); // 2. reject instead of throw
                        })
                        .then((html) => {
                            // console.log('POST Embedded JQuery Loaded ' + $CLARAMA_ROOT + url)
                            // console.log({ 'html': html })

                            if (html == "[]\n") {
                                html = "";
                            }

                            try {
                                console.log(final_url)

                                if (embedded.hasClass("clarama-replaceable")) {
                                    parent = embedded.parent();
                                    embedded.replaceWith(html);
                                    enable_interactions(parent);
                                } else {
                                    console.log("INTERACTIONS " + embedded.attr("id") + ': ' + final_url);
                                    console.log({html: html});
                                    try {
                                        current_embedded = final_url;
                                        embedded.html(html).promise()
                                            .done(function () {
                                                enable_interactions(embedded);
                                            });
                                    } catch (err) {
                                        console.error("Error loading html in " + embedded.attr("id"));
                                        console.log(err);
                                    }

                                }
                                //console.log('POST onfinished:' + typeof(onfinished) + '-' + onfinished);

                                if (typeof onfinished === 'function') {
                                    //console.log("POST finished, calling onfinished")
                                    onfinished();
                                }
                            } catch (err) {
                                embedded.html('<p>Clarama Embedded Error : ' + err.message + '</p>');
                                console.error(err, err.stack);
                            }
                            //console.log('JQuery HTML POST embedded ' + $CLARAMA_ROOT + url)
                            //runScripts(embedded.attr('id'))
                        })
                        .catch((error) => {
                            embedded.html('<p>' + error + '</p><p>' + $CLARAMA_ROOT + final_url + '</p>');
                            console.warn('JQuery Error loading ' + $CLARAMA_ROOT + final_url)
                            console.warn(error);
                        });

                    embedded.attr("clarama_loaded", true)
                });
        }
    });
}

/**
 * Merges URL parameters with additional arguments
 * @param {string} url - The base URL, possibly containing query parameters
 * @param {Object} args - Object containing additional parameters to add to the URL
 * @returns {string} The merged URL with all parameters
 * @description Parses the URL, adds or updates query parameters from the args object,
 * and returns the complete URL with the updated query string
 */
function merge_url_params(url, args) {
    const url_split = url.split('?');
    const params = new URLSearchParams(url_split[1]);

    for (let arg in args)
        params.set(arg, args[arg]);

    if (params.size == 0)
        return url;

    return `${url_split[0]}?${params}`;
}

/**
 * Merges two dictionaries/objects
 * @param {Object} a - Source object with properties to copy
 * @param {Object} b - Target object to copy properties into
 * @returns {Object} The modified target object (b)
 * @description Copies all properties from object a into object b,
 * overwriting any existing properties with the same name
 */
function merge_dicts(a, b) {
    for (let arg in a)
        b[arg] = a[arg];

    return b;
}

/**
 * Reloads content in an embedded element
 * @param {jQuery} embedded - jQuery object representing the embedded element to reload
 * @param {Object} args - Arguments to pass to the reload request
 * @description Resets the loading state of the element and triggers a reload
 * using either GET or POST depending on the element's class
 */
function reload(embedded, args) {
    console.log("embedded", embedded)
    console.log("Reloading " + embedded.attr('url') + " with args " + JSON.stringify(args))
    embedded.attr("clarama_loaded", 'false');
    embedded.attr("autorun", 'true');

    if (embedded.hasClass('clarama-embedded'))
        embedded.load(undefined, args);

    if (embedded.hasClass('clarama-post-embedded')) {
        console.log("RELOAD POST " + embedded, args);
        embedded.load_post(undefined, undefined, args);
    }
}

$.fn.load = function (onfinished, args) {
    if (args === undefined)
        args = {debug_theme: $CLARAMA_DEBUG_THEME};

    return this.each(function () {
        var embedded = $(this);
        // console.log("GET loading " + embedded.attr("class") + " = " + embedded.attr("url") + ' with args ' + JSON.stringify(args));

        if ((embedded.attr("clarama_loaded") !== "true") && (embedded.attr("autorun") !== "False")) {
            console.log("embedded.attr(autorun) load", embedded.attr("autorun"))
            embedded.html('<div class="d-flex justify-content-center align-items-center"><div class="loading-spinner"></div></div>')
                .promise()
                .done(function () {
                    var url = embedded.attr("url");
                    var url_data_id = embedded.attr("url_data_id");

                    if (url.split("?")[0] == "/render/embed/") {
                        url = "";
                    }

                    if (url_data_id !== undefined) {
                        //console.log("Retrieving JSON for " + url_data_id);

                        var url_data = $("#" + embedded.attr("url_data_id"));

                        if (url_data !== undefined)
                            url = url + 'json_data=' + encodeURI(url_data.html());
                    }

                    const final_url = merge_url_params(url, args);

                    //console.log($CLARAMA_ROOT + final_url);

                    //console.log('GET JQuery Loading ' + url + ' into div ' + embedded);

                    fetch($CLARAMA_ROOT + final_url)
                        .then((response) => response.text())
                        .then((html) => {

                            if (html == "[]\n") {
                                html = "";
                            }
                            console.log('GET Embedded JQuery Loaded ' + $CLARAMA_ROOT + url)
                            console.log({'html': html})
                            try {
                                console.log(final_url)
                                current_embedded = final_url;
                                embedded.html(html).promise()
                                    .done(function () {
                                        enable_interactions(embedded);
                                    });
                            } catch (err) {
                                embedded.html('<p>Clarama Embedded Error : ' + err.message + '</p>');
                                console.error(err, err.stack);
                            }

                            if (typeof onfinished === 'function') {
                                onfinished();
                            }
                        })
                        .catch((error) => {
                            console.warn('JQuery Error loading ' + $CLARAMA_ROOT + url)
                            console.warn(error);
                        });
                    embedded.attr("clarama_loaded", true)
                });
        }
        // else
        // {
        //    console.log(embedded.attr("url") + " control already loaded");
        // }
    });
}

/**
 * Fetches HTML content from a URL and processes it with a callback
 * @param {string} clarama_url - The URL to fetch HTML content from (without root)
 * @param {Function} loaded_event - Callback function to process the loaded HTML
 * @description Fetches HTML content from the specified URL and passes it to the
 * provided callback function for processing
 */
function get_html(clarama_url, loaded_event) {
    var fetch_url = $CLARAMA_ROOT + clarama_url;

    fetch(fetch_url)
        .then((response) => response.text())
        .then((html) => {
            //console.log('GET JQuery HTML Loaded ' + fetch_url)
            // console.log({ 'html': html })
            try {
                console.log({'html': html});
                loaded_event(html);
            } catch (err) {
                console.log('<p>' + err.message + '</p>');
                console.warn('JQuery Error loading ' + fetch_url)
                console.warn(err);
                return '<p>' + err.message + '</p>'
            }
            //console.log('JQuery HTML embedded ' + $CLARAMA_ROOT + url)
            //runScripts(embedded.attr('id'))
        })
        .catch((error) => {
            console.warn('JQuery Error loading ' + fetch_url)
            console.warn(error);
        });

}

/**
 * Fetches JSON data from a URL and processes it with a callback
 * @param {string} clarama_url - The URL to fetch JSON data from (without root)
 * @param {Function} result - Callback function to process the loaded JSON data
 * @description Fetches JSON data from the specified URL and passes it to the
 * provided callback function for processing
 */
function get_json(clarama_url, result) {
    var fetch_url = $CLARAMA_ROOT + clarama_url;

    fetch(fetch_url)
        .then((response) => response.json())
        .then((json) => {
            //console.log('GET JQuery JSON Loaded ' + fetch_url)
            // console.log({ 'html': html })
            try {
                result(json);
            } catch (err) {
                //console.log('<p>' + err.message + '</p>');
                console.warn('JQuery Error loading ' + fetch_url)
                console.warn(err);
                return {};
            }
            //console.log('JQuery HTML embedded ' + $CLARAMA_ROOT + url)
            //runScripts(embedded.attr('id'))
        })
        .catch((error) => {
            console.warn('JQuery Error loading ' + fetch_url)
            console.warn(error);
        });
}

/**
 * Executes a JSON URL and handles the response
 * @param {string} clarama_url - The URL to fetch JSON data from (without root)
 * @param {boolean} [reload=false] - Whether to reload the page after execution
 * @description Fetches JSON data from the specified URL, optionally reloads the page,
 * and displays a flash message based on the response status
 */
function execute_json_url(clarama_url, reload = false) {
    get_json(clarama_url, function (json) {
        console.log("Executed " + clarama_url)

        if (reload)
            window.location.reload()

        if (json['data'] == 'ok') {
            flash(json['results']);
        } else {
            flash('JSON error calling ' + clarama_url, 'danger');
        }

    })
}

function execute_json_url_async(clarama_url, reload = false) {
    return new Promise((resolve, reject) => {
        get_json(clarama_url, function (json) {
            console.log("Executed " + clarama_url)

            if (reload)
                window.location.reload()

            if (json['data'] == 'ok') {
                flash(json['results']);
            } else {
                flash('JSON error calling ' + clarama_url, 'danger');
            }

            resolve(json);
        })
    })
}


/**
 * Event handler for executing a function from an element
 * @returns {Function} Function that executes the URL from the clicked element
 * @description Creates a handler function that extracts the URL from the clicked
 * element and passes it to execute_function
 */
function execute_this() {
    execute_function($(this).attr("url"));
}

/**
 * jQuery plugin to attach execute_this handler to elements
 * @returns {jQuery} The jQuery object for chaining
 * @description Attaches a click event handler to each element in the jQuery collection
 * that will execute the URL specified in the element's url attribute
 */
$.fn.execute = function () {
    return this.each(function () {
            $(this).click(execute_this())
        }
    )
};
