/**
 * Financial Reporting Form
 * @author Derick Alangi (WMF)
 */
( function () {
    'use strict';

    var gadgetMsg = {},
        getContentModuleQuery,
        getSandboxContentModuleQuery,
        getRelevantRawEntry,
        parseContentModule,
        openWindow,
        userLang,
        cleanRawEntry,
        windowManager,
        AffiliateLookupTextInputWidget,
        getAffiliatesList,
        queryAffiliatesPage,
        fieldReportLangCode,
        fieldReportInEnglishLink,
        fieldImportedReportDate,
        generateKeyValuePair,
        sanitizeInput,
        sandbox_financial_reports,
        apiObj,
        convertDateToDdMmYyyyFormat;

    var PAGEID = 10624702, // Live mode page ID
        EDITMODE = '';

    userLang = mw.config.get( 'wgUserLanguage' );

    // This is called after translation messages are ready
    function initAfterMessages() {
        /**
         * Provides API parameters for getting the content from [[Module:Financial_Reports]]
         *
         * @return {Object}
         */
        getContentModuleQuery = function () {
            return {
                action: 'query',
                prop: 'revisions',
                titles: 'Module:Financial_Reports',
                rvprop: 'content',
                rvlimit: 1
            };
        };

        /**
         * Provides API parameters for getting the content from
         * [[Module:Financial_Reports/Sandbox]]
         *
         * @return {Object}
         */
        getSandboxContentModuleQuery = function () {
            return {
                action: 'query',
                prop: 'revisions',
                titles: 'Module:Financial_Reports/Sandbox',
                rvprop: 'content',
                rvlimit: 1
            };
        };

        /**
         * Convert date to DD/MM/YYYY format
         * @param {string} date
         *
         * @return {string} date
         */
        convertDateToDdMmYyyyFormat = function ( date ) {
            // Put in a format our lua script will feed on, in DD/MM/YYYY format
            date = date.split('-');
            date = date[2] + "/" + date[1] + "/" + date[0];

            return date;
        };

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
            var res;
            res = '\t\t'.concat( k, ' = ' );

            v = sanitizeInput( v );
            v = v.replace( /'/g, '\\\'' );
            res += '\'' + v + '\'';

            res += ',\n';
            return res;
        };

        /**
         * Takes Lua-formatted content from [[Module:Financial_Reports]] content and
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
         * Loops through the abstract syntax tree and returns a
         * specific requested entry
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
                        entries[ i ].value.fields[ j ].key.name === 'unique_id'
                        && entries[ i ].value.fields[ j ].value.value === uniqueId
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
                entryData[ relevantRawEntry[ i ].key.name ] = relevantRawEntry[ i ].value.value;
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
                    var affiliates,
                        affiliatesContent;

                    affiliatesContent = getAffiliatesList( data.query.pages );
                    affiliates = affiliatesContent.split( ',\n' );
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
                affiliate = affiliate.split( ' ~ ' )[ 0 ];
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
         * @class FinancialEditor
         * @extends OO.ui.ProcessDialog
         *
         * @constructor
         * @param {Object} config
         */
        function FinancialEditor( config ) {
            this.group_name = '';
            this.report_type = '';
            this.total_budget = '';
            this.total_expense = '';
            this.currency = '';
            this.report_link = '';
            this.start_date = '';
            this.end_date = '';
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
            if ( config.total_budget ) {
                this.total_budget = config.total_budget;
            }
            if ( config.total_expense ) {
                this.total_expense = config.total_expense;
            }
            if ( config.currency ) {
                this.currency = config.currency;
            }
            if ( config.report_link ) {
                this.report_link = config.report_link;
            }
            if ( config.start_date ) {
                this.start_date = config.start_date;
            }
            if ( config.end_date ) {
                this.end_date = config.end_date;
            }
            if ( config.imported_report_date ) {
                this.imported_report_date = config.imported_report_date;
            }
            if ( config.dos_stamp ) {
                this.dos_stamp = config.dos_stamp;
            }
            FinancialEditor.super.call( this, config );
        }
        OO.inheritClass( FinancialEditor, OO.ui.ProcessDialog );

        FinancialEditor.static.name = 'financialEditor';
        FinancialEditor.static.title = gadgetMsg[ 'financial-report-header' ];
        FinancialEditor.static.actions = [
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
        FinancialEditor.prototype.initialize = function () {
            var dialog,
                i,
                fieldMultiyear,
                tempReportType;

            dialog = this;

            /* Get today's date and time in YYYY-MM-DDTHH:MM:SSZ */
            /* format. dos stands for "date of submission" */
            this.dos_stamp = new Date().toISOString();

            FinancialEditor.super.prototype.initialize.call( this );
            this.content = new OO.ui.PanelLayout( {
                padded: true,
                expanded: false
            } );
            // Popup to be used after form validation
            this.fieldPopup = new OO.ui.PopupWidget( {
                $content: $( '<p style="color: red; text-align: center;">Error! Some required fields are not filled yet. Check and try submitting again.</p>' ),
                padded: true,
                width: 400,
                height: 90,
                head: true,
                classes: [ 'wadp-popup-widget-position' ]
            } );
            this.fieldGroupName = new AffiliateLookupTextInputWidget();
            tempReportType = this.fieldReportType = new OO.ui.DropdownInputWidget( {
                options: [
                    {
                        data: 'Annual Financial Report',
                        label: gadgetMsg[ 'annual-financial-report' ]
                    },
                    {
                        // TO-DO: Use translation string solution
                        // do listen to on-change event for added
                        // options below.
                        data: 'Multi-year Financial Report',
                        label: 'Multi-year Financial Report'
                    }
                ]
            } );

            fieldMultiyear = this.fieldMultiyear = new OO.ui.DropdownInputWidget( {
                options: [
                    {
                        data: '2yrs report',
                        label: gadgetMsg[ 'two-years-report' ]
                    },
                    {
                        data: '3yrs report',
                        label: gadgetMsg[ 'three-years-report' ]
                    },
                    {
                        data: '4yrs report',
                        label: gadgetMsg[ 'four-years-report' ]
                    },
                    {
                        data: '5yrs report',
                        label: gadgetMsg[ 'five-years-report' ]
                    }
                ]
            } );
            fieldMultiyear.toggle();
            tempReportType.on( 'change', function () {
                if ( tempReportType.getValue() === 'Multi-year Financial Report'  ) {
                    fieldMultiyear.toggle( true );
                } else {
                    fieldMultiyear.toggle( false );
                }
            } );

            this.fieldTotalBudget = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.total_budget,
                indicator: 'required',
                required: true,
                placeholder: gadgetMsg[ 'total-budget-placeholder' ]
            } );
            this.fieldTotalExpense = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.total_expense,
                indicator: 'required',
                required: true,
                placeholder: gadgetMsg[ 'total-expense-placeholder' ]
            } );
            this.fieldCurrency = new OO.ui.TextInputWidget( {
                value: this.currency,
                indicator: 'required',
                required: true,
                placeholder: gadgetMsg[ 'currency-placeholder' ]
            } );
            this.fieldReportLink = new OO.ui.TextInputWidget( {
                type: 'url',
                icon: 'link',
                value: this.report_link,
                indicator: 'required',
                required: true,
                placeholder: gadgetMsg[ 'report-link-placeholder' ]
            } );
            this.fieldReportNotInEnglish = new OO.ui.CheckboxInputWidget( {
            } );
            fieldReportLangCode = this.fieldReportLangCode = new OO.ui.TextInputWidget( {
                placeholder: gadgetMsg[ 'lang-code-for-financial-report' ]
            } );
            fieldReportInEnglishLink = this.fieldReportInEnglishLink = new OO.ui.TextInputWidget( {
                icon: 'link',
                placeholder: gadgetMsg[ 'url-for-financial-report-in-english' ]
            } );
            fieldReportLangCode.toggle();
            fieldReportInEnglishLink.toggle();
            this.fieldReportNotInEnglish.on( 'change', function ( isSelected ) {
                var makeVisible = isSelected;
                fieldReportLangCode.toggle( makeVisible );
                fieldReportInEnglishLink.toggle( makeVisible );
            } );
            this.fieldStartDate = new mw.widgets.DateInputWidget( {
                icon: 'calendar',
                value: this.start_date,
                classes: [ 'full-width' ],
                placeholderLabel: gadgetMsg[ 'start-date-placeholder' ],
                required: true
            } );
            this.fieldEndDate = new mw.widgets.DateInputWidget( {
                icon: 'calendar',
                value: this.end_date,
                classes: [ 'full-width' ],
                placeholderLabel: gadgetMsg[ 'end-date-placeholder' ],
                required: true
            } );

            this.fieldSandboxReport = new OO.ui.CheckboxInputWidget( {
            } );
            this.fieldSandboxReport.on( 'change', function ( isSelected ) {
                if ( isSelected ) {
                    EDITMODE = 'sandbox';
                } else {
                    EDITMODE = '';
                }
            } );

            this.fieldImportedReportCB = new OO.ui.CheckboxInputWidget( {
            } );
            fieldImportedReportDate = this.fieldImportedReportDate = new mw.widgets.DateInputWidget( {
                classes: [ 'full-width' ],
                value: this.imported_report_date,
                placeholderLabel: gadgetMsg[ 'import-date' ]
            } );
            fieldImportedReportDate.toggle();
            this.fieldImportedReportCB.on( 'change', function ( isSelected ) {
                fieldImportedReportDate.toggle( isSelected );
            } );

            // Append things to fieldSet
            this.fieldSet = new OO.ui.FieldsetLayout( {
                items: [
                    new OO.ui.FieldLayout(
                        this.fieldPopup, {}
                    ),
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
                            label: gadgetMsg[ 'your-financial-report-type' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldMultiyear,
                        {
                            align: 'inline',
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
                        this.fieldTotalExpense,
                        {
                            label: gadgetMsg[ 'total-expense' ],
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
                        this.fieldReportNotInEnglish,
                        {
                            label: gadgetMsg[ 'financial-report-not-in-english-label' ],
                            align: 'inline',
                            help: gadgetMsg[ 'financial-report-checkbox-help-tip' ]
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldReportLangCode,
                        {
                            align: 'inline',
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldReportInEnglishLink,
                        {
                            align: 'inline',
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
                        this.fieldSandboxReport,
                        {
                            label: gadgetMsg[ 'sandbox-report' ],
                            align: 'inline',
                            help: gadgetMsg[ 'sandbox-tip' ]
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
        FinancialEditor.prototype.getBodyHeight = function () {
            return 600;
        };

        /**
         * In the event "Select" is pressed
         *
         */
        FinancialEditor.prototype.getActionProcess = function ( action ) {
            var dialog = this, allRequiredFieldsAvailable = false;

            if (
                dialog.fieldGroupName.getValue() &&
                dialog.fieldTotalBudget.getValue() &&
                dialog.fieldTotalExpense.getValue() &&
                dialog.fieldReportLink.getValue() &&
                dialog.fieldStartDate.getValue() &&
                dialog.fieldEndDate.getValue()
            ) {
                allRequiredFieldsAvailable = true;
            }

            if ( allRequiredFieldsAvailable && action === 'continue' ) {
                return new OO.ui.Process( function () {
                    dialog.saveItem();
                } );
            } else if ( !allRequiredFieldsAvailable && action === 'continue' ) {
                return new OO.ui.Process( function () {
                    dialog.fieldPopup.toggle( true );
                } );
            } else {
                return new OO.ui.Process( function () {
                    dialog.close();
                } );
            }
        };

        /**
         * Save the changes to [[Module:Financial_Reports]] page.
         */
        FinancialEditor.prototype.saveItem = function ( deleteFlag ) {
            var dialog = this;

            dialog.pushPending();

            apiObj = new mw.Api();
            apiObj.get( getSandboxContentModuleQuery() ).then( function ( data ) {
                sandbox_financial_reports = data;
            } );

            apiObj.get( getContentModuleQuery() ).then( function ( data ) {
                var i,
                    insertInPlace,
                    processWorkingEntry,
                    editSummary,
                    manifest = [],
                    workingEntry,
                    entries;

                /**
                 * Compares a given [[Module:Financial_Reports]] entry against the edit fields
                 * and applies changes where relevant.
                 *
                 * @param {Object} workingEntry the entry being worked on
                 * @return {Object} The same entry but with modifications
                 */
                processWorkingEntry = function ( workingEntry ) {
                    if ( dialog.fieldGroupName.getValue() ) {
                        workingEntry.group_name = dialog.fieldGroupName.getValue().split( ' ~ ' )[ 0 ];
                    } else if ( !dialog.fieldGroupName.getValue() && workingEntry.group_name ) {
                        delete workingEntry.group_name;
                    }

                    if ( dialog.fieldReportType.getValue() === 'Annual Financial Report' ) {
                        workingEntry.report_type = dialog.fieldReportType.getValue();
                    } else if ( dialog.fieldReportType.getValue() === 'Multi-year Financial Report' ) {
                        workingEntry.report_type = dialog.fieldReportType.getValue();
                        workingEntry.multiyear_duration = dialog.fieldMultiyear.getValue();
                    } else if ( !dialog.fieldReportType.getValue() && workingEntry.report_type ) {
                        delete workingEntry.report_type;
                    }

                    if ( dialog.fieldTotalBudget.getValue() ) {
                        workingEntry.total_budget = dialog.fieldTotalBudget.getValue();
                    } else if ( !dialog.fieldTotalBudget.getValue() && workingEntry.total_budget ) {
                        delete workingEntry.total_budget;
                    }

                    if ( dialog.fieldTotalExpense.getValue() ) {
                        workingEntry.total_expense = dialog.fieldTotalExpense.getValue();
                    } else if ( !dialog.fieldTotalExpense.getValue() && workingEntry.total_expense ) {
                        delete workingEntry.total_expense;
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

                    if ( dialog.fieldStartDate.getValue() ) {
                        workingEntry.start_date = convertDateToDdMmYyyyFormat( dialog.fieldStartDate.getValue() );
                    } else if ( !dialog.fieldStartDate.getValue() && workingEntry.start_date ) {
                        delete workingEntry.start_date;
                    }

                    if ( dialog.fieldEndDate.getValue() ) {
                        workingEntry.end_date = convertDateToDdMmYyyyFormat( dialog.fieldEndDate.getValue() );
                    } else if ( !dialog.fieldEndDate.getValue() && workingEntry.end_date ) {
                        delete workingEntry.end_date;
                    }

                    if ( dialog.fieldReportLangCode.getValue() ) {
                        workingEntry.report_lang_code = dialog.fieldReportLangCode.getValue();
                    } else if ( !dialog.fieldReportLangCode.getValue() && workingEntry.report_lang_code ) {
                        delete workingEntry.report_lang_code;
                    }

                    if ( dialog.fieldReportInEnglishLink.getValue() ) {
                        workingEntry.report_link_en = dialog.fieldReportInEnglishLink.getValue();
                    } else if ( !dialog.fieldReportInEnglishLink.getValue() && workingEntry.report_link_en ) {
                        delete workingEntry.report_link_en;
                    }

                    if ( dialog.fieldSandboxReport.isSelected() ) {
                        PAGEID = 11018946; // Set page id to [[m:Module:Financial_Reports/Sandbox]]
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
                // entry, that entry will be modified in place. Also, edit sandbox table
                // instead if we're editing in 'sandbox' mode
                if ( EDITMODE === 'sandbox' ) {
                    entries = parseContentModule( sandbox_financial_reports.query.pages );
                } else {
                    entries = parseContentModule( data.query.pages );
                }

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
                    editSummary = gadgetMsg[ 'added-new-financial-report' ] + ' ' + workingEntry.group_name;
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
                    if ( manifest[ i ].multiyear_duration ) {
                        insertInPlace += generateKeyValuePair(
                            'multiyear_duration',
                            manifest[ i ].multiyear_duration
                        );
                    }
                    if ( manifest[ i ].total_budget ) {
                        insertInPlace += generateKeyValuePair(
                            'total_budget',
                            manifest[ i ].total_budget
                        );
                    }
                    if ( manifest[ i ].total_expense ) {
                        insertInPlace += generateKeyValuePair(
                            'total_expense',
                            manifest[ i ].total_expense
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
                            manifest[ i ].report_link.trim()
                        );
                    }
                    if ( manifest[ i ].report_lang_code ) {
                        insertInPlace += generateKeyValuePair(
                            'report_lang_code',
                            manifest[ i ].report_lang_code.toLowerCase()
                        );
                    }
                    if ( manifest[ i ].report_link_en ) {
                        insertInPlace += generateKeyValuePair(
                            'report_link_en',
                            manifest[ i ].report_link_en.trim()
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
                apiObj.postWithToken(
                    'csrf',
                    {
                        action: 'edit',
                        bot: true,
                        nocreate: true,
                        summary: editSummary,
                        pageid: PAGEID,  // Live page or Sandbox based on edit mode
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
                        title: gadgetMsg[ 'success-message' ],
                        message: gadgetMsg[ 'financial-report-saved' ],
                        actions: [
                            {
                                action: 'accept',
                                label: 'Dismiss',
                                flags: 'primary'
                            }
                        ]
                    });

                    // Purge the cache of the page from which the edit was made
                    apiObj.postWithToken(
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
            var financialEditor;
            config.size = 'large';
            financialEditor = new FinancialEditor( config );

            windowManager = new OO.ui.WindowManager();
            $( 'body' ).append( windowManager.$element );
            windowManager.addWindows( [ financialEditor ] );
            windowManager.openWindow( financialEditor );
        };

        $( '.financialReport' ).on( 'click', function() {
            // First check if the user is logged in
            if ( mw.config.get ( 'wgUserName' ) === null ) {
                alert( gadgetMsg[ 'you-need-to-log-in' ] );
            } else {
                openWindow( {} );
            }
        } );
    }

    // This is called after module dependencies are ready
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
            console.error( error, 'Unable to load translation strings - __FRF__' );
        } );
    }

    mw.loader.using( [
        'mediawiki.api',
        'oojs-ui',
        'oojs-ui-core',
        'oojs-ui.styles.icons-editing-core',
        'ext.gadget.luaparse',
        'mediawiki.widgets.DateInputWidget'
    ] ).then( initAfterModules );

}() );
