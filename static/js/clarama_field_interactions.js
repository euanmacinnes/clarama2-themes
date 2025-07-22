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
    console.log("field", field);
    console.log("Interacting from " + field.attr("id"));
    console.log("args", args);
    var element = field.parents(".clarama-element").attr('id');
    var grid = field.parents(".grid-stack");
    var grid_id = field.parents(".clarama-element").attr('grid-id');
    console.log("grid_id", grid_id)

    if (grid_id !== undefined) {
        var element_array = eval(grid_id + "elements");
        var eobj = element_array[element];
        console.log("eobj", eobj)
        if ('links' in eobj) {
            get_field_values({}, true, function (field_registry) {
                field_values = merge_dicts(field_registry, args);
                links = eobj["links"]; // array of file names to refresh
                console.log(field_values);
                //flash(element + ' links to ' + links);
                for (const link of links) {
                    if (typeof link === 'string' || (typeof link === 'object' && link.element.includes("element_"))) {
                        if (typeof link === 'object') {
                            linked_element = grid.find('#' + link.element);
                            if (element_array[link.element]['url'] !== link.url && link.url !== "") {
                                linked_type = "changed";
                            } else {
                                linked_type = linked_element.attr("element-type");
                            }
                        } else {
                            linked_element = grid.find('#' + link);
                            linked_type = linked_element.attr("element-type");
                        }
                        console.log("linked_element", linked_element)

                        // console.log("Linking " + link + '->' + linked_type);
                        switch (linked_type) {
                            case ".task":
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
                                linked_element[0].innerHTML = "";
                                linked_element[0].append(showInteractionContent(field, 'run', link.url + "?" + link.params));
                                enable_interactions($(`#${link.element}`));
                                break;

                            default:
                                flash("Don't know how to interact " + linked_type + " - " + link, 'danger');
                        }
                    } else if (typeof link === 'object') {
                        const {element, url, params} = link;
                        let fullUrl = url + "?" + params;
                        $('.select2-container').blur();
                        if (element === 'popup') {
                            showPopupNearMouse(field, fullUrl, field_values);
                        } else if (element === 'modal') {
                            showModalWithContent(field, fullUrl, field_values);
                            // linked_element = grid.find('#interactionModalContent');
                            // console.log("linked_element modal", linked_element)
                            // reload(linked_element, field_values)
                        } else if (element === 'tab') {
                            triggerTabInteraction(field, fullUrl, field_values);
                        }
                        // else {
                        //     const toOverride = document.getElementById(element);
                        //     console.log("toOverride", toOverride)
                        //     toOverride.innerHTML = "";
                        //     toOverride.append(showInteractionContent(url));
                        //     enable_interactions($(`#${element}`));
                        // }
                    }
                }
            });
        }

        // if (field.length && field.is('table') && field_values['row']['issue_id']) {
        //     showModalWithContent("/System/Slates/Tasks/Issue_Details.task.yaml");
        //     // linked_element = $('#interactionModalBody');
        //     // console.log("linked_element modal", linked_element)
        //     // console.log("field_values issue_id", field_values);
        //     // reload(linked_element, field_values)
        // }
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


