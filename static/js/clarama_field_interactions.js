//  Copyright (c) 2024. Euan Duncan Macinnes, euan.d.macinnes@gmail.com, S7479622B - All Rights Reserved

// This file is for detecting and reacting to the field changes, to then decide the refresh (reload) action
// for the next field

// For keypress-based input fields, it will wait for 1000ms after typing stopped to then refresh the next field(s)
// For simple toggle fields (checkbox, button), the onchange event will directly apply

// Relevant classes:

// clarama-change-field - select boxes, checkbox
// clarama-button-field - button
// clarama-input-field - general input fields (text, number, date, etc..)
// clarama-editor-field - the ACE code editor
// clarama-rtf-field - the trumbowyg editor

// See: https://stackoverflow.com/questions/72699281/how-to-trigger-a-function-after-a-delay-only-once-with-the-latest-value-of-the-t
function debounce(func, timeout = 500) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            func.apply(this, args);
        }, timeout);
    }
}

function perform_interact(field, args = {}) {
    // console.log("perform_interact field", field);
    // console.log("Interacting from " + field.attr("id"));
    // console.log("args", args);

    var closestGrid = $(field).closest(".clarama-grid");
    // console.log("perform_interact closestGrid", closestGrid);

    var element = field.parents(".clarama-element").attr('id');
    var grid = closestGrid.find(".grid-stack");
    var grid_id = field.parents(".clarama-element").attr('grid-id');
    // console.log("grid_id", grid_id)

    if (grid_id !== undefined) {
        var element_array = eval(grid_id + "elements");
        var eobj = element_array[element];
        // console.log("eobj", eobj, " for ", grid_id + "elements", " element ", element);

        if ('links' in eobj) {
            // console.log("checking where get_field_values is called: perform_interact")
            get_field_values({}, true, function (field_registry) {
                // console.log("field_registry", field_registry)
                field_values = merge_dicts(field_registry, args);
                // console.log("perform_interact field_values", field_values);
                links = eobj["links"]; // array of file names to refresh
                //flash(element + ' links to ' + links);

                for (const link of links) {
                    if (link.contextMenu) continue; // context menu code is in clarama_grid_interactions.js
                    
                    // typeof link === 'string' exists so bec of old code
                    // bec we implemented interactions thus link type can be object
                    if (typeof link === 'string' || (typeof link === 'object' && link.element.includes("element_"))) { // for interaction type element
                        if (typeof link === 'object') {
                            linked_element = grid.find('#' + link.element);

                            // need to check if (interaction) element url differs bec the element-type might change based on url
                            if (element_array[link.element]['url'] !== link.url && link.url !== "") { 
                                linked_type = "changed"; 
                            } else {
                                linked_type = linked_element.attr("element-type");
                            }
                        } else {
                            linked_element = grid.find('#' + link);
                            linked_type = linked_element.attr("element-type");
                        }
                        // console.log("linked_element", linked_element)

                        switch (linked_type) {
                            case ".task":
                                try { claramaSaveStickyCookies(closestGrid); } catch(e) { console.log('Sticky flush failed on interact run', e); }
                                field_values['clarama_var_run'] = 'True'
                                reload(linked_element, field_values);
                                break;

                            case ".field":
                                var form_field = linked_element.find(".clarama-field");

                                if (form_field.hasClass('clarama-delay-field')) {
                                    console.log("Reloading " + linked_element)
                                    reload(linked_element, field_values)
                                } else {
                                    console.log("Refreshing " + linked_element)
                                    form_field.empty().trigger('change')
                                }
                                break;

                            case "changed":
                                linked_element.empty();
                                linked_element.append(showInteractionContent(field, 'run', link.url + "?" + link.params));
                                enable_interactions(linked_element);
                                break;

                            default:
                                flash("Don't know how to interact " + linked_type + " - " + link, 'danger');
                        }
                    } else if (typeof link === 'object') {
                        const { element, url, params } = link; // only need these
                        let fullUrl = url + "?" + params;
                        $('.select2-container').blur();

                        if (element === 'popup') {
                            showPopupNearMouse(field, fullUrl, field_values);
                        } else if (element === 'modal') {
                            showModalWithContent(field, fullUrl, field_values);
                        } else if (element === 'tab') {
                            triggerTabInteraction(field, fullUrl, field_values);
                        } else if (element === 'hidden') {
                            // this prob isnt the most ideal way but i think itll do for now since autorun isnt work
                            playHiddenContent(field, fullUrl, field_values);
                            const interval = setInterval(() => {
                                const runBtn = $("#run");
                                const socketId = $("#" + runBtn.attr("socket")).attr("task_kernel_id");

                                // ensure that runBtn exists n socket has an Id before simulating the click on the task run btn
                                if (runBtn && socketId) {
                                    runBtn.attr("hiddenCM", "true")
                                    runBtn.click();
                                    clearInterval(interval); // this will stop looping n finding the runBtn n socketId

                                    flash("hidden content ran");
                                }
                            }, 300);
                        }
                    }
                }
            }, closestGrid);
        }
    }
}

$.fn.interact_change = function () {
    return this.each(function () {
        const handleChange = debounce(() => perform_interact($(this)))
        $(this).off('change');
        $(this).on('change', handleChange);
    });
}

$.fn.interact_select = function () {
    return this.each(function () {

        const handleChange = debounce(() => perform_interact($(this)), 50)
        $(this).off('select2:select');
        $(this).on('select2:select', handleChange);
    });
}

$.fn.interact_delay = function () {
    return this.each(function () {
        const handleChange = debounce(() => perform_interact($(this)))
        $(this).on('input', handleChange);
    });
}

$.fn.interact_now = function () {
    return this.each(function () {
        //flash('interact! ' + $(this).attr('id'));
        $(this).on('input', perform_interact($(this)));
    });
}

$.fn.interact_button = function () {
    return this.each(function () {
        console.log("Setting interaction for " + $(this).attr('id'))
        $(this).off('click');
        $(this).on('click', function () {
                perform_interact($(this))
            }
        );
    });
}

$.fn.interact_editor = function () {
    return this.each(function () {

    });
}

$.fn.interact_rtf = function () {
    return this.each(function () {

    });
}


