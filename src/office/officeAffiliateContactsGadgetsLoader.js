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
    var whiteList = [
        'AChina-WMF',
        'Xeno (WMF)',
        'RamzyM (WMF)',
        'Keegan (WMF)',
        // 'MKaur (WMF)',
        // 'Mervat (WMF)'
    ];

    if ( pageName.startsWith( 'Wikimedia_Affiliates_Contacts_Portal' ) ) {
        if ( whiteList.indexOf( mw.config.values.wgUserName ) > -1 ) {
            mw.loader.load( [
                'ext.gadget.affiliateContactForm',
                'ext.gadget.affiliateDataDownloadForm',
                'ext.gadget.wadpCopyOrgInfo',
            ] );
            mw.loader.load( [
                'ext.gadget.wacpDigest',
            ] );
            /* [WIP] Helper functions for formatting */
            // mw.loader.load( 'ext.gadget.affiliateContactsHelpers' );
            /* [DISABLED] Email Affiliate Contacts Form */
            // mw.loader.load( 'ext.gadget.emailAffiliateContactsForm' );
        }
    }
}() );
