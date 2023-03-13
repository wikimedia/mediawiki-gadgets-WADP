/**
 * Annual Activities Reporting Form
 * @author Derick Alangi (WMF)
 */
( function () {
    'use strict';

    var gadgetMsg = {},
        getRelevantRawEntry,
        parseContentModule,
        openWindow1,
        openWindow2,
        userLang,
        cleanRawEntry,
        windowManager,
        AffiliateLookupTextInputWidget,
        getAffiliatesList,
        fieldImportedReportDate,
        fieldReportLangCode,
        fieldReportInEnglishLink,
        fieldPartnershipOther,
        fieldPartnershipOtherInput,
        sanitizeInput,
        generateKeyValuePair,
        sandbox_activities_reports,
        apiObj,
        convertDateToDdMmYyyyFormat,
        convertDateToYyyyMmDdFormat,
        getModuleContent,
        getWikiPageContent,
        groupNameGlb,
        uniqueIdGlb,
        updateGroupContactsOrgInfo;

    var PAGEID = 10624730, // Live mode page ID
        EDITMODE = '';

    userLang = mw.config.get( 'wgUserLanguage' );

    // This is called after translation messages are ready
    function initAfterMessages () {
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
            // Put in a format our lua script will feed on, in DD/MM/YYYY format
            date = date.split( '-' );
            date = date[ 2 ] + '/' + date[ 1 ] + '/' + date[ 0 ];

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
            splitted_date = date.split( '/' );
            date = splitted_date[ 2 ] + '-' + splitted_date[ 1 ] + '-' + splitted_date[ 0 ];

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
            if ( k === 'partnership_info' ||
                k === 'dm_structure' ||
                k === 'countries_affiliate_operates_in' ||
                k === 'languages_supported_by_affiliate' ||
                k === 'past_programs' ||
                k === 'capacities_to_strengthen'
            ) {
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
                } else if ( relevantRawEntry[ i ].key.name === 'countries_affiliate_operates_in' ) {
                    entryData.countries_affiliate_operates_in = [];
                    for (
                        j = 0;
                        j < relevantRawEntry[ i ].value.fields.length;
                        j++
                    ) {
                        entryData.countries_affiliate_operates_in.push(
                            relevantRawEntry[ i ].value.fields[ j ].value.value
                        );
                    }
                } else if ( relevantRawEntry[ i ].key.name === 'languages_supported_by_affiliate' ) {
                    entryData.languages_supported_by_affiliate = [];
                    for (
                        j = 0;
                        j < relevantRawEntry[ i ].value.fields.length;
                        j++
                    ) {
                        entryData.languages_supported_by_affiliate.push(
                            relevantRawEntry[ i ].value.fields[ j ].value.value
                        );
                    }
                } else if ( relevantRawEntry[ i ].key.name === 'past_programs' ) {
                    entryData.past_programs = [];
                    for (
                        j = 0;
                        j < relevantRawEntry[ i ].value.fields.length;
                        j++
                    ) {
                        entryData.past_programs.push(
                            relevantRawEntry[ i ].value.fields[ j ].value.value
                        );
                    }
                } else if ( relevantRawEntry[ i ].key.name === 'capacities_to_strengthen' ) {
                    entryData.capacities_to_strengthen = [];
                    for (
                        j = 0;
                        j < relevantRawEntry[ i ].value.fields.length;
                        j++
                    ) {
                        entryData.capacities_to_strengthen.push(
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
        AffiliateLookupTextInputWidget = function AffiliatesLookupTextInputWidget ( config ) {
            // Parent constructor
            OO.ui.TextInputWidget.call( this, $.extend(
                {
                    icon: 'userGroup',
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
                return new mw.Api().get(
                    getWikiPageContent( 'Wikimedia_Affiliates_Data_Portal/MRL/List_Of_All_Wikimedia_Affiliates' )
                ).then( function ( data ) {
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

        /********************** Window 1 dialog logic start ***************/
        /**
         * Subclass ProcessDialog - window 1 for collecting
         * activities related to Wikimedia affiliates.
         *
         * @class ActivitiesEditorW1
         * @extends OO.ui.ProcessDialog
         *
         * @constructor
         * @param {Object} config
         */
        function ActivitiesEditorW1 ( config ) {
            this.group_name = '';
            this.report_type = '';
            this.multiyear_duation = '';
            this.start_date = '';
            this.end_date = '';
            this.report_link = '';
            this.report_link_not_en_status = '';
            this.report_lang_code = '';
            this.report_link_en = '';
            this.partnership_info = [];
            this.imported_report_date = '';
            this.dos_stamp = '';
            this.countries_affiliate_operates_in = [];
            this.languages_supported_by_affiliate = [];

            if ( config.unique_id ) {
                this.uniqueId = config.unique_id;
            }

            if ( config.group_name ) {
                this.group_name = config.group_name;
            }
            if ( config.report_type ) {
                this.report_type = config.report_type;
            }
            if ( config.multiyear_duation ) {
                this.multiyear_duation = config.multiyear_duation;
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
            if ( config.report_link_not_en_status ) {
                this.report_link_not_en_status = config.report_link_not_en_status;
            }
            if ( config.report_lang_code ) {
                this.report_lang_code = config.report_lang_code;
            }
            if ( config.report_link_en ) {
                this.report_link_en = config.report_link_en;
            }
            if ( config.partnership_info ) {
                this.partnership_info = config.partnership_info;
            }
            if ( config.countries_affiliate_operates_in ) {
                this.countries_affiliate_operates_in = config.countries_affiliate_operates_in;
            }
            if ( config.languages_supported_by_affiliate ) {
                this.languages_supported_by_affiliate = config.languages_supported_by_affiliate;
            }
            if ( config.imported_report_date ) {
                this.imported_report_date = config.imported_report_date;
            }
            if ( config.dos_stamp ) {
                this.dos_stamp = config.dos_stamp;
            }
            ActivitiesEditorW1.super.call( this, config );
        }

        OO.inheritClass( ActivitiesEditorW1, OO.ui.ProcessDialog );

        ActivitiesEditorW1.static.name = 'activitiesEditor';
        ActivitiesEditorW1.static.title = gadgetMsg[ 'activities-report-header' ];
        ActivitiesEditorW1.static.actions = [
            {
                action: 'continue',
                modes: 'edit',
                label: gadgetMsg[ 'ar-next-button' ],
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
        ActivitiesEditorW1.prototype.initialize = function () {
            var i,
                fieldPartnershipInfoSelected,
                fieldArMultiyear,
                tmpReportType,
                fieldCountriesAffiliateOperateInSelected,
                fieldLanguagesSupportedByAffiliateSelected;

            ActivitiesEditorW1.super.prototype.initialize.call( this );
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
            this.fieldGroupName = new AffiliateLookupTextInputWidget( this.group_name );

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
            if ( this.report_type ) {
                this.fieldReportType.setValue( this.report_type );
            }

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
            if ( this.multiyear_duation ) {
                this.fieldMultiyear.setValue( this.multiyear_duation );
                fieldArMultiyear.toggle( true );
            }

            fieldArMultiyear.toggle();
            tmpReportType.on( 'change', function () {
                if ( tmpReportType.getValue() === 'Multi-year Activities Report' ) {
                    fieldArMultiyear.toggle( true );
                } else {
                    fieldArMultiyear.toggle( false );
                }
            } );

            this.fieldStartDate = new mw.widgets.DateInputWidget( {
                icon: 'calendar',
                value: this.start_date ? convertDateToYyyyMmDdFormat( this.start_date ) : this.start_date,
                classes: [ 'full-width' ],
                placeholderLabel: gadgetMsg[ 'start-date-placeholder' ],
                required: true
            } );
            this.fieldEndDate = new mw.widgets.DateInputWidget( {
                icon: 'calendar',
                value: this.end_date ? convertDateToYyyyMmDdFormat( this.end_date ) : this.end_date,
                classes: [ 'full-width' ],
                placeholderLabel: gadgetMsg[ 'end-date-placeholder' ],
                required: true
            } );
            this.fieldReportLink = new OO.ui.TextInputWidget( {
                icon: 'link',
                value: this.report_link,
                indicator: 'required',
                required: true,
                placeholder: gadgetMsg[ 'report-link-placeholder' ]
            } );

            this.fieldReportNotInEnglish = new OO.ui.CheckboxInputWidget( {} );
            if ( this.report_link_en ) {
                this.fieldReportNotInEnglish.setSelected( true );
                fieldReportLangCode.toggle( true );
                fieldReportInEnglishLink.toggle( true );
            }

            fieldReportLangCode = this.fieldReportLangCode = new OO.ui.TextInputWidget( {
                value: this.report_lang_code,
                placeholder: gadgetMsg[ 'lang-code-for-activity-report' ]
            } );

            fieldReportInEnglishLink = this.fieldReportInEnglishLink = new OO.ui.TextInputWidget( {
                icon: 'link',
                value: this.report_link_en,
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
            if ( this.partnership_info ) {
                this.fieldPartnershipInfo.selectItemsByData( this.partnership_info );
            }

            fieldPartnershipOtherInput = this.fieldPartnershipOtherInput = new OO.ui.TextInputWidget( {
                placeholder: gadgetMsg[ 'partnership-other-ph' ]
            } );
            fieldPartnershipOtherInput.toggle();
            fieldPartnershipOther.on( 'change', function ( isSelected ) {
                fieldPartnershipOtherInput.toggle( isSelected );
            } );

            fieldCountriesAffiliateOperateInSelected = [];
            for ( i = 0; i < this.countries_affiliate_operates_in.length; i++ ) {
                fieldCountriesAffiliateOperateInSelected.push( {
                    data: this.countries_affiliate_operates_in[ i ]
                } );
            }
            this.fieldCountriesAffiliateOperateIn = new OO.ui.MenuTagMultiselectWidget( {
                selected: fieldCountriesAffiliateOperateInSelected,
                icon: 'mapPin',
                options: [
                    { data: 'Afghanistan' }, { data: 'Albania' }, { data: 'Algeria' }, { data: 'American Samoa' },
                    { data: 'Andorra' }, { data: 'Angola' }, { data: 'Anguilla' }, { data: 'Antarctica' },
                    { data: 'Antigua and Barbuda' }, { data: 'Argentina' }, { data: 'Armenia' }, { data: 'Aruba' },
                    { data: 'Australia' }, { data: 'Austria' }, { data: 'Azerbaijan' }, { data: 'Bahamas' },
                    { data: 'Bahrain' }, { data: 'Bangladesh' }, { data: 'Barbados' }, { data: 'Bashkortostan' },
                    { data: 'Belarus' }, { data: 'Belgium' }, { data: 'Belize' }, { data: 'Benin' },
                    { data: 'Bermuda' }, { data: 'Bhutan' }, { data: 'Bolivia' }, { data: 'Bosnia and Herzegovina' },
                    { data: 'Botswana' }, { data: 'Bouvet Island' }, { data: 'Brazil' }, { data: 'British Indian Ocean Territory' },
                    { data: 'Brunei Darussalam' }, { data: 'Bulgaria' }, { data: 'Burkina Faso' }, { data: 'Burundi' },
                    { data: 'Cambodia' }, { data: 'Cameroon' }, { data: 'Canada' }, { data: 'Cape Verde' },
                    { data: 'Cayman Islands' }, { data: 'Central African Republic' }, { data: 'Chad' }, { data: 'Chile' },
                    { data: 'China' }, { data: 'Christmas Island' }, { data: 'Cocos (Keeling) Islands' }, { data: 'Colombia' },
                    { data: 'Comoros' }, { data: 'Congo' }, { data: 'Democratic Republic of The Congo' }, { data: 'Cook Islands' },
                    { data: 'Costa Rica' }, { data: 'Cote D\'ivoire' }, { data: 'Croatia' }, { data: 'Cuba' },
                    { data: 'Cyprus' }, { data: 'Czech Republic' }, { data: 'Denmark' }, { data: 'Djibouti' },
                    { data: 'Dominica' }, { data: 'Dominican Republic' }, { data: 'Ecuador' }, { data: 'Egypt' },
                    { data: 'El Salvador' }, { data: 'Equatorial Guinea' }, { data: 'Eritrea' }, { data: 'Estonia' },
                    { data: 'Ethiopia' }, { data: 'Falkland Islands(Malvinas)' }, { data: 'Faroe Islands' }, { data: 'Fiji' },
                    { data: 'Finland' }, { data: 'France' }, { data: 'French Guiana' }, { data: 'French Polynesia' },
                    { data: 'French Southern Territories' }, { data: 'Gabon' }, { data: 'Gambia' }, { data: 'Georgia' },
                    { data: 'Germany' }, { data: 'Ghana' }, { data: 'Gibraltar' }, { data: 'Greece' },
                    { data: 'Greenland' }, { data: 'Grenada' }, { data: 'Guadeloupe' }, { data: 'Guam' }, { data: 'Guatemala' },
                    { data: 'Guinea' }, { data: 'Guinea - bissau' }, { data: 'Guyana' }, { data: 'Haiti' },
                    { data: 'Heard Island and Mcdonald Islands' }, { data: 'Holy See (Vatican City State)' }, { data: 'Honduras' },
                    { data: 'Hong Kong' }, { data: 'Hungary' }, { data: 'Iceland' }, { data: 'India' }, { data: 'Indonesia' },
                    { data: 'Iran' }, { data: 'Islamic Republic of' }, { data: 'Iraq' }, { data: 'Ireland' }, { data: 'Israel' },
                    { data: 'Italy' }, { data: 'Jamaica' }, { data: 'Japan' }, { data: 'Jordan' }, { data: 'Kazakhstan' },
                    { data: 'Kenya' }, { data: 'Kiribati' }, { data: 'Korea' }, { data: 'Kuwait' }, { data: 'Kyrgyzstan' },
                    { data: 'Latvia' }, { data: 'Lebanon' }, { data: 'Lesotho' }, { data: 'Liberia' }, { data: 'Libyan Arab Jamahiriya' },
                    { data: 'Liechtenstein' }, { data: 'Lithuania' }, { data: 'Luxembourg' }, { data: 'Macao' }, { data: 'Macedonia' },
                    { data: 'The Former Yugoslav Republic of' }, { data: 'Madagascar' }, { data: 'Malawi' }, { data: 'Malaysia' },
                    { data: 'Maldives' }, { data: 'Mali' }, { data: 'Malta' }, { data: 'Marshall Islands' }, { data: 'Martinique' },
                    { data: 'Mauritania' }, { data: 'Mauritius' }, { data: 'Mayotte' }, { data: 'Mexico' }, { data: 'Micronesia' },
                    { data: 'Moldova' }, { data: 'Monaco' }, { data: 'Mongolia' }, { data: 'Montserrat' }, { data: 'Morocco' },
                    { data: 'Mozambique' }, { data: 'Myanmar' }, { data: 'Namibia' }, { data: 'Nauru' }, { data: 'Nepal' },
                    { data: 'Netherlands' }, { data: 'Netherlands Antilles' }, { data: 'New Caledonia' }, { data: 'New Zealand' },
                    { data: 'Nicaragua' }, { data: 'Niger' }, { data: 'Nigeria' }, { data: 'Niue' }, { data: 'Norfolk Island' },
                    { data: 'Northern Mariana Islands' }, { data: 'Norway' }, { data: 'Oman' }, { data: 'Pakistan' },
                    { data: 'Palau' }, { data: 'Palestinian Territory' }, { data: 'Panama' }, { data: 'Papua New Guinea' },
                    { data: 'Paraguay' }, { data: 'Peru' }, { data: 'Philippines' }, { data: 'Pitcairn' }, { data: 'Poland' },
                    { data: 'Portugal' }, { data: 'Puerto Rico' }, { data: 'Qatar' }, { data: 'Reunion' }, { data: 'Republika Srpska' },
                    { data: 'Romania' }, { data: 'Romania & Moldova' }, { data: 'Russia' }, { data: 'Russian Federation' },
                    { data: 'Rwanda' }, { data: 'Saint Helena' }, { data: 'Saint Kitts and Nevis' }, { data: 'Saint Lucia' },
                    { data: 'Saint Pierre and Miquelon' }, { data: 'Saint Vincent and The Grenadines' }, { data: 'Samoa' },
                    { data: 'San Marino' }, { data: 'Sao Tome and Principe' }, { data: 'Saudi Arabia' }, { data: 'Senegal' },
                    { data: 'Serbia' }, { data: 'Seychelles' }, { data: 'Sierra Leone' }, { data: 'Singapore' }, { data: 'Slovakia' },
                    { data: 'Slovenia' }, { data: 'Solomon Islands' }, { data: 'Somalia' }, { data: 'South Africa' },
                    { data: 'South Georgia and The South Sandwich Islands' }, { data: 'Spain' }, { data: 'Sri Lanka' },
                    { data: 'Sudan' }, { data: 'Suriname' }, { data: 'Svalbard and Jan Mayen' }, { data: 'Swaziland' },
                    { data: 'Sweden' }, { data: 'Switzerland' }, { data: 'Syrian Arab Republic' }, { data: 'Taiwan' },
                    { data: 'Province of China' }, { data: 'Tajikistan' }, { data: 'Tanzania' }, { data: 'Thailand' },
                    { data: 'Timor - leste' }, { data: 'Togo' }, { data: 'Tokelau' }, { data: 'Tonga' }, { data: 'Trinidad and Tobago' },
                    { data: 'Tunisia' }, { data: 'Turkey' }, { data: 'Turkmenistan' }, { data: 'Turks and Caicos Islands' },
                    { data: 'Tuvalu' }, { data: 'Uganda' }, { data: 'Ukraine' }, { data: 'United Arab Emirates' }, { data: 'United Kingdom' },
                    { data: 'United States' }, { data: 'United States Minor Outlying Islands' }, { data: 'Uruguay' },
                    { data: 'Uzbekistan' }, { data: 'Vanuatu' }, { data: 'Venezuela' }, { data: 'Vietnam' }, { data: 'Virgin Islands' },
                    { data: 'Wallis and Futuna' }, { data: 'Western Sahara' }, { data: 'Yemen' }, { data: 'Zambia' },
                    { data: 'Zimbabwe' }
                ],
                placeholder: gadgetMsg[ 'countries-affiliate-operates-in-placeholder' ]
            } );
            if ( this.countries_affiliate_operates_in ) {
                this.fieldCountriesAffiliateOperateIn.setData( this.countries_affiliate_operates_in );
            }

            fieldLanguagesSupportedByAffiliateSelected = [];
            for ( i = 0; i < this.languages_supported_by_affiliate.length; i++ ) {
                fieldLanguagesSupportedByAffiliateSelected.push( {
                    data: this.languages_supported_by_affiliate[ i ]
                } );
            }
            this.fieldLanguagesSupportedByAffiliate = new OO.ui.MenuTagMultiselectWidget( {
                selected: fieldLanguagesSupportedByAffiliateSelected,
                icon: 'language',
                options: [
                    { data: 'Abkhazian~ab', label: 'Abkhazian' },
                    { data: 'Achinese~ace', label: 'Achinese' },
                    { data: 'Adyghe~ady', label: 'Adyghe' },
                    { data: 'Afrikaans~af', label: 'Afrikaans' },
                    { data: 'Akan~ak', label: 'Akan' },
                    { data: 'Alsatian~als', label: 'Alsatian' },
                    { data: 'Amharic~am', label: 'Amharic' },
                    { data: 'Aragonese~an', label: 'Aragonese' },
                    { data: 'Old English~ang', label: 'Old English' },
                    { data: 'Arabic~ar', label: 'Arabic' },
                    { data: 'Aramaic~arc', label: 'Aramaic' },
                    { data: 'Moroccan Arabic~ary', label: 'Moroccan Arabic' },
                    { data: 'Egyptian Arabic~arz', label: 'Egyptian Arabic' },
                    { data: 'Assamese~as', label: 'Assamese' },
                    { data: 'Asturian~ast', label: 'Asturian' },
                    { data: 'Atikamekw~atj', label: 'Atikamekw' },
                    { data: 'Avaric~av', label: 'Avaric' },
                    { data: 'Kotava~avk', label: 'Kotava' },
                    { data: 'Awadhi~awa', label: 'Awadhi' },
                    { data: 'Aymara~ay', label: 'Aymara' },
                    { data: 'Azerbaijani~az', label: 'Azerbaijani' },
                    { data: 'South Azerbaijani~azb', label: 'South Azerbaijani' },
                    { data: 'Bashkir~ba', label: 'Bashkir' },
                    { data: 'Balinese~ban', label: 'Balinese' },
                    { data: 'Bavarian~bar', label: 'Bavarian' },
                    { data: 'Samogitian~bat-smg', label: 'Samogitian' },
                    { data: 'Central Bikol~bcl', label: 'Central Bikol' },
                    { data: 'Belarusian~be', label: 'Belarusian' },
                    { data: 'Belarusian (old)~be-x-old', label: 'Belarusian (old)' },
                    { data: 'Bulgarian~bg', label: 'Bulgarian' },
                    { data: 'Bhojpuri~bh', label: 'Bhojpuri' },
                    { data: 'Bislama~bi', label: 'Bislama' },
                    { data: 'Banjar~bjn', label: 'Banjar' },
                    { data: 'Bambara~bm', label: 'Bambara' },
                    { data: 'Bangla~bn', label: 'Bangla' },
                    { data: 'Tibetan~bo', label: 'Tibetan' },
                    { data: 'Bishnupriya~bpy', label: 'Bishnupriya' },
                    { data: 'Breton~br', label: 'Breton' },
                    { data: 'Bosnian~bs', label: 'Bosnian' },
                    { data: 'Buginese~bug', label: 'Buginese' },
                    { data: 'Russia Buriat~bxr', label: 'Russia Buriat' },
                    { data: 'Catalan~ca', label: 'Catalan' },
                    { data: 'Chavacano~cbk-zam', label: 'Chavacano' },
                    { data: 'Min Dong Chinese~cdo', label: 'Min Dong Chinese' },
                    { data: 'Chechen~ce', label: 'Chechen' },
                    { data: 'Cebuano~ceb', label: 'Cebuano' },
                    { data: 'Chamorro~ch', label: 'Chamorro' },
                    { data: 'Cherokee~chr', label: 'Cherokee' },
                    { data: 'Cheyenne~chy', label: 'Cheyenne' },
                    { data: 'Central Kurdish~ckb', label: 'Central Kurdish' },
                    { data: 'Corsican~co', label: 'Corsican' },
                    { data: 'Cree~cr', label: 'Cree' },
                    { data: 'Crimean Turkish~crh', label: 'Crimean Turkish' },
                    { data: 'Czech~cs', label: 'Czech' },
                    { data: 'Kashubian~csb', label: 'Kashubian' },
                    { data: 'Church Slavic~cu', label: 'Church Slavic' },
                    { data: 'Chuvash~cv', label: 'Chuvash' },
                    { data: 'Welsh~cy', label: 'Welsh' },
                    { data: 'Danish~da', label: 'Danish' },
                    { data: 'German~de', label: 'German' },
                    { data: 'Dinka~din', label: 'Dinka' },
                    { data: 'Zazaki~diq', label: 'Zazaki' },
                    { data: 'Lower Sorbian~dsb', label: 'Lower Sorbian' },
                    { data: 'Divehi~dv', label: 'Divehi' },
                    { data: 'Dzongkha~dz', label: 'Dzongkha' },
                    { data: 'Ewe~ee', label: 'Ewe' },
                    { data: 'Greek~el', label: 'Greek' },
                    { data: 'Emiliano-Romagnolo~eml', label: 'Emiliano-Romagnolo' },
                    { data: 'English~en', label: 'English' },
                    { data: 'Esperanto~eo', label: 'Esperanto' },
                    { data: 'Spanish~es', label: 'Spanish' },
                    { data: 'Estonian~et', label: 'Estonian' },
                    { data: 'Basque~eu', label: 'Basque' },
                    { data: 'Extremaduran~ext', label: 'Extremaduran' },
                    { data: 'Persian~fa', label: 'Persian' },
                    { data: 'Fulah~ff', label: 'Fulah' },
                    { data: 'Finnish~fi', label: 'Finnish' },
                    { data: 'Võro~fiu-vro', label: 'Võro' },
                    { data: 'Fijian~fj', label: 'Fijian' },
                    { data: 'Faroese~fo', label: 'Faroese' },
                    { data: 'French~fr', label: 'French' },
                    { data: 'Arpitan~frp', label: 'Arpitan' },
                    { data: 'Northern Frisian~frr', label: 'Northern Frisian' },
                    { data: 'Friulian~fur', label: 'Friulian' },
                    { data: 'Western Frisian~fy', label: 'Western Frisian' },
                    { data: 'Irish~ga', label: 'Irish' },
                    { data: 'Gagauz~gag', label: 'Gagauz' },
                    { data: 'Gan Chinese~gan', label: 'Gan Chinese' },
                    { data: 'Guianan Creole~gcr', label: 'Guianan Creole' },
                    { data: 'Scottish Gaelic~gd', label: 'Scottish Gaelic' },
                    { data: 'Galician~gl', label: 'Galician' },
                    { data: 'Gilaki~glk', label: 'Gilaki' },
                    { data: 'Guarani~gn', label: 'Guarani' },
                    { data: 'Goan Konkani~gom', label: 'Goan Konkani' },
                    { data: 'Gorontalo~gor', label: 'Gorontalo' },
                    { data: 'Gothic~got', label: 'Gothic' },
                    { data: 'Gujarati~gu', label: 'Gujarati' },
                    { data: 'Manx~gv', label: 'Manx' },
                    { data: 'Hausa~ha', label: 'Hausa' },
                    { data: 'Hakka Chinese~hak', label: 'Hakka Chinese' },
                    { data: 'Hawaiian~haw', label: 'Hawaiian' },
                    { data: 'Hebrew~he', label: 'Hebrew' },
                    { data: 'Hindi~hi', label: 'Hindi' },
                    { data: 'Fiji Hindi~hif', label: 'Fiji Hindi' },
                    { data: 'Croatian~hr', label: 'Croatian' },
                    { data: 'Upper Sorbian~hsb', label: 'Upper Sorbian' },
                    { data: 'Haitian Creole~ht', label: 'Haitian Creole' },
                    { data: 'Hungarian~hu', label: 'Hungarian' },
                    { data: 'Armenian~hy', label: 'Armenian' },
                    { data: 'Western Armenian~hyw', label: 'Western Armenian' },
                    { data: 'Interlingua~ia', label: 'Interlingua' },
                    { data: 'Indonesian~id', label: 'Indonesian' },
                    { data: 'Interlingue~ie', label: 'Interlingue' },
                    { data: 'Igbo~ig', label: 'Igbo' },
                    { data: 'Inupiaq~ik', label: 'Inupiaq' },
                    { data: 'Iloko~ilo', label: 'Iloko' },
                    { data: 'Ingush~inh', label: 'Ingush' },
                    { data: 'Ido~io', label: 'Ido' },
                    { data: 'Icelandic~is', label: 'Icelandic' },
                    { data: 'Italian~it', label: 'Italian' },
                    { data: 'Inuktitut~iu', label: 'Inuktitut' },
                    { data: 'Japanese~ja', label: 'Japanese' },
                    { data: 'Jamaican Creole English~jam', label: 'Jamaican Creole English' },
                    { data: 'Lojban~jbo', label: 'Lojban' },
                    { data: 'Javanese~jv', label: 'Javanese' },
                    { data: 'Georgian~ka', label: 'Georgian' },
                    { data: 'Kara-Kalpak~kaa', label: 'Kara-Kalpak' },
                    { data: 'Kabyle~kab', label: 'Kabyle' },
                    { data: 'Kabardian~kbd', label: 'Kabardian' },
                    { data: 'Kabiye~kbp', label: 'Kabiye' },
                    { data: 'Kongo~kg', label: 'Kongo' },
                    { data: 'Kikuyu~ki', label: 'Kikuyu' },
                    { data: 'Kazakh~kk', label: 'Kazakh' },
                    { data: 'Kalaallisut~kl', label: 'Kalaallisut' },
                    { data: 'Khmer~km', label: 'Khmer' },
                    { data: 'Kannada~kn', label: 'Kannada' },
                    { data: 'Korean~ko', label: 'Korean' },
                    { data: 'Komi-Permyak~koi', label: 'Komi-Permyak' },
                    { data: 'Karachay-Balkar~krc', label: 'Karachay-Balkar' },
                    { data: 'Kashmiri~ks', label: 'Kashmiri' },
                    { data: 'Colognian~ksh', label: 'Colognian' },
                    { data: 'Kurdish~ku', label: 'Kurdish' },
                    { data: 'Komi~kv', label: 'Komi' },
                    { data: 'Cornish~kw', label: 'Cornish' },
                    { data: 'Kyrgyz~ky', label: 'Kyrgyz' },
                    { data: 'Latin~la', label: 'Latin' },
                    { data: 'Ladino~lad', label: 'Ladino' },
                    { data: 'Luxembourgish~lb', label: 'Luxembourgish' },
                    { data: 'Lak~lbe', label: 'Lak' },
                    { data: 'Lezghian~lez', label: 'Lezghian' },
                    { data: 'Lingua Franca Nova~lfn', label: 'Lingua Franca Nova' },
                    { data: 'Ganda~lg', label: 'Ganda' },
                    { data: 'Limburgish~li', label: 'Limburgish' },
                    { data: 'Ligurian~lij', label: 'Ligurian' },
                    { data: 'Ladin~lld', label: 'Ladin' },
                    { data: 'Lombard~lmo', label: 'Lombard' },
                    { data: 'Lingala~ln', label: 'Lingala' },
                    { data: 'Lao~lo', label: 'Lao' },
                    { data: 'Northern Luri~lrc', label: 'Northern Luri' },
                    { data: 'Lithuanian~lt', label: 'Lithuanian' },
                    { data: 'Latgalian~ltg', label: 'Latgalian' },
                    { data: 'Latvian~lv', label: 'Latvian' },
                    { data: 'Maithili~mai', label: 'Maithili' },
                    { data: 'Banyumasan~map-bms', label: 'Banyumasan' },
                    { data: 'Moksha~mdf', label: 'Moksha' },
                    { data: 'Malagasy~mg', label: 'Malagasy' },
                    { data: 'Eastern Mari~mhr', label: 'Eastern Mari' },
                    { data: 'Maori~mi', label: 'Maori' },
                    { data: 'Minangkabau~min', label: 'Minangkabau' },
                    { data: 'Macedonian~mk', label: 'Macedonian' },
                    { data: 'Malayalam~ml', label: 'Malayalam' },
                    { data: 'Mongolian~mn', label: 'Mongolian' },
                    { data: 'Mon~mnw', label: 'Mon' },
                    { data: 'Marathi~mr', label: 'Marathi' },
                    { data: 'Western Mari~mrj', label: 'Western Mari' },
                    { data: 'Malay~ms', label: 'Malay' },
                    { data: 'Maltese~mt', label: 'Maltese' },
                    { data: 'Mirandese~mwl', label: 'Mirandese' },
                    { data: 'Burmese~my', label: 'Burmese' },
                    { data: 'Erzya~myv', label: 'Erzya' },
                    { data: 'Mazanderani~mzn', label: 'Mazanderani' },
                    { data: 'Nauru~na', label: 'Nauru' },
                    { data: 'Nahuatl~nah', label: 'Nahuatl' },
                    { data: 'Neapolitan~nap', label: 'Neapolitan' },
                    { data: 'Low German~nds', label: 'Low German' },
                    { data: 'Low Saxon~nds-nl', label: 'Low Saxon' },
                    { data: 'Nepali~ne', label: 'Nepali' },
                    { data: 'Newari~new', label: 'Newari' },
                    { data: 'Dutch~nl', label: 'Dutch' },
                    { data: 'Norwegian Nynorsk~nn', label: 'Norwegian Nynorsk' },
                    { data: 'Norwegian~no', label: 'Norwegian' },
                    { data: 'Novial~nov', label: 'Novial' },
                    { data: 'N’Ko~nqo', label: 'N’Ko' },
                    { data: 'Norman~nrm', label: 'Norman' },
                    { data: 'Northern Sotho~nso', label: 'Northern Sotho' },
                    { data: 'Navajo~nv', label: 'Navajo' },
                    { data: 'Nyanja~ny', label: 'Nyanja' },
                    { data: 'Occitan~oc', label: 'Occitan' },
                    { data: 'Livvi-Karelian~olo', label: 'Livvi-Karelian' },
                    { data: 'Oromo~om', label: 'Oromo' },
                    { data: 'Odia~or', label: 'Odia' },
                    { data: 'Ossetic~os', label: 'Ossetic' },
                    { data: 'Punjabi~pa', label: 'Punjabi' },
                    { data: 'Pangasinan~pag', label: 'Pangasinan' },
                    { data: 'Pampanga~pam', label: 'Pampanga' },
                    { data: 'Papiamento~pap', label: 'Papiamento' },
                    { data: 'Picard~pcd', label: 'Picard' },
                    { data: 'Pennsylvania German~pdc', label: 'Pennsylvania German' },
                    { data: 'Palatine German~pfl', label: 'Palatine German' },
                    { data: 'Pali~pi', label: 'Pali' },
                    { data: 'Norfuk-Pitkern~pih', label: 'Norfuk-Pitkern' },
                    { data: 'Polish~pl', label: 'Polish' },
                    { data: 'Piedmontese~pms', label: 'Piedmontese' },
                    { data: 'Western Punjabi~pnb', label: 'Western Punjabi' },
                    { data: 'Pontic~pnt', label: 'Pontic' },
                    { data: 'Pashto~ps', label: 'Pashto' },
                    { data: 'Portuguese~pt', label: 'Portuguese' },
                    { data: 'Quechua~qu', label: 'Quechua' },
                    { data: 'Romansh~rm', label: 'Romansh' },
                    { data: 'Vlax Romani~rmy', label: 'Vlax Romani' },
                    { data: 'Rundi~rn', label: 'Rundi' },
                    { data: 'Romanian~ro', label: 'Romanian' },
                    { data: 'Aromanian~roa-rup', label: 'Aromanian' },
                    { data: 'Tarantino~roa-tara', label: 'Tarantino' },
                    { data: 'Russian~ru', label: 'Russian' },
                    { data: 'Rusyn~rue', label: 'Rusyn' },
                    { data: 'Kinyarwanda~rw', label: 'Kinyarwanda' },
                    { data: 'Sanskrit~sa', label: 'Sanskrit' },
                    { data: 'Sakha~sah', label: 'Sakha' },
                    { data: 'Santali~sat', label: 'Santali' },
                    { data: 'Sardinian~sc', label: 'Sardinian' },
                    { data: 'Sicilian~scn', label: 'Sicilian' },
                    { data: 'Scots~sco', label: 'Scots' },
                    { data: 'Sindhi~sd', label: 'Sindhi' },
                    { data: 'Northern Sami~se', label: 'Northern Sami' },
                    { data: 'Sango~sg', label: 'Sango' },
                    { data: 'Serbo-Croatian~sh', label: 'Serbo-Croatian' },
                    { data: 'Shan~shn', label: 'Shan' },
                    { data: 'Shawiya~shy', label: 'Shawiya' },
                    { data: 'Sinhala~si', label: 'Sinhala' },
                    { data: 'Simple English~simple', label: 'Simple English' },
                    { data: 'Slovak~sk', label: 'Slovak' },
                    { data: 'Slovenian~sl', label: 'Slovenian' },
                    { data: 'Samoan~sm', label: 'Samoan' },
                    { data: 'Shona~sn', label: 'Shona' },
                    { data: 'Somali~so', label: 'Somali' },
                    { data: 'Albanian~sq', label: 'Albanian' },
                    { data: 'Serbian~sr', label: 'Serbian' },
                    { data: 'Sranan Tongo~srn', label: 'Sranan Tongo' },
                    { data: 'Swati~ss', label: 'Swati' },
                    { data: 'Southern Sotho~st', label: 'Southern Sotho' },
                    { data: 'Saterland Frisian~stq', label: 'Saterland Frisian' },
                    { data: 'Sundanese~su', label: 'Sundanese' },
                    { data: 'Swedish~sv', label: 'Swedish' },
                    { data: 'Swahili~sw', label: 'Swahili' },
                    { data: 'Silesian~szl', label: 'Silesian' },
                    { data: 'Sakizaya~szy', label: 'Sakizaya' },
                    { data: 'Tamil~ta', label: 'Tamil' },
                    { data: 'Tulu~tcy', label: 'Tulu' },
                    { data: 'Telugu~te', label: 'Telugu' },
                    { data: 'Tetum~tet', label: 'Tetum' },
                    { data: 'Tajik~tg', label: 'Tajik' },
                    { data: 'Thai~th', label: 'Thai' },
                    { data: 'Tigrinya~ti', label: 'Tigrinya' },
                    { data: 'Turkmen~tk', label: 'Turkmen' },
                    { data: 'Tagalog~tl', label: 'Tagalog' },
                    { data: 'Tswana~tn', label: 'Tswana' },
                    { data: 'Tongan~to', label: 'Tongan' },
                    { data: 'Tok Pisin~tpi', label: 'Tok Pisin' },
                    { data: 'Turkish~tr', label: 'Turkish' },
                    { data: 'Tsonga~ts', label: 'Tsonga' },
                    { data: 'Tatar~tt', label: 'Tatar' },
                    { data: 'Tumbuka~tum', label: 'Tumbuka' },
                    { data: 'Twi~tw', label: 'Twi' },
                    { data: 'Tahitian~ty', label: 'Tahitian' },
                    { data: 'Tuvinian~tyv', label: 'Tuvinian' },
                    { data: 'Udmurt~udm', label: 'Udmurt' },
                    { data: 'Uyghur~ug', label: 'Uyghur' },
                    { data: 'Ukrainian~uk', label: 'Ukrainian' },
                    { data: 'Urdu~ur', label: 'Urdu' },
                    { data: 'Uzbek~uz', label: 'Uzbek' },
                    { data: 'Venda~ve', label: 'Venda' },
                    { data: 'Venetian~vec', label: 'Venetian' },
                    { data: 'Veps~vep', label: 'Veps' },
                    { data: 'Vietnamese~vi', label: 'Vietnamese' },
                    { data: 'West Flemish~vls', label: 'West Flemish' },
                    { data: 'Volapük~vo', label: 'Volapük' },
                    { data: 'Walloon~wa', label: 'Walloon' },
                    { data: 'Waray~war', label: 'Waray' },
                    { data: 'Wolof~wo', label: 'Wolof' },
                    { data: 'Wu Chinese~wuu', label: 'Wu Chinese' },
                    { data: 'Kalmyk~xal', label: 'Kalmyk' },
                    { data: 'Xhosa~xh', label: 'Xhosa' },
                    { data: 'Mingrelian~xmf', label: 'Mingrelian' },
                    { data: 'Yiddish~yi', label: 'Yiddish' },
                    { data: 'Yoruba~yo', label: 'Yoruba' },
                    { data: 'Zhuang~za', label: 'Zhuang' },
                    { data: 'Zeelandic~zea', label: 'Zeelandic' },
                    { data: 'Chinese~zh', label: 'Chinese' },
                    { data: 'Classical Chinese~zh-classical', label: 'Classical Chinese' },
                    { data: 'Chinese (Min Nan)~zh-min-nan', label: 'Chinese (Min Nan)' },
                    { data: 'Cantonese~zh-yue', label: 'Cantonese' },
                    { data: 'Zulu~zu', label: 'Zulu' }
                ],
                placeholder: gadgetMsg[ 'languages-supported-by-affiliate-placeholder' ]
            } );
            if ( this.languages_supported_by_affiliate ) {
                this.fieldLanguagesSupportedByAffiliate.setData( this.languages_supported_by_affiliate );
            }

            this.fieldSandboxReport = new OO.ui.CheckboxInputWidget( {} );
            if ( EDITMODE === 'sandbox' ) {
                this.fieldSandboxReport.setSelected( true );
            }

            this.fieldSandboxReport.on( 'change', function ( isSelected ) {
                if ( isSelected ) {
                    EDITMODE = 'sandbox';
                } else {
                    EDITMODE = '';
                }
            } );

            this.fieldImportedReportCB = new OO.ui.CheckboxInputWidget( {} );
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
                        this.fieldCountriesAffiliateOperateIn,
                        {
                            label: gadgetMsg[ 'countries-affiliate-operates-in' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldLanguagesSupportedByAffiliate,
                        {
                            label: gadgetMsg[ 'languages-supported-by-affiliate' ],
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
        ActivitiesEditorW1.prototype.getBodyHeight = function () {
            return 550;
        };

        /**
         * In the event "Select" is pressed
         *
         */
        ActivitiesEditorW1.prototype.getActionProcess = function ( action ) {
            var dialog = this, allRequiredFieldsAvailable = false;

            if (
                dialog.fieldGroupName.getValue() &&
                dialog.fieldStartDate.getValue() &&
                dialog.fieldEndDate.getValue() &&
                dialog.fieldReportLink.getValue()
            ) {
                allRequiredFieldsAvailable = true;
            }

            if ( allRequiredFieldsAvailable &&
                action === 'continue' &&
                uniqueIdGlb !== ''
            ) {
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
         * Save the changes to [[Module:Activities_Reports]] or [[Module:Activities_Reports/Sandbox]] page.
         */
        ActivitiesEditorW1.prototype.saveItem = function ( deleteFlag ) {
            var dialog = this;

            dialog.pushPending();
            apiObj = new mw.Api();

            apiObj.get( getModuleContent( 'Activities_Reports/Sandbox' ) ).then( function ( sandboxData ) {
                apiObj.get( getModuleContent( 'Activities_Reports' ) ).then( function ( data ) {
                    var i, insertInPlace, processWorkingEntry, editSummary,
                        manifest = [], workingEntry, entries;

                    sandbox_activities_reports = sandboxData;

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
                            // Cache the group name to be used in later screen
                            groupNameGlb = workingEntry.group_name;
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
                            for ( i = 0; i < workingEntry.partnership_info.length; i++ ) {
                                if ( workingEntry.partnership_info[ i ] === 'Other' ) {
                                    workingEntry.partnership_info[ i ] = dialog.fieldPartnershipOtherInput.getValue();
                                }
                            }
                        } else if ( !dialog.fieldPartnershipInfo.findSelectedItemsData() && workingEntry.partnership_info ) {
                            delete workingEntry.partnership_info;
                        }

                        if ( dialog.fieldCountriesAffiliateOperateIn.getValue() ) {
                            workingEntry.countries_affiliate_operates_in = dialog.fieldCountriesAffiliateOperateIn.getValue();
                        } else if ( !dialog.fieldCountriesAffiliateOperateIn.getValue() && workingEntry.countries_affiliate_operates_in ) {
                            delete workingEntry.countries_affiliate_operates_in;
                        }

                        if ( dialog.fieldLanguagesSupportedByAffiliate.getValue() ) {
                            workingEntry.languages_supported_by_affiliate = dialog.fieldLanguagesSupportedByAffiliate.getValue();
                        } else if ( !dialog.fieldLanguagesSupportedByAffiliate.getValue() && workingEntry.languages_supported_by_affiliate ) {
                            delete workingEntry.languages_supported_by_affiliate;
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
                        // Cache the unique ID to be used in the later screen.
                        uniqueIdGlb = workingEntry.unique_id;
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
                        if ( manifest[ i ].countries_affiliate_operates_in ) {
                            insertInPlace += generateKeyValuePair(
                                'countries_affiliate_operates_in',
                                manifest[ i ].countries_affiliate_operates_in
                            );
                        }
                        if ( manifest[ i ].languages_supported_by_affiliate ) {
                            insertInPlace += generateKeyValuePair(
                                'languages_supported_by_affiliate',
                                manifest[ i ].languages_supported_by_affiliate
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
                            pageid: PAGEID,
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
                            message: gadgetMsg[ 'activity-report-saved' ],
                            actions: [
                                {
                                    action: 'accept',
                                    label: 'Dismiss',
                                    flags: 'primary'
                                }
                            ]
                        } );

                        windowManager.closeWindow( messageDialog );

                        // Purge the cache of the page from which the edit was made
                        new mw.Api().postWithToken(
                            'csrf',
                            { action: 'purge', titles: mw.config.values.wgPageName }
                        ).then( function () {
                            /* TODO: Enable when working on "back" action
                            if ( EDITMODE === 'sandbox' ) {
                                // Just open second window (empty as nothing has been saved)
                                openWindow2( {} );
                            } else {
                                // no-op
                            }*/
                            openWindow2( {} );
                        } );
                    } ).catch( function ( error ) {
                        alert( gadgetMsg[ 'failed-to-save-to-lua-table' ] );
                        dialog.close();
                        console.error( error );
                    } );
                } );
            } );
        };

        /**
         * The dialog / window to be displayed as editor.
         *
         * @param {Object} config
         */
        openWindow1 = function ( config ) {
            var activitiesEditor;
            config.size = 'large';
            activitiesEditor = new ActivitiesEditorW1( config );

            windowManager = new OO.ui.WindowManager();
            $( 'body' ).append( windowManager.$element );
            windowManager.addWindows( [ activitiesEditor ] );
            windowManager.openWindow( activitiesEditor );
        };

        /********************** Window 1 dialog logic end ***************/

        /********************** Window 2 dialog logic start ***************/
        /**
         * Subclass ProcessDialog - window 2 for collecting
         * activities related to Wikimedia affiliates.
         *
         * @class ActivitiesEditorW2
         * @extends OO.ui.ProcessDialog
         *
         * @constructor
         * @param {Object} config
         */
        function ActivitiesEditorW2 ( config ) {
            this.primary_contact1 = '';
            this.primary_contact2 = '';
            this.editors = '';
            this.non_editors = '';
            this.event_participants = '';
            this.event_supporters = '';
            this.event_leaders = '';
            this.past_programs = [];
            this.capacities_to_strengthen = [];
            this.created_at = '';

            if ( config.unique_id ) {
                this.uniqueId = config.unique_id;
            }

            if ( config.primary_contact1 ) {
                this.primary_contact1 = config.primary_contact1;
            }
            if ( config.primary_contact2 ) {
                this.prmary_contact2 = config.prmary_contact2;
            }
            if ( config.editors ) {
                this.editors = config.editors;
            }
            if ( config.non_editors ) {
                this.non_editors = config.non_editors;
            }
            if ( config.event_participants ) {
                this.event_participants = config.event_participants;
            }
            if ( config.event_supporters ) {
                this.event_supporters = config.event_supporters;
            }
            if ( config.event_leaders ) {
                this.event_leaders = config.event_leaders;
            }
            if ( config.past_programs ) {
                this.past_programs = config.past_programs;
            }
            if ( config.capacities_to_strengthen ) {
                this.capacities_to_strengthen = config.capacities_to_strengthen;
            }
            if ( config.created_at ) {
                this.created_at = config.created_at;
            }
            ActivitiesEditorW2.super.call( this, config );
        }

        OO.inheritClass( ActivitiesEditorW2, OO.ui.ProcessDialog );

        ActivitiesEditorW2.static.name = 'activitiesEditor2';
        ActivitiesEditorW2.static.title = gadgetMsg[ 'activities-report-header' ];
        ActivitiesEditorW2.static.actions = [
            {
                action: 'continue',
                modes: 'edit',
                label: gadgetMsg[ 'submit-report' ],
                flags: [ 'primary', 'constructive' ]
            },
            /* TODO: Enable when action is resolved.
            {
                action: 'back',
                modes: 'edit',
                label: gadgetMsg[ 'ar-back-button' ],
                flags: 'safe'
            },*/
            {
                action: 'cancel',
                modes: 'edit',
                label: gadgetMsg[ 'ar-cancel-button' ],
                flags: 'safe'
            }
        ];

        /**
         * Use the initialize() method to add content to the dialog's $body,
         * to initialize widgets, and to set up event handlers.
         */
        ActivitiesEditorW2.prototype.initialize = function () {
            var i, fieldPastProgramsSelected, fieldCapacitiesSelected,
                fieldCapacities, multiSelectLimit = 3;

            ActivitiesEditorW2.super.prototype.initialize.call( this );
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

            this.$body.append( '<h3 style="background-color: grey; text-align: center;">' + gadgetMsg[ 'ar-scr2-header' ] + '<br/></h3>' );

            this.$body.append( '<p style="padding: 10px;">' + gadgetMsg[ 'ar-scr2-more-info' ] + '<br/></p>' );

            this.$body.append( '<p style="background-color: lightgrey; text-align: center; padding: 10px;" >' + gadgetMsg[ 'ar-scr2-tip' ] + '<br/></p>' );

            this.fieldPrimaryContact1 = new OO.ui.TextInputWidget( {
                value: this.primary_contact1,
                indicator: 'required',
                required: true,
                labelPosition: 'before',
                label: 'User:'
            } );

            this.fieldPrimaryContact2 = new OO.ui.TextInputWidget( {
                value: this.primary_contact2,
                indicator: 'required',
                required: true,
                labelPosition: 'before',
                label: 'User:'
            } );

            // this.$body.append( '<p><br/>' + gadgetMsg[ 'depth-of-volunteer-support-base' ] + '<br/></p>' );

            this.fieldEditors = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.editors,
                indicator: 'required',
                required: true
            } );

            this.fieldNonEditors = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.non_editors,
                indicator: 'required',
                required: true
            } );

            this.fieldEventParticipants = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.event_participants,
                indicator: 'required',
                required: true
            } );

            this.fieldEventSupporters = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.event_supporters,
                indicator: 'required',
                required: true
            } );

            this.fieldEventLeaders = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.event_leaders,
                indicator: 'required',
                required: true
            } );

            fieldPastProgramsSelected = [];
            for ( i = 0; i < this.past_programs.length; i++ ) {
                fieldPastProgramsSelected.push(
                    { data: this.past_programs[ i ] }
                );
            }

            this.fieldPastPrograms = new OO.ui.CheckboxMultiselectWidget( {
                classes: [ 'checkbox-inline' ],
                selected: fieldPastProgramsSelected,
                items: [
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'Conference organizing',
                        label: gadgetMsg[ 'ar-scr2-conference-organizing' ]
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'GLAM partnerships',
                        label: gadgetMsg[ 'ar-scr2-glam-partnerships' ]
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'Education partnerships',
                        label: gadgetMsg[ 'ar-scr2-education-partnerships' ]
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'Policy advocacy',
                        label: gadgetMsg[ 'ar-scr2-policy-advocacy' ]
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'Photo upload activities',
                        label: gadgetMsg[ 'ar-scr2-photo-upload-activities' ]
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'Content editing activities',
                        label: gadgetMsg[ 'ar-scr2-content-editing-activities' ]
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'Meet-ups',
                        label: gadgetMsg[ 'ar-scr2-meetups' ]
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'Technical events',
                        label: gadgetMsg[ 'ar-scr2-technical-events' ]
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'International campaigns',
                        label: gadgetMsg[ 'ar-scr2-international-campaigns' ]
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'National campaigns',
                        label: gadgetMsg[ 'ar-scr2-national-campaigns' ]
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'Other partnerships (i.e. Wikimedia Research, Wikipedia Library, STEM, etc)',
                        label: gadgetMsg[ 'ar-scr2-other' ]
                    } ),
                ]
            } );

            fieldCapacitiesSelected = [];
            for ( i = 0; i < multiSelectLimit; i++ ) {
                fieldCapacitiesSelected.push(
                    { data: this.capacities_to_strengthen[ i ] }
                );
            }

            fieldCapacities = this.fieldCapacitiesToStrengthen = new OO.ui.CheckboxMultiselectWidget( {
                classes: [ 'checkbox-inline' ],
                selected: fieldCapacitiesSelected,
                items: [
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'Evaluation',
                        label: gadgetMsg[ 'ar-scr2-evaluation' ],
                        id: 'max-select-options'
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'Community governance',
                        label: gadgetMsg[ 'ar-scr2-community-governance' ],
                        id: 'max-select-options'
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'Programs & Events',
                        label: gadgetMsg[ 'ar-scr2-programs-and-events' ],
                        id: 'max-select-options'
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'Organizational governance & resource policies',
                        label: gadgetMsg[ 'ar-scr2-org-governance-and-resource-policies' ],
                        id: 'max-select-options'
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'Conflict management',
                        label: gadgetMsg[ 'ar-scr2-conflict-management' ],
                        id: 'max-select-options'
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'Partnerships',
                        label: gadgetMsg[ 'ar-scr2-partnerships' ],
                        id: 'max-select-options'
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'Fundraising',
                        label: gadgetMsg[ 'ar-scr2-fundraising' ],
                        id: 'max-select-options'
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'Communication & media relations',
                        label: gadgetMsg[ 'ar-scr2-comms-and-media-relations' ],
                        id: 'max-select-options'
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'Contributor development',
                        label: gadgetMsg[ 'ar-scr2-contributor-dev' ],
                        id: 'max-select-options'
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'On-wiki technical skills',
                        label: gadgetMsg[ 'ar-scr2-onwiki-tech-skills' ],
                        id: 'max-select-options'
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'Policy advocacy',
                        label: gadgetMsg[ 'ar-scr2-policy-advocacy' ],
                        id: 'max-select-options'
                    } ),
                ]
            } );

            this.fieldCapacitiesToStrengthen.on( 'select', function () {
                if ( $( "label#max-select-options>span>input:checked" ).length >= multiSelectLimit ) {
                    $( "label#max-select-options>span>input:not(:checked)" ).attr( 'disabled', 'disabled' );
                } else {
                    $( "label#max-select-options>span>input:not(:checked)" ).removeAttr( 'disabled' );
                }
            } );

            // Append things to fieldSet
            this.fieldSet = new OO.ui.FieldsetLayout( {
                items: [
                    new OO.ui.FieldLayout(
                        this.fieldPopup, {}
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldPrimaryContact1,
                        {
                            label: gadgetMsg[ 'ar-primary-contact1' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldPrimaryContact2,
                        {
                            label: gadgetMsg[ 'ar-primary-contact2' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldEditors,
                        {
                            label: gadgetMsg[ 'ar-editors' ],
                            align: 'top',
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldNonEditors,
                        {
                            label: gadgetMsg[ 'ar-non-editors' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldEventParticipants,
                        {
                            label: gadgetMsg[ 'ar-event-participants' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldEventSupporters,
                        {
                            label: gadgetMsg[ 'ar-event-supporters' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldEventLeaders,
                        {
                            label: gadgetMsg[ 'ar-event-leaders' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldPastPrograms,
                        {
                            label: gadgetMsg[ 'ar-past-programs' ],
                            align: 'top',
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldCapacitiesToStrengthen,
                        {
                            label: gadgetMsg[ 'ar-scr2-capacities-to-strengthen' ],
                            align: 'top'
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
        ActivitiesEditorW2.prototype.getBodyHeight = function () {
            return 550;
        };

        /**
         * In the event "Select" is pressed
         *
         */
        ActivitiesEditorW2.prototype.getActionProcess = function ( action ) {
            var dialog = this, allRequiredFieldsAvailable = false;

            if (
                dialog.fieldPrimaryContact1.getValue() &&
                dialog.fieldPrimaryContact2.getValue() &&
                dialog.fieldEditors.getValue() &&
                dialog.fieldNonEditors.getValue() &&
                dialog.fieldEventParticipants.getValue() &&
                dialog.fieldEventSupporters.getValue() &&
                dialog.fieldEventLeaders.getValue()
            ) {
                allRequiredFieldsAvailable = true;
            }

            if (
                allRequiredFieldsAvailable &&
                action === 'continue' &&
                uniqueIdGlb !== ''
            ) {
                return new OO.ui.Process( function () {
                    dialog.saveItem();
                } );
            } else if ( !allRequiredFieldsAvailable && action === 'continue' ) {
                return new OO.ui.Process( function () {
                    dialog.fieldPopup.toggle( true );
                } );
            } else if ( action === 'back' && uniqueIdGlb !== '' ) {
                dialog.close();
                return new OO.ui.Process( function () {
                    new mw.Api().get( getModuleContent( 'Activities_Reports/Sandbox' ) ).then( function ( data ) {
                        var entryData;

                        entryData = cleanRawEntry(
                            getRelevantRawEntry(
                                parseContentModule( data.query.pages ),
                                uniqueIdGlb
                            )
                        );
                        openWindow1( entryData );
                    } );
                } );
            } else {
                return new OO.ui.Process( function () {
                    dialog.close();
                } );
            }
        };

        /**
         * Updates the [Organization_Informations] table  with the new group contacts
         * provided when submitting or editing Activity Reports
         *
         * @param {string} affiliate_name - Affiliate identifier
         * @param {string} groupContact1 - Primary contact 1
         * @param {string} groupContact2 - Primary contact 2
         * @return {null}
         */
        updateGroupContactsOrgInfo = function ( affiliate_name, groupContact1, groupContact2 ) {
            var apiObj = mw.Api();
            apiObj.get( getModuleContent( 'Organizational_Informations' ) ).then( function ( data ) {
                var i,
                    insertInPlace,
                    processWorkingEntry,
                    editSummary,
                    manifest = [],
                    workingEntry,
                    entries;

                processWorkingEntry = function ( entry ) {
                    entry.group_contact1 = groupContact1;
                    entry.group_contact2 = groupContact2;

                    return entry;
                };

                entries = parseContentModule( data.query.pages );
                // Re-generate the Lua table based on 'manifest'
                for ( i = 0; i < entries.length; i++ ) {
                    workingEntry = cleanRawEntry( entries[ i ].value.fields );
                    workingEntry = processWorkingEntry( workingEntry );
                    manifest.push( workingEntry );
                }

                insertInPlace = 'return {\n';
                // Re-generate the Lua table based on `manifest`
                for ( i = 0; i < manifest.length; i++ ) {
                    insertInPlace += '\t{\n';
                    if ( manifest[ i ].unique_id ) {
                        insertInPlace += generateKeyValuePair( 'unique_id', manifest[ i ].unique_id );
                    }
                    if ( manifest[ i ].affiliate_code ) {
                        insertInPlace += generateKeyValuePair( 'affiliate_code', manifest[ i ].affiliate_code );
                    }
                    if ( manifest[ i ].group_name ) {
                        insertInPlace += generateKeyValuePair( 'group_name', manifest[ i ].group_name );
                    }
                    if ( manifest[ i ].org_type ) {
                        insertInPlace += generateKeyValuePair( 'org_type', manifest[ i ].org_type );
                    }
                    if ( manifest[ i ].region ) {
                        insertInPlace += generateKeyValuePair( 'region', manifest[ i ].region );
                    }
                    if ( manifest[ i ].group_country ) {
                        insertInPlace += generateKeyValuePair( 'group_country', manifest[ i ].group_country );
                    }
                    if ( !manifest[ i ].legal_entity && manifest[ i ].org_type === 'User Group' ) {
                        insertInPlace += generateKeyValuePair( 'legal_entity', 'No' );
                    } else if ( manifest[ i ].legal_entity && manifest[ i ].org_type === 'User Group' ) {
                        insertInPlace += generateKeyValuePair( 'legal_entity', manifest[ i ].legal_entity );
                    } else {
                        insertInPlace += generateKeyValuePair( 'legal_entity', 'Yes' );
                    }
                    if ( manifest[ i ].mission_changed ) {
                        insertInPlace += generateKeyValuePair( 'mission_changed', manifest[ i ].mission_changed );
                    }
                    if ( manifest[ i ].explanation ) {
                        insertInPlace += generateKeyValuePair( 'explanation', manifest[ i ].explanation );
                    }
                    if ( manifest[ i ].group_page ) {
                        insertInPlace += generateKeyValuePair( 'group_page', manifest[ i ].group_page.trim() );
                    }
                    if ( manifest[ i ].member_count ) {
                        insertInPlace += generateKeyValuePair( 'member_count', manifest[ i ].member_count );
                    }
                    if ( manifest[ i ].non_editors_count ) {
                        insertInPlace += generateKeyValuePair( 'non_editors_count', manifest[ i ].non_editors_count );
                    }
                    if ( manifest[ i ].facebook ) {
                        insertInPlace += generateKeyValuePair( 'facebook', manifest[ i ].facebook.trim() );
                    }
                    if ( manifest[ i ].twitter ) {
                        insertInPlace += generateKeyValuePair( 'twitter', manifest[ i ].twitter.trim() );
                    }
                    if ( manifest[ i ].other ) {
                        insertInPlace += generateKeyValuePair( 'other', manifest[ i ].other.trim() );
                    }
                    if ( manifest[ i ].dm_structure ) {
                        insertInPlace += generateKeyValuePair( 'dm_structure', manifest[ i ].dm_structure );
                    }
                    if ( typeof manifest[ i ].group_contact1 !== 'undefined' && manifest[ i ].group_contact1.indexOf( 'User:' ) !== -1 ) {
                        insertInPlace += generateKeyValuePair( 'group_contact1', manifest[ i ].group_contact1 );
                    } else if ( manifest[ i ].group_contact1 ) {
                        insertInPlace += generateKeyValuePair( 'group_contact1', 'User:' + manifest[ i ].group_contact1 );
                    } else {
                        insertInPlace += generateKeyValuePair( 'group_contact1', '' );
                    }
                    if ( typeof manifest[ i ].group_contact2 !== 'undefined' && manifest[ i ].group_contact2.indexOf( 'User:' ) !== -1 ) {
                        insertInPlace += generateKeyValuePair( 'group_contact2', manifest[ i ].group_contact2 );
                    } else if ( manifest[ i ].group_contact2 ) {
                        insertInPlace += generateKeyValuePair( 'group_contact2', 'User:' + manifest[ i ].group_contact2 );
                    } else {
                        insertInPlace += generateKeyValuePair( 'group_contact2', '' );
                    }
                    if ( manifest[ i ].board_contacts ) {
                        insertInPlace += generateKeyValuePair( 'board_contacts', manifest[ i ].board_contacts );
                    }
                    if ( manifest[ i ].agreement_date ) {
                        insertInPlace += generateKeyValuePair( 'agreement_date', manifest[ i ].agreement_date );
                    }
                    if ( manifest[ i ].fiscal_year_start ) {
                        insertInPlace += generateKeyValuePair( 'fiscal_year_start', manifest[ i ].fiscal_year_start );
                    } else {
                        insertInPlace += generateKeyValuePair( 'fiscal_year_start', '' );
                    }
                    if ( manifest[ i ].fiscal_year_end ) {
                        insertInPlace += generateKeyValuePair( 'fiscal_year_end', manifest[ i ].fiscal_year_end );
                    } else {
                        insertInPlace += generateKeyValuePair( 'fiscal_year_end', '' );
                    }
                    if ( manifest[ i ].uptodate_reporting ) {
                        insertInPlace += generateKeyValuePair( 'uptodate_reporting', manifest[ i ].uptodate_reporting );
                    }
                    if ( manifest[ i ].notes_on_reporting ) {
                        insertInPlace += generateKeyValuePair( 'notes_on_reporting', manifest[ i ].notes_on_reporting );
                    } else {
                        insertInPlace += generateKeyValuePair( 'notes_on_reporting', '' );
                    }
                    if ( manifest[ i ].recognition_status ) {
                        insertInPlace += generateKeyValuePair( 'recognition_status', manifest[ i ].recognition_status );
                    }
                    if ( manifest[ i ].me_bypass_ooc_autochecks ) {
                        insertInPlace += generateKeyValuePair( 'me_bypass_ooc_autochecks', manifest[ i ].me_bypass_ooc_autochecks );
                    }
                    if ( manifest[ i ].out_of_compliance_level ) {
                        insertInPlace += generateKeyValuePair( 'out_of_compliance_level', manifest[ i ].out_of_compliance_level );
                    }
                    if ( manifest[ i ].reporting_due_date ) {
                        insertInPlace += generateKeyValuePair( 'reporting_due_date', manifest[ i ].reporting_due_date );
                    } else { // Fallback to the same day a year ahead for new affiliates.
                        insertInPlace += generateKeyValuePair( 'reporting_due_date', getNextReportingDate() );
                    }
                    if ( manifest[ i ].derecognition_date ) {
                        insertInPlace += generateKeyValuePair( 'derecognition_date', manifest[ i ].derecognition_date );
                    }
                    if ( manifest[ i ].derecognition_note ) {
                        insertInPlace += generateKeyValuePair( 'derecognition_note', manifest[ i ].derecognition_note );
                    }
                    if ( manifest[ i ].dos_stamp ) {
                        insertInPlace += generateKeyValuePair( 'dos_stamp', manifest[ i ].dos_stamp );
                    }
                    insertInPlace += '\t},\n';
                }
                insertInPlace += '}';
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
                );
            } );
        };

        /**
         * Save the changes to [[Module:Activities_Reports/Affiliate_Information]].
         */
        ActivitiesEditorW2.prototype.saveItem = function ( deleteFlag ) {
            var dialog = this;

            dialog.pushPending();
            apiObj = new mw.Api();

            apiObj.get( getModuleContent( 'Activities_Reports/Affiliate_Information' ) ).then( function ( affiliateInfos ) {
                apiObj.get( getModuleContent( 'Activities_Reports/Sandbox' ) ).then( function ( data ) {
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
                        workingEntry.group_name = groupNameGlb;

                        if ( dialog.fieldPrimaryContact1.getValue() ) {
                            workingEntry.primary_contact1 = dialog.fieldPrimaryContact1.getValue();
                        } else if ( !dialog.fieldPrimaryContact1.getValue() && workingEntry.primary_contact1 ) {
                            delete workingEntry.primary_contact1;
                        }

                        if ( dialog.fieldPrimaryContact2.getValue() ) {
                            workingEntry.primary_contact2 = dialog.fieldPrimaryContact2.getValue();
                        } else if ( !dialog.fieldPrimaryContact2.getValue() && workingEntry.primary_contact2 ) {
                            delete workingEntry.primary_contact2;
                        }

                        if ( dialog.fieldEditors.getValue() ) {
                            workingEntry.editors = dialog.fieldEditors.getValue();
                        } else if ( !dialog.fieldEditors.getValue() && workingEntry.editors ) {
                            delete workingEntry.editors;
                        }

                        if ( dialog.fieldNonEditors.getValue() ) {
                            workingEntry.non_editors = dialog.fieldNonEditors.getValue();
                        } else if ( !dialog.fieldNonEditors.getValue() && workingEntry.non_editors ) {
                            delete workingEntry.non_editors;
                        }

                        if ( dialog.fieldEventParticipants.getValue() ) {
                            workingEntry.event_participants = dialog.fieldEventParticipants.getValue();
                        } else if ( !dialog.fieldEventParticipants.getValue() && workingEntry.event_participants ) {
                            delete workingEntry.event_participants;
                        }

                        if ( dialog.fieldEventSupporters.getValue() ) {
                            workingEntry.event_supporters = dialog.fieldEventSupporters.getValue();
                        } else if ( !dialog.fieldEventSupporters.getValue() && workingEntry.event_supporters ) {
                            delete workingEntry.event_supporters;
                        }

                        if ( dialog.fieldEventLeaders.getValue() ) {
                            workingEntry.event_leaders = dialog.fieldEventLeaders.getValue();
                        } else if ( !dialog.fieldEventLeaders.getValue() && workingEntry.event_leaders ) {
                            delete workingEntry.event_leaders;
                        }

                        if ( dialog.fieldPastPrograms.findSelectedItemsData() ) {
                            workingEntry.past_programs = dialog.fieldPastPrograms.findSelectedItemsData();
                        } else if ( !dialog.fieldPastPrograms.findSelectedItemsData() && workingEntry.past_programs ) {
                            delete workingEntry.past_programs;
                        }

                        if ( dialog.fieldCapacitiesToStrengthen.findSelectedItemsData() ) {
                            workingEntry.capacities_to_strengthen = dialog.fieldCapacitiesToStrengthen.findSelectedItemsData();
                        } else if ( !dialog.fieldPastPrograms.findSelectedItemsData() && workingEntry.capacities_to_strengthen ) {
                            delete workingEntry.capacities_to_strengthen;
                        }

                        workingEntry.created_at = new Date().toISOString();

                        return workingEntry;
                    };

                    entries = parseContentModule( affiliateInfos.query.pages );

                    for ( i = 0; i < entries.length; i++ ) {
                        workingEntry = cleanRawEntry( entries[ i ].value.fields );
                        if ( workingEntry.unique_id !== dialog.uniqueId || !deleteFlag ) {
                            manifest.push( workingEntry );
                        } else if ( workingEntry.unique_id === uniqueIdGlb ) {
                            workingEntry = processWorkingEntry( workingEntry );
                            editSummary = 'Updating activity report data for: ' + workingEntry.group_name;
                        }
                    }

                    // No unique ID means this is a new entry
                    if ( !dialog.uniqueId ) {
                        workingEntry = {
                            unique_id: uniqueIdGlb
                        };
                        workingEntry = processWorkingEntry( workingEntry );
                        editSummary = gadgetMsg[ 'added-new-activities-report' ] + ' ' + workingEntry.group_name;
                        manifest.push( workingEntry );
                    }

                    // Re-generate the Lua table based on `manifest
                    insertInPlace = 'return {\n';
                    for ( i = 0; i < manifest.length; i++ ) {
                        if ( groupNameGlb == manifest[ i ].group_name ) {
                            updateGroupContactsOrgInfo( groupNameGlb, manifest[ i ].primary_contact1, manifest[ i ].primary_contact2 );
                        }
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
                        if ( manifest[ i ].primary_contact1 && manifest[ i ].primary_contact1.indexOf( "User:" ) !== -1 ) {
                            insertInPlace += generateKeyValuePair(
                                'primary_contact1',
                                manifest[ i ].primary_contact1
                            );
                        } else {
                            insertInPlace += generateKeyValuePair(
                                'primary_contact1',
                                'User:' + manifest[ i ].primary_contact1
                            );
                        }
                        if ( manifest[ i ].primary_contact2 && manifest[ i ].primary_contact2.indexOf( "User:" ) !== -1 ) {
                            insertInPlace += generateKeyValuePair(
                                'primary_contact2',
                                manifest[ i ].primary_contact2
                            );
                        } else {
                            insertInPlace += generateKeyValuePair(
                                'primary_contact2',
                                'User:' + manifest[ i ].primary_contact2
                            );
                        }
                        if ( manifest[ i ].editors ) {
                            insertInPlace += generateKeyValuePair(
                                'editors',
                                manifest[ i ].editors
                            );
                        }
                        if ( manifest[ i ].non_editors ) {
                            insertInPlace += generateKeyValuePair(
                                'non_editors',
                                manifest[ i ].non_editors
                            );
                        }
                        if ( manifest[ i ].event_participants ) {
                            insertInPlace += generateKeyValuePair(
                                'event_participants',
                                manifest[ i ].event_participants
                            );
                        }
                        if ( manifest[ i ].event_supporters ) {
                            insertInPlace += generateKeyValuePair(
                                'event_supporters',
                                manifest[ i ].event_supporters
                            );
                        }
                        if ( manifest[ i ].event_leaders ) {
                            insertInPlace += generateKeyValuePair(
                                'event_leaders',
                                manifest[ i ].event_leaders
                            );
                        }
                        if ( manifest[ i ].past_programs ) {
                            insertInPlace += generateKeyValuePair(
                                'past_programs',
                                manifest[ i ].past_programs
                            );
                        }
                        if ( manifest[ i ].capacities_to_strengthen ) {
                            insertInPlace += generateKeyValuePair(
                                'capacities_to_strengthen',
                                manifest[ i ].capacities_to_strengthen
                            );
                        }
                        if ( manifest[ i ].created_at ) {
                            insertInPlace += generateKeyValuePair(
                                'created_at',
                                manifest[ i ].created_at
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
                            pageid: 11674033, // [[AR/Affiliate_Information]]
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
                            message: gadgetMsg[ 'activity-report-saved' ],
                            actions: [
                                {
                                    action: 'accept',
                                    label: 'Dismiss',
                                    flags: 'primary'
                                }
                            ]
                        } );

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
            } );
        };

        /**
         * The dialog / window to be displayed as editor.
         *
         * @param {Object} config
         */
        openWindow2 = function ( config ) {
            var activitiesEditor;
            config.size = 'large';
            activitiesEditor = new ActivitiesEditorW2( config );

            windowManager = new OO.ui.WindowManager();
            $( 'body' ).append( windowManager.$element );
            windowManager.addWindows( [ activitiesEditor ] );
            windowManager.openWindow( activitiesEditor );
        };
        /********************** Window 2 dialog logic end ***************/

        $( '.activitiesReport' ).on( 'click', function () {
            // First check if the user is logged in
            if ( mw.config.get( 'wgUserName' ) === null ) {
                alert( gadgetMsg[ 'you-need-to-log-in' ] );
            } else {
                openWindow1( {} );
            }
        } );
    }

    // This is called after the module dependencies are ready
    function initAfterModules () {
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
            console.error( error, 'Unable to load translation strings - __ARF__' );
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
