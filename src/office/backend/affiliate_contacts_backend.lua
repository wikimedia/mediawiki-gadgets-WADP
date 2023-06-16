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
        if affiliate_contact.primary_contact_1_firstname == "" or affiliate_contact.primary_contact_2_firstname == "" then
            template_args.affiliate_name = "[[metawiki:" .. affiliate_contact.affiliate_name .. "|" .. affiliate_contact.affiliate_name.. "]]" .. "<sup>(new)</sup>"
        else
            template_args.affiliate_name = "[[metawiki:" .. affiliate_contact.affiliate_name .. "|" .. affiliate_contact.affiliate_name.. "]]"
        end

        -- template_args.affiliate_code = affiliate_contact.affiliate_code
        template_args.affiliate_region = affiliate_contact.affiliate_region
        template_args.unique_id = affiliate_contact.unique_id

        -- Primary Contact 1
        if affiliate_contact.primary_contact_1_firstname ~= nil and affiliate_contact.primary_contact_1_firstname ~= nil then
            if affiliate_contact.primary_contact_1_username ~= nil then
                full_name = affiliate_contact.primary_contact_1_firstname .. " " .. affiliate_contact.primary_contact_1_surname
                template_args.name_contact_1 = "[[metawiki:" .. affiliate_contact.primary_contact_1_username .. "|" .. full_name .. "]]"
            end
        else
            if affiliate_contact.primary_contact_1_username ~= nil then
                username = string.gsub(affiliate_contact.primary_contact_1_username, "User:", "")
                template_args.name_contact_1 = "[[metawiki:" .. affiliate_contact.primary_contact_1_username .. "|" .. username .. "]]"
            end
        end

        template_args.email_contact_1 = affiliate_contact.primary_contact_1_email_address
        template_args.designation_contact_1 = affiliate_contact.primary_contact_1_designation

        -- Primary Contact 2
        if affiliate_contact.primary_contact_2_firstname ~= nil and affiliate_contact.primary_contact_2_firstname ~= nil then
            if affiliate_contact.primary_contact_2_username ~= nil then
                full_name = affiliate_contact.primary_contact_2_firstname .. " " .. affiliate_contact.primary_contact_2_surname
                template_args.name_contact_2 = "[[metawiki:" .. affiliate_contact.primary_contact_2_username .. "|" .. full_name .. "]]"
            end
        else
            if affiliate_contact.primary_contact_2_username ~= nil then
                username = string.gsub(affiliate_contact.primary_contact_2_username, "User:", "")
                template_args.name_contact_2 = "[[metawiki:" .. affiliate_contact.primary_contact_2_username .. "|" .. username .. "]]"
            end
        end

        template_args.email_contact_2 = affiliate_contact.primary_contact_2_email_address
        template_args.designation_contact_2 = affiliate_contact.primary_contact_2_designation


        affiliate_contact_record = frame:expandTemplate{
            title = 'Affiliate Contacts List',
            args = template_args
        }

        contacts = contacts .. "\n" .. affiliate_contact_record

        -- Some how, template_args gets aggressively cached, reset it instead.
        template_args = {}
    end

    return contacts
end

return p
