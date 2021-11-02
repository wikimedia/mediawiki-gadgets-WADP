/**
 * WADP Out of Compliance Checker
 * @author Derick Alangi (WMF)
 */
( function () {
    'use strict';

    var apiObj,
        getReports,
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
        oocLevelLogGenerator,
        postTalkPageNotification;

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
         * Get reports saved in a Lua module
         *
         * @param {string} report_type Report type.
         * @return {Object}
         */
        getReports = function ( report_type ) {
            return {
                action: 'query',
                prop: 'revisions',
                titles: 'Module:' + report_type,
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

        /**
         * @param {String} subject The email subject
         * @param {String} body The email content/body.
         * @param {String} to The M&E staff to send email to.
         */
        sendEmailToMEStaff = function ( subject, body, to ) {
            var params = {
                action: 'emailuser',
                target: to,
                subject: '[WADP] ' + subject,
                text: body,
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
         * @param {String} noticeLevel
         * @param {Number} currentYear
         * @param {Date} reportingDueDate
         *
         * @return {String}
         */
        oocLevel2MessageGenerator = function ( noticeLevel, currentYear, reportingDueDate ) {
            return "\n\n== " + noticeLevel + " Notification of Affiliate Expiration - Renewal pending submission of reporting ==\n\n" +
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
         * @param {String} orgInfo
         * @param {Number} currentYear
         * @param {String} reportingDueDate
         * @param {String} noticeLevel
         */
        postTalkPageNotification = function ( orgInfo, currentYear, reportingDueDate, noticeLevel ) {
            apiObj = new mw.Api();

            apiObj.get( getAffiliateRedirectPageIfExist( orgInfo.group_name ) ).then( function ( data ) {
                var redirectsTo, affiliateTalkPageContent;

                if ( data.query.hasOwnProperty( "redirects" ) ) {
                    redirectsTo = data.query.redirects[0].to;
                } else {
                    redirectsTo = orgInfo.group_name;
                }
                // NOTE: if the affiliate page is a redirect, use the correct target page
                apiObj.get( getAffiliateTalkPageWikiText( redirectsTo ) ).then( function ( wikiPageContent ) {
                    affiliateTalkPageContent = parseAndExtractAffiliateTalkPageContent(
                        wikiPageContent.query.pages
                    ) + oocLevel2MessageGenerator( noticeLevel, currentYear, reportingDueDate );

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

        apiObj.get( getOrgInfos() ).then( function ( orgInfosData ) {
            apiObj.get( getReports( 'Activities_Reports' ) ).then( function ( activitiesReportsData ) {
                apiObj.get( getReports( 'Financial_Reports' ) ).then( function ( financialReportsData ) {
                    apiObj.get( getOOCLevel() ).then( function ( oocLevelsData ) {
                        var activitiesReports,
                            financialReports,
                            orgInfo,
                            orgInfos,
                            currentYear,
                            manifest = [],
                            latestActivityReportYear,
                            latestFinancialReportYear,
                            reportingDueDate,
                            todayDate,
                            insertInPlace,
                            latestActivityReport,
                            latestFinancialReport,
                            insertInPlaceOOC,
                            oocLevels,
                            ooc_manifest = [],
                            fiscalYear,
                            oocLevel,
                            subject,
                            systemActivityLogsToEmail = "",
                            specialAffiliatesToEmailL45 = "",
                            specialAffiliatesToEmailL34 = "",
                            emailDispatcherCount = { "l050": 0, "l34": 0, "l45": 0 };

                        activitiesReports = parseModuleContent( activitiesReportsData.query.pages );
                        financialReports = parseModuleContent( financialReportsData.query.pages );
                        orgInfos = parseModuleContent( orgInfosData.query.pages );
                        oocLevels = parseModuleContent( oocLevelsData.query.pages );

                        // First of all populate the ooc_manifest with existing entries
                        for ( i = 0; i < oocLevels.length; i++ ) {
                            ooc_manifest.push( cleanRawEntry( oocLevels[i].value.fields ) );
                        }

                        for ( var i = 0; i < orgInfos.length; i++ ) {
                            orgInfo = cleanRawEntry( orgInfos[i].value.fields );

                            latestActivityReport = getLatestReport( orgInfo.group_name, activitiesReports );
                            latestFinancialReport = getLatestReport( orgInfo.group_name, financialReports );

                            if ( ( orgInfo.org_type === 'User Group' ||
                                    orgInfo.org_type === 'Chapter' ||
                                    orgInfo.org_type === 'Thematic Organization' )
                                && orgInfo.recognition_status === 'recognised'
                                && orgInfo.me_bypass_ooc_autochecks === 'No'
                            ) {
                                currentYear = new Date().getFullYear();
                                if ( typeof latestActivityReport === 'object' && latestActivityReport !== null ) {
                                    latestActivityReportYear = parseInt( latestActivityReport.end_date.split( "/" )[2] );
                                } else if ( latestActivityReport === null || latestActivityReport.end_date === '01/01/2000' ) {
                                    latestActivityReportYear = 'nlr';
                                }

                                if ( typeof latestFinancialReport === 'object' && latestFinancialReport !== null ) {
                                    latestFinancialReportYear = parseInt( latestFinancialReport.end_date.split( "/" )[2] );
                                } else if ( latestFinancialReport === null || latestFinancialReport.end_date === '01/01/2000' ) {
                                    latestFinancialReportYear = 'nlr';
                                }

                                if ( orgInfo.fiscal_year_end || orgInfo.fiscal_year_end !== '' ) {
                                    fiscalYear = orgInfo.fiscal_year_end.split( "/" );
                                } else if ( orgInfo.agreement_date ) {
                                    fiscalYear = orgInfo.agreement_date.split( "/" );
                                    if ( parseInt( fiscalYear[2] ) === currentYear ) {
                                        // Ignore this affiliate and not check it at all because
                                        // it was just recognized and should be check only the following year.
                                        continue;
                                    }
                                }

                                // generate due date for affiliate to submit report.
                                reportingDueDate = new Date(
                                    currentYear,
                                    parseInt( fiscalYear[1] ) - 1,
                                    parseInt( fiscalYear[0] )
                                );
                                todayDate = new Date();

                                /**== Level 0 - 1: For new affiliates, handle them differently ==*/
                                if ( todayDate.valueOf() > reportingDueDate.valueOf() &&
                                    orgInfo.uptodate_reporting === 'Tick-N' &&
                                    orgInfo.out_of_compliance_level === '0'
                                ) {
                                    orgInfo.out_of_compliance_level = '1';
                                    oocLevel = oocLevelLogGenerator( orgInfo.group_name, '1', currentYear );
                                    ooc_manifest.push( oocLevel );

                                    emailDispatcherCount["l050"]++;
                                    systemActivityLogsToEmail += "\n✦ [New Affiliate] " + orgInfo.group_name + " - OOC level 0 -> 1.";
                                }
                                /**== OOC: Level 0 to Level 1 and back algorithm for all affiliates ==*/
                                if ( todayDate.valueOf() > reportingDueDate.valueOf() &&
                                    latestActivityReportYear !== 'nlr'
                                ) {
                                    if ( latestActivityReportYear < currentYear &&
                                        orgInfo.out_of_compliance_level === '0'
                                    ) {
                                        orgInfo.out_of_compliance_level = '1';
                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '1', currentYear );
                                        ooc_manifest.push( oocLevel );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 0 -> 1.";
                                    } else if ( latestActivityReportYear === currentYear &&
                                        orgInfo.out_of_compliance_level === '1'
                                    ) {
                                        // NOTE: If it's a new affiliate, just mark it directly as compliant.
                                        // And also, it's no longer a new affiliate as it now has at least 1 report.
                                        if ( orgInfo.uptodate_reporting === 'Tick-N' ) {
                                            orgInfo.uptodate_reporting = 'Tick';
                                        }
                                        orgInfo.out_of_compliance_level = '0';
                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '0', currentYear );
                                        ooc_manifest.push( oocLevel );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 1 -> 0.";
                                    }
                                }
                                /**== Level 1 - 2: For UG, Chaps & ThOrgs ==*/
                                if ( latestActivityReportYear < currentYear &&
                                    latestActivityReportYear !== 'nlr' &&
                                    orgInfo.uptodate_reporting === "Tick" &&
                                    orgInfo.out_of_compliance_level === '1'
                                ) {
                                    if ( orgInfo.org_type === 'User Group' &&
                                        orgInfo.legal_entity === 'Yes' &&
                                        // Financial report year can be 1 year off from activity report year.
                                        ( latestActivityReportYear - latestFinancialReportYear ) > 1 &&
                                        // check if days difference is greater than 30 days
                                        ( ( todayDate.getTime() - reportingDueDate.getTime() ) / ( 1000 * 60 * 60 * 24 ) ) > 30
                                    ) {
                                        orgInfo.out_of_compliance_level = '2';
                                        orgInfo.uptodate_reporting = "Cross";

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '2', currentYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, currentYear, reportingDueDate, '(Initial Review)' );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 1 -> 2.";
                                    } else if ( orgInfo.org_type === 'User Group' &&
                                        orgInfo.legal_entity === 'No' &&
                                        // check if days difference is greater than 30 days
                                        ( ( todayDate.getTime() - reportingDueDate.getTime() ) / ( 1000 * 60 * 60 * 24 ) ) > 30
                                    ) {
                                        orgInfo.out_of_compliance_level = '2';
                                        orgInfo.uptodate_reporting = "Cross";

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '2', currentYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, currentYear, reportingDueDate, '(Initial Review)' );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 1 -> 2.";
                                    } else if ( ( orgInfo.org_type === 'Chapter' || orgInfo.org_type === 'Thematic Organization' ) &&
                                        // Financial report year can be 1 year off from activity report year.
                                        ( latestActivityReportYear - latestFinancialReportYear ) < 2 &&
                                        // check if days difference is greater than 120 days
                                        ( ( todayDate.getTime() - reportingDueDate.getTime() ) / ( 1000 * 60 * 60 * 24) ) > 120
                                    ) {
                                        orgInfo.out_of_compliance_level = '2';
                                        orgInfo.uptodate_reporting = "Cross";

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '2', currentYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, currentYear, reportingDueDate, '(Initial Review)' );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 1 -> 2.";
                                    }
                                }
                                /**== Level 1 - 2: For new UGs, Chaps & ThOrgs, handle them differently ==*/
                                if ( orgInfo.uptodate_reporting === "Tick-N" &&
                                    orgInfo.out_of_compliance_level === '1'
                                ) {
                                    if ( orgInfo.org_type === 'User Group' &&
                                        // check if days difference is greater than 30 days
                                        ( ( todayDate.getTime() - reportingDueDate.getTime() ) / ( 1000 * 60 * 60 * 24 ) ) > 30
                                    ) {
                                        orgInfo.out_of_compliance_level = '2';
                                        orgInfo.uptodate_reporting = "Cross-N";

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '2', currentYear );
                                        ooc_manifest.push( oocLevel );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ [New Affiliate] " + orgInfo.group_name + " - OOC level 1 -> 2.";
                                    } else if ( ( orgInfo.org_type === 'Chapter' || orgInfo.org_type === 'Thematic Organization' ) &&
                                        // check if days difference is greater than 120 days
                                        ( ( todayDate.getTime() - reportingDueDate.getTime() ) / ( 1000 * 60 * 60 * 24 ) ) > 120
                                    ) {
                                        orgInfo.out_of_compliance_level = '2';
                                        orgInfo.uptodate_reporting = "Cross-N";

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '2', currentYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, currentYear, reportingDueDate, '(Initial Review)' );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ [New Affiliate] " + orgInfo.group_name + " - OOC level 1 -> 2.";
                                    }
                                }
                                /**== Level 2 back to Level 0 algorithm for all affiliates ==*/
                                if ( latestActivityReportYear === currentYear &&
                                    latestActivityReportYear !== 'nlr' &&
                                    // Also check for new chaps or thorgs and catch them too - 'Cross-N'.
                                    ( orgInfo.uptodate_reporting === "Cross" || orgInfo.uptodate_reporting === "Cross-N" ) &&
                                    orgInfo.out_of_compliance_level === '2'
                                ) {
                                    orgInfo.uptodate_reporting = "Tick";
                                    orgInfo.out_of_compliance_level = '0';

                                    oocLevel = oocLevelLogGenerator( orgInfo.group_name, '0', currentYear );
                                    ooc_manifest.push( oocLevel );

                                    emailDispatcherCount["l050"]++;
                                    systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 2 -> 0.";
                                }
                                /**== Level 2 to 3 OOC algorithm for UGs, Chaps & ThOrgs ==*/
                                if ( orgInfo.out_of_compliance_level === '2' &&
                                    latestActivityReportYear < currentYear &&
                                    latestActivityReportYear !== 'nlr' &&
                                    orgInfo.uptodate_reporting === "Cross"
                                ) {
                                    // forward logic: 2 - 3 for UGs
                                    if ( orgInfo.org_type === 'User Group' &&
                                        orgInfo.legal_entity === 'Yes' &&
                                        // Financial report year can be 1 year off from activity report year.
                                        ( latestActivityReportYear - latestFinancialReportYear ) > 1 &&
                                        // check if days difference is greater than 60 days
                                        ( ( todayDate.getTime() - reportingDueDate.getTime() ) / ( 1000 * 60 * 60 * 24 ) ) > 60
                                    ) {
                                        orgInfo.out_of_compliance_level = '3';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '3', currentYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, currentYear, reportingDueDate, '(First Reminder)' );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 2 -> 3.";
                                    } else if ( orgInfo.org_type === 'User Group' &&
                                        orgInfo.legal_entity === 'No' &&
                                        // check if days difference is greater than 60 days
                                        ( ( todayDate.getTime() - reportingDueDate.getTime() ) / ( 1000 * 60 * 60 * 24 ) ) > 60
                                    ) {
                                        orgInfo.out_of_compliance_level = '3';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '3', currentYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, currentYear, reportingDueDate, '(First Reminder)' );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 2 -> 3.";
                                    }
                                    // forward logic: 2 - 3 for chaps & thorgs
                                    else if ( ( orgInfo.org_type === 'Chapter' || orgInfo.org_type === 'Thematic Organization' ) &&
                                        // Financial report year can be 1 year off from activity report year.
                                        ( latestActivityReportYear - latestFinancialReportYear ) < 2 &&
                                        // check if days difference is greater than 150 days
                                        ( ( todayDate.getTime() - reportingDueDate.getTime() ) / ( 1000 * 60 * 60 * 24 ) ) > 150
                                    ) {
                                        orgInfo.out_of_compliance_level = '3';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '3', currentYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, currentYear, reportingDueDate, '(First Reminder)' );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 2 -> 3.";
                                    }
                                }
                                /**== Level 2 - 3 for new affiliates (UGs, Chaps & ThOrgs) ==*/
                                if ( orgInfo.out_of_compliance_level === '2' &&
                                    orgInfo.uptodate_reporting === "Cross-N"
                                ) {
                                    if ( orgInfo.org_type === 'User Group' &&
                                        orgInfo.legal_entity === 'Yes' &&
                                        // Financial report year can be 1 year off from activity report year.
                                        ( latestActivityReportYear - latestFinancialReportYear ) < 2 &&
                                        // check if days difference is greater than 60 days
                                        ( ( todayDate.getTime() - reportingDueDate.getTime() ) / ( 1000 * 60 * 60 * 24 ) ) > 60
                                    ) {
                                        orgInfo.out_of_compliance_level = '3';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '3', currentYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, currentYear, reportingDueDate, '(First Reminder)' );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ [New Affiliate] " + orgInfo.group_name + " - OOC level 2 -> 3.";
                                    } else if ( orgInfo.org_type === 'User Group' &&
                                        orgInfo.legal_entity === 'No' &&
                                        // check if days difference is greater than 60 days
                                        ( ( todayDate.getTime() - reportingDueDate.getTime() ) / ( 1000 * 60 * 60 * 24 ) ) > 60
                                    ) {
                                        orgInfo.out_of_compliance_level = '3';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '3', currentYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, currentYear, reportingDueDate, '(First Reminder)' );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ [New Affiliate] " + orgInfo.group_name + " - OOC level 2 -> 3.";
                                    } else if ( ( orgInfo.org_type === 'Chapter' || orgInfo.org_type === 'Thematic Organization' ) &&
                                        // check if days difference is greater than 150 days
                                        ( ( todayDate.getTime() - reportingDueDate.getTime() ) / ( 1000 * 60 * 60 * 24 ) ) > 150
                                    ) {
                                        orgInfo.out_of_compliance_level = '3';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '3', currentYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, currentYear, reportingDueDate, '(First Reminder)' );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ [New Affiliate] " + orgInfo.group_name + " - OOC level 2 -> 3.";
                                    }
                                }
                                /**== Level 3 - 0: Backward logic for all affiliates: UGs, Chaps & ThOrgs ==*/
                                if ( latestActivityReportYear === currentYear &&
                                    latestActivityReportYear !== 'nlr' &&
                                    ( orgInfo.uptodate_reporting === "Cross" || orgInfo.uptodate_reporting === "Cross-N" ) &&
                                    orgInfo.out_of_compliance_level === '3'
                                ) {
                                    orgInfo.uptodate_reporting = "Tick";
                                    orgInfo.out_of_compliance_level = '0';

                                    oocLevel = oocLevelLogGenerator( orgInfo.group_name, '0', currentYear );
                                    ooc_manifest.push( oocLevel );

                                    emailDispatcherCount["l050"]++;
                                    systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 3 -> 0.";
                                }
                                /**== Level 3 to 4 OOC algorithm for all affiliates (UGs, Chaps, ThOrgs) ==*/
                                if ( orgInfo.out_of_compliance_level === '3' &&
                                    latestActivityReportYear < currentYear &&
                                    latestActivityReportYear !== 'nlr' &&
                                    orgInfo.uptodate_reporting === "Cross"
                                ) {
                                    if ( orgInfo.org_type === 'User Group' &&
                                        orgInfo.legal_entity === 'Yes' &&
                                        // Financial report year can be 1 year off from activity report year.
                                        ( latestActivityReportYear - latestFinancialReportYear ) > 1 &&
                                        // check if days difference is greater than 90 days
                                        ( ( todayDate.getTime() - reportingDueDate.getTime() ) / ( 1000 * 60 * 60 * 24 ) ) > 90
                                    ) {
                                        orgInfo.out_of_compliance_level = '4';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '4', currentYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, currentYear, reportingDueDate, '(Second Reminder)' );

                                        /** Email list of Chaps & ThOrgs from level 3 - 4 to M&E staff. */
                                        emailDispatcherCount["l34"]++;
                                        specialAffiliatesToEmailL34 += "\n✦ " + orgInfo.group_name;

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 3 -> 4.";
                                    } else if ( orgInfo.org_type === 'User Group' &&
                                        orgInfo.legal_entity === 'No' &&
                                        // check if days difference is greater than 90 days
                                        ( ( todayDate.getTime() - reportingDueDate.getTime() ) / ( 1000 * 60 * 60 * 24 ) ) > 90
                                    ) {
                                        orgInfo.out_of_compliance_level = '4';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '4', currentYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, currentYear, reportingDueDate, '(Second Reminder)' );

                                        /** Email list of Chaps & ThOrgs from level 3 - 4 to M&E staff. */
                                        emailDispatcherCount["l34"]++;
                                        specialAffiliatesToEmailL34 += "\n✦ " + orgInfo.group_name;

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 3 -> 4.";
                                    } else if ( ( orgInfo.org_type === 'Chapter' || orgInfo.org_type === 'Thematic Organization' ) &&
                                        // Financial report year can be 1 year off from activity report year.
                                        ( latestActivityReportYear - latestFinancialReportYear ) < 2 &&
                                        // check if days difference is greater than 180 days
                                        ( ( todayDate.getTime() - reportingDueDate.getTime() ) / ( 1000 * 60 * 60 * 24 ) ) > 180
                                    ) {
                                        orgInfo.out_of_compliance_level = '4';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '4', currentYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, currentYear, reportingDueDate, '(Second Reminder)' );

                                        /** Email list of Chaps & ThOrgs from level 3 - 4 to M&E staff. */
                                        emailDispatcherCount["l34"]++;
                                        specialAffiliatesToEmailL34 += "\n✦ " + orgInfo.group_name;

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 3 -> 4.";
                                    }
                                }
                                /**== Level 3 - 4 for all **new** affiliates (UGs, Chaps & ThOrgs) */
                                if ( orgInfo.out_of_compliance_level === '3' &&
                                    orgInfo.uptodate_reporting === "Cross-N"
                                ) {
                                    if ( orgInfo.org_type === 'User Group' &&
                                        // check if days difference is greater than 90 days
                                        ( ( todayDate.getTime() - reportingDueDate.getTime() ) / ( 1000 * 60 * 60 * 24 ) ) > 90
                                    ) {
                                        orgInfo.out_of_compliance_level = '4';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '4', currentYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, currentYear, reportingDueDate, '(Second Reminder)' );

                                        /** Email list of Chaps & ThOrgs from level 3 - 4 to M&E staff. */
                                        emailDispatcherCount["l34"]++;
                                        specialAffiliatesToEmailL34 += "\n✦ " + orgInfo.group_name;

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ [New Affiliate] " + orgInfo.group_name + " - OOC level 3 -> 4.";
                                    } else if ( ( orgInfo.org_type === 'Chapter' || orgInfo.org_type === 'Thematic Organization' ) &&
                                        // check if days difference is greater than 180 days
                                        ( ( todayDate.getTime() - reportingDueDate.getTime() ) / ( 1000 * 60 * 60 * 24 ) ) > 180
                                    ) {
                                        orgInfo.out_of_compliance_level = '4';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '4', currentYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, currentYear, reportingDueDate, '(Second Reminder)' );

                                        /** Email list of Chaps & ThOrgs from level 3 - 4 to M&E staff. */
                                        emailDispatcherCount["l34"]++;
                                        specialAffiliatesToEmailL34 += "\n✦ " + orgInfo.group_name;

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ [New Affiliate] " + orgInfo.group_name + " - OOC level 3 -> 4.";
                                    }
                                }
                                /**== Level 4 - 0: backward logic for all affiliates ==*/
                                if ( latestActivityReportYear === currentYear &&
                                    latestActivityReportYear !== 'nlr' &&
                                    ( orgInfo.uptodate_reporting === "Cross" || orgInfo.uptodate_reporting === "Cross-N" ) &&
                                    orgInfo.out_of_compliance_level === '4'
                                ) {
                                    orgInfo.uptodate_reporting = "Tick";
                                    orgInfo.out_of_compliance_level = '0';

                                    oocLevel = oocLevelLogGenerator( orgInfo.group_name, '0', currentYear );
                                    ooc_manifest.push( oocLevel );

                                    emailDispatcherCount["l050"]++;
                                    systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 4 -> 0.";
                                }
                                /**== Level 4 to 5 OOC algorithm for UGs, Chaps & ThOrgs ==*/
                                if ( orgInfo.out_of_compliance_level === '4' &&
                                    latestActivityReportYear < currentYear &&
                                    latestActivityReportYear !== 'nlr' &&
                                    orgInfo.uptodate_reporting === "Cross"
                                ) {
                                    // forward logic: 4 - 5
                                    if ( orgInfo.org_type === 'User Group' &&
                                        orgInfo.legal_entity === 'Yes' &&
                                        // Financial report year can be 1 year off from activity report year.
                                        ( latestActivityReportYear - latestFinancialReportYear ) > 1 &&
                                        // check if days difference is greater than 120 days
                                        ( ( todayDate.getTime() - reportingDueDate.getTime() ) / ( 1000 * 60 * 60 * 24 ) ) > 120
                                    ) {
                                        orgInfo.out_of_compliance_level = '5';
                                        orgInfo.me_bypass_ooc_autochecks = 'Yes';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '5', currentYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, currentYear, reportingDueDate, '(Third Reminder)' );

                                        /** Email list of UG from level 4 - 5 to M&E staff. */
                                        emailDispatcherCount["l45"]++;
                                        specialAffiliatesToEmailL45 += "\n✦ " + orgInfo.group_name;

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 4 -> 5.";
                                    } else if ( orgInfo.org_type === 'User Group' &&
                                        orgInfo.legal_entity === 'No' &&
                                        // check if days difference is greater than 120 days
                                        ( ( todayDate.getTime() - reportingDueDate.getTime() ) / ( 1000 * 60 * 60 * 24 ) ) > 120
                                    ) {
                                        orgInfo.out_of_compliance_level = '5';
                                        orgInfo.me_bypass_ooc_autochecks = 'Yes';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '5', currentYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, currentYear, reportingDueDate, '(Third Reminder)' );

                                        /** Email list of UG from level 4 - 5 to M&E staff. */
                                        emailDispatcherCount["l45"]++;
                                        specialAffiliatesToEmailL45 += "\n✦ " + orgInfo.group_name;

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 4 -> 5.";
                                    }
                                    // forward logic: 4 - 5 for chaps & thorgs
                                    else if ( ( orgInfo.org_type === 'Chapter' || orgInfo.org_type === 'Thematic Organization' ) &&
                                        // Financial report year can be 1 year off from activity report year.
                                        ( latestActivityReportYear - latestFinancialReportYear ) < 2 &&
                                        // check if days difference is greater than 210 days
                                        ( ( todayDate.getTime() - reportingDueDate.getTime() ) / ( 1000 * 60 * 60 * 24 ) ) > 210
                                    ) {
                                        orgInfo.out_of_compliance_level = '5';
                                        orgInfo.me_bypass_ooc_autochecks = 'Yes';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '5', currentYear );
                                        ooc_manifest.push(oocLevel);

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, currentYear, reportingDueDate, '(Third Reminder)' );

                                        /** Email list of Chaps & ThOrgs from level 4 - 5 to M&E staff. */
                                        emailDispatcherCount["l45"]++;
                                        specialAffiliatesToEmailL45 += "\n✦ " + orgInfo.group_name;

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 4 -> 5.";
                                    }
                                }
                                /**== Level 4 - 5: For all new affiliates ==*/
                                if ( orgInfo.out_of_compliance_level === '4' &&
                                    orgInfo.uptodate_reporting === "Cross-N"
                                ) {
                                    if ( orgInfo.org_type === 'User Group' &&
                                        // check if days difference is greater than 120 days
                                        ( ( todayDate.getTime() - reportingDueDate.getTime() ) / ( 1000 * 60 * 60 * 24 ) ) > 120
                                    ) {
                                        orgInfo.out_of_compliance_level = '5';
                                        orgInfo.me_bypass_ooc_autochecks = 'Yes';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '5', currentYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, currentYear, reportingDueDate, '(Third Reminder)' );

                                        /** Email list of UG from level 4 - 5 to M&E staff. */
                                        emailDispatcherCount["l45"]++;
                                        specialAffiliatesToEmailL45 += "\n✦ [New Affiliate] " + orgInfo.group_name;

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 4 -> 5.";
                                    } else if ( ( orgInfo.org_type === 'Chapter' || orgInfo.org_type === 'Thematic Organization' ) &&
                                        // check if days difference is greater than 210 days
                                        ( ( todayDate.getTime() - reportingDueDate.getTime() ) / ( 1000 * 60 * 60 * 24 ) ) > 210
                                    ) {
                                        orgInfo.out_of_compliance_level = '5';
                                        orgInfo.me_bypass_ooc_autochecks = 'Yes';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '5', currentYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, currentYear, reportingDueDate, '(Third Reminder)' );

                                        /** Email list of Chaps & ThOrgs from level 4 - 5 to M&E staff. */
                                        emailDispatcherCount["l45"]++;
                                        specialAffiliatesToEmailL45 += "\n✦ " + orgInfo.group_name;

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ [New Affiliate] " + orgInfo.group_name + " - OOC level 4 -> 5.";
                                    }
                                }
                                manifest.push( orgInfo );
                            } else {
                                manifest.push( orgInfo );
                            }
                        }

                        if ( emailDispatcherCount["l34"] > 0) {
                            // Send aggregate email to M&E staff (L3-4)
                            subject = "New affiliates at level 4 of OOC Checks";
                            sendEmailToMEStaff( subject, specialAffiliatesToEmailL34, 'DNdubane (WMF)' );
                            // loop back address -- for backup purposes and monitoring
                            sendEmailToMEStaff( subject, specialAffiliatesToEmailL34, 'DAlangi (WMF)' );
                        }

                        if ( emailDispatcherCount["l45"] > 0 ) {
                            // Send aggregate email to M&E staff (L4-5)
                            subject = "New affiliates at level 5 of OOC Checks";
                            sendEmailToMEStaff( subject, specialAffiliatesToEmailL45, 'DNdubane (WMF)' );
                            // loop back address -- for backup purposes and monitoring
                            sendEmailToMEStaff( subject, specialAffiliatesToEmailL45, 'DAlangi (WMF)' );
                        }

                        if ( emailDispatcherCount["l050"] > 0 ) {
                            // Send aggregate email to M&E staff (L0-5 and back)
                            subject = "[General] Compliance sweep of all Wikimedia Affiliates";
                            sendEmailToMEStaff( subject, systemActivityLogsToEmail, 'DNdubane (WMF)' );
                            // loop back address -- for backup purposes and monitoring
                            sendEmailToMEStaff( subject, systemActivityLogsToEmail, 'DAlangi (WMF)' );
                        }

                        // Re-generate the OOC Lua table based on `ooc_manifest`
                        insertInPlaceOOC = 'return {\n';
                        for ( i = 0; i < ooc_manifest.length; i++ ) {
                            insertInPlaceOOC += '\t{\n';
                            if ( ooc_manifest[i].group_name ) {
                                insertInPlaceOOC += generateKeyValuePair(
                                    'group_name',
                                    ooc_manifest[i].group_name
                                );
                            }
                            if ( ooc_manifest[i].out_of_compliance_level ) {
                                insertInPlaceOOC += generateKeyValuePair(
                                    'out_of_compliance_level',
                                    ooc_manifest[i].out_of_compliance_level
                                );
                            }
                            if ( ooc_manifest[i].financial_year ) {
                                insertInPlaceOOC += generateKeyValuePair(
                                    'financial_year',
                                    ooc_manifest[i].financial_year
                                );
                            }
                            if ( ooc_manifest[i].created_at ) {
                                insertInPlaceOOC += generateKeyValuePair(
                                    'created_at',
                                    ooc_manifest[i].created_at
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
                                bot: true,
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
                            if ( manifest[i].unique_id ) {
                                insertInPlace += generateKeyValuePair(
                                    'unique_id',
                                    manifest[i].unique_id
                                );
                            }
                            if ( manifest[i].affiliate_code ) {
                                insertInPlace += generateKeyValuePair(
                                    'affiliate_code',
                                    manifest[i].affiliate_code
                                );
                            }
                            if ( manifest[i].group_name ) {
                                insertInPlace += generateKeyValuePair(
                                    'group_name',
                                    manifest[i].group_name
                                );
                            }
                            if ( manifest[i].org_type ) {
                                insertInPlace += generateKeyValuePair(
                                    'org_type',
                                    manifest[i].org_type
                                );
                            }
                            if ( manifest[i].region ) {
                                insertInPlace += generateKeyValuePair(
                                    'region',
                                    manifest[i].region
                                );
                            }
                            if ( manifest[i].group_country ) {
                                insertInPlace += generateKeyValuePair(
                                    'group_country',
                                    manifest[i].group_country
                                );
                            }
                            if ( !manifest[i].legal_entity && manifest[i].org_type === 'User Group' ) {
                                insertInPlace += generateKeyValuePair(
                                    'legal_entity',
                                    'No'
                                );
                            } else if ( manifest[i].legal_entity && manifest[i].org_type === 'User Group' ) {
                                insertInPlace += generateKeyValuePair(
                                    'legal_entity',
                                    manifest[i].legal_entity
                                );
                            } else {
                                insertInPlace += generateKeyValuePair(
                                    'legal_entity',
                                    'Yes'
                                );
                            }
                            if ( manifest[i].mission_changed ) {
                                insertInPlace += generateKeyValuePair(
                                    'mission_changed',
                                    manifest[i].mission_changed
                                );
                            }
                            if ( manifest[i].explanation ) {
                                insertInPlace += generateKeyValuePair(
                                    'explanation',
                                    manifest[i].explanation
                                );
                            }
                            if ( manifest[i].group_page ) {
                                insertInPlace += generateKeyValuePair(
                                    'group_page',
                                    manifest[i].group_page.trim()
                                );
                            }
                            if ( manifest[i].member_count ) {
                                insertInPlace += generateKeyValuePair(
                                    'member_count',
                                    manifest[i].member_count
                                );
                            }
                            if ( manifest[i].facebook ) {
                                insertInPlace += generateKeyValuePair(
                                    'facebook',
                                    manifest[i].facebook.trim()
                                );
                            }
                            if ( manifest[i].twitter ) {
                                insertInPlace += generateKeyValuePair(
                                    'twitter',
                                    manifest[i].twitter.trim()
                                );
                            }
                            if ( manifest[i].other ) {
                                insertInPlace += generateKeyValuePair(
                                    'other',
                                    manifest[i].other.trim()
                                );
                            }
                            if ( manifest[i].dm_structure ) {
                                insertInPlace += generateKeyValuePair(
                                    'dm_structure',
                                    manifest[i].dm_structure
                                );
                            }
                            if ( manifest[i].board_contacts ) {
                                insertInPlace += generateKeyValuePair(
                                    'board_contacts',
                                    manifest[i].board_contacts
                                );
                            }
                            if ( manifest[i].agreement_date ) {
                                insertInPlace += generateKeyValuePair(
                                    'agreement_date',
                                    manifest[i].agreement_date
                                );
                            }
                            if ( manifest[i].fiscal_year_start ) {
                                insertInPlace += generateKeyValuePair(
                                    'fiscal_year_start',
                                    manifest[i].fiscal_year_start
                                );
                            } else {
                                insertInPlace += generateKeyValuePair(
                                    'fiscal_year_start',
                                    ''
                                );
                            }
                            if ( manifest[i].fiscal_year_end ) {
                                insertInPlace += generateKeyValuePair(
                                    'fiscal_year_end',
                                    manifest[i].fiscal_year_end
                                );
                            } else {
                                insertInPlace += generateKeyValuePair(
                                    'fiscal_year_end',
                                    ''
                                );
                            }
                            if ( manifest[i].uptodate_reporting ) {
                                insertInPlace += generateKeyValuePair(
                                    'uptodate_reporting',
                                    manifest[i].uptodate_reporting
                                );
                            }
                            if ( manifest[i].notes_on_reporting ) {
                                insertInPlace += generateKeyValuePair(
                                    'notes_on_reporting',
                                    manifest[i].notes_on_reporting
                                );
                            } else {
                                insertInPlace += generateKeyValuePair(
                                    'notes_on_reporting',
                                    ''
                                );
                            }
                            if ( manifest[i].recognition_status ) {
                                insertInPlace += generateKeyValuePair(
                                    'recognition_status',
                                    manifest[i].recognition_status
                                );
                            }
                            if ( manifest[i].me_bypass_ooc_autochecks ) {
                                insertInPlace += generateKeyValuePair(
                                    'me_bypass_ooc_autochecks',
                                    manifest[i].me_bypass_ooc_autochecks
                                );
                            }
                            if ( manifest[i].out_of_compliance_level ) {
                                insertInPlace += generateKeyValuePair(
                                    'out_of_compliance_level',
                                    manifest[i].out_of_compliance_level
                                );
                            }
                            if ( manifest[i].derecognition_date ) {
                                insertInPlace += generateKeyValuePair(
                                    'derecognition_date',
                                    manifest[i].derecognition_date
                                );
                            }
                            if ( manifest[i].derecognition_note ) {
                                insertInPlace += generateKeyValuePair(
                                    'derecognition_note',
                                    manifest[i].derecognition_note
                                );
                            }
                            if ( manifest[i].dos_stamp ) {
                                insertInPlace += generateKeyValuePair(
                                    'dos_stamp',
                                    manifest[i].dos_stamp
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
                                bot: true,
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
        } );
    }

    mw.loader.using( [
        'mediawiki.api',
        'ext.gadget.luaparse'
    ] ).then( init );

}() );
