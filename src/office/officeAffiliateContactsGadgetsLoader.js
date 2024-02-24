/**
 * Main entry point script for loading form used for the submission affiliate contact
 * information as well as the form used to send mass messages to affiliates. The data
 * collected will edit Lua tables and can be later used for userfacing purposes.
 *
 * @author Alice China (WMF)
 */
( function () {
    'use strict';

    var pageName = mw.config.values.wgPageName,
        whiteList = [
            'DNdubane (WMF)',
            'DAlangi (WMF)',
            'AChina-WMF',
            'MKaur (WMF)',
            'JAnstee (WMF)',
            'Xeno (WMF)',
            'Keegan (WMF)',
            'Ramzym-WMF',
            'Mervat (WMF)'
        ];

    if ( pageName.startsWith( 'Wikimedia_Affiliates_Contacts_Portal' ) ) {
        if ( whiteList.indexOf( mw.config.values.wgUserName ) > -1 ) {
            mw.loader.load( [
                'ext.gadget.affiliateContactForm',
                'ext.gadget.affiliateDataDownloadForm',
                'ext.gadget.wadpCopyOrgInfoData',
            ] );

            /* [WIP] Helper functions for formatting */
            // mw.loader.load( 'ext.gadget.affiliateContactsHelpers' );
            /* [DISABLED] Email Affiliate Contacts Form */
            // mw.loader.load( 'ext.gadget.emailAffiliateContactsForm' );
        }
    }
}() );
