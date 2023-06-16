( function () {
    'use strict';

    var affiliateInfoFileName = 'affiliate_contacts_info',
        cleanRawEntry,
        downloadEmailAddressesCSV,
        getContactDataOnRecord,
        getModuleContent,
        openFilterForm,
        parseContentModule,
        windowManager;

    var user = mw.config.values.wgUserName;
    var me_staff = [
        'DAlangi (WMF)',
        'DNdubane (WMF)',
        'AChina-WMF'
    ];

    function downloadAffiliateData () {
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
         * Takes Lua-formatted content from [[Module:Activities_Reports]] content and
         * returns an abstract syntax tree.
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
         * Function that downloads a CSV file containing all affiliate contact
         * email addresses
         */
        downloadEmailAddressesCSV = function ( items ) {
            var apiObj = new mw.Api();
            var entries, csvData, blob, url, link;
            apiObj.get( getModuleContent( 'Affiliate_Contacts_Information' ) ).then( function ( data ) {
                // Add a header row to the CSV
                var csvContent = '';

                if ( items.includes( 'affiliate_name' ) ) csvContent += 'Affiliate Name,';
                if ( items.includes( 'contact1_name' ) ) csvContent += 'Contact1 Name,';
                if ( items.includes( 'contact1_username' ) ) csvContent += 'Contact1 Username,';
                if ( items.includes( 'contact1_email' ) ) csvContent += 'Contact1 Email,';
                if ( items.includes( 'contact2_name' ) ) csvContent += 'Contact2 Name,';
                if ( items.includes( 'contact2_username' ) ) csvContent += 'Contact2 Username,';
                if ( items.includes( 'contact2_email' ) ) csvContent += 'Contact2 Email,';
                // Append new line at the end to ensure a proper CSV format
                csvContent += '\n';

                entries = parseContentModule( data.query.pages );
                csvData = getContactDataOnRecord( items, entries );

                // Add each email address as a row to the CSV
                for ( var i = 0; i < csvData.length; i++ ) {
                    if ( csvData[ i ].affiliate_name !== undefined ) {
                        csvContent += csvData[ i ].affiliate_name + ',';
                    }
                    if ( csvData[ i ].contact1_name !== undefined ) {
                        csvContent += csvData[ i ].contact1_name + ',';
                    }
                    if ( csvData[ i ].contact1_username !== undefined ) {
                        csvContent += csvData[ i ].contact1_username + ',';
                    }
                    if ( csvData[ i ].contact1_email !== undefined ) {
                        csvContent += csvData[ i ].contact1_email + ',';
                    }
                    if ( csvData[ i ].contact2_name !== undefined ) {
                        csvContent += csvData[ i ].contact2_name + ',';
                    }
                    if ( csvData[ i ].contact2_username !== undefined ) {
                        csvContent += csvData[ i ].contact2_username + ',';
                    }
                    if ( csvData[ i ].contact2_email !== undefined ) {
                        csvContent += csvData[ i ].contact2_email + ',';
                    }
                    csvContent += '\n';
                }

                blob = new Blob( [ csvContent ], { type: 'text/csv;charset=utf-8' } );
                url = URL.createObjectURL( blob );
                link = document.createElement( 'a' );

                link.setAttribute( 'href', url );
                link.setAttribute( 'download', affiliateInfoFileName + '.csv' );
                document.body.appendChild( link );
                link.click();

                URL.revokeObjectURL( url );
            } );
        };

        /**
         * Function that goes through the [[Module:Affiliate_Contact_Information] and
         * populates an array with all the affiliate contact email addresses
         *
         * @param Array List of items selected in the filter
         * @param Array List of affiliate contacts
         *
         * @return Array The data to be used in building the CSV
         */
        getContactDataOnRecord = function ( items, entries ) {
            var i,
                workingEntry,
                cachedData = {},
                manifest = [],
                dataToDownload = [],
                NOT_AVAILABLE = 'N/A';
            // Cycle through existing entries. If we are editing an existing
            // entry, that entry will be modified in place.
            for ( i = 0; i < entries.length; i++ ) {
                workingEntry = cleanRawEntry( entries[ i ].value.fields );
                manifest.push( workingEntry );
            }

            for ( i = 0; i < manifest.length; i++ ) {
                if ( items.includes( 'affiliate_name' ) ) {
                    if ( manifest[ i ].affiliate_name ) {
                        cachedData.affiliate_name = manifest[ i ].affiliate_name;
                    } else {
                        cachedData.affiliate_name = NOT_AVAILABLE;
                    }
                }
                if ( items.includes( 'contact1_name' ) ) {
                    if ( manifest[ i ].primary_contact_1_firstname ) {
                        cachedData.contact1_name = manifest[ i ].primary_contact_1_firstname;
                    } else {
                        cachedData.contact1_name = NOT_AVAILABLE;
                    }
                }
                if ( items.includes( 'contact2_name' ) ) {
                    if ( manifest[ i ].primary_contact_2_firstname ) {
                        cachedData.contact2_name = manifest[ i ].primary_contact_2_firstname;
                    } else {
                        cachedData.contact2_name = NOT_AVAILABLE;
                    }
                }
                if ( items.includes( 'contact1_username' ) ) {
                    if ( manifest[ i ].primary_contact_1_username ) {
                        cachedData.contact1_username = manifest[ i ].primary_contact_1_username;
                    } else {
                        cachedData.contact1_username = NOT_AVAILABLE;
                    }
                }
                if ( items.includes( 'contact2_username' ) ) {
                    if ( manifest[ i ].primary_contact_2_username ) {
                        cachedData.contact2_username = manifest[ i ].primary_contact_2_username;
                    } else {
                        cachedData.contact2_username = NOT_AVAILABLE;
                    }
                }
                if ( items.includes( 'contact1_email' ) ) {
                    if ( manifest[ i ].primary_contact_1_email_address ) {
                        cachedData.contact1_email = manifest[ i ].primary_contact_1_email_address;
                    } else {
                        cachedData.contact1_email = NOT_AVAILABLE;
                    }
                }
                if ( items.includes( 'contact2_email' ) ) {
                    if ( manifest[ i ].primary_contact_2_email_address ) {
                        cachedData.contact2_email = manifest[ i ].primary_contact_2_email_address;
                    } else {
                        cachedData.contact2_email = NOT_AVAILABLE;
                    }
                }

                dataToDownload.push( cachedData );
                cachedData = {}; // Reset for the next round of data.
            }

            console.log( 'Emails from lua table', dataToDownload );
            return dataToDownload;
        };

        /**
         * Subclass ProcessDialog
         *
         * @class ContactInfoDownloadEditor
         * @extends OO.ui.ProcessDialog
         *
         * @constructor
         * @param {Object} config
         */
        function ContactInfoDownloadEditor ( config ) {
            this.affiliate_contact_data = '';

            if ( config.affiliate_contact_data ) {
                this.affiliate_contact_data = config.affiliate_contact_data;
            }
            ContactInfoDownloadEditor.super.call( this, config );
        }

        OO.inheritClass( ContactInfoDownloadEditor, OO.ui.ProcessDialog );

        ContactInfoDownloadEditor.static.name = 'contactInfoDownloadEditor';
        ContactInfoDownloadEditor.static.title = 'Affiliate Contact Info Download Form';
        ContactInfoDownloadEditor.static.actions = [
            {
                action: 'continue',
                modes: 'edit',
                label: 'Download',
                flags: [ 'primary', 'constructive' ]
            },
            {
                action: 'cancel',
                modes: 'edit',
                label: 'Cancel',
                flags: 'safe'
            }
        ];

        /**
         * Use the initialize() method to add content to the dialog's $body,
         * to initialize widgets, and to set up event handlers.
         */
        ContactInfoDownloadEditor.prototype.initialize = function () {
            var i, fieldAffiliateContactsDataSelected;
            ContactInfoDownloadEditor.super.prototype.initialize.call( this );
            this.content = new OO.ui.PanelLayout( {
                padded: true,
                expanded: false
            } );

            fieldAffiliateContactsDataSelected = [];
            for ( i = 0; i < this.affiliate_contact_data.length; i++ ) {
                fieldAffiliateContactsDataSelected.push(
                    { data: this.affiliate_contact_data[ i ] }
                );
            }

            this.fieldAffiliateContactsDataSelected = new OO.ui.CheckboxMultiselectWidget( {
                classes: [ 'checkbox-inline' ],
                selected: fieldAffiliateContactsDataSelected,
                items: [
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'affiliate_name',
                        label: 'Affiliate Name'
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'contact1_name',
                        label: 'Contact 1 Name'
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'contact1_username',
                        label: 'Contact 1 Username'
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'contact1_email',
                        label: 'Contact 1 Email Address'
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'contact2_name',
                        label: 'Contact 2 Name'
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'contact2_username',
                        label: 'Contact 2 Username'
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'contact2_email',
                        label: 'Contact 2 Email Address'
                    } )
                ]
            } );

            // Append things to fieldSet
            this.fieldSet = new OO.ui.FieldsetLayout( {
                items: [
                    new OO.ui.FieldLayout(
                        this.fieldAffiliateContactsDataSelected,
                        {
                            label: 'Select data you want to download',
                            align: 'top'
                        }
                    )
                ]
            } );

            // When everything is done
            this.content.$element.append( this.fieldSet.$element );
            this.$body.append( this.content.$element );
        };

        /**
         * Set custom height for the modal window
         *
         */
        ContactInfoDownloadEditor.prototype.getBodyHeight = function () {
            return 200;
        };

        /**
         * In the event "Select" is pressed
         *
         */
        ContactInfoDownloadEditor.prototype.getActionProcess = function ( action ) {
            var dialog = this;

            if ( action === 'continue' ) {
                return new OO.ui.Process( function () {
                    dialog.saveItem();
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
        ContactInfoDownloadEditor.prototype.saveItem = function () {
            var dialog = this;
            var selectedData;

            dialog.pushPending();

            if ( dialog.fieldAffiliateContactsDataSelected.findSelectedItemsData() ) {
                selectedData = dialog.fieldAffiliateContactsDataSelected.findSelectedItemsData();
                if ( selectedData ) {
                    downloadEmailAddressesCSV( selectedData );
                }
            }

            dialog.close();

            /** After saving, show a message box */
            var messageDialog = new OO.ui.MessageDialog();
            var windowManager = new OO.ui.WindowManager();

            $( 'body' ).append( windowManager.$element );
            // Add the dialog to the window manager.
            windowManager.addWindows( [ messageDialog ] );

            // Configure the message dialog when it is opened with the window manager's openWindow() method.
            windowManager.openWindow( messageDialog, {
                title: 'Saved',
                message: 'Affiliate Contact Saved',
                actions: [
                    {
                        action: 'accept',
                        label: 'Dismiss',
                        flags: 'primary'
                    }
                ]
            } );

            windowManager.closeWindow( messageDialog );
        };

        $( '.downloadAffiliateEmailsCSV' ).on( 'click', function () {
            // First check if the user is logged in
            if ( mw.config.get( 'wgUserName' ) === null ) {
                alert( 'User not logged in.' );
            } else if ( me_staff.indexOf( user ) < 0 ) {
                alert( 'Only M&E staff are allowed to Download Affiliate Contacts Data.' );
            } else {
                openFilterForm( {} );
            }
        } );

        /**
         * The dialog window to enter group contact info will be displayed.
         *
         * @param {Object} config
         */
        openFilterForm = function ( config ) {
            var contactInfoDownloadEditor;
            config.size = 'large';
            contactInfoDownloadEditor = new ContactInfoDownloadEditor( config );

            windowManager = new OO.ui.WindowManager();
            $( 'body' ).append( windowManager.$element );
            windowManager.addWindows( [ contactInfoDownloadEditor ] );
            windowManager.openWindow( contactInfoDownloadEditor );
        };
    }

    mw.loader.using( [
        'mediawiki.api',
        'oojs-ui',
        'oojs-ui-widgets',
        'oojs-ui-core',
        'oojs-ui.styles.icons-editing-core',
        'ext.gadget.luaparse',
        'mediawiki.widgets.DateInputWidget'
    ] ).then( downloadAffiliateData );
}() );
