/**
 * Chart Options JS - Handles chart color selection and formatting options
 * @fileoverview This file contains functions for managing chart color selection, 
 * series groups, and series formatting options.
 */

/**
 * Handles custom color selection for chart elements
 * @param {jQuery} jqthis - jQuery object representing the element
 * @param {string} variant - Variant suffix for targeting related elements ('-back' or '')
 * @description Updates the color of the select field based on the selected value.
 * If 'custom' is selected, triggers the color picker.
 */
function chart_colour_select_custom(jqthis, variant) {
    if (jqthis.val() === "custom") {
        // trigger the ellipsis, which triggers color picker
        jqthis.siblings(".format-col-picker" + variant).trigger("click");
    } else {
        const color = jqthis.val();
        jqthis.css("background-color", color);
        jqthis.css("color", isDarkColor(color) ? "white" : "black");
    }
}

/**
 * Updates the color of the select field during color picking
 * @param {jQuery} jqthis - jQuery object representing the color picker element
 * @param {string} variant - Variant suffix for targeting related elements ('-back' or '')
 * @description Updates the background and text color of the select field in real-time
 * as the user is picking a color.
 */
function pick_colour(jqthis, variant) {
    const color = jqthis.val();
    const selectField = jqthis.siblings(".format-col" + variant);
    selectField.css("background-color", color);
    selectField.css("color", isDarkColor(color) ? "white" : "black");
}

/**
 * Updates the select field with the chosen color and adds it as a new option
 * @param {jQuery} jqthis - jQuery object representing the color picker element
 * @param {string} variant - Variant suffix for targeting related elements ('-back' or '')
 * @description Updates the background and text color of the select field and adds
 * the selected color as a new option in the dropdown.
 */
function update_colour(jqthis, variant) {
    const color = jqthis.val();
    const selectField = jqthis.siblings(".format-col" + variant);
    selectField.css("background-color", color);
    selectField.css("color", isDarkColor(color) ? "white" : "black");

    // add new color as a selectable option
    const newOption = new Option(color, color, true, true);
    selectField.find("option[value='custom']").before(newOption);
}

/**
 * Main initialization function for chart options
 * @param {number} loop_index - Index used to identify specific chart elements
 * @description Sets up event listeners for color selection, drag and drop functionality,
 * and buttons for adding series groups and formats.
 */
function chart_options_initialize(loop_index) {
    const addSGBtn = document.getElementById("addSG" + loop_index);
    const seriesGrp = document.getElementById("seriesGrp" + loop_index);
    const seriesGrpJQ = $("#seriesGrp" + loop_index);

    const addSFBtn = document.getElementById("addSF" + loop_index);
    const seriesFormat = document.getElementById("seriesFormat" + loop_index);
    const seriesFormatJQ = $("#seriesFormat" + loop_index);

    // ==== DRAG N DROP ====
    $(document).ready(function () {
        dragAndDrop(loop_index);
    });

    // jQuery to handle click event for all sg remove buttons
    $(document).on('click', '.cell-delete-series-group', function () {
        $(this).closest('li').remove();
    });

    addSGBtn.addEventListener("click", function () {
        // append new li to series grp
        seriesGrp.appendChild(addSeriesGrp());
        enable_interactions(seriesGrpJQ); // This loads the URL defined in the DIV
    });

    // jQuery to handle click event for all sf remove buttons
    $(document).on('click', '.cell-delete-series-format', function () {
        $(this).closest('li').remove();
    });

    addSFBtn.addEventListener("click", function () {
        // append new li to series format
        seriesFormat.appendChild(addSeriesFormat());
        enable_interactions(seriesFormatJQ); // This loads the URL defined in the DIV
    });

    // add event listener to dynamically added color select elements
    $(document).on("change", ".format-col", function () {
        chart_colour_select_custom($(this), '');
    });

    // add event listener to dynamically added color select elements
    $(document).on("change", ".format-col-back", function () {
        chart_colour_select_custom($(this), '-back');
    });

    // when ellipsis is clicked, open color picker dialog
    $(".ellipsis").on("click", function () {
        $(this).next(".format-col-picker").trigger("click");
    })

    $(".ellipsis2").on("click", function () {
        $(this).next(".format-col-picker-back").trigger("click");
    })

    // this is so that when user is choosing the color from the color picker, the select field changes the bg color immediately
    $(document).on("input", ".format-col-picker", function () {
        pick_colour($(this), '');
    });

    // this is so that when user is choosing the color from the color picker, the select field changes the bg color immediately
    $(document).on("input", ".format-col-picker-back", function () {
        pick_colour($(this), '-back');
    });

    // the select option will be updated to the latest color the user picked once the color picker dialog is closed
    $(document).on("change", ".format-col-picker", function () {
        update_colour($(this), '');
    });

    // the select option will be updated to the latest color the user picked once the color picker dialog is closed
    $(document).on("change", ".format-col-picker-back", function () {
        update_colour($(this), '-back');
    });
}

/**
 * Enables drag and drop functionality for series groups
 * @param {number} loop_index - Index used to identify specific chart elements
 * @description Uses jQuery UI's sortable method to make series group items draggable
 * with the draggable-heading as the handle.
 */
function dragAndDrop(loop_index) {
    $(`#seriesGrp${loop_index}`).sortable({
        handle: '.draggable-heading' // specifies that entire list item (.draggable-heading) can be used to drag item
    });
}

/**
 * Creates a new series group element
 * @returns {HTMLElement} A new div element configured for series group
 * @description Creates a new div element with appropriate classes and URL attribute
 * for loading a series group template via AJAX.
 */
function addSeriesGrp() {
    const newIndex = $(".chart-series-groups").length;
    const newSG = document.createElement("div");
    newSG.className = "clarama-post-embedded clarama-replaceable"; // clarama-replaceable means that the div itself gets replaced.
    newSG.setAttribute("url", `/template/render/explorer/steps/data_edit_chart_series_group?loop_index=${newIndex}`);
    return newSG;
}

/**
 * Creates a new series format element
 * @returns {HTMLElement} A new div element configured for series format
 * @description Creates a new div element with appropriate classes and URL attribute
 * for loading a series format template via AJAX.
 */
function addSeriesFormat() {
    const newIndex = $(".chart-series-formats").length;

    const newSF = document.createElement("div");
    newSF.className = "clarama-post-embedded clarama-replaceable"; // clarama-replaceable means that the div itself gets replaced.
    newSF.setAttribute("url", `/template/render/explorer/steps/data_edit_chart_series_format?loop_index=${newIndex}`);
    return newSF;
}

/**
 * Determines if a color is dark based on its luminance
 * @param {string} color - Hexadecimal color code (e.g., "#FFFFFF")
 * @returns {boolean} True if the color is dark, false if it's light
 * @description Converts hex color to RGB, calculates luminance, and determines
 * if the color is dark (luminance < 128) or light.
 */
function isDarkColor(color) {
    // convert hex color to RGB
    const r = parseInt(color.substr(1, 2), 16);
    const g = parseInt(color.substr(3, 2), 16);
    const b = parseInt(color.substr(5, 2), 16);
    // calculate luminance
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    // return true if luminance is less than 128 (dark color)
    return luminance < 128;
}
