/**
 * Copy some extracts of OrgInfo and Contacts data from Meta-Wiki
 * to use on Office-Wiki.
 * @author Alice China (WMF)
 */

( function () {
    'use strict';

    var pageName = mw.config.values.wgPageName;

    if ( pageName === 'Wikimedia_Affiliates_Contacts_Portal' ) {
        var foreignWiki = 'https://meta.wikimedia.org/w/api.php',
            archivePreviousContact,
            cleanRawEntry,
            getModuleContent,
            getTimeNow,
            parseContentModule,
            copyOrgInfoData,
            sanitizeInput,
            generateKeyValuePair,
            updateAffiliateContactsInfo,
            sendEmailToMEStaff,
            metaGroupNames = [],
            officeGroupNames = [],
            newAffiliates = [],
            emailSubject = '[WAC Portal] Affiliate Contact Changes';

        getTimeNow = function () {
            var timeFormatOptions = {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timezone: UTC_TIMEZONE
            }, dateFormatOptions = {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timezone: UTC_TIMEZONE
            }

            var time = new Date().toLocaleTimeString( [], timeFormatOptions ),
                today = new Date().toLocaleDateString( 'en-GB', dateFormatOptions ) + ' (' + UTC_TIMEZONE + ')';

            return time + ', ' + today;
        }

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

        sanitizeInput = function ( s ) {
            return s
                .replace( /\\/g, '\\\\' )
                .replace( /\n/g, '<br />' );
        };

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
            for ( i in sourceBlob ) {  // should only be one result
                raw = sourceBlob[ i ].revisions[ 0 ][ '*' ];
                ast = luaparse.parse( raw );
                return ast.body[ 0 ].arguments[ 0 ].fields;
            }
        };

        /**
         * @param {string} body The email content/body.
         */
        sendEmailToMEStaff = function ( body) {
            var MEStaff = [
                    'DNdubane (WMF)',
                    'AChina-WMF',
                    'DAlangi (WMF)'
                ],
                api = new mw.Api();
            for ( const staff in MEStaff ) {
                var params = {
                    action: 'emailuser',
                    target: staff,
                    subject: emailSubject,
                    text: body,
                    format: 'json'
                };
                api.postWithToken( 'csrf', params ).then( function ( data ) {
                    // No op
                } );
            }
        };

        archivePreviousContact = function ( contactsData, orgInfoData, archiveData ) {
            var apiObj = new mw.Api(),
                i, j,
                contactsDataEntries,
                contactsWorkingEntry,
                orgInfoDataEntries,
                orgInfoWorkingEntry,
                insertToArchiveTable,
                insertToContactsTable,
                contactToArchiveManifest = [],
                archive = {},
                archiveDataEntries,
                archiveManifest = [],
                archiveEntry,
                affiliateContactListManifest = [],
                emailBody='';

            contactsDataEntries = parseContentModule( contactsData.query.pages );
            orgInfoDataEntries = parseContentModule( orgInfoData.query.pages );

            contactToArchiveManifest = [];
            console.log( 'Manifest before loops: ' );
            console.log( JSON.stringify( contactToArchiveManifest ) );

            for ( i = 0; i < contactsDataEntries.length; i++ ) {
                contactsWorkingEntry = cleanRawEntry( contactsDataEntries[ i ].value.fields );
                for ( j = 0; j < orgInfoDataEntries.length; j++ ) {
                    orgInfoWorkingEntry = cleanRawEntry( orgInfoDataEntries[ j ].value.fields );
                    if ( orgInfoWorkingEntry.affiliate_name === contactsWorkingEntry.affiliate_name ) {
                        // Group contact 1 changed
                        if ( orgInfoWorkingEntry.affiliate_contact1 !== contactsWorkingEntry.primary_contact_1_username &&
                            orgInfoWorkingEntry.affiliate_contact2 === contactsWorkingEntry.primary_contact_2_username ) {
                            archive = {
                                affiliate_name: contactsWorkingEntry.affiliate_name,
                                first_name: contactsWorkingEntry.primary_contact_1_firstname,
                                surname: contactsWorkingEntry.primary_contact_1_surname,
                                username: contactsWorkingEntry.primary_contact_1_username,
                                email_address: contactsWorkingEntry.primary_contact_1_email_address,
                                designation: contactsWorkingEntry.primary_contact_1_designation,
                                dos_stamp: new Date().toISOString()
                            };
                            affiliateContactListManifest.push( updateAffiliateContactsInfo( contactsWorkingEntry, orgInfoWorkingEntry.affiliate_contact1, false ) );
                            contactToArchiveManifest.push( archive );
                            emailBody = orgInfoWorkingEntry.affiliate_name + 'has changed Group Contact 1. Previous contact archived. \n Please update the contact details on Office.';
                            sendEmailToMEStaff( emailBody );
                            break;
                        } // Group contact 2 changed
                        else if ( orgInfoWorkingEntry.affiliate_contact2 !== contactsWorkingEntry.primary_contact_2_username &&
                            orgInfoWorkingEntry.affiliate_contact1 === contactsWorkingEntry.primary_contact_1_username ) {
                            archive = {
                                affiliate_name: contactsWorkingEntry.affiliate_name,
                                first_name: contactsWorkingEntry.primary_contact_2_firstname,
                                surname: contactsWorkingEntry.primary_contact_2_surname,
                                username: contactsWorkingEntry.primary_contact_2_username,
                                email_address: contactsWorkingEntry.primary_contact_2_email_address,
                                designation: contactsWorkingEntry.primary_contact_2_designation,
                                dos_stamp: new Date().toISOString()
                            };
                            affiliateContactListManifest.push( updateAffiliateContactsInfo( contactsWorkingEntry, false, orgInfoWorkingEntry.affiliate_contact2 ) );
                            contactToArchiveManifest.push( archive );
                            emailBody = orgInfoWorkingEntry.affiliate_name + 'has changed Group Contact 2. Previous contact archived. \n Please update the contact details on Office.';
                            sendEmailToMEStaff( emailBody );
                            break;
                        } // Both group contacts changed
                        else if ( orgInfoWorkingEntry.affiliate_contact1 !== contactsWorkingEntry.primary_contact_1_username &&
                            orgInfoWorkingEntry.affiliate_contact2 !== contactsWorkingEntry.primary_contact_2_username ) {
                            archive = {
                                affiliate_name: contactsWorkingEntry.affiliate_name,
                                first_name: contactsWorkingEntry.primary_contact_1_firstname,
                                surname: contactsWorkingEntry.primary_contact_1_surname,
                                username: contactsWorkingEntry.primary_contact_1_username,
                                email_address: contactsWorkingEntry.primary_contact_1_email_address,
                                designation: contactsWorkingEntry.primary_contact_1_designation,
                                dos_stamp: new Date().toISOString()
                            };
                            contactToArchiveManifest.push( archive );
                            archive = {
                                affiliate_name: contactsWorkingEntry.affiliate_name,
                                first_name: contactsWorkingEntry.primary_contact_2_firstname,
                                surname: contactsWorkingEntry.primary_contact_2_surname,
                                username: contactsWorkingEntry.primary_contact_2_username,
                                email_address: contactsWorkingEntry.primary_contact_2_email_address,
                                designation: contactsWorkingEntry.primary_contact_2_designation,
                                dos_stamp: new Date().toISOString()
                            };
                            contactToArchiveManifest.push( archive );
                            affiliateContactListManifest.push( updateAffiliateContactsInfo( contactsWorkingEntry, orgInfoWorkingEntry.affiliate_contact1, orgInfoWorkingEntry.affiliate_contact2 ) );
                            emailBody = orgInfoWorkingEntry.affiliate_name + 'has changed both Group Contact 1 and 2. Previous contacts archived. \n Please update the contact details on Office.';
                            sendEmailToMEStaff( emailBody );
                            break;
                        } else {
                            affiliateContactListManifest.push( contactsWorkingEntry );
                            break;
                        }
                    }
                }
            }

            archiveDataEntries = parseContentModule( archiveData.query.pages );
            for ( i = 0; i < archiveDataEntries.length; i++ ) {
                archiveEntry = cleanRawEntry( archiveDataEntries[ i ].value.fields );
                archiveManifest.push( archiveEntry );
            }

            // Combine both manifest and write back to the archive table.
            contactToArchiveManifest = archiveManifest.concat( contactToArchiveManifest );

            insertToContactsTable = 'return {\n';
            for ( i = 0; i < affiliateContactListManifest.length; i++ ) {
                insertToContactsTable += '\t{\n';
                if ( affiliateContactListManifest[ i ].affiliate_name ) {
                    insertToContactsTable += generateKeyValuePair( 'affiliate_name', affiliateContactListManifest[ i ].affiliate_name );
                }
                if ( affiliateContactListManifest[ i ].primary_contact_1_firstname ) {
                    insertToContactsTable += generateKeyValuePair( 'primary_contact_1_firstname', affiliateContactListManifest[ i ].primary_contact_1_firstname );
                }
                if ( affiliateContactListManifest[ i ].primary_contact_1_surname ) {
                    insertToContactsTable += generateKeyValuePair( 'primary_contact_1_surname', affiliateContactListManifest[ i ].primary_contact_1_surname );
                }
                if ( affiliateContactListManifest[ i ].primary_contact_1_username ) {
                    insertToContactsTable += generateKeyValuePair( 'primary_contact_1_username', affiliateContactListManifest[ i ].primary_contact_1_username );
                }
                if ( affiliateContactListManifest[ i ].primary_contact_1_email_address ) {
                    insertToContactsTable += generateKeyValuePair( 'primary_contact_1_email_address', affiliateContactListManifest[ i ].primary_contact_1_email_address );
                }
                if ( affiliateContactListManifest[ i ].primary_contact_1_designation ) {
                    insertToContactsTable += generateKeyValuePair( 'primary_contact_1_designation', affiliateContactListManifest[ i ].primary_contact_1_designation );
                }
                if ( affiliateContactListManifest[ i ].primary_contact_2_firstname ) {
                    insertToContactsTable += generateKeyValuePair( 'primary_contact_2_firstname', affiliateContactListManifest[ i ].primary_contact_2_firstname );
                }
                if ( affiliateContactListManifest[ i ].primary_contact_2_surname ) {
                    insertToContactsTable += generateKeyValuePair( 'primary_contact_2_surname', affiliateContactListManifest[ i ].primary_contact_2_surname );
                }
                if ( affiliateContactListManifest[ i ].primary_contact_2_username ) {
                    insertToContactsTable += generateKeyValuePair( 'primary_contact_2_username', affiliateContactListManifest[ i ].primary_contact_2_username );
                }
                if ( affiliateContactListManifest[ i ].primary_contact_2_email_address ) {
                    insertToContactsTable += generateKeyValuePair( 'primary_contact_2_email_address', affiliateContactListManifest[ i ].primary_contact_2_email_address );
                }
                if ( affiliateContactListManifest[ i ].primary_contact_2_designation ) {
                    insertToContactsTable += generateKeyValuePair( 'primary_contact_2_designation', affiliateContactListManifest[ i ].primary_contact_2_designation );
                }
                if ( affiliateContactListManifest[ i ].unique_id ) {
                    insertToContactsTable += generateKeyValuePair( 'unique_id', affiliateContactListManifest[ i ].unique_id );
                }
                if ( affiliateContactListManifest[ i ].dos_stamp ) {
                    insertToContactsTable += generateKeyValuePair( 'created_at', affiliateContactListManifest[ i ].dos_stamp );
                }
                insertToContactsTable += '\t},\n';
            }
            insertToContactsTable += '}';

            // Add the new Report into the Lua table.
            apiObj.postWithToken(
                'csrf',
                {
                    action: 'edit',
                    bot: true,
                    nocreate: true,
                    summary: 'Updating Affiliate Contact',
                    pageid: 39952, //[[Module:Affiliate_Contacts_Information]]
                    text: insertToContactsTable,
                    contentmodel: 'Scribunto'
                }
            );

            // Re-generate the Lua table based on `manifest`
            insertToArchiveTable = 'return {\n';
            for ( i = 0; i < contactToArchiveManifest.length; i++ ) {
                insertToArchiveTable += '\t{\n';
                if ( contactToArchiveManifest[ i ].affiliate_name ) {
                    insertToArchiveTable += generateKeyValuePair( 'affiliate_name', contactToArchiveManifest[ i ].affiliate_name );
                }
                if ( contactToArchiveManifest[ i ].username ) {
                    insertToArchiveTable += generateKeyValuePair( 'username', contactToArchiveManifest[ i ].username );
                }
                if ( contactToArchiveManifest[ i ].first_name ) {
                    insertToArchiveTable += generateKeyValuePair( 'first_name', contactToArchiveManifest[ i ].first_name );
                }
                if ( contactToArchiveManifest[ i ].surname ) {
                    insertToArchiveTable += generateKeyValuePair( 'surname', contactToArchiveManifest[ i ].surname );
                }
                if ( contactToArchiveManifest[ i ].email_address ) {
                    insertToArchiveTable += generateKeyValuePair( 'email_address', contactToArchiveManifest[ i ].email_address );
                }
                if ( contactToArchiveManifest[ i ].designation ) {
                    insertToArchiveTable += generateKeyValuePair( 'designation', contactToArchiveManifest[ i ].designation );
                }
                if ( contactToArchiveManifest[ i ].dos_stamp ) {
                    insertToArchiveTable += generateKeyValuePair( 'date_updated', contactToArchiveManifest[ i ].dos_stamp );
                }
                insertToArchiveTable += '\t},\n';
            }
            insertToArchiveTable += '}';

            // Add the previous group contact to the archives Lua table.
            apiObj.postWithToken(
                'csrf',
                {
                    action: 'edit',
                    bot: true,
                    nocreate: true,
                    summary: 'Archiving latest information',
                    pageid: 39954, //[[Module:Affiliate_Contacts_Information_Archive]]
                    text: insertToArchiveTable,
                    contentmodel: 'Scribunto'
                }
            ).then( function () {
                console.log( 'Previous Group Contact Archived' );
            } ).catch( function ( error ) {
                alert( 'Failed' );
                console.error( error );
            } );
        };

        updateAffiliateContactsInfo = function ( workingEntry, groupContact1, groupContact2 ) {
            if ( groupContact1 ) {
                // Detect if there is a change in group contact1
                workingEntry.primary_contact_1_firstname = ' ';
                workingEntry.primary_contact_1_surname = ' ';
                workingEntry.primary_contact_1_username = groupContact1;
                workingEntry.primary_contact_1_email_address = ' ';
                workingEntry.primary_contact_1_designation = ' ';
            } else if ( groupContact2 ) {
                // Detect if there is a change in group contact2
                workingEntry.primary_contact_2_firstname = ' ';
                workingEntry.primary_contact_2_surname = ' ';
                workingEntry.primary_contact_2_username = groupContact2;
                workingEntry.primary_contact_2_email_address = ' ';
                workingEntry.primary_contact_2_designation = ' ';
            } else if ( groupContact1 && groupContact2 ) {
                // Detect if there is a change in both group contact 1 and 2.
                workingEntry.primary_contact_1_firstname = ' ';
                workingEntry.primary_contact_1_surname = ' ';
                workingEntry.primary_contact_1_username = groupContact1;
                workingEntry.primary_contact_1_email_address = ' ';
                workingEntry.primary_contact_1_designation = ' ';
                workingEntry.primary_contact_2_firstname = ' ';
                workingEntry.primary_contact_2_surname = ' ';
                workingEntry.primary_contact_2_username = groupContact2;
                workingEntry.primary_contact_2_email_address = ' ';
                workingEntry.primary_contact_2_designation = ' ';
            }

            return workingEntry;
        };

        copyOrgInfoData = function () {
            var foreignAPI = new mw.ForeignApi( foreignWiki ),
                apiObject = new mw.Api(),
                entries,
                processedEntry,
                i, j,
                insertToTable,
                orgInfoEntries,
                orgInfoWorkingEntry,
                emailBody;

            /**
             *
             */
            apiObject.get( getModuleContent( 'Organization_Information' ) ).then( function ( officeData ) {
                orgInfoEntries = parseContentModule( officeData.query.pages );
                for ( j = 0; j < orgInfoEntries.length; j++ ) {
                    orgInfoWorkingEntry = cleanRawEntry( orgInfoEntries[ j ].value.fields );
                    officeGroupNames.push( orgInfoWorkingEntry.affiliate_name );
                }
                /**
                 * Pulling OrgInfo table information
                 *
                 */
                foreignAPI.get( getModuleContent( 'Organizational_Informations' ) ).then( function ( data ) {
                    entries = parseContentModule( data.query.pages );
                    // Re-generate the Lua table based on 'manifest'
                    insertToTable = 'return {\n';
                    for ( i = 0; i < entries.length; i++ ) {
                        processedEntry = cleanRawEntry( entries[ i ].value.fields );
                        /** Orange fields on the spreadsheet :
                         Affiliate Code
                         Affiliate Name
                         Affiliate Country
                         Languages*
                         Region
                         Affiliate Status
                         Affiliate Type
                         Origination Date
                         */
                        if ( processedEntry.recognition_status === 'recognised' ) {
                            metaGroupNames.push( processedEntry.group_name );
                            insertToTable += '\t{\n';
                            if ( processedEntry.affiliate_code ) {
                                insertToTable += generateKeyValuePair( 'affiliate_code', processedEntry.affiliate_code );
                            }
                            if ( processedEntry.group_name ) {
                                insertToTable += generateKeyValuePair( 'affiliate_name', processedEntry.group_name );
                            }
                            if ( processedEntry.group_country ) {
                                insertToTable += generateKeyValuePair( 'affiliate_country', processedEntry.group_country );
                            }
                            if ( processedEntry.region ) {
                                insertToTable += generateKeyValuePair( 'region', processedEntry.region );
                            }
                            if ( processedEntry.org_type ) {
                                insertToTable += generateKeyValuePair( 'affiliate_type', processedEntry.org_type );
                            }
                            if ( processedEntry.group_contact1 ) {
                                insertToTable += generateKeyValuePair( 'affiliate_contact1', processedEntry.group_contact1 );
                            }
                            if ( processedEntry.group_contact2 ) {
                                insertToTable += generateKeyValuePair( 'affiliate_contact2', processedEntry.group_contact2 );
                            }
                            if ( processedEntry.recognition_status ) {
                                insertToTable += generateKeyValuePair( 'status', processedEntry.recognition_status );
                            }
                            if ( processedEntry.agreement_date ) {
                                insertToTable += generateKeyValuePair( 'origination_date', processedEntry.agreement_date );
                            }
                            insertToTable += generateKeyValuePair( 'last_updated', getTimeNow() );
                            insertToTable += '\t},\n';
                        }
                    }
                    insertToTable += '}';

                    // Insert into newly created Affiliate Contacts Table as required
                    new mw.Api().postWithToken(
                        'csrf',
                        {
                            action: 'edit',
                            summary: 'Copying organization information from MetaWiki to this Affiliate Contacts Information...',
                            pageid: 39956, //[[Module:Organization_Information]],
                            text: insertToTable,
                            contentmodel: 'Scribunto'
                        }
                    ).done( function ( data ) {
                        console.log( 'Organization Info Synced' );
                    } );
                    /**
                     * Compare the two lists and create a new array with newly added group contact names
                     * */
                    for ( i = 0; i < metaGroupNames.length; i++ ) {
                        if ( officeGroupNames.indexOf( metaGroupNames[ i ] ) < 0 ) {
                            newAffiliates.push( metaGroupNames[ i ] );
                        }
                    }

                    for ( i = 0; i < newAffiliates.length; i++ ) {
                        emailBody = newAffiliates[ i ] + ' has added new group contacts.\n Please update the contact details on Office.';
                        sendEmailToMEStaff( emailBody );
                    }
                } );
            } ).then( function () {
                // var apiObject = new mw.Api();
                // apiObject.get( getModuleContent( 'Affiliate_Contacts_Information' ) ).then( function ( contactsData ) {
                //     apiObject.get( getModuleContent( 'Organization_Information' ) ).then( function ( orgInfoData ) {
                //         apiObject.get( getModuleContent( 'Affiliate_Contacts_Information_Archive' ) ).then( function ( archiveData ) {
                //             archivePreviousContact( contactsData, orgInfoData, archiveData );
                //         } );
                //     } );
                // } );
            });
        };

        /** Loading:
         * - The interface provided by mediawiki api
         * - Luaparse gadget that contains the logic to parse a Lua table
         * to an AST
         */
        mw.loader.using( [
            'mediawiki.api',
            'ext.gadget.luaparse'
        ] ).then( copyOrgInfoData() );
    }
}() );
