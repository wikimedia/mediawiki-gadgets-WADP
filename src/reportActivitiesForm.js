/**
 * Annual Activities Reporting Form
 * @author Derick Alangi (WMF)
 */
( function () {
    'use strict';

    mw.loader.using( [
        'mediawiki.api',
        'oojs-ui',
        'oojs-ui-core',
        'oojs-ui.styles.icons-editing-core',
        'ext.gadget.luaparse',
        'mediawiki.widgets.DateInputWidget'
    ] ).done( function () {
        var gadgetMsg,
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
            fieldReportLangCode,
            fieldReportInEnglishLink,
            fieldPartnershipOther,
            fieldPartnershipOtherInput,
            sanitizeInput,
            generateKeyValuePair,
            getSandboxContentModuleQuery,
            sandbox_activities_reports,
            apiObj,
            convertDateToDdMmYyyyFormat;

        var PAGEID = 10624730, // Live mode page ID
            EDITMODE = '';

        userLang = mw.config.get( 'wgUserLanguage' );
        if ( userLang === 'en' ) {
            userLang = 'en-foo'; // quick hack fix
        }
        new mw.Api().get( {
            action: 'query',
            list: 'messagecollection',
            mcgroup: 'page-Template:I18n/Reports',
            mclanguage: userLang
        } ).done( function ( data ) {

            var i, res, key, val, gadgetMsg = {};
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

            /**
             * Provides API parameters for getting the content from [[Module:Activities_Reports]]
             *
             * @return {Object}
             */
            getContentModuleQuery = function () {
                return {
                    action: 'query',
                    prop: 'revisions',
                    titles: 'Module:Activities_Reports',
                    rvprop: 'content',
                    rvlimit: 1
                };
            };

            /**
             * Provides API parameters for getting the content from
             * [[Module:Activities_Reports/Sandbox]]
             *
             * @return {Object}
             */
            getSandboxContentModuleQuery = function () {
                return {
                    action: 'query',
                    prop: 'revisions',
                    titles: 'Module:Activities_Reports/Sandbox',
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
             * Takes Lua-formatted content from [[Module:Activities_Reports]] content and
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
             * Loops through the abstract syntax tree and returns a specific
             * requested entry.
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
                var items = [],
                    i,
                    affiliate;

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
             * @class ActivitiesEditor
             * @extends OO.ui.ProcessDialog
             *
             * @constructor
             * @param {Object} config
             */
            function ActivitiesEditor( config ) {
                this.group_name = '';
                this.report_type = '';
                this.start_date = '';
                this.end_date = '';
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
                ActivitiesEditor.super.call( this, config );
            }
            OO.inheritClass( ActivitiesEditor, OO.ui.ProcessDialog );

            ActivitiesEditor.static.name = 'activitiesEditor';
            ActivitiesEditor.static.title = gadgetMsg[ 'activities-report-header' ];
            ActivitiesEditor.static.actions = [
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
            ActivitiesEditor.prototype.initialize = function () {
                var dialog,
                    i,
                    fieldPartnershipInfoSelected,
                    fieldArMultiyear,
                    tmpReportType;

                dialog = this;

                ActivitiesEditor.super.prototype.initialize.call( this );
                this.content = new OO.ui.PanelLayout( {
                    padded: true,
                    expanded: false
                } );
                this.fieldGroupName = new AffiliateLookupTextInputWidget();
                tmpReportType = this.fieldReportType = new OO.ui.DropdownInputWidget( {
                    options: [
                        {
                            data: 'Annual Activities Report',
                            label: gadgetMsg[ 'annual-activities-report' ]
                        },
                        {
                            data: 'Monthly Activities Report',
                            label: gadgetMsg[ 'monthly-activities-report' ]
                        },
                        {
                            data: 'Multi-year Activities Report',
                            label: gadgetMsg[ 'multi-year-activities-report' ]
                        },
                        {
                            data: 'Quarterly Activities Report',
                            label: gadgetMsg[ 'quarterly-activities-report' ]
                        }
                    ]
                } );
                fieldArMultiyear = this.fieldMultiyear = new OO.ui.DropdownInputWidget( {
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
                fieldArMultiyear.toggle();
                tmpReportType.on('change', function ( isSelected) {
                    if ( tmpReportType.getValue() === 'Multi-year Activities Report'  ) {
                        fieldArMultiyear.toggle(true);
                    } else {
                        fieldArMultiyear.toggle(false);
                    }
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
                    placeholder: gadgetMsg[ 'lang-code-for-activity-report' ]
                } );
                fieldReportInEnglishLink = this.fieldReportInEnglishLink = new OO.ui.TextInputWidget( {
                    icon: 'link',
                    placeholder: gadgetMsg[ 'url-for-activity-report-in-english' ]
                } );
                fieldReportLangCode.toggle();
                fieldReportInEnglishLink.toggle();
                this.fieldReportNotInEnglish.on( 'change', function ( isSelected ) {
                    var makeVisible = isSelected;
                    fieldReportLangCode.toggle( makeVisible );
                    fieldReportInEnglishLink.toggle( makeVisible );
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
                fieldPartnershipOther.on( 'change', function ( isSelected ) {
                    fieldPartnershipOtherInput.toggle( isSelected );
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
                                label: gadgetMsg[ 'your-activity-report-type' ],
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
                            this.fieldReportLink,
                            {
                                label: gadgetMsg[ 'report-link' ],
                                align: 'top'
                            }
                        ),
                        new OO.ui.FieldLayout(
                            this.fieldReportNotInEnglish,
                            {
                                label: gadgetMsg[ 'activity-report-not-in-english-label' ],
                                align: 'inline',
                                help: gadgetMsg[ 'activity-report-checkbox-help-tip' ]
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
            ActivitiesEditor.prototype.getBodyHeight = function () {
                return 550;
            };

            /**
             * In the event "Select" is pressed
             *
             */
            ActivitiesEditor.prototype.getActionProcess = function ( action ) {
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
            };

            /**
             * Save the changes to [[Module:Activities_Reports]] or [[Module:Activities_Reports/Sandbox]] page.
             */
            ActivitiesEditor.prototype.saveItem = function ( deleteFlag ) {
                var dialog = this, content;

                dialog.pushPending();
                apiObj = new mw.Api();

                apiObj.get( getSandboxContentModuleQuery() ).done( function ( data ) {
                    sandbox_activities_reports = data;
                } );

                apiObj.get( getContentModuleQuery() ).done( function ( data ) {
                    var i, insertInPlace, processWorkingEntry, editSummary,
                        manifest = [], workingEntry, entries;

                    /**
                     * Compares entries against the edit fields and applies changes
                     * where relevant.
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

                        if ( dialog.fieldReportType.getValue() === 'Multi-year Financial Report' ) {
                            workingEntry.report_type = dialog.fieldReportType.getValue();
                            workingEntry.multiyear_duration = dialog.fieldMultiyear.getValue();
                        } else if ( !dialog.fieldReportType.getValue() && workingEntry.report_type ) {
                            delete workingEntry.report_type;
                        } else {
                            workingEntry.report_type = dialog.fieldReportType.getValue();
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

                        if ( dialog.fieldReportLink.getValue() ) {
                            workingEntry.report_link = dialog.fieldReportLink.getValue();
                        } else if ( !dialog.fieldReportLink.getValue() && workingEntry.report_link ) {
                            delete workingEntry.report_link;
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

                        if ( dialog.fieldSandboxReport.isSelected() ) {
                            PAGEID = 11019248; // Set page id to [[m:Module:Activities_Reports/Sandbox]]
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
                        entries = parseContentModule( sandbox_activities_reports.query.pages );
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
                        editSummary = gadgetMsg[ 'added-new-activities-report' ] + ' ' + workingEntry.group_name;
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
                                manifest[ i ].group_name.trim()
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
                    apiObj.postWithToken(
                        'csrf',
                        {
                            action: 'edit',
                            nocreate: true,
                            summary: editSummary,
                            pageid: PAGEID,
                            text: insertInPlace,
                            contentmodel: 'Scribunto'
                        }
                    ).done( function () {

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
                            message: gadgetMsg[ 'activity-report-saved' ],
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
                        ).done( function () {
                            location.reload();
                        } );
                    } ).fail( function () {
                        alert( gadgetMsg[ 'failed-to-save-to-lua-table' ] );
                        dialog.close();
                    } );
                } );
            };

            /**
             * The dialog / window to be displayed as editor.
             *
             * @param {Object} config
             */
            openWindow = function ( config ) {
                var activitiesEditor;
                config.size = 'large';
                activitiesEditor = new ActivitiesEditor( config );

                windowManager = new OO.ui.WindowManager();
                $( 'body' ).append( windowManager.$element );
                windowManager.addWindows( [ activitiesEditor ] );
                windowManager.openWindow( activitiesEditor );
            };

            $( '.activitiesReport' ).on( 'click', function () {
                // First check if the user is logged in
                if ( mw.config.get ( 'wgUserName' ) === null ) {
                    alert( gadgetMsg[ 'you-need-to-log-in' ] );
                } else {
                    openWindow( {} );
                }
            } );
        } ).fail( function() {
            alert( gadgetMsg[ 'gadget-failed-to-load-translation-strings' ] );
        } );
    } );
}() );
