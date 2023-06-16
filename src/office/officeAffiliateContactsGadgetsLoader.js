/**
 * Main entry point script for loading form used for the submission affiliate contact
 *  information as well as the form used to send mass messages to affiliates. The data
 *  collected will edit Lua tables and can be later used for userfacing purposes.
 *
 * @author Alice China (WMF)
 */

( function () {
    'use strict';

    var pageName = mw.config.values.wgPageName;

    if ( pageName.startsWith( 'Wikimedia_Affiliates_Contacts_Portal' ) ) {
        /* Submit Affiliate Contact Information Form */
        mw.loader.load( 'ext.gadget.affiliateContactForm' );
        /* Form to select download data */
        mw.loader.load( 'ext.gadget.affiliateDataDownloadForm' );
        /* Bridge to pull in orginfo data from Meta */
        mw.loader.load( 'ext.gadget.wadpCopyOrgInfoData' );
        /* [WIP] Helper functions for formatting */
        // mw.loader.load( 'ext.gadget.affiliateContactsHelpers' );
        /* [DISABLED] Email Affiliate Contacts Form */
        // mw.loader.load( 'ext.gadget.emailAffiliateContactsForm' );
    }
}() );
