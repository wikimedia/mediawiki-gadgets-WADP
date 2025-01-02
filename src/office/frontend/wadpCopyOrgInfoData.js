/**
 * Data bridge porting group contact data from Meta into Office. The following
 * are the data points ported from office for each affiliate group contact.
 *
 * @author Alice China (AChina-WMF)
 */

( function () {
    'use strict';

    var foreign_wiki = 'https://meta.wikimedia.org/w/api.php',
        archivePreviousContact,
        cleanRawEntry,
        getFirstDayOfWeek,
        getModuleContent,
        generateNewAffiliateContacts,
        parseContentModule,
        sanitizeInput,
        generateKeyValuePair,
        updateAffiliateContactsInfo,
        sendEmailToMEStaff,
        new_affiliates = [],
        email_subject = '[WAC Portal] Affiliate Contact Changes',
        populateDigestTable;

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
        var res,
            jsonarray;

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

        // Should only be one result returned
        for ( i in sourceBlob ) {
            raw = sourceBlob[ i ].revisions[ 0 ][ '*' ];
            ast = luaparse.parse( raw );
            return ast.body[ 0 ].arguments[ 0 ].fields;
        }
    };

    /**
     * @param {string} body The email content/body.
     */
    sendEmailToMEStaff = function ( body ) {
        var MEStaff = [
                'AChina-WMF',
                'Xeno (WMF)',
                'RamzyM (WMF)',
            ],
            api = new mw.Api(),
            i,
            params;

        for ( i = 0; i < MEStaff.length; i++ ) {
            params = {
                action: 'emailuser',
                target: MEStaff[ i ],
                subject: email_subject,
                text: body,
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
        var date = new Date();
        var today = date.getDate();
        var current_day = date.getDay();
        var new_date = date.setDate( today - ( current_day || 7 ) );

        return new Date( new_date ).toISOString();
    };

    /**
     * This function builds the digest methos and writes the new reord back into the Digest table. One record is as
     * follows:
     * {
     *     date= "2024-04-14",
     *     affiliate_name: "Wikimedia Kenya",
     *     change = "contact1_changed",
     *     last_digest = "2024-04-14"
     * }
     *
     * @param {string} affiliate_name The name of the affiliate.
     * @param {string} change The change being recorded.
     */
    populateDigestTable = function ( affiliate_name, change ) {
        var api_object = new mw.Api();
        var date = getFirstDayOfWeek();

        api_object.get( getModuleContent( 'Affiliate_Contacts_Digest' ) ).then( function ( digest_data ) {

            var i, digest_entry, digest_entries, digest_manifest = [],
                new_contact_changes_manifest = [],
                contact_changes, insert_to_digest_table;

            digest_entries = parseContentModule( digest_data.query.pages );

            for ( i = 0; i < digest_entries.length; i++ ) {
                digest_entry = cleanRawEntry( digest_entries[ i ].value.fields );
                digest_manifest.push( digest_entry );
            }

            contact_changes = {
                date: date,
                affiliate_name: affiliate_name,
                change: change,
                last_digest: '-',
            };
            new_contact_changes_manifest.push( contact_changes );

            // Combine both manifest and write back to the digest table.
            digest_manifest = new_contact_changes_manifest.concat( digest_manifest );

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

        } ).catch( function ( error ) {
            alert( 'Failed' );
            console.error( error );
        } );

    };

    archivePreviousContact = function ( contactsData, orgInfoData, archiveData, newAffiliates ) {
        var apiObj = new mw.Api(),
            i, j,
            contactsDataEntries,
            contactsWorkingEntry,
            change_category = '', //Change categories are "contact1_changed", "contact2_changed",
            // "both_contacts_changed", "contacts_swapped", "new_contacts" and "archived_contacts"
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
            emailBody = '',
            newAffiliateRecord = {};

        contactsDataEntries = parseContentModule( contactsData.query.pages );
        orgInfoDataEntries = parseContentModule( orgInfoData.query.pages );

        contactToArchiveManifest = [];

        for ( i = 0; i < orgInfoDataEntries.length; i++ ) {
            orgInfoWorkingEntry = cleanRawEntry( orgInfoDataEntries[ i ].value.fields );

            // Check for new group contacts added
            if ( newAffiliates.includes( orgInfoWorkingEntry.affiliate_name ) ) {
                newAffiliateRecord = generateNewAffiliateContacts( orgInfoWorkingEntry );
                affiliateContactListManifest.push( newAffiliateRecord );
                change_category = 'new_contacts';
                populateDigestTable( orgInfoWorkingEntry.affiliate_name, change_category );
            }

            for ( j = 0; j < contactsDataEntries.length; j++ ) {
                contactsWorkingEntry = cleanRawEntry( contactsDataEntries[ j ].value.fields );
                /** XXX: If the affiliate has been derecognised, just delete
                 * it. In this case, delete means, just ignore.
                 */

                if (
                    orgInfoWorkingEntry.affiliate_name === contactsWorkingEntry.affiliate_name &&
                    orgInfoWorkingEntry.status === 'derecognised'
                ) {
                    // Archive group contacts and just ignore entirely from the contacts table.
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
                    change_category = 'archived_contacts';
                    populateDigestTable( orgInfoWorkingEntry.affiliate_name, change_category );
                    emailBody += 'Archiving derecognised affiliate contacts' +
                        ' and deleting from the contacts table\n';
                    break;
                }

                if ( orgInfoWorkingEntry.affiliate_name === contactsWorkingEntry.affiliate_name ) {
                    /** Edge case: User group contacts are both empty. If this special case is not
                     * handled, the record will pass all the below conditions leading to records
                     */

                    // being updated and notification being sent multiple times.
                    if ( orgInfoWorkingEntry.affiliate_contact1 === '' && orgInfoWorkingEntry.affiliate_contact2 === '' ) {
                        // We retain the current contacts on record and just send out a notification
                        affiliateContactListManifest.push( contactsWorkingEntry );
                        change_category = 'new_contacts';
                        populateDigestTable( orgInfoWorkingEntry.affiliate_name, change_category );
                        emailBody += orgInfoWorkingEntry.affiliate_name + ' has no group contacts on record. Both' +
                            ' group contact usernames are empty.\n';
                        break;
                    }

                    /** Edge case: User group contacts have been updated such that contact1 username and
                     * contact2 username are identical. In this case, if no change is detected, we do nothing and
                     * exit the loop. This will ensure that the record is not mistakenly detected as a swap.
                     */
                    if (
                        orgInfoWorkingEntry.affiliate_contact1 === orgInfoWorkingEntry.affiliate_contact2 &&
                        orgInfoWorkingEntry.affiliate_contact1 === contactsWorkingEntry.primary_contact_1_username &&
                        orgInfoWorkingEntry.affiliate_contact2 === contactsWorkingEntry.primary_contact_2_username
                    ) {
                        break;
                    }

                    /** Edge case: User group contacts don't change per se but they are just flipped. In this
                     * case, don't do much, just inform M&E staff. Also, this can happen too for just one of
                     * the contacts, so we need to detect it as well.
                     */
                    if (
                        orgInfoWorkingEntry.affiliate_contact1 === contactsWorkingEntry.primary_contact_2_username ||
                        orgInfoWorkingEntry.affiliate_contact2 === contactsWorkingEntry.primary_contact_1_username
                    ) {
                        /** We pass contact 1 and 2 from the OrgInfo table in place as they are already in
                         * the desired position. As in:
                         *
                         *      OrgInfo Table - Office
                         *      org_info_pc1 = x
                         *      org_info_pc2 = y
                         *
                         *      Contacts Table - Office
                         *      contact_pc1 = y
                         *      contact_pc2 = x
                         *
                         * Swapping
                         *      contact_pc1 = x (org_info_pc1)
                         *      contact_pc2 = y (org_info_pc2)
                         */
                        affiliateContactListManifest.push(
                            updateAffiliateContactsInfo( contactsWorkingEntry, orgInfoWorkingEntry.affiliate_contact1,
                                orgInfoWorkingEntry.affiliate_contact2
                            ) );
                        change_category = 'contacts_swapped';
                        populateDigestTable( orgInfoWorkingEntry.affiliate_name, change_category );
                        emailBody += 'One or both group contacts for ' + orgInfoWorkingEntry.affiliate_name + ' has been swapped.\n';
                        break;
                    }

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
                        affiliateContactListManifest.push(
                            updateAffiliateContactsInfo( contactsWorkingEntry, orgInfoWorkingEntry.affiliate_contact1,
                                false
                            ) );
                        contactToArchiveManifest.push( archive );
                        change_category = 'contact1_changed';
                        populateDigestTable( orgInfoWorkingEntry.affiliate_name, change_category );
                        emailBody += orgInfoWorkingEntry.affiliate_name + ' has changed Group Contact 1.\n';
                        break;
                    }

                    // Group contact 2 changed
                    if ( orgInfoWorkingEntry.affiliate_contact2 !== contactsWorkingEntry.primary_contact_2_username &&
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
                        affiliateContactListManifest.push( updateAffiliateContactsInfo( contactsWorkingEntry, false,
                            orgInfoWorkingEntry.affiliate_contact2
                        ) );
                        contactToArchiveManifest.push( archive );
                        change_category = 'contact2_changed';
                        populateDigestTable( orgInfoWorkingEntry.affiliate_name, change_category );
                        emailBody += orgInfoWorkingEntry.affiliate_name + ' has changed Group Contact 2.\n';
                        break;
                    }

                    // Both group contacts changed
                    if ( orgInfoWorkingEntry.affiliate_contact1 !== contactsWorkingEntry.primary_contact_1_username &&
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
                        affiliateContactListManifest.push(
                            updateAffiliateContactsInfo( contactsWorkingEntry, orgInfoWorkingEntry.affiliate_contact1,
                                orgInfoWorkingEntry.affiliate_contact2
                            ) );
                        change_category = 'both_contacts_changed';
                        populateDigestTable( orgInfoWorkingEntry.affiliate_name, change_category );
                        emailBody += orgInfoWorkingEntry.affiliate_name + ' has changed both Group Contact 1 and 2.\n';
                        break;
                    }

                    if ( orgInfoWorkingEntry.affiliate_contact1 === contactsWorkingEntry.primary_contact_1_username &&
                        orgInfoWorkingEntry.affiliate_contact2 === contactsWorkingEntry.primary_contact_2_username
                    ) {
                        affiliateContactListManifest.push( contactsWorkingEntry );
                        break;
                    }
                }
            }
        }

        if ( emailBody !== '' ) {
            sendEmailToMEStaff( emailBody );
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
                insertToContactsTable += generateKeyValuePair( 'affiliate_name',
                    affiliateContactListManifest[ i ].affiliate_name
                );
            }
            if ( affiliateContactListManifest[ i ].affiliate_code ) {
                insertToContactsTable += generateKeyValuePair( 'affiliate_code',
                    affiliateContactListManifest[ i ].affiliate_code
                );
            }
            if ( affiliateContactListManifest[ i ].affiliate_region || affiliateContactListManifest[ i ].affiliate_region === '' ) {
                insertToContactsTable += generateKeyValuePair( 'affiliate_region',
                    affiliateContactListManifest[ i ].affiliate_region
                );
            }
            if ( affiliateContactListManifest[ i ].primary_contact_1_firstname || affiliateContactListManifest[ i ].primary_contact_1_firstname === '' ) {
                insertToContactsTable += generateKeyValuePair( 'primary_contact_1_firstname',
                    affiliateContactListManifest[ i ].primary_contact_1_firstname
                );
            }
            if ( affiliateContactListManifest[ i ].primary_contact_1_surname || affiliateContactListManifest[ i ].primary_contact_1_surname === '' ) {
                insertToContactsTable += generateKeyValuePair( 'primary_contact_1_surname',
                    affiliateContactListManifest[ i ].primary_contact_1_surname
                );
            }
            if ( affiliateContactListManifest[ i ].primary_contact_1_username || affiliateContactListManifest[ i ].primary_contact_1_username === '' ) {
                insertToContactsTable += generateKeyValuePair( 'primary_contact_1_username',
                    affiliateContactListManifest[ i ].primary_contact_1_username
                );
            }
            if ( affiliateContactListManifest[ i ].primary_contact_1_email_address || affiliateContactListManifest[ i ].primary_contact_1_email_address === '' ) {
                insertToContactsTable += generateKeyValuePair( 'primary_contact_1_email_address',
                    affiliateContactListManifest[ i ].primary_contact_1_email_address
                );
            }
            if ( affiliateContactListManifest[ i ].primary_contact_1_designation || affiliateContactListManifest[ i ].primary_contact_1_designation === '' ) {
                insertToContactsTable += generateKeyValuePair( 'primary_contact_1_designation',
                    affiliateContactListManifest[ i ].primary_contact_1_designation
                );
            }
            if ( affiliateContactListManifest[ i ].primary_contact_2_firstname || affiliateContactListManifest[ i ].primary_contact_2_firstname === '' ) {
                insertToContactsTable += generateKeyValuePair( 'primary_contact_2_firstname',
                    affiliateContactListManifest[ i ].primary_contact_2_firstname
                );
            }
            if ( affiliateContactListManifest[ i ].primary_contact_2_surname || affiliateContactListManifest[ i ].primary_contact_2_surname === '' ) {
                insertToContactsTable += generateKeyValuePair( 'primary_contact_2_surname',
                    affiliateContactListManifest[ i ].primary_contact_2_surname
                );
            }
            if ( affiliateContactListManifest[ i ].primary_contact_2_username || affiliateContactListManifest[ i ].primary_contact_2_username === '' ) {
                insertToContactsTable += generateKeyValuePair( 'primary_contact_2_username',
                    affiliateContactListManifest[ i ].primary_contact_2_username
                );
            }
            if ( affiliateContactListManifest[ i ].primary_contact_2_email_address || affiliateContactListManifest[ i ].primary_contact_2_email_address === '' ) {
                insertToContactsTable += generateKeyValuePair( 'primary_contact_2_email_address',
                    affiliateContactListManifest[ i ].primary_contact_2_email_address
                );
            }
            if ( affiliateContactListManifest[ i ].primary_contact_2_designation || affiliateContactListManifest[ i ].primary_contact_2_designation === '' ) {
                insertToContactsTable += generateKeyValuePair( 'primary_contact_2_designation',
                    affiliateContactListManifest[ i ].primary_contact_2_designation
                );
            }
            if ( affiliateContactListManifest[ i ].unique_id ) {
                insertToContactsTable += generateKeyValuePair( 'unique_id',
                    affiliateContactListManifest[ i ].unique_id
                );
            }
            if ( affiliateContactListManifest[ i ].dos_stamp ) {
                insertToContactsTable += generateKeyValuePair( 'created_at',
                    affiliateContactListManifest[ i ].dos_stamp
                );
            }
            insertToContactsTable += '\t},\n';
        }
        insertToContactsTable += '}';

        apiObj.postWithToken(
            'csrf',
            {
                action: 'edit',
                bot: true,
                nocreate: true,
                summary: 'Updating Affiliate Contact',
                pageid: 39952, // [[Module:Affiliate_Contacts_Information]]
                text: insertToContactsTable,
                contentmodel: 'Scribunto'
            }
        ).then( function () {
            // Re-generate the Lua table based on `manifest`
            insertToArchiveTable = 'return {\n';
            for ( i = 0; i < contactToArchiveManifest.length; i++ ) {
                insertToArchiveTable += '\t{\n';
                if ( contactToArchiveManifest[ i ].affiliate_name ) {
                    insertToArchiveTable += generateKeyValuePair( 'affiliate_name',
                        contactToArchiveManifest[ i ].affiliate_name
                    );
                }
                if ( contactToArchiveManifest[ i ].username ) {
                    insertToArchiveTable += generateKeyValuePair( 'username', contactToArchiveManifest[ i ].username );
                }
                if ( contactToArchiveManifest[ i ].first_name ) {
                    insertToArchiveTable += generateKeyValuePair( 'first_name',
                        contactToArchiveManifest[ i ].first_name
                    );
                }
                if ( contactToArchiveManifest[ i ].surname ) {
                    insertToArchiveTable += generateKeyValuePair( 'surname', contactToArchiveManifest[ i ].surname );
                }
                if ( contactToArchiveManifest[ i ].email_address ) {
                    insertToArchiveTable += generateKeyValuePair( 'email_address',
                        contactToArchiveManifest[ i ].email_address
                    );
                }
                if ( contactToArchiveManifest[ i ].designation ) {
                    insertToArchiveTable += generateKeyValuePair( 'designation',
                        contactToArchiveManifest[ i ].designation
                    );
                }
                if ( contactToArchiveManifest[ i ].dos_stamp ) {
                    insertToArchiveTable += generateKeyValuePair( 'date_updated',
                        contactToArchiveManifest[ i ].dos_stamp
                    );
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
                    pageid: 39954, // [[Module:Affiliate_Contacts_Information_Archive]]
                    text: insertToArchiveTable,
                    contentmodel: 'Scribunto'
                }
            );
            console.log( 'Previous Group Contact Archived' );
        } ).catch( function ( error ) {
            alert( 'Failed' );
            console.error( error );
        } );
    };

    updateAffiliateContactsInfo = function ( workingEntry, groupContact1, groupContact2 ) {
        //swapped affiliates should have the data populated swapped as well
        //emails should include description of updates required
        if ( groupContact1 || groupContact1 === '' ) {
            // Detect if there is a change in group contact1
            workingEntry.primary_contact_1_firstname = '';
            workingEntry.primary_contact_1_surname = '';
            workingEntry.primary_contact_1_username = groupContact1;
            workingEntry.primary_contact_1_email_address = '';
            workingEntry.primary_contact_1_designation = '';
        }
        if ( groupContact2 || groupContact2 === '' ) {
            // Detect if there is a change in group contact2
            workingEntry.primary_contact_2_firstname = '';
            workingEntry.primary_contact_2_surname = '';
            workingEntry.primary_contact_2_username = groupContact2;
            workingEntry.primary_contact_2_email_address = '';
            workingEntry.primary_contact_2_designation = '';
        }

        return workingEntry;
    };

    generateNewAffiliateContacts = function ( affiliateRecord ) {
        var uniqueId = ( Math.random() + 1 ).toString( 36 ).substring( 4 );
        return {
            affiliate_name: affiliateRecord.affiliate_name,
            affiliate_code: affiliateRecord.affiliate_code,
            affiliate_region: affiliateRecord.region,
            primary_contact_1_firstname: '',
            primary_contact_1_surname: '',
            primary_contact_1_username: affiliateRecord.affiliate_contact1,
            primary_contact_1_email_address: '',
            primary_contact_1_designation: '',
            primary_contact_2_firstname: '',
            primary_contact_2_surname: '',
            primary_contact_2_username: affiliateRecord.affiliate_contact2,
            primary_contact_2_email_address: '',
            primary_contact_2_designation: '',
            unique_id: uniqueId,
        };

    };

    function copyOrgInfoData () {
        var apiObject = new mw.Api(),
            foreignAPI = new mw.ForeignApi( foreign_wiki ),
            entries,
            processedEntry,
            i,
            insertToTable,
            status = [ 'recognised', 'deferred', 'suspended' ],
            officeGroupNames = [],
            metaGroupNames = [];

        apiObject.get( getModuleContent( 'Organization_Information' ) ).then( function ( officeOrgInfoData ) {
            var officeOrgInfoEntries,
                processedOfficeOrgInfoEntry;

            officeOrgInfoEntries = parseContentModule( officeOrgInfoData.query.pages );

            for ( i = 0; i < officeOrgInfoEntries.length; i++ ) {
                processedOfficeOrgInfoEntry = cleanRawEntry( officeOrgInfoEntries[ i ].value.fields );
                officeGroupNames.push( processedOfficeOrgInfoEntry.affiliate_name );
            }

            // Pulling OrgInfo table information
            foreignAPI.get( getModuleContent( 'Organizational_Informations' ) ).then( function ( data ) {
                var emailBody = '';

                entries = parseContentModule( data.query.pages );
                // Re-generate the Lua table based on 'manifest'
                insertToTable = 'return {\n';
                for ( i = 0; i < entries.length; i++ ) {
                    processedEntry = cleanRawEntry( entries[ i ].value.fields );
                    // Orange fields on the spreadsheet :
                    // - Affiliate Code
                    // - Affiliate Name
                    // - Affiliate Country
                    // - Region
                    // - Affiliate Type
                    // - Affiliate Contact 1
                    // - Affiliate Contact 2
                    // - Status
                    // - Origination Date
                    // - Last Updated
                    //
                    // TODO: We need a way to track affiliates that are derecognized so that we
                    // can notify the affiliate contacts table.
                    if ( status.includes( processedEntry.recognition_status ) ) {
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
                            insertToTable += generateKeyValuePair( 'affiliate_contact1',
                                processedEntry.group_contact1
                            );
                        } else {
                            insertToTable += generateKeyValuePair( 'affiliate_contact1', '' );
                        }
                        if ( processedEntry.group_contact2 ) {
                            insertToTable += generateKeyValuePair( 'affiliate_contact2',
                                processedEntry.group_contact2
                            );
                        } else {
                            insertToTable += generateKeyValuePair( 'affiliate_contact2', '' );
                        }
                        if ( processedEntry.recognition_status ) {
                            insertToTable += generateKeyValuePair( 'status', processedEntry.recognition_status );
                        }
                        if ( processedEntry.agreement_date ) {
                            insertToTable += generateKeyValuePair( 'origination_date', processedEntry.agreement_date );
                        }
                        if ( processedEntry.unique_id ) {
                            insertToTable += generateKeyValuePair( 'unique_id', processedEntry.unique_id );
                        }
                        if ( processedEntry.dos_stamp ) {
                            insertToTable += generateKeyValuePair( 'last_updated', processedEntry.dos_stamp );
                        }
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
                        pageid: 39956, // [[Module:Organization_Information]],
                        text: insertToTable,
                        contentmodel: 'Scribunto'
                    }
                ).done( function () {
                    // Compare the two lists and create a new array with newly added group contact names.
                    //
                    // NOTE: metaGroupNames has objects instead that we can reference the group name from
                    // each object in the list.
                    for ( i = 0; i < metaGroupNames.length; i++ ) {
                        if ( officeGroupNames.indexOf( metaGroupNames[ i ] ) < 0 ) {
                            new_affiliates.push( metaGroupNames[ i ] );
                        }
                    }

                    // XXX: Build the email list for new affiliates added to office from meta and notify M&E
                    // staff to update their contacts on Office.
                    for ( i = 0; i < new_affiliates.length; i++ ) {
                        emailBody = 'A new affiliate ' + new_affiliates[ i ] + ' has been added, please update the contact details on Office.\n';
                    }
                    if ( emailBody ) {
                        sendEmailToMEStaff( emailBody );
                    }

                    apiObject.get( getModuleContent( 'Affiliate_Contacts_Information' ) )
                        .then( function ( contactsData ) {
                            apiObject.get( getModuleContent( 'Organization_Information' ) )
                                .then( function ( orgInfoData ) {
                                    apiObject.get( getModuleContent( 'Affiliate_Contacts_Information_Archive' ) )
                                        .then( function ( archiveData ) {
                                            archivePreviousContact( contactsData, orgInfoData, archiveData,
                                                new_affiliates
                                            );
                                        } );
                                } );
                        } );
                } );

            } );
        } );
    }

    /**
     * Loading:
     * - The interface provided by mediawiki api.
     * - Luaparse gadget that contains the logic to parse a Lua table
     *   to an AST.
     */
    mw.loader.using( [
        'mediawiki.api',
        'ext.gadget.luaparse'
    ] ).then( copyOrgInfoData );
}() );
