/**
 * Script that runs once a week to send out a weekly digest to M&E staff notifying them of
 * all the changes that occurred concerning group contact details. Changes include:
 *  - Group contact 1 changed
 *  - Group contact 2 changed
 *  - Both Group Contact 1 and 2 changed
 *  - Group contact one and group contact two were swapped
 *  - A new affiliate was added, therefore new group contacts are on record
 *  - An affiliate was derecognised, therefore the contacts on records were archived
 *
 * @author Alice China (AChina-WMF)
 */

( function () {
    'use strict';

    var buildAffiliateChangesList,
        compileDigest,
        digestTimeFrame = 7, //in days
        formatDate,
        getDatesDiff,
        getFirstDayOfWeek,
        sendEmailToMEStaff,
        cleanRawEntry,
        sanitizeInput,
        generateKeyValuePair,
        getModuleContent,
        parseContentModule;

    cleanRawEntry = function ( relevant_raw_entry ) {
        var entry_data = {},
            i, j;
        for ( i = 0; i < relevant_raw_entry.length; i++ ) {
            if ( relevant_raw_entry[ i ].key.name === 'dm_structure' ) {
                entry_data.dm_structure = [];
                for (
                    j = 0;
                    j < relevant_raw_entry[ i ].value.fields.length;
                    j++
                ) {
                    entry_data.dm_structure.push(
                        relevant_raw_entry[ i ].value.fields[ j ].value.value
                    );
                }
            } else {
                entry_data[ relevant_raw_entry[ i ].key.name ] = relevant_raw_entry[ i ].value.value;
            }
        }
        return entry_data;
    };

    sanitizeInput = function ( s ) {
        return s
            .replace( /\\/g, '\\\\' )
            .replace( /\n/g, '<br />' );
    };

    generateKeyValuePair = function ( k, v ) {
        var res,
            json_array;

        res = '\t\t'.concat( k, ' = ' );
        if ( k === 'dm_structure' ) {
            json_array = JSON.stringify( v );
            // Lua uses { } for "arrays"
            json_array = json_array.replace( '[', '{' );
            json_array = json_array.replace( ']', '}' );
            // Style changes (single quotes, spaces after commas)
            json_array = json_array.replace( /\"/g, '\'' );
            json_array = json_array.replace( /,/g, ', ' );
            // Basic input sanitation
            json_array = sanitizeInput( json_array );
            res += json_array;
        } else {
            v = sanitizeInput( v );
            v = v.replace( /'/g, '\\\'' );
            res += '\'' + v + '\'';
        }
        res += ',\n';
        return res;
    };

    getModuleContent = function ( moduleName ) {
        return {
            prop: 'revisions',
            titles: 'Module:' + moduleName,
            rvprop: 'content',
            rvlimit: 1,
            assert: 'user',
            format: 'json'
        };
    };

    parseContentModule = function ( sourceBlob ) {
        var ast, i, raw;

        // Should only be one result returned
        for ( i in sourceBlob ) {
            raw = sourceBlob[ i ].revisions[ 0 ][ '*' ];
            ast = luaparse.parse( raw );
            return ast.body[ 0 ].arguments[ 0 ].fields;
        }
    };
    /**
     * This function sends out the email to the relevant M&E staff
     *
     * @param {string} email_subject The email title.
     * @param {string} email_body The email content/body.
     */
    sendEmailToMEStaff = function ( email_subject, email_body ) {
        var ME_staff = [
                'AChina-WMF',
            ],
            api = new mw.Api(),
            i,
            params;

        for ( i = 0; i < ME_staff.length; i++ ) {
            params = {
                action: 'emailuser',
                target: ME_staff[ i ],
                subject: email_subject,
                text: email_body,
                format: 'json'
            };
            api.postWithToken( 'csrf', params ).then( function ( data ) {
                // No op
            } );
        }
    };

    /**
     * This function gets the first day of the current week
     */
    getFirstDayOfWeek = function () {
        var current_date, current_day_of_week, previous_sunday_date, days, months, day_name, month_name,
            day, year, formatted_date;
        current_date = new Date();

        // Get the current day of the week (0 for Sunday, 1 for Monday, etc.)
        current_day_of_week = current_date.getDay();

        // Calculate the date of the previous week's Sunday
        previous_sunday_date = new Date( current_date );
        previous_sunday_date.setDate( current_date.getDate() - current_day_of_week - 7 );

        // Get the components of the date
        days = [ 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ];
        months = [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ];

        day_name = days[ previous_sunday_date.getDay() ];
        month_name = months[ previous_sunday_date.getMonth() ];
        day = previous_sunday_date.getDate();
        year = previous_sunday_date.getFullYear();

        // Format the date
        formatted_date = day_name + ' ' + month_name + ' ' + day + ' ' + year;

        return formatted_date;
    };

    /**
     * This function formats an ISO date to a predefined human readable format
     * e.g Thu July 8 1995
     * @param {Date} date Date to be formatted
     */
    formatDate = function ( date ) {
        var days = [ 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ];
        var months = [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ];

        var day_name = days[ date.getDay() ];
        var month_name = months[ date.getMonth() ];
        var day = date.getDate();
        var year = date.getFullYear();

        return day_name + ' ' + month_name + ' ' + day + ' ' + year;
    };

    /**
     * This function gets the difference in days between two dates
     *
     * @param {string} start Start date
     * @param {string} end End date
     */
    getDatesDiff = function ( start, end ) {
        //convert the date string to date objects
        var start_date = new Date( start );
        var end_date = new Date( end );
        var one_day = 24 * 60 * 60 * 1000; // hours * minutes * seconds * milliseconds
        var diff_milliseconds = Math.abs( end_date.getTime() - start_date.getTime() );
        return Math.round( diff_milliseconds / one_day );
    };

    /**
     * This function gets an array of changes, and returns a list of changes as a string ( numbered list )
     *
     * @param {Array} changes List of changes recorded in the weekly digest
     */
    buildAffiliateChangesList = function ( changes ) {
        for ( var i = 0; i < changes.length; i++ ) {
            changes[ i ] = ( i + 1 ) + '. ' + changes[ i ];
        }

        return changes.join( '\n' );
    };

    /**
     * This function read from the digest table, builds the digest email content and calls the methos to send the
     * emails. It also records the time the digest email has been sent.
     */
    compileDigest = function ( body ) {
        var api_object = new mw.Api(), current_affiliate;

        api_object.get( getModuleContent( 'Affiliate_Contacts_Digest' ) ).then( function ( data ) {
            var i,
                digest_email_subject,
                digest_email_body,
                send_digest = false,
                digest_diff_days = 0,
                digest_manifest = [],
                working_entry,
                entries,
                insert_to_digest_table,
                affiliate_changes = {};

            entries = parseContentModule( data.query.pages );

            if ( entries.length < 1 ) {
                return;
            }
            // Cycle through existing entries. If we are editing an existing
            // entry, that entry will be modified in place.
            for ( i = 0; i < entries.length; i++ ) {
                working_entry = cleanRawEntry( entries[ i ].value.fields );
                digest_manifest.push( working_entry );
            }

            // Go through Lua table picking current week's records, for each affiliate and populating the changes array
            for ( i = 0; i < digest_manifest.length; i++ ) {
                //caters for the initial digest emails sent
                if ( digest_manifest[ i ].last_digest && digest_manifest[ i ].last_digest == '-' ) {
                    send_digest = true;
                } else {
                    if ( digest_manifest[ i ].date && digest_manifest[ i ].last_digest ) {
                        digest_diff_days = getDatesDiff( digest_manifest[ i ].date, digest_manifest[ i ].last_digest );
                        if ( digest_diff_days == digestTimeFrame ) {
                            send_digest = true;
                        }
                    }
                }
                if ( send_digest ) {
                    current_affiliate = digest_manifest[ i ].affiliate_name;
                    digest_manifest[ i ].last_digest = new Date().toISOString();
                    if ( digest_manifest[ i ].affiliate_name == current_affiliate ) {
                        if ( !affiliate_changes[ current_affiliate ] ) {
                            // Initialize it as an empty array if it doesn't exist
                            affiliate_changes[ current_affiliate ] = [];
                        }
                        affiliate_changes[ current_affiliate ].push( digest_manifest[ i ].change );
                    }
                }
            }
            //Write back the updated manifest to the digest table
            insert_to_digest_table = 'return {\n';
            for ( i = 0; i < digest_manifest.length; i++ ) {
                insert_to_digest_table += '\t{\n';
                if ( digest_manifest[ i ].date ) {
                    insert_to_digest_table += generateKeyValuePair( 'date',
                        digest_manifest[ i ].date
                    );
                }
                if ( digest_manifest[ i ].affiliate_name ) {
                    insert_to_digest_table += generateKeyValuePair( 'affiliate_name',
                        digest_manifest[ i ].affiliate_name
                    );
                }
                if ( digest_manifest[ i ].change ) {
                    insert_to_digest_table += generateKeyValuePair( 'change',
                        digest_manifest[ i ].change
                    );
                }
                if ( digest_manifest[ i ].last_digest ) {
                    insert_to_digest_table += generateKeyValuePair( 'last_digest',
                        digest_manifest[ i ].last_digest
                    );
                }
                insert_to_digest_table += '\t},\n';
            }
            insert_to_digest_table += '}';

            // Write data back to the Digest Lua table.
            api_object.postWithToken(
                'csrf',
                {
                    action: 'edit',
                    bot: true,
                    nocreate: true,
                    summary: 'Writing latest changes to Digest table',
                    pageid: 44161, // [[Module:Affiliate_Contacts_Digest]]
                    text: insert_to_digest_table,
                    contentmodel: 'Scribunto'
                }
            );
            console.log( 'Group contact changes summary written to Digest Table' );

            /** affiliate_changes = {
             *       "Wikimedia Nairobi": {"contact1_changed", "contacts_swapped"},
             *       "Wikimedia Tanzania": {'new_contacts'},
             *   }
             */

            // Build email body using changes picked form the table
            digest_email_subject = 'WADP Weekly Digest ( ' + getFirstDayOfWeek() + ' to ' + formatDate( new Date() ) + ' )';
            digest_email_body = ' Affiliate contact changes are as below: \n\n';

            for ( var key in affiliate_changes ) {
                if ( affiliate_changes.hasOwnProperty( key ) ) {
                    var affiliate_changes_ = affiliate_changes[ key ];
                    digest_email_body += key + ' : \n';
                    digest_email_body += buildAffiliateChangesList( affiliate_changes_ );
                    digest_email_body += '\n\n';
                }
            }
            sendEmailToMEStaff( digest_email_subject, digest_email_body );

        } ).catch( function ( error ) {
            alert( 'Failed' );
            console.error( error );
        } );
    };

    /**
     * Loading:
     * - The interface provided by mediawiki api.
     * - Luaparse gadget that contains the logic to parse a Lua table
     *   to an AST.
     */
    mw.loader.using( [
        'mediawiki.api',
        'ext.gadget.luaparse'
    ] ).then( compileDigest );
}() );
