define([
    'dojo/_base/declare',
    'dojo/_base/lang',
    'dojo/topic',
    'dojo/sniff',
    'dojo/_base/array',
    'dojo/date/locale',
    'dojo/number',

    'dstore/Memory',

    'dgrid1/Grid', // http://dojofoundation.org/packages/dgrid/
    'dgrid1/Selector',
    'dgrid1/Keyboard',
    'dgrid1/Editor',
    'dgrid1/extensions/ColumnHider',
    'dgrid1/extensions/ColumnReorder',
    'dgrid1/extensions/ColumnResizer',
    'dgrid1/extensions/Pagination',

    'xstyle/css!dgrid1/css/dgrid.css'

], function (
    declare,
    lang,
    topic,
    has,
    array,
    locale,
    number,

    Memory,

    Grid,
    Selector,
    Keyboard,
    Editor,
    ColumnHider,
    ColumnReorder,
    ColumnResizer,
    Pagination
) {

    return declare(null, {

        gridOptions: {},

        defaultGridOptions: {

            minWidth: 70,

            // no columns, use fields from Query's returned features
            columns: [],

            // no sort
            sort: [],

            // Allow the user to use column sets in grid
            editor: true,

            // Allow the user to use column sets in grid
            columnSet: false,

            // Allow the user to hide columns in grid
            columnHide: true,

            // Allow the user to reorder columns in grid
            columnReorder: true,

            // Allow the user to resize columns in grid
            columnResize: true,

            // Use pagination on the results grid
            pagination: true,

            paginationOptions: {
                rowsPerPage: 100,
                previousNextArrows: true,
                firstLastArrows: true,
                pagingLinks: 2,
                pagingTextBox: true,
                pageSizeOptions: [10, 25, 50, 100, 250, 500, 1000],
                showLoadingMessage: true
            }
        },

        getGridConfiguration: function (options) {
            this.gridOptions = this.mixinDeep(lang.clone(this.defaultGridOptions), options);
        },

        createGrid: function () {
            if (!this.grid) {
                var gridOptions = {
                    cellNavigation: false,
                    showHeader: true,
                    showFooter: true,
                    addUiClasses: false,
                    collection: new Memory(),
                    columns: [],
                    sort: []
                };

                var options = this.gridOptions || {};

                // grid and mixins
                var req = [Grid, Keyboard];
                if (this.featureOptions.selected !== false) {
                    req.push(Selector);
                    gridOptions.selectionMode = has('touch') ? 'toggle' : 'extended';
                    gridOptions.allowFeatureSelectionAll = true;
                }

                // hack to show all records when there is no pagination
                if (options.pagination !== true) {
                    options.paginationOptions.rowsPerPage = 999999;
                }
                req.push(Pagination);
                lang.mixin(gridOptions, options.paginationOptions);

                if (options.editor !== false) {
                    req.push(Editor);
                }

                // grid extensions
                if (options.columnHide !== false) {
                    req.push(ColumnHider);
                }
                if (options.columnReorder !== false) {
                    req.push(ColumnReorder);
                }
                if (options.columnResize !== false) {
                    req.push(ColumnResizer);
                }

                var AttributeGrid = declare(req);
                this.grid = new AttributeGrid(gridOptions, this.attributesTableGridDijit.domNode);
                this.grid.startup();

                // don't show the footer when there is no pagination
                if (options.pagination !== true) {
                    this.grid.set('showFooter', false);
                }

                if (this.featureOptions.selected) {
                    this.grid.on('dgrid-select', lang.hitch(this, 'selectFeaturesFromGrid'));
                    this.grid.on('dgrid-deselect', lang.hitch(this, 'selectFeaturesFromGrid'));
                }
            }

        },

        populateGrid: function (options) {
            var features = null,
                results = options;
            if (options.results) {
                results = options.results;
            } else {
                options = null; // no options when it is also the results
            }

            if (!this.results) {
                this.results = results;
                features = this.getFeaturesFromResults();
            } else {
                features = this.getFeatures();
            }
            if (!this.idProperty) {
                this.getIdProperty(results);
            }

            /* apparently not used
            var delim = '', linkField = this.linkField;
            var filteredFields = array.filter(results.fields, function (field) {
                return (field.name === linkField);
            });
            if (filteredFields.length > 0) {
                if (filteredFields[0].type === 'esriFieldTypeString') {
                    delim = '\'';
                }
            }
            */

            var rows = [];

            array.forEach(features, lang.hitch(this, function (feature) {
                // relationship query
                if (feature.relatedRecords) {
                    rows = rows.concat(this.getRelatedRecords(feature));

                // spatial or table query
                } else if (feature.attributes) {
                    rows = rows.concat(this.getRecordFromFeature(feature));
                }
            }));

            if (this.toolbarOptions.zoom.show) {
                this.zoomToFeatureGraphics();
            }

            this.getColumnsAndSort(results, options);

            if (rows && rows.length > 0) {
                var store = new Memory({
                    idProperty: this.idProperty,
                    data: rows
                });
                this.grid.set('collection', store);
            }

            // refresh only needs with IE?
            if (has('ie')) {
                this.grid.refresh();
            }
            this.setToolbarButtons();

        },

        getRecordFromFeature: function (feature) {
            var rows = [], delim = '';
            var lq = null;
            if (this.hasLinkedQuery()) {
                lq = this.linkedQuery;
            }

            var showFeatures = this.featureOptions.features;
            if (!lq || lq.type !== 'table') {
                var row = feature.attributes;
                // add reference to the feature if there is geometry
                if (showFeatures && feature.geometry) {
                    row.feature = lang.clone(feature);
                }
                if (lq && lq.linkIDs) {
                    lq.linkIDs.push(delim + feature.attributes[this.linkField] + delim);
                }
                rows.push(row);

                if (showFeatures && feature.geometry) {
                    this.addFeatureGraphic(feature);
                }
            }
            return rows;
        },

        getRelatedRecords: function (feature) {
            var rows = [], delim = '', objectID = feature.objectId;
            var lq = null;
            if (this.hasLinkedQuery()) {
                lq = this.linkedQuery;
            }

            var showFeatures = this.featureOptions.features;
            // multiple related records for a feature
            array.forEach(feature.relatedRecords, lang.hitch(this, function (record) {
                if (record.attributes) {
                    var row = record.attributes;
                    row.RelatedObjectID = objectID;
                    rows.push(row);
                }
                if (lq && lq.linkIDs) {
                    lq.linkIDs.push(delim + feature.attributes[this.linkField] + delim);
                }
                if (showFeatures && record.geometry) {
                    this.addFeatureGraphic(feature);
                }
            }));
            return rows;
        },

        getColumnsAndSort: function (results, options) {
            if (options) {
                // reset the columns?
                if (options.columns) {
                    this.gridOptions.columns = options.columns;
                }

                // reset the sort?
                if (options.sort) {
                    this.gridOptions.sort = options.sort;
                }
            }

            // set the columns
            var columns = lang.clone(this.gridOptions.columns) || [];
            // no columns? get them from the fields
            if (!columns || columns.length < 1) {
                columns = this.buildColumns(results);
            }

            if (columns) {
                this.setColumnStyles(columns);
                this.grid.set('columns', columns);
            } else if (this.gridOptions.subRows) {
                this.grid.set('subRows', this.gridOptions.subRows);
            }

            // set the sort
            var sort = this.gridOptions.sort || [];
            // sort === 'inherit'? use query result order
            if (typeof sort === 'string' && sort.toLowerCase() === 'inherit') {
                return;
            }
            // no sort? use the first column
            if (sort.length < 1 && columns && columns.length > 0) {
                sort = [
                    {
                        property: columns[0].field,
                        descending: false
                    }
                ];
            } else {
                // replace 'attribute' with 'property'.
                // needed to handle old configurations with new dgrid 1.x
                array.forEach(sort, function (item) {
                    if (item.attribute && !item.property) {
                        item.property = item.attribute;
                        delete item.attribute;
                    }
                });
            }
            this.grid.set('sort', sort);
        },

        buildColumns: function (results) {
            function formatDateTime (value) {
                var date = new Date(value);
                return locale.format(date, {
                    formatLength: 'short'
                });
            }
            function formatNumber (value) {
                return number.format(value);
            }
            function formatSingleDouble (value) {
                return number.format(value, {
                    places: 3
                });
            }

            var excludedFields = ['objectid', 'esri_oid', 'shape', 'shape.len', 'shape.area', 'shape.starea()', 'shape.stlength()', 'st_area(shape)', 'st_length(shape)'];
            var columns = [],
                col = null,
                nameLC = null;

            if (results.fields) {
                array.forEach(results.fields, function (field) {
                    nameLC = field.name.toLowerCase();
                    if (array.indexOf(excludedFields, nameLC) < 0) {
                        col = {
                            id: field.name,
                            field: field.name,
                            label: field.alias,
                            style: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                            width: 100
                        };
                        switch (field.type) {
                        case 'esriFieldTypeString':
                            col.width = 150;
                            break;
                        case 'esriFieldTypeSmallInteger':
                        case 'esriFieldTypeInteger':
                            col.formatter = formatNumber;
                            col.style += 'text-align:right;';
                            break;
                        case 'esriFieldTypeSingle':
                        case 'esriFieldTypeDouble':
                            col.formatter = formatSingleDouble;
                            col.style += 'text-align:right;';
                            break;
                        case 'esriFieldTypeDate':
                            col.width = 150;
                            col.formatter = formatDateTime;
                            break;
                        default:
                            break;
                        }
                        columns.push(col);
                    }
                });
            } else if (this.getFeatureCount() > 0) {
                var feature = this.features[0];
                if (feature) {
                    var attributes = feature.attributes;
                    for (var key in attributes) {
                        if (attributes.hasOwnProperty(key)) {
                            columns.push({
                                id: key,
                                field: key,
                                label: key,
                                width: 100
                            });
                        }
                    }
                }
            }
            return columns;
        },

        setColumnStyles: function (columns) {
            //style the grid columns from the config object
            var gr = this.grid;
            array.forEach(columns, function (column) {
                if (column.style) {
                    gr.styleColumn(column.id, column.style);
                }
            });
        },

        selectFeaturesFromGrid: function () {
            var selection = this.grid.get('selection'),
                feature = null;

            this.selectedFeatures = [];
            this.selectedGraphics.clear();

            for (var key in selection) {
                if (selection.hasOwnProperty(key) && selection[key] === true) {
                    feature = this.getFeatureFromStore(key);
                    if (feature && feature.geometry) {
                        this.addSelectedGraphic(feature);
                    }
                }
            }
            this.doneSelectingFeatures(true);
        },

        getFeatureFromStore: function (key) {
            var collection = this.grid.get('collection'),
                rec = null,
                feature = null;
            rec = collection.getSync(key);
            if (rec) {
                feature = rec.feature;
            }
            return feature;

        },

        clearGrid: function () {
            if (this.grid) {
                if (this.grid.clearSelection) {
                    this.grid.clearSelection();
                }
                this.grid.set('columns', []);
                this.grid.set('collection', new Memory());
                this.grid.refresh();
            }
            this.setToolbarButtons();
            topic.publish(this.attributesContainerID + '/tableUpdated', this);
        },

        clearSelectedGridRows: function () {
            if (!this.grid) {
                return null;
            }

            var selection = lang.clone(this.grid.get('selection'));
            var store = this.grid.get('store');

            if (!selection || !store) {
                return null;
            }

            for (var key in selection) {
                if (selection.hasOwnProperty(key) && selection[key] === true) {
                    store.remove(key);
                }
            }

            this.grid.refresh();

            return {selection: selection, idProperty: this.idProperty};
        }

    });
});
