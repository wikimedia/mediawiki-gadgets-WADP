/**
 * Main entry point script for loading forms (Editing interfaces) that will be
 * used, for the submission of reports. The data collected will edit Lua tables
 * and can be later used for userfacing purposes to build the reports page on
 * Meta-Wiki.
 *
 * @author Derick Alangi (WMF)
 */

( function () {
    'use strict';

    if ( mw.config.values.wgPageName.startsWith( 'Wikimedia_Affiliates_Data_Portal' ) ) {
        /* Load Organizational Info Form (module) */
        mw.loader.load( 'ext.gadget.wadpOrgInfoForm' );

        /* Load Affiliates Indicator Upload form to M&E staff */
        mw.loader.load( 'ext.gadget.wadpAIUForm' );

        /* Load Grants Report Form (module) */
        // Disabled till further notice, not used for now.
        // mw.loader.load( 'ext.gadget.wadpGrantReportForm' );

        /* Load Financial Report Form (module) */
        mw.loader.load( 'ext.gadget.wadpFinancialReportForm' );

        /* Load Activities Report Form (module) */
        mw.loader.load( 'ext.gadget.wadpActivitiesReportForm' );

        /* Load the WADP Query Form (module) */
        mw.loader.load( 'ext.gadget.wadpQueryForm' );

        var users = [ 'DAlangi (WMF)', 'DNdubane (WMF)', 'JAnstee (WMF)', 'MKaur (WMF)' ];

        if ( users.indexOf( mw.config.values.wgUserName ) > -1 ) {
            /* Load the out of compliance checker */
            mw.loader.load( 'ext.gadget.wadpOutOfComplianceChecker' );
        }
    }

    if ( mw.config.values.wgPageName.split( 'Wikimedia_Affiliates_Data_Portal/' )[1] === 'Organizations_Information' ) {
        /* Load the org info form for end users to update affiliate info */
        mw.loader.load( 'ext.gadget.wadpOrgInfoForm' );
    }
}() );
