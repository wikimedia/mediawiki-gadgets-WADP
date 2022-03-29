-- Lua script to render user facing information on [[m:WADP]] & its sub-pages.

local p = {}

org_infos = require( 'Module:Affiliate_Information' )

function build_org_infos_template( frame, entry )
    -- Build entries for the organizational information template.
    --
    -- Usage:
    --   frame: The frame object
    --   entry: An org infos entry with relevant data
    --
    -- Return string: wikitext

    template_args = { type = entry.org_type, }

    if entry.unique_id ~= nil then
        template_args.unique_id = entry.unique_id
    end

    if entry.affiliate_code ~= nil then
        template_args.affiliate_code = entry.affiliate_code
    end

    if entry.group_name ~= nil then
        template_args.group_name = '[[m:' .. entry.group_name .. '|' .. entry.group_name .. ']]'
    end

    if entry.org_type ~= nil then
        template_args.org_type = entry.org_type
    end

    if entry.region ~= nil then
        template_args.region = entry.region
    end

    if entry.group_contact1 ~= nil then
        template_args.group_contact1 = '[[m:' .. entry.group_contact1 .. '|' .. entry.group_contact1:gsub("User:", "") .. ']]'
    end

    if entry.group_contact2 ~= nil then
        template_args.group_contact2 = '[[m:' .. entry.group_contact2 .. '|' .. entry.group_contact2:gsub("User:", "") .. ']]'
    end

    entrycontent = frame:expandTemplate{
        title = 'Affiliates_Information',
        args = template_args
    }

    return entrycontent
end

function p.render_org_infos_table( frame )
    -- Function for rendering or displaying organizational
    -- information table using the 'Reports record s2' template.
    --
    -- Usage:
    --   frame: The frame object
    --
    -- Return string: wikitext

    orgInfoTable = ''

    for _, org_info in ipairs( org_infos ) do
        orgInfoTable = orgInfoTable .. "\n" .. build_org_infos_template( frame, org_info )
    end

    return orgInfoTable
end

return p
