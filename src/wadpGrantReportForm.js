/**
 * Grants Reporting Form
 * @author Derick Alangi (WMF)
 */
( function () {
    'use strict';

    var gadgetMsg = {},
        getContentModuleQuery,
        getRelevantRawEntry,
        parseContentModule,
        openWindow,
        userLang,
        cleanRawEntry,
        windowManager,
        AffiliateLookupTextInputWidget,
        getAffiliatesList,
        queryAffiliatesPage,
        fieldImportedReportDate,
        fieldPartnershipOther,
        fieldPartnershipOtherInput;

    userLang = mw.config.get( 'wgUserLanguage' );

    // This is called after translation messages are ready
    function initAfterMessages() {
        /**
         * Provides API parameters for getting the content from [[Module:Grants_Reports]]
         *
         * @return {Object}
         */
        getContentModuleQuery = function () {
            return {
                action: 'query',
                prop: 'revisions',
                titles: 'Module:Grant_Reports',
                rvprop: 'content',
                rvlimit: 1
            };
        };

        /**
         * Takes Lua-formatted content from [[Module:Grants_Reports]] content and
         * returns an abstract syntax tree.
         *
         * @param {Object} sourceblob The original API return
         * @return {Object} Abstract syntax tree
         */
        parseContentModule = function ( sourceblob ) {
            var ast, i, raw;
            for ( i in sourceblob ) {  // should only be one result
                raw = sourceblob[ i ].revisions[ 0 ][ '*' ];
                ast = luaparse.parse( raw );
                return ast.body[ 0 ].arguments[ 0 ].fields;
            }
        };

        /**
         * Loops through the abstract syntax tree and returns a specific requested
         * entry
         *
         * @param {Object} entries The abstract syntax tree
         * @param {string} uniqueId the entry we want to pick out.
         */
        getRelevantRawEntry = function ( entries, uniqueId ) {
            var i, j;
            // Look through the entries
            for ( i = 0; i < entries.length; i++ ) {
                // Loop through the individual key-value pairs within each entry
                for ( j = 0; j < entries[ i ].value.fields.length; j++ ) {
                    if (
                        entries[ i ].value.fields[ j ].key.name === 'unique_id' &&
                        entries[ i ].value.fields[ j ].value.value === uniqueId
                    ) {
                        return entries[ i ].value.fields;
                    }
                }
            }
        };

        /**
         * Take a raw entry from the abstract syntax tree and make it an object
         * that is easier to work with.
         *
         * @param {Object} relevantRawEntry the raw entry from the AST
         * @return {Object} The cleaned up object
         */
        cleanRawEntry = function ( relevantRawEntry ) {
            var entryData = {},
                i, j;
            for ( i = 0; i < relevantRawEntry.length; i++ ) {
                if ( relevantRawEntry[ i ].key.name === 'partnership_info' ) {
                    entryData.partnership_info = [];
                    for (
                        j = 0;
                        j < relevantRawEntry[ i ].value.fields.length;
                        j++
                    ) {
                        entryData.partnership_info.push(
                            relevantRawEntry[ i ].value.fields[ j ].value.value
                        );
                    }
                } else {
                    entryData[ relevantRawEntry[ i ].key.name ] = relevantRawEntry[ i ].value.value;
                }
            }
            return entryData;
        };

        /**
         * Provides API parameters for getting the content from
         * [[m:Wikimedia_Affiliates_Data_Portal/MRL/List_Of_All_Wikimedia_Affiliates]]
         *
         * @return {Object}
         */
        queryAffiliatesPage = function () {
            return {
                action: 'query',
                prop: 'revisions',
                titles: 'Wikimedia_Affiliates_Data_Portal/MRL/List_Of_All_Wikimedia_Affiliates',
                rvprop: 'content',
                rvlimit: 1
            };
        };

        /**
         * Get an entire content (wikitext) of a given page
         *
         * @param {Object} sourceblob The original API return
         * @return {Object} raw Entire page content (wikitext)
         */
        getAffiliatesList = function ( sourceblob ) {
            var i, raw;
            for ( i in sourceblob ) {  // should only be one result
                raw = sourceblob[ i ].revisions[ 0 ][ '*' ];
                return raw;
            }
        };

        /**
         * Method to Lookup Affiliate names from [[m:Wikimedia_Affiliates_Data_Portal/MRL/List_Of_All_Wikimedia_Affiliates]]
         * and to be used as autocomplete form element in the forms
         */
        AffiliateLookupTextInputWidget = function AffiliatesLookupTextInputWidget( config ) {
            // Parent constructor
            OO.ui.TextInputWidget.call( this, $.extend(
                {
                    indicator: 'required',
                    required: true,
                    validate: 'text',
                    placeholder: gadgetMsg[ 'group-name-placeholder' ]
                }, config ) );
            // Mixin constructors
            OO.ui.mixin.LookupElement.call( this, config );
        };
        OO.inheritClass( AffiliateLookupTextInputWidget, OO.ui.TextInputWidget );
        OO.mixinClass( AffiliateLookupTextInputWidget, OO.ui.mixin.LookupElement );

        /* Get a new request object of the current lookup query value. */
        AffiliateLookupTextInputWidget.prototype.getLookupRequest = function () {
            var value = this.getValue();
            return this.getValidity().then( function () {
                // Query the API to get the list of affiliates
                return new mw.Api().get( queryAffiliatesPage() ).then( function ( data ) {
                    var affiliates, affiliatesContent;
                    affiliatesContent = getAffiliatesList( data.query.pages );
                    affiliates = affiliatesContent.split(',\n');
                    // Filter to only affiliates whose names contain the input (case-insensitive)
                    affiliates = affiliates.filter( function ( v ) {
                        return v.toLowerCase().indexOf( value.toLowerCase() ) !== -1;
                    } );
                    return affiliates;
                } );
            }, function () {
                // No results when the input contains invalid content
                return [];
            } );
        };

        /* Pre-process data returned by the request from #getLookupRequest. */
        AffiliateLookupTextInputWidget.prototype.getLookupCacheDataFromResponse = function ( response ) {
            return response || [];
        };

        /** Get a list of menu option widgets from the (possibly cached) data
         * returned by #getLookupCacheDataFromResponse.
         */
        AffiliateLookupTextInputWidget.prototype.getLookupMenuOptionsFromData = function ( data ) {
            var items = [], i, affiliate;

            for ( i = 0; i < data.length; i++ ) {
                affiliate = String( data[ i ] );
                affiliate = affiliate.split(' ~ ')[0];
                items.push( new OO.ui.MenuOptionWidget( {
                    data: affiliate,
                    label: affiliate
                } ) );
            }
            return items;
        };

        /**
         * Subclass ProcessDialog
         *
         * @class GrantsEditor
         * @extends OO.ui.ProcessDialog
         *
         * @constructor
         * @param {Object} config
         */
        function GrantsEditor( config ) {
            this.group_name = '';
            this.report_type = '';
            this.start_date = '';
            this.end_date = '';
            this.total_budget = '';
            this.currency = '';
            this.report_link = '';
            this.partnership_info = [];
            this.imported_report_date = '';
            this.dos_stamp = '';

            if ( config.unique_id ) {
                this.uniqueId = config.unique_id;
            }

            if ( config.group_name ) {
                this.group_name = config.group_name;
            }
            if ( config.report_type ) {
                this.report_type = config.report_type;
            }
            if ( config.start_date ) {
                this.start_date = config.start_date;
            }
            if ( config.end_date ) {
                this.end_date = config.end_date;
            }
            if ( config.total_budget ) {
                this.total_budget = config.total_budget;
            }
            if ( config.currency ) {
                this.currency = config.currency;
            }
            if ( config.report_link ) {
                this.report_link = config.report_link;
            }
            if ( config.partnership_info ) {
                this.partnership_info = config.partnership_info;
            }
            if ( config.imported_report_date ) {
                this.imported_report_date = config.imported_report_date;
            }
            if ( config.dos_stamp ) {
                this.dos_stamp = config.dos_stamp;
            }
            GrantsEditor.super.call( this, config );
        }
        OO.inheritClass( GrantsEditor, OO.ui.ProcessDialog );

        GrantsEditor.static.name = 'grantsEditor';
        GrantsEditor.static.title = gadgetMsg[ 'grant-report-header' ];
        GrantsEditor.static.actions = [
            {
                action: 'continue',
                modes: 'edit',
                label: gadgetMsg[ 'submit-report' ],
                flags: [ 'primary', 'constructive' ]
            },
            {
                action: 'cancel',
                modes: 'edit',
                label: gadgetMsg[ 'cancel-button' ],
                flags: 'safe'
            }
        ];

        /**
         * Use the initialize() method to add content to the dialog's $body,
         * to initialize widgets, and to set up event handlers.
         */
        GrantsEditor.prototype.initialize = function () {
            var i, fieldPartnershipInfoSelected;

            /* Get today's date and time in YYYY-MM-DDTHH:MM:SSZ */
            /* format. dos stands for "date of submission" */
            this.dos_stamp = new Date().toISOString();

            GrantsEditor.super.prototype.initialize.call( this );
            this.content = new OO.ui.PanelLayout( {
                padded: true,
                expanded: false
            } );
            this.fieldGroupName = new AffiliateLookupTextInputWidget();
            this.fieldReportType = new OO.ui.DropdownInputWidget( {
                options: [
                    {
                        data: 'Rapid Project Grant',
                        label: gadgetMsg[ 'rapid-project-grant' ]
                    },
                    {
                        data: 'Project Grant',
                        label: gadgetMsg[ 'project-grant' ]
                    },
                    {
                        data: 'Annual Plan Grant',
                        label: gadgetMsg[ 'annual-plan-grant' ]
                    },
                    {
                        data: 'Conference or Event Grant',
                        label: gadgetMsg[ 'conference-or-event-grant' ]
                    },
                    {
                        data: 'Simple Annual Plan Grant',
                        label: gadgetMsg[ 'simple-annual-plan-grant' ]
                    },
                    {
                        data: 'FDC Annual Plan Grant',
                        label: gadgetMsg[ 'fdc-annual-plan-grant' ]
                    }
                ]
            } );
            this.fieldStartDate = new OO.ui.TextInputWidget( {
                value: this.start_date,
                indicator: 'required',
                required: true,
                placeholder: gadgetMsg[ 'start-date-placeholder' ]
            } );
            this.fieldEndDate = new OO.ui.TextInputWidget( {
                value: this.end_date,
                indicator: 'required',
                required: true,
                placeholder: gadgetMsg[ 'end-date-placeholder' ]
            } );
            this.fieldTotalBudget = new OO.ui.TextInputWidget( {
                value: this.total_budget,
                indicator: 'required',
                required: true,
                placeholder: gadgetMsg[ 'total-budget-placeholder' ]
            } );
            this.fieldCurrency = new OO.ui.TextInputWidget( {
                value: this.currency,
                indicator: 'required',
                required: true,
                placeholder: gadgetMsg[ 'currency-placeholder' ]
            } );
            this.fieldReportLink = new OO.ui.TextInputWidget( {
                value: this.report_link,
                indicator: 'required',
                required: true,
                placeholder: gadgetMsg[ 'report-link-placeholder' ]
            } );

            fieldPartnershipInfoSelected = [];
            for ( i = 0; i < this.partnership_info.length; i++ ) {
                fieldPartnershipInfoSelected.push(
                    {
                        data: this.partnership_info[ i ],
                        label: gadgetMsg[ this.partnership_info[ i ].toLowerCase().replace( / /g, '-' ) ]
                    }
                );
            }

            fieldPartnershipOther = new OO.ui.CheckboxMultioptionWidget(
                {
                    data: 'Other',
                    label: gadgetMsg[ 'partnership-other' ]
                }
            );
            this.fieldPartnershipInfo = new OO.ui.CheckboxMultiselectWidget( {
                classes: [ 'checkbox-inline' ],
                selected: fieldPartnershipInfoSelected,
                items: [
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'Educational Institutions',
                        label: gadgetMsg[ 'educational-institutions' ]
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'GLAM Institutions',
                        label: gadgetMsg[ 'glam-institutions' ]
                    } ),
                    fieldPartnershipOther
                ]
            } );
            fieldPartnershipOtherInput = this.fieldPartnershipOtherInput = new OO.ui.TextInputWidget( {
                placeholder: gadgetMsg[ 'partnership-other-ph' ]
            } );
            fieldPartnershipOtherInput.toggle();
            fieldPartnershipOther.on('change', function ( isSelected ) {
                fieldPartnershipOtherInput.toggle( isSelected );
            } );

            this.fieldImportedReportCB = new OO.ui.CheckboxInputWidget( {
            } );
            fieldImportedReportDate = this.fieldImportedReportDate = new OO.ui.TextInputWidget( {
                value: this.imported_report_date,
                placeholder: gadgetMsg[ 'import-date' ]
            } );
            fieldImportedReportDate.toggle();
            this.fieldImportedReportCB.on('change', function ( isSelected ) {
                fieldImportedReportDate.toggle( isSelected );
            } );

            this.fieldDateOfSubmission = new OO.ui.TextInputWidget( {
                value: this.dos_stamp,
                type: 'hidden'
            } );

            // Append things to fieldSet
            this.fieldSet = new OO.ui.FieldsetLayout( {
                items: [
                    new OO.ui.FieldLayout(
                        this.fieldGroupName,
                        {
                            label: gadgetMsg[ 'group-name' ],
                            align: 'top',
                            help: gadgetMsg[ 'group-name-tip' ]
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldReportType,
                        {
                            label: gadgetMsg[ 'your-report-type' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldStartDate,
                        {
                            label: gadgetMsg[ 'reporting-timeline' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldEndDate,
                        {
                            label: '',
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldTotalBudget,
                        {
                            label: gadgetMsg[ 'total-budget' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldCurrency,
                        {
                            label: gadgetMsg[ 'currency-name' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldReportLink,
                        {
                            label: gadgetMsg[ 'report-link' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldPartnershipInfo,
                        {
                            label: gadgetMsg[ 'partnership-information' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldPartnershipOtherInput,
                        {
                            align: 'inline'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldImportedReportCB,
                        {
                            label: gadgetMsg[ 'imported-report' ],
                            align: 'inline',
                            help: gadgetMsg[ 'import-date-tip' ]
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldImportedReportDate,
                        {
                            align: 'inline',
                        }
                    )
                ]
            } );

            // When everything is done
            this.content.$element.append( this.fieldSet.$element );
            this.$body.append( this.content.$element );
        };

        /**
         * Set custom height for the modal window
         *
         */
        GrantsEditor.prototype.getBodyHeight = function () {
            return 700;
        };

        /**
         * In the event "Select" is pressed
         *
         */
        GrantsEditor.prototype.getActionProcess = function ( action ) {
            var dialog = this;
            if ( action === 'continue' && dialog.fieldGroupName.getValue() ) {
                return new OO.ui.Process( function () {
                    dialog.saveItem();
                } );
            } else {
                return new OO.ui.Process( function () {
                    dialog.close();
                } );
            }
            return NewItemDialog.parent.prototype.getActionProcess.call( this, action );
        };

        /**
         * Save the changes to [[Module:Grant_Reports]] page.
         */
        GrantsEditor.prototype.saveItem = function ( deleteFlag ) {
            var dialog = this;

            dialog.pushPending();

            new mw.Api().get( getContentModuleQuery() ).then( function ( data ) {
                var i, insertInPlace, sanitizeInput, processWorkingEntry,
                    editSummary, manifest = [], workingEntry, generateKeyValuePair,
                    entries;

                /**
                 * Sanitizes input for saving to wiki
                 *
                 * @param {string} s
                 *
                 * @return {string}
                 */
                sanitizeInput = function ( s ) {
                    return s
                        .replace( /\\/g, '\\\\' )
                        .replace( /\n/g, '<br />' );
                };

                /**
                 * Creates Lua-style key-value pairs, including converting the
                 * audiences array into a proper sequential table.
                 *
                 * @param {string} k The key
                 * @param {string} v The value
                 *
                 * @return {string}
                 */
                generateKeyValuePair = function ( k, v ) {
                    var res, jsonarray;
                    res = '\t\t'.concat( k, ' = ' );
                    if ( k === 'partnership_info' ) {
                        jsonarray = JSON.stringify( v );
                        // Lua uses { } for "arrays"
                        jsonarray = jsonarray.replace( '[', '{' );
                        jsonarray = jsonarray.replace( ']', '}' );
                        // Style changes (single quotes, spaces after commas)
                        jsonarray = jsonarray.replace( /\"/g, '\'' );
                        jsonarray = jsonarray.replace( /,/g, ', ' );
                        // Basic input sanitation
                        jsonarray = sanitizeInput( jsonarray );
                        res += jsonarray;
                    } else {
                        v = sanitizeInput( v );
                        v = v.replace( /'/g, '\\\'' );
                        res += '\'' + v + '\'';
                    }
                    res += ',\n';
                    return res;
                };

                /**
                 * Compares a given [[Module:Grant_Reports]] entry against the edit fields
                 * and applies changes where relevant.
                 *
                 * @param {Object} workingEntry the entry being worked on
                 * @return {Object} The same entry but with modifications
                 */
                processWorkingEntry = function ( workingEntry ) {
                    if ( dialog.fieldGroupName.getValue() ) {
                        workingEntry.group_name = dialog.fieldGroupName.getValue().split(' ~ ')[0];
                    } else if ( !dialog.fieldGroupName.getValue() && workingEntry.group_name ) {
                        delete workingEntry.group_name;
                    }

                    if ( dialog.fieldReportType.getValue() ) {
                        workingEntry.report_type = dialog.fieldReportType.getValue();
                    } else if ( !dialog.fieldReportType.getValue() && workingEntry.report_type ) {
                        delete workingEntry.report_type;
                    }

                    if ( dialog.fieldStartDate.getValue() ) {
                        workingEntry.start_date = dialog.fieldStartDate.getValue();
                    } else if ( !dialog.fieldStartDate.getValue() && workingEntry.start_date ) {
                        delete workingEntry.start_date;
                    }

                    if ( dialog.fieldEndDate.getValue() ) {
                        workingEntry.end_date = dialog.fieldEndDate.getValue();
                    } else if ( !dialog.fieldEndDate.getValue() && workingEntry.end_date ) {
                        delete workingEntry.end_date;
                    }

                    if ( dialog.fieldTotalBudget.getValue() ) {
                        workingEntry.total_budget = dialog.fieldTotalBudget.getValue();
                    } else if ( !dialog.fieldTotalBudget.getValue() && workingEntry.total_budget ) {
                        delete workingEntry.total_budget;
                    }

                    if ( dialog.fieldCurrency.getValue() ) {
                        workingEntry.currency = dialog.fieldCurrency.getValue();
                    } else if ( !dialog.fieldCurrency.getValue() && workingEntry.currency ) {
                        delete workingEntry.currency;
                    }

                    if ( dialog.fieldReportLink.getValue() ) {
                        workingEntry.report_link = dialog.fieldReportLink.getValue();
                    } else if ( !dialog.fieldReportLink.getValue() && workingEntry.report_link ) {
                        delete workingEntry.report_link;
                    }

                    if ( dialog.fieldPartnershipInfo.findSelectedItemsData() ) {
                        workingEntry.partnership_info = dialog.fieldPartnershipInfo.findSelectedItemsData();
                        for ( i=0; i < workingEntry.partnership_info.length; i++ ) {
                            if ( workingEntry.partnership_info[ i ] === 'Other' ) {
                                workingEntry.partnership_info[ i ] = dialog.fieldPartnershipOtherInput.getValue();
                            }
                        }
                    } else if ( !dialog.fieldPartnershipInfo.findSelectedItemsData() && workingEntry.partnership_info ) {
                        delete workingEntry.partnership_info;
                    }

                    if ( dialog.fieldImportedReportDate.getValue() ) {
                        workingEntry.dos_stamp = dialog.fieldImportedReportDate.getValue();
                        workingEntry.dos_stamp += 'T00:00:00.000Z';
                    } else {
                        /* Get today's date and time in YYYY-MM-DDTHH:MM:SSZ */
                        /* format. dos stands for "date of submission" */
                        workingEntry.dos_stamp = new Date().toISOString();
                    }

                    return workingEntry;
                };

                // Cycle through existing entries. If we are editing an existing
                // entry, that entry will be modified in place.
                entries = parseContentModule( data.query.pages );

                for ( i = 0; i < entries.length; i++ ) {
                    workingEntry = cleanRawEntry( entries[ i ].value.fields );
                    if ( workingEntry.unique_id !== dialog.uniqueId || !deleteFlag ) {
                        manifest.push( workingEntry );
                    }
                }

                // No unique ID means this is a new entry
                if ( !dialog.uniqueId ) {
                    workingEntry = {
                        unique_id: Math.random().toString( 36 ).substring( 2 )
                    };
                    workingEntry = processWorkingEntry( workingEntry );
                    editSummary = gadgetMsg[ 'added-new-grants-report' ].concat( workingEntry.group_name );
                    manifest.push( workingEntry );
                }

                // Re-generate the Lua table based on `manifest`
                insertInPlace = 'return {\n';
                for ( i = 0; i < manifest.length; i++ ) {
                    insertInPlace += '\t{\n';
                    if ( manifest[ i ].unique_id ) {
                        insertInPlace += generateKeyValuePair(
                            'unique_id',
                            manifest[ i ].unique_id
                        );
                    }
                    if ( manifest[ i ].group_name ) {
                        insertInPlace += generateKeyValuePair(
                            'group_name',
                            manifest[ i ].group_name
                        );
                    }
                    if ( manifest[ i ].report_type ) {
                        insertInPlace += generateKeyValuePair(
                            'report_type',
                            manifest[ i ].report_type
                        );
                    }
                    if ( manifest[ i ].start_date ) {
                        insertInPlace += generateKeyValuePair(
                            'start_date',
                            manifest[ i ].start_date
                        );
                    }
                    if ( manifest[ i ].end_date ) {
                        insertInPlace += generateKeyValuePair(
                            'end_date',
                            manifest[ i ].end_date
                        );
                    }
                    if ( manifest[ i ].total_budget ) {
                        insertInPlace += generateKeyValuePair(
                            'total_budget',
                            manifest[ i ].total_budget
                        );
                    }
                    if ( manifest[ i ].currency ) {
                        insertInPlace += generateKeyValuePair(
                            'currency',
                            manifest[ i ].currency
                        );
                    }
                    if ( manifest[ i ].report_link ) {
                        insertInPlace += generateKeyValuePair(
                            'report_link',
                            manifest[ i ].report_link
                        );
                    }
                    if ( manifest[ i ].partnership_info ) {
                        insertInPlace += generateKeyValuePair(
                            'partnership_info',
                            manifest[ i ].partnership_info
                        );
                    }
                    if ( manifest[ i ].dos_stamp ) {
                        insertInPlace += generateKeyValuePair(
                            'dos_stamp',
                            manifest[ i ].dos_stamp
                        );
                    }
                    insertInPlace += '\t},\n';
                }
                insertInPlace += '}';

                // Add the new Report into the Lua table.
                new mw.Api().postWithToken(
                    'csrf',
                    {
                        action: 'edit',
                        bot: true,
                        nocreate: true,
                        summary: editSummary,
                        pageid: 10623919,  // [[Module:Grant_Reports]]
                        text: insertInPlace,
                        contentmodel: 'Scribunto'
                    }
                ).then( function () {
                    dialog.close();

                    /** After saving, show a message box */
                    var messageDialog = new OO.ui.MessageDialog();
                    var windowManager = new OO.ui.WindowManager();

                    $( 'body' ).append( windowManager.$element );
                    // Add the dialog to the window manager.
                    windowManager.addWindows( [ messageDialog ] );

                    // Configure the message dialog when it is opened with the window manager's openWindow() method.
                    windowManager.openWindow( messageDialog, {
                        title: 'Success',
                        message: 'Your grant report was saved successfully!',
                        actions: [
                            {
                                action: 'accept',
                                label: 'Dismiss',
                                flags: 'primary'
                            }
                        ]
                    });

                    // Purge the cache of the page from which the edit was made
                    new mw.Api().postWithToken(
                        'csrf',
                        { action: 'purge', titles: mw.config.values.wgPageName }
                    ).then( function () {
                        location.reload();
                    } );
                } ).catch( function ( error ) {
                    alert( gadgetMsg[ 'failed-to-save-to-lua-table' ] );
                    dialog.close();
                    console.error( error );
                } );
            } );
        };

        /**
         * The dialog / window to be displayed as editor.
         *
         * @param {Object} config
         */
        openWindow = function ( config ) {
            var grantsEditor;
            config.size = 'large';
            grantsEditor = new GrantsEditor( config );

            windowManager = new OO.ui.WindowManager();
            $( 'body' ).append( windowManager.$element );
            windowManager.addWindows( [ grantsEditor ] );
            windowManager.openWindow( grantsEditor );
        };

        $( '.grantReport' ).on( 'click', function () {
            openWindow( {} );
        } );
    }

    // This is called after the module dependencies are ready
    function initAfterModules() {
        new mw.Api().get( {
            action: 'query',
            list: 'messagecollection',
            mcgroup: 'page-Template:I18n/Reports',
            mclanguage: userLang
        } ).then( function ( data ) {
            var i, res, key, val;
            res = data.query.messagecollection;
            for ( i = 0; i < res.length; i++ ) {
                key = res[ i ].key.replace( 'Template:I18n/Reports/', '' );
                val = res[ i ].translation;
                if ( !val ) {
                    // No translation; fall back to English
                    val = res[ i ].definition;
                }
                gadgetMsg[ key ] = val;
            }

            initAfterMessages();
        } ).catch( function ( error ) {
            console.error( error, 'Unable to load translation strings - __GRF__' );
        } );
    }

    mw.loader.using( [
        'mediawiki.api',
        'oojs-ui',
        'oojs-ui-core',
        'oojs-ui.styles.icons-editing-core',
        'ext.gadget.luaparse'
    ] ).then( initAfterModules );

}() );
