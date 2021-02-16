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
        mw.loader.load( 'ext.gadget.reportOrgInfoForm' );

        /* Load Affiliates Indicator Upload form to M&E staff */
        mw.loader.load( 'ext.gadget.wadpAIUForm' );

        /* Load Grants Report Form (module) */
        mw.loader.load( 'ext.gadget.reportGrantsForm' );

        /* Load Financial Report Form (module) */
        mw.loader.load( 'ext.gadget.reportFinancialForm' );

        /* Load Activities Report Form (module) */
        mw.loader.load( 'ext.gadget.reportActivitiesForm' );

        /* Load the ARP Query Form (module) */
        mw.loader.load( 'ext.gadget.arpQueryForm' );
    }

    if ( mw.config.values.wgPageName.split( 'Wikimedia_Affiliates_Data_Portal/' )[1] === 'Organizations_Information' ) {
        mw.loader.load( 'ext.gadget.reportOrgInfoForm' );
    }
}() );
