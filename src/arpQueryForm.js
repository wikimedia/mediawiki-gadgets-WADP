/**
 * Wikimedia Affiliates Data Portal Query Form UI (formerly
 * know as Affiliate Reporting Portal (ARP)). WADP and ARP
 * would/can be used interchangeably when referring to this
 * system.
 *
 * This is loaded from <https://meta.wikimedia.org/wiki/MediaWiki:Gadget-reportEditor.js>.
 *
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
        var userLang,
            openBasicWindow,
            openSubWindow,
            openLeafWindow,
            openAdvanceWindow,
            windowManager,
            getOrgInfoContentModuleQuery,
            parseContentModule,
            cleanRawEntry,
            /* Cache `counter` variable */ counter = 0,
            clearCounter,
            luaTableCounter,
            luaTableCounterForAffiliateType,
            luaTableCounterByAffiliateRegion,
            /* Cache `percentage` variable */ percentage = 0,
            getActivitiesReportsContentModuleQuery,
            /*
             * Keep track of query information in the format:
             *   code - the query code e.g. ARP-Q6
             *   label - the query label to render in sub-window
             *   results - the query results to render in the sub-window
             */
            queryInfo = [],
            leafWindowResults,
            streamDataCache,
            sanitizeInput,
            generateKeyValuePair,
            AffiliateLookupTextInputWidget,
            getAffiliatesList,
            queryAffiliatesPage,
            queryCountriesPage,
            getContentList,
            CountryLookupTextInputWidget;

        userLang = mw.config.get( 'wgUserLanguage' );
        if ( userLang === 'en' ) {
            userLang = 'en-foo'; // quick hack fix
        }
        new mw.Api().get( {
            action: 'query',
            list: 'messagecollection',
            /** TODO: Move to 'page-Template:I18n/WADP' */
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
             * Provides API parameters for getting the content from
             * [[Module:Organizational_Informations]].
             *
             * @return {Object}
             */
            getOrgInfoContentModuleQuery = function () {
                return {
                    action: 'query',
                    prop: 'revisions',
                    titles: 'Module:Organizational_Informations',
                    rvprop: 'content',
                    rvlimit: 1
                };
            };

            /**
             * Provides API parameters for getting the content from
             * [[Module:Activities_Reports]].
             *
             * @return {Object}
             */
            getActivitiesReportsContentModuleQuery = function () {
                return {
                    action: 'query',
                    prop: 'revisions',
                    titles: 'Module:Activities_Reports',
                    rvprop: 'content',
                    rvlimit: 1
                };
            };

            /**
             * Takes Lua-formatted content from [[Module:Organizational_Informations]]
             * and returns an abstract syntax tree.
             *
             * @param {Object} sourceblob The original API return
             * @return {Object} Abstract Syntax Tree
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
             * A method to count entries in a Lua table given the AST object
             * NOTE: If you use this method and use `counter` in the same caller,
             * invalidate `counter` first e.g. `counter = 0` before using it as
             * it's a cache variable.
             *
             * @param {Object} luaTable AST tree (Lua Table)
             * @return {Object} Count
             */
            luaTableCounter = function ( luaTable ) {
                var entry;
                clearCounter(); // Always clear cache first!

                for ( i = 0; i < luaTable.length; i++ ) {
                    entry = cleanRawEntry( luaTable[ i ].value.fields );
                    if ( entry.org_type !== 'Allied or other organization' && entry.recognition_status !== 'derecognised' ) {
                        counter = counter + 1;
                    }
                }

                return counter;
            };

            /**
             * A method to count entries in a Lua table given the AST object based
             * on the affiliate type passed as argument to the method.
             * NOTE: If you use this method and use `counter` in the same caller,
             * invalidate `counter` first e.g. `counter = 0` before using it as
             * it's a cache variable.
             *
             * @param {Object} entries AST tree (Lua Table)
             * @param {String} type The affiliate type e.g. Chapter, User Group etc.
             * @return {Object} Count
             */
            luaTableCounterForAffiliateType = function ( entries, type ) {
                var entry;
                clearCounter(); // Always clear cache first!

                for ( i = 0; i < entries.length; i++ ) {
                    entry = cleanRawEntry( entries[ i ].value.fields );
                    if ( entry.org_type === type && entry.recognition_status !== 'derecognised' ) {
                        counter = counter + 1;
                    }
                }

                return counter;
            };

            /**
             * A method to count entries in a Lua table given the AST object based
             * on the affiliate region passed as argument to the method.
             * NOTE: If you use this method and use `counter` in the same caller,
             * invalidate `counter` first e.g. `counter = 0` before using it as
             * it's a cache variable.
             *
             * @param {Object} entries AST tree (Lua Table)
             * @param {String} region The affiliate region e.g. Asia, Africa etc.
             * @return {Object} Count
             */
            luaTableCounterByAffiliateRegion = function ( entries, region ) {
                var entry, member_count = 0;
                clearCounter(); // Always clear cache first!

                for ( i = 0; i < entries.length; i++ ) {
                    entry = cleanRawEntry( entries[ i ].value.fields );
                    member_count = parseInt( entry.member_count );
                    if ( entry.region === region && member_count > 0 && entry.recognition_status !== 'derecognised' ) {
                        counter = counter + member_count;
                    }
                }

                return counter;
            };

            /**
             * Utility method to clear `counter` cache value
             */
            clearCounter = function () {
                counter = 0;
            };

            /**
             * Take a raw entry from the abstract syntax tree and make it an object
             * that is easier to work with.
             *
             * @param {Object} relevantRawEntry the raw entry from the AST
             * @return {Object} The cleaned up object
             */
            cleanRawEntry = function ( relevantRawEntry ) {
                var entryData = {}, i, j;

                for ( i = 0; i < relevantRawEntry.length; i++ ) {
                    if ( relevantRawEntry[ i ].key.name === 'dm_structure' ) {
                        entryData.dm_structure = [];
                        for (
                            j = 0;
                            j < relevantRawEntry[ i ].value.fields.length;
                            j++
                        ) {
                            entryData.dm_structure.push(
                                relevantRawEntry[ i ].value.fields[ j ].value.value
                            );
                        }
                    } else if ( relevantRawEntry[ i ].key.name === 'partnership_info' ) {
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
             * Provides API parameters for getting the content from
             * [[m:Wikimedia_Affiliates_Data_Portal/MRL/List_Of_All_Countries]]
             *
             * @return {Object}
             */
            queryCountriesPage = function () {
                return {
                    action: 'query',
                    prop: 'revisions',
                    titles: 'Wikimedia_Affiliates_Data_Portal/MRL/List_Of_All_Countries',
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
            AffiliateLookupTextInputWidget = function AffiliatesLookupTextInputWidget() {
                // Parent constructor
                OO.ui.TextInputWidget.call( this, $.extend(
                    {
                        indicator: 'required',
                        required: true,
                        validate: 'text',
                        placeholder: gadgetMsg[ 'group-name-placeholder' ]
                    } ) );
                // Mixin constructors
                OO.ui.mixin.LookupElement.call( this );
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
             * Method to lookup affiliate countries names from
             * [[m:Wikimedia_Affiliates_Data_Portal/MRL/List_Of_All_Countries]]
             * and to be used as autocomplete form element in the OI form.
             */
            CountryLookupTextInputWidget = function CountriesLookupTextInputWidget() {
                // Parent constructor
                OO.ui.TextInputWidget.call( this, $.extend(
                    {
                        indicator: 'required',
                        id: 'country',
                        required: true,
                        validate: 'text',
                        placeholder: gadgetMsg[ 'affiliate-country-placeholder' ]
                    }
                ) );
                // Mixin constructors
                OO.ui.mixin.LookupElement.call( this );
            };
            OO.inheritClass( CountryLookupTextInputWidget, OO.ui.TextInputWidget );
            OO.mixinClass( CountryLookupTextInputWidget, OO.ui.mixin.LookupElement );

            /* Get a new request object of the current lookup query value. */
            CountryLookupTextInputWidget.prototype.getLookupRequest = function () {
                var value = this.getValue();
                return this.getValidity().then( function () {
                    // Query the API to get the list of countries
                    return new mw.Api().get( queryCountriesPage() ).then( function ( data ) {
                        var countries, countriesContent;
                        countriesContent = getContentList( data.query.pages );
                        countries = countriesContent.split(',\n');

                        // Filter to only countries whose names contain the input (case-insensitive)
                        countries = countries.filter( function ( v ) {
                            return v.toLowerCase().indexOf( value.toLowerCase() ) !== -1;
                        } );

                        return countries;
                    } );
                }, function () {
                    // No results when the input contains invalid content
                    return [];
                } );
            };

            /* Pre-process data returned by the request from #getLookupRequest(). */
            CountryLookupTextInputWidget.prototype.getLookupCacheDataFromResponse = function ( response ) {
                return response || [];
            };

            /**
             * Get a list of menu option widgets from the (possibly cached) data
             * returned by #getLookupCacheDataFromResponse().
             */
            CountryLookupTextInputWidget.prototype.getLookupMenuOptionsFromData = function ( data ) {
                var items = [], i, country;

                for ( i = 0; i < data.length; i++ ) {
                    country = String( data[ i ] );
                    items.push( new OO.ui.MenuOptionWidget( {
                        data: country,
                        label: country
                    } ) );
                }

                return items;
            };

            /********************** Leaf QP Windows **************************/
            /**
             * Subclass ProcessDialog
             *
             * @class ArpSubQueryLeafWindow
             * @extends OO.ui.ProcessDialog
             *
             * @constructor
             * @param {Object} config
             */
            function ArpSubQueryLeafWindow( config ) {
                ArpSubQueryLeafWindow.super.call( this, config );
            }
            OO.inheritClass( ArpSubQueryLeafWindow, OO.ui.ProcessDialog );

            ArpSubQueryLeafWindow.static.name = gadgetMsg[ 'wad-query-result' ];
            ArpSubQueryLeafWindow.static.title = gadgetMsg[ 'wad-query-result' ];
            ArpSubQueryLeafWindow.static.actions = [
                {
                    action: 'continue',
                    modes: 'edit',
                    label: gadgetMsg[ 'back-to-home' ],
                    flags: [ 'primary', 'constructive' ]
                },
                {
                    action: 'cancel',
                    modes: 'edit',
                    label: gadgetMsg[ 'dismiss' ],
                    flags: 'safe'
                },
                /**{
					action: 'delete',
					modes: 'edit',
					label: 'Download to CSV',
					flags: 'safe',
					icons: [ 'progressive' ]
				},*/
            ];

            /**
             * Set custom height for the modal sub window
             */
            ArpSubQueryLeafWindow.prototype.getBodyHeight = function () {
                return 380;
            };

            /**
             * In the event "Select" is pressed for sub-query window
             */
            ArpSubQueryLeafWindow.prototype.getActionProcess = function ( action ) {
                var dialog = this;
                if ( action === 'continue' ) {
                    dialog.close();
                    openBasicWindow( {} );
                } /** Disable logic for now!
                 else if ( action === 'delete' ) {
					var file;
					file = fopen( "results.csv", 3 );
					fwrite( file, streamDataCache );
				}*/ else {
                    return new OO.ui.Process( function () {
                        dialog.close();
                    } );
                }
            };

            ArpSubQueryLeafWindow.prototype.initialize = function () {
                ArpSubQueryLeafWindow.super.prototype.initialize.call( this );
                this.content = new OO.ui.PanelLayout( {
                    padded: true,
                    expanded: false
                } );

                this.$body.append( '<div style="padding-left: 30px;"><p>' + leafWindowResults + '</p></div>' );

                // When everything is done
                this.$body.append( this.content.$element );

                // Clear cache
                leafWindowResults = '';
                streamDataCache = '';
            };


            /********************** Sub QP Windows **************************/
            /**
             * Subclass ProcessDialog
             *
             * @class ArpSubQueryForm
             * @extends OO.ui.ProcessDialog
             *
             * @constructor
             * @param {Object} config
             */
            function ArpSubQueryForm( config ) {
                ArpSubQueryForm.super.call( this, config );
            }
            OO.inheritClass( ArpSubQueryForm, OO.ui.ProcessDialog );

            ArpSubQueryForm.static.name = gadgetMsg[ 'wad-sub-query-form-name' ];
            ArpSubQueryForm.static.title = gadgetMsg[ 'wad-query-result' ];
            ArpSubQueryForm.static.actions = [
                {
                    action: 'continue',
                    modes: 'edit',
                    label: gadgetMsg[ 'run-another-query' ],
                    flags: [ 'primary', 'constructive' ]
                },
                {
                    action: 'cancel',
                    modes: 'edit',
                    label: gadgetMsg[ 'dismiss' ],
                    flags: 'safe'
                },
                {
                    action: 'delete',
                    modes: 'edit',
                    label: gadgetMsg[ 'back-to-home' ],
                    flags: 'safe',
                    icons: [ 'progressive' ]
                },
            ];

            /**
             * Set custom height for the modal sub window
             */
            ArpSubQueryForm.prototype.getBodyHeight = function () {
                return 380;
            };

            /**
             * In the event "Select" is pressed for sub-query window
             */
            ArpSubQueryForm.prototype.getActionProcess = function ( action ) {
                var dialog = this;
                if ( action === 'continue' ) {
                    return new OO.ui.Process( function () {
                        dialog.executeSearch();
                    } );
                } else if ( action === 'delete' ) {
                    dialog.close();
                    openBasicWindow( {} );
                } else {
                    return new OO.ui.Process( function () {
                        dialog.close();
                    } );
                }
            };

            ArpSubQueryForm.prototype.initialize = function () {
                var dialog = this;

                /* To avoid `undefined` error thrown in the `if` and `else if`
                   blocks below, define some variables and set them below */
                this.fieldAffiliateCountSubQueries = null;
                this.fieldLegalStatusSubQueries1 = null;
                this.fieldLegalStatusSubQueries2 = null;
                this.fieldComplianceStatusSubQueries1 = null;
                this.fieldComplianceStatusSubQueries2 = null;
                this.fieldComplianceStatusSubQueries3 = null;
                this.fieldComplianceStatusSubQueries4 = null;
                this.fieldComplianceStatusSubQueries5 = null;
                this.fieldProgramsSubQueries = null;
                this.fieldAffiliateCompositionSubQueries1 = null;
                this.fieldAffiliateCompositionSubQueries2 = null;
                this.fieldAffiliateCompositionSubQueries3 = null;
                this.fieldAffiliateCompositionSubQueries4 = null;
                this.fieldAffiliateCompositionSubQueries5 = null;
                this.fieldAffiliateCompositionSubQueries6 = null;
                this.fieldAffiliateCompositionSubQueries7 = null;

                ArpQueryForm.super.prototype.initialize.call( this );
                this.content = new OO.ui.PanelLayout( {
                    padded: true,
                    expanded: false
                } );

                this.$body.append( '<br/><p style="text-align: center;"><b>' + gadgetMsg[ 'query-question' ] + '</b> ' + queryInfo[1] + '</p>' );
                this.$body.append( '<p style="background-color: #87CEFA; text-align: center;"><br/>' + queryInfo[2] + '<br/><br/></p>' );

                if ( queryInfo[0] === 'ARP-Q1' ) {
                    this.fieldAffiliateCountSubQueries = new OO.ui.RadioSelectWidget( {
                        items: [
                            new OO.ui.RadioOptionWidget( {
                                data: 'Africa',
                                label: gadgetMsg[ 'how-many-affiliates-per-region-africa' ]
                            } ),
                            new OO.ui.RadioOptionWidget( {
                                data: 'Asia',
                                label: gadgetMsg[ 'how-many-affiliates-per-region-asia' ]
                            } ),
                            new OO.ui.RadioOptionWidget( {
                                data: 'Europe',
                                label: gadgetMsg[ 'how-many-affiliates-per-region-europe' ]
                            } ),
                            new OO.ui.RadioOptionWidget( {
                                data: 'North America',
                                label: gadgetMsg[ 'how-many-affiliates-per-region-north-america' ]
                            } ),
                            new OO.ui.RadioOptionWidget( {
                                data: 'South America',
                                label: gadgetMsg[ 'how-many-affiliates-per-region-south-america' ]
                            } ),
                            new OO.ui.RadioOptionWidget( {
                                data: 'Oceania',
                                label: gadgetMsg[ 'how-many-affiliates-per-region-oceania' ]
                            } ),
                            new OO.ui.RadioOptionWidget( {
                                data: 'International',
                                label: gadgetMsg[ 'how-many-affiliates-per-region-international' ]
                            } ),
                            new OO.ui.RadioOptionWidget( {
                                data: 'Middle East',
                                label: gadgetMsg[ 'how-many-affiliates-per-region-middle-east' ]
                            } )
                        ]
                    } );

                    this.fieldSet = new OO.ui.FieldsetLayout( {
                        items: [
                            new OO.ui.FieldLayout(
                                this.fieldAffiliateCountSubQueries,
                                {
                                    label: gadgetMsg[ 'affiliate-count-subquery-label' ],
                                    align: 'top',
                                    classes: [ 'bold-label' ]
                                }
                            )
                        ]
                    } );

                    this.content.$element.append( this.fieldSet.$element );
                } else if ( queryInfo[0] === 'ARP-Q2' ) {
                    /** -- Legal Status Sub-Queries -- */
                    this.fieldSet21 = new OO.ui.FieldsetLayout( {
                        label: gadgetMsg[ 'legal-status-subquery-label' ],
                    } );

                    this.fieldLegalStatusSubQueries1 = new OO.ui.RadioInputWidget( {
                        name: 'legal-status',
                        value: 'ARP-Q2.1',
                    } );

                    this.fieldSet21.addItems( [
                        new OO.ui.FieldLayout( this.fieldLegalStatusSubQueries1, { label: gadgetMsg[ 'how-many-ugs-are-legal-entities'], align: 'inline' } ),
                    ] );

                    this.fieldSet22 = new OO.ui.FieldsetLayout( {
                        label: gadgetMsg[ 'see-additional-queries-on-results' ],
                    } );

                    this.fieldLegalStatusSubQueries2 = new OO.ui.RadioInputWidget( {
                        name: 'legal-status',
                        value: 'ARP-Q2.2',
                    } );

                    this.fieldSet22.addItems( [
                        new OO.ui.FieldLayout( this.fieldLegalStatusSubQueries2, { label: gadgetMsg[ 'list-of-affiliates-by-region'], align: 'inline' } ),
                    ] );

                    this.content.$element.append( this.fieldSet21.$element );
                    this.content.$element.append( this.fieldSet22.$element );
                } else if ( queryInfo[0] === 'ARP-Q3' ) {
                    /** -- Compliance Status Sub-Queries -- */
                    this.fieldSet31 = new OO.ui.FieldsetLayout( {
                        label: gadgetMsg[ 'compliance-status-subquery-label' ],
                    } );

                    this.fieldComplianceStatusSubQueries1 = new OO.ui.RadioInputWidget( {
                        name: 'compliance-status',
                        value: 'ARP-Q3.1',
                    } );
                    this.fieldComplianceStatusSubQueries2 = new OO.ui.RadioInputWidget( {
                        name: 'compliance-status',
                        value: 'ARP-Q3.2',
                    } );
                    this.fieldComplianceStatusSubQueries3 = new OO.ui.RadioInputWidget( {
                        name: 'compliance-status',
                        value: 'ARP-Q3.3',
                    } );

                    this.fieldSet31.addItems( [
                        new OO.ui.FieldLayout( this.fieldComplianceStatusSubQueries1, { label: gadgetMsg[ 'current-compliance-level-of-ugs'], align: 'inline' } ),
                        new OO.ui.FieldLayout( this.fieldComplianceStatusSubQueries2, { label: gadgetMsg[ 'current-compliance-level-of-chpts'], align: 'inline' } ),
                        new OO.ui.FieldLayout( this.fieldComplianceStatusSubQueries3, { label: gadgetMsg[ 'current-compliance-level-of-thorgs'], align: 'inline' } ),
                    ] );

                    this.fieldSet32 = new OO.ui.FieldsetLayout( {
                        label: gadgetMsg[ 'see-additional-queries-on-results' ],
                    } );

                    this.fieldComplianceStatusSubQueries4 = new OO.ui.RadioInputWidget( {
                        name: 'compliance-status',
                        value: 'ARP-Q3.4',
                    } );
                    this.fieldComplianceStatusSubQueries5 = new OO.ui.RadioInputWidget( {
                        name: 'compliance-status',
                        value: 'ARP-Q3.5',
                    } );

                    this.fieldSet32.addItems( [
                        new OO.ui.FieldLayout( this.fieldComplianceStatusSubQueries4, { label: gadgetMsg[ 'list-of-affiliates-in-good-standing'], align: 'inline' } ),
                        new OO.ui.FieldLayout( this.fieldComplianceStatusSubQueries5, { label: gadgetMsg[ 'list-of-affiliates-out-of-compliance'], align: 'inline' } ),
                    ] );

                    this.content.$element.append( this.fieldSet31.$element );
                    this.content.$element.append( this.fieldSet32.$element );
                } else if ( queryInfo[0] === 'ARP-Q5' ) {
                    this.fieldProgramsSubQueries = new OO.ui.RadioSelectWidget( {
                        items: [
                            new OO.ui.RadioOptionWidget( {
                                data: 'ARP-Q5.1',
                                label: gadgetMsg[ 'list-of-affiliates-by-region' ]
                            } ),
                            new OO.ui.RadioOptionWidget( {
                                data: 'ARP-Q5.2',
                                label: gadgetMsg[ 'list-of-affiliates-by-type' ]
                            } )
                            /** -- To be moved to Phase II --,
                             new OO.ui.RadioOptionWidget( {
								data: 'ARP-Q5.3',
								label: gadgetMsg[ 'list-of-affiliates-by-glam-type' ]
							} )
                             */
                        ]
                    } );

                    this.fieldSet = new OO.ui.FieldsetLayout( {
                        items: [
                            new OO.ui.FieldLayout(
                                this.fieldProgramsSubQueries,
                                {
                                    label: gadgetMsg[ 'see-additional-queries-on-results' ],
                                    align: 'top',
                                    classes: [ 'bold-label' ]
                                }
                            )
                        ]
                    } );

                    this.content.$element.append( this.fieldSet.$element );
                } else if ( queryInfo[0] === 'ARP-Q6' ) {
                    this.fieldProgramsSubQueries = new OO.ui.RadioSelectWidget( {
                        items: [
                            new OO.ui.RadioOptionWidget( {
                                data: 'ARP-Q6.1',
                                label: gadgetMsg[ 'list-of-affiliates-by-region' ]
                            } ),
                            new OO.ui.RadioOptionWidget( {
                                data: 'ARP-Q6.2',
                                label: gadgetMsg[ 'list-of-affiliates-by-type' ]
                            } )
                            /** -- To be moved to Phase II --,
                             new OO.ui.RadioOptionWidget( {
								data: 'ARP-Q6.3',
								label: gadgetMsg[ 'list-of-affiliates-by-education-type' ]
							} )
                             */
                        ]
                    } );

                    this.fieldSet = new OO.ui.FieldsetLayout( {
                        items: [
                            new OO.ui.FieldLayout(
                                this.fieldProgramsSubQueries,
                                {
                                    label: gadgetMsg[ 'see-additional-queries-on-results' ],
                                    align: 'top',
                                    classes: [ 'bold-label' ]
                                }
                            )
                        ]
                    } );

                    this.content.$element.append( this.fieldSet.$element );
                } else if ( queryInfo[0] === 'ARP-Q7' ) {
                    /** -- Affiliate Composition Sub-Queries -- */
                    this.fieldSetS1 = new OO.ui.FieldsetLayout( {
                        label: gadgetMsg[ 'affiliate-composition-subquery1-label' ],
                    } );

                    this.fieldAffiliateCompositionSubQueries1 = new OO.ui.RadioInputWidget( {
                        name: 'affiliate-composition',
                        value: 'ARP-Q7.1',
                    } );
                    this.fieldAffiliateCompositionSubQueries2 = new OO.ui.RadioInputWidget( {
                        name: 'affiliate-composition',
                        value: 'ARP-Q7.2',
                    } );
                    this.fieldAffiliateCompositionSubQueries3 = new OO.ui.RadioInputWidget( {
                        name: 'affiliate-composition',
                        value: 'ARP-Q7.3',
                    } );

                    this.fieldSetS1.addItems( [
                        new OO.ui.FieldLayout( this.fieldAffiliateCompositionSubQueries1, { label: gadgetMsg[ 'latest-number-of-member-reported-by-chapter'], align: 'inline' } ),
                        new OO.ui.FieldLayout( this.fieldAffiliateCompositionSubQueries2, { label: gadgetMsg[ 'latest-number-of-member-reported-by-thorgs'], align: 'inline' } ),
                        new OO.ui.FieldLayout( this.fieldAffiliateCompositionSubQueries3, { label: gadgetMsg[ 'latest-number-of-member-reported-by-ugs'], align: 'inline' } ),
                    ] );

                    this.fieldSetS2 = new OO.ui.FieldsetLayout( {
                        label: gadgetMsg[ 'see-additional-queries-on-results' ],
                    } );

                    this.fieldAffiliateCompositionSubQueries4 = new OO.ui.RadioInputWidget( {
                        name: 'affiliate-composition',
                        value: 'ARP-Q7.4',
                    } );

                    this.fieldAffiliateCompositionSubQueries5 = new OO.ui.RadioInputWidget( {
                        name: 'affiliate-composition',
                        value: 'ARP-Q7.5',
                    } );

                    this.fieldAffiliateCompositionSubQueries6 = new OO.ui.RadioInputWidget( {
                        name: 'affiliate-composition',
                        value: 'ARP-Q7.6',
                    } );

                    this.fieldSetS2.addItems( [
                        new OO.ui.FieldLayout( this.fieldAffiliateCompositionSubQueries4, { label: gadgetMsg[ 'see-how-number-tallies-by-region'], align: 'inline' } ),
                        new OO.ui.FieldLayout( this.fieldAffiliateCompositionSubQueries5, { label: gadgetMsg[ 'see-list-of-group-membership-pages'], align: 'inline' } ),
                        new OO.ui.FieldLayout( this.fieldAffiliateCompositionSubQueries6, { label: gadgetMsg[ 'see-list-of-group-membership-count'], align: 'inline' } ),
                        /* -- Phase II of project --
                        new OO.ui.RadioOptionWidget( {
                            data: 'ARP-Q7.5',
                            label: gadgetMsg[ 'what-the-number-was-last-year' ]
                        } ),
                        new OO.ui.RadioOptionWidget( {
                            data: 'ARP-Q7.6',
                            label: gadgetMsg[ 'see-how-number-tallies-by-gender' ]
                        } )
                        */
                    ] );

                    this.content.$element.append( this.fieldSetS1.$element );
                    this.content.$element.append( this.fieldSetS2.$element );
                } else if ( queryInfo[0] === 'ARP-Q8' ) {
                    /** -- Affiliate Composition Sub-Queries -- */
                    this.fieldSetS1 = new OO.ui.FieldsetLayout( {
                        label: gadgetMsg[ 'see-additional-queries-on-results' ],
                    } );

                    this.fieldAffiliateCompositionSubQueries1 = new OO.ui.RadioInputWidget( {
                        name: 'affiliate-composition',
                        value: 'ARP-Q8.1',
                    } );
                    this.fieldAffiliateCompositionSubQueries2 = new OO.ui.RadioInputWidget( {
                        name: 'affiliate-composition',
                        value: 'ARP-Q8.2',
                    } );
                    this.fieldAffiliateCompositionSubQueries3 = new OO.ui.RadioInputWidget( {
                        name: 'affiliate-composition',
                        value: 'ARP-Q8.3',
                    } );
                    this.fieldAffiliateCompositionSubQueries4 = new OO.ui.RadioInputWidget( {
                        name: 'affiliate-composition',
                        value: 'ARP-Q8.4',
                    } );

                    this.fieldSetS1.addItems( [
                        new OO.ui.FieldLayout( this.fieldAffiliateCompositionSubQueries1, { label: gadgetMsg[ 'list-of-affiliates-with-boards'], align: 'inline' } ),
                        new OO.ui.FieldLayout( this.fieldAffiliateCompositionSubQueries2, { label: gadgetMsg[ 'list-of-affiliates-with-democratic-process'], align: 'inline' } ),
                        new OO.ui.FieldLayout( this.fieldAffiliateCompositionSubQueries3, { label: gadgetMsg[ 'list-of-affiliates-with-concensus-process'], align: 'inline' } ),
                        new OO.ui.FieldLayout( this.fieldAffiliateCompositionSubQueries4, { label: gadgetMsg[ 'list-of-affiliates-with-no-shard-structure'], align: 'inline' } ),
                    ] );

                    this.fieldSetS2 = new OO.ui.FieldsetLayout( {
                        label: gadgetMsg[ 'affiliate-composition-subquery2-label' ],
                    } );

                    this.fieldAffiliateCompositionSubQueries5 = new OO.ui.RadioInputWidget( {
                        name: 'affiliate-composition',
                        value: 'ARP-Q8.5',
                    } );
                    this.fieldAffiliateCompositionSubQueries6 = new OO.ui.RadioInputWidget( {
                        name: 'affiliate-composition',
                        value: 'ARP-Q8.6',
                    } );
                    this.fieldAffiliateCompositionSubQueries7 = new OO.ui.RadioInputWidget( {
                        name: 'affiliate-composition',
                        value: 'ARP-Q8.7',
                    } );

                    this.fieldSetS2.addItems( [
                        new OO.ui.FieldLayout( this.fieldAffiliateCompositionSubQueries5, { label: gadgetMsg[ 'decision-making-structures-chapters'], align: 'inline' } ),
                        new OO.ui.FieldLayout( this.fieldAffiliateCompositionSubQueries6, { label: gadgetMsg[ 'decision-making-structures-thorgs'], align: 'inline' } ),
                        new OO.ui.FieldLayout( this.fieldAffiliateCompositionSubQueries7, { label: gadgetMsg[ 'decision-making-structures-ugs'], align: 'inline' } ),
                    ] );

                    this.content.$element.append( this.fieldSetS1.$element );
                    this.content.$element.append( this.fieldSetS2.$element );
                }

                // Clear `queryInfo` cache
                queryInfo = [];

                // When everything is done
                this.$body.append( this.content.$element );
            };

            /**
             * Execute the search query - from Layer II to Layer III
             */
            ArpSubQueryForm.prototype.executeSearch = function ( deleteFlag ) {
                var dialog = this, content, activities_reports, count;
                var messageDialog = new OO.ui.MessageDialog();

                dialog.pushPending();

                new mw.Api().get( getActivitiesReportsContentModuleQuery() ).done( function ( data ) {
                    activities_reports = parseContentModule( data.query.pages );
                } );

                new mw.Api().get( getOrgInfoContentModuleQuery() ).done( function ( data ) {
                    var i, j, handler, entries, entry, a_report, list, affiliate_structures;
                    var windowManager = new OO.ui.WindowManager();

                    /** ARP-Q1.x implementations */
                    if ( dialog.fieldAffiliateCountSubQueries !== null
                        && dialog.fieldAffiliateCountSubQueries.findSelectedItem() !== null
                    ) {
                        var region = '';
                        region = dialog.fieldAffiliateCountSubQueries.findSelectedItem().getData().toString();
                        entries = parseContentModule( data.query.pages );

                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            if ( entry.region === region && entry.recognition_status !== 'derecognised' ) {
                                counter = counter + 1;
                            }
                        }

                        leafWindowResults = new OO.ui.HtmlSnippet(
                            '<br/><br/><b>' + counter.toString() + '</b> ' + gadgetMsg[ 'arp-q1s-results' ] + ' ' + region
                        );

                        dialog.close();
                        clearCounter();
                        openLeafWindow( {} );
                    } else if ( dialog.fieldLegalStatusSubQueries1 !== null
                        && dialog.fieldLegalStatusSubQueries1.isSelected()
                        && dialog.fieldLegalStatusSubQueries1.getValue() === 'ARP-Q2.1'
                    ) {
                        entries = parseContentModule( data.query.pages );

                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            if ( entry.org_type === 'User Group' && entry.legal_entity === 'Yes' && entry.recognition_status !== 'derecognised' ) {
                                counter = counter + 1;
                            }
                        }

                        // Cache results
                        leafWindowResults = new OO.ui.HtmlSnippet(
                            '<br/><br/><b>' + counter.toString() + '</b> ' + gadgetMsg[ 'arp-q21-results' ]
                        );

                        dialog.close();
                        clearCounter();
                        openLeafWindow( {} );
                    } else if ( dialog.fieldLegalStatusSubQueries2 !== null
                        && dialog.fieldLegalStatusSubQueries2.isSelected()
                        && dialog.fieldLegalStatusSubQueries2.getValue() === 'ARP-Q2.2'
                    ) {
                        /** TODO: Algorithm for this query can be improved */
                        var list_africa = "<br/>",
                            list_asia = "<br/>",
                            list_EU = "<br/>",
                            list_NA = "<br/>",
                            list_SA = "<br/>",
                            list_Oc = "<br/>",
                            list_Int = "<br/>",
                            list_ME = "<br/>";

                        entries = parseContentModule( data.query.pages );

                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            if ( ( entry.org_type === 'User Group' && entry.legal_entity === 'Yes' && entry.recognition_status !== 'derecognised' )
                                || entry.org_type === 'Chapter' || entry.org_type === 'Thematic Organization'
                            ) {
                                if ( entry.region === 'Africa' ) {
                                    list_africa += '* ' + entry.group_name + '<br/>';
                                } else if ( entry.region === 'Asia' ) {
                                    list_asia += '* ' + entry.group_name + '<br/>';
                                } else if ( entry.region === 'Europe' ) {
                                    list_EU += '* ' + entry.group_name + '<br/>';
                                } else if ( entry.region === 'North America' ) {
                                    list_NA += '* ' + entry.group_name + '<br/>';
                                } else if ( entry.region === 'South America'	) {
                                    list_SA += '* ' + entry.group_name + '<br/>';
                                } else if ( entry.region === 'Oceania') {
                                    list_Oc += '* ' + entry.group_name + '<br/>';
                                } else if ( entry.region === 'International' ) {
                                    list_Int += '* ' + entry.group_name + '<br/>';
                                } else if ( entry.region === 'Middle East' ) {
                                    list_ME += '* ' + entry.group_name + '<br/>';
                                }
                            }
                        }

                        // Cache the results
                        leafWindowResults = new OO.ui.HtmlSnippet(
                            '<b style="text-align: center;">' + gadgetMsg[ 'arp-q22-results' ] + '</b><br/><br/>'
                            + '<b><i>Africa</i></b>' + list_africa + '<br/>'
                            + '<b><i>Asia</i></b>' + list_asia + '<br/>'
                            + '<b><i>Europe</i></b>' + list_EU + '<br/>'
                            + '<b><i>North America</i></b>' + list_NA + '<br/>'
                            + '<b><i>South America</i></b>' + list_SA + '<br/>'
                            + '<b><i>Oceania</i></b>' + list_Oc + '<br/>'
                            + '<b><i>International</i></b>' + list_Int + '<br/>'
                            + '<b><i>Middle East</i></b>' + list_ME + '<br/>'
                        );

                        dialog.close();
                        clearCounter();
                        openLeafWindow( {} );
                    } else if ( dialog.fieldComplianceStatusSubQueries1 !== null
                        && dialog.fieldComplianceStatusSubQueries1.isSelected()
                        && dialog.fieldComplianceStatusSubQueries1.getValue() === 'ARP-Q3.1'
                    ) {
                        entries = parseContentModule( data.query.pages );

                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            if ( ( entry.uptodate_reporting === 'Tick' || entry.uptodate_reporting === 'Tick-N' )
                                && entry.org_type === 'User Group' && entry.recognition_status !== 'derecognised'
                            ) {
                                percentage = percentage + 1;
                            }

                            if ( entry.org_type === 'User Group' && entry.recognition_status !== 'derecognised' ) {
                                counter = counter + 1;
                            }
                        }

                        // Compute compliance percentage
                        percentage = ( ( percentage / counter ) * 100 ).toFixed(0);
                        percentage = Math.ceil( percentage );

                        leafWindowResults = new OO.ui.HtmlSnippet(
                            '<br/><br/>' + gadgetMsg[ 'arp-q31-results' ] + ' <b>' + percentage.toString()
                            + '%</b>.'
                        );

                        dialog.close();
                        openLeafWindow( {} );
                        clearCounter();
                        percentage = 0;
                    } else if ( dialog.fieldComplianceStatusSubQueries2 !== null
                        && dialog.fieldComplianceStatusSubQueries2.isSelected()
                        && dialog.fieldComplianceStatusSubQueries2.getValue() === 'ARP-Q3.2'
                    ) {
                        entries = parseContentModule( data.query.pages );

                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            if ( ( entry.uptodate_reporting === 'Tick' || entry.uptodate_reporting === 'Tick-N' )
                                && entry.org_type === 'Chapter' && entry.recognition_status !== 'derecognised'
                            ) {
                                percentage = percentage + 1;
                            }

                            if ( entry.org_type === 'Chapter' && entry.recognition_status !== 'derecognised' ) {
                                counter = counter + 1;
                            }
                        }

                        // Compute compliance percentage
                        percentage = ( ( percentage / counter ) * 100 ).toFixed(0);
                        percentage = Math.ceil( percentage );

                        leafWindowResults = new OO.ui.HtmlSnippet(
                            '<br/><br/>' + gadgetMsg[ 'arp-q32-results' ] + ' <b>' + percentage.toString()
                            + '%</b>.'
                        );

                        dialog.close();
                        openLeafWindow( {} );
                        clearCounter();
                        percentage = 0;
                    } else if ( dialog.fieldComplianceStatusSubQueries3 !== null
                        && dialog.fieldComplianceStatusSubQueries3.isSelected()
                        && dialog.fieldComplianceStatusSubQueries3.getValue() === 'ARP-Q3.3'
                    ) {
                        entries = parseContentModule( data.query.pages );

                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            if ( ( entry.uptodate_reporting === 'Tick' || entry.uptodate_reporting === 'Tick-N' )
                                && entry.org_type === 'Thematic Organization' && entry.recognition_status !== 'derecognised'
                            ) {
                                percentage = percentage + 1;
                            }

                            if ( entry.org_type === 'Thematic Organization' && entry.recognition_status !== 'derecognised' ) {
                                counter = counter + 1;
                            }
                        }

                        // Compute compliance percentage
                        percentage = ( ( percentage / counter ) * 100 ).toFixed(0);
                        percentage = Math.ceil( percentage );

                        leafWindowResults = new OO.ui.HtmlSnippet(
                            '<br/><br/>' + gadgetMsg[ 'arp-q33-results' ] + ' <b>' + percentage.toString()
                            + '%</b>.'
                        );

                        dialog.close();
                        openLeafWindow( {} );
                        clearCounter();
                        percentage = 0;
                    } else if ( dialog.fieldComplianceStatusSubQueries4 !== null
                        && dialog.fieldComplianceStatusSubQueries4.isSelected()
                        && dialog.fieldComplianceStatusSubQueries4.getValue() === 'ARP-Q3.4'
                    ) {
                        list = "<br/>";
                        entries = parseContentModule( data.query.pages );

                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            if ( ( entry.uptodate_reporting === 'Tick' || entry.uptodate_reporting === 'Tick-N' )
                                && entry.recognition_status !== 'derecognised'
                            ) {
                                list += "* " + entry.group_name + "<br/>";
                                // streamDataCache += entry.group_name + ',';
                            }
                        }

                        list = new OO.ui.HtmlSnippet( '<b style="text-align: center;">' + gadgetMsg[ 'arp-q34-results' ] + '</b><br/><br/>' + list );

                        // Cache the results
                        leafWindowResults = list;
                        dialog.close();

                        openLeafWindow( {} );
                    } else if ( dialog.fieldComplianceStatusSubQueries5 !== null
                        && dialog.fieldComplianceStatusSubQueries5.isSelected()
                        && dialog.fieldComplianceStatusSubQueries5.getValue() === 'ARP-Q3.5'
                    ) {
                        list = "<br/>";
                        entries = parseContentModule( data.query.pages );

                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            if ( ( entry.uptodate_reporting === 'Cross' || entry.uptodate_reporting === 'Cross-N' )
                                && entry.recognition_status !== 'derecognised'
                            ) {
                                list += "* " + entry.group_name + "<br/>";
                            }
                        }

                        list = new OO.ui.HtmlSnippet( '<b style="text-align: center;">' + gadgetMsg[ 'arp-q35-results' ] + '</b><br/><br/>' + list );

                        // Cache the results
                        leafWindowResults = list;
                        dialog.close();

                        openLeafWindow( {} );
                    } else if (
                        dialog.fieldProgramsSubQueries !== null
                        && dialog.fieldProgramsSubQueries.findSelectedItem() !== null
                    ) {
                        if ( dialog.fieldProgramsSubQueries.findSelectedItem().getData() === 'ARP-Q5.1' ) {
                            /** TODO: Algorithm for this query can be improved */
                            var list_glam_africa = "<br/>",
                                list_glam_asia = "<br/>",
                                list_glam_EU = "<br/>",
                                list_glam_NA = "<br/>",
                                list_glam_SA = "<br/>",
                                list_glam_Oc = "<br/>",
                                list_glam_Int = "<br/>",
                                list_glam_ME = "<br/>";

                            entries = parseContentModule( data.query.pages );

                            for ( i = 0; i < entries.length; i++ ) {
                                entry = cleanRawEntry( entries[ i ].value.fields );
                                for ( j = 0; j < activities_reports.length; j++ ) {
                                    a_report = cleanRawEntry( activities_reports[j].value.fields );
                                    if (
                                        entry.group_name === a_report.group_name
                                        && ( a_report.partnership_info !== undefined && a_report.partnership_info.length > 0 )
                                        && ( a_report.end_date.split("/")[2] == parseInt( new Date().getFullYear() ) - 1 )
                                        && a_report.partnership_info.includes( "GLAM Institutions" )
                                        && entry.recognition_status !== 'derecognised'
                                    ) {
                                        if ( entry.region === 'Africa' ) {
                                            list_glam_africa += '* ' + entry.group_name + '<br/>';
                                        } else if ( entry.region === 'Asia' ) {
                                            list_glam_asia += '* ' + entry.group_name + '<br/>';
                                        } else if ( entry.region === 'Europe' ) {
                                            list_glam_EU += '* ' + entry.group_name + '<br/>';
                                        } else if ( entry.region === 'North America' ) {
                                            list_glam_NA += '* ' + entry.group_name + '<br/>';
                                        } else if ( entry.region === 'South America' ) {
                                            list_glam_SA += '* ' + entry.group_name + '<br/>';
                                        } else if ( entry.region === 'Oceania' ) {
                                            list_glam_Oc += '* ' + entry.group_name + '<br/>';
                                        } else if ( entry.region === 'International' ) {
                                            list_glam_Int += '* ' + entry.group_name + '<br/>';
                                        } else if ( entry.region === 'Middle East' ) {
                                            list_glam_ME += '* ' + entry.group_name + '<br/>';
                                        }
                                        break;
                                    }
                                }
                            }

                            // Cache the results
                            leafWindowResults = new OO.ui.HtmlSnippet(
                                '<b>' + gadgetMsg[ 'arp-q51-results' ] + '</b><br/><br/>'
                                + '<b><i>Africa</i></b>' + list_glam_africa + '<br/>'
                                + '<b><i>Asia</i></b>' + list_glam_asia + '<br/>'
                                + '<b><i>Europe</i></b>' + list_glam_EU + '<br/>'
                                + '<b><i>North America</i></b>' + list_glam_NA + '<br/>'
                                + '<b><i>South America</i></b>' + list_glam_SA + '<br/>'
                                + '<b><i>Oceania</i></b>' + list_glam_Oc + '<br/>'
                                + '<b><i>International</i></b>' + list_glam_Int + '<br/>'
                                + '<b><i>Middle East</i></b>' + list_glam_ME + '<br/>'
                            );
                            dialog.close();
                            openLeafWindow( {} );
                        } else if ( dialog.fieldProgramsSubQueries.findSelectedItem().getData() === 'ARP-Q5.2' ) {
                            var list_glam_ugs = '<br/>',
                                list_glam_chpts = '<br/>',
                                list_glam_thorgs = '<br/>';

                            entries = parseContentModule( data.query.pages );

                            for ( i = 0; i < entries.length; i++ ) {
                                entry = cleanRawEntry( entries[ i ].value.fields );
                                for ( j = 0; j < activities_reports.length; j++ ) {
                                    a_report = cleanRawEntry( activities_reports[j].value.fields );
                                    if (
                                        entry.group_name === a_report.group_name
                                        && ( a_report.partnership_info !== undefined && a_report.partnership_info.length > 0 )
                                        && ( a_report.end_date.split("/")[2] === parseInt( new Date().getFullYear() ) - 1 )
                                        && a_report.partnership_info.includes( "GLAM Institutions" )
                                        && entry.recognition_status !== 'derecognised'
                                    ) {
                                        if ( entry.org_type === 'User Group' ) {
                                            list_glam_ugs += '* ' + entry.group_name + '<br/>';
                                        } else if ( entry.org_type === 'Chapter' ) {
                                            list_glam_chpts += '* ' + entry.group_name + '<br/>';
                                        } else if ( entry.org_type === 'Thematic Organization' ) {
                                            list_glam_thorgs += '* ' + entry.group_name + '<br/>';
                                        }
                                        break;
                                    }
                                }
                            }

                            // Cache the results
                            leafWindowResults = new OO.ui.HtmlSnippet(
                                '<b>' + gadgetMsg[ 'arp-q52-results' ] + '</b><br/>'
                                + '<b><i>User Groups</i></b>' + list_glam_ugs + '<br/>'
                                + '<b><i>Chapters</i></b>' + list_glam_chpts + '<br/>'
                                + '<b><i>Thematic Organizations</i></b>' + list_glam_thorgs + '<br/>'
                            );
                            dialog.close();
                            openLeafWindow( {} );
                        } else if ( dialog.fieldProgramsSubQueries.findSelectedItem().getData() === 'ARP-Q6.1' ) {
                            /** TODO: Algorithm for this query can be improved */
                            var list_education_africa = "<br/>",
                                list_education_asia = "<br/>",
                                list_education_EU = "<br/>",
                                list_education_NA = "<br/>",
                                list_education_SA = "<br/>",
                                list_education_Oc = "<br/>",
                                list_education_Int = "<br/>",
                                list_education_ME = "<br/>";

                            entries = parseContentModule( data.query.pages );

                            for ( i = 0; i < entries.length; i++ ) {
                                entry = cleanRawEntry( entries[ i ].value.fields );
                                for ( j = 0; j < activities_reports.length; j++ ) {
                                    a_report = cleanRawEntry( activities_reports[j].value.fields );
                                    if (
                                        entry.group_name === a_report.group_name
                                        && ( a_report.partnership_info !== undefined && a_report.partnership_info.length > 0 )
                                        && ( a_report.end_date.split("/")[2] == parseInt( new Date().getFullYear() ) - 1 )
                                        && a_report.partnership_info.includes( "Educational Institutions" )
                                        && entry.recognition_status !== 'derecognised'
                                    ) {
                                        if ( entry.region === 'Africa' ) {
                                            list_education_africa += '* ' + entry.group_name + '<br/>';
                                        } else if ( entry.region === 'Asia' ) {
                                            list_education_asia += '* ' + entry.group_name + '<br/>';
                                        } else if ( entry.region === 'Europe' ) {
                                            list_education_EU += '* ' + entry.group_name + '<br/>';
                                        } else if ( entry.region === 'North America' ) {
                                            list_education_NA += '* ' + entry.group_name + '<br/>';
                                        } else if ( entry.region === 'South America' ) {
                                            list_education_SA += '* ' + entry.group_name + '<br/>';
                                        } else if ( entry.region === 'Oceania' ) {
                                            list_education_Oc += '* ' + entry.group_name + '<br/>';
                                        } else if ( entry.region === 'International' ) {
                                            list_education_Int += '* ' + entry.group_name + '<br/>';
                                        } else if ( entry.region === 'Middle East' ) {
                                            list_education_ME += '* ' + entry.group_name + '<br/>';
                                        }
                                        break;
                                    }
                                }
                            }

                            // Cache the results
                            leafWindowResults = new OO.ui.HtmlSnippet(
                                '<b>' + gadgetMsg[ 'arp-q61-results' ] + '</b><br/><br/>'
                                + '<b><i>Africa</i></b>' + list_education_africa + '<br/>'
                                + '<b><i>Asia</i></b>' + list_education_asia + '<br/>'
                                + '<b><i>Europe</i></b>' + list_education_EU + '<br/>'
                                + '<b><i>North America</i></b>' + list_education_NA + '<br/>'
                                + '<b><i>South America</i></b>' + list_education_SA + '<br/>'
                                + '<b><i>Oceania</i></b>' + list_education_Oc + '<br/>'
                                + '<b><i>International</i></b>' + list_education_Int + '<br/>'
                                + '<b><i>Middle East</i></b>' + list_education_ME + '<br/>'
                            );
                            dialog.close();
                            openLeafWindow( {} );
                        } else if ( dialog.fieldProgramsSubQueries.findSelectedItem().getData() === 'ARP-Q6.2' ) {
                            var list_education_ugs = '<br/>',
                                list_education_chpts = '<br/>',
                                list_education_thorgs = '<br/>';

                            entries = parseContentModule( data.query.pages );

                            for ( i = 0; i < entries.length; i++ ) {
                                entry = cleanRawEntry( entries[ i ].value.fields );
                                for ( j = 0; j < activities_reports.length; j++ ) {
                                    a_report = cleanRawEntry( activities_reports[j].value.fields );
                                    if (
                                        entry.group_name === a_report.group_name
                                        && ( a_report.partnership_info !== undefined && a_report.partnership_info.length > 0 )
                                        && ( a_report.end_date.split("/")[2] == parseInt( new Date().getFullYear() ) - 1 )
                                        && a_report.partnership_info.includes( "Educational Institutions" )
                                        && entry.recognition_status !== 'derecognised'
                                    ) {
                                        if ( entry.org_type === 'User Group' ) {
                                            list_education_ugs += '* ' + entry.group_name + '<br/>';
                                        } else if ( entry.org_type === 'Chapter' ) {
                                            list_education_chpts += '* ' + entry.group_name + '<br/>';
                                        } else if ( entry.org_type === 'Thematic Organization' ) {
                                            list_education_thorgs += '* ' + entry.group_name + '<br/>';
                                        }
                                        break;
                                    }
                                }
                            }

                            // Cache the results
                            leafWindowResults = new OO.ui.HtmlSnippet(
                                '<b>' + gadgetMsg[ 'arp-q62-results' ] + '</b><br/><br/>'
                                + '<b><i>User Groups</i></b>' + list_education_ugs + '<br/>'
                                + '<b><i>Chapters</i></b>' + list_education_chpts + '<br/>'
                                + '<b><i>Thematic Organizations</i></b>' + list_education_thorgs + '<br/>'
                            );
                            dialog.close();
                            openLeafWindow( {} );
                        }
                    } else if ( dialog.fieldAffiliateCompositionSubQueries1 !== null
                        && dialog.fieldAffiliateCompositionSubQueries1.isSelected()
                        && dialog.fieldAffiliateCompositionSubQueries1.getValue() === 'ARP-Q7.1'
                    ) {
                        count = 0;
                        entries = parseContentModule( data.query.pages );
                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            count = parseInt( entry.member_count );
                            if ( entry.org_type === "Chapter" && count > 0 && entry.recognition_status !== 'derecognised' ) {
                                counter += count;
                            }
                        }

                        // Cache results
                        leafWindowResults = new OO.ui.HtmlSnippet(
                            '<br/><br/><b>' + counter.toString() + '</b> ' + gadgetMsg[ 'arp-q71-results' ]
                        );
                        dialog.close();
                        openLeafWindow( {} );
                    } else if ( dialog.fieldAffiliateCompositionSubQueries2 !== null
                        && dialog.fieldAffiliateCompositionSubQueries2.isSelected()
                        && dialog.fieldAffiliateCompositionSubQueries2.getValue() === 'ARP-Q7.2'
                    ) {
                        count = 0;
                        entries = parseContentModule( data.query.pages );
                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            count = parseInt( entry.member_count );
                            if ( entry.org_type === "Thematic Organization" && count > 0 && entry.recognition_status !== 'derecognised' ) {
                                counter += count;
                            }
                        }

                        // Cache results
                        leafWindowResults = new OO.ui.HtmlSnippet(
                            '<br/><br/><b>' + counter.toString() + '</b> ' + gadgetMsg[ 'arp-q72-results' ]
                        );
                        dialog.close();
                        openLeafWindow( {} );
                    } else if ( dialog.fieldAffiliateCompositionSubQueries3 !== null
                        && dialog.fieldAffiliateCompositionSubQueries3.isSelected()
                        && dialog.fieldAffiliateCompositionSubQueries3.getValue() === 'ARP-Q7.3'
                    ) {
                        count = 0;
                        entries = parseContentModule( data.query.pages );
                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            count = parseInt( entry.member_count );
                            if ( entry.org_type === "User Group" && count > 0 && entry.recognition_status !== 'derecognised' ) {
                                counter += count;
                            }
                        }

                        // Cache results
                        leafWindowResults = new OO.ui.HtmlSnippet(
                            '<br/><br/><b>' + counter.toString() + '</b> ' + gadgetMsg[ 'arp-q73-results' ]
                        );
                        dialog.close();
                        openLeafWindow( {} );
                    } else if ( dialog.fieldAffiliateCompositionSubQueries4 !== null
                        && dialog.fieldAffiliateCompositionSubQueries4.isSelected()
                        && dialog.fieldAffiliateCompositionSubQueries4.getValue() === 'ARP-Q7.4'
                    ) {
                        entries = parseContentModule( data.query.pages );

                        // Cache results
                        leafWindowResults = new OO.ui.HtmlSnippet(
                            '<b>' + gadgetMsg[ 'arp-q74-results' ] + '</b><br/><br/>' +
                            '* Africa - <b>' + luaTableCounterByAffiliateRegion( entries, 'Africa' ) + '</b> ' + gadgetMsg[ 'query-results-members' ] + '<br/>' +
                            '* Asia - <b>' + luaTableCounterByAffiliateRegion( entries, 'Asia' ) + '</b> ' + gadgetMsg[ 'query-results-members' ] + '<br/>' +
                            '* Europe - <b>' + luaTableCounterByAffiliateRegion( entries, 'Europe' ) + '</b> ' + gadgetMsg[ 'query-results-members' ] + '<br/>' +
                            '* North America - <b>' + luaTableCounterByAffiliateRegion( entries, 'North America' ) + '</b> ' + gadgetMsg[ 'query-results-members' ] + '<br/>' +
                            '* South America - <b>' + luaTableCounterByAffiliateRegion( entries, 'South America' ) + '</b> ' + gadgetMsg[ 'query-results-members' ] + '<br/>' +
                            '* Oceania - <b>' + luaTableCounterByAffiliateRegion( entries, 'Oceania' ) + '</b> ' + gadgetMsg[ 'query-results-members' ] + '<br/>' +
                            '* International - <b>' + luaTableCounterByAffiliateRegion( entries, 'International' ) + '</b> ' + gadgetMsg[ 'query-results-members' ] + '<br/>' +
                            '* Middle East - <b>' + luaTableCounterByAffiliateRegion( entries, 'Middle East' ) + '</b> ' + gadgetMsg[ 'query-results-members' ] + '<br/>'
                        );
                        dialog.close();
                        openLeafWindow( {} );
                    } else if ( dialog.fieldAffiliateCompositionSubQueries5 !== null
                        && dialog.fieldAffiliateCompositionSubQueries5.isSelected()
                        && dialog.fieldAffiliateCompositionSubQueries5.getValue() === 'ARP-Q7.5'
                    ) {
                        list = '';
                        entries = parseContentModule( data.query.pages );
                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            if ( entry.group_page !== undefined && entry.recognition_status !== 'derecognised' ) {
                                list += '* ' + entry.group_page + '<br/>';
                            } else {
                                list += '* [TBA]<br/>';
                            }
                        }

                        // Cache results
                        leafWindowResults = new OO.ui.HtmlSnippet(
                            '<b>' + gadgetMsg[ 'arp-q75-results' ] + '</b><br/><br/>' + list
                        );
                        dialog.close();
                        openLeafWindow( {} );
                    } else if ( dialog.fieldAffiliateCompositionSubQueries6 !== null
                        && dialog.fieldAffiliateCompositionSubQueries6.isSelected()
                        && dialog.fieldAffiliateCompositionSubQueries6.getValue() === 'ARP-Q7.6'
                    ) {
                        list = '';
                        entries = parseContentModule( data.query.pages );
                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            if ( entry.group_name !== undefined && entry.recognition_status !== 'derecognised' ) {
                                if ( entry.member_count !== undefined && entry.member_count !== '-99' ) {
                                    list += '* ' + entry.group_name + '  ---  ' + entry.member_count + ' members<br/>';
                                } else {
                                    list += '* ' + entry.group_name + '  ---  ' + 'N/A members<br/>';
                                }
                            }
                        }

                        // Cache results
                        leafWindowResults = new OO.ui.HtmlSnippet(
                            '<b>' + gadgetMsg[ 'arp-q76-results' ] + '</b><br/><br/>' + list
                        );
                        dialog.close();
                        openLeafWindow( {} );
                    } else if ( dialog.fieldAffiliateCompositionSubQueries1 !== null
                        && dialog.fieldAffiliateCompositionSubQueries1.isSelected()
                        && dialog.fieldAffiliateCompositionSubQueries1.getValue() === 'ARP-Q8.1'
                    ) {
                        list = "<br/>";
                        entries = parseContentModule( data.query.pages );

                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            if ( entry.dm_structure.includes( "Board" ) && entry.recognition_status !== 'derecognised' ) {
                                list += "* " + entry.group_name + "<br/>";
                            }
                        }

                        // Cache results
                        leafWindowResults = new OO.ui.HtmlSnippet(
                            '<br/><b>' + gadgetMsg[ 'arp-q81-results' ] + '</b><br/>' + list
                        );
                        dialog.close();
                        openLeafWindow( {} );
                    } else if ( dialog.fieldAffiliateCompositionSubQueries2 !== null
                        && dialog.fieldAffiliateCompositionSubQueries2.isSelected()
                        && dialog.fieldAffiliateCompositionSubQueries2.getValue() === 'ARP-Q8.2'
                    ) {
                        list = "<br/>";
                        entries = parseContentModule( data.query.pages );

                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            if ( entry.dm_structure.includes( "Democratic Process" ) && entry.recognition_status !== 'derecognised' ) {
                                list += "* " + entry.group_name + "<br/>";
                            }
                        }

                        // Cache results
                        leafWindowResults = new OO.ui.HtmlSnippet(
                            '<br/><b>' + gadgetMsg[ 'arp-q82-results' ] + '</b><br/>' + list
                        );
                        dialog.close();
                        openLeafWindow( {} );
                    } else if ( dialog.fieldAffiliateCompositionSubQueries3 !== null
                        && dialog.fieldAffiliateCompositionSubQueries3.isSelected()
                        && dialog.fieldAffiliateCompositionSubQueries3.getValue() === 'ARP-Q8.3'
                    ) {
                        list = "<br/>";
                        entries = parseContentModule( data.query.pages );

                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            if ( entry.dm_structure.includes( "Consensus Decision Making" ) && entry.recognition_status !== 'derecognised' ) {
                                list += "* " + entry.group_name + "<br/>";
                            }
                        }

                        // Cache results
                        leafWindowResults = new OO.ui.HtmlSnippet(
                            '<br/><b>' + gadgetMsg[ 'arp-q83-results' ] + '</b><br/>' + list
                        );
                        dialog.close();
                        openLeafWindow( {} );
                    } else if ( dialog.fieldAffiliateCompositionSubQueries4 !== null
                        && dialog.fieldAffiliateCompositionSubQueries4.isSelected()
                        && dialog.fieldAffiliateCompositionSubQueries4.getValue() === 'ARP-Q8.4'
                    ) {
                        list = "<br/>";
                        entries = parseContentModule( data.query.pages );

                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            if ( entry.dm_structure.includes( "No Shared Structure" ) && entry.recognition_status !== 'derecognised' ) {
                                list += "* " + entry.group_name + "<br/>";
                            }
                        }

                        // Cache results
                        leafWindowResults = new OO.ui.HtmlSnippet(
                            '<br/><b>' + gadgetMsg[ 'arp-q84-results' ] + '</b><br/>' + list
                        );
                        dialog.close();
                        openLeafWindow( {} );
                    } else if ( dialog.fieldAffiliateCompositionSubQueries5 !== null
                        && dialog.fieldAffiliateCompositionSubQueries5.isSelected()
                        && dialog.fieldAffiliateCompositionSubQueries5.getValue() === 'ARP-Q8.5'
                    ) {
                        affiliate_structures = {
                            'board': 0,
                            'democratic_process': 0,
                            'consensus_decision': 0,
                            'no_shared_structure': 0
                        };

                        entries = parseContentModule( data.query.pages );
                        counter = luaTableCounterForAffiliateType( entries, 'Chapter' );

                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            if (
                                entry.dm_structure !== undefined
                                && entry.dm_structure.length > 0
                                && entry.org_type === "Chapter"
                                && entry.recognition_status !== 'derecognised'
                            ) {
                                /* For board structures */
                                if ( entry.dm_structure.includes( "Board" ) ) {
                                    affiliate_structures.board += 1;
                                }
                                /* For democratic process structures */
                                else if ( entry.dm_structure.includes( "Democratic Process" ) ) {
                                    affiliate_structures.democratic_process += 1;
                                }
                                /* For consensus decision structures */
                                else if ( entry.dm_structure.includes( "Consensus Decision Making" ) ) {
                                    affiliate_structures.consensus_decision += 1;
                                }
                                /* For no shared structures */
                                else if ( entry.dm_structure.includes( "No Shared Structure" ) ) {
                                    affiliate_structures.no_shared_structure += 1;
                                }
                            }
                        }

                        /* Compute the percentages */
                        affiliate_structures.board = ( ( affiliate_structures.board / counter ) * 100 ).toFixed( 0 );
                        affiliate_structures.democratic_process = ( ( affiliate_structures.democratic_process / counter ) * 100 ).toFixed( 0 );
                        affiliate_structures.consensus_decision = ( ( affiliate_structures.consensus_decision / counter ) * 100 ).toFixed( 0 );
                        affiliate_structures.no_shared_structure = ( ( affiliate_structures.no_shared_structure / counter ) * 100 ).toFixed( 0 );

                        // Cache results
                        leafWindowResults = new OO.ui.HtmlSnippet(
                            '<br/><br/><b>' + gadgetMsg[ 'arp-q85-results' ] + '</b><br/><br/>'
                            + '* <b>' + affiliate_structures.board.toString() + '%</b> - Board<br/>'
                            + '* <b>' + affiliate_structures.democratic_process.toString() + '%</b> - Democratic process<br/>'
                            + '* <b>' + affiliate_structures.consensus_decision.toString() + '%</b> - Consensus decision<br/>'
                            + '* <b>' + affiliate_structures.no_shared_structure.toString() + '%</b> - No shared structure<br/>'
                        );
                        dialog.close();
                        openLeafWindow( {} );
                        clearCounter();
                    } else if ( dialog.fieldAffiliateCompositionSubQueries6 !== null
                        && dialog.fieldAffiliateCompositionSubQueries6.isSelected()
                        && dialog.fieldAffiliateCompositionSubQueries6.getValue() === 'ARP-Q8.6'
                    ) {
                        affiliate_structures = {
                            'board': 0,
                            'democratic_process': 0,
                            'consensus_decision': 0,
                            'no_shared_structure': 0
                        };

                        entries = parseContentModule( data.query.pages );
                        counter = luaTableCounterForAffiliateType( entries, 'Thematic Organization' );

                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            if (
                                entry.dm_structure !== undefined
                                && entry.dm_structure.length > 0
                                && entry.org_type === "Thematic Organization"
                                && entry.recognition_status !== 'derecognised'
                            ) {
                                /* For board structures */
                                if ( entry.dm_structure.includes( "Board" ) ) {
                                    affiliate_structures.board += 1;
                                }
                                /* For democratic process structures */
                                else if ( entry.dm_structure.includes( "Democratic Process" ) ) {
                                    affiliate_structures.democratic_process += 1;
                                }
                                /* For consensus decision structures */
                                else if ( entry.dm_structure.includes( "Consensus Decision Making" ) ) {
                                    affiliate_structures.consensus_decision += 1;
                                }
                                /* For no shared structures */
                                else if ( entry.dm_structure.includes( "No Shared Structure" ) ) {
                                    affiliate_structures.no_shared_structure += 1;
                                }
                            }
                        }

                        /* Compute the percentages */
                        affiliate_structures.board = ( ( affiliate_structures.board / counter ) * 100 ).toFixed( 0 );
                        affiliate_structures.democratic_process = ( ( affiliate_structures.democratic_process / counter ) * 100 ).toFixed( 0 );
                        affiliate_structures.consensus_decision = ( ( affiliate_structures.consensus_decision / counter ) * 100 ).toFixed( 0 );
                        affiliate_structures.no_shared_structure = ( ( affiliate_structures.no_shared_structure / counter ) * 100 ).toFixed( 0 );

                        // Cache results
                        leafWindowResults = new OO.ui.HtmlSnippet(
                            '<br/><br/><b>' + gadgetMsg[ 'arp-q86-results' ] + '</b><br/><br/>'
                            + '* <b>' + affiliate_structures.board.toString() + '%</b> - Board<br/>'
                            + '* <b>' + affiliate_structures.democratic_process.toString() + '%</b> - Democratic process<br/>'
                            + '* <b>' + affiliate_structures.consensus_decision.toString() + '%</b> - Consensus decision<br/>'
                            + '* <b>' + affiliate_structures.no_shared_structure.toString() + '%</b> - No shared structure<br/>'
                        );
                        dialog.close();
                        openLeafWindow( {} );
                        clearCounter();
                    } else if ( dialog.fieldAffiliateCompositionSubQueries7 !== null
                        && dialog.fieldAffiliateCompositionSubQueries7.isSelected()
                        && dialog.fieldAffiliateCompositionSubQueries7.getValue() === 'ARP-Q8.7'
                    ) {
                        affiliate_structures = {
                            'board': 0,
                            'democratic_process': 0,
                            'consensus_decision': 0,
                            'no_shared_structure': 0
                        };

                        entries = parseContentModule( data.query.pages );
                        counter = luaTableCounterForAffiliateType( entries, 'User Group' );

                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            if (
                                entry.dm_structure !== undefined
                                && entry.dm_structure.length > 0
                                && entry.org_type === "User Group"
                                && entry.recognition_status !== 'derecognised'
                            ) {
                                /* For board structures */
                                if ( entry.dm_structure.includes( "Board" ) ) {
                                    affiliate_structures.board += 1;
                                }
                                /* For democratic process structures */
                                else if ( entry.dm_structure.includes( "Democratic Process" ) ) {
                                    affiliate_structures.democratic_process += 1;
                                }
                                /* For consensus decision structures */
                                else if ( entry.dm_structure.includes( "Consensus Decision Making" ) ) {
                                    affiliate_structures.consensus_decision += 1;
                                }
                                /* For no shared structures */
                                else if ( entry.dm_structure.includes( "No Shared Structure" ) ) {
                                    affiliate_structures.no_shared_structure += 1;
                                }
                            }
                        }

                        /* Compute the percentages */
                        affiliate_structures.board = ( ( affiliate_structures.board / counter ) * 100 ).toFixed( 0 );
                        affiliate_structures.democratic_process = ( ( affiliate_structures.democratic_process / counter ) * 100 ).toFixed( 0 );
                        affiliate_structures.consensus_decision = ( ( affiliate_structures.consensus_decision / counter ) * 100 ).toFixed( 0 );
                        affiliate_structures.no_shared_structure = ( ( affiliate_structures.no_shared_structure / counter ) * 100 ).toFixed( 0 );

                        // Cache results
                        leafWindowResults = new OO.ui.HtmlSnippet(
                            '<br/><br/><b>' + gadgetMsg[ 'arp-q87-results' ] + '</b><br/><br/>'
                            + '* <b>' + affiliate_structures.board.toString() + '%</b> - Board<br/>'
                            + '* <b>' + affiliate_structures.democratic_process.toString() + '%</b> - Democratic process<br/>'
                            + '* <b>' + affiliate_structures.consensus_decision.toString() + '%</b> - Consensus decision<br/>'
                            + '* <b>' + affiliate_structures.no_shared_structure.toString() + '%</b> - No shared structure<br/>'
                        );
                        dialog.close();
                        openLeafWindow( {} );
                        clearCounter();
                    } else {
                        dialog.close();

                        $( 'body' ).append( windowManager.$element );
                        // Add the dialog to the window manager.
                        windowManager.addWindows( [ messageDialog ] );

                        // Configure the message dialog when it is opened with the window manager's openWindow() method.
                        windowManager.openWindow( messageDialog, {
                            title: gadgetMsg[ 'wad-query-404' ],
                            message: gadgetMsg[ 'wadp-404-response-message-body' ],
                            actions: [
                                {
                                    action: 'accept',
                                    label: 'Dismiss',
                                    flags: 'primary'
                                }
                            ]
                        });
                    }
                } );
            };

            /******************* Main Basic QP Window ********************/
            /**
             * Subclass ProcessDialog
             *
             * @class ArpQueryForm
             * @extends OO.ui.ProcessDialog
             *
             * @constructor
             * @param {Object} config
             */
            function ArpQueryForm( config ) {
                ArpQueryForm.super.call( this, config );
            }
            OO.inheritClass( ArpQueryForm, OO.ui.ProcessDialog );

            ArpQueryForm.static.name = gadgetMsg[ 'wad-query-form-name' ];
            ArpQueryForm.static.title = gadgetMsg[ 'arp-query-form-title' ];
            ArpQueryForm.static.actions = [
                {
                    action: 'continue',
                    modes: 'edit',
                    label: gadgetMsg[ 'action-label-execute' ],
                    flags: [ 'primary', 'constructive' ]
                },
                {
                    action: 'cancel',
                    modes: 'edit',
                    label: gadgetMsg[ 'action-label-exit' ],
                    flags: 'safe'
                }
            ];

            /******************* Main Advance QP Window ********************/
            /**
             * Subclass ProcessDialog
             *
             * @class AdvanceArpQueryForm
             * @extends OO.ui.ProcessDialog
             *
             * @constructor
             * @param {Object} config
             */
            function AdvanceArpQueryForm( config ) {
                AdvanceArpQueryForm.super.call( this, config );
            }
            OO.inheritClass( AdvanceArpQueryForm, OO.ui.ProcessDialog );

            AdvanceArpQueryForm.static.name = gadgetMsg[ 'wad-query-form-name' ];
            AdvanceArpQueryForm.static.title = gadgetMsg[ 'arp-advance-query-form-title' ];
            AdvanceArpQueryForm.static.actions = [
                {
                    action: 'continue',
                    modes: 'edit',
                    label: gadgetMsg[ 'action-label-execute' ],
                    flags: [ 'primary', 'constructive' ]
                },
                {
                    action: 'cancel',
                    modes: 'edit',
                    label: gadgetMsg[ 'action-label-exit' ],
                    flags: 'safe'
                }
            ];

            /**
             * Set custom height for the advance modal window
             */
            AdvanceArpQueryForm.prototype.getBodyHeight = function () {
                return 600;
            };


            /**
             * Listen to different actions on the respective window
             */
            AdvanceArpQueryForm.prototype.getActionProcess = function ( action ) {
                var dialog = this;
                if ( action === 'continue' ) {
                    return new OO.ui.Process( function () {
                        dialog.executeSearch();
                    } );
                } else {
                    return new OO.ui.Process( function () {
                        dialog.close();
                    } );
                }
            };

            /**
             * Use the initialize() method to add content to the dialog's $body,
             * to initialize widgets, and to set up event handlers.
             */
            AdvanceArpQueryForm.prototype.initialize = function () {
                var dialog,
                    fieldSpecificAffiliate,
                    fieldSpecificCountry,
                    tmpFieldAffiliateSearchType,
                    tmpFieldAffiliateSearchTypeByRegion;

                dialog = this;

                AdvanceArpQueryForm.super.prototype.initialize.call( this );
                this.content = new OO.ui.PanelLayout( {
                    padded: true,
                    expanded: false
                } );

                this.fieldQuantitativeSearchType = new OO.ui.DropdownWidget( {
                    label: gadgetMsg[ 'quantitative-search-type' ],
                    menu: {
                        items: [
                            new OO.ui.MenuOptionWidget( {
                                data: 'list',
                                label: gadgetMsg[ 'list-of' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'number',
                                label: gadgetMsg[ 'total-number-of' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'percentage',
                                label: gadgetMsg[ 'percentage-of' ]
                            } )
                        ]
                    }
                } );

                this.fieldQueryObject = new OO.ui.DropdownWidget( {
                    label: gadgetMsg[ 'query-object-default-option' ],
                    menu: {
                        items: [
                            new OO.ui.MenuOptionWidget( {
                                data: 'affiliates',
                                label: gadgetMsg[ 'query-object-affiliates' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'events',
                                label: gadgetMsg[ 'query-object-events' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'partners',
                                label: gadgetMsg[ 'query-object-partners' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'members',
                                label: gadgetMsg[ 'query-object-members' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'finance',
                                label: gadgetMsg[ 'query-object-finance' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'reports',
                                label: gadgetMsg[ 'query-object-reports' ]
                            } )
                        ]
                    }
                } );

                this.fieldQuerySubject = new OO.ui.DropdownWidget( {
                    label: gadgetMsg[ 'query-object-default-option' ],
                    menu: {
                        items: [
                            new OO.ui.MenuOptionWidget( {
                                data: 'belongs-to',
                                label: gadgetMsg[ 'query-subject-belongs-to' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'participated-in',
                                label: gadgetMsg[ 'query-subject-participated-in' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'compliant-with-reporting',
                                label: gadgetMsg[ 'query-subject-compliant-with-reporting' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'reported-in',
                                label: gadgetMsg[ 'query-subject-reported-in' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'reported-by',
                                label: gadgetMsg[ 'query-subject-reported-by' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'conducted-by',
                                label: gadgetMsg[ 'query-subject-conducted-by' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'conducted-with',
                                label: gadgetMsg[ 'query-subject-conducted-with' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'with-demographic-of',
                                label: gadgetMsg[ 'query-subject-with-demographic-of' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'recognised-in-year',
                                label: gadgetMsg[ 'query-subject-recognised-in-year' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'derecognised-in-year',
                                label: gadgetMsg[ 'query-subject-derecognised-in-year' ]
                            } )
                        ]
                    }
                } );

                tmpFieldAffiliateSearchType = this.fieldAffiliateSearchType = new OO.ui.DropdownWidget( {
                    label: gadgetMsg[ 'type-of-affiliate-to-query' ],
                    menu: {
                        items: [
                            new OO.ui.MenuOptionWidget( {
                                data: 'all-affiliates',
                                label: gadgetMsg[ 'affiliate-search-type-all-affiliates' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'chapters',
                                label: gadgetMsg[ 'affiliate-search-type-chapters' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'thorgs',
                                label: gadgetMsg[ 'affiliate-search-type-thorgs' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'user-groups',
                                label: gadgetMsg[ 'affiliate-search-type-user-groups' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'specific-affiliate',
                                label: gadgetMsg[ 'affiliate-search-type-specific-affiliate' ]
                            } )
                        ]
                    }
                } );

                fieldSpecificAffiliate = this.fieldSpecificAffiliate = new AffiliateLookupTextInputWidget();
                fieldSpecificAffiliate.toggle();
                tmpFieldAffiliateSearchType.on( 'labelChange', function () {
                    if ( tmpFieldAffiliateSearchType.getLabel() === 'Specific affiliate organization'  ) {
                        fieldSpecificAffiliate.toggle(true);
                    } else {
                        fieldSpecificAffiliate.toggle(false);
                    }
                } );

                tmpFieldAffiliateSearchTypeByRegion = this.fieldAffiliateSearchTypeByRegion = new OO.ui.DropdownWidget( {
                    label: gadgetMsg[ 'type-of-affiliate-to-query-by-region' ],
                    menu: {
                        items: [
                            new OO.ui.MenuOptionWidget( {
                                data: 'africa',
                                label: gadgetMsg[ 'affiliate-search-by-region-africa' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'asia',
                                label: gadgetMsg[ 'affiliate-search-by-region-asia' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'europe',
                                label: gadgetMsg[ 'affiliate-search-by-region-europe' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'north-america',
                                label: gadgetMsg[ 'affiliate-search-by-region-north-america' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'oceania',
                                label: gadgetMsg[ 'affiliate-search-by-region-oceania' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'south-america',
                                label: gadgetMsg[ 'affiliate-search-by-region-south-america' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'middle-east',
                                label: gadgetMsg[ 'affiliate-search-by-region-middle-east' ]
                            } ),
                            new OO.ui.MenuOptionWidget( {
                                data: 'specific-country',
                                label: gadgetMsg[ 'affiliate-search-by-region-specific-country' ]
                            } )
                        ]
                    }
                } );

                fieldSpecificCountry = this.fieldSpecificCountry = new CountryLookupTextInputWidget();
                fieldSpecificCountry.toggle();
                tmpFieldAffiliateSearchTypeByRegion.on( 'labelChange', function () {
                    if ( tmpFieldAffiliateSearchTypeByRegion.getLabel() === 'Specific country'  ) {
                        fieldSpecificCountry.toggle(true);
                    } else {
                        fieldSpecificCountry.toggle(false);
                    }
                } );

                this.fieldStartDate = new mw.widgets.DateInputWidget( {
                    icon: 'calendar',
                    classes: [ 'full-width' ],
                    placeholderLabel: gadgetMsg[ 'start-date-placeholder' ],
                    required: true
                } );

                this.fieldEndDate = new mw.widgets.DateInputWidget( {
                    icon: 'calendar',
                    classes: [ 'full-width' ],
                    placeholderLabel: gadgetMsg[ 'end-date-placeholder' ],
                    required: true
                } );

                this.fieldSet = new OO.ui.FieldsetLayout( {
                    items: [
                        new OO.ui.FieldLayout(
                            this.fieldQuantitativeSearchType,
                            {
                                label: gadgetMsg[ 'advance-step-one-label' ],
                                align: 'top'
                            }
                        ),
                        new OO.ui.FieldLayout(
                            this.fieldQueryObject,
                            {
                                label: gadgetMsg[ 'advance-step-two-label' ],
                                align: 'top'
                            }
                        ),
                        new OO.ui.FieldLayout(
                            this.fieldQuerySubject,
                            {
                                label: gadgetMsg[ 'advance-step-three-label' ],
                                align: 'top'
                            }
                        ),
                        new OO.ui.FieldLayout(
                            this.fieldAffiliateSearchType,
                            {
                                label: gadgetMsg[ 'advance-step-four-label' ],
                                align: 'top'
                            }
                        ),
                        new OO.ui.FieldLayout(
                            this.fieldSpecificAffiliate,
                            {
                                align: 'inline'
                            }
                        ),
                        new OO.ui.FieldLayout(
                            this.fieldAffiliateSearchTypeByRegion,
                            {
                                label: gadgetMsg[ 'advance-step-five-label' ],
                                align: 'top'
                            }
                        ),
                        new OO.ui.FieldLayout(
                            this.fieldSpecificCountry,
                            {
                                align: 'inline'
                            }
                        ),
                        new OO.ui.FieldLayout(
                            this.fieldStartDate,
                            {
                                label: gadgetMsg[ 'advance-step-six-label' ],
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
                    ]
                } );

                /** Toggle switch to toggle modes/windows */
                this.fieldToggleSwitch = new OO.ui.ToggleSwitchWidget( {
                    value: true
                } );

                this.fieldSet.addItems( [
                    new OO.ui.FieldLayout( this.fieldToggleSwitch, {
                        label: new OO.ui.HtmlSnippet( '<b>' + gadgetMsg[ 'toggle-switch-advance-mode' ] + '</b>' ),
                        align: 'top'
                    } )
                ] );

                this.fieldToggleSwitch.on( 'change', function () {
                    // Close the basic window & open the advance window.
                    dialog.close();
                    openBasicWindow( {} );
                } );

                this.content.$element.append( this.fieldSet.$element );
                this.$body.append( this.content.$element );
            };

            AdvanceArpQueryForm.prototype.executeSearch = function ( deleteFlag ) {
                alert( "Work In Progress..." );
            };


            /**
             * Use the initialize() method to add content to the dialog's $body,
             * to initialize widgets, and to set up event handlers.
             */
            ArpQueryForm.prototype.initialize = function () {
                var dialog;
                dialog = this;

                ArpQueryForm.super.prototype.initialize.call( this );
                this.content = new OO.ui.PanelLayout( {
                    padded: true,
                    expanded: false
                } );

                this.$body.append( '<p style="background-color: #87CEFA; text-align: center;"><br/>' + gadgetMsg[ 'wadqp-header-text' ] + '<br/><br/></p>' );

                /** -- Compliance Status -- */
                this.fieldSet1 = new OO.ui.FieldsetLayout( {
                    label: gadgetMsg[ 'compliance-status' ],
                } );

                this.fieldComplianceStatus = new OO.ui.RadioInputWidget( {
                    name: 'mqw-ui-question',
                    value: 'ARP-Q3',
                } );

                this.fieldSet1.addItems( [
                    new OO.ui.FieldLayout( this.fieldComplianceStatus, { label: gadgetMsg[ 'compliance-status-question' ], align: 'inline' } ),
                ] );

                /** -- Affiliate Count -- */
                this.fieldSet2 = new OO.ui.FieldsetLayout( {
                    label: gadgetMsg[ 'affiliate-counts' ],
                } );

                this.fieldAffiliateCount = new OO.ui.RadioInputWidget( {
                    name: 'mqw-ui-question',
                    value: 'ARP-Q1',
                } );

                this.fieldSet2.addItems( [
                    new OO.ui.FieldLayout( this.fieldAffiliateCount, { label: gadgetMsg[ 'affiliate-count-question' ], align: 'inline' } ),
                ] );


                /** -- Affiliate Composition -- */
                this.fieldSet3 = new OO.ui.FieldsetLayout( {
                    label: gadgetMsg[ 'affiliate-composition' ],
                } );

                this.fieldAffiliateComposition1 = new OO.ui.RadioInputWidget( {
                    name: 'mqw-ui-question',
                    value: 'ARP-Q7',
                } );
                this.fieldAffiliateComposition2 = new OO.ui.RadioInputWidget( {
                    name: 'mqw-ui-question',
                    value: 'ARP-Q8',
                } );

                this.fieldSet3.addItems( [
                    new OO.ui.FieldLayout( this.fieldAffiliateComposition1, { label: gadgetMsg[ 'affiliate-composition-question-one' ], align: 'inline' } ),
                    new OO.ui.FieldLayout( this.fieldAffiliateComposition2, { label: gadgetMsg[ 'affiliate-composition-question-two' ], align: 'inline' } ),
                ] );

                /** -- Legal Status -- */
                this.fieldSet4 = new OO.ui.FieldsetLayout( {
                    label: gadgetMsg[ 'legal-status' ],
                } );

                this.fieldLegalStatus = new OO.ui.RadioInputWidget( {
                    name: 'mqw-ui-question',
                    value: 'ARP-Q2',
                } );

                this.fieldSet4.addItems( [
                    new OO.ui.FieldLayout( this.fieldLegalStatus, { label: gadgetMsg[ 'legal-status-query-question' ], align: 'inline' } ),
                ] );

                /** -- Programs -- */
                this.fieldSet5 = new OO.ui.FieldsetLayout( {
                    label: gadgetMsg[ 'programs-label' ],
                } );

                this.fieldPrograms1 = new OO.ui.RadioInputWidget( {
                    name: 'mqw-ui-question',
                    value: 'ARP-Q5',
                } );
                this.fieldPrograms2 = new OO.ui.RadioInputWidget( {
                    name: 'mqw-ui-question',
                    value: 'ARP-Q6',
                } );

                this.fieldSet5.addItems( [
                    new OO.ui.FieldLayout( this.fieldPrograms1, { label: gadgetMsg[ 'programs-glam-question' ], align: 'inline' } ),
                    new OO.ui.FieldLayout( this.fieldPrograms2, { label: gadgetMsg[ 'programs-education-question' ], align: 'inline' } ),
                ] );

                /** Toggle switch to toggle modes/windows */
                this.fieldSet6 = new OO.ui.FieldsetLayout( {
                    label: gadgetMsg[ 'toggle-switch-basic-mode' ],
                } );

                this.fieldToggleSwitch = new OO.ui.ToggleSwitchWidget();

                this.fieldSet6.addItems( [
                    new OO.ui.FieldLayout( this.fieldToggleSwitch, {
                        label: '',
                        align: 'top'
                    } )
                ] );

                this.fieldToggleSwitch.on( 'change', function () {
                    // Close the basic window & open the advance window.
                    dialog.close();
                    openAdvanceWindow( {} );
                } );

                /** Will be activated in the future
                 this.fieldAdvocacy = new OO.ui.RadioSelectWidget( {
					items: [
						new OO.ui.RadioOptionWidget( {
							data: 'Yes',
							label: gadgetMsg[ 'advocacy-question' ]
						} )
					]
				} );
                 */

                // Append things to fieldSet
                /** -- this.fieldSet = new OO.ui.FieldsetLayout( {
					items: [
						new OO.ui.FieldLayout(
							this.fieldAdvocacy,
							{
								label: 'Advocacy:',
								align: 'top',
								classes: [ 'bold-label' ]
							}
						)
					]
				} ); -- */

                // When everything is done
                this.content.$element.append( this.fieldSet1.$element );
                this.content.$element.append( this.fieldSet2.$element );
                this.content.$element.append( this.fieldSet3.$element );
                this.content.$element.append( this.fieldSet4.$element );
                this.content.$element.append( this.fieldSet5.$element );
                this.content.$element.append( this.fieldSet6.$element );
                this.$body.append( this.content.$element );
            };

            /**
             * Set custom height for the modal window
             */
            ArpQueryForm.prototype.getBodyHeight = function () {
                return 580;
            };

            /**
             * In the event "Select" is pressed
             */
            ArpQueryForm.prototype.getActionProcess = function ( action ) {
                var dialog = this;
                if (
                    action === 'continue'
                    && ( dialog.fieldComplianceStatus.isSelected()
                        || dialog.fieldAffiliateCount.isSelected()
                        || dialog.fieldLegalStatus.isSelected()
                        || dialog.fieldAffiliateComposition1.isSelected()
                        || dialog.fieldAffiliateComposition2.isSelected()
                        || dialog.fieldPrograms1.isSelected()
                        || dialog.fieldPrograms2.isSelected()
                    )
                ) {
                    return new OO.ui.Process( function () {
                        dialog.executeSearch();
                    } );
                } else {
                    return new OO.ui.Process( function () {
                        dialog.close();
                    } );
                }
            };

            /**
             * Execute the search query - from Layer I to Layer II
             */
            ArpQueryForm.prototype.executeSearch = function ( deleteFlag ) {
                var dialog = this, content, activities_reports, endFY,
                    fyIdentifier;

                dialog.pushPending();

                new mw.Api().get( getActivitiesReportsContentModuleQuery() ).done( function ( data ) {
                    activities_reports = parseContentModule( data.query.pages );
                } );

                new mw.Api().get( getOrgInfoContentModuleQuery() ).done( function ( data ) {
                    var i, j, handler, entries, entry, a_report;
                    var windowManager = new OO.ui.WindowManager();

                    /** ARP-Q1 implementation */
                    if ( dialog.fieldAffiliateCount.isSelected() && dialog.fieldAffiliateCount.getValue() === 'ARP-Q1' ) {
                        var ug_count = 0, chpt_count = 0, thorg_count = 0;
                        entries = parseContentModule( data.query.pages );
                        counter = luaTableCounter( entries );

                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            if ( entry.recognition_status !== 'derecognised' ) {
                                if ( entry.org_type === 'User Group' ) {
                                    ug_count = ug_count + 1;
                                }

                                if ( entry.org_type === 'Chapter' ) {
                                    chpt_count = chpt_count + 1;
                                }

                                if ( entry.org_type === 'Thematic Organization' ) {
                                    thorg_count = thorg_count + 1;
                                }
                            }
                        }

                        dialog.close();

                        queryInfo = [
                            dialog.fieldAffiliateCount.getValue(),
                            gadgetMsg[ 'affiliate-count-question' ],
                            counter.toString() + ' ' + gadgetMsg[ 'arp-q1-results-s1' ] + ' '
                            + chpt_count.toString() + ' ' + gadgetMsg[ 'arp-q1-results-s2' ] + ' '
                            + thorg_count.toString() + ' ' + gadgetMsg[ 'arp-q1-results-s3' ] + ' '
                            + ug_count.toString() + ' ' + gadgetMsg[ 'arp-q1-results-s4' ]
                        ];

                        clearCounter();
                        openSubWindow( {} );
                    } else if ( dialog.fieldLegalStatus.isSelected() && dialog.fieldLegalStatus.getValue() === 'ARP-Q2' ) {
                        var notLegalEntitiesCount = 0, orgInfoCount = 0;

                        entries = parseContentModule( data.query.pages );
                        orgInfoCount = luaTableCounter( entries ); // cache in `counter`

                        // Set counter to 0 (clear cache) as we've used it above
                        clearCounter();

                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            if (
                                ( entry.org_type === 'Thematic Organization' || entry.org_type === 'Chapter'
                                    || ( entry.org_type === 'User Group' && entry.legal_entity === 'Yes' ) )
                                && entry.recognition_status !== 'derecognised'
                            ) {
                                counter = counter + 1;
                            }
                        }

                        // Get count of entities that are not registered as legal entities
                        notLegalEntitiesCount = orgInfoCount - counter;

                        dialog.close();

                        queryInfo = [
                            dialog.fieldLegalStatus.getValue(),
                            gadgetMsg[ 'legal-status-query-question' ],
                            counter.toString() + ' ' + gadgetMsg[ 'arp-q2-results' ]
                        ];

                        clearCounter();
                        openSubWindow( {} );
                    } else if ( dialog.fieldComplianceStatus.isSelected() && dialog.fieldComplianceStatus.getValue() === 'ARP-Q3' ) {
                        entries = parseContentModule( data.query.pages );

                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            if (
                                ( entry.uptodate_reporting === 'Tick' || entry.uptodate_reporting === 'Tick-N')
                                && entry.recognition_status !== 'derecognised'
                            ) {
                                percentage = percentage + 1;
                            }
                        }

                        // Compute compliance percentage
                        percentage = ( ( percentage / luaTableCounter(entries) ) * 100 ).toFixed(0);
                        percentage = Math.ceil( percentage );

                        dialog.close();

                        queryInfo = [
                            dialog.fieldComplianceStatus.getValue(),
                            gadgetMsg[ 'compliance-status-question' ],
                            '<b>' + percentage.toString() + '%</b> ' + gadgetMsg[ 'arp-q3-results' ]
                        ];

                        clearCounter();
                        // Clear `percentage` variable
                        percentage = 0;
                        openSubWindow( {} );
                    } else if ( dialog.fieldPrograms1.isSelected() && dialog.fieldPrograms1.getValue() === 'ARP-Q5' ) {
                        entries = parseContentModule( data.query.pages );
                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            for ( j = 0; j < activities_reports.length; j++ ) {
                                a_report = cleanRawEntry( activities_reports[j].value.fields );
                                if (
                                    entry.group_name === a_report.group_name
                                    && entry.org_type !== 'Allied or other organization'
                                    && ( a_report.partnership_info !== undefined && a_report.partnership_info.length > 0 )
                                    && ( a_report.end_date.split("/")[2] == parseInt( new Date().getFullYear() ) - 1 )
                                    && a_report.partnership_info.includes( "GLAM Institutions" )
                                    && entry.recognition_status !== 'derecognised'
                                ) {
                                    counter = counter + 1;
                                    break;
                                }
                            }
                        }

                        // Calculate current year and use as FY end date
                        endFY = parseInt( new Date().getFullYear() ) - 1;
                        fyIdentifier = endFY - 1;

                        dialog.close();

                        queryInfo = [
                            dialog.fieldPrograms1.getValue(),
                            gadgetMsg[ 'how-many-affiliates-with-glam-partnerships-past-year' ],
                            '<b>' + counter.toString() + '</b> ' + gadgetMsg[ 'arp-q5-results' ] + ' (' + fyIdentifier + '-' + endFY +')'
                        ];

                        clearCounter();
                        openSubWindow( {} );
                    } else if ( dialog.fieldPrograms2.isSelected() && dialog.fieldPrograms2.getValue() === 'ARP-Q6' ) {
                        entries = parseContentModule( data.query.pages );
                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            for ( j = 0; j < activities_reports.length; j++ ) {
                                a_report = cleanRawEntry( activities_reports[j].value.fields );
                                if (
                                    entry.group_name === a_report.group_name
                                    && entry.org_type !== 'Allied or other organization'
                                    && ( a_report.partnership_info !== undefined && a_report.partnership_info.length > 0 )
                                    && ( a_report.end_date.split("/")[2] == parseInt( new Date().getFullYear() ) - 1 )
                                    && a_report.partnership_info.includes( "Educational Institutions" )
                                    && entry.recognition_status !== 'derecognised'
                                ) {
                                    counter = counter + 1;
                                    break;
                                }
                            }
                        }

                        // Calculate current year and use as FY end date
                        endFY = parseInt( new Date().getFullYear() ) - 1;
                        fyIdentifier = endFY - 1;

                        dialog.close();

                        queryInfo = [
                            dialog.fieldPrograms2.getValue(),
                            gadgetMsg[ 'how-many-affiliates-with-education-partnerships-past-year' ],
                            '<b>' + counter.toString() + '</b> ' + gadgetMsg[ 'arp-q6-results' ] + ' (' + fyIdentifier + '-' + endFY +')'
                        ];

                        clearCounter();
                        openSubWindow( {} );
                    } else if ( dialog.fieldAffiliateComposition1.isSelected() && dialog.fieldAffiliateComposition1.getValue() === 'ARP-Q7' ) {
                        var count = 0;
                        entries = parseContentModule( data.query.pages );
                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            count = parseInt( entry.member_count );
                            if ( entry.org_type !== 'Allied or other organization' && count > 0 && entry.recognition_status !== 'derecognised' ) {
                                counter += count;
                            }
                        }

                        dialog.close();

                        queryInfo = [
                            dialog.fieldAffiliateComposition1.getValue(),
                            gadgetMsg[ 'affiliate-composition-question-one' ],
                            gadgetMsg[ 'arp-q7-results' ] + ' <b>' + counter.toString() + '</b>'
                        ];

                        clearCounter();
                        openSubWindow( {} );
                    } else if ( dialog.fieldAffiliateComposition2.isSelected() && dialog.fieldAffiliateComposition2.getValue() === 'ARP-Q8' ) {
                        var affiliate_structures = {
                            'board': 0,
                            'democratic_process': 0,
                            'consensus_decision': 0,
                            'no_shared_structure': 0
                        };

                        entries = parseContentModule( data.query.pages );
                        counter = luaTableCounter( entries );

                        for ( i = 0; i < entries.length; i++ ) {
                            entry = cleanRawEntry( entries[ i ].value.fields );
                            if ( entry.org_type !== 'Allied or other organization' || entry.recognition_status !== 'derecognised' ) {
                                if ( entry.dm_structure !== undefined && entry.dm_structure.length > 0 ) {
                                    /* For board structures */
                                    if ( entry.dm_structure.includes( "Board" ) ) {
                                        affiliate_structures.board += 1;
                                    }
                                    /* For democratic process structures */
                                    else if ( entry.dm_structure.includes( "Democratic Process" ) ) {
                                        affiliate_structures.democratic_process += 1;
                                    }
                                    /* For consensus decision structures */
                                    else if ( entry.dm_structure.includes( "Consensus Decision Making" ) ) {
                                        affiliate_structures.consensus_decision += 1;
                                    }
                                    /* For no shared structures */
                                    else if ( entry.dm_structure.includes( "No Shared Structure" ) ) {
                                        affiliate_structures.no_shared_structure += 1;
                                    }
                                }
                            }
                        }

                        dialog.close();

                        /* Compute the percentages */
                        affiliate_structures.board = ( ( affiliate_structures.board / counter ) * 100 ).toFixed( 0 );
                        affiliate_structures.democratic_process = ( ( affiliate_structures.democratic_process / counter ) * 100 ).toFixed( 0 );
                        affiliate_structures.consensus_decision = ( ( affiliate_structures.consensus_decision / counter ) * 100 ).toFixed( 0 );
                        affiliate_structures.no_shared_structure = ( ( affiliate_structures.no_shared_structure / counter ) * 100 ).toFixed( 0 );

                        queryInfo = [
                            dialog.fieldAffiliateComposition2.getValue(),
                            gadgetMsg[ 'affiliate-composition-question-two' ],
                            gadgetMsg[ 'arp-q8-results' ]+ ' <br/><b> ' + affiliate_structures.board.toString() + gadgetMsg[ 'arp-q8-board' ] + '</b><br/><b>'
                            + affiliate_structures.democratic_process.toString() + gadgetMsg[ 'arp-q8-democratic-process' ] + '</b><br/><b>'
                            + affiliate_structures.consensus_decision.toString() + gadgetMsg[ 'arp-q8-consensus' ] + '</b><br/><b>'
                            + affiliate_structures.no_shared_structure.toString() + gadgetMsg[ 'arp-q8-no-shared-structure' ] + '</b>'
                        ];

                        clearCounter();
                        openSubWindow( {} );
                    } else {
                        dialog.close();

                        $( 'body' ).append( windowManager.$element );
                        // Add the dialog to the window manager.
                        windowManager.addWindows( [ messageDialog ] );

                        // Configure the message dialog when it is opened with the window manager's openWindow() method.
                        windowManager.openWindow( messageDialog, {
                            title: gadgetMsg[ 'wad-query-404' ],
                            message: gadgetMsg[ 'wadp-404-response-message-body' ],
                            actions: [
                                {
                                    action: 'accept',
                                    label: 'Dismiss',
                                    flags: 'primary'
                                }
                            ]
                        });
                    }
                } );
            };

            /**
             * The basic dialog / window to be displayed as Form.
             * @param {Object} config
             */
            openBasicWindow = function ( config ) {
                var arpQueryForm;
                config.size = 'medium';
                arpQueryForm = new ArpQueryForm( config );

                windowManager = new OO.ui.WindowManager();
                $( 'body' ).append( windowManager.$element );
                windowManager.addWindows( [ arpQueryForm ] );
                windowManager.openWindow( arpQueryForm );
            };

            /**
             * The advanced dialog / window to be displayed on toggle.
             * @param {Object} config
             */
            openAdvanceWindow = function ( config ) {
                var advanceArpQueryForm;
                config.size = 'medium';
                advanceArpQueryForm = new AdvanceArpQueryForm( config );

                windowManager = new OO.ui.WindowManager();
                $( 'body' ).append( windowManager.$element );
                windowManager.addWindows( [ advanceArpQueryForm ] );
                windowManager.openWindow( advanceArpQueryForm );
            };

            /**
             * Sub window / dialog for sub queries in the WAD
             * portal query system.
             * @param {Object} config
             */
            openSubWindow = function ( config ) {
                var arpSubQueryForm;
                config.size = 'medium';
                arpSubQueryForm = new ArpSubQueryForm( config );

                windowManager = new OO.ui.WindowManager();
                $( 'body' ).append( windowManager.$element );
                windowManager.addWindows( [ arpSubQueryForm ] );
                windowManager.openWindow( arpSubQueryForm );
            };

            /**
             * Leaf window / dialog for sub queries in the WAD
             * portal query system.
             * @param {Object} config
             */
            openLeafWindow = function ( config ) {
                var arpLeafWindow;
                config.size = 'medium';
                arpLeafWindow = new ArpSubQueryLeafWindow( config );

                windowManager = new OO.ui.WindowManager();
                $( 'body' ).append( windowManager.$element );
                windowManager.addWindows( [ arpLeafWindow ] );
                windowManager.openWindow( arpLeafWindow );
            };

            /* Open up a dialog when a new query is to be executed */
            $( '.arpQueryForm' ).on( 'click', function () {
                // (Disabled) This is where QP form views tracking used to happen.
                // https://meta.wikimedia.org/w/index.php?title=Talk:Wikimedia_Affiliates_Data_Portal&oldid=20148566
                // https://meta.wikimedia.org/w/index.php?title=MediaWiki:Gadget-arpQueryForm.js&diff=20148737
                openBasicWindow( {} );
            } );
        } ).fail( function() {
            alert( gadgetMsg[ 'gadget-failed-to-load-translation-strings' ] );
        } );
    } );
}() );
