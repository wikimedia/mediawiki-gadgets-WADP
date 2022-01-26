/**
 * Organizational Information Form (module)
 * @author Derick Alangi (WMF)
 */
( function () {
    'use strict';

    /** M&E staff list */
    var users = [
        'DAlangi (WMF)',
        'DNdubane (WMF)',
        'MKaur (WMF)'
    ];

    var gadgetMsg = {},
        getRelevantRawEntry,
        parseContentModule,
        openWindow,
        userLang,
        cleanRawEntry,
        windowManager,
        AffiliateLookupTextInputWidget,
        CountryLookupTextInputWidget,
        getContentList,
        generateKeyValuePair,
        sanitizeInput,
        convertDateToDdMmYyyyFormat,
        convertDateToYyyyMmDdFormat,
        fieldDerecognitionDate,
        fieldDerecognitionNote,
        getModuleContent,
        getWikiPageContent;

    userLang = mw.config.get( 'wgUserLanguage' );

    // This is called after translation messages are ready
    function initAfterMessages() {
        /**
         * Provides API parameters for getting module content
         * specified by `moduleName`.
         *
         * @param {string} moduleName
         * @return {Object}
         */
        getModuleContent = function ( moduleName ) {
            return {
                action: 'query',
                prop: 'revisions',
                titles: 'Module:' + moduleName,
                rvprop: 'content',
                rvlimit: 1
            };
        };

        /**
         * Provides API parameters for getting the content
         * of a page specified by `pageName`
         *
         * @param {string} pageName
         * @return {Object}
         */
        getWikiPageContent = function ( pageName ) {
            return {
                action: 'query',
                prop: 'revisions',
                titles: pageName,
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
            var splitted_date;
            // Put in a format our lua script will feed on, in DD/MM/YYYY format
            splitted_date = date.split('-');
            date = splitted_date[2] + "/" + splitted_date[1] + "/" + splitted_date[0];

            return date;
        };

        /**
         * Convert date to DD/MM/YYYY format
         * @param {string} date
         *
         * @return {string} date
         */
        convertDateToYyyyMmDdFormat = function ( date ) {
            var splitted_date;
            // Put in a format our calendar OOUI will feed on, in YYYY-MM-DD format
            splitted_date = date.split('/');
            date = splitted_date[2] + "-" + splitted_date[1] + "-" + splitted_date[0];

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
            if ( k === 'dm_structure' ) {
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
         * Takes Lua-formatted content from [[Module:Organizational_Informations]] and
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
                } else {
                    entryData[ relevantRawEntry[ i ].key.name ] = relevantRawEntry[ i ].value.value;
                }
            }
            return entryData;
        };

        /**
         * Get an entire content (wikitext) of a given page
         *
         * @param {Object} sourceblob The original API return
         * @return {Object} raw Entire page content (wikitext)
         */
        getContentList = function ( sourceblob ) {
            var i, raw;
            for ( i in sourceblob ) {  // should only be one result
                raw = sourceblob[ i ].revisions[ 0 ][ '*' ];
                return raw;
            }
        };

        /**
         * Method to lookup affiliate names from
         * [[m:Wikimedia_Affiliates_Data_Portal/MRL/List_Of_All_Wikimedia_Affiliates]]
         * and to be used as autocomplete form element in the forms
         */
        AffiliateLookupTextInputWidget = function AffiliatesLookupTextInputWidget( config ) {
            // Parent constructor
            OO.ui.TextInputWidget.call( this, $.extend(
                {
                    icon: 'userGroup',
                    id: 'group_name',
                    indicator: 'required',
                    required: true,
                    validate: 'text',
                    value: config,
                    placeholder: gadgetMsg[ 'group-name-placeholder' ]
                }, config
            ) );
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
                return new mw.Api().get(
                    getWikiPageContent( 'Wikimedia_Affiliates_Data_Portal/MRL/List_Of_All_Wikimedia_Affiliates' )
                ).then( function ( data ) {
                    var affiliates, affiliatesContent;
                    affiliatesContent = getContentList( data.query.pages );
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

        /**
         * Get a list of menu option widgets from the (possibly cached) data
         * returned by #getLookupCacheDataFromResponse.
         */
        AffiliateLookupTextInputWidget.prototype.getLookupMenuOptionsFromData = function ( data ) {
            var items = [], i, affiliate;

            for ( i = 0; i < data.length; i++ ) {
                affiliate = String( data[ i ] );
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
        CountryLookupTextInputWidget = function CountriesLookupTextInputWidget( config ) {
            // Parent constructor
            OO.ui.TextInputWidget.call( this, $.extend(
                {
                    icon: 'mapPin',
                    id: 'country',
                    indicator: 'required',
                    required: true,
                    validate: 'text',
                    value: config,
                    placeholder: gadgetMsg[ 'affiliate-country-placeholder' ]
                }, config
            ) );
            // Mixin constructors
            OO.ui.mixin.LookupElement.call( this, config );
        };
        OO.inheritClass( CountryLookupTextInputWidget, OO.ui.TextInputWidget );
        OO.mixinClass( CountryLookupTextInputWidget, OO.ui.mixin.LookupElement );

        /* Get a new request object of the current lookup query value. */
        CountryLookupTextInputWidget.prototype.getLookupRequest = function () {
            var value = this.getValue();
            return this.getValidity().then( function () {
                // Query the API to get the list of countries
                return new mw.Api().get(
                    getWikiPageContent( 'Wikimedia_Affiliates_Data_Portal/MRL/List_Of_All_Countries' )
                ).then( function ( data ) {
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

        /**
         * Subclass ProcessDialog
         *
         * @class OrgInfoEditor
         * @extends OO.ui.ProcessDialog
         *
         * @constructor
         * @param {Object} config
         */
        function OrgInfoEditor( config ) {
            this.affiliate_code = '';
            this.group_name = '';
            this.org_type = '';
            this.region = '';
            this.group_country = '';
            this.legal_entity = '';
            this.mission_changed = '';
            this.explanation = '';
            this.group_page = '';
            this.member_count = '';
            this.non_editors_count = '';
            this.facebook = '';
            this.twitter = '';
            this.other = '';
            this.dm_structure = []; // dm = decision making
            this.group_contact1 = '';
            this.group_contact2 = '';
            this.board_contacts = '';
            this.agreement_date = '';
            this.fiscal_year_start = '';
            this.fiscal_year_end = '';
            this.uptodate_reporting = '';
            this.recognition_status = '';
            this.me_bypass_ooc_autochecks = '';
            this.out_of_compliance_level = '';
            this.reporting_due_date = '';
            this.dos_stamp = '';

            if ( config.unique_id ) {
                this.uniqueId = config.unique_id;
            }
            if ( config.affiliate_code ) {
                this.affiliate_code = config.affiliate_code;
            }
            if ( config.group_name ) {
                this.group_name = config.group_name;
            }
            if ( config.org_type ) {
                this.org_type = config.org_type;
            }
            if ( config.region ) {
                this.region = config.region;
            }
            if ( config.group_country ) {
                this.group_country = config.group_country;
            }
            if ( config.legal_entity ) {
                this.legal_entity = config.legal_entity;
            }
            if ( config.mission_changed ) {
                this.mission_changed = config.mission_changed;
            }
            if ( config.explanation ) {
                this.explanation = config.explanation;
            }
            if ( config.group_page ) {
                this.group_page = config.group_page;
            }
            if ( config.member_count ) {
                this.member_count = config.member_count;
            }
            if ( config.non_editors_count ) {
                this.non_editors_count = config.non_editors_count;
            }
            if ( config.facebook ) {
                this.facebook = config.facebook;
            }
            if ( config.twitter ) {
                this.twitter = config.twitter;
            }
            if ( config.other ) {
                this.other = config.other;
            }
            if ( config.dm_structure ) {
                this.dm_structure = config.dm_structure;
            }
            if ( config.group_contact1 ) {
                this.group_contact1 = config.group_contact1;
            }
            if ( config.group_contact2 ) {
                this.group_contact2 = config.group_contact2;
            }
            if ( config.board_contacts ) {
                this.board_contacts = config.board_contacts;
            }
            if ( config.agreement_date ) {
                this.agreement_date = config.agreement_date;
            }
            if ( config.fiscal_year_start ) {
                this.fiscal_year_start = config.fiscal_year_start;
            }
            if ( config.fiscal_year_end ) {
                this.fiscal_year_end = config.fiscal_year_end;
            }
            if ( config.uptodate_reporting ) {
                this.uptodate_reporting = config.uptodate_reporting;
            }
            if ( config.notes_on_reporting ) {
                this.notes_on_reporting = config.notes_on_reporting;
            }
            if ( config.recognition_status ) {
                this.recognition_status = config.recognition_status;
            }
            if ( config.me_bypass_ooc_autochecks ) {
                this.me_bypass_ooc_autochecks = config.me_bypass_ooc_autochecks;
            }
            if ( config.out_of_compliance_level ) {
                this.out_of_compliance_level = config.out_of_compliance_level;
            }
            if ( config.reporting_due_date ) {
                this.reporting_due_date = config.reporting_due_date;
            }
            if ( config.derecognition_date ) {
                this.derecognition_date = config.derecognition_date;
            }
            if ( config.derecognition_note ) {
                this.derecognition_note = config.derecognition_note;
            }
            if ( config.dos_stamp ) {
                this.dos_stamp = config.dos_stamp;
            }
            OrgInfoEditor.super.call( this, config );
        }
        OO.inheritClass( OrgInfoEditor, OO.ui.ProcessDialog );

        OrgInfoEditor.static.name = 'orginfoEditor';
        OrgInfoEditor.static.title = gadgetMsg[ 'org-info-header' ];
        OrgInfoEditor.static.actions = [
            {
                action: 'continue',
                modes: 'edit',
                label: gadgetMsg[ 'submit-button' ],
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
        OrgInfoEditor.prototype.initialize = function () {
            var i, fieldDMStructureSelected, dm_structure = [], fieldMEByPass, fieldMEByPassReason;

            OrgInfoEditor.super.prototype.initialize.call( this );
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
                id: 'wadp-popup-widget-position'
            } );

            this.fieldGroupCode = new OO.ui.TextInputWidget( {
                icon: 'code',
                value: this.affiliate_code,
                type: 'text',
                indicator: 'required',
                required: true,
                placeholder: gadgetMsg[ 'group-code-placeholder' ]
            } );

            // On edit, pass in the group name as config to be rendered.
            this.fieldGroupName = new AffiliateLookupTextInputWidget( this.group_name );

            this.fieldOrgType = new OO.ui.DropdownInputWidget( {
                options: [
                    {
                        data: 'User Group',
                        label: gadgetMsg[ 'user-group' ]
                    },
                    {
                        data: 'Chapter',
                        label: gadgetMsg[ 'chapter' ]
                    },
                    {
                        data: 'Thematic Organization',
                        label: gadgetMsg[ 'thematic-organization' ]
                    },
                    {
                        data: 'Allied or other organization',
                        label: gadgetMsg[ 'allied-or-other-organization' ]
                    }
                ]
            } );
            if ( this.org_type ) {
                this.fieldOrgType.setValue( this.org_type );
            }

            this.fieldRegion = new OO.ui.DropdownInputWidget( {
                options: [
                    {
                        data: 'International',
                        label: gadgetMsg[ 'international' ]
                    },
                    {
                        data: 'Sub-Saharan Africa',
                        label: gadgetMsg[ 'sub-saharan-africa' ]
                    },
                    {
                        data: 'Asia/Pacific',
                        label: gadgetMsg[ 'asia-pacific' ]
                    },
                    {
                        data: 'Europe',
                        label: gadgetMsg[ 'europe' ]
                    },
                    {
                        data: 'MENA',
                        label: gadgetMsg[ 'mena' ]
                    },
                    {
                        data: 'North America',
                        label: gadgetMsg[ 'north-america' ]
                    },
                    {
                        data: 'South/Latin America',
                        label: gadgetMsg[ 'south-latin-america' ]
                    }
                ]
            } );
            if ( this.region ) {
                this.fieldRegion.setValue( this.region );
            }

            this.fieldGroupCountry = new CountryLookupTextInputWidget( this.group_country );

            this.fieldLegalEntity = new OO.ui.RadioSelectWidget( {
                classes: [ 'radio-inline' ],
                items: [
                    new OO.ui.RadioOptionWidget( {
                        data: 'Yes',
                        label: gadgetMsg[ 'yes-response' ]
                    } ),
                    new OO.ui.RadioOptionWidget( {
                        data: 'No',
                        label: gadgetMsg[ 'no-response' ]
                    } )
                ]
            } );
            // On edit, select the option that was previously submitted
            if ( this.legal_entity ) {
                this.fieldLegalEntity.selectItemByData( this.legal_entity );
            }

            this.fieldMissionChanged = new OO.ui.RadioSelectWidget( {
                classes: [ 'radio-inline' ],
                items: [
                    new OO.ui.RadioOptionWidget( {
                        data: 'Yes',
                        label: gadgetMsg[ 'yes-response' ]
                    } ),
                    new OO.ui.RadioOptionWidget( {
                        data: 'No',
                        label: gadgetMsg[ 'no-response' ]
                    } ),
                    new OO.ui.RadioOptionWidget( {
                        data: 'Not sure',
                        label: gadgetMsg[ 'not-sure-response' ]
                    } )
                ]
            } );
            // On edit, select the option that was previously submitted
            if ( this.mission_changed ) {
                this.fieldMissionChanged.selectItemByData( this.mission_changed );
            }

            this.fieldExplanation = new OO.ui.MultilineTextInputWidget( {
                icon: 'textFlow',
                value: this.explanation,
                rows: 3,
                placeholder: gadgetMsg[ 'explanation-text' ]
            } );
            this.fieldGroupMembershipPage = new OO.ui.TextInputWidget( {
                icon: 'link',
                value: this.group_page,
                placeholder: gadgetMsg[ 'group-membership-page-link' ]
            } );
            this.fieldEditorsMemberCount = new OO.ui.TextInputWidget( {
                icon: 'clock',
                value: this.member_count,
                type: 'number',
                indicator: 'required',
                required: true,
                placeholder: gadgetMsg[ 'editors-count-placeholder' ]
            } );
            this.fieldNonEditorsMemberCount = new OO.ui.TextInputWidget( {
                icon: 'clock',
                value: this.non_editors_count,
                type: 'number',
                indicator: 'required',
                required: true,
                placeholder: gadgetMsg[ 'non-editors-count-placeholder' ]
            } );
            this.fieldFacebook = new OO.ui.TextInputWidget( {
                labelPosition: 'before',
                icon: 'link',
                type: 'url',
                value: this.facebook,
                label: 'Facebook: '
            } );
            this.fieldTwitter = new OO.ui.TextInputWidget( {
                labelPosition: 'before',
                classes: [ 'full-width' ],
                icon: 'link',
                type: 'url',
                value: this.twitter,
                label: 'Twitter: '
            } );
            this.fieldOther = new OO.ui.TextInputWidget( {
                labelPosition: 'before',
                classes: [ 'full-width' ],
                icon: 'link',
                type: 'url',
                value: this.other,
                label: 'Blog/news: '
            } );

            fieldDMStructureSelected = [];
            for ( i = 0; i < dm_structure.length; i++ ) {
                fieldDMStructureSelected.push( {
                    data: dm_structure[ i ],
                    label: gadgetMsg[ dm_structure[ i ].toLowerCase().replace( / /g, '-' ) + '-structure' ]
                } );
            }
            this.fieldDecisionMakingStructure = new OO.ui.CheckboxMultiselectWidget( {
                classes: [ 'checkbox-inline' ],
                selected: fieldDMStructureSelected,
                items: [
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'Board',
                        label: gadgetMsg[ 'board-structure' ]
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'Consensus Decision Making',
                        label: gadgetMsg[ 'consensus-decision-making-structure' ]
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'Democratic Process',
                        label: gadgetMsg[ 'democratic-process-structure' ]
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'No Shared Structure',
                        label: gadgetMsg[ 'no-shared-structure-structure' ]
                    } )
                ]
            } );
            // On edit, select the option that was previously submitted
            if ( this.dm_structure ) {
                this.fieldDecisionMakingStructure.selectItemsByData( this.dm_structure );
            }

            this.fieldGroupContact1 = new OO.ui.TextInputWidget( {
                labelPosition: 'before',
                label: 'User:',
                value: this.group_contact1.substring(5), // Ignore "User:" part.
                classes: [ 'full-width' ],
                indicator: 'required',
                required: true
            } );

            this.fieldGroupContact2 = new OO.ui.TextInputWidget( {
                labelPosition: 'before',
                label: 'User:',
                value: this.group_contact2.substring(5), // Ignore "User:" part.
                classes: [ 'full-width' ],
                indicator: 'required',
                required: true
            } );

            this.fieldBoardContacts = new OO.ui.MultilineTextInputWidget( {
                icon: 'userContributions',
                value: this.board_contacts,
                rows: 3,
                placeholder: gadgetMsg[ 'board-contacts' ]
            } );

            this.fieldAgreementDate = new mw.widgets.DateInputWidget( {
                value: this.agreement_date ? convertDateToYyyyMmDdFormat( this.agreement_date ) : this.agreement_date,
                classes: [ 'full-width' ],
                placeholderLabel: gadgetMsg[ 'agreement-date' ],
                indicator: 'required',
                required: true
            } );

            this.fieldFiscalYearStart = new OO.ui.TextInputWidget( {
                value: this.fiscal_year_start,
                classes: [ 'full-width' ],
                placeholder: gadgetMsg[ 'fiscal-year-start' ]
            } );

            this.fieldFiscalYearEnd = new OO.ui.TextInputWidget( {
                value: this.fiscal_year_end,
                classes: [ 'full-width' ],
                placeholder: gadgetMsg[ 'fiscal-year-end' ]
            } );

            this.fieldUpToDateReporting = new OO.ui.DropdownInputWidget( {
                options: [
                    {
                        data: 'Tick',
                        label: gadgetMsg[ 'tick' ]
                    },
                    {
                        data: 'Cross',
                        label: gadgetMsg[ 'cross' ]
                    },
                    {
                        data: 'Tick-N',
                        label: gadgetMsg[ 'tick-n' ]
                    },
                    {
                        data: 'Cross-N',
                        label: gadgetMsg[ 'cross-n' ]
                    }
                ]
            } );
            if ( this.uptodate_reporting ) {
                this.fieldUpToDateReporting.setValue( this.uptodate_reporting );
            }

            this.fieldRecognitionStatus = new OO.ui.DropdownInputWidget( {
                options: [
                    {
                        data: 'recognised',
                        label: gadgetMsg[ 'affiliate-recognised' ]
                    },
                    {
                        data: 'derecognised',
                        label: gadgetMsg[ 'affiliate-derecognised' ]
                    },
                    {
                        data: 'suspended',
                        label: gadgetMsg[ 'affiliate-suspended' ]
                    }
                ]
            } );
            if ( this.recognition_status ) {
                this.fieldRecognitionStatus.setValue( this.recognition_status );
            }

            fieldMEByPass = this.fieldMEByPassOOCAutoChecks = new OO.ui.DropdownInputWidget( {
                options: [
                    { data: 'No', },
                    { data: 'Yes', }
                ]
            } );
            if ( this.me_bypass_ooc_autochecks ) {
                this.fieldMEByPassOOCAutoChecks.setValue( this.me_bypass_ooc_autochecks );
            }

            fieldMEByPassReason = this.fieldMEByPassReason = new OO.ui.DropdownInputWidget( {
                options: [
                    { data: 'Report past due' },
                    { data: 'Old report submitted' },
                    { data: 'Empty report submitted' },
                    { data: 'Incomplete report submitted' }
                ]
            } );
            fieldMEByPassReason.toggle();
            fieldMEByPass.on('change', function () {
                if ( fieldMEByPass.getValue() === 'Yes'  ) {
                    fieldMEByPassReason.toggle(true);
                } else {
                    fieldMEByPassReason.toggle(false);
                }
            } );
            if ( this.notes_on_reporting ) {
                this.fieldMEByPassReason.setValue( this.notes_on_reporting );
                fieldMEByPassReason.toggle(true);
            }

            this.fieldOutOfComplianceLevel = new OO.ui.DropdownInputWidget( {
                options: [
                    { data: '0' },
                    { data: '1' },
                    { data: '2' },
                    { data: '3' },
                    { data: '4' },
                    { data: '5' },
                    { data: '6' }
                ]
            } );
            if ( this.out_of_compliance_level ) {
                this.fieldOutOfComplianceLevel.setValue(
                    this.out_of_compliance_level ? this.out_of_compliance_level : 'N/A'
                );
            }

            fieldDerecognitionDate = this.fieldDerecognitionDate = new mw.widgets.DateInputWidget( {
                value: this.derecognition_date ? convertDateToYyyyMmDdFormat( this.derecognition_date ) : this.derecognition_date,
                classes: [ 'full-width' ],
                placeholderLabel: gadgetMsg[ 'derecognition-date' ],
                indicator: 'required',
                required: true
            } );

            fieldDerecognitionNote = this.fieldDerecognitionNote = new OO.ui.TextInputWidget( {
                value: this.derecognition_note,
                placeholder: gadgetMsg[ 'derecognition-note' ]
            } );

            fieldDerecognitionDate.toggle( false );
            fieldDerecognitionNote.toggle( false );

            this.fieldRecognitionStatus.on( 'change', function ( status ) {
                if ( status === 'derecognised' ) {
                    fieldDerecognitionDate.toggle( true );
                    fieldDerecognitionNote.toggle( true );
                } else {
                    fieldDerecognitionDate.toggle( false );
                    fieldDerecognitionNote.toggle( false );
                }
            } );

            /* Get today's date in YYYY/MM/DD format. dos stands for "date of submission" */
            this.dos_stamp = new Date().toJSON().slice(0,10).replace(/-/g,'/');

            this.fieldDateOfSubmission = new OO.ui.TextInputWidget( {
                value: this.dos_stamp,
                type: 'hidden'
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
                    )
                ]
            } );

            if ( users.indexOf( mw.config.values.wgUserName ) > -1 ) {
                this.fieldSet.addItems( [
                    new OO.ui.FieldLayout(
                        this.fieldGroupCode,
                        {
                            label: gadgetMsg['group-code-label'],
                            align: 'top'
                        }
                    )
                ] );
            }

            this.fieldSet.addItems( [
                new OO.ui.FieldLayout(
                    this.fieldOrgType,
                    {
                        label: gadgetMsg[ 'identify-your-organization' ],
                        align: 'top'
                    }
                )
            ] );

            if ( users.indexOf( mw.config.values.wgUserName ) > -1 ) {
                this.fieldSet.addItems( [
                    new OO.ui.FieldLayout(
                        this.fieldRegion,
                        {
                            label: gadgetMsg[ 'group-region' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldGroupCountry,
                        {
                            label: gadgetMsg[ 'affiliate-country' ],
                            align: 'top'
                        }
                    ),
                ] );
            }

            this.fieldSet.addItems( [
                new OO.ui.FieldLayout(
                    this.fieldLegalEntity,
                    {
                        label: gadgetMsg[ 'legal-entity-or-not' ],
                        align: 'top'
                    }
                ),
                new OO.ui.FieldLayout(
                    this.fieldMissionChanged,
                    {
                        label: gadgetMsg[ 'has-group-mission-changed' ],
                        align: 'top'
                    }
                ),
                new OO.ui.FieldLayout(
                    this.fieldExplanation,
                    {
                        label: gadgetMsg[ 'mission-changed-or-unsure-explanation' ],
                        align: 'top'
                    }
                ),
                new OO.ui.FieldLayout(
                    this.fieldGroupMembershipPage,
                    {
                        label: gadgetMsg[ 'group-membership-page' ],
                        align: 'top'
                    }
                ),
                new OO.ui.FieldLayout(
                    this.fieldEditorsMemberCount,
                    {
                        label: gadgetMsg[ 'editors-count' ],
                        align: 'top'
                    }
                ),
                new OO.ui.FieldLayout(
                    this.fieldNonEditorsMemberCount,
                    {
                        label: gadgetMsg[ 'non-editors-count' ],
                        align: 'top'
                    }
                ),
                new OO.ui.FieldLayout(
                    this.fieldFacebook,
                    {
                        label: gadgetMsg[ 'social-media-links' ],
                        align: 'top',
                        help: gadgetMsg[ 'facebook-link-help' ]
                    }
                ),
                new OO.ui.FieldLayout(
                    this.fieldTwitter,
                    { align: 'inline' }
                ),
                new OO.ui.FieldLayout(
                    this.fieldOther,
                    { align: 'inline' }
                ),
                new OO.ui.FieldLayout(
                    this.fieldDecisionMakingStructure,
                    {
                        label: gadgetMsg[ 'decision-making-structure' ],
                        align: 'top'
                    }
                ),
                new OO.ui.FieldLayout(
                    this.fieldGroupContact1,
                    {
                        label: gadgetMsg[ 'group-contact-one-label' ],
                        align: 'top'
                    }
                ),
                new OO.ui.FieldLayout(
                    this.fieldGroupContact2,
                    {
                        label: gadgetMsg[ 'group-contact-two-label' ],
                        align: 'top'
                    }
                ),
                new OO.ui.FieldLayout(
                    this.fieldBoardContacts,
                    {
                        label: gadgetMsg[ 'board-members' ],
                        align: 'top',
                        help: gadgetMsg[ 'board-members-tip' ]
                    }
                ),
            ] );

            if ( users.indexOf( mw.config.values.wgUserName ) > -1 ) {
                this.fieldSet.addItems( [
                    new OO.ui.FieldLayout(
                        this.fieldAgreementDate,
                        {
                            label: gadgetMsg[ 'recognition-date-of-affiliate' ],
                            align: 'top',
                            help: gadgetMsg[ 'recognition-date-tip' ]
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldFiscalYearStart,
                        {
                            label: gadgetMsg[ 'fiscal-year-of-affiliate' ],
                            align: 'top',
                            placeholder: gadgetMsg[ 'fiscal-year-start' ]
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldFiscalYearEnd,
                        {
                            label: '',
                            align: 'top',
                            placeholder: gadgetMsg[ 'fiscal-year-end' ]
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldUpToDateReporting,
                        {
                            label: gadgetMsg[ 'compliance-status-of-affiliate' ],
                            align: 'top',
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldOutOfComplianceLevel,
                        {
                            label: gadgetMsg[ 'out-of-compliance-level' ],
                            align: 'top',
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldRecognitionStatus,
                        {
                            label: gadgetMsg[ 'recognition-status-label' ],
                            align: 'top',
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldMEByPassOOCAutoChecks,
                        {
                            label: gadgetMsg[ 'bypass-ooc-autochecks' ],
                            align: 'top',
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldMEByPassReason,
                        {
                            label: gadgetMsg[ 'bypass-ooc-autochecks-reason' ],
                            align: 'top',
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldDerecognitionDate,
                        {
                            align: 'top',
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldDerecognitionNote,
                        {
                            align: 'top',
                        }
                    ),
                ] );
            }

            // When everything is done
            this.content.$element.append( this.fieldSet.$element );
            this.$body.append( this.content.$element );
        };

        /**
         * Set custom height for the modal window
         *
         */
        OrgInfoEditor.prototype.getBodyHeight = function () {
            return 700;
        };

        /**
         * In the event "Select" is pressed
         *
         */
        OrgInfoEditor.prototype.getActionProcess = function ( action ) {
            var dialog = this, allRequiredFieldsAvailable = false;

            // Before submitting the form, check that all required fields indeed
            // have values before we call saveItem(). Otherwise, don't close the
            // form but instead reveal which input fields are not yet filled.
            if( dialog.fieldGroupName.getValue() &&
                dialog.fieldGroupCode.getValue() &&
                dialog.fieldEditorsMemberCount.getValue() &&
                dialog.fieldNonEditorsMemberCount.getValue() &&
                dialog.fieldGroupCountry.getValue() &&
                dialog.fieldLegalEntity.findSelectedItem().getData() &&
                dialog.fieldMissionChanged.findSelectedItem().getData() &&
                dialog.fieldEditorsMemberCount.getValue() &&
                dialog.fieldNonEditorsMemberCount.getValue() &&
                /* TODO: Make group contacts optional for now
                   M&E need to submit other org info without this. */
                // dialog.fieldGroupContact1.getValue() &&
                // dialog.fieldGroupContact2.getValue() &&
                dialog.fieldAgreementDate.getValue()
            ) {
                allRequiredFieldsAvailable = true;
            }

            if ( action === 'continue' && allRequiredFieldsAvailable ) {
                return new OO.ui.Process( function () {
                    dialog.saveItem();
                } );
            } else if ( action === 'continue' && allRequiredFieldsAvailable === false ) {
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
         * Save the changes to [[Module:Organizational_Informations]] page.
         */
        OrgInfoEditor.prototype.saveItem = function ( deleteFlag ) {
            var dialog = this;

            dialog.pushPending();

            new mw.Api().get( getModuleContent( 'Organizational_Informations' ) ).then( function ( data ) {
                new mw.Api().get(
                    getModuleContent( 'Organizational_Informations/Membership_Infos' )
                ).then( function ( existingGroupContacts ) {
                    var i, j,
                        insertInPlace,
                        processWorkingEntry,
                        editSummary,
                        manifest = [],
                        workingEntry,
                        entries,
                        mrl_affiliates = '',
                        membershipInfosEntries,
                        membershipInfosManifest = [],
                        insertInPlaceGC;

                    /**
                     * Compares a given [[Module:Organizational_Informations]] entry against the edit fields
                     * and applies changes where relevant.
                     *
                     * @param {Object} workingEntry the entry being worked on
                     * @return {Object} The same entry but with modifications
                     */
                    processWorkingEntry = function ( workingEntry ) {
                        if ( dialog.fieldGroupCode.getValue() ) {
                            workingEntry.affiliate_code = dialog.fieldGroupCode.getValue();
                        }

                        if ( dialog.fieldGroupName.getValue() ) {
                            workingEntry.group_name = dialog.fieldGroupName.getValue();
                        } else if ( !dialog.fieldGroupName.getValue() && workingEntry.group_name ) {
                            delete workingEntry.group_name;
                        }

                        if ( dialog.fieldOrgType.getValue() ) {
                            workingEntry.org_type = dialog.fieldOrgType.getValue();
                        } else if ( !dialog.fieldOrgType.getValue() && workingEntry.org_type ) {
                            delete workingEntry.org_type;
                        }

                        if ( dialog.fieldRegion.getValue() ) {
                            workingEntry.region = dialog.fieldRegion.getValue();
                        } else if ( !dialog.fieldRegion.getValue() && workingEntry.region ) {
                            delete workingEntry.region;
                        }

                        if ( dialog.fieldGroupCountry.getValue() ) {
                            workingEntry.group_country = dialog.fieldGroupCountry.getValue();
                        } else if ( !dialog.fieldGroupCountry.getValue() && workingEntry.group_country ) {
                            delete workingEntry.group_country;
                        }

                        if ( dialog.fieldLegalEntity.findSelectedItem().getData() ) {
                            workingEntry.legal_entity = dialog.fieldLegalEntity.findSelectedItem().getData();
                        } else if ( !dialog.findSelectedItem().getData() && workingEntry.legal_entity ) {
                            delete workingEntry.legal_entity;
                        }

                        if ( dialog.fieldMissionChanged.findSelectedItem().getData() ) {
                            workingEntry.mission_changed = dialog.fieldMissionChanged.findSelectedItem().getData();
                        } else if ( !dialog.fieldMissionChanged.findSelectedItem().getData() &&
                            workingEntry.mission_changed ) {
                            delete workingEntry.mission_changed;
                        }

                        if ( dialog.fieldExplanation.getValue() ) {
                            workingEntry.explanation = dialog.fieldExplanation.getValue();
                        } else if ( !dialog.fieldExplanation.getValue() && workingEntry.explanation ) {
                            delete workingEntry.explanation;
                        }

                        if ( dialog.fieldGroupMembershipPage.getValue() ) {
                            workingEntry.group_page = dialog.fieldGroupMembershipPage.getValue();
                        } else if ( !dialog.fieldGroupMembershipPage.getValue() && workingEntry.group_page ) {
                            delete workingEntry.group_page;
                        }

                        if ( dialog.fieldEditorsMemberCount.getValue() ) {
                            workingEntry.member_count = dialog.fieldEditorsMemberCount.getValue();
                        } else if ( !dialog.fieldEditorsMemberCount.getValue() && workingEntry.member_count ) {
                            delete workingEntry.member_count;
                        }

                        if ( dialog.fieldNonEditorsMemberCount.getValue() ) {
                            workingEntry.non_editors_count = dialog.fieldNonEditorsMemberCount.getValue();
                        } else if ( !dialog.fieldNonEditorsMemberCount.getValue() && workingEntry.non_editors_count ) {
                            delete workingEntry.non_editors_count;
                        }

                        if ( dialog.fieldFacebook.getValue() ) {
                            workingEntry.facebook = dialog.fieldFacebook.getValue();
                        } else if ( !dialog.fieldFacebook.getValue() && workingEntry.facebook ) {
                            delete workingEntry.facebook;
                        }

                        if ( dialog.fieldTwitter.getValue() ) {
                            workingEntry.twitter = dialog.fieldTwitter.getValue();
                        } else if ( !dialog.fieldTwitter.getValue() && workingEntry.twitter ) {
                            delete workingEntry.twitter;
                        }

                        if ( dialog.fieldOther.getValue() ) {
                            workingEntry.other = dialog.fieldOther.getValue();
                        } else if ( !dialog.fieldOther.getValue() && workingEntry.other ) {
                            delete workingEntry.other;
                        }

                        if ( dialog.fieldDecisionMakingStructure.findSelectedItemsData() ) {
                            workingEntry.dm_structure = dialog.fieldDecisionMakingStructure.findSelectedItemsData();
                        } else if ( !dialog.fieldDecisionMakingStructure.findSelectedItemsData() && workingEntry.dm_structure ) {
                            delete workingEntry.dm_structure;
                        }

                        if ( dialog.fieldGroupContact1.getValue() ) {
                            workingEntry.group_contact1 = dialog.fieldGroupContact1.getValue();
                        } else if ( !dialog.fieldGroupContact1.getValue() && workingEntry.group_contact1 ) {
                            delete workingEntry.group_contact1;
                        }

                        if ( dialog.fieldGroupContact2.getValue() ) {
                            workingEntry.group_contact2 = dialog.fieldGroupContact2.getValue();
                        } else if ( !dialog.fieldGroupContact2.getValue() && workingEntry.group_contact2 ) {
                            delete workingEntry.group_contact2;
                        }

                        if ( dialog.fieldBoardContacts.getValue() ) {
                            workingEntry.board_contacts = dialog.fieldBoardContacts.getValue();
                        } else if ( !dialog.fieldBoardContacts.getValue() && workingEntry.board_contacts ) {
                            delete workingEntry.board_contacts;
                        }

                        if ( dialog.fieldAgreementDate.getValue() ) {
                            workingEntry.agreement_date = convertDateToDdMmYyyyFormat( dialog.fieldAgreementDate.getValue() );
                        } else if ( !dialog.fieldAgreementDate.getValue() && workingEntry.agreement_date ) {
                            delete workingEntry.agreement_date;
                        }

                        if ( dialog.fieldFiscalYearStart.getValue() ) {
                            workingEntry.fiscal_year_start = dialog.fieldFiscalYearStart.getValue();
                        } else if ( !dialog.fieldFiscalYearStart.getValue() && workingEntry.fiscal_year_start ) {
                            delete workingEntry.fiscal_year_start;
                        }

                        if ( dialog.fieldFiscalYearEnd.getValue() ) {
                            workingEntry.fiscal_year_end = dialog.fieldFiscalYearEnd.getValue();
                        } else if ( !dialog.fieldFiscalYearEnd.getValue() && workingEntry.fiscal_year_end ) {
                            delete workingEntry.fiscal_year_end;
                        }

                        if ( dialog.fieldUpToDateReporting.getValue() ) {
                            workingEntry.uptodate_reporting = dialog.fieldUpToDateReporting.getValue();
                        } else if ( !dialog.fieldUpToDateReporting.getValue() && workingEntry.uptodate_reporting ) {
                            delete workingEntry.uptodate_reporting;
                        }

                        if ( dialog.fieldRecognitionStatus.getValue() ) {
                            workingEntry.recognition_status = dialog.fieldRecognitionStatus.getValue();
                        } else if ( !dialog.fieldRecognitionStatus.getValue() && workingEntry.recognition_status ) {
                            delete workingEntry.recognition_status;
                        }

                        if ( dialog.fieldMEByPassOOCAutoChecks.getValue() === "Yes" ) {
                            workingEntry.me_bypass_ooc_autochecks = dialog.fieldMEByPassOOCAutoChecks.getValue();
                            workingEntry.notes_on_reporting = dialog.fieldMEByPassReason.getValue();
                        } else if ( dialog.fieldMEByPassOOCAutoChecks.getValue() === "No" ) {
                            workingEntry.me_bypass_ooc_autochecks = dialog.fieldMEByPassOOCAutoChecks.getValue();
                        } else if ( !dialog.fieldMEByPassOOCAutoChecks.getValue() && workingEntry.me_bypass_ooc_autochecks ) {
                            delete workingEntry.me_bypass_ooc_autochecks;
                        }

                        if ( dialog.fieldOutOfComplianceLevel.getValue() ) {
                            workingEntry.out_of_compliance_level = dialog.fieldOutOfComplianceLevel.getValue();
                        } else if ( !dialog.fieldOutOfComplianceLevel.getValue() && workingEntry.out_of_compliance_level ) {
                            delete workingEntry.out_of_compliance_level;
                        }

                        if ( dialog.fieldDerecognitionDate.getValue() ) {
                            workingEntry.derecognition_date = convertDateToDdMmYyyyFormat( dialog.fieldDerecognitionDate.getValue() );
                        } else if ( !dialog.fieldDerecognitionDate.getValue() && workingEntry.derecognition_date ) {
                            delete workingEntry.derecognition_date;
                        }

                        if ( dialog.fieldDerecognitionNote.getValue() ) {
                            workingEntry.derecognition_note = dialog.fieldDerecognitionNote.getValue();
                        } else if ( !dialog.fieldDerecognitionNote.getValue() && workingEntry.derecognition_note ) {
                            delete workingEntry.derecognition_note;
                        }

                        if ( dialog.fieldDateOfSubmission.getValue() ) {
                            workingEntry.dos_stamp = dialog.fieldDateOfSubmission.getValue();
                        } else if ( !dialog.fieldDateOfSubmission.getValue() && workingEntry.dos_stamp ) {
                            delete workingEntry.dos_stamp;
                        }

                        return workingEntry;
                    };

                    // Cycle through existing entries. If we are editing an existing
                    // entry, that entry will be modified in place.
                    entries = parseContentModule( data.query.pages );

                    membershipInfosEntries = parseContentModule( existingGroupContacts.query.pages );
                    for ( i = 0; i < membershipInfosEntries.length; i++ ) {
                        membershipInfosManifest.push( cleanRawEntry( membershipInfosEntries[i].value.fields ) );
                    }

                    for ( i = 0; i < entries.length; i++ ) {
                        workingEntry = cleanRawEntry( entries[ i ].value.fields );
                        if ( workingEntry.group_name === dialog.group_name ) {
                            var newGroupContact1,
                                newGroupContact2,
                                oldGroupContact1,
                                oldGroupContact2,
                                newEditorsCount,
                                newNonEditorsCount,
                                oldEditorsCount,
                                oldNonEditorsCount,
                                membershipObj = {},
                                oldMembershipInfos = {};

                            newGroupContact1 = dialog.fieldGroupContact1.getValue().normalize();
                            newGroupContact2 = dialog.fieldGroupContact2.getValue().normalize()
                            if ( workingEntry.group_contact1 ) {
                                oldGroupContact1 = workingEntry.group_contact1.normalize().substring( 5 );
                            } else {
                                // fallback to new name
                                oldGroupContact1 = newGroupContact1.substring( 5 );
                            }

                            if ( workingEntry.group_contact2 ) {
                                oldGroupContact2 = workingEntry.group_contact2.normalize().substring( 5 );
                            } else {
                                // fallback to new name
                                oldGroupContact2 = newGroupContact2.substring( 5 );
                            }

                            newEditorsCount = dialog.fieldEditorsMemberCount.getValue();
                            newNonEditorsCount = dialog.fieldNonEditorsMemberCount.getValue();
                            oldEditorsCount = workingEntry.member_count;
                            oldNonEditorsCount = workingEntry.non_editors_count;

                            // Track membership count changes as well.
                            if ( oldEditorsCount !== newEditorsCount || oldNonEditorsCount !== newNonEditorsCount ) {
                                oldMembershipInfos["oldEditorsCount"] = oldEditorsCount;
                                oldMembershipInfos["oldNonEditorsCount"] = oldNonEditorsCount;
                            }
                            /** Quickly check if group contacts have changed and log those first. */
                            if ( oldGroupContact1 !== newGroupContact1 && oldGroupContact2 !== newGroupContact2 ) {
                                oldMembershipInfos["oldGroupContact1"] = oldGroupContact1;
                                oldMembershipInfos["oldGroupContact2"] = oldGroupContact2;
                            } else if ( oldGroupContact1 !== newGroupContact1 && oldGroupContact2 === newGroupContact2 ) {
                                oldMembershipInfos["oldGroupContact1"] = oldGroupContact1;
                            } else if ( oldGroupContact1 === newGroupContact1 && oldGroupContact2 !== newGroupContact2 ) {
                                oldMembershipInfos["oldGroupContact2"] = oldGroupContact2
                            }

                            membershipObj = {
                                unique_id: Math.random().toString( 36 ).substring( 2 ),
                                group_name: workingEntry.group_name,
                                group_contact1: oldMembershipInfos["oldGroupContact1"] ?
                                    oldMembershipInfos["oldGroupContact1"] : oldGroupContact1,
                                group_contact2: oldMembershipInfos["oldGroupContact2"] ?
                                    oldMembershipInfos["oldGroupContact2"] : oldGroupContact2,
                                editors_count: oldMembershipInfos["oldEditorsCount"] ?
                                    oldMembershipInfos["oldEditorsCount"] : oldEditorsCount,
                                non_editors_count: oldMembershipInfos["oldNonEditorsCount"] ?
                                    oldMembershipInfos["oldNonEditorsCount"] : oldNonEditorsCount,
                                dos_stamp: new Date().toISOString()
                            };

                            membershipInfosManifest.push( membershipObj );

                            // Re-generate the group contacts Lua table based on `membershipInfosManifest`
                            insertInPlaceGC = 'return {\n';
                            for ( j = 0; j < membershipInfosManifest.length; j++ ) {
                                insertInPlaceGC += '\t{\n';
                                if ( membershipInfosManifest[ j ].unique_id ) {
                                    insertInPlaceGC += generateKeyValuePair(
                                        'unique_id',
                                        membershipInfosManifest[ j ].unique_id
                                    );
                                }
                                if ( membershipInfosManifest[ j ].group_name ){
                                    insertInPlaceGC += generateKeyValuePair(
                                        'group_name',
                                        membershipInfosManifest[ j ].group_name
                                    );
                                }
                                if ( typeof membershipInfosManifest[ j ].group_contact1 !== 'undefined' &&
                                    membershipInfosManifest[ j ].group_contact1.indexOf( "User:" ) !== -1
                                ) {
                                    insertInPlaceGC += generateKeyValuePair(
                                        'group_contact1',
                                        membershipInfosManifest[ j ].group_contact1
                                    );
                                } else if ( typeof membershipInfosManifest[ j ].group_contact1 !== 'undefined' &&
                                    membershipInfosManifest[ j ].group_contact1
                                ) {
                                    insertInPlaceGC += generateKeyValuePair(
                                        'group_contact1',
                                        'User:' + membershipInfosManifest[ j ].group_contact1
                                    );
                                } else {
                                    insertInPlaceGC += generateKeyValuePair(
                                        'group_contact1',
                                        ''
                                    );
                                }
                                if ( typeof membershipInfosManifest[ j ].group_contact2 !== 'undefined' &&
                                    membershipInfosManifest[ j ].group_contact2.indexOf( "User:" ) !== -1
                                ) {
                                    insertInPlaceGC += generateKeyValuePair(
                                        'group_contact2',
                                        membershipInfosManifest[ j ].group_contact2
                                    );
                                } else if ( typeof membershipInfosManifest[ j ].group_contact2 !== 'undefined' &&
                                    membershipInfosManifest[ j ].group_contact2
                                ) {
                                    insertInPlaceGC += generateKeyValuePair(
                                        'group_contact2',
                                        'User:' + membershipInfosManifest[ j ].group_contact2
                                    );
                                } else {
                                    insertInPlaceGC += generateKeyValuePair(
                                        'group_contact2',
                                        ''
                                    );
                                }
                                if ( membershipInfosManifest[ j ].editors_count ) {
                                    insertInPlaceGC += generateKeyValuePair(
                                        'editors_count',
                                        membershipInfosManifest[ j ].editors_count
                                    );
                                }
                                if ( membershipInfosManifest[ j ].non_editors_count ) {
                                    insertInPlaceGC += generateKeyValuePair(
                                        'non_editors_count',
                                        membershipInfosManifest[ j ].non_editors_count
                                    );
                                }
                                if ( membershipInfosManifest[ j ].dos_stamp ) {
                                    insertInPlaceGC += generateKeyValuePair(
                                        'dos_stamp',
                                        membershipInfosManifest[ j ].dos_stamp
                                    );
                                }
                                insertInPlaceGC += '\t},\n';
                            }
                            insertInPlaceGC += '}';

                            workingEntry = processWorkingEntry( workingEntry );
                            editSummary = gadgetMsg[ 'updated-org-info' ] + ' ' + workingEntry.group_name;
                        }
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
                        editSummary = gadgetMsg[ 'added-new-org-info' ] + ' ' + workingEntry.group_name;
                        manifest.push( workingEntry );
                    }

                    // Re-generate the Lua table based on `manifest`
                    insertInPlace = 'return {\n';
                    for ( i = 0; i < manifest.length; i++ ) {
                        // Keep a list copy of the affiliate name
                        mrl_affiliates += manifest[ i ].group_name + ',\n';
                        insertInPlace += '\t{\n';
                        if ( manifest[ i ].unique_id ) {
                            insertInPlace += generateKeyValuePair(
                                'unique_id',
                                manifest[ i ].unique_id
                            );
                        }
                        if ( manifest[ i ].affiliate_code ){
                            insertInPlace += generateKeyValuePair(
                                'affiliate_code',
                                manifest[ i ].affiliate_code
                            );
                        }
                        if ( manifest[ i ].group_name ) {
                            insertInPlace += generateKeyValuePair(
                                'group_name',
                                manifest[ i ].group_name
                            );
                        }
                        if ( manifest[ i ].org_type ) {
                            insertInPlace += generateKeyValuePair(
                                'org_type',
                                manifest[ i ].org_type
                            );
                        }
                        if ( manifest[ i ].region ) {
                            insertInPlace += generateKeyValuePair(
                                'region',
                                manifest[ i ].region
                            );
                        }
                        if ( manifest[ i ].group_country ) {
                            insertInPlace += generateKeyValuePair(
                                'group_country',
                                manifest[ i ].group_country
                            );
                        }
                        if ( !manifest[ i ].legal_entity && manifest[ i ].org_type === 'User Group' ) {
                            insertInPlace += generateKeyValuePair(
                                'legal_entity',
                                'No'
                            );
                        } else if ( manifest[ i ].legal_entity && manifest[ i ].org_type === 'User Group' ) {
                            insertInPlace += generateKeyValuePair(
                                'legal_entity',
                                manifest[ i ].legal_entity
                            );
                        } else {
                            insertInPlace += generateKeyValuePair(
                                'legal_entity',
                                'Yes'
                            );
                        }
                        if ( manifest[ i ].mission_changed ) {
                            insertInPlace += generateKeyValuePair(
                                'mission_changed',
                                manifest[ i ].mission_changed
                            );
                        }
                        if ( manifest[ i ].explanation ) {
                            insertInPlace += generateKeyValuePair(
                                'explanation',
                                manifest[ i ].explanation
                            );
                        }
                        if ( manifest[ i ].group_page ) {
                            insertInPlace += generateKeyValuePair(
                                'group_page',
                                manifest[ i ].group_page.trim()
                            );
                        }
                        if ( manifest[ i ].member_count ) {
                            insertInPlace += generateKeyValuePair(
                                'member_count',
                                manifest[ i ].member_count
                            );
                        }
                        if ( manifest[ i ].non_editors_count ) {
                            insertInPlace += generateKeyValuePair(
                                'non_editors_count',
                                manifest[ i ].non_editors_count
                            );
                        }
                        if ( manifest[ i ].facebook ) {
                            insertInPlace += generateKeyValuePair(
                                'facebook',
                                manifest[ i ].facebook.trim()
                            );
                        }
                        if ( manifest[ i ].twitter ) {
                            insertInPlace += generateKeyValuePair(
                                'twitter',
                                manifest[ i ].twitter.trim()
                            );
                        }
                        if ( manifest[ i ].other ) {
                            insertInPlace += generateKeyValuePair(
                                'other',
                                manifest[ i ].other.trim()
                            );
                        }
                        if ( manifest[ i ].dm_structure ) {
                            insertInPlace += generateKeyValuePair(
                                'dm_structure',
                                manifest[ i ].dm_structure
                            );
                        }
                        if ( typeof manifest[ i ].group_contact1 !== 'undefined' && manifest[ i ].group_contact1.indexOf( "User:" ) !== -1 ) {
                            insertInPlace += generateKeyValuePair(
                                'group_contact1',
                                manifest[ i ].group_contact1
                            );
                        } else if ( manifest[ i ].group_contact1 ) {
                            insertInPlace += generateKeyValuePair(
                                'group_contact1',
                                'User:' + manifest[ i ].group_contact1
                            );
                        }
                        if ( typeof manifest[ i ].group_contact2 !== 'undefined' && manifest[ i ].group_contact2.indexOf( "User:" ) !== -1 ) {
                            insertInPlace += generateKeyValuePair(
                                'group_contact2',
                                manifest[ i ].group_contact2
                            );
                        } else if ( manifest[ i ].group_contact2 ) {
                            insertInPlace += generateKeyValuePair(
                                'group_contact2',
                                'User:' + manifest[ i ].group_contact2
                            );
                        }
                        if ( manifest[ i ].board_contacts ) {
                            insertInPlace += generateKeyValuePair(
                                'board_contacts',
                                manifest[ i ].board_contacts
                            );
                        }
                        if ( manifest[ i ].agreement_date ){
                            insertInPlace += generateKeyValuePair(
                                'agreement_date',
                                manifest[ i ].agreement_date
                            );
                        }
                        if ( manifest[ i ].fiscal_year_start ){
                            insertInPlace += generateKeyValuePair(
                                'fiscal_year_start',
                                manifest[ i ].fiscal_year_start
                            );
                        } else {
                            insertInPlace += generateKeyValuePair(
                                'fiscal_year_start',
                                ''
                            );
                        }
                        if ( manifest[ i ].fiscal_year_end ){
                            insertInPlace += generateKeyValuePair(
                                'fiscal_year_end',
                                manifest[ i ].fiscal_year_end
                            );
                        } else {
                            insertInPlace += generateKeyValuePair(
                                'fiscal_year_end',
                                ''
                            );
                        }
                        if ( manifest[ i ].uptodate_reporting ){
                            insertInPlace += generateKeyValuePair(
                                'uptodate_reporting',
                                manifest[ i ].uptodate_reporting
                            );
                        }
                        if ( manifest[ i ].notes_on_reporting ){
                            insertInPlace += generateKeyValuePair(
                                'notes_on_reporting',
                                manifest[ i ].notes_on_reporting
                            );
                        } else {
                            insertInPlace += generateKeyValuePair(
                                'notes_on_reporting',
                                ''
                            );
                        }
                        if ( manifest[ i ].recognition_status ){
                            insertInPlace += generateKeyValuePair(
                                'recognition_status',
                                manifest[ i ].recognition_status
                            );
                        }
                        if ( manifest[i].me_bypass_ooc_autochecks ) {
                            insertInPlace += generateKeyValuePair(
                                'me_bypass_ooc_autochecks',
                                manifest[ i ].me_bypass_ooc_autochecks
                            );
                        }
                        if ( manifest[ i ].out_of_compliance_level ){
                            insertInPlace += generateKeyValuePair(
                                'out_of_compliance_level',
                                manifest[ i ].out_of_compliance_level
                            );
                        }
                        if ( manifest[i].reporting_due_date ) {
                            insertInPlace += generateKeyValuePair(
                                'reporting_due_date',
                                manifest[i].reporting_due_date
                            );
                        } else { // Just use an empty string if the affiliate is compliant.
                            insertInPlace += generateKeyValuePair(
                                'reporting_due_date',
                                ''
                            );
                        }
                        if ( manifest[ i ].derecognition_date ){
                            insertInPlace += generateKeyValuePair(
                                'derecognition_date',
                                manifest[ i ].derecognition_date
                            );
                        }
                        if ( manifest[ i ].derecognition_note ){
                            insertInPlace += generateKeyValuePair(
                                'derecognition_note',
                                manifest[ i ].derecognition_note
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

                    // Make changes to the Org Info table as required.
                    new mw.Api().postWithToken(
                        'csrf',
                        {
                            action: 'edit',
                            bot: true,
                            nocreate: true,
                            summary: editSummary,
                            pageid: 10603224,  // [[Module:Organizational_Informations]]
                            text: insertInPlace,
                            contentmodel: 'Scribunto'
                        }
                    ).then( function () {
                        dialog.close();

                        new mw.Api().postWithToken(
                            'csrf',
                            {
                                action: 'edit',
                                bot: true,
                                nocreate: true,
                                summary: 'Log changes to new affiliate contacts',
                                pageid: 11620639,  // [[Module:Organizational_Informations/Membership_Infos]]
                                text: insertInPlaceGC,
                                contentmodel: 'Scribunto'
                            }
                        ).then( function () {
                            /** After saving, show a message box */
                            var messageDialog = new OO.ui.MessageDialog();
                            var windowManager = new OO.ui.WindowManager();

                            $( 'body' ).append( windowManager.$element );
                            // Add the dialog to the window manager.
                            windowManager.addWindows( [ messageDialog ] );

                            // Configure the message dialog when it is opened with the window manager's openWindow() method.
                            windowManager.openWindow( messageDialog, {
                                title: gadgetMsg[ 'success-message' ],
                                message: gadgetMsg[ 'org-info-saved' ],
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
                                // Defer reconstruction MRL of affiliates to background.
                                new mw.Api().postWithToken(
                                    'csrf',
                                    {
                                        action: 'edit',
                                        bot: true,
                                        nocreate: true,
                                        summary: 'Reconstructed MRL of affiliates for all affiliates in the system.',
                                        pageid: 11608672, // [[WADP/MRL/List Of All Wikimedia Affiliates]]
                                        text: mrl_affiliates,
                                        contentmodel: 'wikitext'
                                    }
                                );
                                location.reload();
                            } );
                        } );
                    } ).catch( function ( error ) {
                        alert( gadgetMsg[ 'failed-to-save-to-lua-table' ] );
                        dialog.close();
                        console.error( error );
                    } );
                } );
            } );
        };

        // Edit content via the form
        $( '.record_id' ).each( function () {
            var $icon = $( this ),
                editButton;
            editButton = new OO.ui.ButtonWidget( {
                framed: false,
                label: 'update',
                icon: 'edit',
                flags: [ 'progressive' ]
            } ).on( 'click', function () {
                // First check if the user is logged in
                if ( mw.config.get ( 'wgUserName' ) === null ) {
                    alert( gadgetMsg[ 'you-need-to-log-in' ] );
                } else {
                    new mw.Api().get( getModuleContent( 'Organizational_Informations' ) ).then( function ( data ) {
                        var entryData, record;

                        record = editButton.$element
                            .closest( '.record' )
                            .data( 'record-unique-id' );

                        entryData = cleanRawEntry(
                            getRelevantRawEntry(
                                parseContentModule( data.query.pages ),
                                record
                            )
                        );
                        openWindow( entryData );
                    } );
                }
            } );
            $icon.append( editButton.$element );
        } );


        /**
         * The dialog / window to be displayed as editor when
         * when updating the records or table entries.
         *
         * @param {Object} config
         */
        openWindow = function ( config ) {
            var orginfoEditor;
            config.size = 'large';
            orginfoEditor = new OrgInfoEditor( config );

            windowManager = new OO.ui.WindowManager();
            $( 'body' ).append( windowManager.$element );
            windowManager.addWindows( [ orginfoEditor ] );
            windowManager.openWindow( orginfoEditor );
        };

        /**
         * Open up a dialog when a new entry is to be submitted
         */
        $( '.orgInfo' ).on( 'click', function () {
            if ( users.indexOf( mw.config.values.wgUserName ) > -1 ) {
                openWindow( {} );
            } else {
                alert( gadgetMsg[ 'me-staffs-only' ] );
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
            console.error( error, 'Unable to load translation strings - __OIF__' );
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
