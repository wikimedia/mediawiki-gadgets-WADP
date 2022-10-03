/**
 * WADP Out of Compliance Checker
 * @author Derick Alangi (WMF)
 */
( function () {
    'use strict';

    var apiObj,
        generateKeyValuePair,
        sanitizeInput,
        parseModuleContent,
        cleanRawEntry,
        getLatestReport,
        compareDates,
        getAffiliateTalkPageWikiText,
        parseAndExtractAffiliateTalkPageContent,
        getAffiliateRedirectPageIfExist,
        oocLevel1MessageGenerator,
        oocLevel2MessageGenerator,
        sendEmailToMEStaff,
        oocLevelLogGenerator,
        postTalkPageNotification,
        getModuleContent,
        resetReportingDueDate,
        dateFormatOptions,
        // If an affiliate's distance between its activity and financial report year
        // is less than the offset below, then the affiliate is considered compliant
        // provided that the activity report is the latest.
        AR_FR_YEAR_OFFSET = 2;

    dateFormatOptions = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    };

    function init() {
        /**
         * @param {string} affiliate
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
         * @param {string} sourceblob The wikitext for the page
         * @returns {string} The wiki page content only from API request
         */
        parseAndExtractAffiliateTalkPageContent = function ( sourceblob ) {
            var i, raw;
            for ( i in sourceblob ) {  // should only be one result
                raw = sourceblob[ i ].revisions[ 0 ][ '*' ];
                return raw;
            }
        };

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
         * @param {string} affiliateName
         * @param {array[]} reports
         * @returns {array}
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
         * @param {string} date1
         * @param {string} date2
         * @return {number} 0 if dates are equal, 1 if date1 > date2 and -1 if date1 < date2
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
         * @param {string} affiliatePage Group name
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
            try {
                return s
                    .replace( /\\/g, '\\\\' )
                    .replace( /\n/g, '<br />' );
            }
            catch ( e ) {
                console.error(e);
                return '';
            }
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
         * @param {string} subject The email subject
         * @param {string} body The email content/body.
         * @param {string} to The M&E staff to send email to.
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
         * @param {string} currentReportingDueDate The current reporting due date of the affiliate
         *
         * @return {string} New reporting due date
         */
        resetReportingDueDate = function ( currentReportingDueDate ) {
            var currentYear = new Date().getFullYear(), nextReportingDueDate,
                curReportingDueDate, curReportingDueDateYear, newDate;

            curReportingDueDate = currentReportingDueDate.substring( 0, 10 ).split( "-" );
            curReportingDueDateYear = parseInt( curReportingDueDate[0] );

            if ( curReportingDueDateYear === currentYear  ) {
                newDate = String(currentYear + 1) + '-' + curReportingDueDate[1] + '-' + curReportingDueDate[2];
                nextReportingDueDate = new Date( newDate ).toISOString();
            } else if ( curReportingDueDateYear < currentYear ) {
                newDate = String( currentYear ) + '-' + curReportingDueDate[1] + '-' + curReportingDueDate[2];
                nextReportingDueDate = new Date( newDate ).toISOString();
            }

            return nextReportingDueDate;
        };

        /**
         * OOC level 2 talk page message generator
         *
         * @param {string} noticeLevel
         * @param {number} currentYear
         * @param {Date} reportingDueDate
         * @param {string} groupContact1
         * @param {string} groupContact2
         * @param {number} days
         *
         * @return {string}
         */
        oocLevel1MessageGenerator = function (
            noticeLevel,
            currentYear,
            reportingDueDate,
            groupContact1,
            groupContact2,
            days
        ) {
            var groupContactGreetings;

            if ( groupContact1 && groupContact2 ) {
                groupContactGreetings = "[[" +
                    groupContact1 + "|" + groupContact1.substring(5) +
                    "]], [[" + groupContact2 + "|" + groupContact2.substring(5) +
                    "]]";
            } else if ( groupContact1 && !groupContact2 ) {
                groupContactGreetings = "[[" + groupContact1 + "|" + groupContact1.substring(5) + "]]";
            } else if ( !groupContact1 && groupContact2 ) {
                groupContactGreetings = "[[" + groupContact2 + "|" + groupContact2.substring(5) + "]]";
            } else {
                groupContactGreetings = "group contacts";
            }

            return "\n\n== " + noticeLevel + " Notification of upcoming reporting due date ==\n\n" +
                "Greetings " + groupContactGreetings + ",\n\n" +
                "This is a notification to bring to your attention that your organization reporting date is coming up in " + String( days ) + " day(s). Wikimedia Affiliates are required to submit an annual activity report covering the entirety of the 12-month agreement period in order to prompt review for a renewal.  Reports must be written in English, posted to meta via the  [[Wikimedia Affiliates Data Portal]].\n\n" +
                "This page is used to track how organizations and groups are meeting reporting requirements described in their agreements with the Wikimedia Foundation (e.g. chapter agreements, thematic organization agreements, user group agreements).  It is the central place where affiliates can add reports about their activities, share their plans, and even news or social media channels with the wider movement. When new reports are available, organizations and groups should add them to this page to keep their columns up to date.\n\n" +
                "As noted on the meta [[Wikimedia Affiliates Data Portal/Reports|Reports page]], your organization’s '''" + String( currentYear ) + "''' annual reporting will be due in '''" + reportingDueDate.toISOString().slice( 0, 10 ) + "'''. Please be sure to:\n\n" +
                "* Post your '''" + String( currentYear ) + "''' annual reporting to the meta via the  [[Wikimedia Affiliates Data Portal]] as soon as possible to return to compliance with your user group agreement.\n\n" +
                "* Check that your group’s page is also up to date with past report links for historical record-keeping, and\n\n" +
                "* Please send an email to [[Mailing_lists/Wikimedia_Announce|Wikimedia-l]] in order to share with a movement-wide audience.\n\n" +
                "If you have any questions or need any further guidance, please don’t hesitate to reach out to wadportal{{at}}wikimedia.org.<br /><br />'''Best regards''', <br />''[[User:DNdubane_(WMF)|Dumisani Ndubane]]''\n\n" +
                "<br />''Wikimedia Affiliates Data Portal''\n\n" + new Date().toLocaleDateString("en-US", dateFormatOptions) + "\n\n";
        };

        /**
         * OOC level 2 talk page message generator
         *
         * @param {string} noticeLevel
         * @param {number} currentYear
         * @param {Date} reportingDueDate
         * @param {string} groupContact1
         * @param {string} groupContact2
         *
         * @return {string}
         */
        oocLevel2MessageGenerator = function (
            noticeLevel,
            currentYear,
            reportingDueDate,
            groupContact1,
            groupContact2
        ) {
            var groupContactGreetings;

            if ( groupContact1 && groupContact2 ) {
                groupContactGreetings = "[[" +
                    groupContact1 + "|" + groupContact1.substring(5) +
                    "]], [[" + groupContact2 + "|" + groupContact2.substring(5) +
                    "]]";
            } else if ( groupContact1 && !groupContact2 ) {
                groupContactGreetings = "[[" + groupContact1 + "|" + groupContact1.substring(5) + "]]";
            } else if ( !groupContact1 && groupContact2 ) {
                groupContactGreetings = "[[" + groupContact2 + "|" + groupContact2.substring(5) + "]]";
            } else {
                groupContactGreetings = "group contacts";
            }

            return "\n\n== " + noticeLevel + " Notification of Affiliate Expiration - Renewal pending submission of reporting ==\n\n" +
            "Greetings " + groupContactGreetings + ",\n\n" +
            "This is a notification to bring to your attention that your organization is currently past due on its required annual reporting. Wikimedia Affiliates are required to submit an annual activity report covering the entirety of the 12-month agreement period in order to prompt review for a renewal.  Reports must be written in English, posted to meta via the  [[Wikimedia Affiliates Data Portal]].\n\n" +
            "This page is used to track how organizations and groups are meeting reporting requirements described in their agreements with the Wikimedia Foundation (e.g. chapter agreements, thematic organization agreements, user group agreements).  It is the central place where affiliates can add reports about their activities, share their plans, and even news or social media channels with the wider movement. When new reports are available, organizations and groups should add them to this page to keep their columns up to date.\n\n" +
            "As noted on the meta [[Wikimedia Affiliates Data Portal/Reports|Reports page]], your organization’s '''" + String( currentYear ) + "''' annual reporting became past due in '''" + reportingDueDate.toISOString().slice( 0, 10 ) + "'''. Please be sure to:\n\n" +
            "* Post your '''" + String( currentYear ) + "''' annual reporting to the meta via the  [[Wikimedia Affiliates Data Portal]] as soon as possible to return to compliance with your user group agreement.\n\n" +
            "* Check that your group’s page is also up to date with past report links for historical record-keeping, and\n\n" +
            "* Please send an email to [[Mailing_lists/Wikimedia_Announce|Wikimedia-l]] in order to share with a movement-wide audience.\n\n" +
            "If you have any questions or need any further guidance, please don’t hesitate to reach out to wadportal{{at}}wikimedia.org.<br /><br />'''Best regards''', <br />''[[User:DNdubane_(WMF)|Dumisani Ndubane]]''\n\n" +
            "<br />''Wikimedia Affiliates Data Portal''\n\n" + new Date().toLocaleDateString("en-US", dateFormatOptions) + "\n\n";
        };

        /**
         * @param {Object} orgInfo
         * @param {number} currentYear
         * @param {string} reportingDueDate
         * @param {string} noticeLevel
         * @param {number} oocLevel
         * @param {number} days
         */
        postTalkPageNotification = function ( orgInfo, currentYear, reportingDueDate, noticeLevel, oocLevel, days ) {
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
                    var gc1 = '', gc2 = '';

                    if ( typeof orgInfo.group_contact1 != 'undefined' && orgInfo.group_contact1 ) {
                        gc1 = orgInfo.group_contact1;
                    }

                    if ( typeof orgInfo.group_contact2 != 'undefined' && orgInfo.group_contact2 ) {
                        gc2 = orgInfo.group_contact2;
                    }

                    if ( oocLevel === 1 ) {
                        affiliateTalkPageContent =
                            parseAndExtractAffiliateTalkPageContent( wikiPageContent.query.pages ) +
                            oocLevel1MessageGenerator(
                                noticeLevel,
                                currentYear,
                                reportingDueDate,
                                gc1,
                                gc2,
                                days
                            );
                    } else {
                        affiliateTalkPageContent =
                            parseAndExtractAffiliateTalkPageContent( wikiPageContent.query.pages ) +
                            oocLevel2MessageGenerator(
                                noticeLevel,
                                currentYear,
                                reportingDueDate,
                                gc1,
                                gc2
                            );
                    }
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
         * @param {string} group_name
         * @param {string} ooc_level
         * @param {number} financial_year
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

        apiObj.get( getModuleContent( 'Organizational_Informations' ) ).then( function ( orgInfosData ) {
            apiObj.get( getModuleContent( 'Activities_Reports' ) ).then( function ( activitiesReportsData ) {
                apiObj.get( getModuleContent( 'Financial_Reports' ) ).then( function ( financialReportsData ) {
                    apiObj.get( getModuleContent( 'Organizational_Informations/Out_Of_Compliance_Level' ) ).then( function ( oocLevelsData ) {
                        var activitiesReports,
                            financialReports,
                            orgInfo,
                            orgInfos,
                            currentYear,
                            reportingDueDateYear,
                            manifest = [],
                            latestActivityReportYear,
                            latestFinancialReportYear,
                            reportingDueDate,
                            todayDate,
                            insertInPlaceOocData,
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
                            emailDispatcherCount = { "l050": 0, "l34": 0, "l45": 0 },
                            isFiscalYear = false,
                            // No. of days before an affiliate's reporting due date.
                            daysToDueDate,
                            // No. of days after an affiliate's reporting due date.
                            daysAfterDueDate;

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
                                // If the fiscal year is not computed from agreement date, currentYear should
                                // really be currentYear - 1, since the affiliate is only due reporting few
                                // months into the future after the current year has elapsed.
                                if ( orgInfo.fiscal_year_start || orgInfos.fiscal_year_end ) {
                                    isFiscalYear = true;
                                }
                                if ( typeof latestActivityReport === 'object' && latestActivityReport !== null ) {
                                    latestActivityReportYear = parseInt( latestActivityReport.end_date.split( "/" )[2] );
                                } else if ( latestActivityReport === null || latestActivityReport.end_date === '01/01/2000' ) {
                                    // 'nlr' is a marker that conceptually means "no latest report"
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
                                        // it was just recognized and should be checked only the following year.
                                        //
                                        // NOTE: Just push the affiliate into the manifest before ignoring.
                                        // Silently ignoring without pushing to manifest caused a regression
                                        // that "manually reverted" all affiliates with fiscal year equal to
                                        // current year making M&E staff to not be able to add new affiliates
                                        // into the system (due to the revert each time it's added).
                                        manifest.push( orgInfo );
                                        continue;
                                    }
                                }

                                if ( orgInfo.reporting_due_date ) {
                                    reportingDueDate = new Date( orgInfo.reporting_due_date );
                                } else {
                                    // Let us know via the console that affiliate is missing
                                    // a reporting due date for computation.
                                    console.error( "Missing reporting due date: ", orgInfo.group_name );
                                }
                                todayDate = new Date();
                                reportingDueDateYear = parseInt( reportingDueDate.toISOString().substring( 0, 4 ) );

                                /** Special case: all chaps/thorgs with no financial reports should be
                                 *  marked as non-compliant and with message "No financial report" */
                                if ( orgInfo.org_type === "Chapter" || orgInfo === "Thematic Organization" ) {
                                    if ( typeof latestActivityReport === 'object' &&
                                        latestActivityReport !== null &&
                                        latestFinancialReport === 'nlr' &&
                                        todayDate.valueOf() > reportingDueDate.valueOf()
                                    ) {
                                        orgInfo.out_of_compliance_level = '5'; // TODO: Add RDD logic for correct level.
                                        orgInfo.uptodate_reporting = "Cross";
                                        orgInfo.notes_on_reporting = "No financial report";
                                        orgInfo.me_bypass_ooc_autochecks = 'Yes';

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - No financial report. Needs M&E followup!";

                                        manifest.push( orgInfo );
                                        continue;
                                    }

                                    if ( ( currentYear - latestActivityReportYear ) > 2 && // AR isn't the latest
                                        ( latestActivityReportYear - latestFinancialReportYear ) > 2 &&
                                        todayDate.valueOf() > reportingDueDate.valueOf()
                                    ) {
                                        orgInfo.out_of_compliance_level = '5' // TODO: Add RDD logic for correct level.
                                        orgInfo.uptodate_reporting = "Cross";
                                        orgInfo.me_bypass_ooc_autochecks = 'Yes';

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - Financial report too old & activity report not latest.";

                                        manifest.push( orgInfo );
                                        continue;
                                    }
                                }

                                daysToDueDate = ( reportingDueDate.valueOf() - todayDate.valueOf() ) / ( 1000 * 60 * 60 * 24 );
                                daysAfterDueDate = ( todayDate.valueOf() - reportingDueDate.valueOf() ) / ( 1000 * 60 * 60 * 24 );
                                // Parse the number of days to an integer because the above computation will result to a float
                                daysToDueDate = parseInt( daysToDueDate );

                                /**== Level 0 - 1: For new affiliates, handle them differently ==*/
                                if ( daysToDueDate >= 0 && daysToDueDate <= 30 ) {
                                    if ( orgInfo.org_type === 'User Group' ) {
                                        if ( orgInfo.uptodate_reporting === 'Tick-N' &&
                                            orgInfo.out_of_compliance_level === '0'
                                        ) {
                                            orgInfo.out_of_compliance_level = '1';
                                            orgInfo.reporting_due_date = reportingDueDate.toISOString();
                                            oocLevel = oocLevelLogGenerator( orgInfo.group_name, '1', reportingDueDateYear );
                                            ooc_manifest.push( oocLevel );

                                            postTalkPageNotification( orgInfo, reportingDueDateYear, reportingDueDate, '', 1, daysToDueDate );

                                            emailDispatcherCount["l050"]++;
                                            systemActivityLogsToEmail += "\n✦ [New Affiliate] " + orgInfo.group_name + " - OOC level 0 -> 1.";
                                        }
                                        /**== OOC: Level 0 to Level 1 and back algorithm for all affiliates ==*/
                                        else if ( orgInfo.uptodate_reporting === 'Tick' &&
                                            latestActivityReportYear !== 'nlr' &&
                                            latestActivityReportYear < currentYear &&
                                            orgInfo.out_of_compliance_level === '0'
                                        ) {
                                            orgInfo.out_of_compliance_level = '1';
                                            orgInfo.reporting_due_date = reportingDueDate.toISOString();
                                            oocLevel = oocLevelLogGenerator( orgInfo.group_name, '1', reportingDueDateYear );
                                            ooc_manifest.push( oocLevel );

                                            postTalkPageNotification( orgInfo, reportingDueDateYear, reportingDueDate, '', 1, daysToDueDate );

                                            emailDispatcherCount["l050"]++;
                                            systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 0 -> 1.";
                                        }
                                    }
                                } else if ( daysToDueDate >= 0 && daysToDueDate <= 120 ) {
                                    if ( orgInfo.org_type === 'Chapter' || orgInfo.org_type === 'Thematic Organization' ) {
                                        if ( orgInfo.uptodate_reporting === 'Tick-N' &&
                                            orgInfo.out_of_compliance_level === '0'
                                        ) {
                                            orgInfo.out_of_compliance_level = '1';
                                            orgInfo.reporting_due_date = reportingDueDate.toISOString();
                                            oocLevel = oocLevelLogGenerator( orgInfo.group_name, '1', reportingDueDateYear );
                                            ooc_manifest.push( oocLevel );

                                            postTalkPageNotification( orgInfo, reportingDueDateYear, reportingDueDate, '', 1, daysToDueDate );

                                            emailDispatcherCount["l050"]++;
                                            systemActivityLogsToEmail += "\n✦ [New Affiliate] " + orgInfo.group_name + " - OOC level 0 -> 1.";
                                        }
                                        /**== OOC: Level 0 to Level 1 and back algorithm for all affiliates ==*/
                                        else if ( orgInfo.uptodate_reporting === 'Tick' &&
                                            latestActivityReportYear !== 'nlr' &&
                                            latestActivityReportYear < currentYear &&
                                            orgInfo.out_of_compliance_level === '0'
                                        ) {
                                            orgInfo.out_of_compliance_level = '1';
                                            orgInfo.reporting_due_date = reportingDueDate.toISOString();
                                            oocLevel = oocLevelLogGenerator( orgInfo.group_name, '1', reportingDueDateYear );
                                            ooc_manifest.push( oocLevel );

                                            postTalkPageNotification( orgInfo, reportingDueDateYear, reportingDueDate, '', 1, daysToDueDate );

                                            emailDispatcherCount["l050"]++;
                                            systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 0 -> 1.";
                                        }
                                    }
                                }
                                /**== Level 1 -> 0: For UG, Chaps & ThOrgs ==*/
                                else if ( reportingDueDate.valueOf() > todayDate.valueOf() &&
                                    latestActivityReportYear !== 'nlr' &&
                                    latestActivityReportYear <= currentYear &&
                                    orgInfo.out_of_compliance_level === '1'
                                ) {
                                    // NOTE: If it's a new affiliate, just mark it directly as compliant.
                                    // And also, it's no longer a new affiliate as it now has at least 1 report.
                                    if ( orgInfo.uptodate_reporting === 'Tick-N' ) {
                                        orgInfo.uptodate_reporting = 'Tick';
                                    }
                                    orgInfo.out_of_compliance_level = '0';
                                    orgInfo.reporting_due_date = resetReportingDueDate( orgInfo.reporting_due_date );
                                    oocLevel = oocLevelLogGenerator( orgInfo.group_name, '0', reportingDueDateYear );
                                    ooc_manifest.push( oocLevel );

                                    emailDispatcherCount["l050"]++;
                                    systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 1 -> 0.";
                                }
                                /**== Level 1 - 2: For UG, Chaps & ThOrgs ==*/
                                else if ( latestActivityReportYear < currentYear &&
                                    latestActivityReportYear !== 'nlr' &&
                                    orgInfo.uptodate_reporting === "Tick" &&
                                    orgInfo.out_of_compliance_level === '1'
                                ) {
                                    if ( orgInfo.org_type === 'User Group' &&
                                        orgInfo.legal_entity === 'Yes' &&
                                        // Financial report year can be 1 year off from activity report year.
                                        ( latestActivityReportYear - latestFinancialReportYear ) < AR_FR_YEAR_OFFSET &&
                                        todayDate.valueOf() > reportingDueDate.valueOf()
                                    ) {
                                        orgInfo.out_of_compliance_level = '2';
                                        orgInfo.uptodate_reporting = "Cross";

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '2', reportingDueDateYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, reportingDueDateYear, reportingDueDate, '(Initial Review)' );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 1 -> 2.";
                                    } else if ( orgInfo.org_type === 'User Group' &&
                                        orgInfo.legal_entity === 'No' &&
                                        todayDate.valueOf() > reportingDueDate.valueOf()
                                    ) {
                                        orgInfo.out_of_compliance_level = '2';
                                        orgInfo.uptodate_reporting = "Cross";

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '2', reportingDueDateYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, reportingDueDateYear, reportingDueDate, '(Initial Review)' );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 1 -> 2.";
                                    } else if ( ( orgInfo.org_type === 'Chapter' || orgInfo.org_type === 'Thematic Organization' ) &&
                                        // Financial report year can be 1 year off from activity report year.
                                        ( latestActivityReportYear - latestFinancialReportYear ) < AR_FR_YEAR_OFFSET &&
                                        todayDate.valueOf() > reportingDueDate.valueOf()
                                    ) {
                                        orgInfo.out_of_compliance_level = '2';
                                        orgInfo.uptodate_reporting = "Cross";

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '2', reportingDueDateYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, reportingDueDateYear, reportingDueDate, '(Initial Review)' );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 1 -> 2.";
                                    }
                                }
                                /**== Level 1 - 2: For new UGs, Chaps & ThOrgs, handle them differently ==*/
                                else if ( orgInfo.uptodate_reporting === "Tick-N" &&
                                    orgInfo.out_of_compliance_level === '1'
                                ) {
                                    orgInfo.out_of_compliance_level = '2';
                                    orgInfo.uptodate_reporting = "Cross-N";

                                    oocLevel = oocLevelLogGenerator( orgInfo.group_name, '2', reportingDueDateYear );
                                    ooc_manifest.push( oocLevel );

                                    emailDispatcherCount["l050"]++;
                                    systemActivityLogsToEmail += "\n✦ [New Affiliate] " + orgInfo.group_name + " - OOC level 1 -> 2.";
                                }
                                /**== Level 2 back to Level 0 algorithm for all affiliates ==*/
                                else if ( ( latestActivityReportYear === currentYear || ( isFiscalYear && currentYear - latestActivityReportYear <= 1 ) ) &&
                                    latestActivityReportYear !== 'nlr' &&
                                    ( orgInfo.uptodate_reporting === "Cross" || orgInfo.uptodate_reporting === "Cross-N" ) &&
                                    orgInfo.out_of_compliance_level === '2'
                                ) {
                                    if ( ( ( orgInfo.org_type === 'User Group' && orgInfo.legal_entity === 'Yes' ) ||
                                            orgInfo.org_type === 'Chapter' || orgInfo.org_type === 'Thematic Organization' ) &&
                                        latestActivityReportYear - latestFinancialReportYear < AR_FR_YEAR_OFFSET
                                    ) {
                                        orgInfo.uptodate_reporting = "Tick";
                                        orgInfo.out_of_compliance_level = '0';
                                        orgInfo.reporting_due_date = resetReportingDueDate( orgInfo.reporting_due_date );

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '0', reportingDueDateYear );
                                        ooc_manifest.push( oocLevel );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 2 -> 0.";
                                    } else if ( orgInfo.org_type === 'User Group' && orgInfo.legal_entity === 'No' ) {
                                        orgInfo.uptodate_reporting = "Tick";
                                        orgInfo.out_of_compliance_level = '0';
                                        orgInfo.reporting_due_date = resetReportingDueDate( orgInfo.reporting_due_date );

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '0', reportingDueDateYear );
                                        ooc_manifest.push( oocLevel );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 2 -> 0.";
                                    }
                                }
                                /**== Level 2 to 3 OOC algorithm for UGs, Chaps & ThOrgs ==*/
                                else if ( orgInfo.out_of_compliance_level === '2' &&
                                    latestActivityReportYear < currentYear &&
                                    latestActivityReportYear !== 'nlr' &&
                                    orgInfo.uptodate_reporting === "Cross"
                                ) {
                                    // forward logic: 2 - 3 for UGs
                                    if ( orgInfo.org_type === 'User Group' &&
                                        orgInfo.legal_entity === 'Yes' &&
                                        // Financial report year can be 1 year off from activity report year.
                                        ( latestActivityReportYear - latestFinancialReportYear ) < AR_FR_YEAR_OFFSET &&
                                        // check if days difference is greater than 30 days after reporting due date
                                        daysAfterDueDate > 30
                                    ) {
                                        orgInfo.out_of_compliance_level = '3';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '3', reportingDueDateYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, reportingDueDateYear, reportingDueDate, '(First Reminder)' );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 2 -> 3.";
                                    } else if ( orgInfo.org_type === 'User Group' &&
                                        orgInfo.legal_entity === 'No' &&
                                        // check if days difference is greater than 30 days after reporting due date
                                        daysAfterDueDate > 30
                                    ) {
                                        orgInfo.out_of_compliance_level = '3';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '3', reportingDueDateYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, reportingDueDateYear, reportingDueDate, '(First Reminder)' );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 2 -> 3.";
                                    }
                                    // forward logic: 2 - 3 for chaps & thorgs
                                    else if ( ( orgInfo.org_type === 'Chapter' || orgInfo.org_type === 'Thematic Organization' ) &&
                                        // Financial report year can be 1 year off from activity report year.
                                        ( latestActivityReportYear - latestFinancialReportYear ) < AR_FR_YEAR_OFFSET &&
                                        // check if days difference is greater than 30 days after reporting due date
                                        daysAfterDueDate > 30
                                    ) {
                                        orgInfo.out_of_compliance_level = '3';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '3', reportingDueDateYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, reportingDueDateYear, reportingDueDate, '(First Reminder)' );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 2 -> 3.";
                                    }
                                }
                                /**== Level 2 - 3 for new affiliates (UGs, Chaps & ThOrgs) ==*/
                                else if ( orgInfo.out_of_compliance_level === '2' &&
                                    orgInfo.uptodate_reporting === "Cross-N"
                                ) {
                                    orgInfo.out_of_compliance_level = '3';

                                    oocLevel = oocLevelLogGenerator( orgInfo.group_name, '3', reportingDueDateYear );
                                    ooc_manifest.push( oocLevel );

                                    /** After writing to DB, post a talk page notification */
                                    postTalkPageNotification( orgInfo, reportingDueDateYear, reportingDueDate, '(First Reminder)' );

                                    emailDispatcherCount["l050"]++;
                                    systemActivityLogsToEmail += "\n✦ [New Affiliate] " + orgInfo.group_name + " - OOC level 2 -> 3.";
                                }
                                /**== Level 3 - 0: Backward logic for all affiliates: UGs, Chaps & ThOrgs ==*/
                                else if ( ( latestActivityReportYear === currentYear || ( isFiscalYear && currentYear - latestActivityReportYear <= 1 ) ) &&
                                    latestActivityReportYear !== 'nlr' &&
                                    ( orgInfo.uptodate_reporting === "Cross" || orgInfo.uptodate_reporting === "Cross-N" ) &&
                                    orgInfo.out_of_compliance_level === '3'
                                ) {
                                    if ( ( ( orgInfo.org_type === 'User Group' && orgInfo.legal_entity === 'Yes' ) ||
                                            orgInfo.org_type === 'Chapter' || orgInfo.org_type === 'Thematic Organization' ) &&
                                        latestActivityReportYear - latestFinancialReportYear < AR_FR_YEAR_OFFSET
                                    ) {
                                        orgInfo.uptodate_reporting = "Tick";
                                        orgInfo.out_of_compliance_level = '0';
                                        orgInfo.reporting_due_date = resetReportingDueDate( orgInfo.reporting_due_date );

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '0', reportingDueDateYear );
                                        ooc_manifest.push( oocLevel );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 3 -> 0.";
                                    } else if ( orgInfo.org_type === 'User Group' && orgInfo.legal_entity === 'No' ) {
                                        orgInfo.uptodate_reporting = "Tick";
                                        orgInfo.out_of_compliance_level = '0';
                                        orgInfo.reporting_due_date = resetReportingDueDate( orgInfo.reporting_due_date );

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '0', reportingDueDateYear );
                                        ooc_manifest.push( oocLevel );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 3 -> 0.";
                                    }
                                }
                                /**== Level 3 to 4 OOC algorithm for all affiliates (UGs, Chaps, ThOrgs) ==*/
                                else if ( orgInfo.out_of_compliance_level === '3' &&
                                    latestActivityReportYear < currentYear &&
                                    latestActivityReportYear !== 'nlr' &&
                                    orgInfo.uptodate_reporting === "Cross"
                                ) {
                                    if ( orgInfo.org_type === 'User Group' &&
                                        orgInfo.legal_entity === 'Yes' &&
                                        // Financial report year can be 1 year off from activity report year.
                                        ( latestActivityReportYear - latestFinancialReportYear ) < AR_FR_YEAR_OFFSET &&
                                        // check if days difference is greater than 60 days after reporting due date
                                        daysAfterDueDate > 60
                                    ) {
                                        orgInfo.out_of_compliance_level = '4';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '4', reportingDueDateYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, reportingDueDateYear, reportingDueDate, '(Second Reminder)' );

                                        /** Email list of Chaps & ThOrgs from level 3 - 4 to M&E staff. */
                                        emailDispatcherCount["l34"]++;
                                        specialAffiliatesToEmailL34 += "\n✦ " + orgInfo.group_name;

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 3 -> 4.";
                                    } else if ( orgInfo.org_type === 'User Group' &&
                                        orgInfo.legal_entity === 'No' &&
                                        // check if days difference is greater than 60 days after reporting due date
                                        daysAfterDueDate > 60
                                    ) {
                                        orgInfo.out_of_compliance_level = '4';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '4', reportingDueDateYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, reportingDueDateYear, reportingDueDate, '(Second Reminder)' );

                                        /** Email list of Chaps & ThOrgs from level 3 - 4 to M&E staff. */
                                        emailDispatcherCount["l34"]++;
                                        specialAffiliatesToEmailL34 += "\n✦ " + orgInfo.group_name;

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 3 -> 4.";
                                    } else if ( ( orgInfo.org_type === 'Chapter' || orgInfo.org_type === 'Thematic Organization' ) &&
                                        // Financial report year can be 1 year off from activity report year.
                                        ( latestActivityReportYear - latestFinancialReportYear ) < AR_FR_YEAR_OFFSET &&
                                        // check if days difference is greater than 60 days after reporting due date
                                        daysAfterDueDate > 60
                                    ) {
                                        orgInfo.out_of_compliance_level = '4';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '4', reportingDueDateYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, reportingDueDateYear, reportingDueDate, '(Second Reminder)' );

                                        /** Email list of Chaps & ThOrgs from level 3 - 4 to M&E staff. */
                                        emailDispatcherCount["l34"]++;
                                        specialAffiliatesToEmailL34 += "\n✦ " + orgInfo.group_name;

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 3 -> 4.";
                                    }
                                }
                                /**== Level 3 - 4 for all **new** affiliates (UGs, Chaps & ThOrgs) */
                                else if ( orgInfo.out_of_compliance_level === '3' &&
                                    orgInfo.uptodate_reporting === "Cross-N"
                                ) {
                                    orgInfo.out_of_compliance_level = '4';

                                    oocLevel = oocLevelLogGenerator( orgInfo.group_name, '4', reportingDueDateYear );
                                    ooc_manifest.push( oocLevel );

                                    /** After writing to DB, post a talk page notification */
                                    postTalkPageNotification( orgInfo, reportingDueDateYear, reportingDueDate, '(Second Reminder)' );

                                    /** Email list of Chaps & ThOrgs from level 3 - 4 to M&E staff. */
                                    emailDispatcherCount["l34"]++;
                                    specialAffiliatesToEmailL34 += "\n✦ " + orgInfo.group_name;

                                    emailDispatcherCount["l050"]++;
                                    systemActivityLogsToEmail += "\n✦ [New Affiliate] " + orgInfo.group_name + " - OOC level 3 -> 4.";
                                }
                                /**== Level 4 - 0: backward logic for all affiliates ==*/
                                else if ( ( latestActivityReportYear === currentYear || ( isFiscalYear && currentYear - latestActivityReportYear <= 1 ) ) &&
                                    latestActivityReportYear !== 'nlr' &&
                                    ( orgInfo.uptodate_reporting === "Cross" || orgInfo.uptodate_reporting === "Cross-N" ) &&
                                    orgInfo.out_of_compliance_level === '4'
                                ) {
                                    if ( ( ( orgInfo.org_type === 'User Group' && orgInfo.legal_entity === 'Yes' ) ||
                                            orgInfo.org_type === 'Chapter' || orgInfo.org_type === 'Thematic Organization' ) &&
                                        latestActivityReportYear - latestFinancialReportYear < AR_FR_YEAR_OFFSET
                                    ) {
                                        orgInfo.uptodate_reporting = "Tick";
                                        orgInfo.out_of_compliance_level = '0';
                                        orgInfo.reporting_due_date = resetReportingDueDate( orgInfo.reporting_due_date );

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '0', reportingDueDateYear );
                                        ooc_manifest.push( oocLevel );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 4 -> 0.";
                                    } else if ( orgInfo.org_type === 'User Group' && orgInfo.legal_entity === 'No' ) {
                                        orgInfo.uptodate_reporting = "Tick";
                                        orgInfo.out_of_compliance_level = '0';
                                        orgInfo.reporting_due_date = resetReportingDueDate( orgInfo.reporting_due_date );

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '0', reportingDueDateYear );
                                        ooc_manifest.push( oocLevel );

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 4 -> 0.";
                                    }
                                }
                                /**== Level 4 to 5 OOC algorithm for UGs, Chaps & ThOrgs ==*/
                                else if ( orgInfo.out_of_compliance_level === '4' &&
                                    latestActivityReportYear < currentYear &&
                                    latestActivityReportYear !== 'nlr' &&
                                    orgInfo.uptodate_reporting === "Cross"
                                ) {
                                    // forward logic: 4 - 5
                                    if ( orgInfo.org_type === 'User Group' &&
                                        orgInfo.legal_entity === 'Yes' &&
                                        // Financial report year can be 1 year off from activity report year.
                                        ( latestActivityReportYear - latestFinancialReportYear ) > 1 &&
                                        // check if days difference is greater than 90 days after reporting due date
                                        daysAfterDueDate > 90
                                    ) {
                                        orgInfo.out_of_compliance_level = '5';
                                        orgInfo.me_bypass_ooc_autochecks = 'Yes';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '5', reportingDueDateYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, reportingDueDateYear, reportingDueDate, '(Third Reminder)' );

                                        /** Email list of UG from level 4 - 5 to M&E staff. */
                                        emailDispatcherCount["l45"]++;
                                        specialAffiliatesToEmailL45 += "\n✦ " + orgInfo.group_name;

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 4 -> 5.";
                                    } else if ( orgInfo.org_type === 'User Group' &&
                                        orgInfo.legal_entity === 'No' &&
                                        // check if days difference is greater than 90 days after reporting due date
                                        daysAfterDueDate > 90
                                    ) {
                                        orgInfo.out_of_compliance_level = '5';
                                        orgInfo.me_bypass_ooc_autochecks = 'Yes';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '5', reportingDueDateYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, reportingDueDateYear, reportingDueDate, '(Third Reminder)' );

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
                                        // check if days difference is greater than 90 days after reporting due date
                                        daysAfterDueDate > 90
                                    ) {
                                        orgInfo.out_of_compliance_level = '5';
                                        orgInfo.me_bypass_ooc_autochecks = 'Yes';

                                        oocLevel = oocLevelLogGenerator( orgInfo.group_name, '5', reportingDueDateYear );
                                        ooc_manifest.push( oocLevel );

                                        /** After writing to DB, post a talk page notification */
                                        postTalkPageNotification( orgInfo, reportingDueDateYear, reportingDueDate, '(Third Reminder)' );

                                        /** Email list of Chaps & ThOrgs from level 4 - 5 to M&E staff. */
                                        emailDispatcherCount["l45"]++;
                                        specialAffiliatesToEmailL45 += "\n✦ " + orgInfo.group_name;

                                        emailDispatcherCount["l050"]++;
                                        systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 4 -> 5.";
                                    }
                                }
                                /**== Level 4 - 5: For all new affiliates ==*/
                                else if ( orgInfo.out_of_compliance_level === '4' &&
                                    orgInfo.uptodate_reporting === "Cross-N"
                                ) {
                                    orgInfo.out_of_compliance_level = '5';
                                    orgInfo.me_bypass_ooc_autochecks = 'Yes';

                                    oocLevel = oocLevelLogGenerator( orgInfo.group_name, '5', reportingDueDateYear );
                                    ooc_manifest.push( oocLevel );

                                    /** After writing to DB, post a talk page notification */
                                    postTalkPageNotification( orgInfo, reportingDueDateYear, reportingDueDate, '(Third Reminder)' );

                                    /** Email list of UG from level 4 - 5 to M&E staff. */
                                    emailDispatcherCount["l45"]++;
                                    specialAffiliatesToEmailL45 += "\n✦ [New Affiliate] " + orgInfo.group_name;

                                    emailDispatcherCount["l050"]++;
                                    systemActivityLogsToEmail += "\n✦ " + orgInfo.group_name + " - OOC level 4 -> 5.";
                                }
                                manifest.push( orgInfo );

                                // reset isFiscalYear and recompute state when needed.
                                isFiscalYear = false;
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
                            if ( ooc_manifest[i].reporting_due_date ) {
                                insertInPlaceOOC += generateKeyValuePair(
                                    'reporting_due_date',
                                    ooc_manifest[i].reporting_due_date
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
                        insertInPlaceOocData = 'return {\n';
                        for ( i = 0; i < manifest.length; i++ ) {
                            insertInPlaceOocData += '\t{\n';
                            if ( manifest[i].unique_id ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'unique_id',
                                    manifest[i].unique_id
                                );
                            }
                            if ( manifest[i].affiliate_code ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'affiliate_code',
                                    manifest[i].affiliate_code
                                );
                            }
                            if ( manifest[i].group_name ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'group_name',
                                    manifest[i].group_name
                                );
                            }
                            if ( manifest[i].org_type ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'org_type',
                                    manifest[i].org_type
                                );
                            }
                            if ( manifest[i].region ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'region',
                                    manifest[i].region
                                );
                            }
                            if ( manifest[i].group_country ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'group_country',
                                    manifest[i].group_country
                                );
                            }
                            if ( !manifest[i].legal_entity && manifest[i].org_type === 'User Group' ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'legal_entity',
                                    'No'
                                );
                            } else if ( manifest[i].legal_entity && manifest[i].org_type === 'User Group' ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'legal_entity',
                                    manifest[i].legal_entity
                                );
                            } else {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'legal_entity',
                                    'Yes'
                                );
                            }
                            if ( manifest[i].mission_changed ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'mission_changed',
                                    manifest[i].mission_changed
                                );
                            }
                            if ( manifest[i].explanation ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'explanation',
                                    manifest[i].explanation
                                );
                            }
                            if ( manifest[i].group_page ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'group_page',
                                    manifest[i].group_page.trim()
                                );
                            }
                            if ( manifest[i].member_count ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'member_count',
                                    manifest[i].member_count
                                );
                            }
                            if ( manifest[ i ].non_editors_count ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'non_editors_count',
                                    manifest[ i ].non_editors_count
                                );
                            }
                            if ( manifest[i].facebook ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'facebook',
                                    manifest[i].facebook.trim()
                                );
                            }
                            if ( manifest[i].twitter ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'twitter',
                                    manifest[i].twitter.trim()
                                );
                            }
                            if ( manifest[i].other ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'other',
                                    manifest[i].other.trim()
                                );
                            }
                            if ( manifest[i].dm_structure ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'dm_structure',
                                    manifest[i].dm_structure
                                );
                            }
                            if ( manifest[ i ].group_contact1 ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'group_contact1',
                                    manifest[ i ].group_contact1
                                );
                            } else {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'group_contact1',
                                    ''
                                );
                            }
                            if ( manifest[ i ].group_contact2 ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'group_contact2',
                                    manifest[ i ].group_contact2
                                );
                            } else {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'group_contact2',
                                    ''
                                );
                            }
                            if ( manifest[i].board_contacts ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'board_contacts',
                                    manifest[i].board_contacts
                                );
                            }
                            if ( manifest[i].agreement_date ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'agreement_date',
                                    manifest[i].agreement_date
                                );
                            }
                            if ( manifest[i].fiscal_year_start ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'fiscal_year_start',
                                    manifest[i].fiscal_year_start
                                );
                            } else {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'fiscal_year_start',
                                    ''
                                );
                            }
                            if ( manifest[i].fiscal_year_end ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'fiscal_year_end',
                                    manifest[i].fiscal_year_end
                                );
                            } else {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'fiscal_year_end',
                                    ''
                                );
                            }
                            if ( manifest[i].uptodate_reporting ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'uptodate_reporting',
                                    manifest[i].uptodate_reporting
                                );
                            }
                            if ( manifest[i].notes_on_reporting ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'notes_on_reporting',
                                    manifest[i].notes_on_reporting
                                );
                            } else {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'notes_on_reporting',
                                    ''
                                );
                            }
                            if ( manifest[i].recognition_status ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'recognition_status',
                                    manifest[i].recognition_status
                                );
                            }
                            if ( manifest[i].me_bypass_ooc_autochecks != undefined &&
                                manifest[i].me_bypass_ooc_autochecks
                            ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'me_bypass_ooc_autochecks',
                                    manifest[i].me_bypass_ooc_autochecks
                                );
                            }
                            if ( manifest[i].out_of_compliance_level != undefined &&
                                manifest[i].out_of_compliance_level
                            ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'out_of_compliance_level',
                                    manifest[i].out_of_compliance_level
                                );
                            }
                            // Track the reporting due date, so we can compute in a new year.
                            if ( manifest[i].reporting_due_date ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'reporting_due_date',
                                    manifest[i].reporting_due_date
                                );
                            } else { // Just use an empty string if the affiliate is compliant.
                                insertInPlaceOocData += generateKeyValuePair(
                                    'reporting_due_date',
                                    ''
                                );
                            }
                            if ( manifest[i].derecognition_date ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'derecognition_date',
                                    manifest[i].derecognition_date
                                );
                            }
                            if ( manifest[i].derecognition_note ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'derecognition_note',
                                    manifest[i].derecognition_note
                                );
                            }
                            if ( manifest[i].dos_stamp ) {
                                insertInPlaceOocData += generateKeyValuePair(
                                    'dos_stamp',
                                    manifest[i].dos_stamp
                                );
                            }
                            insertInPlaceOocData += '\t},\n';
                        }
                        insertInPlaceOocData += '}';

                        // Make changes to the Org Info table as required.
                        apiObj.postWithToken(
                            'csrf',
                            {
                                action: 'edit',
                                bot: true,
                                nocreate: true,
                                summary: '[Automated] M&E compliance automated checks by WAD Portal.',
                                pageid: 10603224,  // [[Module:Organizational_Informations]]
                                text: insertInPlaceOocData,
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
