/**
 * 3D Chart Options JS - Handles chart color selection and formatting options
 * @fileoverview This file contains functions for managing 3d chart color selection 
 * and series objects options.
 */

/**
 * Handles custom color selection for chart elements
 * @param {jQuery} jqthis - jQuery object representing the element
 * @param {string} variant - Variant suffix for targeting related elements ('-back' or '')
 * @description Updates the color of the select field based on the selected value.
 * If 'custom' is selected, triggers the color picker.
 */
function chart3d_colour_select_custom(jqthis, variant) {
    if (jqthis.val() === "custom") {
        // trigger the ellipsis, which triggers color picker
        jqthis.siblings(".chart3d-col-picker" + variant).trigger("click");
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
function pick_3d_colour(jqthis, variant) {
    const color = jqthis.val();
    const selectField = jqthis.siblings(".chart3d-col" + variant);
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
function update_3d_colour(jqthis, variant) {
    const color = jqthis.val();
    const selectField = jqthis.siblings(".chart3d-col" + variant);
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
 * and buttons for adding series objects.
 */
function chart3d_options_initialize(loop_index) {
    const addSOBtn = document.getElementById("addSO" + loop_index);
    const seriesObj = document.getElementById("seriesObj" + loop_index);
    const seriesObjJQ = $("#seriesObj" + loop_index);

    // jQuery to handle click event for all so remove buttons
    $(document).on('click', '.cell-delete-series-object', function () {
        $(this).closest('li').remove();
    });

    addSOBtn.addEventListener("click", function () {
        // append new li to series object
        seriesObj.appendChild(addSeriesObj());
        enable_interactions(seriesObjJQ); // This loads the URL defined in the DIV
    });

    // add event listener to dynamically added color select elements
    $(document).on("change", ".chart3d-col", function () {
        chart3d_colour_select_custom($(this), '');
    });

    // when ellipsis is clicked, open color picker dialog
    $(".ellipsis").on("click", function () {
        $(this).next(".chart3d-col-picker").trigger("click");
    })

    // this is so that when user is choosing the color from the color picker, the select field changes the bg color immediately
    $(document).on("input", ".chart3d-col-picker", function () {
        pick_3d_colour($(this), '');
    });

    // the select option will be updated to the latest color the user picked once the color picker dialog is closed
    $(document).on("change", ".chart3d-col-picker", function () {
        update_3d_colour($(this), '');
    });
}

/**
 * Creates a new series object element
 * @returns {HTMLElement} A new div element configured for series object
 * @description Creates a new div element with appropriate classes and URL attribute
 * for loading a series object template via AJAX.
 */
function addSeriesObj() {
    const newIndex = $(".chart3d-series-objects").length;

    const newSA = document.createElement("div");
    newSA.className = "clarama-post-embedded clarama-replaceable"; // clarama-replaceable means that the div itself gets replaced.
    newSA.setAttribute("url", `/template/render/explorer/steps/data_edit_chart3d_series_object?loop_index=${newIndex}`);
    return newSA;
}
