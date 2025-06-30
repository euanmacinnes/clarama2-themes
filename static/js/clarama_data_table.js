/**
 * Clarama Data JS - Functions for data visualization and manipulation
 * @fileoverview This file provides functions for creating and manipulating data
 * visualizations, including tables and charts, in the Clarama interface.
 */

/**
 * Creates a Bootstrap table from provided data
 * @param {string} table_id - ID of the HTML element where the table will be rendered
 * @param {Object} table_data - Data object containing columns and rows
 * @description Transforms the provided data into a format suitable for Bootstrap Table
 * and initializes the table with appropriate options
 */
function bTable(table_id, table_data) {
    var table_columns = [];
    var table_rows = [];
    var headings = [];

    console.log(table_id + " TABLE_DATA");
    //console.log(table_data);
    //hello this is a test

    for (col of table_data['cols']) {
        headings.push(col);
        var col_dict = {
            'field': col,
            'title': col,
            'sortable': true
        }
        table_columns.push(col_dict);
    }

    Object.entries(table_data['rows']).forEach((row) => {
        this_row = row[1];
        //console.log("row " + this_row);
        col_dict = {};
        for (let i = 0; i < this_row.length; i++) {
            var colname = headings[i];
            col_dict[colname] = this_row[i];
        }
        table_rows.push(col_dict);
    });


    $('#' + table_id).bootstrapTable('destroy').bootstrapTable({
        exportDataType: 'all',
        exportOptions: {},
        exportTypes: ['json', 'xml', 'csv', 'txt', 'excel', 'pdf'],
        columns: table_columns,
        data: table_rows,
        onClickRow: function (row, $element, field) {
            // alert(JSON.stringify(row));
            table_selection = {
                row: row,
                field: field
            };
            perform_interact($('#' + table_id), table_selection);
        }
    });
}