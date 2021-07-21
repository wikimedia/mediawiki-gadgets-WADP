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
            getLatestReport;

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

        apiObj = new mw.Api();
        // Let's treat User Groups first before tackling Chapters
        apiObj.get( getActivitiesReports() ).done( function ( activitiesReportsData ) {
            apiObj.get( getOrgInfos() ).done( function ( orgInfosData ) {
                var activityReport, activitiesReports, orgInfo, orgInfos, currentYear,
                    manifest = [], reportEndYear, reportingEndDate, dateSlice,
                    todayDate, insertInPlace, latestActivityReport, oocc_manifest = [];

                activitiesReports = parseModuleContent( activitiesReportsData.query.pages );
                orgInfos = parseModuleContent( orgInfosData.query.pages );

                for ( var i = 0; i < orgInfos.length; i++ ) {
                    orgInfo = cleanRawEntry( orgInfos[i].value.fields );
                    activityReport = cleanRawEntry( activitiesReports[i].value.fields );

                    latestActivityReport = getLatestReport( orgInfo.group_name, activitiesReports );

                    if ( orgInfo.org_type === 'User Group' ||
                         orgInfo.org_type === 'Chapter' ||
                         orgInfo.org_type === 'Thematic Organization'
                    ) {
                        currentYear = new Date().getFullYear();
                        reportEndYear = latestActivityReport.end_date.split( "/" )[2];
                        dateSlice = orgInfo.agreement_date.split( "/" );
                        // generate reporting end date
                        reportingEndDate = new Date( currentYear, dateSlice[1], dateSlice[0] )
                            .toJSON().slice( 0, 10 ).replace( /-/g, '/' );
                        reportingEndDate = reportingEndDate.split( '/' ).reverse().join( '/' );
                        // generate today's date as reportingEndDate above
                        todayDate = new Date().toJSON().slice(0,10).replace(/-/g,'/');
                        todayDate = todayDate.split( '/' ).reverse().join( '/' );

                        // perform checks to see if activities report is not yet submitted
                        if ( todayDate > reportingEndDate && reportEndYear < ( currentYear - 1 ) ) {
                            if ( orgInfo.uptodate_reporting === 'Tick' ) {
                                orgInfo.uptodate_reporting = 'Cross';
                            }

                            if ( orgInfo.uptodate_reporting === 'Tick-N' ) {
                                orgInfo.uptodate_reporting = 'Cross-N';
                            }
                        }
                        manifest.push( orgInfo );
                    } else {
                        manifest.push( orgInfo );
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
                );
            } );
        } );
    } );
}() );