/**
 * Copy some extracts of OrgInfo data from Meta-Wiki wiki
 * AffCom wiki OrgInfo module for surfacing on AffCom wiki.
 * @author Derick Alangi (WMF)
 */
( function () {
    'use strict';

    var pageName = mw.config.values.wgPageName;

    if ( pageName === 'Wikimedia_Affiliates' ) {
        var foreignWiki = 'https://meta.wikimedia.org/w/api.php',
            cleanRawEntry,
            getModuleContent,
            parseContentModule,
            copyOrgInfoData,
            sanitizeInput,
            generateKeyValuePair;

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
                rvlimit: 1,
                assert: 'user'
            };
        };

        /**
         * Takes Lua-formatted content from [[Module:Organizational_Informations]] and
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

        /**
         * Sanitizes input for saving to wiki
         *
         * @param {string} s
         *
         * @return {string}
         */
        sanitizeInput = function ( s ) {
            return s
                .replace( /\\/g, '\\\\' )
                .replace( /\n/g, '<br />' );
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
        generateKeyValuePair = function ( k, v ) {
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

        copyOrgInfoData = function () {
            var foreignApi = new mw.ForeignApi( foreignWiki ),
                entries,
                workingEntry,
                i,
                insertInPlace;

            foreignApi.get( getModuleContent( 'Organizational_Informations' ) ).done( function ( data ) {
                entries = parseContentModule( data.query.pages );

                // Re-generate the Lua table based on `manifest`
                insertInPlace = 'return {\n';
                for ( i = 0; i < entries.length; i++ ) {
                    workingEntry = cleanRawEntry( entries[i].value.fields );

                    if ( workingEntry.recognition_status === "recognised" ) {
                        insertInPlace += '\t{\n';
                        if ( workingEntry.unique_id ) {
                            insertInPlace += generateKeyValuePair(
                                'unique_id',
                                workingEntry.unique_id
                            );
                        }
                        if ( workingEntry.affiliate_code ){
                            insertInPlace += generateKeyValuePair(
                                'affiliate_code',
                                workingEntry.affiliate_code
                            );
                        }
                        if ( workingEntry.group_name ) {
                            insertInPlace += generateKeyValuePair(
                                'group_name',
                                workingEntry.group_name
                            );
                        }
                        if ( workingEntry.org_type ) {
                            insertInPlace += generateKeyValuePair(
                                'org_type',
                                workingEntry.org_type
                            );
                        }
                        if ( workingEntry.region ) {
                            insertInPlace += generateKeyValuePair(
                                'region',
                                workingEntry.region
                            );
                        }
                        if ( workingEntry.group_contact1 ) {
                            insertInPlace += generateKeyValuePair(
                                'group_contact1',
                                workingEntry.group_contact1
                            );
                        }
                        if ( workingEntry.group_contact2 ) {
                            insertInPlace += generateKeyValuePair(
                                'group_contact2',
                                workingEntry.group_contact2
                            );
                        }
                        insertInPlace += '\t},\n';
                    }
                }
                insertInPlace += '}';

                // Make changes to the Org Info table as required.
                new mw.Api().postWithToken(
                    'csrf',
                    {
                        action: 'edit',
                        bot: true,
                        nocreate: true,
                        summary: 'Copying fresh new data from MetaWiki to here...',
                        pageid: 3529,  // [[Module:Affiliate_Information]]
                        text: insertInPlace,
                        contentmodel: 'Scribunto'
                    }
                );
            } );
        };

        mw.loader.using( [
            'mediawiki.api',
            'ext.gadget.luaparse'
        ] ).then( copyOrgInfoData );
    }
}() );