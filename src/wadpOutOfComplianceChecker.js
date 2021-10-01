/**
 * WADP Out of Compliance Checker
 * @author Derick Alangi (WMF)
 */
( function () {
    'use strict';

    var apiObj,
        getActivitiesReports,
        generateKeyValuePair,
        sanitizeInput,
        getOrgInfos,
        parseModuleContent,
        cleanRawEntry,
        getLatestReport,
        getOOCLevel,
        compareDates,
        getAffiliateTalkPageWikiText,
        parseAndExtractAffiliateTalkPageContent,
        getAffiliateRedirectPageIfExist,
        oocLevel2MessageGenerator,
        sendEmailToMEStaff,
        oocLevelLogGenerator;

    function init() {
        /**
         * @param {String} affiliate
         * @return {Object}
         */
        getAffiliateTalkPageWikiText = function ( affiliate ) {
            var titles;
            if ( affiliate === 'test' ) {
                // Test feature before deployment
                titles = 'User:DAlangi (WMF)/Sandbox/OOC post notif messages';
            } else {
                titles = 'Talk:' + affiliate;
            }
            return {
                action: 'query',
                prop: 'revisions',
                titles: titles,
                rvprop: 'content',
                rvlimit: 1
            };
        };

        /**
         * @param {Text} sourceblob The wikitext for the page
         * @returns {Text} The wiki page content only from API request
         */
        parseAndExtractAffiliateTalkPageContent = function ( sourceblob ) {
            var i, raw;
            for ( i in sourceblob ) {  // should only be one result
                raw = sourceblob[ i ].revisions[ 0 ][ '*' ];
                return raw;
            }
        };

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
            var latestReport = { end_date: '01/01/2000', dos_stamp: '2000-01-01T00:00:00.000Z' },
                report;

            for ( var i = 0; i < reports.length; i++ ) {
                report = cleanRawEntry( reports[i].value.fields );
                if ( report.group_name === affiliateName && compareDates( report.dos_stamp, latestReport.dos_stamp ) === 1 ) {
                    latestReport = report;
                }
            }

            return latestReport;
        };

        /**
         * @param {String} date1
         * @param {String} date2
         * @return {Number} 0 if dates are equal, 1 if date1 > date2 and -1 if date1 < date2
         */
        compareDates = function ( date1, date2 ) {
            var d1, d2, d1Obj, d2Obj;

            // Date is in the format: 2020-03-02T21:27:26.877Z, so truncate
            d1 = date1.substring( 0, 10 ).split( "-" );

            if ( date2 ) {
                d2 = date2.substring( 0, 10 ).split( "-" );
            } else {
                date2 = "2000-01-01T00:00:00.000Z";
                d2 = date2.substring( 0, 10 ).split( "-" );
            }

            d1Obj = new Date( parseInt( d1[0] ), parseInt( d1[1] ) - 1, parseInt( d1[2] ) + 1 );
            d2Obj = new Date( parseInt( d2[0] ), parseInt( d2[1] ) - 1, parseInt( d2[2] ) + 1 );

            if ( d1Obj.valueOf() === d2Obj.valueOf() ) {
                return 0;
            } else if ( d1Obj.valueOf() > d2Obj.valueOf() ) {
                return 1;
            } else if ( d1Obj.valueOf() < d2Obj.valueOf() ) {
                return -1;
            }
        };

        /**
         * @param {String} affiliatePage Group name
         *
         * @returns {Object}
         */
        getAffiliateRedirectPageIfExist = function ( affiliatePage ) {
            return {
                action: 'query',
                titles: affiliatePage,
                redirects: null
            };
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

        sendEmailToMEStaff = function ( subject, text ) {
            var params = {
                action: 'emailuser',
                target: 'DNdubane (WMF)',
                subject: '[WADP] ' + subject,
                text: text,
                format: 'json'
            },
            api = new mw.Api();

            api.postWithToken( 'csrf', params ).then( function ( data ) {
                // No op
            } );
        };

        /**
         * OOC level 2 talk page message generator
         *
         * @param {Number} currentYear
         * @param {Date} reportingDueDate
         *
         * @return {String}
         */
        oocLevel2MessageGenerator = function ( currentYear, reportingDueDate ) {
            return "\n\n== Notification of Affiliate Expiration - Renewal pending submission of reporting ==\n\n" +
            "Greetings group contacts,\n\n" +
            "This is a notification to bring to your attention that your organization is currently past due on its required annual reporting. Wikimedia Affiliates are required to submit an annual activity report covering the entirety of the 12-month agreement period in order to prompt review for a renewal.  Reports must be written in English, posted to meta via the  [[Wikimedia Affiliates Data Portal]].\n\n" +
            "This page is used to track how organizations and groups are meeting reporting requirements described in their agreements with the Wikimedia Foundation (e.g. chapter agreements, thematic organization agreements, user group agreements).  It is the central place where affiliates can add reports about their activities, share their plans, and even news or social media channels with the wider movement. When new reports are available, organizations and groups should add them to this page to keep their columns up to date.\n\n" +
            "As noted on the meta [[Wikimedia Affiliates Data Portal/Reports|Reports page]], your organization’s '''" + String( currentYear ) + "''' annual reporting became past due in '''" + reportingDueDate.toISOString().slice( 0, 10 ) + "'''. Please be sure to:\n\n" +
            "* Post your '''" + String( currentYear ) + "''' annual reporting to the meta via the  [[Wikimedia Affiliates Data Portal]] as soon as possible to return to compliance with your user group agreement.\n\n" +
            "* Check that your group’s page is also up to date with past report links for historical record-keeping, and\n\n" +
            "* Please send an email to [[Mailing_lists/Wikimedia_Announce|Wikimedia-l]] in order to share with a movement-wide audience.\n\n" +
            "If you have any questions or need any further guidance, please don’t hesitate to reach out to wadportal{{at}}wikimedia.org.<br /><br />'''Best regards''', <br />''Wikimedia Affiliates Data Portal''\n\n";
        };

        /**
         * OOC level log generator.
         *
         * @param {String} group_name
         * @param {String} ooc_level
         * @param {Number} financial_year
         *
         * @return {Object}
         */
        oocLevelLogGenerator = function ( group_name, ooc_level, financial_year ) {
            return {
                group_name: group_name,
                out_of_compliance_level: ooc_level,
                financial_year: financial_year.toString(),
                created_at: new Date().toISOString()
            };
        };

        apiObj = new mw.Api();
        apiObj.get( getActivitiesReports() ).then( function ( activitiesReportsData ) {
            apiObj.get( getOrgInfos() ).then( function ( orgInfosData ) {
                apiObj.get( getOOCLevel() ).then( function( oocLevelsData ) {
                    var activityReport, activitiesReports, orgInfo, orgInfos, currentYear,
                        manifest = [], lastReportingYear, reportingDueDate, todayDate, insertInPlace,
                        latestActivityReport, insertInPlaceOOC, oocLevels, ooc_manifest = [], fiscalYear,
                        oocLevel, affiliateTalkPageContent;

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

                        if ( ( orgInfo.org_type === 'User Group' ||
                                orgInfo.org_type === 'Chapter' ||
                                orgInfo.org_type === 'Thematic Organization' )
                            && orgInfo.recognition_status === 'recognised'
                            && orgInfo.me_bypass_ooc_autochecks === 'No'
                        ) {
                            currentYear = new Date().getFullYear();
                            if ( typeof latestActivityReport === 'object' && latestActivityReport !== null ) {
                                lastReportingYear = parseInt( latestActivityReport.end_date.split( "/" )[2] );
                            } else if ( latestActivityReport.end_date === '01/01/2000' ) {
                                lastReportingYear = 'nlr';
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

                            /**== OOC: Level 0 to Level 1 algorithm ==*/
                            // check if activities report is not yet submitted : dateSlice[1] is reporting month
                            if ( todayDate.valueOf() > reportingDueDate.valueOf() &&
                                lastReportingYear !== 'nlr' &&
                                lastReportingYear < currentYear &&
                                orgInfo.out_of_compliance_level < '1'
                            ) {
                                orgInfo.out_of_compliance_level = '1';
                                oocLevel = oocLevelLogGenerator( orgInfo.group_name, '1', currentYear );
                                ooc_manifest.push( oocLevel );
                            }
                            /**== OOC: Level 1 back to Level 0 algorithm ==*/
                            else if ( todayDate.valueOf() > reportingDueDate.valueOf() &&
                                lastReportingYear !== 'nlr' &&
                                lastReportingYear === currentYear &&
                                orgInfo.out_of_compliance_level === '1'
                            ) {
                                var subject, text;

                                orgInfo.out_of_compliance_level = '0';
                                oocLevel = oocLevelLogGenerator( orgInfo.group_name, '0', currentYear );
                                ooc_manifest.push( oocLevel );

                                // Send M&E staff a log of the activity
                                subject = "Level 1 back to level 0";
                                text = orgInfo.group_name;
                                sendEmailToMEStaff( subject, text );
                            }
                            /**== OOC: Level 1 to Level 2 algorithm for UG ==*/
                            else if ( orgInfo.org_type === 'User Group' &&
                                lastReportingYear < currentYear &&
                                lastReportingYear !== 'nlr' &&
                                // check if days difference is greater than 30 days
                                ( ( todayDate.getTime() - reportingDueDate.getTime() ) / (1000 * 60 * 60 * 24) ) > 30 &&
                                orgInfo.uptodate_reporting === "Tick" &&
                                orgInfo.out_of_compliance_level === '1'
                            ) {
                                orgInfo.out_of_compliance_level = '2';
                                orgInfo.uptodate_reporting = "Cross";

                                oocLevel = oocLevelLogGenerator( orgInfo.group_name, '2', currentYear );
                                ooc_manifest.push( oocLevel );

                                /** After writing to DB, post a talk page notification */
                                ( function ( orgInfo, currentYear, reportingDueDate ) {
                                    apiObj.get( getAffiliateRedirectPageIfExist( orgInfo.group_name ) ).then( function ( data ) {
                                        var redirectsTo;

                                        if ( data.query.hasOwnProperty( "redirects" ) ) {
                                            redirectsTo = data.query.redirects[0].to;
                                        } else {
                                            redirectsTo = orgInfo.group_name;
                                        }
                                        // NOTE: if the affiliate page is a redirect, use the correct target page
                                        apiObj.get( getAffiliateTalkPageWikiText( redirectsTo ) ).then( function ( wikiPageContent ) {
                                            affiliateTalkPageContent = parseAndExtractAffiliateTalkPageContent(
                                                wikiPageContent.query.pages
                                            ) + oocLevel2MessageGenerator( currentYear, reportingDueDate );

                                            // Post notification to talk page of affiliate
                                            apiObj.postWithToken(
                                                'csrf',
                                                {
                                                    action: 'edit',
                                                    nocreate: true,
                                                    summary: '[Automated] Out of compliance check notification message: ' + orgInfo.group_name,
                                                    // title: 'User:DAlangi (WMF)/Sandbox/OOC post notif messages', [used for testing]
                                                    title: 'Talk:' + redirectsTo,
                                                    text: affiliateTalkPageContent,
                                                    contentmodel: 'wikitext'
                                                }
                                            );
                                        } );
                                    } );
                                } )( orgInfo, currentYear, reportingDueDate );
                            }
                            /**== OOC: Level 1 to Level 2 algorithm for Chaps ==*/
                            else if ( ( orgInfo.org_type === 'Chapter' || orgInfo.org_type === 'Thematic Organization' ) &&
                                lastReportingYear < currentYear &&
                                lastReportingYear !== 'nlr' &&
                                // check if days difference is greater than 30 days
                                ( ( todayDate.getTime() - reportingDueDate.getTime() ) / (1000 * 60 * 60 * 24) ) > 120 &&
                                orgInfo.uptodate_reporting === "Tick" &&
                                orgInfo.out_of_compliance_level === '1'
                            ) {
                                orgInfo.out_of_compliance_level = '2';
                                orgInfo.uptodate_reporting = "Cross";

                                oocLevel = oocLevelLogGenerator( orgInfo.group_name, '2', currentYear );
                                ooc_manifest.push( oocLevel );

                                /** After writing to DB, post a talk page notification */
                                ( function ( orgInfo, currentYear, reportingDueDate ) {
                                    apiObj.get( getAffiliateRedirectPageIfExist( orgInfo.group_name ) ).then( function ( data ) {
                                        var notificationMessage, redirectsTo;

                                        if ( data.query.hasOwnProperty( "redirects" ) ) {
                                            redirectsTo = data.query.redirects[0].to;
                                        } else {
                                            redirectsTo = orgInfo.group_name;
                                        }
                                        // NOTE: if the affiliate page is a redirect, use the correct target page
                                        apiObj.get( getAffiliateTalkPageWikiText( redirectsTo ) ).then( function ( wikiPageContent ) {
                                            affiliateTalkPageContent = parseAndExtractAffiliateTalkPageContent(
                                                wikiPageContent.query.pages
                                            ) + oocLevel2MessageGenerator( currentYear, reportingDueDate );

                                            // Post notification to talk page of affiliate
                                            apiObj.postWithToken(
                                                'csrf',
                                                {
                                                    action: 'edit',
                                                    nocreate: true,
                                                    summary: '[Automated] Out of compliance check notification message: ' + orgInfo.group_name,
                                                    // title: 'User:DAlangi (WMF)/Sandbox/OOC post notif messages', [used for testing]
                                                    title: 'Talk:' + redirectsTo,
                                                    text: affiliateTalkPageContent,
                                                    contentmodel: 'wikitext'
                                                }
                                            );
                                        } );
                                    } );
                                } )( orgInfo, currentYear, reportingDueDate );
                            }
                            /**== Level 2 back to Level 0 algorithm for all affiliates ==*/
                            else if ( lastReportingYear === currentYear &&
                                lastReportingYear !== 'nlr' &&
                                orgInfo.uptodate_reporting === "Cross" &&
                                orgInfo.out_of_compliance_level === '2'
                            ) {
                                orgInfo.uptodate_reporting = "Tick";
                                orgInfo.out_of_compliance_level = '0';

                                oocLevel = oocLevelLogGenerator( orgInfo.group_name, '0', currentYear );
                                ooc_manifest.push( oocLevel );
                            }
                            /**== Level 2 to 3 OOC algorithm (use case) ==*/
                            else if ( orgInfo.out_of_compliance_level === '2' ) {
                                // forward logic: 2 - 3
                                if ( orgInfo.org_type === 'User Group' &&
                                    lastReportingYear < currentYear &&
                                    lastReportingYear !== 'nlr' &&
                                    // check if days difference is greater than 60 days
                                    ( ( todayDate.getTime() - reportingDueDate.getTime() ) / (1000 * 60 * 60 * 24) ) > 60 &&
                                    orgInfo.uptodate_reporting === "Cross"
                                ) {
                                    orgInfo.out_of_compliance_level = '3';

                                    oocLevel = oocLevelLogGenerator( orgInfo.group_name, '3', currentYear );
                                    ooc_manifest.push( oocLevel );
                                }
                                // forward logic: 2 - 3 for chaps & thorgs
                                else if ( ( orgInfo.org_type === 'Chapter' || orgInfo.org_type === 'Thematic Organization' ) &&
                                    lastReportingYear < currentYear &&
                                    lastReportingYear !== 'nlr' &&
                                    // check if days difference is greater than 150 days
                                    ( ( todayDate.getTime() - reportingDueDate.getTime() ) / (1000 * 60 * 60 * 24) ) > 150 &&
                                    orgInfo.uptodate_reporting === "Cross"
                                ) {
                                    orgInfo.out_of_compliance_level = '3';

                                    oocLevel = oocLevelLogGenerator( orgInfo.group_name, '3', currentYear );
                                    ooc_manifest.push( oocLevel );
                                }
                            }
                            // backward logic: 3 - 0 (for UGs)
                            else if ( orgInfo.org_type === 'User Group' &&
                                lastReportingYear === currentYear &&
                                lastReportingYear !== 'nlr' &&
                                // check if days difference is greater than 60 days
                                ( ( todayDate.getTime() - reportingDueDate.getTime() ) / (1000 * 60 * 60 * 24) ) > 60 &&
                                orgInfo.uptodate_reporting === "Cross" &&
                                orgInfo.out_of_compliance_level === '3'
                            ) {
                                orgInfo.uptodate_reporting = "Tick";
                                orgInfo.out_of_compliance_level = '0';

                                oocLevel = oocLevelLogGenerator( orgInfo.group_name, '0', currentYear );
                                ooc_manifest.push( oocLevel );
                            }
                            // backward logic: 3 - 0 for chaps & thorgs
                            else if ( ( orgInfo.org_type === 'Chapter' || orgInfo.org_type === 'Thematic Organization' ) &&
                                lastReportingYear === currentYear &&
                                lastReportingYear !== 'nlr' &&
                                // check if days difference is greater than 150 days
                                ( ( todayDate.getTime() - reportingDueDate.getTime() ) / (1000 * 60 * 60 * 24) ) > 150 &&
                                orgInfo.uptodate_reporting === "Cross" &&
                                orgInfo.out_of_compliance_level === '3'
                            ) {
                                orgInfo.uptodate_reporting = "Tick";
                                orgInfo.out_of_compliance_level = '0';

                                oocLevel = oocLevelLogGenerator( orgInfo.group_name, '0', currentYear );
                                ooc_manifest.push( oocLevel );
                            }
                            /**== Level 3 to 4 OOC algorithm (use case) ==*/
                            else if ( orgInfo.out_of_compliance_level === '3' ) {
                                // forward logic: 3 - 4
                                if ( orgInfo.org_type === 'User Group' &&
                                    lastReportingYear < currentYear &&
                                    lastReportingYear !== 'nlr' &&
                                    // check if days difference is greater than 90 days
                                    ( ( todayDate.getTime() - reportingDueDate.getTime() ) / (1000 * 60 * 60 * 24) ) > 90 &&
                                    orgInfo.uptodate_reporting === "Cross"
                                ) {
                                    orgInfo.out_of_compliance_level = '4';

                                    oocLevel = oocLevelLogGenerator( orgInfo.group_name, '4', currentYear );
                                    ooc_manifest.push( oocLevel );
                                }
                                // forward logic: 3 - 4 for chaps & thorgs
                                else if ( ( orgInfo.org_type === 'Chapter' || orgInfo.org_type === 'Thematic Organization' ) &&
                                    lastReportingYear < currentYear &&
                                    lastReportingYear !== 'nlr' &&
                                    // check if days difference is greater than 180 days
                                    ( ( todayDate.getTime() - reportingDueDate.getTime() ) / (1000 * 60 * 60 * 24) ) > 180 &&
                                    orgInfo.uptodate_reporting === "Cross"
                                ) {
                                    orgInfo.out_of_compliance_level = '4';

                                    oocLevel = oocLevelLogGenerator( orgInfo.group_name, '4', currentYear );
                                    ooc_manifest.push( oocLevel );
                                }
                            }
                            // backward logic: 4 - 0 (for UGs)
                            else if ( orgInfo.org_type === 'User Group' &&
                                lastReportingYear === currentYear &&
                                lastReportingYear !== 'nlr' &&
                                // check if days difference is greater than 90 days
                                ( ( todayDate.getTime() - reportingDueDate.getTime() ) / (1000 * 60 * 60 * 24) ) > 90 &&
                                orgInfo.uptodate_reporting === "Cross" &&
                                orgInfo.out_of_compliance_level === '4'
                            ) {
                                orgInfo.uptodate_reporting = "Tick";
                                orgInfo.out_of_compliance_level = '0';

                                oocLevel = oocLevelLogGenerator( orgInfo.group_name, '0', currentYear );
                                ooc_manifest.push( oocLevel );
                            }
                            // backward logic: 4 - 0 for chaps & thorgs
                            else if ( ( orgInfo.org_type === 'Chapter' || orgInfo.org_type === 'Thematic Organization' ) &&
                                lastReportingYear === currentYear &&
                                lastReportingYear !== 'nlr' &&
                                // check if days difference is greater than 180 days
                                ( ( todayDate.getTime() - reportingDueDate.getTime() ) / (1000 * 60 * 60 * 24) ) > 180 &&
                                orgInfo.uptodate_reporting === "Cross" &&
                                orgInfo.out_of_compliance_level === '4'
                            ) {
                                orgInfo.uptodate_reporting = "Tick";
                                orgInfo.out_of_compliance_level = '0';

                                oocLevel = oocLevelLogGenerator( orgInfo.group_name, '0', currentYear );
                                ooc_manifest.push( oocLevel );
                            }
                            /**== Level 4 to 5 OOC algorithm (use case) ==*/
                            else if ( orgInfo.out_of_compliance_level === '4' ) {
                                // forward logic: 4 - 5
                                if ( orgInfo.org_type === 'User Group' &&
                                    lastReportingYear < currentYear &&
                                    lastReportingYear !== 'nlr' &&
                                    // check if days difference is greater than 120 days
                                    ( ( todayDate.getTime() - reportingDueDate.getTime() ) / (1000 * 60 * 60 * 24) ) > 120 &&
                                    orgInfo.uptodate_reporting === "Cross"
                                ) {
                                    orgInfo.out_of_compliance_level = '5';

                                    oocLevel = oocLevelLogGenerator( orgInfo.group_name, '5', currentYear );
                                    ooc_manifest.push( oocLevel );
                                }
                                // forward logic: 4 - 5 for chaps & thorgs
                                else if ( ( orgInfo.org_type === 'Chapter' || orgInfo.org_type === 'Thematic Organization' ) &&
                                    lastReportingYear < currentYear &&
                                    lastReportingYear !== 'nlr' &&
                                    // check if days difference is greater than 210 days
                                    ( ( todayDate.getTime() - reportingDueDate.getTime() ) / (1000 * 60 * 60 * 24) ) > 210 &&
                                    orgInfo.uptodate_reporting === "Cross"
                                ) {
                                    orgInfo.out_of_compliance_level = '5';
                                    orgInfo.me_bypass_ooc_autochecks = 'Yes';

                                    // **TODO** (special): Send log activity to M&E staff.

                                    oocLevel = oocLevelLogGenerator( orgInfo.group_name, '5', currentYear );
                                    ooc_manifest.push( oocLevel );
                                }
                            }
                            // backward logic: 5 - 0 (for UGs)
                            else if ( orgInfo.org_type === 'User Group' &&
                                lastReportingYear === currentYear &&
                                lastReportingYear !== 'nlr' &&
                                // check if days difference is greater than 90 days
                                ( ( todayDate.getTime() - reportingDueDate.getTime() ) / (1000 * 60 * 60 * 24) ) > 120 &&
                                orgInfo.uptodate_reporting === "Cross" &&
                                orgInfo.out_of_compliance_level === '5'
                            ) {
                                orgInfo.uptodate_reporting = "Tick";
                                orgInfo.out_of_compliance_level = '0';

                                oocLevel = oocLevelLogGenerator( orgInfo.group_name, '0', currentYear );
                                ooc_manifest.push( oocLevel );
                            }
                            // backward logic: 5 - 0 for chaps & thorgs
                            else if ( ( orgInfo.org_type === 'Chapter' || orgInfo.org_type === 'Thematic Organization' ) &&
                                lastReportingYear === currentYear &&
                                lastReportingYear !== 'nlr' &&
                                // check if days difference is greater than 210 days
                                ( ( todayDate.getTime() - reportingDueDate.getTime() ) / (1000 * 60 * 60 * 24) ) > 210 &&
                                orgInfo.uptodate_reporting === "Cross" &&
                                orgInfo.out_of_compliance_level === '5'
                            ) {
                                orgInfo.uptodate_reporting = "Tick";
                                orgInfo.out_of_compliance_level = '0';

                                oocLevel = oocLevelLogGenerator( orgInfo.group_name, '0', currentYear );
                                ooc_manifest.push( oocLevel );
                            }
                            manifest.push( orgInfo );
                        } else {
                            manifest.push( orgInfo );
                        }
                    }

                    // Re-generate the OOC Lua table based on `ooc_manifest`
                    insertInPlaceOOC = 'return {\n';
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

                    // Make changes to the Org Info OOC table as required.
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
                    );
                } );
            } );
        } );
    }

    mw.loader.using( [
        'mediawiki.api',
        'ext.gadget.luaparse'
    ] ).then( init );

}() );
