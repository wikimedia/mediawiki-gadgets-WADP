( function () {
    'use strict';

    var AffiliateLookupTextInputWidget, archiveExistingContacts,
        archiveContactOne, archiveContactTwo, cleanRawEntry,
        ContactsExistsException, convertDateToDdMmYyyyFormat,
        convertDateToYyyyMmDdFormat, generateKeyValuePair, getModuleContent,
        getWikiPageContent, getAffiliatesList, getRelevantRawEntry,
        openContactWindow, openMessageWindow, parseContentModule, sanitizeInput,
        sendEmailToMEStaff, switchGroupContacts, updateGroupContacts,
        validateEmail, windowManager;
    var foreignWiki = 'https://meta.wikimedia.org/w/api.php';
    var user = mw.config.values.wgUserName;
    var me_staff = [ 'DNdubane (WMF)', 'DAlangi (WMF)', 'AChina-WMF', 'MKaur (WMF)', 'JAnstee (WMF)', 'Xeno (WMF)', 'Keegan (WMF)', 'Ramzym-WMF', 'Mervat (WMF)'
    ];

    function renderAffiliateContactInfoForm () {
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
            // Put in a format our calendar OOUI will feed on, in YYYY-MM-DD
            // format
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
            var res;
            res = '\t\t'.concat( k, ' = \'', v, '\'' );
            res += ',\n';
            return res;
        };

        /**
         * Takes Lua-formatted content from [[Module:Activities_Reports]]
         * content and returns an abstract syntax tree.
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
                    if ( entries[ i ].value.fields[ j ].key.name === 'unique_id' && entries[ i ].value.fields[ j ].value.value === uniqueId ) {
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
            var entryData = {}, i, j;
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
         * Validate that the provided email address is a valid email address
         * @param email
         */
        validateEmail = function ( email ) {
            var regex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
            var result = regex.test( email.toLowerCase() );
            return result;
        };

        /**
         * Rebuild an existing entry to interchange the first and second
         * group contact
         *
         * @param {} rawEntry
         * @return updatedEntry
         */
        switchGroupContacts = function ( rawEntry ) {
            var groupContact2_firstname = rawEntry.primary_contact_2_firstname,
                groupContact2_surname = rawEntry.primary_contact_2_surname,
                groupContact2_username = rawEntry.primary_contact_2_username,
                groupContact2_email = rawEntry.primary_contact_2_email_address,
                groupContact2_designation = rawEntry.primary_contact_2_designation;

            rawEntry.primary_contact_2_firstname = rawEntry.primary_contact_1_firstname;
            rawEntry.primary_contact_2_surname = rawEntry.primary_contact_1_surname;
            rawEntry.primary_contact_2_username = rawEntry.primary_contact_1_username;
            rawEntry.primary_contact_2_email_address = rawEntry.primary_contact_1_email_address;
            rawEntry.primary_contact_2_designation = rawEntry.primary_contact_1_designation;

            rawEntry.primary_contact_1_firstname = groupContact2_firstname;
            rawEntry.primary_contact_1_surname = groupContact2_surname;
            rawEntry.primary_contact_1_username = groupContact2_username;
            rawEntry.primary_contact_1_email_address = groupContact2_email;
            rawEntry.primary_contact_1_designation = groupContact2_designation;

            return rawEntry;
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
                subject: '[Affiliates Contacts Management] ' + subject,
                text: body,
                format: 'json'
            }, api = new mw.Api();

            api.postWithToken( 'csrf', params ).then( function ( data ) {
                // No op
            } );
        };

        /**
         * Get an entire content (wikitext) of a given page
         *
         * @param rawEntry
         * @param dialog
         * @param updateFlag
         * @param {String} updateFlag
         * @return rawEntry
         */
        updateGroupContacts = function ( rawEntry, dialog, updateFlag ) {
            var emailSubject = '';
            var emailBody = '';
            if ( updateFlag === 'contact1Updated' ) {
                //Archive the previous contact 1 record
                archiveExistingContacts( rawEntry, 'Contact1' );
                //Update email content
                emailSubject += 'Group Contact One updated for ' + rawEntry.affiliate_name;
                emailBody += 'Hello, \n Please note that the first group contact for the above affiliate has been updated.\n - Affiliate Contacts Management';
                //Update the record
                rawEntry.primary_contact_1_firstname = dialog.field_primary_contact_1_firstname.getValue();
                rawEntry.primary_contact_1_surname = dialog.field_primary_contact_1_surname.getValue();
                rawEntry.primary_contact_1_username = dialog.field_primary_contact_1_username.getValue();
                rawEntry.primary_contact_1_email_address = dialog.field_primary_contact_1_email_address.getValue();
                rawEntry.primary_contact_1_designation = dialog.field_primary_contact_1_designation.getMenu().findSelectedItem().getData();
            } else if ( updateFlag === 'contact2Updated' ) {
                //Archive the previous contact 2 record
                archiveExistingContacts( rawEntry, 'Contact2' );
                //Update email content
                emailSubject += 'Group Contact Two updated for ' + rawEntry.affiliate_name;
                emailBody += 'Hello, \n Please note that the second group contact for the above affiliate has been updated.\n - Affiliate Contacts Management';
                //Update the record
                rawEntry.primary_contact_2_firstname = dialog.field_primary_contact_2_firstname.getValue();
                rawEntry.primary_contact_2_surname = dialog.field_primary_contact_2_surname.getValue();
                rawEntry.primary_contact_2_username = dialog.field_primary_contact_2_username.getValue();
                rawEntry.primary_contact_2_email_address = dialog.field_primary_contact_2_email_address.getValue();
                rawEntry.primary_contact_2_designation = dialog.field_primary_contact_2_designation.getMenu().findSelectedItem().getData();
            } else if ( updateFlag === 'bothUpdated' ) {
                //Archive both of the previous contacts
                archiveExistingContacts( rawEntry, 'Contact1' );
                archiveExistingContacts( rawEntry, 'Contact2' );
                //Update email content
                emailSubject += 'Group Contacts updated for ' + rawEntry.affiliate_name;
                emailBody += 'Hello, \n Please note that both the first and second group contact for the above affiliate have been updated.\n - Affiliate Contacts Management';
                //Update the records
                //Contact 1
                rawEntry.primary_contact_1_firstname = dialog.field_primary_contact_1_firstname.getValue();
                rawEntry.primary_contact_1_surname = dialog.field_primary_contact_1_surname.getValue();
                rawEntry.primary_contact_1_username = dialog.field_primary_contact_1_username.getValue();
                rawEntry.primary_contact_1_email_address = dialog.field_primary_contact_1_email_address.getValue();
                rawEntry.primary_contact_1_designation = dialog.field_primary_contact_1_designation.getMenu().findSelectedItem().getData();
                //Contact 2
                rawEntry.primary_contact_2_firstname = dialog.field_primary_contact_2_firstname.getValue();
                rawEntry.primary_contact_2_surname = dialog.field_primary_contact_2_surname.getValue();
                rawEntry.primary_contact_2_username = dialog.field_primary_contact_2_username.getValue();
                rawEntry.primary_contact_2_email_address = dialog.field_primary_contact_2_email_address.getValue();
                rawEntry.primary_contact_2_designation = dialog.field_primary_contact_2_designation.getMenu().findSelectedItem().getData();
            }
            //TODO Loop through M&E Staff sending emails dynamically
            sendEmailToMEStaff( emailSubject, emailBody, 'DNdubane (WMF)' );
            sendEmailToMEStaff( emailSubject, emailBody, 'AChina-WMF' );
            sendEmailToMEStaff( emailSubject, emailBody, 'DAlangi (WMF)' );
            return rawEntry;
        };

        /**
         * Save already existing group contacts to the Archive Lua table
         */
        archiveExistingContacts = function ( previousContact, contactFlag ) {
            var apiObj = new mw.Api();
            apiObj.get( getModuleContent( 'Affiliate_Contacts_Information_Archive' ) ).then( function ( data ) {
                var i, insertToTable, processWorkingEntry, editSummary,
                    manifest = [], workingEntry, entries,
                    contactArchiveUpdated = false, updateEntry,
                    updatedWorkingEntry;

                updateEntry = function ( workingEntry ) {
                    workingEntry.date_updated = new Date().toString();
                    return workingEntry;
                };
                entries = parseContentModule( data.query.pages );

                // Cycle through existing entries. If we are editing an existing
                // entry, that entry will be modified in place.
                for ( i = 0; i < entries.length; i++ ) {
                    workingEntry = cleanRawEntry( entries[ i ].value.fields );
                    if ( contactFlag === 'Contact1' && workingEntry.username === previousContact.primary_contact_1_username ) {
                        contactArchiveUpdated = true;
                        updatedWorkingEntry = updateEntry( workingEntry );
                        manifest.push( updatedWorkingEntry );
                    } else if ( contactFlag === 'Contact2' && workingEntry.username === previousContact.primary_contact_2_username ) {
                        contactArchiveUpdated = true;
                        updatedWorkingEntry = updateEntry( workingEntry );
                        manifest.push( updatedWorkingEntry );
                    } else {
                        manifest.push( workingEntry );
                    }
                }
                archiveContactOne = function ( workingEntry ) {
                    if ( previousContact.primary_contact_1_username ) {
                        workingEntry.username = previousContact.primary_contact_1_username;
                    }
                    if ( previousContact.primary_contact_1_firstname ) {
                        workingEntry.first_name = previousContact.primary_contact_1_firstname;
                    }
                    if ( previousContact.primary_contact_1_surname ) {
                        workingEntry.surname = previousContact.primary_contact_1_surname;
                    }
                    if ( previousContact.primary_contact_1_email_address ) {
                        workingEntry.email_address = previousContact.primary_contact_1_email_address;
                    }
                    if ( previousContact.primary_contact_1_designation ) {
                        workingEntry.designation = previousContact.primary_contact_1_designation;
                    }
                    workingEntry.group_contact_position = 1;

                    return workingEntry;
                };

                archiveContactTwo = function ( workingEntry ) {
                    if ( previousContact.primary_contact_2_username ) {
                        workingEntry.username = previousContact.primary_contact_2_username;
                    }
                    if ( previousContact.primary_contact_2_firstname ) {
                        workingEntry.first_name = previousContact.primary_contact_2_firstname;
                    }
                    if ( previousContact.primary_contact_2_surname ) {
                        workingEntry.surname = previousContact.primary_contact_2_surname;
                    }
                    if ( previousContact.primary_contact_2_email_address ) {
                        workingEntry.email_address = previousContact.primary_contact_2_email_address;
                    }
                    if ( previousContact.primary_contact_2_designation ) {
                        workingEntry.designation = previousContact.primary_contact_2_designation;
                    }
                    workingEntry.group_contact_position = 2;

                    return workingEntry;
                };

                /**
                 * Compares a given [[Module:Affiliate_Contacts_Information]]
                 * entry against the edit fields and applies changes where
                 * relevant.
                 *
                 * @param {Object} workingEntry the entry being worked on
                 * @return {Object} The same entry but with modifications
                 */
                processWorkingEntry = function ( workingEntry ) {
                    if ( previousContact.affiliate_name ) {
                        workingEntry.affiliate_name = previousContact.affiliate_name;
                    }
                    if ( contactFlag === 'Contact1' ) {
                        workingEntry = archiveContactOne( workingEntry );
                    } else if ( contactFlag === 'Contact2' ) {
                        workingEntry = archiveContactTwo( workingEntry );
                    }

                    return workingEntry;
                };

                // No unique ID means this is a new entry
                if ( !contactArchiveUpdated ) {
                    workingEntry = {
                        unique_id: Math.random().toString( 36 ).substring( 2 ),
                        date_updated: new Date().toString()
                    };
                    workingEntry = processWorkingEntry( workingEntry );
                    editSummary = 'Adding Group Contact(s) for :  ' + workingEntry.affiliate_name + 'to contact archive';
                    manifest.push( workingEntry );
                }

                // Re-generate the Lua table based on `manifest`
                insertToTable = 'return {\n';
                for ( i = 0; i < manifest.length; i++ ) {
                    insertToTable += '\t{\n';
                    if ( manifest[ i ].affiliate_name ) {
                        insertToTable += generateKeyValuePair( 'affiliate_name', manifest[ i ].affiliate_name );
                    }
                    if ( manifest[ i ].username ) {
                        insertToTable += generateKeyValuePair( 'username', manifest[ i ].username );
                    }
                    if ( manifest[ i ].first_name ) {
                        insertToTable += generateKeyValuePair( 'first_name', manifest[ i ].first_name );
                    }
                    if ( manifest[ i ].surname ) {
                        insertToTable += generateKeyValuePair( 'surname', manifest[ i ].surname );
                    }
                    if ( manifest[ i ].email_address ) {
                        insertToTable += generateKeyValuePair( 'email_address', manifest[ i ].email_address );
                    }
                    if ( manifest[ i ].designation ) {
                        insertToTable += generateKeyValuePair( 'designation', manifest[ i ].designation );
                    }
                    if ( manifest[ i ].group_contact_position ) {
                        insertToTable += generateKeyValuePair( 'group_contact_position', manifest[ i ].group_contact_position );
                    }
                    if ( manifest[ i ].unique_id ) {
                        insertToTable += generateKeyValuePair( 'unique_id', manifest[ i ].unique_id );
                    }
                    if ( manifest[ i ].created_at ) {
                        insertToTable += generateKeyValuePair( 'created_at', manifest[ i ].created_at );
                    }
                    if ( manifest[ i ].updated_at ) {
                        insertToTable += generateKeyValuePair( 'updated_at', manifest[ i ].updated_at );
                    }
                    insertToTable += '\t},\n';
                }
                insertToTable += '}';

                // Add the previous group contact to the archives Lua table.
                apiObj.postWithToken( 'csrf', {
                    action: 'edit',
                    bot: true,
                    nocreate: true,
                    summary: editSummary,
                    pageid: 39954, //[[Module:Affiliate_Contacts_Information_Archive]]
                    text: insertToTable,
                    contentmodel: 'Scribunto'
                } ).then( function () {
                    console.log( 'Previous Group Contact Archived' );
                } ).catch( function ( error ) {
                    alert( 'Failed' );
                    dialog.close();
                    console.error( error );
                } );
            } );
        };

        /**
         * Error Class
         */
        ContactsExistsException = function () {
            this.message = 'The Group Contacts provided already exist for this affiliate.';
            this.name = 'ContactsExistsException';
        };

        /**
         * Subclass ProcessDialog
         *
         * @class ContactInfoEditor
         * @extends OO.ui.ProcessDialog
         *
         * @constructor
         * @param {Object} config
         */
        function ContactInfoEditor ( config ) {
            this.affiliate_name = '';
            this.primary_contact_1_firstname = '';
            this.primary_contact_1_surname = '';
            this.primary_contact_1_username = '';
            this.primary_contact_1_email_address = '';
            this.primary_contact_1_designation = '';
            this.primary_contact_1_other_input = '';
            this.primary_contact_2_firstname = '';
            this.primary_contact_2_surname = '';
            this.primary_contact_2_username = '';
            this.primary_contact_2_email_address = '';
            this.primary_contact_2_designation = '';
            this.primary_contact_2_other_input = '';
            this.dos_stamp = '';

            if ( config.unique_id ) {
                this.uniqueId = config.unique_id;
            }
            if ( config.affiliate_name ) {
                this.affiliate_name = config.affiliate_name;
            }
            if ( config.primary_contact_1_firstname ) {
                this.primary_contact_1_firstname = config.primary_contact_1_firstname;
            }
            if ( config.primary_contact_1_surname ) {
                this.primary_contact_1_surname = config.primary_contact_1_surname;
            }
            if ( config.primary_contact_1_username ) {
                this.primary_contact_1_username = config.primary_contact_1_username;
            }
            if ( config.primary_contact_1_email_address ) {
                this.primary_contact_1_email_address = config.primary_contact_1_email_address;
            }
            if ( config.primary_contact_1_designation ) {
                this.primary_contact_1_designation = config.primary_contact_1_designation;
            }
            if ( config.primary_contact_1_other_input ) {
                this.primary_contact_1_other_input = config.primary_contact_1_other_input;
            }
            if ( config.primary_contact_2_firstname ) {
                this.primary_contact_2_firstname = config.primary_contact_2_firstname;
            }
            if ( config.primary_contact_2_surname ) {
                this.primary_contact_2_surname = config.primary_contact_2_surname;
            }
            if ( config.primary_contact_2_username ) {
                this.primary_contact_2_username = config.primary_contact_2_username;
            }
            if ( config.primary_contact_2_email_address ) {
                this.primary_contact_2_email_address = config.primary_contact_2_email_address;
            }
            if ( config.primary_contact_2_designation ) {
                this.primary_contact_2_designation = config.primary_contact_2_designation;
            }
            if ( config.primary_contact_2_other_input ) {
                this.primary_contact_2_other_input = config.primary_contact_2_other_input;
            }
            if ( config.dos_stamp ) {
                this.dos_stamp = config.dos_stamp;
            }
            ContactInfoEditor.super.call( this, config );
        }

        OO.inheritClass( ContactInfoEditor, OO.ui.ProcessDialog );

        ContactInfoEditor.static.name = 'contactInfoEditor';
        ContactInfoEditor.static.title = 'Affiliate Contact Uploader Form'; // gadgetMsg['org-info-header'];
        ContactInfoEditor.static.actions = [ {
            action: 'continue', modes: 'edit', label: 'Submit', //gadgetMsg['submit-button'],
            flags: [ 'primary', 'constructive' ]
        }, {
            action: 'cancel', modes: 'edit', label: 'Cancel', //gadgetMsg['cancel-button'],
            flags: 'safe'
        }
        ];

        /**
         * Use the initialize() method to add content to the dialog's $body,
         * to initialize widgets, and to set up event handlers.
         */
        ContactInfoEditor.prototype.initialize = function () {
            ContactInfoEditor.super.prototype.initialize.call( this );
            this.content = new OO.ui.PanelLayout( {
                padded: true, expanded: false
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

            // Popup to be used to notify user to provide valid emails
            this.fieldEmailPopup = new OO.ui.PopupWidget( {
                $content: $( '<p style="color: red; text-align: center;">Error! Invalid email provided. Check and try submitting again.</p>' ),
                padded: true,
                width: 400,
                height: 90,
                head: true,
                id: 'wadp-popup-widget-position'
            } );

            // Popup to be used to notify user that contacts provided already
            // exists
            this.fieldContactsExistPopup = new OO.ui.PopupWidget( {
                $content: $( '<p style="color: red; text-align: center;">Error! Contacts provided already exist for this affiliate. Check and try submitting again.</p>' ),
                padded: true,
                width: 400,
                height: 90,
                head: true,
                id: 'wadp-popup-widget-position'
            } );

            // this.field_affiliate_name = new
            // AffiliateLookupTextInputWidget(this.affiliate_name);

            this.field_affiliate_name = new OO.ui.TextInputWidget( {
                labelPosition: 'before',
                icon: 'userGroup',
                value: this.affiliate_name,
                classes: [ 'full-width' ],
                indicator: 'required',
                required: true
            } );

            this.field_primary_contact_1_label = new OO.ui.LabelWidget( {
                label: 'First Primary Contact'
            } );
            this.field_primary_contact_1_firstname = new OO.ui.TextInputWidget( {
                labelPosition: 'before',
                icon: 'userAvatar',
                value: this.primary_contact_1_firstname, // placeholder: 'First
                                                         // name'
                // //gadgetMsg['group-membership-page-link']
                classes: [ 'full-width' ]
            } );
            this.field_primary_contact_1_surname = new OO.ui.TextInputWidget( {
                labelPosition: 'before',
                icon: 'userAvatar',
                value: this.primary_contact_1_surname, // placeholder: 'Surname'
                // //gadgetMsg['group-membership-page-link']
                classes: [ 'full-width' ]
            } );
            this.field_primary_contact_1_username = new OO.ui.TextInputWidget( {
                labelPosition: 'before',
                icon: 'userAvatar',
                value: this.primary_contact_1_username, // placeholder:
                                                        // 'Surname'
                // //gadgetMsg['group-membership-page-link']
                classes: [ 'full-width' ]
            } );
            this.field_primary_contact_1_email_address = new OO.ui.TextInputWidget( {
                labelPosition: 'before',
                icon: 'newspaper',
                value: this.primary_contact_1_email_address, // placeholder:
                                                             // 'Email Address'
                // //gadgetMsg['group-membership-page-link']
                classes: [ 'full-width' ],
                indicator: 'required',
                required: true
            } );
            this.field_primary_contact_1_other_input = new OO.ui.TextInputWidget( {
                labelPosition: 'before',
                icon: 'logoWikimedia',
                value: this.field_primary_contact_1_other_input, // placeholder:
                                                                 // 'Email
                                                                 // Address'
                // //gadgetMsg['group-membership-page-link']
                classes: [ 'full-width' ]
            } );
            this.field_primary_contact_2_label = new OO.ui.LabelWidget( {
                label: 'Second Primary Contact'
            } );
            this.field_primary_contact_2_firstname = new OO.ui.TextInputWidget( {
                labelPosition: 'before',
                icon: 'userAvatar',
                value: this.primary_contact_2_firstname, // placeholder: 'First
                                                         // name'
                // //gadgetMsg['group-membership-page-link']
                classes: [ 'full-width' ]
            } );
            this.field_primary_contact_2_surname = new OO.ui.TextInputWidget( {
                labelPosition: 'before',
                icon: 'userAvatar',
                value: this.primary_contact_2_surname, // placeholder: 'Surname'
                // //gadgetMsg['group-membership-page-link']
                classes: [ 'full-width' ]
            } );
            this.field_primary_contact_2_username = new OO.ui.TextInputWidget( {
                labelPosition: 'before',
                icon: 'userAvatar',
                value: this.primary_contact_2_username, // placeholder:
                                                        // 'Surname'
                // //gadgetMsg['group-membership-page-link']
                classes: [ 'full-width' ]
            } );
            this.field_primary_contact_2_email_address = new OO.ui.TextInputWidget( {
                labelPosition: 'before',
                icon: 'newspaper',
                value: this.primary_contact_2_email_address, // placeholder:
                                                             // 'Email Address'
                // //gadgetMsg['group-membership-page-link']
                classes: [ 'full-width' ],
                indicator: 'required',
                required: true
            } );
            this.field_primary_contact_2_other_input = new OO.ui.TextInputWidget( {
                labelPosition: 'before',
                icon: 'logoWikimedia',
                value: this.field_primary_contact_2_other_input, // placeholder:
                                                                 // 'Email
                                                                 // Address'
                // //gadgetMsg['group-membership-page-link']
                classes: [ 'full-width' ]
            } );

            /* Get today's date in YYYY/MM/DD format. dos stands for "date of submission" */
            this.dos_stamp = new Date().toJSON().slice( 0, 10 ).replace( /-/g, '/' );

            this.fieldDateOfSubmission = new OO.ui.TextInputWidget( {
                value: this.dos_stamp, type: 'hidden'
            } );

            this.field_primary_contact_1_designation = new OO.ui.DropdownWidget( {
                label: 'Choose first group contact designation...',
                labelPosition: 'before',
                icon: 'logoWikimedia',
                value: this.field_primary_contact_1_designation,
                classes: [ 'full-width' ],
                menu: {
                    items: [ new OO.ui.MenuOptionWidget( {
                        data: 'Board Chair/President',
                        label: 'Board Chair/President'
                    } ), new OO.ui.MenuOptionWidget( {
                        data: 'Board Member', label: 'Board Member'
                    } ), new OO.ui.MenuOptionWidget( {
                        data: 'Board Secretary', label: 'Board Secretary'
                    } ), new OO.ui.MenuOptionWidget( {
                        data: 'Board Vice Chair/President',
                        label: 'Board Vice Chair/President'
                    } ), new OO.ui.MenuOptionWidget( {
                        data: 'Community Liaison', label: 'Community Liaison'
                    } ), new OO.ui.MenuOptionWidget( {
                        data: 'Executive/Managing Director',
                        label: 'Executive/Managing Director'
                    } ), new OO.ui.MenuOptionWidget( {
                        data: 'Office Manager', label: 'Office Manager'
                    } ), new OO.ui.MenuOptionWidget( {
                        data: 'Operations Manager', label: 'Operations Manager'
                    } ), new OO.ui.MenuOptionWidget( {
                        data: 'Primary Contact', label: 'Primary Contact'
                    } ), new OO.ui.MenuOptionWidget( {
                        data: 'Program/Project Manager',
                        label: 'Program/Project Manager'
                    } ), new OO.ui.MenuOptionWidget( {
                        data: 'Secondary contact', label: 'Secondary contact'
                    } ), new OO.ui.MenuOptionWidget( {
                        data: 'Other', label: 'Other...'
                    } )
                    ]
                }
            } );

            this.field_primary_contact_2_designation = new OO.ui.DropdownWidget( {
                label: 'Choose second group contact designation...',
                labelPosition: 'before',
                icon: 'logoWikimedia',
                value: this.field_primary_contact_2_designation,
                classes: [ 'full-width' ],
                menu: {
                    items: [ new OO.ui.MenuOptionWidget( {
                        data: 'Board Chair/President',
                        label: 'Board Chair/President'
                    } ), new OO.ui.MenuOptionWidget( {
                        data: 'Board Member', label: 'Board Member'
                    } ), new OO.ui.MenuOptionWidget( {
                        data: 'Board Secretary', label: 'Board Secretary'
                    } ), new OO.ui.MenuOptionWidget( {
                        data: 'Board Vice Chair/President',
                        label: 'Board Vice Chair/President'
                    } ), new OO.ui.MenuOptionWidget( {
                        data: 'Community Liaison', label: 'Community Liaison'
                    } ), new OO.ui.MenuOptionWidget( {
                        data: 'Executive/Managing Director',
                        label: 'Executive/Managing Directo'
                    } ), new OO.ui.MenuOptionWidget( {
                        data: 'Office Manager', label: 'Office Manager'
                    } ), new OO.ui.MenuOptionWidget( {
                        data: 'Operations Manager', label: 'Operations Manager'
                    } ), new OO.ui.MenuOptionWidget( {
                        data: 'Primary Contact', label: 'Primary Contact'
                    } ), new OO.ui.MenuOptionWidget( {
                        data: 'Program/Project Manager',
                        label: 'Program/Project Manager'
                    } ), new OO.ui.MenuOptionWidget( {
                        data: 'Secondary contact', label: 'Secondary contact'
                    } ), new OO.ui.MenuOptionWidget( {
                        data: 'Other', label: 'Other...'
                    } )
                    ]
                }
            } );

            // Append things to fieldSet
            this.fieldSet = new OO.ui.FieldsetLayout( {
                items: [ new OO.ui.FieldLayout( this.fieldPopup, {} ), new OO.ui.FieldLayout( this.fieldEmailPopup, {} ), new OO.ui.FieldLayout( this.fieldContactsExistPopup, {} ), new OO.ui.FieldLayout( this.field_affiliate_name, {
                    label: 'Group Name', //gadgetMsg['has-group-mission-changed'],
                    align: 'top'
                } ), new OO.ui.FieldLayout( this.field_primary_contact_1_label, {} ), new OO.ui.FieldLayout( this.field_primary_contact_1_firstname, {
                    label: 'First Name', //gadgetMsg['has-group-mission-changed'],
                    align: 'top'
                } ), new OO.ui.FieldLayout( this.field_primary_contact_1_surname, {
                    label: 'Surname', //gadgetMsg['mission-changed-or-unsure-explanation'],
                    align: 'top'
                } ), new OO.ui.FieldLayout( this.field_primary_contact_1_username, {
                    label: 'Wikimedia Username', //gadgetMsg['mission-changed-or-unsure-explanation'],
                    align: 'top'
                } ), new OO.ui.FieldLayout( this.field_primary_contact_1_email_address, {
                    label: 'Email Address', //gadgetMsg['legal-entity-or-not'],
                    align: 'top'
                } ), new OO.ui.FieldLayout( this.field_primary_contact_1_designation, {
                    label: 'Designation', //gadgetMsg['group-membership-page'],
                    align: 'top'
                } ), new OO.ui.FieldLayout( this.field_primary_contact_1_other_input, {
                    label: 'If Other, provide contact 1 designation', //gadgetMsg['group-membership-page'],
                    align: 'top'
                } ), new OO.ui.FieldLayout( this.field_primary_contact_2_label, {} ), new OO.ui.FieldLayout( this.field_primary_contact_2_firstname, {
                    label: 'First name', //gadgetMsg['has-group-mission-changed'],
                    align: 'top'
                } ), new OO.ui.FieldLayout( this.field_primary_contact_2_surname, {
                    label: 'Surname', //gadgetMsg['mission-changed-or-unsure-explanation'],
                    align: 'top'
                } ), new OO.ui.FieldLayout( this.field_primary_contact_2_username, {
                    label: 'Wikimedia Username', //gadgetMsg['mission-changed-or-unsure-explanation'],
                    align: 'top'
                } ), new OO.ui.FieldLayout( this.field_primary_contact_2_email_address, {
                    label: 'Email Address', //gadgetMsg['legal-entity-or-not'],
                    align: 'top'
                } ), new OO.ui.FieldLayout( this.field_primary_contact_2_designation, {
                    label: 'Designation', //gadgetMsg['group-membership-page'],
                    align: 'top'
                } ), new OO.ui.FieldLayout( this.field_primary_contact_2_other_input, {
                    label: 'If Other, provide contact 2 designation', //gadgetMsg['group-membership-page'],
                    align: 'top'
                } ),
                ]
            } );

            // When everything is done
            this.content.$element.append( this.fieldSet.$element );
            this.$body.append( this.content.$element );
        };

        /**
         * Method to Lookup Affiliate names from
         * [[m:Wikimedia_Affiliates_Data_Portal/MRL/List_Of_All_Wikimedia_Affiliates]]
         * and to be used as autocomplete form element in the forms
         */
        AffiliateLookupTextInputWidget = function AffiliatesLookupTextInputWidget ( config ) {
            // Parent constructor
            OO.ui.TextInputWidget.call( this, $.extend( {
                icon: 'userGroup',
                indicator: 'required',
                required: true,
                validate: 'text',
                placeholder: 'Enter affiliate name' //gadgetMsg[
                                                    // 'group-name-placeholder'
                                                    // ]
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
                return new mw.ForeignApi( foreignWiki ).get( getWikiPageContent( 'Wikimedia_Affiliates_Data_Portal/MRL/List_Of_All_Wikimedia_Affiliates' ) ).then( function ( data ) {
                    var affiliates, affiliatesContent;

                    affiliatesContent = getAffiliatesList( data.query.pages );
                    affiliates = affiliatesContent.split( ',\n' );
                    // Filter to only affiliates whose names contain the input
                    // (case-insensitive)
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
            var items = [], i, affiliate;

            for ( i = 0; i < data.length; i++ ) {
                affiliate = String( data[ i ] );
                affiliate = affiliate.split( ' ~ ' )[ 0 ];
                items.push( new OO.ui.MenuOptionWidget( {
                    data: affiliate, label: affiliate
                } ) );
            }
            return items;
        };

        /**
         * Set custom height for the modal window
         *
         */
        ContactInfoEditor.prototype.getBodyHeight = function () {
            return 700;
        };

        /**
         * In the event "Select" is pressed
         *
         */
        ContactInfoEditor.prototype.getActionProcess = function ( action ) {
            var dialog = this, allRequiredFieldsAvailable = false,
                otherContactDesignationSelected = false, isValidEmail = false;

            // Before submitting the form, check that all required fields indeed
            // have values before we call saveItem(). Otherwise, don't close the
            // form but instead reveal which input fields are not yet filled.
            if ( dialog.field_affiliate_name.getValue() &&
                dialog.field_primary_contact_1_firstname.getValue() &&
                dialog.field_primary_contact_1_surname.getValue() &&
                dialog.field_primary_contact_1_username.getValue() &&
                dialog.field_primary_contact_1_email_address.getValue() &&
                dialog.field_primary_contact_2_firstname.getValue() &&
                dialog.field_primary_contact_2_surname.getValue() &&
                dialog.field_primary_contact_2_username.getValue() &&
                dialog.field_primary_contact_2_email_address.getValue()

            ) {
                allRequiredFieldsAvailable = true;
            }

            if ( dialog.field_primary_contact_1_designation.getMenu().findSelectedItem() == null || dialog.field_primary_contact_2_designation.getMenu().findSelectedItem() == null ) {
                allRequiredFieldsAvailable = false;
            } else {
                if ( dialog.field_primary_contact_1_designation.getMenu().findSelectedItem().getData() === 'Other' || dialog.field_primary_contact_2_designation.getMenu().findSelectedItem().getData() === 'Other' ) {
                    otherContactDesignationSelected = true;
                }
            }

            if ( otherContactDesignationSelected && ( !dialog.field_primary_contact_1_other_input.getValue() || !dialog.field_primary_contact_2_other_input.getValue() ) ) {
                allRequiredFieldsAvailable = false;
            }

            if ( validateEmail( dialog.field_primary_contact_1_email_address.getValue() ) && validateEmail( dialog.field_primary_contact_2_email_address.getValue() ) ) {
                isValidEmail = true;
            }

            if ( action === 'continue' && allRequiredFieldsAvailable ) {
                if ( !isValidEmail ) {
                    return new OO.ui.Process( function () {
                        dialog.fieldEmailPopup.toggle( true );
                    } );
                } else {
                    return new OO.ui.Process( function () {
                        dialog.saveItem();
                    } );
                }
            } else if ( action === 'continue' && allRequiredFieldsAvailable === false ) {
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
         * Save the changes to [[Module:GroupContact_Informations]] page.
         */
        ContactInfoEditor.prototype.saveItem = function () {
            var dialog = this;
            var apiObj = new mw.Api();

            dialog.pushPending();

            apiObj.get( getModuleContent( 'Affiliate_Contacts_Information' ) ).then( function ( data ) {
                var i, insertToTable, processWorkingEntry, editSummary,
                    manifest = [], workingEntry, entries;

                /**
                 * Compares a given [[Module:Affiliate_Contacts_Information]]
                 * entry against the edit fields and applies changes where
                 * relevant.
                 *
                 * @param {Object} workingEntry the entry being worked on
                 * @return {Object} The same entry but with modifications
                 */
                processWorkingEntry = function ( workingEntry ) {
                    //Affiliate name
                    if ( dialog.field_affiliate_name.getValue() ) {
                        workingEntry.affiliate_name = dialog.field_affiliate_name.getValue();
                    }
                    // Primary Contact 1
                    if ( dialog.field_primary_contact_1_firstname.getValue() ) {
                        workingEntry.primary_contact_1_firstname = dialog.field_primary_contact_1_firstname.getValue();
                    }
                    if ( dialog.field_primary_contact_1_surname.getValue() ) {
                        workingEntry.primary_contact_1_surname = dialog.field_primary_contact_1_surname.getValue();
                    }
                    if ( dialog.field_primary_contact_1_username.getValue() ) {
                        workingEntry.primary_contact_1_username = dialog.field_primary_contact_1_username.getValue();
                    }
                    if ( dialog.field_primary_contact_1_email_address.getValue() ) {
                        workingEntry.primary_contact_1_email_address = dialog.field_primary_contact_1_email_address.getValue();
                    }
                    if ( dialog.field_primary_contact_1_designation.getMenu().findSelectedItem().getData() ) {
                        if ( dialog.field_primary_contact_1_designation.getMenu().findSelectedItem().getData() === 'Other' ) {
                            workingEntry.primary_contact_1_designation = dialog.field_primary_contact_1_other_input.getValue();
                        } else {
                            workingEntry.primary_contact_1_designation = dialog.field_primary_contact_1_designation.getMenu().findSelectedItem().getData();
                        }
                    }
                    // Primary Contact 2
                    if ( dialog.field_primary_contact_2_firstname.getValue() ) {
                        workingEntry.primary_contact_2_firstname = dialog.field_primary_contact_2_firstname.getValue();
                    }
                    if ( dialog.field_primary_contact_2_surname.getValue() ) {
                        workingEntry.primary_contact_2_surname = dialog.field_primary_contact_2_surname.getValue();
                    }
                    if ( dialog.field_primary_contact_2_username.getValue() ) {
                        workingEntry.primary_contact_2_username = dialog.field_primary_contact_2_username.getValue();
                    }
                    if ( dialog.field_primary_contact_2_email_address.getValue() ) {
                        workingEntry.primary_contact_2_email_address = dialog.field_primary_contact_2_email_address.getValue();
                    }
                    if ( dialog.field_primary_contact_2_designation.getMenu().findSelectedItem().getData() ) {
                        if ( dialog.field_primary_contact_2_designation.getMenu().findSelectedItem().getData() === 'Other' ) {
                            workingEntry.primary_contact_2_designation = dialog.field_primary_contact_2_other_input.getValue();
                        } else {
                            workingEntry.primary_contact_2_designation = dialog.field_primary_contact_2_designation.getMenu().findSelectedItem().getData();
                        }
                    }
                    return workingEntry;
                };

                entries = parseContentModule( data.query.pages );
                // Cycle through existing entries. If we are editing an existing
                // entry, that entry will be modified in place.
                for ( i = 0; i < entries.length; i++ ) {
                    workingEntry = cleanRawEntry( entries[ i ].value.fields );

                    if ( workingEntry.affiliate_name === dialog.affiliate_name ) {
                        workingEntry = processWorkingEntry( workingEntry );
                        manifest.push( workingEntry );
                    } else {
                        manifest.push( workingEntry );
                    }
                }

                // Re-generate the Lua table based on `manifest`
                insertToTable = 'return {\n';
                for ( i = 0; i < manifest.length; i++ ) {
                    insertToTable += '\t{\n';
                    if ( manifest[ i ].affiliate_name ) {
                        insertToTable += generateKeyValuePair( 'affiliate_name', manifest[ i ].affiliate_name );
                    }
                    if ( manifest[ i ].affiliate_code ) {
                        insertToTable += generateKeyValuePair( 'affiliate_code', manifest[ i ].affiliate_code );
                    }
                    if ( manifest[ i ].affiliate_region ) {
                        insertToTable += generateKeyValuePair( 'affiliate_region', manifest[ i ].affiliate_region );
                    }
                    if ( manifest[ i ].primary_contact_1_firstname || manifest[ i ].primary_contact_1_firstname === '' ) {
                        insertToTable += generateKeyValuePair( 'primary_contact_1_firstname', manifest[ i ].primary_contact_1_firstname );
                    }
                    if ( manifest[ i ].primary_contact_1_surname || manifest[ i ].primary_contact_1_surname === '' ) {
                        insertToTable += generateKeyValuePair( 'primary_contact_1_surname', manifest[ i ].primary_contact_1_surname );
                    }
                    if ( manifest[ i ].primary_contact_1_username || manifest[ i ].primary_contact_1_username === '' ) {
                        insertToTable += generateKeyValuePair( 'primary_contact_1_username', manifest[ i ].primary_contact_1_username );
                    }
                    if ( manifest[ i ].primary_contact_1_email_address || manifest[ i ].primary_contact_1_email_address === '' ) {
                        insertToTable += generateKeyValuePair( 'primary_contact_1_email_address', manifest[ i ].primary_contact_1_email_address );
                    }
                    if ( manifest[ i ].primary_contact_1_designation || manifest[ i ].primary_contact_1_designation === '' ) {
                        insertToTable += generateKeyValuePair( 'primary_contact_1_designation', manifest[ i ].primary_contact_1_designation );
                    }
                    if ( manifest[ i ].primary_contact_2_firstname || manifest[ i ].primary_contact_2_firstname === '' ) {
                        insertToTable += generateKeyValuePair( 'primary_contact_2_firstname', manifest[ i ].primary_contact_2_firstname );
                    }
                    if ( manifest[ i ].primary_contact_2_surname || manifest[ i ].primary_contact_2_surname === '' ) {
                        insertToTable += generateKeyValuePair( 'primary_contact_2_surname', manifest[ i ].primary_contact_2_surname );
                    }
                    if ( manifest[ i ].primary_contact_2_username || manifest[ i ].primary_contact_2_username === '' ) {
                        insertToTable += generateKeyValuePair( 'primary_contact_2_username', manifest[ i ].primary_contact_2_username );
                    }
                    if ( manifest[ i ].primary_contact_2_email_address || manifest[ i ].primary_contact_2_email_address === '' ) {
                        insertToTable += generateKeyValuePair( 'primary_contact_2_email_address', manifest[ i ].primary_contact_2_email_address );
                    }
                    if ( manifest[ i ].primary_contact_2_designation || manifest[ i ].primary_contact_2_designation === '' ) {
                        insertToTable += generateKeyValuePair( 'primary_contact_2_designation', manifest[ i ].primary_contact_2_designation );
                    }
                    if ( manifest[ i ].unique_id || manifest[ i ].unique_id === '' ) {
                        insertToTable += generateKeyValuePair( 'unique_id', manifest[ i ].unique_id );
                    }
                    if ( manifest[ i ].dos_stamp || manifest[ i ].dos_stamp === '' ) {
                        insertToTable += generateKeyValuePair( 'created_at', manifest[ i ].dos_stamp );
                    }
                    insertToTable += '\t},\n';
                }
                insertToTable += '}';
                // console.log(insertToTable);

                // Add the new Report into the Lua table.
                apiObj.postWithToken( 'csrf', {
                    action: 'edit',
                    bot: true,
                    nocreate: true,
                    summary: editSummary,
                    pageid: 39952, //[[Module:Affiliate_Contacts_Information]]
                    text: insertToTable,
                    contentmodel: 'Scribunto'
                } ).then( function () {

                    dialog.close();

                    /** After saving, show a message box */
                    var messageDialog = new OO.ui.MessageDialog();
                    var windowManager = new OO.ui.WindowManager();

                    $( 'body' ).append( windowManager.$element );
                    // Add the dialog to the window manager.
                    windowManager.addWindows( [ messageDialog ] );

                    // Configure the message dialog when it is opened with the
                    // window manager's openWindow() method.
                    windowManager.openWindow( messageDialog, {
                        title: 'Saved',
                        message: 'Affiliate Contact Saved',
                        actions: [ {
                            action: 'accept', label: 'Dismiss', flags: 'primary'
                        }
                        ]
                    } );

                    windowManager.closeWindow( messageDialog );
                    location.reload();
                } ).catch( function ( error ) {
                    alert( 'Failed' );
                    dialog.close();
                    console.error( error );
                } );
            } );
        };

        // Edit content via the form
        $( '.contact_record_id' ).each( function () {
            var $icon = $( this ), editButton;
            editButton = new OO.ui.ButtonWidget( {
                framed: false, icon: 'edit', flags: [ 'progressive' ]
            } ).on( 'click', function () {
                // First check if the user is logged in
                if ( mw.config.get( 'wgUserName' ) === null ) {
                    alert( 'User not logged in.' );
                } else if ( me_staff.indexOf( user ) < 0 ) {
                    alert( 'Only M&E staff are allowed to Update contact records.' );
                } else {
                    new mw.Api().get( getModuleContent( 'Affiliate_Contacts_Information' ) ).then( function ( contact_data ) {
                        var entryData, record;

                        record = editButton.$element
                            .closest( '.contact_record' )
                            .data( 'contact-unique-id' );

                        entryData = cleanRawEntry( getRelevantRawEntry( parseContentModule( contact_data.query.pages ), record ) );
                        openContactWindow( entryData );
                    } );
                }
            } );
            $icon.append( editButton.$element );
        } );

        /**
         * The dialog window to enter group contact info will be displayed.
         *
         * @param {Object} config
         */
        openContactWindow = function ( config ) {
            var contactInfoEditor;
            config.size = 'large';
            contactInfoEditor = new ContactInfoEditor( config );

            windowManager = new OO.ui.WindowManager();
            $( 'body' ).append( windowManager.$element );
            windowManager.addWindows( [ contactInfoEditor ] );
            windowManager.openWindow( contactInfoEditor );
        };

        /**
         * The dialog window to enter group contact info will be displayed.
         *
         * @param {Object} config
         */
        openMessageWindow = function ( config ) {

        };
    }

    mw.loader.using( [ 'mediawiki.api', 'oojs-ui', 'oojs-ui-widgets', 'oojs-ui-core', 'oojs-ui.styles.icons-editing-core', 'ext.gadget.luaparse', 'mediawiki.widgets.DateInputWidget'
    ] ).then( renderAffiliateContactInfoForm );
}() );
