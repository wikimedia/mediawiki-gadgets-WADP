/**
 * This gadget contains the logic that enables M&E staff to be able to download
 * group contacts data in csv format. It provides a way to select the fields one
 * is interested in. The following are the selectable fields:
 *
 * @author Alice China (AChina-WMF)
 */

( function () {
    'use strict';

    var affiliateInfoFileName = 'Affiliate Contact Info',
        cleanRawEntry,
        downloadEmailAddressesCSV,
        getContactDataOnRecord,
        getModuleContent,
        openFilterForm,
        parseContentModule,
        windowManager,
        user = mw.config.values.wgUserName,
        me_staff = [
            'DAlangi (WMF)',
            'RamzyM (WMF)',
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
            var entryData = {}, i;
            for ( i = 0; i < relevantRawEntry.length; i++ ) {
                entryData[ relevantRawEntry[ i ].key.name ] = relevantRawEntry[ i ].value.value;
            }
            return entryData;
        };

        /**
         * Takes Lua-formatted content from lua tables content and
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
        downloadEmailAddressesCSV = function ( items, regions, designations ) {
            var apiObj = new mw.Api(),
                entries,
                csvData,
                blob,
                url,
                link;
            apiObj.get( getModuleContent( 'Affiliate_Contacts_Information' ) ).then( function ( data ) {
                // Add a header row to the CSV
                var i, csvContent = '', fileDescription = '';

                if ( regions ) {
                    fileDescription += '\nRegions:\n';
                    for ( i = 0; i < regions.length; i++ ) {
                        fileDescription += i + 1;
                        fileDescription += '. ' + regions[ i ] + '\n';
                    }
                }
                if ( designations ) {
                    fileDescription += '\nDesignations:\n';
                    for ( i = 0; i < designations.length; i++ ) {
                        fileDescription += i + 1;
                        fileDescription += '. ' + designations[ i ] + '\n';
                    }
                }

                csvContent += 'Affiliate Name,';
                if ( items.includes( 'contact1_name' ) ) csvContent += 'Contact1 Name,';
                if ( items.includes( 'contact1_username' ) ) csvContent += 'Contact1 Username,';
                if ( items.includes( 'contact1_name' ) ) csvContent += 'Contact1 Email,';
                if ( items.includes( 'contact2_name' ) ) csvContent += 'Contact2 Name,';
                if ( items.includes( 'contact2_username' ) ) csvContent += 'Contact2 Username,';
                if ( items.includes( 'contact2_name' ) ) csvContent += 'Contact2 Email,';

                // Append new line at the end to ensure a proper CSV format
                csvContent += '\n';

                entries = parseContentModule( data.query.pages );
                csvData = getContactDataOnRecord( items, entries, regions, designations );

                // Add each email address as a row to the CSV
                for ( i = 0; i < csvData.length; i++ ) {
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
         * @param {Array} items List of items selected in the filter
         * @param {Array} entries List of affiliate contacts
         * @param {string} region The region to filter on
         *
         * @return Array The data to be used in building the CSV
         */
        getContactDataOnRecord = function ( items, entries, regions, designations ) {
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
                if ( regions && regions.includes( manifest[ i ].affiliate_region ) ) {
                    if ( manifest[ i ].affiliate_name ) {
                        cachedData.affiliate_name = manifest[ i ].affiliate_name;
                    } else {
                        cachedData.affiliate_name = NOT_AVAILABLE;
                    }
                    if ( manifest[ i ].primary_contact_1_email_address ) {
                        cachedData.contact1_email = manifest[ i ].primary_contact_1_email_address;
                    } else {
                        cachedData.contact1_email = NOT_AVAILABLE;
                    }
                    if ( manifest[ i ].primary_contact_2_email_address ) {
                        cachedData.contact2_email = manifest[ i ].primary_contact_2_email_address;
                    } else {
                        cachedData.contact2_email = NOT_AVAILABLE;
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

                    dataToDownload.push( cachedData );
                    cachedData = {}; // Reset for the next round of data.
                } else if ( designations && ( designations.includes( manifest[ i ].primary_contact_1_designation ) ||
                    designations.includes( manifest[ i ].primary_contact_2_designation ) ) ) {
                    if ( manifest[ i ].affiliate_name ) {
                        cachedData.affiliate_name = manifest[ i ].affiliate_name;
                    } else {
                        cachedData.affiliate_name = NOT_AVAILABLE;
                    }
                    if ( manifest[ i ].primary_contact_1_email_address ) {
                        cachedData.contact1_email = manifest[ i ].primary_contact_1_email_address;
                    } else {
                        cachedData.contact1_email = NOT_AVAILABLE;
                    }
                    if ( manifest[ i ].primary_contact_2_email_address ) {
                        cachedData.contact2_email = manifest[ i ].primary_contact_2_email_address;
                    } else {
                        cachedData.contact2_email = NOT_AVAILABLE;
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
                    dataToDownload.push( cachedData );
                    cachedData = {}; // Reset for the next round of data.
                } else {
                    if ( manifest[ i ].affiliate_name ) {
                        cachedData.affiliate_name = manifest[ i ].affiliate_name;
                    } else {
                        cachedData.affiliate_name = NOT_AVAILABLE;
                    }
                    if ( manifest[ i ].primary_contact_1_email_address ) {
                        cachedData.contact1_email = manifest[ i ].primary_contact_1_email_address;
                    } else {
                        cachedData.contact1_email = NOT_AVAILABLE;
                    }
                    if ( manifest[ i ].primary_contact_2_email_address ) {
                        cachedData.contact2_email = manifest[ i ].primary_contact_2_email_address;
                    } else {
                        cachedData.contact2_email = NOT_AVAILABLE;
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
                    dataToDownload.push( cachedData );
                    // Reset for the next round of data.
                    cachedData = {};
                }
            }

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
            this.affiliate_contact_region = '';
            this.affiliate_contact_designation = '';

            if ( config.affiliate_contact_data ) {
                this.affiliate_contact_data = config.affiliate_contact_data;
            }
            if ( config.affiliate_contact_region ) {
                this.affiliate_contact_region = config.affiliate_contact_region;
            }
            if ( config.affiliate_contact_designation ) {
                this.affiliate_contact_designation = config.affiliate_contact_designation;
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
            var i,
                fieldAffiliateContactsDataSelected,
                fieldRegionSelected,
                fieldDesignationSelected;

            ContactInfoDownloadEditor.super.prototype.initialize.call( this );
            this.content = new OO.ui.PanelLayout( {
                padded: true,
                expanded: false
            } );

            fieldAffiliateContactsDataSelected = [];
            fieldRegionSelected = [];
            fieldDesignationSelected = [];
            for ( i = 0; i < this.affiliate_contact_data.length; i++ ) {
                fieldAffiliateContactsDataSelected.push(
                    { data: this.affiliate_contact_data[ i ] }
                );
            }
            for ( i = 0; i < this.affiliate_contact_region.length; i++ ) {
                fieldAffiliateContactsDataSelected.push(
                    { data: this.affiliate_contact_region[ i ] }
                );
            }
            for ( i = 0; i < this.affiliate_contact_designation.length; i++ ) {
                fieldAffiliateContactsDataSelected.push(
                    { data: this.affiliate_contact_designation[ i ] }
                );
            }

            this.fieldDownloadsDescription = new OO.ui.LabelWidget( {
                label: 'If you do not wish to add filters to the data, you can directly click \'Download\'. The' +
                    ' downloaded CSV file will contain a list of all affiliates with emails of both their' +
                    ' contacts on record.\n\n'
            } );

            this.fieldAffiliateContactsDataSelected = new OO.ui.CheckboxMultiselectWidget( {
                classes: [ 'checkbox-inline' ],
                selected: fieldAffiliateContactsDataSelected,
                items: [
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'contact1_name',
                        label: 'Contact 1 Name'
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'contact1_username',
                        label: 'Contact 1 Username'
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'contact2_name',
                        label: 'Contact 2 Name'
                    } ),
                    new OO.ui.CheckboxMultioptionWidget( {
                        data: 'contact2_username',
                        label: 'Contact 2 Username'
                    } ),
                ]
            } );

            this.fieldDesignationSelected = new OO.ui.MenuTagMultiselectWidget( {
                selected: fieldDesignationSelected,
                icon: 'mapPin',
                options: [
                    {
                        data: 'Board Chair/President',
                        label: 'Board Chair/President'
                    },
                    {
                        data: 'Board Member',
                        label: 'Board Member'
                    },
                    {
                        data: 'Board Secretary',
                        label: 'Board Secretary'
                    },
                    {
                        data: 'Board Vice Chair/President',
                        label: 'Board Vice Chair/President'
                    },
                    {
                        data: 'Community Liaison',
                        label: 'Community Liaison'
                    },
                    {
                        data: 'Executive/Managing Director',
                        label: 'Executive/Managing Director'
                    },
                    {
                        data: 'Office Manager',
                        label: 'Office Manager'
                    },
                    {
                        data: 'Operations Manager',
                        label: 'Operations Manager'
                    },
                    {
                        data: 'Primary Contact',
                        label: 'Primary Contact'
                    },
                    {
                        data: 'Program/Project Manager',
                        label: 'Program/Project Manager'
                    },
                    {
                        data: 'Secondary contact',
                        label: 'Secondary contact'
                    },
                ]
            } );

            this.fieldRegionSelected = new OO.ui.MenuTagMultiselectWidget( {
                selected: fieldRegionSelected,
                icon: 'mapPin',
                options: [
                    {
                        data: 'all',
                        label: 'All Regions'
                    },
                    {
                        data: 'International',
                        label: 'International'
                    },
                    {
                        data: 'Sub-Saharan Africa',
                        label: 'Sub-Saharan Africa'
                    },
                    {
                        data: 'Asia/Pacific',
                        label: 'Asia/Pacific'
                    },
                    {
                        data: 'Europe',
                        label: 'Europe'
                    },
                    {
                        data: 'MENA',
                        label: 'MENA'
                    },
                    {
                        data: 'North America',
                        label: 'North America'
                    },
                    {
                        data: 'South/Latin America',
                        label: 'South/Latin America'
                    }
                ]
            } );

            // Append things to fieldSet
            this.fieldSet = new OO.ui.FieldsetLayout( {
                items: [
                    new OO.ui.FieldLayout(
                        this.fieldDownloadsDescription,
                        {}
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldAffiliateContactsDataSelected,
                        {
                            label: 'Select data you want to download',
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldRegionSelected,
                        {
                            label: 'Select regions to filter on',
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.fieldDesignationSelected,
                        {
                            label: 'Select contact designation to filter on',
                            align: 'top'
                        }
                    ),
                ],
            } );

            // When everything is done
            this.content.$element.append( this.fieldSet.$element );
            this.$body.append( this.content.$element );
        };

        /**
         * Set custom height for the modal window.
         */
        ContactInfoDownloadEditor.prototype.getBodyHeight = function () {
            return 300;
        };

        /**
         * In the event "Download" is pressed
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
            var dialog = this,
                selectedData,
                selectedRegions,
                selectedDesignations;

            dialog.pushPending();

            if ( dialog.fieldAffiliateContactsDataSelected.findSelectedItemsData() ) {
                selectedData = dialog.fieldAffiliateContactsDataSelected.findSelectedItemsData();
            }

            if ( dialog.fieldRegionSelected.getValue() ) {
                selectedRegions = dialog.fieldRegionSelected.getValue();
            }

            if ( dialog.fieldDesignationSelected.getValue() ) {
                selectedDesignations = dialog.fieldDesignationSelected.getValue();
            }

            if ( selectedData ) {
                downloadEmailAddressesCSV(
                    selectedData,
                    selectedRegions ? selectedRegions : null,
                    selectedDesignations ? selectedDesignations : null
                );
            }

            dialog.close();

            /** After saving, show a message box */
            var messageDialog = new OO.ui.MessageDialog(),
                windowManager = new OO.ui.WindowManager();

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
