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

    if ( pageName.startsWith( 'Wikimedia_Affiliates_Contact_Form' ) ) {
        /* Submit Affiliate Contact Information Form */
        mw.loader.load( 'ext.gadget.affiliateContactForm' );
    }
}() );
