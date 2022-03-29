/**
 * Affiliate Indicators Upload Form
 * @author Derick Alangi (WMF)
 */
( function () {
    'use strict';

    var AffiliateLookupTextInputWidget,
        cleanRawEntry,
        clonePmcEntry,
        convertDateToDdMmYyyyFormat,
        convertDateToYyyyMmDdFormat,
        generateKeyValuePair,
        getAffiliatesList,
        getRelevantRawEntry,
        openWindow1,
        openWindow2,
        openWindow3,
        parseAIUDataModule,
        persistentGroupName,
        persistentId,
        pmcEntries,
        pmcEntriesDialog = [],
        pmcTabs = false,
        pmcTabsArray = [],
        sanitizeInput,
        userLang,
        windowManager,
        gadgetMsg = {},
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
         * Clone PMC entry data to tab panel layout constructor
         */
        clonePmcEntry = function ( tabName ) {
            console.log( tabName );
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
         * Takes Lua-formatted content from [[Module:Affiliate_Indicators]]
         * and returns an abstract syntax tree.
         *
         * @param {Object} sourceblob The original API return
         * @return {Object} Abstract syntax tree
         */
        parseAIUDataModule = function ( sourceblob ) {
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
                entryData[ relevantRawEntry[ i ].key.name ] = relevantRawEntry[ i ].value.value;
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
         * Method to Lookup Affiliate names from [[m:Wikimedia_movement_affiliates/Official_affiliates_names]]
         * and to be used as autocomplete form element in the forms
         */
        AffiliateLookupTextInputWidget = function AffiliatesLookupTextInputWidget( config ) {
            // Parent constructor
            OO.ui.TextInputWidget.call( this, $.extend(
                {
                    indicator: 'required',
                    id: 'group_name',
                    icon: 'userGroup',
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


        /********************** Window 1 dialog logic start ***************/
        /**
         * Subclass ProcessDialog
         *
         * @class AffiliateIndicatorEditorW1
         * @extends OO.ui.ProcessDialog
         *
         * @constructor
         * @param {Object} config
         */
        function AffiliateIndicatorEditorW1( config ) {
            this.affiliate_code = '';
            this.group_name = '';
            this.start_date = '';
            this.end_date = '';
            this.no_of_donations = '';
            this.donation_renewal_rate = '';
            this.index_score_donor_satisfaction = '';
            this.members_reported = '';
            this.membership_duration = '';
            this.net_members_yoy = '';
            this.index_score_member_satisfaction = '';
            this.pp_score = '';
            this.net_no_of_partners_yoy = '';
            this.index_score_partner_satisfaction = '';
            this.revenue_reliability = '';
            this.budget_surpluses = '';
            this.overhead_cost_total_budget = '';
            this.liquid_months = '';
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
            if ( config.start_date ) {
                this.start_date = config.start_date;
            }
            if ( config.end_date ) {
                this.end_date = config.end_date;
            }
            if ( config.no_of_donations ) {
                this.no_of_donations = config.no_of_donations;
            }
            if ( config.donation_renewal_rate ) {
                this.donation_renewal_rate = config.donation_renewal_rate;
            }
            if ( config.index_score_donor_satisfaction ) {
                this.index_score_donor_satisfaction = config.index_score_donor_satisfaction;
            }
            if ( config.members_reported ) {
                this.members_reported = config.members_reported;
            }
            if ( config.membership_duration ) {
                this.membership_duration = config.membership_duration;
            }
            if ( config.net_members_yoy ) {
                this.net_members_yoy = config.net_members_yoy;
            }
            if ( config.index_score_member_satisfaction ) {
                this.index_score_member_satisfaction = config.index_score_member_satisfaction;
            }
            if ( config.pp_score ) {
                this.pp_score = config.pp_score;
            }
            if ( config.net_no_of_partners_yoy ) {
                this.net_no_of_partners_yoy = config.net_no_of_partners_yoy;
            }
            if ( config.index_score_partner_satisfaction ) {
                this.index_score_partner_satisfaction = config.index_score_partner_satisfaction;
            }
            if ( config.revenue_reliability ) {
                this.revenue_reliability = config.revenue_reliability;
            }
            if ( config.budget_surpluses ) {
                this.budget_surpluses = config.budget_surpluses;
            }
            if ( config.overhead_cost_total_budget ) {
                this.overhead_cost_total_budget = config.overhead_cost_total_budget;
            }
            if ( config.liquid_months ) {
                this.liquid_months = config.liquid_months;
            }
            if ( config.dos_stamp ) {
                this.dos_stamp = config.dos_stamp;
            }
            AffiliateIndicatorEditorW1.super.call( this, config );
        }
        OO.inheritClass( AffiliateIndicatorEditorW1, OO.ui.ProcessDialog );

        AffiliateIndicatorEditorW1.static.name = 'AffiliateIndicatorEditorW1';
        AffiliateIndicatorEditorW1.static.title = gadgetMsg[ 'aff-indicators-upload-form-header' ];
        AffiliateIndicatorEditorW1.static.actions = [
            {
                action: 'continue',
                modes: 'edit',
                label: gadgetMsg[ 'aiu-next-button' ],
                flags: [ 'primary', 'constructive' ]
            },
            {
                action: 'cancel',
                modes: 'edit',
                label: gadgetMsg[ 'aiu-cancel-button' ],
                flags: 'safe'
            }
        ];

        /**
         * Use the initialize() method to add content to the dialog's $body,
         * to initialize widgets, and to set up event handlers.
         */
        AffiliateIndicatorEditorW1.prototype.initialize = function () {
            AffiliateIndicatorEditorW1.super.prototype.initialize.call( this );
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

            // On edit, pass in the group name as config to be rendered.
            this.group_name = this.group_name ? this.group_name : '';
            this.fieldGroupName = new AffiliateLookupTextInputWidget( this.group_name );

            this.fieldStartDate = new mw.widgets.DateInputWidget( {
                value: this.start_date ? convertDateToYyyyMmDdFormat( this.start_date ) : this.start_date,
                classes: [ 'full-width' ],
                placeholderLabel: gadgetMsg[ 'start-date-placeholder' ],
                required: true
            } );
            this.fieldEndDate = new mw.widgets.DateInputWidget( {
                value: this.end_date ? convertDateToYyyyMmDdFormat( this.end_date ) : this.end_date,
                classes: [ 'full-width' ],
                placeholderLabel: gadgetMsg[ 'end-date-placeholder' ],
                required: true
            } );

            this.fieldSetSpdr = new OO.ui.FieldsetLayout( {
                label: gadgetMsg[ 'stakeholder-perspectives-donors' ],
            } );
            this.fieldNoOfDonations = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.no_of_donations,
                placeholder: gadgetMsg[ 'enter-number' ]
            } );
            this.fieldDonationRenewalRate = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.donation_renewal_rate,
                placeholder: gadgetMsg[ 'enter-percentage' ]
            } );
            this.fieldIndexScoreDonorSatisfaction = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.index_score_donor_satisfaction,
                placeholder: gadgetMsg[ 'enter-percentage' ]
            } );
            this.fieldSetSpdr.addItems( [
                new OO.ui.FieldLayout( this.fieldNoOfDonations, { label: gadgetMsg[ 'no-of-donations' ], align: 'inline' } ),
                new OO.ui.FieldLayout( this.fieldDonationRenewalRate, { label: gadgetMsg[ 'donation-renewal-rate' ], align: 'inline' } ),
                new OO.ui.FieldLayout( this.fieldIndexScoreDonorSatisfaction, { label: gadgetMsg[ 'index-score-of-donor-satisfaction' ], align: 'inline' } ),
            ] );

            this.fieldSetSpm = new OO.ui.FieldsetLayout( {
                label: gadgetMsg[ 'stakeholder-perspectives-membership' ],
            } );
            this.fieldMembersReported = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.members_reported,
                placeholder: gadgetMsg[ 'enter-percentage' ]
            } );
            this.fieldMembershipDuration = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.membership_duration,
                placeholder: gadgetMsg[ 'enter-number' ]
            } );
            this.fieldNetMembersYoY = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.net_members_yoy,
                placeholder: gadgetMsg[ 'enter-number' ]
            } );
            this.fieldIndexScoreMemberSatisfaction = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.index_score_member_satisfaction,
                placeholder: gadgetMsg[ 'enter-percentage' ]
            } );
            this.fieldSetSpm.addItems( [
                new OO.ui.FieldLayout( this.fieldMembersReported, { label: gadgetMsg[ 'members-reported' ], align: 'inline' } ),
                new OO.ui.FieldLayout( this.fieldMembershipDuration, { label: gadgetMsg[ 'duration-of-membership' ], align: 'inline' } ),
                new OO.ui.FieldLayout( this.fieldNetMembersYoY, { label: gadgetMsg[ 'net-members-yoy' ], align: 'inline' } ),
                new OO.ui.FieldLayout( this.fieldIndexScoreMemberSatisfaction, { label: gadgetMsg[ 'index-score-of-member-satisfaction' ], align: 'inline' } ),
            ] );

            this.fieldSetSpp = new OO.ui.FieldsetLayout( {
                label: gadgetMsg[ 'stakeholder-perspectives-partnerships' ],
            } );
            this.fieldP2pScore = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.pp_score,
                placeholder: gadgetMsg[ 'enter-percentage' ]
            } );
            this.fieldNetNoOfPartnersYoY = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.net_no_of_partners_yoy,
                placeholder: gadgetMsg[ 'enter-percentage' ]
            } );
            this.fieldIndexScorePartnerSatisfaction = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.index_score_partner_satisfaction,
                placeholder: gadgetMsg[ 'enter-percentage' ]
            } );
            this.fieldSetSpp.addItems( [
                new OO.ui.FieldLayout( this.fieldP2pScore, { label: gadgetMsg[ 'pp-score' ], align: 'inline' } ),
                new OO.ui.FieldLayout( this.fieldNetNoOfPartnersYoY, { label: gadgetMsg[ 'net-no-of-partners-yoy' ], align: 'inline' } ),
                new OO.ui.FieldLayout( this.fieldIndexScorePartnerSatisfaction, { label: gadgetMsg[ 'index-score-of-partner-satisfaction' ], align: 'inline' } ),
            ] );

            this.fieldSetFp = new OO.ui.FieldsetLayout( {
                label: gadgetMsg[ 'financial-perspectives' ],
            } );
            this.fieldRevenueReliability = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.revenue_reliability,
                placeholder: gadgetMsg[ 'amount-usd' ]
            } );
            this.fieldBudgetSurpluses = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.budget_surpluses,
                placeholder: gadgetMsg[ 'amount-usd' ]
            } );
            this.fieldOverheadCostTotalBudget = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.overhead_cost_total_budget,
                placeholder: gadgetMsg[ 'enter-percentage' ]
            } );
            this.fieldLiquidMonths = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.liquid_months,
                placeholder: gadgetMsg[ 'amount-usd' ]
            } );
            this.fieldSetFp.addItems( [
                new OO.ui.FieldLayout( this.fieldRevenueReliability, { label: gadgetMsg[ 'revenue-reliability' ], align: 'inline' } ),
                new OO.ui.FieldLayout( this.fieldBudgetSurpluses, { label: gadgetMsg[ 'budget-surpluses' ], align: 'inline' } ),
                new OO.ui.FieldLayout( this.fieldOverheadCostTotalBudget, { label: gadgetMsg[ 'overhead-cost-total-budget' ], align: 'inline' } ),
                new OO.ui.FieldLayout( this.fieldLiquidMonths, { label: gadgetMsg[ 'liquid-months' ], align: 'inline' } ),
            ] );

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
                    )
                ]
            } );

            // When everything is done
            this.content.$element.append( this.fieldSet.$element );
            this.content.$element.append( this.fieldSetSpdr.$element );
            this.content.$element.append( this.fieldSetSpm.$element );
            this.content.$element.append( this.fieldSetSpp.$element );
            this.content.$element.append( this.fieldSetFp.$element );
            this.$body.append( this.content.$element );
        };

        /**
         * Set custom height for the modal window
         */
        AffiliateIndicatorEditorW1.prototype.getBodyHeight = function () {
            return 700;
        };

        /**
         * In the event "Select" is pressed
         */
        AffiliateIndicatorEditorW1.prototype.getActionProcess = function ( action ) {
            var dialog = this, allRequiredFieldsAvailable = false;

            if (
                dialog.fieldGroupName.getValue() &&
                dialog.fieldStartDate.getValue() &&
                dialog.fieldEndDate.getValue()
            ) {
                allRequiredFieldsAvailable = true;
            }

            if ( action === 'continue' && allRequiredFieldsAvailable ) {
                return new OO.ui.Process( function () {
                    dialog.saveItem();
                } );
            } else if ( action === 'continue' && !allRequiredFieldsAvailable ) {
                return new OO.ui.Process( function () {
                    dialog.fieldPopup.toggle( true );
                } );
            } else if ( action === 'cancel' && persistentId ) {
                return new OO.ui.Process( function () {
                    new OO.ui.confirm(
                        gadgetMsg[ 'confirm-cancel-action' ]
                    ).then( function ( confirmed ) {
                        if ( confirmed ) {
                            dialog.saveItem( 'delete' );
                        }
                    } );
                } );
            } else {
                return new OO.ui.Process( function () {
                    dialog.close();
                } );
            }
        };

        /**
         * Save the changes to [[Module:Affiliate_Indicators]] page.
         */
        AffiliateIndicatorEditorW1.prototype.saveItem = function ( deleteFlag ) {
            var dialog = this;

            dialog.pushPending();

            new mw.Api().get( getModuleContent( 'Affiliate_Indicators' ) ).then( function ( data ) {
                var i, insertInPlace, processWorkingEntry,
                    editSummary, manifest = [], workingEntry, entries;

                /**
                 * Compares a given [[Module:Affiliate_Indicators]] entry against
                 * the edit fields and applies changes where relevant.
                 *
                 * @param {Object} workingEntry the entry being worked on
                 * @return {Object} The same entry but with modifications
                 */
                processWorkingEntry = function ( workingEntry ) {
                    if ( dialog.fieldGroupName.getValue() ) {
                        var temp = dialog.fieldGroupName.getValue().split(' ~ ');
                        workingEntry.group_name = temp[0];
                        workingEntry.affiliate_code = temp[1];
                    } else if ( !dialog.fieldGroupName.getValue() && workingEntry.group_name ) {
                        delete workingEntry.group_name;
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

                    if ( dialog.fieldNoOfDonations.getValue() ) {
                        workingEntry.no_of_donations = dialog.fieldNoOfDonations.getValue();
                    } else if ( !dialog.fieldNoOfDonations.getValue() && workingEntry.no_of_donations ) {
                        delete workingEntry.no_of_donations;
                    }

                    if ( dialog.fieldDonationRenewalRate.getValue() ) {
                        workingEntry.donation_renewal_rate = dialog.fieldDonationRenewalRate.getValue();
                    } else if ( !dialog.fieldDonationRenewalRate.getValue() && workingEntry.donation_renewal_rate ) {
                        delete workingEntry.donation_renewal_rate;
                    }

                    if ( dialog.fieldIndexScoreDonorSatisfaction.getValue() ) {
                        workingEntry.index_score_donor_satisfaction = dialog.fieldIndexScoreDonorSatisfaction.getValue();
                    } else if ( !dialog.fieldIndexScoreDonorSatisfaction.getValue() && workingEntry.index_score_donor_satisfaction ) {
                        delete workingEntry.index_score_donor_satisfaction;
                    }

                    if ( dialog.fieldMembersReported.getValue() ) {
                        workingEntry.members_reported = dialog.fieldMembersReported.getValue();
                    } else if ( !dialog.fieldMembersReported.getValue() && workingEntry.members_reported ) {
                        delete workingEntry.members_reported;
                    }

                    if ( dialog.fieldMembershipDuration.getValue() ) {
                        workingEntry.membership_duration = dialog.fieldMembershipDuration.getValue();
                    } else if ( !dialog.fieldMembershipDuration.getValue() && workingEntry.membership_duration ) {
                        delete workingEntry.membership_duration;
                    }

                    if ( dialog.fieldNetMembersYoY.getValue() ) {
                        workingEntry.net_members_yoy = dialog.fieldNetMembersYoY.getValue();
                    } else if ( !dialog.fieldNetMembersYoY.getValue() && workingEntry.net_members_yoy ) {
                        delete workingEntry.net_members_yoy;
                    }

                    if ( dialog.fieldIndexScoreMemberSatisfaction.getValue() ) {
                        workingEntry.index_score_member_satisfaction = dialog.fieldIndexScoreMemberSatisfaction.getValue();
                    } else if ( !dialog.fieldIndexScoreMemberSatisfaction.getValue() && workingEntry.index_score_member_satisfaction ) {
                        delete workingEntry.index_score_member_satisfaction;
                    }

                    if ( dialog.fieldP2pScore.getValue() ) {
                        workingEntry.pp_score = dialog.fieldP2pScore.getValue();
                    } else if ( !dialog.fieldP2pScore.getValue() && workingEntry.pp_score ) {
                        delete workingEntry.pp_score;
                    }

                    if ( dialog.fieldNetNoOfPartnersYoY.getValue() ) {
                        workingEntry.net_no_of_partners_yoy = dialog.fieldNetNoOfPartnersYoY.getValue();
                    } else if ( !dialog.fieldNetNoOfPartnersYoY.getValue() && workingEntry.net_no_of_partners_yoy ) {
                        delete workingEntry.net_no_of_partners_yoy;
                    }

                    if ( dialog.fieldIndexScorePartnerSatisfaction.getValue() ) {
                        workingEntry.index_score_partner_satisfaction = dialog.fieldIndexScorePartnerSatisfaction.getValue();
                    } else if ( !dialog.fieldIndexScorePartnerSatisfaction.getValue() && workingEntry.index_score_partner_satisfaction ) {
                        delete workingEntry.index_score_partner_satisfaction;
                    }

                    if ( dialog.fieldRevenueReliability.getValue() ) {
                        workingEntry.revenue_reliability = dialog.fieldRevenueReliability.getValue();
                    } else if ( !dialog.fieldRevenueReliability.getValue() && workingEntry.revenue_reliability ) {
                        delete workingEntry.revenue_reliability;
                    }

                    if ( dialog.fieldBudgetSurpluses.getValue() ) {
                        workingEntry.budget_surpluses = dialog.fieldBudgetSurpluses.getValue();
                    } else if ( !dialog.fieldBudgetSurpluses.getValue() && workingEntry.budget_surpluses ) {
                        delete workingEntry.budget_surpluses;
                    }

                    if ( dialog.fieldOverheadCostTotalBudget.getValue() ) {
                        workingEntry.overhead_cost_total_budget = dialog.fieldOverheadCostTotalBudget.getValue();
                    } else if ( !dialog.fieldOverheadCostTotalBudget.getValue() && workingEntry.overhead_cost_total_budget ) {
                        delete workingEntry.overhead_cost_total_budget;
                    }

                    if ( dialog.fieldLiquidMonths.getValue() ) {
                        workingEntry.liquid_months = dialog.fieldLiquidMonths.getValue();
                    } else if ( !dialog.fieldLiquidMonths.getValue() && workingEntry.liquid_months ) {
                        delete workingEntry.liquid_months;
                    }

                    /* Get today's date and time in YYYY-MM-DDTHH:MM:SSZ */
                    /* format. dos stands for "date of submission" */
                    workingEntry.dos_stamp = new Date().toISOString();

                    return workingEntry;
                };

                // Cycle through existing entries. If we are editing an existing
                // entry, that entry will be modified in place.
                entries = parseAIUDataModule( data.query.pages );

                for ( i = 0; i < entries.length; i++ ) {
                    workingEntry = cleanRawEntry( entries[ i ].value.fields );
                    if ( workingEntry.group_name === dialog.group_name.split(' ~ ')[0] ) {
                        workingEntry = processWorkingEntry( workingEntry );
                        if ( deleteFlag ) {
                            editSummary = gadgetMsg[ 'revert-aiu-incomplete-entry' ] + ' ' + workingEntry.group_name;
                        } else {
                            editSummary = gadgetMsg[ 'updated-aff-indicators' ] + ' ' + workingEntry.group_name;
                        }
                    }
                    if ( workingEntry.unique_id !== dialog.uniqueId || !deleteFlag ) {
                        manifest.push( workingEntry );
                    }
                }

                /**
                 * NOTE:
                 *
                 * Also, make sure to also delete PMC entries for matching persistent ID
                 */
                new mw.Api().get( getModuleContent( 'Affiliate_Indicators/Programs' ) ).then( function ( data ) {
                    var manifest = [];

                    entries = parseAIUDataModule( data.query.pages );

                    for ( i = 0; i < entries.length; i++ ) {
                        workingEntry = cleanRawEntry( entries[ i ].value.fields );
                        if ( workingEntry.unique_id === persistentId && deleteFlag === 'delete' ) {
                            workingEntry = processWorkingEntry( workingEntry );
                            editSummary = gadgetMsg[ 'revert-aiu-incomplete-entry' ] + ' ' + persistentGroupName;
                        } else {
                            manifest.push( workingEntry );
                        }
                    }

                    // Save after writing
                    insertInPlace = 'return {\n';
                    for ( i = 0; i < manifest.length; i++ ) {
                        insertInPlace += '\t{\n';
                        if ( manifest[ i ].unique_id ) {
                            insertInPlace += generateKeyValuePair(
                                'unique_id',
                                manifest[ i ].unique_id
                            );
                        }
                        // We need a program_id in case we want to update
                        // a program if need be.
                        if ( manifest[ i ].program_id ) {
                            insertInPlace += generateKeyValuePair(
                                'program_id',
                                manifest[ i ].program_id
                            );
                        }
                        if ( manifest[ i ].program_name ) {
                            insertInPlace += generateKeyValuePair(
                                'program_name',
                                manifest[ i ].program_name
                            );
                        }
                        if ( manifest[ i ].pmc_start_date ) {
                            insertInPlace += generateKeyValuePair(
                                'pmc_start_date',
                                manifest[ i ].pmc_start_date
                            );
                        }
                        if ( manifest[ i ].pmc_end_date ) {
                            insertInPlace += generateKeyValuePair(
                                'pmc_end_date',
                                manifest[ i ].pmc_end_date
                            );
                        }
                        if ( manifest[ i ].program_type ) {
                            insertInPlace += generateKeyValuePair(
                                'program_type',
                                manifest[ i ].program_type
                            );
                        }
                        if ( manifest[ i ].resourcing_type ) {
                            insertInPlace += generateKeyValuePair(
                                'resourcing_type',
                                manifest[ i ].resourcing_type
                            );
                        }
                        if ( manifest[ i ].active_editors_involved ) {
                            insertInPlace += generateKeyValuePair(
                                'active_editors_involved',
                                manifest[ i ].active_editors_involved
                            );
                        }
                        if ( manifest[ i ].new_media_added ) {
                            insertInPlace += generateKeyValuePair(
                                'new_media_added',
                                manifest[ i ].new_media_added
                            );
                        }
                        if ( manifest[ i ].individuals_involved ) {
                            insertInPlace += generateKeyValuePair(
                                'individuals_involved',
                                manifest[ i ].individuals_involved
                            );
                        }
                        if ( manifest[ i ].articles_added ) {
                            insertInPlace += generateKeyValuePair(
                                'articles_added',
                                manifest[ i ].articles_added
                            );
                        }
                        if ( manifest[ i ].diversity_focus ) {
                            insertInPlace += generateKeyValuePair(
                                'diversity_focus',
                                manifest[ i ].diversity_focus
                            );
                        }
                        if ( manifest[ i ].partner_name_linked_to_program ) {
                            insertInPlace += generateKeyValuePair(
                                'partner_name_linked_to_program',
                                manifest[ i ].partner_name_linked_to_program
                            );
                        }
                        if ( manifest[ i ].partner_type ) {
                            insertInPlace += generateKeyValuePair(
                                'partner_type',
                                manifest[ i ].partner_type
                            );
                        }
                        if ( manifest[ i ].reach_of_partner ) {
                            insertInPlace += generateKeyValuePair(
                                'reach_of_partner',
                                manifest[ i ].reach_of_partner
                            );
                        }
                        if ( manifest[ i ].status_of_partnership ) {
                            insertInPlace += generateKeyValuePair(
                                'status_of_partnership',
                                manifest[ i ].status_of_partnership
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
                            pageid: 11119914,  // [[Module:Affiliate_Indicators/Programs]]
                            text: insertInPlace,
                            contentmodel: 'Scribunto'
                        }
                    );
                });

                // No unique ID means this is a new entry
                if ( !dialog.uniqueId ) {
                    workingEntry = {
                        unique_id: Math.random().toString( 36 ).substring( 2 )
                    };
                    workingEntry = processWorkingEntry( workingEntry );
                    editSummary = gadgetMsg[ 'added-new-aff-indicators' ] + ' ' + workingEntry.group_name;
                    manifest.push( workingEntry );

                    // Cache the unique ID persistent across different windows
                    persistentId = workingEntry.unique_id;
                    persistentGroupName = workingEntry.group_name;
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
                    if ( manifest[ i ].affiliate_code ) {
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
                    if ( manifest[ i ].no_of_donations ) {
                        insertInPlace += generateKeyValuePair(
                            'no_of_donations',
                            manifest[ i ].no_of_donations
                        );
                    }
                    if ( manifest[ i ].donation_renewal_rate ) {
                        insertInPlace += generateKeyValuePair(
                            'donation_renewal_rate',
                            manifest[ i ].donation_renewal_rate
                        );
                    }
                    if ( manifest[ i ].index_score_donor_satisfaction ) {
                        insertInPlace += generateKeyValuePair(
                            'index_score_donor_satisfaction',
                            manifest[ i ].index_score_donor_satisfaction
                        );
                    }
                    if ( manifest[ i ].members_reported ) {
                        insertInPlace += generateKeyValuePair(
                            'members_reported',
                            manifest[ i ].members_reported
                        );
                    }
                    if ( manifest[ i ].membership_duration ) {
                        insertInPlace += generateKeyValuePair(
                            'membership_duration',
                            manifest[ i ].membership_duration
                        );
                    }
                    if ( manifest[ i ].net_members_yoy ) {
                        insertInPlace += generateKeyValuePair(
                            'net_members_yoy',
                            manifest[ i ].net_members_yoy
                        );
                    }
                    if ( manifest[ i ].index_score_member_satisfaction ) {
                        insertInPlace += generateKeyValuePair(
                            'index_score_member_satisfaction',
                            manifest[ i ].index_score_member_satisfaction
                        );
                    }
                    if ( manifest[ i ].pp_score ) {
                        insertInPlace += generateKeyValuePair(
                            'pp_score',
                            manifest[ i ].pp_score
                        );
                    }
                    if ( manifest[ i ].net_no_of_partners_yoy ) {
                        insertInPlace += generateKeyValuePair(
                            'net_no_of_partners_yoy',
                            manifest[ i ].net_no_of_partners_yoy
                        );
                    }
                    if ( manifest[ i ].index_score_partner_satisfaction ) {
                        insertInPlace += generateKeyValuePair(
                            'index_score_partner_satisfaction',
                            manifest[ i ].index_score_partner_satisfaction
                        );
                    }
                    if ( manifest[ i ].revenue_reliability ) {
                        insertInPlace += generateKeyValuePair(
                            'revenue_reliability',
                            manifest[ i ].revenue_reliability
                        );
                    }
                    if ( manifest[ i ].budget_surpluses ) {
                        insertInPlace += generateKeyValuePair(
                            'budget_surpluses',
                            manifest[ i ].budget_surpluses
                        );
                    }
                    if ( manifest[ i ].overhead_cost_total_budget ) {
                        insertInPlace += generateKeyValuePair(
                            'overhead_cost_total_budget',
                            manifest[ i ].overhead_cost_total_budget
                        );
                    }
                    if ( manifest[ i ].liquid_months ) {
                        insertInPlace += generateKeyValuePair(
                            'liquid_months',
                            manifest[ i ].liquid_months
                        );
                    }
                    if ( manifest[ i ].programs_in_reporting_month ) {
                        insertInPlace += generateKeyValuePair(
                            'programs_in_reporting_month',
                            manifest[ i ].programs_in_reporting_month
                        );
                    }
                    if ( manifest[ i ].average_program_frequencies ) {
                        insertInPlace += generateKeyValuePair(
                            'average_program_frequencies',
                            manifest[ i ].average_program_frequencies
                        );
                    }
                    if ( manifest[ i ].program_success_rate ) {
                        insertInPlace += generateKeyValuePair(
                            'program_success_rate',
                            manifest[ i ].program_success_rate
                        );
                    }
                    if ( manifest[ i ].membership_to_program_threshold ) {
                        insertInPlace += generateKeyValuePair(
                            'membership_to_program_threshold',
                            manifest[ i ].membership_to_program_threshold
                        );
                    }
                    if ( manifest[ i ].no_of_partnerships ) {
                        insertInPlace += generateKeyValuePair(
                            'no_of_partnerships',
                            manifest[ i ].no_of_partnerships
                        );
                    }
                    if ( manifest[ i ].average_age_of_partnerships ) {
                        insertInPlace += generateKeyValuePair(
                            'average_age_of_partnerships',
                            manifest[ i ].average_age_of_partnerships
                        );
                    }
                    if ( manifest[ i ].affiliate_satisfaction_level ) {
                        insertInPlace += generateKeyValuePair(
                            'affiliate_satisfaction_level',
                            manifest[ i ].affiliate_satisfaction_level
                        );
                    }
                    if ( manifest[ i ].prevalence_services_to_members ) {
                        insertInPlace += generateKeyValuePair(
                            'prevalence_services_to_members',
                            manifest[ i ].prevalence_services_to_members
                        );
                    }
                    if ( manifest[ i ].board_level_role_understanding ) {
                        insertInPlace += generateKeyValuePair(
                            'board_level_role_understanding',
                            manifest[ i ].board_level_role_understanding
                        );
                    }
                    if ( manifest[ i ].board_diversity_index ) {
                        insertInPlace += generateKeyValuePair(
                            'board_diversity_index',
                            manifest[ i ].board_diversity_index
                        );
                    }
                    if ( manifest[ i ].board_training_opportunities ) {
                        insertInPlace += generateKeyValuePair(
                            'board_training_opportunities',
                            manifest[ i ].board_training_opportunities
                        );
                    }
                    if ( manifest[ i ].employee_training_plan_available ) {
                        insertInPlace += generateKeyValuePair(
                            'employee_training_plan_available',
                            manifest[ i ].employee_training_plan_available
                        );
                    }
                    if ( manifest[ i ].level_role_understanding_members ) {
                        insertInPlace += generateKeyValuePair(
                            'level_role_understanding_members',
                            manifest[ i ].level_role_understanding_members
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
                        pageid: 11082119,  // [[Module:Affiliate_Indicators]]
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
                        message: gadgetMsg[ 'aff-indicators-saved' ],
                        actions: [
                            {
                                action: 'accept',
                                label: 'Dismiss',
                                flags: 'primary'
                            }
                        ]
                    });

                    // Close and open window 2
                    windowManager.closeWindow( messageDialog );

                    // Purge the cache of the page from which the edit was made
                    new mw.Api().postWithToken(
                        'csrf',
                        { action: 'purge', titles: mw.config.values.wgPageName }
                    ).then( function () {
                        if ( persistentId !== '' ) {
                            new mw.Api().get( getModuleContent( 'Affiliate_Indicators' ) ).then( function ( data ) {
                                var entryData;

                                entryData = cleanRawEntry(
                                    getRelevantRawEntry(
                                        parseAIUDataModule( data.query.pages ),
                                        persistentId
                                    )
                                );
                                openWindow2( entryData );
                            } );
                        } else {
                            openWindow2( {} );
                        }
                    } );
                } ).catch( function ( error ) {
                    alert( gadgetMsg[ 'failed-to-save-to-lua-table' ] );
                    dialog.close();
                    console.error( error );
                } );
            } );
        };

        /**
         * The dialog / window to be displayed as editor when
         * when updating the records or table entries.
         *
         * @param {Object} config
         */
        openWindow1 = function ( config ) {
            var affIndicatorEditor;
            config.size = 'large';
            affIndicatorEditor = new AffiliateIndicatorEditorW1( config );

            windowManager = new OO.ui.WindowManager();
            $( 'body' ).append( windowManager.$element );
            windowManager.addWindows( [ affIndicatorEditor ] );
            windowManager.openWindow( affIndicatorEditor );
        };
        /*********************** Window 1 dialog logic end ******************/


        /********************** Window 2 dialog logic start ***************/
        /**
         * Subclass ProcessDialog
         *
         * @class AffiliateIndicatorEditorW2
         * @extends OO.ui.ProcessDialog
         *
         * @constructor
         * @param {Object} config
         */
        function AffiliateIndicatorEditorW2( config ) {
            this.programs_in_reporting_month = '';
            this.average_program_frequencies = '';
            this.program_success_rate = '';
            this.membership_to_program_threshold = '';
            this.no_of_partnerships = '';
            this.average_age_of_partnerships = '';
            this.affiliate_satisfaction_level = '';
            this.prevalence_services_to_members = '';
            this.board_level_role_understanding = '';
            this.board_diversity_index = '';
            this.board_training_opportunities = '';
            this.employee_training_plan_available = '';
            this.level_role_understanding_members = '';

            if ( config.programs_in_reporting_month ) {
                this.programs_in_reporting_month = config.programs_in_reporting_month;
            }
            if ( config.average_program_frequencies ) {
                this.average_program_frequencies = config.average_program_frequencies;
            }
            if ( config.program_success_rate ) {
                this.program_success_rate = config.program_success_rate;
            }
            if ( config.membership_to_program_threshold ) {
                this.membership_to_program_threshold = config.membership_to_program_threshold;
            }
            if ( config.no_of_partnerships ) {
                this.no_of_partnerships = config.no_of_partnerships;
            }
            if ( config.average_age_of_partnerships ) {
                this.average_age_of_partnerships = config.average_age_of_partnerships;
            }
            if ( config.affiliate_satisfaction_level ) {
                this.affiliate_satisfaction_level = config.affiliate_satisfaction_level;
            }
            if ( config.prevalence_services_to_members ) {
                this.prevalence_services_to_members = config.prevalence_services_to_members;
            }
            if ( config.board_level_role_understanding ) {
                this.board_level_role_understanding = config.board_level_role_understanding;
            }
            if ( config.board_diversity_index ) {
                this.board_diversity_index = config.board_diversity_index;
            }
            if ( config.board_training_opportunities ) {
                this.board_training_opportunities = config.board_training_opportunities;
            }
            if ( config.employee_training_plan_available ) {
                this.employee_training_plan_available = config.employee_training_plan_available;
            }
            if ( config.level_role_understanding_members ) {
                this.level_role_understanding_members = config.level_role_understanding_members;
            }
            if ( config.dos_stamp ) {
                this.dos_stamp = config.dos_stamp;
            }
            AffiliateIndicatorEditorW2.super.call( this, config );
        }
        OO.inheritClass( AffiliateIndicatorEditorW2, OO.ui.ProcessDialog );

        AffiliateIndicatorEditorW2.static.name = 'affiliateIndicatorEditorW2';
        AffiliateIndicatorEditorW2.static.title = gadgetMsg[ 'aff-indicators-upload-form-header' ];
        AffiliateIndicatorEditorW2.static.actions = [
            {
                action: 'continue',
                modes: 'edit',
                label: gadgetMsg[ 'aiu-next-button' ],
                flags: [ 'primary', 'constructive' ]
            },
            {
                action: 'back',
                modes: 'edit',
                label: gadgetMsg[ 'aiu-back-button' ],
                flags: 'safe'
            },
            {
                action: 'cancel',
                modes: 'edit',
                label: gadgetMsg[ 'aiu-cancel-button' ],
                flags: 'safe',
                icons: [ 'progressive' ]
            },
        ];

        /**
         * Use the initialize() method to add content to the dialog's $body,
         * to initialize widgets, and to set up event handlers.
         */
        AffiliateIndicatorEditorW2.prototype.initialize = function () {
            AffiliateIndicatorEditorW2.super.prototype.initialize.call( this );
            this.content = new OO.ui.PanelLayout( {
                padded: true,
                expanded: false
            } );

            this.fieldSetIpp = new OO.ui.FieldsetLayout( {
                label: gadgetMsg[ 'internal-processes-programs' ],
            } );

            this.fieldProgramsInReportingMonth = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.programs_in_reporting_month,
                indicator: 'required',
                required: true,
                placeholder: gadgetMsg[ 'enter-number' ]
            } );

            this.fieldAverageProgramFrequencies = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.average_program_frequencies,
                placeholder: gadgetMsg[ 'enter-number' ]
            } );

            this.fieldProgramSuccessRate = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.program_success_rate,
                placeholder: gadgetMsg[ 'enter-percentage' ]
            } );

            this.fieldMembershipToProgramThreshold = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.membership_to_program_threshold,
                placeholder: gadgetMsg[ 'enter-percentage' ]
            } );

            this.fieldSetIpp.addItems( [
                new OO.ui.FieldLayout( this.fieldProgramsInReportingMonth, { label: gadgetMsg[ 'programs-in-reporting-month' ], align: 'inline' } ),
                new OO.ui.FieldLayout( this.fieldAverageProgramFrequencies, { label: gadgetMsg[ 'average-program-frequencies' ], align: 'inline' } ),
                new OO.ui.FieldLayout( this.fieldProgramSuccessRate, { label: gadgetMsg[ 'program-success-rate' ], align: 'inline' } ),
                new OO.ui.FieldLayout( this.fieldMembershipToProgramThreshold, { label: gadgetMsg[ 'membership-to-program-threshold' ], align: 'inline' } ),
            ] );

            this.fieldSetIpps = new OO.ui.FieldsetLayout( {
                label: gadgetMsg[ 'internal-processes-partnerships-and-services' ],
            } );

            this.fieldNoOfPartnerships = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.no_of_partnerships,
                placeholder: gadgetMsg[ 'enter-number' ]
            } );

            this.fieldAverageAgeOfPartnerships = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.average_age_of_partnerships,
                placeholder: gadgetMsg[ 'enter-number' ]
            } );

            this.fieldAffiliateSatisfactionLevel = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.affiliate_satisfaction_level,
                placeholder: gadgetMsg[ 'enter-percentage' ]
            } );

            this.fieldPrevalenceServicesToMembers = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.prevalence_services_to_members,
                placeholder: gadgetMsg[ 'enter-percentage' ]
            } );

            this.fieldSetIpps.addItems( [
                new OO.ui.FieldLayout( this.fieldNoOfPartnerships, { label: gadgetMsg[ 'no-of-partnerships' ], align: 'inline' } ),
                new OO.ui.FieldLayout( this.fieldAverageAgeOfPartnerships, { label: gadgetMsg[ 'average-age-of-partnerships' ], align: 'inline' } ),
                new OO.ui.FieldLayout( this.fieldAffiliateSatisfactionLevel, { label: gadgetMsg[ 'affiliate-satisfaction-level' ], align: 'inline' } ),
                new OO.ui.FieldLayout( this.fieldPrevalenceServicesToMembers, { label: gadgetMsg[ 'prevalence-services-to-members' ], align: 'inline' } ),
            ] );

            this.fieldSetIplg = new OO.ui.FieldsetLayout( {
                label: gadgetMsg[ 'internal-processes-learning-and-growth' ],
            } );

            this.fieldBoardLevelRoleUnderstanding = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.board_level_role_understanding,
                placeholder: gadgetMsg[ 'enter-percentage' ]
            } );

            this.fieldBoardDiversityIndex = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.board_diversity_index,
                placeholder: gadgetMsg[ 'enter-percentage' ]
            } );

            this.fieldBoardTrainingOpportunities = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.board_training_opportunities,
                placeholder: gadgetMsg[ 'enter-number' ]
            } );

            this.fieldEmployeeTrainingPlanAvailable = new OO.ui.DropdownInputWidget( {
                options: [
                    {
                        data: 'Yes',
                        label: gadgetMsg[ 'aiu-yes' ]
                    },
                    {
                        data: 'No',
                        label: gadgetMsg[ 'aiu-no' ]
                    }
                ]
            } );
            if ( this.employee_training_plan_available ) {
                this.fieldEmployeeTrainingPlanAvailable.setValue( this.employee_training_plan_available );
            }

            this.fieldLevelRoleUnderstandingMembers = new OO.ui.TextInputWidget( {
                type: 'number',
                value: this.level_role_understanding_members,
                placeholder: gadgetMsg[ 'enter-percentage' ]
            } );

            this.fieldSetIplg.addItems( [
                new OO.ui.FieldLayout( this.fieldBoardLevelRoleUnderstanding, { label: gadgetMsg[ 'board-level-role-understanding' ], align: 'inline' } ),
                new OO.ui.FieldLayout( this.fieldBoardDiversityIndex, { label: gadgetMsg[ 'board-diversity-index' ], align: 'inline' } ),
                new OO.ui.FieldLayout( this.fieldBoardTrainingOpportunities, { label: gadgetMsg[ 'board-training-opportunities' ], align: 'inline' } ),
                new OO.ui.FieldLayout( this.fieldEmployeeTrainingPlanAvailable, { label: gadgetMsg[ 'employee-training-plan-available' ], align: 'inline' } ),
                new OO.ui.FieldLayout( this.fieldLevelRoleUnderstandingMembers, { label: gadgetMsg[ 'level-role-understanding-members' ], align: 'inline' } ),
            ] );

            // When everything is done
            this.content.$element.append( this.fieldSetIpp.$element );
            this.content.$element.append( this.fieldSetIpps.$element );
            this.content.$element.append( this.fieldSetIplg.$element );
            this.$body.append( this.content.$element );
        };

        /**
         * Set custom height for the modal window
         */
        AffiliateIndicatorEditorW2.prototype.getBodyHeight = function () {
            return 700;
        };

        /**
         * In the event "Select" is pressed
         */
        AffiliateIndicatorEditorW2.prototype.getActionProcess = function ( action ) {
            var dialog = this;
            if ( action === 'continue' && persistentId !== '' ) {
                return new OO.ui.Process( function () {
                    dialog.saveItem();
                } );
            } else if ( action === 'cancel' && persistentId !== '' ) {
                return new OO.ui.Process( function () {
                    new OO.ui.confirm(
                        gadgetMsg[ 'confirm-cancel-action' ]
                    ).then( function ( confirmed ) {
                        if ( confirmed ) {
                            dialog.saveItem( 'delete' );
                        }
                    } );
                } );
            } else if ( action === 'back' && persistentId !== '' ) {
                dialog.close();
                return new OO.ui.Process( function () {
                    new mw.Api().get( getModuleContent( 'Affiliate_Indicators' ) ).then( function ( data ) {
                        var entryData;

                        entryData = cleanRawEntry(
                            getRelevantRawEntry(
                                parseAIUDataModule( data.query.pages ),
                                persistentId
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
         * Save the changes to [[Module:Affiliate_Indicators]] page.
         */
        AffiliateIndicatorEditorW2.prototype.saveItem = function ( deleteFlag ) {
            var dialog = this;

            dialog.pushPending();

            new mw.Api().get( getModuleContent( 'Affiliate_Indicators' ) ).then( function ( data ) {
                var i, insertInPlace, processWorkingEntry,
                    editSummary, manifest = [], workingEntry, entries;

                /**
                 * Compares a given [[Module:Affiliate_Indicators]] entry against
                 * the edit fields and applies changes where relevant.
                 *
                 * @param {Object} workingEntry the entry being worked on
                 * @return {Object} The same entry but with modifications
                 */
                processWorkingEntry = function ( workingEntry ) {
                    if ( dialog.fieldProgramsInReportingMonth.getValue() ) {
                        workingEntry.programs_in_reporting_month = dialog.fieldProgramsInReportingMonth.getValue();
                    } else if ( !dialog.fieldProgramsInReportingMonth.getValue() && workingEntry.programs_in_reporting_month ) {
                        delete workingEntry.programs_in_reporting_month;
                    }

                    if ( dialog.fieldAverageProgramFrequencies.getValue() ) {
                        workingEntry.average_program_frequencies = dialog.fieldAverageProgramFrequencies.getValue();
                    } else if ( !dialog.fieldAverageProgramFrequencies.getValue() && workingEntry.average_program_frequencies ) {
                        delete workingEntry.average_program_frequencies;
                    }

                    if ( dialog.fieldProgramSuccessRate.getValue() ) {
                        workingEntry.program_success_rate = dialog.fieldProgramSuccessRate.getValue();
                    } else if ( !dialog.fieldProgramSuccessRate.getValue() && workingEntry.program_success_rate ) {
                        delete workingEntry.program_success_rate;
                    }

                    if ( dialog.fieldMembershipToProgramThreshold.getValue() ) {
                        workingEntry.membership_to_program_threshold = dialog.fieldMembershipToProgramThreshold.getValue();
                    } else if ( !dialog.fieldMembershipToProgramThreshold.getValue() && workingEntry.membership_to_program_threshold ) {
                        delete workingEntry.membership_to_program_threshold;
                    }

                    if ( dialog.fieldNoOfPartnerships.getValue() ) {
                        workingEntry.no_of_partnerships = dialog.fieldNoOfPartnerships.getValue();
                    } else if ( !dialog.fieldNoOfPartnerships.getValue() && workingEntry.no_of_partnerships ) {
                        delete workingEntry.no_of_partnerships;
                    }

                    if ( dialog.fieldAverageAgeOfPartnerships.getValue() ) {
                        workingEntry.average_age_of_partnerships = dialog.fieldAverageAgeOfPartnerships.getValue();
                    } else if ( !dialog.fieldAverageAgeOfPartnerships.getValue() && workingEntry.average_age_of_partnerships ) {
                        delete workingEntry.average_age_of_partnerships;
                    }

                    if ( dialog.fieldAffiliateSatisfactionLevel.getValue() ) {
                        workingEntry.affiliate_satisfaction_level = dialog.fieldAffiliateSatisfactionLevel.getValue();
                    } else if ( !dialog.fieldAffiliateSatisfactionLevel.getValue() && workingEntry.affiliate_satisfaction_level ) {
                        delete workingEntry.affiliate_satisfaction_level;
                    }

                    if ( dialog.fieldPrevalenceServicesToMembers.getValue() ) {
                        workingEntry.prevalence_services_to_members = dialog.fieldPrevalenceServicesToMembers.getValue();
                    } else if ( !dialog.fieldPrevalenceServicesToMembers.getValue() && workingEntry.prevalence_services_to_members ) {
                        delete workingEntry.prevalence_services_to_members;
                    }

                    if ( dialog.fieldBoardLevelRoleUnderstanding.getValue() ) {
                        workingEntry.board_level_role_understanding = dialog.fieldBoardLevelRoleUnderstanding.getValue();
                    } else if ( !dialog.fieldBoardLevelRoleUnderstanding.getValue() && workingEntry.board_level_role_understanding ) {
                        delete workingEntry.board_level_role_understanding;
                    }

                    if ( dialog.fieldBoardDiversityIndex.getValue() ) {
                        workingEntry.board_diversity_index = dialog.fieldBoardDiversityIndex.getValue();
                    } else if ( !dialog.fieldBoardDiversityIndex.getValue() && workingEntry.board_diversity_index ) {
                        delete workingEntry.board_diversity_index;
                    }

                    if ( dialog.fieldBoardTrainingOpportunities.getValue() ) {
                        workingEntry.board_training_opportunities = dialog.fieldBoardTrainingOpportunities.getValue();
                    } else if ( !dialog.fieldBoardTrainingOpportunities.getValue() && workingEntry.board_training_opportunities ) {
                        delete workingEntry.board_training_opportunities;
                    }

                    if ( dialog.fieldEmployeeTrainingPlanAvailable.getValue() ) {
                        workingEntry.employee_training_plan_available = dialog.fieldEmployeeTrainingPlanAvailable.getValue();
                    } else if ( !dialog.fieldEmployeeTrainingPlanAvailable.getValue() && workingEntry.employee_training_plan_available ) {
                        delete workingEntry.employee_training_plan_available;
                    }

                    if ( dialog.fieldLevelRoleUnderstandingMembers.getValue() ) {
                        workingEntry.level_role_understanding_members = dialog.fieldLevelRoleUnderstandingMembers.getValue();
                    } else if ( !dialog.fieldLevelRoleUnderstandingMembers.getValue() && workingEntry.level_role_understanding_members ) {
                        delete workingEntry.level_role_understanding_members;
                    }

                    /* Get today's date and time in YYYY-MM-DDTHH:MM:SSZ */
                    /* format. dos stands for "date of submission" */
                    workingEntry.dos_stamp = new Date().toISOString();

                    return workingEntry;
                };

                // Cycle through existing entries. If we are editing an existing
                // entry, that entry will be modified in place.
                entries = parseAIUDataModule( data.query.pages );

                for ( i = 0; i < entries.length; i++ ) {
                    workingEntry = cleanRawEntry( entries[ i ].value.fields );
                    if ( workingEntry.unique_id === persistentId ) {
                        workingEntry = processWorkingEntry( workingEntry );
                        if ( deleteFlag ) {
                            editSummary = gadgetMsg[ 'revert-aiu-incomplete-entry' ] + ' ' + workingEntry.group_name;
                        } else {
                            editSummary = gadgetMsg[ 'updated-aff-indicators' ] + ' ' + workingEntry.group_name;
                        }
                    }
                    if ( workingEntry.unique_id !== persistentId || !deleteFlag ) {
                        manifest.push( workingEntry );
                    }
                }

                /**
                 * NOTE:
                 *
                 * Also, make sure to also delete PMC entries for matching persistent ID
                 */
                new mw.Api().get( getModuleContent( 'Affiliate_Indicators/Programs' ) ).then( function ( data ) {
                    var manifest = [];

                    entries = parseAIUDataModule( data.query.pages );

                    for ( i = 0; i < entries.length; i++ ) {
                        workingEntry = cleanRawEntry( entries[ i ].value.fields );
                        if ( workingEntry.unique_id === persistentId && deleteFlag === 'delete' ) {
                            workingEntry = processWorkingEntry( workingEntry );
                            editSummary = gadgetMsg[ 'revert-aiu-incomplete-entry' ] + ' ' + persistentGroupName;
                        } else {
                            manifest.push( workingEntry );
                        }
                    }

                    // Save after writing
                    insertInPlace = 'return {\n';
                    for ( i = 0; i < manifest.length; i++ ) {
                        insertInPlace += '\t{\n';
                        if ( manifest[ i ].unique_id ) {
                            insertInPlace += generateKeyValuePair(
                                'unique_id',
                                manifest[ i ].unique_id
                            );
                        }
                        // We need a program_id in case we want to update
                        // a program if need be.
                        if ( manifest[ i ].program_id ) {
                            insertInPlace += generateKeyValuePair(
                                'program_id',
                                manifest[ i ].program_id
                            );
                        }
                        if ( manifest[ i ].program_name ) {
                            insertInPlace += generateKeyValuePair(
                                'program_name',
                                manifest[ i ].program_name
                            );
                        }
                        if ( manifest[ i ].pmc_start_date ) {
                            insertInPlace += generateKeyValuePair(
                                'pmc_start_date',
                                manifest[ i ].pmc_start_date
                            );
                        }
                        if ( manifest[ i ].pmc_end_date ) {
                            insertInPlace += generateKeyValuePair(
                                'pmc_end_date',
                                manifest[ i ].pmc_end_date
                            );
                        }
                        if ( manifest[ i ].program_type ) {
                            insertInPlace += generateKeyValuePair(
                                'program_type',
                                manifest[ i ].program_type
                            );
                        }
                        if ( manifest[ i ].resourcing_type ) {
                            insertInPlace += generateKeyValuePair(
                                'resourcing_type',
                                manifest[ i ].resourcing_type
                            );
                        }
                        if ( manifest[ i ].active_editors_involved ) {
                            insertInPlace += generateKeyValuePair(
                                'active_editors_involved',
                                manifest[ i ].active_editors_involved
                            );
                        }
                        if ( manifest[ i ].new_media_added ) {
                            insertInPlace += generateKeyValuePair(
                                'new_media_added',
                                manifest[ i ].new_media_added
                            );
                        }
                        if ( manifest[ i ].individuals_involved ) {
                            insertInPlace += generateKeyValuePair(
                                'individuals_involved',
                                manifest[ i ].individuals_involved
                            );
                        }
                        if ( manifest[ i ].articles_added ) {
                            insertInPlace += generateKeyValuePair(
                                'articles_added',
                                manifest[ i ].articles_added
                            );
                        }
                        if ( manifest[ i ].diversity_focus ) {
                            insertInPlace += generateKeyValuePair(
                                'diversity_focus',
                                manifest[ i ].diversity_focus
                            );
                        }
                        if ( manifest[ i ].partner_name_linked_to_program ) {
                            insertInPlace += generateKeyValuePair(
                                'partner_name_linked_to_program',
                                manifest[ i ].partner_name_linked_to_program
                            );
                        }
                        if ( manifest[ i ].partner_type ) {
                            insertInPlace += generateKeyValuePair(
                                'partner_type',
                                manifest[ i ].partner_type
                            );
                        }
                        if ( manifest[ i ].reach_of_partner ) {
                            insertInPlace += generateKeyValuePair(
                                'reach_of_partner',
                                manifest[ i ].reach_of_partner
                            );
                        }
                        if ( manifest[ i ].status_of_partnership ) {
                            insertInPlace += generateKeyValuePair(
                                'status_of_partnership',
                                manifest[ i ].status_of_partnership
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
                            pageid: 11119914,  // [[Module:Affiliate_Indicators/Programs]]
                            text: insertInPlace,
                            contentmodel: 'Scribunto'
                        }
                    );
                });

                // No unique ID means this is a new entry
                if ( !dialog.uniqueId && !persistentId ) {
                    workingEntry = {
                        unique_id: Math.random().toString( 36 ).substring( 2 )
                    };
                    workingEntry = processWorkingEntry( workingEntry );
                    editSummary = gadgetMsg[ 'added-new-aff-indicators' ] + ' ' + workingEntry.group_name;
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
                    if ( manifest[ i ].affiliate_code ) {
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
                    if ( manifest[ i ].no_of_donations ) {
                        insertInPlace += generateKeyValuePair(
                            'no_of_donations',
                            manifest[ i ].no_of_donations
                        );
                    }
                    if ( manifest[ i ].donation_renewal_rate ) {
                        insertInPlace += generateKeyValuePair(
                            'donation_renewal_rate',
                            manifest[ i ].donation_renewal_rate
                        );
                    }
                    if ( manifest[ i ].index_score_donor_satisfaction ) {
                        insertInPlace += generateKeyValuePair(
                            'index_score_donor_satisfaction',
                            manifest[ i ].index_score_donor_satisfaction
                        );
                    }
                    if ( manifest[ i ].members_reported ) {
                        insertInPlace += generateKeyValuePair(
                            'members_reported',
                            manifest[ i ].members_reported
                        );
                    }
                    if ( manifest[ i ].membership_duration ) {
                        insertInPlace += generateKeyValuePair(
                            'membership_duration',
                            manifest[ i ].membership_duration
                        );
                    }
                    if ( manifest[ i ].net_members_yoy ) {
                        insertInPlace += generateKeyValuePair(
                            'net_members_yoy',
                            manifest[ i ].net_members_yoy
                        );
                    }
                    if ( manifest[ i ].index_score_member_satisfaction ) {
                        insertInPlace += generateKeyValuePair(
                            'index_score_member_satisfaction',
                            manifest[ i ].index_score_member_satisfaction
                        );
                    }
                    if ( manifest[ i ].pp_score ) {
                        insertInPlace += generateKeyValuePair(
                            'pp_score',
                            manifest[ i ].pp_score
                        );
                    }
                    if ( manifest[ i ].net_no_of_partners_yoy ) {
                        insertInPlace += generateKeyValuePair(
                            'net_no_of_partners_yoy',
                            manifest[ i ].net_no_of_partners_yoy
                        );
                    }
                    if ( manifest[ i ].index_score_partner_satisfaction ) {
                        insertInPlace += generateKeyValuePair(
                            'index_score_partner_satisfaction',
                            manifest[ i ].index_score_partner_satisfaction
                        );
                    }
                    if ( manifest[ i ].revenue_reliability ) {
                        insertInPlace += generateKeyValuePair(
                            'revenue_reliability',
                            manifest[ i ].revenue_reliability
                        );
                    }
                    if ( manifest[ i ].budget_surpluses ) {
                        insertInPlace += generateKeyValuePair(
                            'budget_surpluses',
                            manifest[ i ].budget_surpluses
                        );
                    }
                    if ( manifest[ i ].overhead_cost_total_budget ) {
                        insertInPlace += generateKeyValuePair(
                            'overhead_cost_total_budget',
                            manifest[ i ].overhead_cost_total_budget
                        );
                    }
                    if ( manifest[ i ].liquid_months ) {
                        insertInPlace += generateKeyValuePair(
                            'liquid_months',
                            manifest[ i ].liquid_months
                        );
                    }
                    if ( manifest[ i ].programs_in_reporting_month ) {
                        insertInPlace += generateKeyValuePair(
                            'programs_in_reporting_month',
                            manifest[ i ].programs_in_reporting_month
                        );
                    }
                    if ( manifest[ i ].average_program_frequencies ) {
                        insertInPlace += generateKeyValuePair(
                            'average_program_frequencies',
                            manifest[ i ].average_program_frequencies
                        );
                    }
                    if ( manifest[ i ].program_success_rate ) {
                        insertInPlace += generateKeyValuePair(
                            'program_success_rate',
                            manifest[ i ].program_success_rate
                        );
                    }
                    if ( manifest[ i ].membership_to_program_threshold ) {
                        insertInPlace += generateKeyValuePair(
                            'membership_to_program_threshold',
                            manifest[ i ].membership_to_program_threshold
                        );
                    }
                    if ( manifest[ i ].no_of_partnerships ) {
                        insertInPlace += generateKeyValuePair(
                            'no_of_partnerships',
                            manifest[ i ].no_of_partnerships
                        );
                    }
                    if ( manifest[ i ].average_age_of_partnerships ) {
                        insertInPlace += generateKeyValuePair(
                            'average_age_of_partnerships',
                            manifest[ i ].average_age_of_partnerships
                        );
                    }
                    if ( manifest[ i ].affiliate_satisfaction_level ) {
                        insertInPlace += generateKeyValuePair(
                            'affiliate_satisfaction_level',
                            manifest[ i ].affiliate_satisfaction_level
                        );
                    }
                    if ( manifest[ i ].prevalence_services_to_members ) {
                        insertInPlace += generateKeyValuePair(
                            'prevalence_services_to_members',
                            manifest[ i ].prevalence_services_to_members
                        );
                    }
                    if ( manifest[ i ].board_level_role_understanding ) {
                        insertInPlace += generateKeyValuePair(
                            'board_level_role_understanding',
                            manifest[ i ].board_level_role_understanding
                        );
                    }
                    if ( manifest[ i ].board_diversity_index ) {
                        insertInPlace += generateKeyValuePair(
                            'board_diversity_index',
                            manifest[ i ].board_diversity_index
                        );
                    }
                    if ( manifest[ i ].board_training_opportunities ) {
                        insertInPlace += generateKeyValuePair(
                            'board_training_opportunities',
                            manifest[ i ].board_training_opportunities
                        );
                    }
                    if ( manifest[ i ].employee_training_plan_available ) {
                        insertInPlace += generateKeyValuePair(
                            'employee_training_plan_available',
                            manifest[ i ].employee_training_plan_available
                        );
                    }
                    if ( manifest[ i ].level_role_understanding_members ) {
                        insertInPlace += generateKeyValuePair(
                            'level_role_understanding_members',
                            manifest[ i ].level_role_understanding_members
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
                        pageid: 11082119,  // [[Module:Affiliate_Indicators]]
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
                        message: gadgetMsg[ 'aff-indicators-saved' ],
                        actions: [
                            {
                                action: 'accept',
                                label: 'Dismiss',
                                flags: 'primary'
                            }
                        ]
                    });

                    windowManager.closeWindow( messageDialog );

                    // Purge the cache of the page from which the edit was made
                    new mw.Api().postWithToken(
                        'csrf',
                        { action: 'purge', titles: mw.config.values.wgPageName }
                    ).then( function () {
                        if ( deleteFlag ) {
                            dialog.close();
                        } else {
                            openWindow3( {} );
                        }
                    } );
                } ).catch( function ( error ) {
                    alert( gadgetMsg[ 'failed-to-save-to-lua-table' ] );
                    dialog.close();
                    console.error( error );
                } );
            } );
        };

        /**
         * The dialog / window to be displayed as editor when
         * when updating the records or table entries.
         *
         * @param {Object} config
         */
        openWindow2 = function ( config ) {
            var affIndicatorEditor;
            config.size = 'large';
            affIndicatorEditor = new AffiliateIndicatorEditorW2( config );

            windowManager = new OO.ui.WindowManager();
            $( 'body' ).append( windowManager.$element );
            windowManager.addWindows( [ affIndicatorEditor ] );
            windowManager.openWindow( affIndicatorEditor );
        };
        /*********************** Window 2 dialog logic end ******************/


        /*********************** Window 3 dialog logic start ******************/
        /**
         * Subclass ProcessDialog
         *
         * @class AffiliateIndicatorEditorW3
         * @extends OO.ui.ProcessDialog
         *
         * @constructor
         * @param {Object} config
         */
        function AffiliateIndicatorEditorW3( config ) {
            this.program_name = '';
            this.pmc_start_date = '';
            this.pmc_end_date = '';
            this.program_type = '';
            this.resourcing_type = '';
            this.active_editors_involved = '';
            this.new_media_added = '';
            this.individuals_involved = '';
            this.articles_added = '';
            this.diversity_focus = '';
            this.partner_name_linked_to_program = '';
            this.partner_type = '';
            this.reach_of_partner = '';
            this.status_of_partnership = '';

            if ( config.program_name ) {
                this.program_name = config.program_name;
            }
            if ( config.pmc_start_date ) {
                this.pmc_start_date = config.pmc_start_date;
            }
            if ( config.pmc_end_date ) {
                this.pmc_end_date = config.pmc_end_date;
            }
            if ( config.program_type ) {
                this.program_type = config.program_type;
            }
            if ( config.resourcing_type ) {
                this.resourcing_type = config.resourcing_type;
            }
            if ( config.active_editors_involved ) {
                this.active_editors_involved = config.active_editors_involved;
            }
            if ( config.new_media_added ) {
                this.new_media_added = config.new_media_added;
            }
            if ( config.individuals_involved ) {
                this.individuals_involved = config.individuals_involved;
            }
            if ( config.articles_added ) {
                this.articles_added = config.articles_added;
            }
            if ( config.diversity_focus ) {
                this.diversity_focus = config.diversity_focus;
            }
            if ( config.partner_name_linked_to_program ) {
                this.partner_name_linked_to_program = config.partner_name_linked_to_program;
            }
            if ( config.partner_type ) {
                this.partner_type = config.partner_type;
            }
            if ( config.reach_of_partner ) {
                this.reach_of_partner = config.reach_of_partner;
            }
            if ( config.status_of_partnership ) {
                this.status_of_partnership = config.status_of_partnership;
            }
            if ( config.dos_stamp ) {
                this.dos_stamp = config.dos_stamp;
            }
            AffiliateIndicatorEditorW3.super.call( this, config );
        }
        OO.inheritClass( AffiliateIndicatorEditorW3, OO.ui.ProcessDialog );

        AffiliateIndicatorEditorW3.static.name = 'affiliateIndicatorEditorW3';
        AffiliateIndicatorEditorW3.static.title = gadgetMsg[ 'aff-indicators-upload-form-header' ];
        AffiliateIndicatorEditorW3.static.actions = [
            {
                action: 'continue',
                modes: 'edit',
                label: gadgetMsg[ 'aiu-submit-button' ],
                flags: [ 'primary', 'constructive' ]
            },
            {
                action: 'back',
                modes: 'edit',
                label: gadgetMsg[ 'aiu-back-button' ],
                flags: 'safe'
            },
            {
                action: 'cancel',
                modes: 'edit',
                label: gadgetMsg[ 'aiu-cancel-button' ],
                flags: 'safe',
                icons: [ 'progressive' ]
            },
        ];

        /**
         * Use the initialize() method to add content to the dialog's $body,
         * to initialize widgets, and to set up event handlers.
         */
        AffiliateIndicatorEditorW3.prototype.initialize = function () {
            var entries, entry, index = new OO.ui.IndexLayout(), i, dialog = this;

            // create a copy
            entries = pmcEntries;
            if ( pmcTabs === true && entries.length > 0 ) {
                for ( i = 0; i < entries.length; i++ ) {
                    entry = cleanRawEntry( entries[ i ].value.fields );
                    if ( entry.unique_id === persistentId ) {
                        AffiliateIndicatorEditorW3.super.prototype.initialize.call( dialog );
                        dialog.content = new OO.ui.TabPanelLayout(
                            entry.program_id, { label: entry.program_name }
                        );

                        dialog.fieldSetPmc = new OO.ui.FieldsetLayout( {
                            label: gadgetMsg[ 'program-metrics-capture' ],
                        } );

                        dialog.fieldProgramName = new OO.ui.TextInputWidget( {
                            value: entry.program_name,
                            placeholder: gadgetMsg[ 'program-name-placeholder' ]
                        } );

                        dialog.fieldPmcStartDate = new mw.widgets.DateInputWidget( {
                            value: entry.pmc_start_date ? convertDateToYyyyMmDdFormat( entry.pmc_start_date ) : entry.pmc_start_date,
                            classes: [ 'full-width' ],
                            placeholderLabel: gadgetMsg[ 'start-date-placeholder' ]
                        } );

                        dialog.fieldPmcEndDate = new mw.widgets.DateInputWidget( {
                            value: entry.pmc_end_date ? convertDateToYyyyMmDdFormat( entry.pmc_end_date ) : entry.pmc_end_date,
                            classes: [ 'full-width' ],
                            placeholderLabel: gadgetMsg[ 'end-date-placeholder' ]
                        } );

                        dialog.fieldProgramType = new OO.ui.DropdownInputWidget( {
                            options: [
                                {
                                    data: 'Conference Attendance',
                                    label: gadgetMsg[ 'pmc-conference-attendance' ]
                                },
                                {
                                    data: 'Conference Presenting',
                                    label: gadgetMsg[ 'pmc-conference-presenting' ]
                                },
                                {
                                    data: 'Conference Organizing',
                                    label: gadgetMsg[ 'pmc-conference-organizing' ]
                                },
                                {
                                    data: 'GLAM partnerships',
                                    label: gadgetMsg[ 'pmc-glam-partnerships' ]
                                },
                                {
                                    data: 'Education partnerships',
                                    label: gadgetMsg[ 'pmc-education-partnerships' ]
                                },
                                {
                                    data: 'Teacher Training',
                                    label: gadgetMsg[ 'pmc-teacher-training' ]
                                },
                                {
                                    data: 'Classroom Programs',
                                    label: gadgetMsg[ 'pmc-classroom-programs' ]
                                },
                                {
                                    data: 'Gov’t Partnership',
                                    label: gadgetMsg[ 'pmc-govt-partnership' ]
                                },
                                {
                                    data: 'Wiki Clubs',
                                    label: gadgetMsg[ 'pmc-wiki-clubs' ]
                                },
                                {
                                    data: 'Wikipedia Library',
                                    label: gadgetMsg[ 'pmc-wikipedia-library' ]
                                },
                                {
                                    data: 'Online photo events',
                                    label: gadgetMsg[ 'pmc-online-photo-events' ]
                                },
                                {
                                    data: 'Offline photo events',
                                    label: gadgetMsg[ 'pmc-offline-photo-events' ]
                                },
                                {
                                    data: 'Online editing events',
                                    label: gadgetMsg[ 'pmc-online-editing-events' ]
                                },
                                {
                                    data: 'Offline editing events',
                                    label: gadgetMsg[ 'pmc-offline-editing-events' ]
                                },
                                {
                                    data: 'Meetups',
                                    label: gadgetMsg[ 'pmc-meetups' ]
                                },
                                {
                                    data: 'Technical Events',
                                    label: gadgetMsg[ 'pmc-technical-events' ]
                                },
                                {
                                    data: 'Other',
                                    label: gadgetMsg[ 'pmc-other' ]
                                }
                            ]
                        } );
                        if ( entry.program_type ) {
                            dialog.fieldProgramType.setValue( entry.program_type );
                        }

                        dialog.fieldResourcingType = new OO.ui.DropdownInputWidget( {
                            options: [
                                {
                                    data: 'WMF APG',
                                    label: gadgetMsg[ 'pmc-wmf-apg' ]
                                },
                                {
                                    data: 'WMF sAPG',
                                    label: gadgetMsg[ 'pmc-wmf-sapg' ]
                                },
                                {
                                    data: 'Rapid Grant',
                                    label: gadgetMsg[ 'pmc-rapid-grant' ]
                                },
                                {
                                    data: 'Non-WMF Grant',
                                    label: gadgetMsg[ 'pmc-non-wmf-grant' ]
                                },
                                {
                                    data: 'Partnership',
                                    label: gadgetMsg[ 'pmc-partnerships' ]
                                },
                                {
                                    data: 'In-Kind',
                                    label: gadgetMsg[ 'pmc-in-kind' ]
                                },
                                {
                                    data: 'Other',
                                    label: gadgetMsg[ 'pmc-other' ]
                                }
                            ]
                        } );
                        if ( entry.resourcing_type ) {
                            dialog.fieldResourcingType.setValue( entry.resourcing_type );
                        }

                        dialog.fieldActiveEditorsInvolved = new OO.ui.TextInputWidget( {
                            value: entry.active_editors_involved,
                            placeholder: gadgetMsg[ 'enter-number' ]
                        } );

                        dialog.fieldNewMediaAdded = new OO.ui.TextInputWidget( {
                            value: entry.new_media_added,
                            placeholder: gadgetMsg[ 'enter-number' ]
                        } );

                        dialog.fieldActiveEditorsInvolved = new OO.ui.TextInputWidget( {
                            value: entry.active_editors_involved,
                            placeholder: gadgetMsg[ 'enter-number' ]
                        } );

                        dialog.fieldIndividualsInvolved = new OO.ui.TextInputWidget( {
                            value: entry.individuals_involved,
                            placeholder: gadgetMsg[ 'enter-number' ]
                        } );

                        dialog.fieldArticlesAdded = new OO.ui.TextInputWidget( {
                            value: entry.articles_added,
                            placeholder: gadgetMsg[ 'enter-number' ]
                        } );

                        dialog.fieldDiversityFocus = new OO.ui.DropdownInputWidget( {
                            options: [
                                {
                                    data: 'Gender',
                                    label: gadgetMsg[ 'pmc-gender' ]
                                },
                                {
                                    data: 'Language',
                                    label: gadgetMsg[ 'pmc-language' ]
                                },
                                {
                                    data: 'Region',
                                    label: gadgetMsg[ 'pmc-region' ]
                                },
                                {
                                    data: 'None',
                                    label: gadgetMsg[ 'pmc-none' ]
                                },
                                {
                                    data: 'Other',
                                    label: gadgetMsg[ 'pmc-other' ]
                                }
                            ]
                        } );
                        if ( entry.diversity_focus ) {
                            dialog.fieldDiversityFocus.setValue( entry.diversity_focus );
                        }

                        dialog.fieldPartnerNameLinkedToProgram = new OO.ui.TextInputWidget( {
                            value: entry.partner_name_linked_to_program,
                            placeholder: gadgetMsg[ 'partner-name-linked-to-program-placeholder' ]
                        } );

                        dialog.fieldPartnerType = new OO.ui.DropdownInputWidget( {
                            options: [
                                {
                                    data: 'Education',
                                    label: gadgetMsg[ 'pmc-education' ]
                                },
                                {
                                    data: 'GLAM',
                                    label: gadgetMsg[ 'pmc-glam' ]
                                },
                                {
                                    data: 'Government',
                                    label: gadgetMsg[ 'pmc-government' ]
                                },
                                {
                                    data: 'Other',
                                    label: gadgetMsg[ 'pmc-other' ]
                                }
                            ]
                        } );
                        if ( entry.partner_type ) {
                            dialog.fieldPartnerType.setValue( entry.partner_type );
                        }

                        dialog.fieldReachOfPartner = new OO.ui.DropdownInputWidget( {
                            options: [
                                {
                                    data: 'Local',
                                    label: gadgetMsg[ 'pmc-local' ]
                                },
                                {
                                    data: 'National',
                                    label: gadgetMsg[ 'pmc-national' ]
                                },
                                {
                                    data: 'International',
                                    label: gadgetMsg[ 'pmc-international' ]
                                },
                                {
                                    data: 'Other',
                                    label: gadgetMsg[ 'pmc-other' ]
                                }
                            ]
                        } );
                        if ( entry.reach_of_partner ) {
                            dialog.fieldReachOfPartner.setValue( entry.reach_of_partner );
                        }

                        dialog.fieldStatusOfPartnership = new OO.ui.DropdownInputWidget( {
                            options: [
                                {
                                    data: 'Emerging',
                                    label: gadgetMsg[ 'pmc-emerging' ]
                                },
                                {
                                    data: 'Forming',
                                    label: gadgetMsg[ 'pmc-forming' ]
                                },
                                {
                                    data: 'Existing',
                                    label: gadgetMsg[ 'pmc-existing' ]
                                },
                                {
                                    data: 'Completed',
                                    label: gadgetMsg[ 'pmc-completed' ]
                                }
                            ]
                        } );
                        if ( entry.status_of_partnership ) {
                            dialog.fieldStatusOfPartnership.setValue( entry.status_of_partnership );
                        }

                        dialog.updateButton = new OO.ui.ButtonWidget( {
                            label: gadgetMsg[ 'update-program' ],
                            icon: 'edit',
                            flags: [ 'progressive' ]
                        } ).on( 'click', function () {
                            dialog.saveItem( 'update-' + entry.program_id );
                        } );

                        // Append things to fieldSet
                        dialog.fieldSet = new OO.ui.FieldsetLayout( {
                            items: [
                                new OO.ui.FieldLayout(
                                    dialog.fieldProgramName,
                                    {
                                        label: gadgetMsg[ 'program-name-reported' ],
                                        align: 'top'
                                    }
                                ),
                                new OO.ui.FieldLayout(
                                    dialog.fieldPmcStartDate,
                                    {
                                        label: '',
                                        align: 'top'
                                    }
                                ),
                                new OO.ui.FieldLayout(
                                    dialog.fieldPmcEndDate,
                                    {
                                        label: '',
                                        align: 'top'
                                    }
                                ),
                                new OO.ui.FieldLayout(
                                    dialog.fieldProgramType,
                                    {
                                        label: gadgetMsg[ 'program-type' ],
                                        align: 'top'
                                    }
                                ),
                                new OO.ui.FieldLayout(
                                    dialog.fieldResourcingType,
                                    {
                                        label: gadgetMsg[ 'resourcing-type' ],
                                        align: 'top'
                                    }
                                ),
                                new OO.ui.FieldLayout(
                                    dialog.fieldActiveEditorsInvolved,
                                    {
                                        label: gadgetMsg[ 'active-editors-involved' ],
                                        align: 'top'
                                    }
                                ),
                                new OO.ui.FieldLayout(
                                    dialog.fieldNewMediaAdded,
                                    {
                                        label: gadgetMsg[ 'new-media-added' ],
                                        align: 'top'
                                    }
                                ),
                                new OO.ui.FieldLayout(
                                    dialog.fieldIndividualsInvolved,
                                    {
                                        label: gadgetMsg[ 'individuals-involved' ],
                                        align: 'top'
                                    }
                                ),
                                new OO.ui.FieldLayout(
                                    dialog.fieldArticlesAdded,
                                    {
                                        label: gadgetMsg[ 'articles-added-or-improved' ],
                                        align: 'top'
                                    }
                                ),
                                new OO.ui.FieldLayout(
                                    dialog.fieldDiversityFocus,
                                    {
                                        label: gadgetMsg[ 'diversity-focus' ],
                                        align: 'top'
                                    }
                                ),
                                new OO.ui.FieldLayout(
                                    dialog.fieldPartnerNameLinkedToProgram,
                                    {
                                        label: gadgetMsg[ 'partner-name-linked-to-program' ],
                                        align: 'top'
                                    }
                                ),
                                new OO.ui.FieldLayout(
                                    dialog.fieldPartnerType,
                                    {
                                        label: gadgetMsg[ 'partner-type' ],
                                        align: 'top'
                                    }
                                ),
                                new OO.ui.FieldLayout(
                                    dialog.fieldReachOfPartner,
                                    {
                                        label: gadgetMsg[ 'reach-of-partner' ],
                                        align: 'top'
                                    }
                                ),
                                new OO.ui.FieldLayout(
                                    dialog.fieldStatusOfPartnership,
                                    {
                                        label: gadgetMsg[ 'status-of-partnership' ],
                                        align: 'top'
                                    }
                                )
                            ]
                        } );

                        dialog.fieldSet.addItems( [
                            new OO.ui.FieldLayout(
                                dialog.updateButton
                            )
                        ] );

                        dialog.content.on( 'active', function () {
                            setTimeout( clonePmcEntry.bind( this, entry.program_id, 0 ) );
                        } );

                        // When everything is done
                        dialog.content.$element.append( dialog.fieldSetPmc.$element );
                        dialog.content.$element.append( dialog.fieldSet.$element );

                        /**
                         * Cache: Since we need the already existing entries appended,
                         * save and append them when the empty form is prompted.
                         */
                        pmcEntriesDialog.push( dialog.content );
                    }
                }
            }

            AffiliateIndicatorEditorW3.super.prototype.initialize.call( dialog );
            dialog.content = new OO.ui.TabPanelLayout(
                'new', { label: gadgetMsg[ 'submit-new-program' ] }
            );

            dialog.fieldSetPmc = new OO.ui.FieldsetLayout( {
                label: gadgetMsg[ 'program-metrics-capture' ],
            } );

            dialog.fieldProgramName = new OO.ui.TextInputWidget( {
                placeholder: gadgetMsg[ 'program-name-placeholder' ]
            } );

            dialog.fieldPmcStartDate = new mw.widgets.DateInputWidget( {
                classes: [ 'full-width' ],
                placeholderLabel: gadgetMsg[ 'start-date-placeholder' ]
            } );
            dialog.fieldPmcEndDate = new mw.widgets.DateInputWidget( {
                classes: [ 'full-width' ],
                placeholderLabel: gadgetMsg[ 'end-date-placeholder' ]
            } );

            dialog.fieldProgramType = new OO.ui.DropdownInputWidget( {
                options: [
                    {
                        data: 'Conference Attendance',
                        label: gadgetMsg[ 'pmc-conference-attendance' ]
                    },
                    {
                        data: 'Conference Presenting',
                        label: gadgetMsg[ 'pmc-conference-presenting' ]
                    },
                    {
                        data: 'Conference Organizing',
                        label: gadgetMsg[ 'pmc-conference-organizing' ]
                    },
                    {
                        data: 'GLAM partnerships',
                        label: gadgetMsg[ 'pmc-glam-partnerships' ]
                    },
                    {
                        data: 'Education partnerships',
                        label: gadgetMsg[ 'pmc-education-partnerships' ]
                    },
                    {
                        data: 'Teacher Training',
                        label: gadgetMsg[ 'pmc-teacher-training' ]
                    },
                    {
                        data: 'Classroom Programs',
                        label: gadgetMsg[ 'pmc-classroom-programs' ]
                    },
                    {
                        data: 'Gov’t Partnership',
                        label: gadgetMsg[ 'pmc-govt-partnership' ]
                    },
                    {
                        data: 'Wiki Clubs',
                        label: gadgetMsg[ 'pmc-wiki-clubs' ]
                    },
                    {
                        data: 'Wikipedia Library',
                        label: gadgetMsg[ 'pmc-wikipedia-library' ]
                    },
                    {
                        data: 'Online photo events',
                        label: gadgetMsg[ 'pmc-online-photo-events' ]
                    },
                    {
                        data: 'Offline photo events',
                        label: gadgetMsg[ 'pmc-offline-photo-events' ]
                    },
                    {
                        data: 'Online editing events',
                        label: gadgetMsg[ 'pmc-online-editing-events' ]
                    },
                    {
                        data: 'Offline editing events',
                        label: gadgetMsg[ 'pmc-offline-editing-events' ]
                    },
                    {
                        data: 'Meetups',
                        label: gadgetMsg[ 'pmc-meetups' ]
                    },
                    {
                        data: 'Technical Events',
                        label: gadgetMsg[ 'pmc-technical-events' ]
                    },
                    {
                        data: 'Other',
                        label: gadgetMsg[ 'pmc-other' ]
                    }
                ]
            } );

            dialog.fieldResourcingType = new OO.ui.DropdownInputWidget( {
                options: [
                    {
                        data: 'WMF APG',
                        label: gadgetMsg[ 'pmc-wmf-apg' ]
                    },
                    {
                        data: 'WMF sAPG',
                        label: gadgetMsg[ 'pmc-wmf-sapg' ]
                    },
                    {
                        data: 'Rapid Grant',
                        label: gadgetMsg[ 'pmc-rapid-grant' ]
                    },
                    {
                        data: 'Non-WMF Grant',
                        label: gadgetMsg[ 'pmc-non-wmf-grant' ]
                    },
                    {
                        data: 'Partnership',
                        label: gadgetMsg[ 'pmc-partnerships' ]
                    },
                    {
                        data: 'In-Kind',
                        label: gadgetMsg[ 'pmc-in-kind' ]
                    },
                    {
                        data: 'Other',
                        label: gadgetMsg[ 'pmc-other' ]
                    }
                ]
            } );

            dialog.fieldActiveEditorsInvolved = new OO.ui.TextInputWidget( {
                placeholder: gadgetMsg[ 'enter-number' ]
            } );

            dialog.fieldNewMediaAdded = new OO.ui.TextInputWidget( {
                placeholder: gadgetMsg[ 'enter-number' ]
            } );

            dialog.fieldActiveEditorsInvolved = new OO.ui.TextInputWidget( {
                placeholder: gadgetMsg[ 'enter-number' ]
            } );

            dialog.fieldIndividualsInvolved = new OO.ui.TextInputWidget( {
                placeholder: gadgetMsg[ 'enter-number' ]
            } );

            dialog.fieldArticlesAdded = new OO.ui.TextInputWidget( {
                placeholder: gadgetMsg[ 'enter-number' ]
            } );

            dialog.fieldDiversityFocus = new OO.ui.DropdownInputWidget( {
                options: [
                    {
                        data: 'Gender',
                        label: gadgetMsg[ 'pmc-gender' ]
                    },
                    {
                        data: 'Language',
                        label: gadgetMsg[ 'pmc-language' ]
                    },
                    {
                        data: 'Region',
                        label: gadgetMsg[ 'pmc-region' ]
                    },
                    {
                        data: 'None',
                        label: gadgetMsg[ 'pmc-none' ]
                    },
                    {
                        data: 'Other',
                        label: gadgetMsg[ 'pmc-other' ]
                    }
                ]
            } );

            dialog.fieldPartnerNameLinkedToProgram = new OO.ui.TextInputWidget( {
                placeholder: gadgetMsg[ 'partner-name-linked-to-program-placeholder' ]
            } );

            dialog.fieldPartnerType = new OO.ui.DropdownInputWidget( {
                options: [
                    {
                        data: 'Education',
                        label: gadgetMsg[ 'pmc-education' ]
                    },
                    {
                        data: 'GLAM',
                        label: gadgetMsg[ 'pmc-glam' ]
                    },
                    {
                        data: 'Government',
                        label: gadgetMsg[ 'pmc-government' ]
                    },
                    {
                        data: 'Other',
                        label: gadgetMsg[ 'pmc-other' ]
                    }
                ]
            } );

            dialog.fieldReachOfPartner = new OO.ui.DropdownInputWidget( {
                options: [
                    {
                        data: 'Local',
                        label: gadgetMsg[ 'pmc-local' ]
                    },
                    {
                        data: 'National',
                        label: gadgetMsg[ 'pmc-national' ]
                    },
                    {
                        data: 'International',
                        label: gadgetMsg[ 'pmc-international' ]
                    },
                    {
                        data: 'Other',
                        label: gadgetMsg[ 'pmc-other' ]
                    }
                ]
            } );

            dialog.fieldStatusOfPartnership = new OO.ui.DropdownInputWidget( {
                options: [
                    {
                        data: 'Emerging',
                        label: gadgetMsg[ 'pmc-emerging' ]
                    },
                    {
                        data: 'Forming',
                        label: gadgetMsg[ 'pmc-forming' ]
                    },
                    {
                        data: 'Existing',
                        label: gadgetMsg[ 'pmc-existing' ]
                    },
                    {
                        data: 'Completed',
                        label: gadgetMsg[ 'pmc-completed' ]
                    }
                ]
            } );

            dialog.saveButton = new OO.ui.ButtonWidget( {
                label: gadgetMsg[ 'save-and-add-program' ],
                icon: 'add',
                flags: [ 'progressive' ]
            } ).on( 'click', function () {
                dialog.saveItem( 'add' );
            } );

            // Append things to fieldSet
            dialog.fieldSet = new OO.ui.FieldsetLayout( {
                items: [
                    new OO.ui.FieldLayout(
                        dialog.fieldProgramName,
                        {
                            label: gadgetMsg[ 'program-name-reported' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        dialog.fieldPmcStartDate,
                        {
                            label: '',
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        dialog.fieldPmcEndDate,
                        {
                            label: '',
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        dialog.fieldProgramType,
                        {
                            label: gadgetMsg[ 'program-type' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        dialog.fieldResourcingType,
                        {
                            label: gadgetMsg[ 'resourcing-type' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        dialog.fieldActiveEditorsInvolved,
                        {
                            label: gadgetMsg[ 'active-editors-involved' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        dialog.fieldNewMediaAdded,
                        {
                            label: gadgetMsg[ 'new-media-added' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        dialog.fieldIndividualsInvolved,
                        {
                            label: gadgetMsg[ 'individuals-involved' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        dialog.fieldArticlesAdded,
                        {
                            label: gadgetMsg[ 'articles-added-or-improved' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        dialog.fieldDiversityFocus,
                        {
                            label: gadgetMsg[ 'diversity-focus' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        dialog.fieldPartnerNameLinkedToProgram,
                        {
                            label: gadgetMsg[ 'partner-name-linked-to-program' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        dialog.fieldPartnerType,
                        {
                            label: gadgetMsg[ 'partner-type' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        dialog.fieldReachOfPartner,
                        {
                            label: gadgetMsg[ 'reach-of-partner' ],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        dialog.fieldStatusOfPartnership,
                        {
                            label: gadgetMsg[ 'status-of-partnership' ],
                            align: 'top'
                        }
                    )
                ]
            } );

            dialog.fieldSet.addItems( [
                new OO.ui.FieldLayout(
                    dialog.saveButton
                )
            ] );

            dialog.content.on( 'active', function () {
                setTimeout( clonePmcEntry.bind( this, dialog.content.getName(), 0 ) );
            } );

            // When everything is done
            dialog.content.$element.append( dialog.fieldSetPmc.$element );
            dialog.content.$element.append( dialog.fieldSet.$element );

            pmcTabsArray.push( dialog.content );
            // Append existing entries after new form
            pmcTabsArray = pmcTabsArray.concat( pmcEntriesDialog );

            index.addTabPanels( pmcTabsArray );
            dialog.$body.append( index.$element );

            // reset stuff
            pmcEntries = [];
            pmcTabsArray = [];
            pmcEntriesDialog = [];
        };

        /**
         * Set custom height for the modal window
         */
        AffiliateIndicatorEditorW3.prototype.getBodyHeight = function () {
            return 700;
        };

        /**
         * In the event "Select" is pressed
         */
        AffiliateIndicatorEditorW3.prototype.getActionProcess = function ( action ) {
            var dialog = this;

            if ( action === 'continue' && persistentId !== '' ) {
                return new OO.ui.Process( function () {
                    dialog.saveItem();
                } );
            } else if ( action === 'back' && persistentId !== '' ) {
                dialog.close();
                return new OO.ui.Process( function () {
                    new mw.Api().get( getModuleContent( 'Affiliate_Indicators' ) ).then( function ( data ) {
                        var entryData, entry, i;

                        new mw.Api().get( getModuleContent( 'Affiliate_Indicators/Programs' ) ).then( function ( data ) {
                            pmcEntries = parseAIUDataModule( data.query.pages );
                            if ( pmcEntries ) {
                                for ( i = 0; i < pmcEntries.length; i++ ) {
                                    entry = cleanRawEntry( pmcEntries[ i ].value.fields );
                                    if ( entry.unique_id === persistentId ) {
                                        pmcTabs = true;
                                        break;
                                    }
                                }
                            } else {
                                pmcTabs = false;
                            }
                        } );

                        entryData = cleanRawEntry(
                            getRelevantRawEntry(
                                parseAIUDataModule( data.query.pages ),
                                persistentId
                            )
                        );
                        openWindow2( entryData );
                    } );
                } );
            } else if ( action === 'cancel' && persistentId !== '' ) {
                return new OO.ui.Process( function () {
                    new OO.ui.confirm(
                        gadgetMsg[ 'confirm-cancel-action' ]
                    ).then( function ( confirmed ) {
                        if ( confirmed ) {
                            dialog.saveItem( 'delete' );
                        }
                    } );
                } );
            } else {
                return new OO.ui.Process( function () {
                    dialog.close();
                } );
            }
        };

        /**
         * Save the changes to [[Module:Affiliate_Indicators/Programs]] page.
         */
        AffiliateIndicatorEditorW3.prototype.saveItem = function ( deleteFlag ) {
            var dialog = this;

            dialog.pushPending();

            new mw.Api().get( getModuleContent( 'Affiliate_Indicators/Programs' ) ).then( function ( data ) {
                var i, insertInPlace, processWorkingEntry,
                    editSummary, manifest = [], workingEntry, entries;

                /**
                 * Compares a given [[Module:Affiliate_Indicators]] entry against
                 * the edit fields and applies changes where relevant.
                 *
                 * @param {Object} workingEntry the entry being worked on
                 * @return {Object} The same entry but with modifications
                 */
                processWorkingEntry = function ( workingEntry ) {
                    if ( !workingEntry.program_id ) {
                        workingEntry.program_id = Math.random().toString( 30 ).substring( 2 );
                    }

                    if ( dialog.fieldProgramName.getValue() ) {
                        workingEntry.program_name = dialog.fieldProgramName.getValue();
                    } else if ( !dialog.fieldProgramName.getValue() && workingEntry.program_name ) {
                        delete workingEntry.program_name;
                    }

                    if ( dialog.fieldPmcStartDate.getValue() ) {
                        workingEntry.pmc_start_date = convertDateToDdMmYyyyFormat( dialog.fieldPmcStartDate.getValue() );
                    } else if ( !dialog.fieldPmcStartDate.getValue() && workingEntry.pmc_start_date ) {
                        delete workingEntry.pmc_start_date;
                    }

                    if ( dialog.fieldPmcEndDate.getValue() ) {
                        workingEntry.pmc_end_date = convertDateToDdMmYyyyFormat( dialog.fieldPmcEndDate.getValue() );
                    } else if ( !dialog.fieldPmcEndDate.getValue() && workingEntry.pmc_end_date ) {
                        delete workingEntry.pmc_end_date;
                    }

                    if ( dialog.fieldProgramType.getValue() ) {
                        workingEntry.program_type = dialog.fieldProgramType.getValue();
                    } else if ( !dialog.fieldProgramType.getValue() && workingEntry.program_type ) {
                        delete workingEntry.program_type;
                    }

                    if ( dialog.fieldResourcingType.getValue() ) {
                        workingEntry.resourcing_type = dialog.fieldResourcingType.getValue();
                    } else if ( !dialog.fieldResourcingType.getValue() && workingEntry.resourcing_type ) {
                        delete workingEntry.resourcing_type;
                    }

                    if ( dialog.fieldActiveEditorsInvolved.getValue() ) {
                        workingEntry.active_editors_involved = dialog.fieldActiveEditorsInvolved.getValue();
                    } else if ( !dialog.fieldActiveEditorsInvolved.getValue() && workingEntry.active_editors_involved ) {
                        delete workingEntry.active_editors_involved;
                    }

                    if ( dialog.fieldNewMediaAdded.getValue() ) {
                        workingEntry.new_media_added = dialog.fieldNewMediaAdded.getValue();
                    } else if ( !dialog.fieldNewMediaAdded.getValue() && workingEntry.new_media_added ) {
                        delete workingEntry.new_media_added;
                    }

                    if ( dialog.fieldIndividualsInvolved.getValue() ) {
                        workingEntry.individuals_involved = dialog.fieldIndividualsInvolved.getValue();
                    } else if ( !dialog.fieldIndividualsInvolved.getValue() && workingEntry.individuals_involved ) {
                        delete workingEntry.individuals_involved;
                    }

                    if ( dialog.fieldArticlesAdded.getValue() ) {
                        workingEntry.articles_added = dialog.fieldArticlesAdded.getValue();
                    } else if ( !dialog.fieldArticlesAdded.getValue() && workingEntry.articles_added ) {
                        delete workingEntry.articles_added;
                    }

                    if ( dialog.fieldDiversityFocus.getValue() ) {
                        workingEntry.diversity_focus = dialog.fieldDiversityFocus.getValue();
                    } else if ( !dialog.fieldDiversityFocus.getValue() && workingEntry.diversity_focus ) {
                        delete workingEntry.diversity_focus;
                    }

                    if ( dialog.fieldPartnerNameLinkedToProgram.getValue() ) {
                        workingEntry.partner_name_linked_to_program = dialog.fieldPartnerNameLinkedToProgram.getValue();
                    } else if ( !dialog.fieldPartnerNameLinkedToProgram.getValue() && workingEntry.partner_name_linked_to_program ) {
                        delete workingEntry.partner_name_linked_to_program;
                    }

                    if ( dialog.fieldPartnerType.getValue() ) {
                        workingEntry.partner_type = dialog.fieldPartnerType.getValue();
                    } else if ( !dialog.fieldPartnerType.getValue() && workingEntry.partner_type ) {
                        delete workingEntry.partner_type;
                    }

                    if ( dialog.fieldReachOfPartner.getValue() ) {
                        workingEntry.reach_of_partner = dialog.fieldReachOfPartner.getValue();
                    } else if ( !dialog.fieldReachOfPartner.getValue() && workingEntry.reach_of_partner ) {
                        delete workingEntry.reach_of_partner;
                    }

                    if ( dialog.fieldStatusOfPartnership.getValue() ) {
                        workingEntry.status_of_partnership = dialog.fieldStatusOfPartnership.getValue();
                    } else if ( !dialog.fieldStatusOfPartnership.getValue() && workingEntry.status_of_partnership ) {
                        delete workingEntry.status_of_partnership;
                    }

                    /* Get today's date and time in YYYY-MM-DDTHH:MM:SSZ */
                    /* format. dos stands for "date of submission" */
                    workingEntry.dos_stamp = new Date().toISOString();

                    return workingEntry;
                };

                // Cycle through existing entries. If we are editing an existing
                // entry, that entry will be modified in place.
                entries = parseAIUDataModule( data.query.pages );

                for ( i = 0; i < entries.length; i++ ) {
                    workingEntry = cleanRawEntry( entries[ i ].value.fields );
                    if ( workingEntry.unique_id === persistentId && deleteFlag === 'delete' ) {
                        workingEntry = processWorkingEntry( workingEntry );
                        editSummary = gadgetMsg[ 'revert-aiu-incomplete-entry' ] + ' ' + persistentGroupName;
                    } /** else if ( workingEntry.unique_id == persistentId && deleteFlag !== '' ) {
							console.log( deleteFlag );
							editSummary = gadgetMsg[ 'updating-pmc-entry' ].concat( persistentGroupName );
						} */else {
                        manifest.push( workingEntry );
                    }
                }

                /**
                 * NOTE: Also, make sure to also delete Indicators (W1 & W2)
                 * entries for matching persistent ID.
                 */
                if ( deleteFlag === 'delete' && persistentId !== '' ) {
                    new mw.Api().get( getModuleContent( 'Affiliate_Indicators' ) ).then( function ( data ) {
                        var manifest = [];
                        entries = parseAIUDataModule( data.query.pages );

                        for ( i = 0; i < entries.length; i++ ) {
                            workingEntry = cleanRawEntry( entries[ i ].value.fields );
                            if ( workingEntry.unique_id === persistentId ) {
                                workingEntry = processWorkingEntry( workingEntry );
                                if ( deleteFlag ) {
                                    editSummary = gadgetMsg[ 'revert-aiu-incomplete-entry' ] + ' ' + workingEntry.group_name;
                                } else {
                                    editSummary = gadgetMsg[ 'updated-aff-indicators' ] + ' ' + workingEntry.group_name;
                                }
                            }
                            if ( workingEntry.unique_id !== persistentId || !deleteFlag ) {
                                manifest.push( workingEntry );
                            }
                        }

                        // Write after deleting
                        insertInPlace = 'return {\n';
                        for ( i = 0; i < manifest.length; i++ ) {
                            insertInPlace += '\t{\n';
                            if ( manifest[ i ].unique_id ) {
                                insertInPlace += generateKeyValuePair(
                                    'unique_id',
                                    manifest[ i ].unique_id
                                );
                            }
                            if ( manifest[ i ].affiliate_code ) {
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
                            if ( manifest[ i ].no_of_donations ) {
                                insertInPlace += generateKeyValuePair(
                                    'no_of_donations',
                                    manifest[ i ].no_of_donations
                                );
                            }
                            if ( manifest[ i ].donation_renewal_rate ) {
                                insertInPlace += generateKeyValuePair(
                                    'donation_renewal_rate',
                                    manifest[ i ].donation_renewal_rate
                                );
                            }
                            if ( manifest[ i ].index_score_donor_satisfaction ) {
                                insertInPlace += generateKeyValuePair(
                                    'index_score_donor_satisfaction',
                                    manifest[ i ].index_score_donor_satisfaction
                                );
                            }
                            if ( manifest[ i ].members_reported ) {
                                insertInPlace += generateKeyValuePair(
                                    'members_reported',
                                    manifest[ i ].members_reported
                                );
                            }
                            if ( manifest[ i ].membership_duration ) {
                                insertInPlace += generateKeyValuePair(
                                    'membership_duration',
                                    manifest[ i ].membership_duration
                                );
                            }
                            if ( manifest[ i ].net_members_yoy ) {
                                insertInPlace += generateKeyValuePair(
                                    'net_members_yoy',
                                    manifest[ i ].net_members_yoy
                                );
                            }
                            if ( manifest[ i ].index_score_member_satisfaction ) {
                                insertInPlace += generateKeyValuePair(
                                    'index_score_member_satisfaction',
                                    manifest[ i ].index_score_member_satisfaction
                                );
                            }
                            if ( manifest[ i ].pp_score ) {
                                insertInPlace += generateKeyValuePair(
                                    'pp_score',
                                    manifest[ i ].pp_score
                                );
                            }
                            if ( manifest[ i ].net_no_of_partners_yoy ) {
                                insertInPlace += generateKeyValuePair(
                                    'net_no_of_partners_yoy',
                                    manifest[ i ].net_no_of_partners_yoy
                                );
                            }
                            if ( manifest[ i ].index_score_partner_satisfaction ) {
                                insertInPlace += generateKeyValuePair(
                                    'index_score_partner_satisfaction',
                                    manifest[ i ].index_score_partner_satisfaction
                                );
                            }
                            if ( manifest[ i ].revenue_reliability ) {
                                insertInPlace += generateKeyValuePair(
                                    'revenue_reliability',
                                    manifest[ i ].revenue_reliability
                                );
                            }
                            if ( manifest[ i ].budget_surpluses ) {
                                insertInPlace += generateKeyValuePair(
                                    'budget_surpluses',
                                    manifest[ i ].budget_surpluses
                                );
                            }
                            if ( manifest[ i ].overhead_cost_total_budget ) {
                                insertInPlace += generateKeyValuePair(
                                    'overhead_cost_total_budget',
                                    manifest[ i ].overhead_cost_total_budget
                                );
                            }
                            if ( manifest[ i ].liquid_months ) {
                                insertInPlace += generateKeyValuePair(
                                    'liquid_months',
                                    manifest[ i ].liquid_months
                                );
                            }
                            if ( manifest[ i ].programs_in_reporting_month ) {
                                insertInPlace += generateKeyValuePair(
                                    'programs_in_reporting_month',
                                    manifest[ i ].programs_in_reporting_month
                                );
                            }
                            if ( manifest[ i ].average_program_frequencies ) {
                                insertInPlace += generateKeyValuePair(
                                    'average_program_frequencies',
                                    manifest[ i ].average_program_frequencies
                                );
                            }
                            if ( manifest[ i ].program_success_rate ) {
                                insertInPlace += generateKeyValuePair(
                                    'program_success_rate',
                                    manifest[ i ].program_success_rate
                                );
                            }
                            if ( manifest[ i ].membership_to_program_threshold ) {
                                insertInPlace += generateKeyValuePair(
                                    'membership_to_program_threshold',
                                    manifest[ i ].membership_to_program_threshold
                                );
                            }
                            if ( manifest[ i ].no_of_partnerships ) {
                                insertInPlace += generateKeyValuePair(
                                    'no_of_partnerships',
                                    manifest[ i ].no_of_partnerships
                                );
                            }
                            if ( manifest[ i ].average_age_of_partnerships ) {
                                insertInPlace += generateKeyValuePair(
                                    'average_age_of_partnerships',
                                    manifest[ i ].average_age_of_partnerships
                                );
                            }
                            if ( manifest[ i ].affiliate_satisfaction_level ) {
                                insertInPlace += generateKeyValuePair(
                                    'affiliate_satisfaction_level',
                                    manifest[ i ].affiliate_satisfaction_level
                                );
                            }
                            if ( manifest[ i ].prevalence_services_to_members ) {
                                insertInPlace += generateKeyValuePair(
                                    'prevalence_services_to_members',
                                    manifest[ i ].prevalence_services_to_members
                                );
                            }
                            if ( manifest[ i ].board_level_role_understanding ) {
                                insertInPlace += generateKeyValuePair(
                                    'board_level_role_understanding',
                                    manifest[ i ].board_level_role_understanding
                                );
                            }
                            if ( manifest[ i ].board_diversity_index ) {
                                insertInPlace += generateKeyValuePair(
                                    'board_diversity_index',
                                    manifest[ i ].board_diversity_index
                                );
                            }
                            if ( manifest[ i ].board_training_opportunities ) {
                                insertInPlace += generateKeyValuePair(
                                    'board_training_opportunities',
                                    manifest[ i ].board_training_opportunities
                                );
                            }
                            if ( manifest[ i ].employee_training_plan_available ) {
                                insertInPlace += generateKeyValuePair(
                                    'employee_training_plan_available',
                                    manifest[ i ].employee_training_plan_available
                                );
                            }
                            if ( manifest[ i ].level_role_understanding_members ) {
                                insertInPlace += generateKeyValuePair(
                                    'level_role_understanding_members',
                                    manifest[ i ].level_role_understanding_members
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
                                nocreate: true,
                                summary: editSummary,
                                pageid: 11082119,  // [[Module:Affiliate_Indicators]]
                                text: insertInPlace,
                                contentmodel: 'Scribunto'
                            }
                        );
                    } );
                }

                // No unique ID means this is a new entry
                if ( persistentId !== '' ) {
                    if ( deleteFlag === 'add' || !deleteFlag ) {
                        workingEntry = {
                            unique_id: persistentId
                        };
                        workingEntry = processWorkingEntry( workingEntry );
                        editSummary = gadgetMsg[ 'pmc-added-new-program' ] + ' ' + persistentGroupName;
                        manifest.push( workingEntry );
                    }
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
                    // We need a program_id in case we want to update
                    // a program if need be.
                    if ( manifest[ i ].program_id ) {
                        insertInPlace += generateKeyValuePair(
                            'program_id',
                            manifest[ i ].program_id
                        );
                    }
                    if ( manifest[ i ].program_name ) {
                        insertInPlace += generateKeyValuePair(
                            'program_name',
                            manifest[ i ].program_name
                        );
                    }
                    if ( manifest[ i ].pmc_start_date ) {
                        insertInPlace += generateKeyValuePair(
                            'pmc_start_date',
                            manifest[ i ].pmc_start_date
                        );
                    }
                    if ( manifest[ i ].pmc_end_date ) {
                        insertInPlace += generateKeyValuePair(
                            'pmc_end_date',
                            manifest[ i ].pmc_end_date
                        );
                    }
                    if ( manifest[ i ].program_type ) {
                        insertInPlace += generateKeyValuePair(
                            'program_type',
                            manifest[ i ].program_type
                        );
                    }
                    if ( manifest[ i ].resourcing_type ) {
                        insertInPlace += generateKeyValuePair(
                            'resourcing_type',
                            manifest[ i ].resourcing_type
                        );
                    }
                    if ( manifest[ i ].active_editors_involved ) {
                        insertInPlace += generateKeyValuePair(
                            'active_editors_involved',
                            manifest[ i ].active_editors_involved
                        );
                    }
                    if ( manifest[ i ].new_media_added ) {
                        insertInPlace += generateKeyValuePair(
                            'new_media_added',
                            manifest[ i ].new_media_added
                        );
                    }
                    if ( manifest[ i ].individuals_involved ) {
                        insertInPlace += generateKeyValuePair(
                            'individuals_involved',
                            manifest[ i ].individuals_involved
                        );
                    }
                    if ( manifest[ i ].articles_added ) {
                        insertInPlace += generateKeyValuePair(
                            'articles_added',
                            manifest[ i ].articles_added
                        );
                    }
                    if ( manifest[ i ].diversity_focus ) {
                        insertInPlace += generateKeyValuePair(
                            'diversity_focus',
                            manifest[ i ].diversity_focus
                        );
                    }
                    if ( manifest[ i ].partner_name_linked_to_program ) {
                        insertInPlace += generateKeyValuePair(
                            'partner_name_linked_to_program',
                            manifest[ i ].partner_name_linked_to_program
                        );
                    }
                    if ( manifest[ i ].partner_type ) {
                        insertInPlace += generateKeyValuePair(
                            'partner_type',
                            manifest[ i ].partner_type
                        );
                    }
                    if ( manifest[ i ].reach_of_partner ) {
                        insertInPlace += generateKeyValuePair(
                            'reach_of_partner',
                            manifest[ i ].reach_of_partner
                        );
                    }
                    if ( manifest[ i ].status_of_partnership ) {
                        insertInPlace += generateKeyValuePair(
                            'status_of_partnership',
                            manifest[ i ].status_of_partnership
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
                        pageid: 11119914,  // [[Module:Affiliate_Indicators/Programs]]
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
                        message: gadgetMsg[ 'aff-indicators-saved' ],
                        actions: [
                            {
                                action: 'accept',
                                label: 'Dismiss',
                                flags: 'primary'
                            }
                        ]
                    });

                    windowManager.closeWindow();

                    // Purge the cache of the page from which the edit was made
                    new mw.Api().postWithToken(
                        'csrf',
                        { action: 'purge', titles: mw.config.values.wgPageName }
                    ).then( function () {
                        if ( deleteFlag === 'add' ) {
                            pmcTabs = true;
                            new mw.Api().get( getModuleContent( 'Affiliate_Indicators/Programs' ) ).then( function ( data ) {
                                pmcEntries = parseAIUDataModule( data.query.pages );
                                openWindow3( {} );
                            } );
                        } else if ( deleteFlag === 'update' ) {
                            new mw.Api().get( getModuleContent( 'Affiliate_Indicators/Programs' ) ).then( function ( data ) {
                                pmcEntries = parseAIUDataModule( data.query.pages );
                                openWindow3( {} );
                            } );
                        } else {
                            location.reload();
                        }
                    } );
                } ).catch( function ( error ) {
                    alert( gadgetMsg[ 'failed-to-save-to-lua-table' ] );
                    dialog.close();
                    console.error( error );
                } );
            } );
        };

        /**
         * The dialog / window to be displayed as editor when
         * when updating the records or table entries.
         *
         * @param {Object} config
         */
        openWindow3 = function ( config ) {
            var affIndicatorEditor;
            config.size = 'large';
            affIndicatorEditor = new AffiliateIndicatorEditorW3( config );

            windowManager = new OO.ui.WindowManager();
            $( 'body' ).append( windowManager.$element );
            windowManager.addWindows( [ affIndicatorEditor ] );
            windowManager.openWindow( affIndicatorEditor );
        };
        /*********************** Window 3 dialog logic end ******************/


        $( '.codedData' ).on( 'click', function () {
            var users = [
                'DAlangi (WMF)',
                'DNdubane (WMF)',
                'MKaur (WMF)'
            ];

            if ( users.indexOf( mw.config.values.wgUserName ) > -1 ) {
                openWindow1( {} );
            } else {
                alert( gadgetMsg[ 'me-staffs-only-aiu-form' ] );
            }
        } );
    }

    // This is called after module dependencies are ready
    function initAfterModules() {
        new mw.Api().get( {
            action: 'query',
            list: 'messagecollection',
            /** TODO: Move to 'page-Template:I18n/WADP' */
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
        } ).catch( function( error ) {
            console.error( error, 'Unable to load translation strings - __AIUF__' );
        } );
    }

    mw.loader.using( [
        'ext.gadget.luaparse',
        'mediawiki.api',
        'mediawiki.widgets.DateInputWidget',
        'oojs-ui',
        'oojs-ui-core',
        'oojs-ui.styles.icons-editing-core',
    ] ).then( initAfterModules );

}() );
