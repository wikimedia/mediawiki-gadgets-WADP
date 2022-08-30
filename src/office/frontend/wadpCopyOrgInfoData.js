/**
 * Copy some extracts of OrgInfo and Contacts data from Meta-Wiki
 * to use on Office-Wiki.
 * @author Alice China (WMF)
 */

( function () {
    'use strict';

    var pageName = mw.config.values.wgPageName;

    if ( pageName === 'Wikimedia_Affiliates_Data_Portal' ) {
        var foreignWiki = 'https://meta.wikimedia.org/w/api.php',
            cleanRawEntry,
            getModuleContent,
            parseContentModule,
            copyOrgInfoData,
            sanitizeInput,
            generateKeyValuePair;

        cleanRawEntry = function (relevantRawEntry) {
            var entryData = {},
                i, j;
            for ( i = 0; i < relevantRawEntry.length; i++ ) {
                if ( relevantRawEntry[ i ].key.name === 'dm_structure' ) {
                    entryData.dm_structure = [];
                    for (
                        j = 0;
                        j < relevantRawEntry[ i ].value.fields.length;
                        j++
                    ) {
                        entryData.dm_structure.push(
                            relevantRawEntry[ i ].value.fields[ j ].value.value
                        );
                    }
                } else {
                    entryData[ relevantRawEntry[ i ].key.name ] = relevantRawEntry[ i ].value.value;
                }
            }
            return entryData;
        };

        sanitizeInput = function (s) {
            return s
                .replace( /\\/g, '\\\\' )
                .replace( /\n/g, '<br />' );
        };

        generateKeyValuePair = function (k, v) {
            var res, jsonarray;
            res = '\t\t'.concat( k, ' = ' );
            if ( k === 'dm_structure' ) {
                jsonarray = JSON.stringify( v );
                // Lua uses { } for "arrays"
                jsonarray = jsonarray.replace( '[', '{' );
                jsonarray = jsonarray.replace( ']', '}' );
                // Style changes (single quotes, spaces after commas)
                jsonarray = jsonarray.replace( /\"/g, '\'' );
                jsonarray = jsonarray.replace( /,/g, ', ' );
                // Basic input sanitation
                jsonarray = sanitizeInput( jsonarray );
                res += jsonarray;
            } else {
                v = sanitizeInput( v );
                v = v.replace( /'/g, '\\\'' );
                res += '\'' + v + '\'';
            }
            res += ',\n';
            return res;
        };

        getModuleContent = function (moduleName) {
            return {
                prop: 'revisions',
                titles: 'Module:' + moduleName,
                rvprop: 'content',
                rvlimit: 1,
                assert: 'user',
                format: 'json'
            };
        };

        parseContentModule = function (sourceBlob) {
            var ast, i, raw;
            for ( i in sourceBlob ) {  // should only be one result
                raw = sourceBlob[ i ].revisions[ 0 ][ '*' ];
                ast = luaparse.parse( raw );
                return ast.body[ 0 ].arguments[ 0 ].fields;
            }
        };

        copyOrgInfoData = function () {
            var foreignAPI = new mw.ForeignApi( foreignWiki ),
                entries,
                processedEntry,
                i,
                insertToTable;
            //Pulling OrgInfo table information
            foreignAPI.get( getModuleContent( 'Organizational_Informations' ))
                .done( function ( data ) {
                    entries = parseContentModule( data.query.pages);
                    // Re-generate the Lua table based on 'manifest'
                    insertToTable = 'return {\n';
                    for ( i=0; i < entries.length; i++ ) {
                        processedEntry = cleanRawEntry( entries[i].value.fields );

                        /* Orange fields on the spreadsheet :
                            Affiliate Code
                            Affiliate Name
                            Affiliate Country
                            Languages*
                            Region
                            Affiliate Status
                            Affiliate Type
                            Origination Date
                            */
                        if ( processedEntry.recognition_status === "recognised") {
                            insertToTable += '\t{\n';
                            if ( processedEntry.affiliate_code ) {
                                insertToTable += generateKeyValuePair ( 'affiliate_code', processedEntry.affiliate_code );
                            }
                            if ( processedEntry.group_name ) {
                                insertToTable += generateKeyValuePair ( 'affiliate_name', processedEntry.group_name );
                            }
                            if ( processedEntry.group_country ) {
                                insertToTable += generateKeyValuePair ( 'affiliate_country', processedEntry.group_country );
                            }
                            if ( processedEntry.region ) {
                                insertToTable += generateKeyValuePair ( 'region', processedEntry.region );
                            }
                            if ( processedEntry.org_type ) {
                                insertToTable += generateKeyValuePair ( 'affiliate_type', processedEntry.org_type);
                            }
                            if ( processedEntry.group_contact1 ) {
                                insertToTable += generateKeyValuePair ( 'affiliate_contact1', processedEntry.group_contact1);
                            }
                            if ( processedEntry.group_contact2 ) {
                                insertToTable += generateKeyValuePair ( 'affiliate_contact2', processedEntry.group_contact2);
                            }
                            if ( processedEntry.recognition_status ) {
                                insertToTable += generateKeyValuePair ( 'status', processedEntry.recognition_status);
                            }
                            if ( processedEntry.agreement_date ) {
                                insertToTable += generateKeyValuePair ( 'origination_date', processedEntry.agreement_date);
                            }
                            insertToTable += '\t},\n';
                        }
                    }
                    insertToTable += '}';
                    console.log(insertToTable);

                    // Insert into newly created Affiliate Contacts Table as required
                    new mw.Api().postWithToken(
                        'csrf',
                        {
                            action: 'edit',
                            summary: 'Copying organization information from MetaWiki to this Affiliate Contacts Information...',
                            pageid: 39956, //[[Module:Organization_Information]],
                            text: insertToTable,
                            contentmodel: 'Scribunto'
                        }
                    ).done( function(data){
                        console.log('Populated');
                        console.log(data);
                    });
                });
        };

        /** Loading:
         * - The interface provided by mediawiki api
         * - Luaparse gadget that contains the logic to parse a Lua table
         * to an AST
         */
        mw.loader.using([
            'mediawiki.api',
            'ext.gadget.luaparse'
        ]).then( copyOrgInfoData() );
    }
}());
