/**
 * WADP Out of Compliance Checker
 * @author Derick Alangi (WMF)
 */
( function () {
    'use strict';

    mw.loader.using( [
        'mediawiki.api',
        'ext.gadget.luaparse'
    ] ).done( function () {
        var apiObj,
            getActivitiesReports,
            generateKeyValuePair,
            sanitizeInput,
            getOrgInfos,
            parseModuleContent,
            cleanRawEntry,
            getLatestReport,
            getOOCLevel;

        /**
         * Provides API parameters for getting the content from [[Module:Activities_Reports]]
         *
         * @return {Object}
         */
        getActivitiesReports = function () {
            return {
                action: 'query',
                prop: 'revisions',
                titles: 'Module:Activities_Reports',
                rvprop: 'content',
                rvlimit: 1
            };
        };

        /**
         * Provides API parameters for getting the content from [[Module:Organizational_Informations]]
         *
         * @return {Object}
         */
        getOrgInfos = function () {
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
         * [[Module:Organizational_Informations/Out_Of_Compliance_Level]]
         *
         * @return {Object}
         */
        getOOCLevel = function () {
            return {
                action: 'query',
                prop: 'revisions',
                titles: 'Module:Organizational_Informations/Out_Of_Compliance_Level',
                rvprop: 'content',
                rvlimit: 1
            };
        };

        /**
         * Takes Lua-formatted content from [[Module:Activities_Reports]] content and
         * returns an abstract syntax tree.
         *
         * @param {Object} sourceblob The original API return
         * @return {Object} Abstract syntax tree
         */
        parseModuleContent = function ( sourceblob ) {
            var ast, i, raw;
            for ( i in sourceblob ) {  // should only be one result
                raw = sourceblob[ i ].revisions[ 0 ][ '*' ];
                ast = luaparse.parse( raw );
                return ast.body[ 0 ].arguments[ 0 ].fields;
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
         *
         * @param {String} affiliateName
         * @param {Array[]} reports
         * @returns {Array}
         */
        getLatestReport = function ( affiliateName, reports ) {
            var latestReport = cleanRawEntry( reports[0].value.fields ), report;

            for ( var i = 0; i < reports.length; i++ ) {
                report = cleanRawEntry( reports[i].value.fields );
                if ( report.group_name === affiliateName && report.dos_stamp > latestReport.dos_stamp ) {
                    latestReport = report;
                } else {
                    latestReport = '';
                }
            }

            return latestReport;
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
         * Add an interface to add days to a given date
         */
        Date.prototype.addDays = function ( reportingDueDate, days ) {
            var date = new Date( reportingDueDate );
            date.setDate( date.getDate() + days );

            return date;
        };

        apiObj = new mw.Api();
        apiObj.get( getActivitiesReports() ).done( function ( activitiesReportsData ) {
            apiObj.get( getOrgInfos() ).done( function ( orgInfosData ) {
                apiObj.get( getOOCLevel() ).done( function( oocLevelsData ) {
                    var activityReport, activitiesReports, orgInfo, orgInfos, currentYear,
                        manifest = [], lastReportingYear = '', reportingDueDate, todayDate, insertInPlace,
                        latestActivityReport, insertInPlaceOOC, oocLevels, ooc_manifest = [], fiscalYear;

                    activitiesReports = parseModuleContent( activitiesReportsData.query.pages );
                    orgInfos = parseModuleContent( orgInfosData.query.pages );
                    oocLevels = parseModuleContent( oocLevelsData.query.pages );

                    // First of all populate the ooc_manifest with existing entries
                    for (i = 0; i < oocLevels.length; i++ ) {
                        ooc_manifest.push( cleanRawEntry( oocLevels[i].value.fields ) );
                    }

                    for ( var i = 0; i < orgInfos.length; i++ ) {
                        orgInfo = cleanRawEntry( orgInfos[i].value.fields );
                        activityReport = cleanRawEntry( activitiesReports[i].value.fields );

                        latestActivityReport = getLatestReport( orgInfo.group_name, activitiesReports );

                        /**== OOC: Level 0 to Level 1 algorithm ==*/
                        if ( ( orgInfo.org_type === 'User Group' ||
                                orgInfo.org_type === 'Chapter' ||
                                orgInfo.org_type === 'Thematic Organization' )
                            && orgInfo.recognition_status === 'recognised'
                            && orgInfo.me_bypass_ooc_autochecks !== 'Yes'
                        ) {
                            currentYear = new Date().getFullYear();
                            if ( latestActivityReport !== '' ) {
                                lastReportingYear = latestActivityReport.end_date.split( "/" )[2];
                            }
                            if ( orgInfo.fiscal_year_end ) {
                                fiscalYear = orgInfo.fiscal_year_end.split( "/" );
                            } else if ( orgInfo.agreement_date ) {
                                fiscalYear = orgInfo.agreement_date.split( "/" );
                            }
                            // generate due date for affiliate to submit report.
                            reportingDueDate = new Date( currentYear, parseInt( fiscalYear[1] ) - 1, parseInt( fiscalYear[0] ) + 1 );
                            // generate today's date as reportingEndDate above
                            todayDate = new Date();

                            // check if activities report is not yet submitted : dateSlice[1] is reporting month
                            if ( todayDate.valueOf() > reportingDueDate.valueOf() &&
                                lastReportingYear !== '' &&
                                lastReportingYear < currentYear &&
                                orgInfo.out_of_compliance_level < '1'
                            ) {
                                console.log( "OOC L1: " + orgInfo.group_name);
                                /*orgInfo.out_of_compliance_level = '1';

                                oocLevel = {
                                    group_name: orgInfo.group_name,
                                    out_of_compliance_level: '1',
                                    financial_year: currentYear.toString(),
                                    created_at: new Date().toISOString()
                                };

                                ooc_manifest.push( oocLevel );*/
                            } else if ( orgInfo.group_name === 'User Group' &&
                                lastReportingYear < currentYear &&
                                lastReportingYear !== '' &&
                                // check if days difference is greater than 30 days
                                ( ( todayDate.getTime() - reportingDueDate.getTime() ) / (1000 * 60 * 60 * 24) ) > 30 &&
                                orgInfo.uptodate_reporting === "Tick" &&
                                orgInfo.out_of_compliance_level === '1'
                            ) {
                                console.log( "OOC L2: " + orgInfo.group_name );
                                /*orgInfo.out_of_compliance_level = '2';
                                orgInfo.uptodate_reporting = "Cross";

                                oocLevel = {
                                    group_name: orgInfo.group_name,
                                    out_of_compliance_level: '2',
                                    financial_year: currentYear.toString(),
                                    created_at: new Date().toISOString()
                                };

                                ooc_manifest.push( oocLevel );*/
                            }
                            // manifest.push( orgInfo );
                        } /*else {
                            manifest.push( orgInfo );
                        }*/
                    }

                    // Re-generate the OOC Lua table based on `ooc_manifest`
                    /**insertInPlaceOOC = 'return {\n';
                    for ( i = 0; i < ooc_manifest.length; i++ ) {
                        insertInPlaceOOC += '\t{\n';
                        if ( ooc_manifest[ i ].group_name ) {
                            insertInPlaceOOC += generateKeyValuePair(
                                'group_name',
                                ooc_manifest[ i ].group_name
                            );
                        }
                        if ( ooc_manifest[ i ].out_of_compliance_level ) {
                            insertInPlaceOOC += generateKeyValuePair(
                                'out_of_compliance_level',
                                ooc_manifest[ i ].out_of_compliance_level
                            );
                        }
                        if ( ooc_manifest[ i ].financial_year ) {
                            insertInPlaceOOC += generateKeyValuePair(
                                'financial_year',
                                ooc_manifest[ i ].financial_year
                            );
                        }
                        if ( ooc_manifest[ i ].created_at ) {
                            insertInPlaceOOC += generateKeyValuePair(
                                'created_at',
                                ooc_manifest[ i ].created_at
                            );
                        }
                        insertInPlaceOOC += '\t},\n';
                    }
                    insertInPlaceOOC += '}';

                    // Make changes to the Org Info table as required.
                    apiObj.postWithToken(
                        'csrf',
                        {
                            action: 'edit',
                            nocreate: true,
                            summary: '[Automated] M&E compliance automated checks by WAD Portal.',
                            pageid: 11441702,  // [[Module:Organizational_Informations/Out Of Compliance Level]]
                            text: insertInPlaceOOC,
                            contentmodel: 'Scribunto'
                        }
                    );

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
                        }
                        if ( manifest[ i ].fiscal_year_end ){
                            insertInPlace += generateKeyValuePair(
                                'fiscal_year_end',
                                manifest[ i ].fiscal_year_end
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
                        if ( manifest[ i ].me_bypass_ooc_autochecks ){
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
                    apiObj.postWithToken(
                        'csrf',
                        {
                            action: 'edit',
                            nocreate: true,
                            summary: '[Automated] M&E compliance automated checks by WAD Portal.',
                            pageid: 10603224,  // [[Module:Organizational_Informations]]
                            text: insertInPlace,
                            contentmodel: 'Scribunto'
                        }
                    );*/
                } );
            } );
        } );
    } );
}() );