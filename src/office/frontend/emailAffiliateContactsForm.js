(function () {
    'use strict';

    var affiliateEmailAddresses = [],
        affiliateUsernames = [],
        cleanRawEntry,
        convertDateToDdMmYyyyFormat,
        convertDateToYyyyMmDdFormat,
        gadgetMsg = {},
        generateKeyValuePair,
        getModuleContent,
        getWikiPageContent,
        getAffiliatesList,
        getRelevantRawEntry,
        openContactWindow,
        openMessageWindow,
        parseContentModule,
        sanitizeInput,
        sendEmail,
        sendEmailToAllAffiliates,
        validateEmail,
        windowManager;

    function renderMessageAffiliatesGroupContactsForm() {
        /**
         * Provides API parameters for getting module content
         * specified by `moduleName`.
         *
         * @param {string} moduleName
         * @return {Object}
         */
        getModuleContent = function (moduleName) {
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
        getWikiPageContent = function (pageName) {
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
        convertDateToDdMmYyyyFormat = function (date) {
            // Put in a format our lua script will feed on, in DD/MM/YYYY format
            date = date.split('-');
            date = date[2] + "/" + date[1] + "/" + date[0];

            return date;
        };

        /**
         * Convert date to DD/MM/YYYY format
         * @param {string} date
         *
         * @return {string} date
         */
        convertDateToYyyyMmDdFormat = function (date) {
            var splitted_date;
            // Put in a format our calendar OOUI will feed on, in YYYY-MM-DD format
            splitted_date = date.split('/');
            date = splitted_date[2] + "-" + splitted_date[1] + "-" + splitted_date[0];

            return date;
        };

        /**
         * Sanitizes input for saving to wiki
         *
         * @param {string} s
         *
         * @return {string}
         */
        sanitizeInput = function (s) {
            return s
                .replace(/\\/g, '\\\\')
                .replace(/\n/g, '<br />');
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
        generateKeyValuePair = function (k, v) {
            var res;
            res = '\t\t'.concat(k, ' = \'', v, '\'');
            res += ',\n';
            return res;
        };

        /**
         * Takes Lua-formatted content from [[Module:Activities_Reports]] content and
         * returns an abstract syntax tree.
         *
         * @param {Object} sourceblob The original API return
         * @return {Object} Abstract syntax tree
         */
        parseContentModule = function (sourceblob) {
            var ast, i, raw;
            for (i in sourceblob) {  // should only be one result
                raw = sourceblob[i].revisions[0]['*'];
                ast = luaparse.parse(raw);
                return ast.body[0].arguments[0].fields;
            }
        };

        /**
         * Loops through the abstract syntax tree and returns a specific
         * requested entry.
         *
         * @param {Object} entries The abstract syntax tree
         * @param {string} uniqueId the entry we want to pick out.
         */
        getRelevantRawEntry = function (entries, uniqueId) {
            var i, j;
            // Look through the entries
            for (i = 0; i < entries.length; i++) {
                // Loop through the individual key-value pairs within each entry
                for (j = 0; j < entries[i].value.fields.length; j++) {
                    if (
                        entries[i].value.fields[j].key.name === 'unique_id'
                        && entries[i].value.fields[j].value.value === uniqueId
                    ) {
                        return entries[i].value.fields;
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
            var entryData = {},
                i, j;
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
        getAffiliatesList = function (sourceblob) {
            var i, raw;
            for (i in sourceblob) {  // should only be one result
                raw = sourceblob[i].revisions[0]['*'];
                return raw;
            }
        };

        /**
         * Validate that the provided email address is a valid email address
         * @param email
         */
        validateEmail = function (email) {
            var regex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
            var result = regex.test(email.toLowerCase());
            return result;
        };

        /**
         * @param {string} subject The email subject
         * @param {string} body The email content/body.
         */
        sendEmailToAllAffiliates = function ( subject, body) {
            var params, i, username;

            for ( i = 0; i < affiliateUsernames.length; i++ ) {
                username = affiliateUsernames[i];
                sendEmail(subject, body, username);
            }
        };

        /**
         * @param {string} subject The email subject
         * @param {string} body The email content/body.
         * @param {string} to email recepient
         */
        sendEmail = function ( subject, body, to ) {
            var params = {
                    action: 'emailuser',
                    target: to,
                    subject: '[Wikimedia Foundation] ' + subject,
                    text: body,
                    format: 'json'
                },
                api = new mw.Api();

            api.postWithToken( 'csrf', params ).then( function ( data ) {
                // No op
            } );
        };

        /**
         * Subclass ProcessDialog
         *
         * @class EmailEditor
         * @extends OO.ui.ProcessDialog
         *
         * @constructor
         * @param {Object} config
         */
        function EmailEditor(config) {
            this.email_title = '';
            this.email_body = '';

            if (config.email_title) {
                this.email_title = config.email_title;
            }
            if (config.email_body) {
                this.email_body = config.email_body;
            }
            EmailEditor.super.call(this, config);
        }

        OO.inheritClass(EmailEditor, OO.ui.ProcessDialog);

        EmailEditor.static.name = 'contactInfoEditor';
        EmailEditor.static.title = 'Affiliate Contact Messaging Form'; // gadgetMsg['org-info-header'];
        EmailEditor.static.actions = [
            {
                action: 'continue',
                modes: 'edit',
                label: 'Submit', //gadgetMsg['submit-button'],
                flags: ['primary', 'constructive']
            },
            {
                action: 'cancel',
                modes: 'edit',
                label: 'Cancel', //gadgetMsg['cancel-button'],
                flags: 'safe'
            }
        ];

        /**
         * Use the initialize() method to add content to the dialog's $body,
         * to initialize widgets, and to set up event handlers.
         */
        EmailEditor.prototype.initialize = function () {
            EmailEditor.super.prototype.initialize.call(this);
            this.content = new OO.ui.PanelLayout({
                padded: true,
                expanded: false
            });

            // Popup to be used after form validation
            this.fieldPopup = new OO.ui.PopupWidget({
                $content: $('<p style="color: red; text-align: center;">Error! Both the email title and body are required. Check and try submitting again.</p>'),
                padded: true,
                width: 400,
                height: 90,
                head: true,
                id: 'wadp-popup-widget-position'
            });
            this.field_email_title = new OO.ui.TextInputWidget({
                labelPosition: 'before',
                icon: 'speechBubble ',
                value: this.email_title,
                // placeholder: 'First name' //gadgetMsg['group-membership-page-link']
                classes: ['full-width'],
                indicator: 'required',
                required: true
            });
            this.field_email_body = new OO.ui.MultilineTextInputWidget({
                labelPosition: 'before',
                icon: 'edit',
                value: this.email_body,
                autosize: true,
                // placeholder: 'Surname' //gadgetMsg['group-membership-page-link']
                classes: ['full-width'],
                indicator: 'required',
                required: true
            });

            // Append things to fieldSet
            this.fieldSet = new OO.ui.FieldsetLayout({
                items: [
                    new OO.ui.FieldLayout(
                        this.field_email_title,
                        {
                            label: 'Email Title', //gadgetMsg['has-group-mission-changed'],
                            align: 'top'
                        }
                    ),
                    new OO.ui.FieldLayout(
                        this.field_email_body,
                        {
                            label: 'Message', //gadgetMsg['mission-changed-or-unsure-explanation'],
                            align: 'top'
                        }
                    ),
                ]
            });

            // When everything is done
            this.content.$element.append(this.fieldSet.$element);
            this.$body.append(this.content.$element);
        };

        /**
         * Set custom height for the modal window
         *
         */
        EmailEditor.prototype.getBodyHeight = function () {
            return 400;
        };

        /**
         * In the event "Select" is pressed
         *
         */
        EmailEditor.prototype.getActionProcess = function (action) {
            var dialog = this,
                allRequiredFieldsAvailable = false,
                isValidEmail = false;


            // Before submitting the form, check that all required fields indeed
            // have values before we call saveItem(). Otherwise, don't close the
            // form but instead reveal which input fields are not yet filled.
            if (dialog.field_email_title.getValue() &&
                dialog.field_email_body.getValue()
            ) {
                allRequiredFieldsAvailable = true;
            }

            if (action === 'continue' && allRequiredFieldsAvailable) {
                return new OO.ui.Process(function () {
                    dialog.saveItem();
                });
            } else if (action === 'continue' && allRequiredFieldsAvailable === false) {
                return new OO.ui.Process(function () {
                    dialog.fieldPopup.toggle(true);
                });
            } else {
                return new OO.ui.Process(function () {
                    dialog.close();
                });
            }
        };

        /**
         * Save the changes to [[Module:GroupContact_Informations]] page.
         */
        EmailEditor.prototype.saveItem = function (deleteFlag) {
            var dialog = this;
            var apiObj = new mw.Api();

            dialog.pushPending();

            apiObj.get(getModuleContent('Affiliate_Contacts_Information')).then(function (data) {
                var i,
                    insertToTable,
                    processWorkingEntry,
                    editSummary,
                    manifest = [],
                    workingEntry,
                    entries,
                    updatedWorkingEntry;

                entries = parseContentModule(data.query.pages);
                // Cycle through existing entries. If we are editing an existing
                // entry, that entry will be modified in place.
                for (i = 0; i < entries.length; i++) {
                    workingEntry = cleanRawEntry(entries[i].value.fields);
                    manifest.push(workingEntry);
                }

                for ( i = 0; i < manifest.length; i++ ) {
                    if (manifest[i].primary_contact_1_email_address) {
                        affiliateEmailAddresses.push(manifest[i].primary_contact_1_email_address);
                    }
                    if (manifest[i].primary_contact_2_email_address) {
                        affiliateEmailAddresses.push(manifest[i].primary_contact_1_email_address);
                    }
                    if (manifest[i].primary_contact_1_username) {
                        affiliateUsernames.push(manifest[i].primary_contact_1_username);
                    }
                    if (manifest[i].primary_contact_2_username) {
                        affiliateUsernames.push(manifest[i].primary_contact_2_username);
                    }
                }
                sendEmailToAllAffiliates(dialog.field_email_title.getValue(), dialog.field_email_body.getValue());

                dialog.close();

                /** After saving, show a message box */
                var messageDialog = new OO.ui.MessageDialog();
                var windowManager = new OO.ui.WindowManager();

                $('body').append(windowManager.$element);
                // Add the dialog to the window manager.
                windowManager.addWindows([messageDialog]);

                // Configure the message dialog when it is opened with the window manager's openWindow() method.
                windowManager.openWindow(messageDialog, {
                    title: 'Message Sent',
                    message: 'Affiliate Group Contacts emailed',
                    actions: [
                        {
                            action: 'accept',
                            label: 'Dismiss',
                            flags: 'primary'
                        }
                    ]
                });

                windowManager.closeWindow(messageDialog);

            }).catch(function (error) {
                alert('Failed');
                dialog.close();
                console.error(error);
            });
        };

        $('.submitAffiliateContact').on('click', function () {
            // First check if the user is logged in
            if (mw.config.get('wgUserName') === null) {
                alert("You need to log in");
            } else {
                openContactWindow({});
            }
        });
        $('.messageAffiliates').on('click', function () {
            // First check if the user is logged in
            if (mw.config.get('wgUserName') === null) {
                alert("You need to log in");
            } else {
                openMessageWindow({});
            }
        });

        /**
         * The dialog window to enter group contact info will be displayed.
         *
         * @param {Object} config
         */
        openMessageWindow = function (config) {
            var emailEditor;
            config.size = 'large';
            emailEditor = new EmailEditor(config);

            windowManager = new OO.ui.WindowManager();
            $('body').append(windowManager.$element);
            windowManager.addWindows([emailEditor]);
            windowManager.openWindow(emailEditor);
        };
    }

    mw.loader.using([
        'mediawiki.api',
        'oojs-ui',
        'oojs-ui-widgets',
        'oojs-ui-core',
        'oojs-ui.styles.icons-editing-core',
        'ext.gadget.luaparse',
        'mediawiki.widgets.DateInputWidget'
    ]).then(renderMessageAffiliatesGroupContactsForm);
}());
