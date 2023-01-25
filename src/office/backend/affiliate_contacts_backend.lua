-- Lua script to render user facing information on Affiliate Contacts pages
local p = {}

-- [DB Storage]: Lua tables for Affiliate Contacts Infos and Reports data.
affiliate_contacts = require( 'Module:Affiliate_Contacts_Information' )

function p.render_aci_table( frame )
    -- Function to render the affiliates contacts information table
    -- using the 'Affiliate Contacts List' template.
    --
    -- Usage:
    --   frame: The frame object
    --
    -- Return string: wikitext

    local contacts = ''
    local template_args = {}

    for _, affiliate_contact in ipairs( affiliate_contacts ) do
        template_args.affiliate_name = affiliate_contact.affiliate_name
        -- Primary Contact 1
        template_args.name_contact_1 = affiliate_contact.primary_contact_1_firstname .. " " .. affiliate_contact.primary_contact_1_surname
        template_args.username_contact_1 = affiliate_contact.primary_contact_1_username
        template_args.email_contact_1 = affiliate_contact.primary_contact_1_email_address
        template_args.designation_contact_1 = affiliate_contact.primary_contact_1_designation
        -- Primary Contact 2
        template_args.name_contact_2 = affiliate_contact.primary_contact_2_firstname .. " " .. affiliate_contact.primary_contact_2_surname
        template_args.username_contact_2 = affiliate_contact.primary_contact_2_username
        template_args.email_contact_2 = affiliate_contact.primary_contact_2_email_address
        template_args.designation_contact_2 = affiliate_contact.primary_contact_2_designation


        affiliate_contact_record = frame:expandTemplate{
            title = 'Affiliate Contacts List',
            args = template_args
        }

        contacts = contacts .. "\n" .. affiliate_contact_record
    end

    return contacts
end

return p
