-- Lua script to render user facing information on [[m:WADP]] & its sub-pages.

local p = {}

-- Constants: Note that, these constants are not used during if()
--  conditions, they're only used duing assignment of a value to
--  a variable.
COMPLIANT_NOR_TEXT = "''Compliant''"
CROSS = 'Cross'
DERECONISED_STATUS = 'derecognised'
DERECONIZED_STATUS = 'derecognized'
NEW_AFFILIATE_NOR_TEXT = "<span style='color: blue'>''New affiliate''</span>"
NON_COMPLIANT_NOR_TEXT = "<span style='color: red'>''Report past due''</span>"
NOT_APPLICABLE_TEXT = 'Not applicable'
NOT_REQUIRED = "''Not Required''"
TICK = 'Tick'


-- [DB Storage]: Lua tables for Org Infos and Reports data.
activities_reports = require( 'Module:Activities_Reports' )
financial_reports = require( 'Module:Financial_Reports' )
grant_reports = require( 'Module:Grant_Reports' ) -- To be used in future.
org_infos = require( 'Module:Organizational_Informations' )

-- [DB Storage]: Lua tables for Sandbox Reports data **only** (for tests).
sandbox_activities_reports = require( 'Module:Activities_Reports/Sandbox' )
sandbox_financial_reports = require( 'Module:Financial_Reports/Sandbox' )

-- [Util]: Months number to name map (e.g. 1 -> January, 12 -> December).
months = {
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
}

-- [Util]: Months number to short name map (e.g. 1 -> Jan, 12 -> Dec).
short_months = {
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec',
}

-- [Util]: Helper modules related to translations and text direction.
is_rtl = require( 'Module:Is rtl' )
lang = mw.getCurrentFrame():preprocess( '{{int:lang}}' )
ModuleMsg = require( 'Module:ModuleMsg' )
msg = ModuleMsg:get_msgs( 'Template:I18n/Reports', lang )

function get_translation( entry )
    -- Get WADP forms strings and their translations.
    --
    -- Usage:
    --   entry: table containing the entries to translate
    --
    -- Return table: translated entry (with English as fallback)

    if entry.unique_id == nil or lang == 'en' then
        -- This system assumes that a unique id is assigned.
        return entry
    end

    for k, v in pairs( entry ) do
        if msg[k] ~= nil then
            entry[k] = msg[k]
        end
    end

    return entry
end

function get_directionality()
    -- Should something be left-aligned or right-aligned?
    if is_rtl[lang] == true then
        return 'right'
    end
    return 'left'
end

function is_current_report( ts )
    -- Check if the report year matches the current year
    --
    -- Usage:
    --   ts: time stamp of the report
    --
    -- Return boolean: If report is current (true) or not (false)

    c_year = os.date( '%Y' );
    ts_year = mw.text.split( ts, '-' )[1]

    if ts_year == c_year then
        return true
    end

    return false
end

function format_date( old_date, format )
    -- Format date to a format specified by `format`
    -- e.g. YYYY-MM-DD, YYYY/MM/DD etc
    --
    -- Usage:
    --   date: date submitted
    --   format: format specified
    --
    -- Return string: In the format specified
    local date_splitted, new_date

    if format == 'YYYY-MM-DD' then
        date_splitted = mw.text.split( old_date, '/' )
        new_date = date_splitted[1] .. '-' .. date_splitted[2] .. '-' .. date_splitted[3]
    elseif format == 'TS-TO-YYYY-MM-DD' then
        new_date = string.sub( old_date, 1, 10 )
    end

    return new_date
end

function iter( ar, fr, gr )
    -- Iterate over multiple Lua tables at the same time
    --
    -- Usage:
    --   ar: Activities reports Lua table
    --   fr: Financial reports Lua table
    --   gr: Grant report Lua table
    --
    -- Return table: Entries at index i of the tables

    local i = 0
    return function()
        i = i + 1
        return ar[i], fr[i], gr[i]
    end
end

function iter_absolute( reports )
    -- Iterate over one lua table of reports
    --
    -- Usage:
    --   reports: The reports to iterate over
    --
    -- Return table: entry at index i of the table

    local i = 0
    return function()
        i = i + 1
        return reports[i]
    end
end

function add_days_to_date( reporting_date, days )
    -- Add specific number of days to current date
    --
    -- Usage:
    --   days: Number of days to add
    --
    -- Return date: with number of days added

    if reporting_date ~= nil then
        r_date = mw.text.split( reporting_date, "/" );
        current_time = os.time( { year=tonumber( r_date[3] ), month=tonumber( r_date[2] ), day=tonumber( r_date[1] ) } )
    else
        current_time = os.time()
    end

    current_time = current_time + days * 24 * 60 * 60
    date = os.date("%d/%m/%Y", current_time)

    return date
end

function get_affiliate_latest_reports( org_info, activities_reports, financial_reports, grant_reports )
    -- Function to fetch the all latest reports for an affiliate available in
    -- different report tables. In the case of multiple reports submitted
    -- for the same day, month or year, this function will use the timestamp
    -- to get the latest report.
    --
    -- Usage:
    --   org_info: organizational information used for creating the relationship
    --   activities_reports: activities reports Lua table.
    --   financial_reports: financial reports Lua table.
    --   grant_reports: grant reports Lua table.
    --
    --
    -- Return table: entry for the latest activities_report, financial_report, grant report

    tmp_ar = { dos_stamp = '1800-01-01:T00:00:00Z' }
    tmp_fr = { dos_stamp = '1800-01-01T00:00:00Z' }
    tmp_gr = { dos_stamp = '1800-01-01T00:00:00Z' }

    for activities_report in iter_absolute( activities_reports ) do
        if activities_report ~= nil and org_info.group_name == activities_report.group_name then
            if activities_report.dos_stamp > tmp_ar.dos_stamp then
                tmp_ar = activities_report
            end
        end
    end

    for financial_report in iter_absolute( financial_reports ) do
        if financial_report ~= nil and org_info.group_name == financial_report.group_name then
            if financial_report.dos_stamp > tmp_fr.dos_stamp then
                tmp_fr = financial_report
            end
        end
    end

    for grant_report in iter_absolute( grant_reports ) do
        if grant_report ~= nil and org_info.group_name == grant_report.group_name then
            if grant_report.dos_stamp > tmp_gr.dos_stamp then
                tmp_gr = grant_report
            end
        end
    end

    return tmp_ar, tmp_fr, tmp_gr
end

function get_affiliate_latest_report( org_info, reports )
    -- Fetch latest reports from particular set of reports
    --
    -- Usage:
    --   org_info: organizational information used for creating the relationship
    --   reports: the set of reports to search from
    --
    --
    -- Return table: entry for the latest report

    tmp = { dos_stamp = '1800-01-01:T00:00:00Z' }

    for report in iter_absolute( reports ) do
        if report ~= nil and org_info.group_name == report.group_name then
            if report.dos_stamp > tmp.dos_stamp then
                tmp = report
            end
        end
    end

    return tmp
end

function build_arp_template( frame, org_info, activities_report, financial_report, grant_report )
    -- Build entries for the WADP Reports table template.
    --
    -- Usage:
    --   frame: The frame object
    --   org_info: Organization information
    --   activities_report: Activities report for that organization in the current year
    --   financial_report: Financial report for that organization in the current year
    --   grant_report: Grant report for that organization for the current year
    --
    -- Return string: wikitext

    org_info = get_translation( org_info )
    template_args = {}

    if org_info.affiliate_code ~= nil then
        template_args.affiliate_code = org_info.affiliate_code
    end
    if org_info.group_name ~= nil then
        template_args.affiliate_name = '[[' .. org_info.group_name .. ']]'
    end
    if org_info.org_type ~= nil then
        if org_info.org_type == 'User Group' then
            template_args.org_type = 'WUG'
        elseif org_info.org_type == 'Chapter' then
            template_args.org_type = 'Chap'
        elseif org_info.org_type == 'Thematic Organization' then
            template_args.org_type = 'ThOrg'
        elseif org_info.org_type == 'Allied or other organization' then
            template_args.org_type = 'AOrg'
        end
    end
    if org_info.legal_entity ~= nil and org_info.legal_entity == 'No' then
        template_args.financial_report = NOT_REQUIRED
    end

    if activities_report.report_link ~= nil then
        reporting_year = mw.text.split( activities_report.end_date, '/' )[3]
        sd_month_number = tonumber( mw.text.split( activities_report.start_date, '/' )[2] )
        ed_month_number = tonumber( mw.text.split( activities_report.end_date, '/' )[2] )

        -- Compute AAR identifiers
        end_year = tonumber( mw.text.split( activities_report.end_date, '/' )[3] )
        if end_year ~= nil then
            temp = end_year - 1 -- To be used to contruct the year identifier
            end_year_sub = mw.ustring.sub( tostring( end_year ), -2 )
        end

        -- Compose the translatable link for activity reports
        if activities_report.report_link_en ~= nil then
            translatable_report_link = '<sup>[' ..
                    activities_report.report_link_en .. ' [' .. activities_report.report_lang_code ..
                    ']]</sup>'
        elseif activities_report.report_lang_code ~= nil and activities_report.report_link_en == nil then
            translatable_report_link = '(' .. activities_report.report_lang_code .. ')'
        else
            translatable_report_link = ' (en)'
        end

        if activities_report.report_type ~= nil then
            if mw.ustring.find( activities_report.report_link, "https://" ) then
                template_args.activities_report = '[' ..
                        activities_report.report_link .. ' ' .. temp .. '-'.. end_year_sub ..
                        '] ' .. translatable_report_link
            else
                template_args.activities_report = '[[' ..
                        activities_report.report_link .. '|' .. temp .. '-'.. end_year_sub ..
                        ']] ' .. translatable_report_link
            end

            if org_info.fiscal_year_end ~= nil and org_info.fiscal_year_end ~= '' then
                -- Compute fiscal year based on the end of the FY
                fy_start_month = tonumber( mw.text.split( org_info.fiscal_year_start, '/' )[2] )
                fy_end_month = tonumber( mw.text.split( org_info.fiscal_year_end, '/' )[2] )
                template_args.fiscal_year = short_months[fy_start_month] .. ' - ' .. short_months[fy_end_month]
            elseif org_info.agreement_date ~= nil then
                agreement_date_month = tonumber( mw.text.split( org_info.agreement_date, '/' )[2] )
                if agreement_date_month - 1 < 1 then
                    template_args.fiscal_year = short_months[agreement_date_month] .. ' - ' .. short_months[agreement_date_month + 12 - 1]
                else
                    template_args.fiscal_year = short_months[agreement_date_month] .. ' - ' .. short_months[agreement_date_month - 1]
                end
            end
        end

        -- [feat] Add reporting month
        if org_info.fiscal_year_start ~= nil and org_info.fiscal_year_start ~= '' then
            -- Attempt to compute reporting date from fiscal year in DB
            -- NOTE: use current year which matches reporting month year
            reporting_date = org_info.fiscal_year_start .. '/' .. os.date( "%Y" )
        elseif org_info.agreement_date ~= nil then
            -- break and reconstruct reporting date based on agreement date
            -- NOTE: add 30 days if no fiscal year is specified.
            agreement_date = mw.text.split( org_info.agreement_date, "/" )
            reporting_date = agreement_date[1] .. '/' .. agreement_date[2] .. '/' .. os.date( "%Y" )
            reporting_date = add_days_to_date( reporting_date, 30 )
        end

        if org_info.org_type == 'User Group' then
            reporting_month = tonumber( mw.text.split( reporting_date, "/" )[2] )
            template_args.reporting_month = short_months[reporting_month]
            -- +120 days for Chapters and ThOrgs
        elseif org_info.org_type == 'Chapter' or org_info.org_type == 'Thematic Organization' then
            reporting_date = add_days_to_date( reporting_date, 120 )
            reporting_month = tonumber( mw.text.split( reporting_date, "/" )[2] )
            template_args.reporting_month = short_months[reporting_month]
        end
    end

    if financial_report.report_link ~= nil then
        -- Compose the translatable link for financial reports
        if financial_report.report_link_en ~= nil then
            translatable_report_link = '<sup>[' ..
                    financial_report.report_link_en .. ' [' .. financial_report.report_lang_code..
                    ']]</sup>'
        elseif financial_report.report_lang_code ~= nil
                and financial_report.report_link_en == nil then
            translatable_report_link = '(' .. financial_report.report_lang_code .. ')'
        else
            translatable_report_link = '(en)'
        end

        if financial_report.report_type == 'Annual Financial Report' then
            -- Compute AAR & FR identifiers
            end_year = tonumber( mw.text.split( financial_report.end_date, '/' )[3])
            temp = end_year - 1 -- To be used to contruct the year identifier
            end_year_sub = mw.ustring.sub( tostring( end_year ), -2 )
            if mw.ustring.find( financial_report.report_link, "https://" ) then
                template_args.financial_report = '[' ..
                        financial_report.report_link .. ' ' .. temp .. '-'.. end_year_sub ..
                        '] ' .. translatable_report_link
            else
                template_args.financial_report = '[[' ..
                        financial_report.report_link .. '|' .. temp .. '-'.. end_year_sub ..
                        ']] ' .. translatable_report_link
            end
        elseif financial_report.report_type == 'Multi-year Financial Report' then
            end_year = mw.text.split( financial_report.end_date, '/' )[3]
            start_year = mw.text.split( financial_report.start_date, '/' )[3]
            if mw.ustring.find( financial_report.report_link, "https://" ) then
                template_args.financial_report = '[' ..
                        financial_report.report_link .. ' ' .. start_year .. '-'.. end_year ..
                        '] '  .. translatable_report_link
            else
                template_args.financial_report = '[[' ..
                        financial_report.report_link .. '|' .. start_year .. '-'.. end_year ..
                        ']] '  .. translatable_report_link
            end
        end
    end

    -- TODO: Logic to be revisited in Phase II
    -- if grant_report.report_link ~= nil then
    --	template_args.grant_report = '[' .. grant_report.report_link .. ' ' .. grant_report.report_type .. ']'
    --	if is_current_report(grant_report.dos_stamp) then
    --		template_args.uptodate_reporting = frame:expandTemplate{title = 'Tick'}
    --	else
    --		template_args.uptodate_reporting = frame:expandTemplate{title = 'Cross'}
    --	end
    --end

    --if org_info.legal_entity ~= nil then
    --	if ( is_current_report(financial_report.dos_stamp) and is_current_report(activities_report.dos_stamp) ) then
    --		template_args.uptodate_reporting = frame:expandTemplate{title = 'Tick'}
    --	elseif org_info.legal_entity == 'No' then
    --		if is_current_report(activities_report.dos_stamp) then
    --			template_args.uptodate_reporting = frame:expandTemplate{title = 'Tick'}
    --		end
    --	else
    --		template_args.uptodate_reporting = frame:expandTemplate{title = 'Cross'}
    --	end
    --end

    --if org_info.notes_on_reporting == '' then
    --	template_args.notes_on_reporting = 'Awaiting M&E staff\'s remark...'
    --else
    --	template_args.notes_on_reporting = "'''''" .. org_info.notes_on_reporting .. "'''''"
    --end

    if org_info.org_type == 'Allied or other organization' then
        template_args.uptodate_reporting = NOT_REQUIRED
        template_args.notes_on_reporting = NOT_REQUIRED
    end

    -- M&E staff priority override
    if org_info.uptodate_reporting == 'Tick' then
        template_args.uptodate_reporting = frame:expandTemplate{ title = TICK }
        template_args.notes_on_reporting = COMPLIANT_NOR_TEXT
    elseif org_info.uptodate_reporting == 'Cross' and org_info.notes_on_reporting ~= '' then
        template_args.uptodate_reporting = frame:expandTemplate{ title = CROSS }
        template_args.notes_on_reporting = "<span style='color: red'>''" .. org_info.notes_on_reporting .. "''</span>"
    elseif org_info.uptodate_reporting == 'Cross' then
        template_args.uptodate_reporting = frame:expandTemplate{ title = CROSS }
        template_args.notes_on_reporting = NON_COMPLIANT_NOR_TEXT
    end

    affiliate_record = frame:expandTemplate{
        title = 'Reports record s1',
        args = template_args
    }

    return affiliate_record
end

function build_org_infos_template( frame, entry )
    -- Build entries for the organizational information template.
    --
    -- Usage:
    --   frame: The frame object
    --   entry: An org infos entry with relevant data
    --
    -- Return string: wikitext

    local social_media = ''
    local type
    local template_args = {}
    entry = get_translation(entry)

    if entry.org_type == 'User Group' then
        type = 'UG'
    elseif entry.org_type == 'Chapter' then
        type = 'Chap'
    elseif entry.org_type == 'Thematic Organization' then
        type = 'ThOrg'
    else
        type = 'AO'
    end

    if entry.unique_id ~= nil then
        template_args.unique_id = entry.unique_id
    end

    if entry.affiliate_code ~= nil then
        template_args.affiliate_code = entry.affiliate_code
    end

    if entry.group_name ~= nil then
        template_args.name = '[[' .. entry.group_name .. "]] ('''" .. type .. "''')"
    end

    if entry.other ~= nil then
        template_args.blog_or_news = '[' .. entry.other	.. ' ' .. entry.affiliate_code .. "'s news 🔗]"
    end

    if entry.agreement_date ~= nil then
        if entry.org_type == 'Allied or other organization' then
            template_args.agreement_date = NOT_APPLICABLE_TEXT
        else
            template_args.agreement_date = entry.agreement_date
        end
    end

    if entry.twitter ~= nil then
        social_media = social_media .. '[[File:Twitter_Logo.png|26px|link=' .. entry.twitter .. ']]'
    end

    if entry.facebook ~= nil then
        social_media = social_media .. '&nbsp;&nbsp;&nbsp;[[File:Facebook_icon_192.png |26px|link=' .. entry.facebook .. ']]'
    end

    template_args.social_media = social_media

    if entry.reporting_due_date ~= nil then
        template_args.reporting_due_date = format_date(
                entry.reporting_due_date, 'TS-TO-YYYY-MM-DD'
        )
    end

    if entry.dos_stamp ~= nil then
        template_args.last_updated_on = format_date( entry.dos_stamp, 'YYYY-MM-DD' )
    end

    entrycontent = frame:expandTemplate{
        title = 'Reports record s2',
        args = template_args
    }

    return entrycontent
end

function build_derecog_template( frame, entry )
    -- Build entries for derecognized affiliates template.
    --
    -- Usage:
    --   frame: The frame object
    --   entry: An org infos entry with relevant data
    --
    -- Return string: wikitext

    entry = get_translation( entry )
    template_args = { type = entry.org_type, }

    if entry.affiliate_code ~= nil then
        template_args.affiliate_code = entry.affiliate_code
    end

    if entry.group_name ~= nil then
        template_args.name = '[[' .. entry.group_name .. ']]'
    end

    for _, activities_report in ipairs( activities_reports ) do
        if ( entry.group_name == activities_report.group_name ) then
            -- Let's keep this logic if we intend to show other reports in the future
            latest_ar, latest_fr, latest_gr = get_affiliate_latest_reports(
                    entry, activities_reports, financial_reports, grant_reports
            )
            if ( latest_ar ~= nil ) then
                reporting_year = mw.text.split( latest_ar.end_date, '/' )[3]

                -- Compute AAR identifiers
                end_year = tonumber( mw.text.split( latest_ar.end_date, '/' )[3] )
                temp = end_year - 1 -- To be used to contruct the year identifier
                end_year_sub = mw.ustring.sub( tostring( end_year ), -2 )

                template_args.activities_report = '[' .. latest_ar.report_link .. ' ' .. temp .. '-'.. end_year_sub .. ']'
            end
            break
        end
    end

    if entry.agreement_date ~= nil then
        template_args.agreement_date = entry.agreement_date
    end

    if entry.derecognition_date ~= nil then
        template_args.derecognition_date = entry.derecognition_date
    end

    if entry.derecognition_note ~= nil then
        template_args.derecognition_status = entry.derecognition_note
    end

    entrycontent = frame:expandTemplate{
        title = 'Reports derecognized affiliates',
        args = template_args
    }

    return entrycontent
end

function p.render_arp_table( frame )
    -- Function to render the affiliates Report table
    -- using the 'Reports record s2' template.
    --
    -- Usage:
    --   frame: The frame object
    --
    -- Return string: wikitext

    reports = ''
    template_args = {}

    for _, org_info in ipairs( org_infos ) do
        -- TODO: Decide whether to hide the reports for derecognized groups as well.
        for activities_report, financial_report, grant_report in iter(
                activities_reports, financial_reports, grant_reports
        ) do
            if activities_report == nil then
                activities_report = {}
            end

            if financial_report == nil then
                financial_report = {}
            end

            if grant_report == nil then
                grant_report = {}
            end

            -- Do not render reports for affiliates that have been derecognised.
            if org_info.recognition_status == 'derecognised' then
                break
            end

            -- Special Cases: M&E Staff override for new affiliates: "Tick-N"
            -- and "Cross-N"
            if org_info.uptodate_reporting == 'Tick-N' then
                template_args.affiliate_code = org_info.affiliate_code
                template_args.affiliate_name = '[[' .. org_info.group_name .. ']]'
                if org_info.org_type ~= nil then
                    if org_info.org_type == 'User Group' then
                        template_args.org_type = 'WUG'
                        template_args.reporting_month = '-'
                    elseif org_info.org_type == 'Chapter' then
                        template_args.org_type = 'Chap'
                        template_args.reporting_month = '-'
                    elseif org_info.org_type == 'Thematic Organization' then
                        template_args.org_type = 'ThOrg'
                        template_args.reporting_month = '-'
                    end
                end

                latest_ar = get_affiliate_latest_report( org_info, activities_reports )
                if latest_ar.report_link_en ~= nil then
                    if mw.ustring.find( latest_ar.report_link_en, "https://" ) then
                        template_args.activities_report = '[' .. latest_ar.report_link_en .. ' ' .. 'Pending report (en)]'
                    else
                        template_args.activities_report = '[[' .. latest_ar.report_link_en .. '|' .. 'Pending report (en)]]'
                    end
                elseif latest_ar.report_link ~= nil then
                    if mw.ustring.find( latest_ar.report_link, "https://" ) then
                        template_args.activities_report = '[' .. latest_ar.report_link .. ' ' .. 'Pending report]'
                    else
                        template_args.activities_report = '[[' .. latest_ar.report_link .. '|' .. 'Pending report]]'
                    end
                else
                    template_args.activities_report = '-'
                end

                latest_fr = get_affiliate_latest_report( org_info, financial_reports )
                if latest_fr.report_link_en ~= nil then
                    if mw.ustring.find( latest_fr.report_link_en, "https://" ) then
                        template_args.financial_report = '[' .. latest_fr.report_link_en .. ' ' .. 'Pending report (en)]'
                    else
                        template_args.financial_report = '[[' .. latest_fr.report_link_en .. '|' .. 'Pending report (en)]]'
                    end
                elseif latest_fr.report_link ~= nil then
                    if mw.ustring.find( latest_fr.report_link, "https://" ) then
                        template_args.financial_report = '[' .. latest_fr.report_link .. ' ' .. 'Pending report]'
                    else
                        template_args.financial_report = '[[' .. latest_fr.report_link .. '|' .. 'Pending report]]'
                    end
                elseif org_info.legal_entity ~= nil and org_info.legal_entity == 'No' then
                    template_args.financial_report = NOT_REQUIRED
                else
                    template_args.financial_report = '-'
                end

                template_args.fiscal_year = '-'
                template_args.uptodate_reporting = frame:expandTemplate{ title = 'Tick' }
                template_args.notes_on_reporting = NEW_AFFILIATE_NOR_TEXT

                affiliate_record = frame:expandTemplate{
                    title = 'Reports record s1',
                    args = template_args
                }

                reports = reports .. "\n" .. affiliate_record
                break
            elseif org_info.uptodate_reporting == 'Cross-N' then
                template_args.affiliate_code = org_info.affiliate_code
                template_args.affiliate_name = '[[' .. org_info.group_name .. ']]'
                if org_info.org_type ~= nil then
                    if org_info.org_type == 'User Group' then
                        template_args.org_type = 'WUG'
                        template_args.reporting_month = '-'
                    elseif org_info.org_type == 'Chapter' then
                        template_args.org_type = 'Chap'
                        template_args.reporting_month = '-'
                    elseif org_info.org_type == 'Thematic Organization' then
                        template_args.org_type = 'ThOrg'
                        template_args.reporting_month = '-'
                    end
                end

                latest_ar = get_affiliate_latest_report( org_info, activities_reports )
                if latest_ar.report_link_en ~= nil then
                    if mw.ustring.find( latest_ar.report_link_en, "https://" ) then
                        template_args.activities_report = '[' .. latest_ar.report_link_en .. ' ' .. 'Pending report (en)]'
                    else
                        template_args.activities_report = '[[' .. latest_ar.report_link_en .. '|' .. 'Pending report (en)]]'
                    end
                elseif latest_ar.report_link ~= nil then
                    if mw.ustring.find( latest_ar.report_link, "https://" ) then
                        template_args.activities_report = '[' .. latest_ar.report_link .. ' ' .. 'Pending report]'
                    else
                        template_args.activities_report = '[[' .. latest_ar.report_link .. '|' .. 'Pending report]]'
                    end
                else
                    template_args.activities_report = '-'
                end

                latest_fr = get_affiliate_latest_report( org_info, financial_reports )
                if latest_fr.report_link_en ~= nil then
                    if mw.ustring.find( latest_fr.report_link_en, "https://" ) then
                        template_args.financial_report = '[' .. latest_fr.report_link_en .. ' ' .. 'Pending report (en)]'
                    else
                        template_args.financial_report = '[[' .. latest_fr.report_link_en .. '|' .. 'Pending report (en)]]'
                    end
                elseif latest_fr.report_link ~= nil then
                    if mw.ustring.find( latest_fr.report_link, "https://" ) then
                        template_args.financial_report = '[' .. latest_fr.report_link .. ' ' .. 'Pending report]'
                    else
                        template_args.financial_report = '[[' .. latest_fr.report_link .. '|' .. 'Pending report]]'
                    end
                elseif org_info.legal_entity ~= nil and org_info.legal_entity == 'No' then
                    template_args.financial_report = NOT_REQUIRED
                else
                    template_args.financial_report = '-'
                end

                template_args.fiscal_year = '-'
                template_args.uptodate_reporting = frame:expandTemplate{ title = CROSS }
                template_args.notes_on_reporting = NON_COMPLIANT_NOR_TEXT

                affiliate_record = frame:expandTemplate{
                    title = 'Reports record s1',
                    args = template_args
                }

                reports = reports .. "\n" .. affiliate_record
                break
                -- End of special case
            elseif (
                    org_info.group_name == grant_report.group_name
                            or org_info.group_name == activities_report.group_name
                            or org_info.group_name == financial_report.group_name
            ) then
                latest_ar, latest_fr, latest_gr = get_affiliate_latest_reports(
                        org_info, activities_reports, financial_reports, grant_reports
                )
                reports = reports .. "\n" .. build_arp_template( frame, org_info, latest_ar, latest_fr, latest_gr )
                break
            end
        end
    end

    return reports
end

-- Sandbox Reports code section
function p.render_arp_sandbox_table( frame )
    -- Function to render the SAR (Sandbox Affiliates Reports) table
    -- using the 'Reports record s2' template.
    --
    -- Usage:
    --   frame: The frame object
    --
    -- Return string: wikitext

    reports = ''
    template_args = {}

    for _, org_info in ipairs( org_infos ) do
        -- TODO: Decide whether to hide the reports for derecognized groups as well.
        for sandbox_activities_report,
        sandbox_financial_report,
        -- no-op for grant report
        grant_report in iter( sandbox_activities_reports, sandbox_financial_reports, grant_reports ) do

            if sandbox_activities_report == nil then
                sandbox_activities_report = {}
            end

            if sandbox_financial_report == nil then
                sandbox_financial_report = {}
            end

            if grant_report == nil then
                grant_report = {}
            end

            -- Special Cases: M&E Staff override for new affiliates: "Tick-N"
            -- and "Cross-N"
            if org_info.uptodate_reporting == 'Tick-N' then
                if org_info.affiliate_code ~= nil then
                    template_args.affiliate_code = org_info.affiliate_code
                end
                template_args.affiliate_name = '[[' .. org_info.group_name .. ']]'
                if org_info.org_type ~= nil then
                    if org_info.org_type == 'User Group' then
                        template_args.org_type = 'WUG'
                        template_args.reporting_month = '-'
                    elseif org_info.org_type == 'Chapter' then
                        template_args.org_type = 'Chap'
                        template_args.reporting_month = '-'
                    elseif org_info.org_type == 'Thematic Organization' then
                        template_args.org_type = 'ThOrg'
                        template_args.reporting_month = '-'
                    end
                end

                latest_sb_ar = get_affiliate_latest_report( org_info, sandbox_activities_reports )
                if latest_sb_ar.report_link_en ~= nil then
                    if mw.ustring.find( latest_sb_ar.report_link_en, "https://" ) then
                        template_args.activities_report = '[' .. latest_sb_ar.report_link_en .. ' ' .. 'Pending report (en)]'
                    else
                        template_args.activities_report = '[[' .. latest_sb_ar.report_link_en .. '|' .. 'Pending report (en)]]'
                    end
                elseif latest_sb_ar.report_link ~= nil then
                    if mw.ustring.find( latest_sb_ar.report_link, "https://" ) then
                        template_args.activities_report = '[' .. latest_sb_ar.report_link .. ' ' .. 'Pending report]'
                    else
                        template_args.activities_report = '[[' .. latest_sb_ar.report_link .. '|' .. 'Pending report]]'
                    end
                else
                    template_args.activities_report = '-'
                end

                latest_sb_fr = get_affiliate_latest_report( org_info, sandbox_financial_reports )
                if latest_sb_fr.report_link_en ~= nil then
                    if mw.ustring.find( latest_sb_fr.report_link_en, "https://" ) then
                        template_args.financial_report = '[' .. latest_sb_fr.report_link_en .. ' ' .. 'Pending report (en)]'
                    else
                        template_args.financial_report = '[[' .. latest_sb_fr.report_link_en .. '|' .. 'Pending report (en)]]'
                    end
                elseif latest_sb_fr.report_link ~= nil then
                    if mw.ustring.find( latest_sb_fr.report_link, "https://" ) then
                        template_args.financial_report = '[' .. latest_sb_fr.report_link .. ' ' .. 'Pending report]'
                    else
                        template_args.financial_report = '[[' .. latest_sb_fr.report_link .. '|' .. 'Pending report]]'
                    end
                    template_args.financial_report = '[' .. latest_sb_fr.report_link .. ' ' .. 'Pending report]'
                elseif org_info.legal_entity ~= nil and org_info.legal_entity == 'No' then
                    template_args.financial_report = NOT_REQUIRED
                else
                    template_args.financial_report = '-'
                end

                template_args.fiscal_year = '-'
                template_args.uptodate_reporting = frame:expandTemplate{ title = TICK }
                template_args.notes_on_reporting = NEW_AFFILIATE_NOR_TEXT

                affiliate_record = frame:expandTemplate{
                    title = 'Reports record s1',
                    args = template_args
                }

                reports = reports .. "\n" .. affiliate_record
                break
            elseif org_info.uptodate_reporting == 'Cross-N' then
                if org_info.affiliate_code ~= nil then
                    template_args.affiliate_code = org_info.affiliate_code
                end
                template_args.affiliate_name = '[[' .. org_info.group_name .. ']]'
                if org_info.org_type ~= nil then
                    if org_info.org_type == 'User Group' then
                        template_args.org_type = 'WUG'
                        template_args.reporting_month = '-'
                    elseif org_info.org_type == 'Chapter' then
                        template_args.org_type = 'Chap'
                        template_args.reporting_month = '-'
                    elseif org_info.org_type == 'Thematic Organization' then
                        template_args.org_type = 'ThOrg'
                        template_args.reporting_month = '-'
                    end
                end

                latest_sb_ar = get_affiliate_latest_report( org_info, sandbox_activities_reports )
                if latest_sb_ar.report_link_en ~= nil then
                    if mw.ustring.find( latest_sb_ar.report_link_en, "https://" ) then
                        template_args.activities_report = '[' .. latest_sb_ar.report_link_en .. ' ' .. 'Pending report (en)]'
                    else
                        template_args.activities_report = '[[' .. latest_sb_ar.report_link_en .. '|' .. 'Pending report (en)]]'
                    end
                elseif latest_sb_ar.report_link ~= nil then
                    if mw.ustring.find( latest_sb_ar.report_link, "https://" ) then
                        template_args.activities_report = '[' .. latest_sb_ar.report_link .. ' ' .. 'Pending report]'
                    else
                        template_args.activities_report = '[[' .. latest_sb_ar.report_link .. '|' .. 'Pending report]]'
                    end
                else
                    template_args.activities_report = '-'
                end

                latest_sb_fr = get_affiliate_latest_report( org_info, sandbox_financial_reports )
                if latest_sb_fr.report_link_en ~= nil then
                    if mw.ustring.find( latest_sb_fr.report_link_en, "https://" ) then
                        template_args.financial_report = '[' .. latest_sb_fr.report_link_en .. ' ' .. 'Pending report (en)]'
                    else
                        template_args.financial_report = '[[' .. latest_sb_fr.report_link_en .. '|' .. 'Pending report (en)]]'
                    end
                elseif latest_sb_fr.report_link ~= nil then
                    if mw.ustring.find( latest_sb_fr.report_link, "https://" ) then
                        template_args.financial_report = '[' .. latest_sb_fr.report_link .. ' ' .. 'Pending report]'
                    else
                        template_args.financial_report = '[[' .. latest_sb_fr.report_link .. '|' .. 'Pending report]]'
                    end
                elseif org_info.legal_entity ~= nil and org_info.legal_entity == 'No' then
                    template_args.financial_report = NOT_REQUIRED
                else
                    template_args.financial_report = '-'
                end

                template_args.fiscal_year = '-'
                template_args.uptodate_reporting = frame:expandTemplate{ title = CROSS }
                template_args.notes_on_reporting = NEW_AFFILIATE_NOR_TEXT

                affiliate_record = frame:expandTemplate{
                    title = 'Reports record s1',
                    args = template_args
                }

                reports = reports .. "\n" .. affiliate_record
                break
                -- End of special case
            elseif (
                    org_info.group_name == grant_report.group_name
                            or org_info.group_name == sandbox_activities_report.group_name
                            or org_info.group_name == sandbox_financial_report.group_name
            ) then
                latest_sb_ar, latest_sb_fr, latest_gr = get_affiliate_latest_reports(
                        org_info, sandbox_activities_reports, sandbox_financial_reports, grant_reports
                )
                reports = reports .. "\n" .. build_arp_template( frame, org_info, latest_sb_ar, latest_sb_fr, latest_gr )
                break
            end
        end
    end

    return reports
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
        if org_info.recognition_status == DERECONIZED_STATUS or org_info.recognition_status == DERECONISED_STATUS then
            -- Ignore!
        else
            orgInfoTable = orgInfoTable .. "\n" .. build_org_infos_template( frame, org_info )
        end
    end

    return orgInfoTable
end

function p.render_derecognized_affiliates( frame )
    -- Function for rendering or displaying derecognized affiliates.
    --
    -- Usage:
    --   frame: The frame object
    --
    -- Return string: wikitext

    derecogTable = ''
    aa_report = ''

    for _, org_info in ipairs( org_infos ) do
        if org_info.recognition_status == DERECONIZED_STATUS or org_info.recognition_status == DERECONISED_STATUS then
            derecogTable = derecogTable .. "\n" .. build_derecog_template( frame, org_info )
        end
    end

    return derecogTable
end

function p.render_affiliates_up_to_date()
    -- Function for displaying affiliates up to date reporting
    --
    -- Return string: wikitext

    affiliates_uptodate = ''
    for _, org_info in ipairs( org_infos ) do
        if org_info.uptodate_reporting == 'Tick' and org_info.recognition_status == 'recognised' then
            affiliates_uptodate = affiliates_uptodate .. "* [[" .. org_info.group_name .. "]]\n\n"
        end
    end

    return affiliates_uptodate
end

function p.count_affiliates_uptodate()
    -- Function for count and display affiliates up to date reporting
    --
    -- Return integer: number of affiliates up to date

    affiliates_uptodate = 0
    for _, org_info in ipairs( org_infos ) do
        if org_info.uptodate_reporting == 'Tick' and org_info.recognition_status == 'recognised' then
            affiliates_uptodate = affiliates_uptodate + 1
        end
    end

    return affiliates_uptodate
end

function p.render_affiliates_not_yet_due()
    -- Function for displaying affiliates up to date reporting
    --
    -- Return string: wikitext

    affiliates_not_yet_due = ''
    for _, org_info in ipairs( org_infos ) do
        if org_info.uptodate_reporting == 'Tick-N' and org_info.recognition_status == 'recognised' then
            affiliates_not_yet_due = affiliates_not_yet_due .. "* [[" .. org_info.group_name .. "]]\n\n"
        end
    end

    return affiliates_not_yet_due
end

function p.count_affiliates_not_yet_due()
    -- Function for count and display affiliates not yet due reporting
    --
    -- Return integer: number of affiliates not yet due

    affiliates_not_yet_due = 0
    for _, org_info in ipairs( org_infos ) do
        if org_info.uptodate_reporting == 'Tick-N' and org_info.recognition_status == 'recognised' then
            affiliates_not_yet_due = affiliates_not_yet_due + 1
        end
    end

    return affiliates_not_yet_due
end

function p.count_affiliates_in_good_standing()
    -- Function for counting affiliates in good standing
    --
    -- Return integer: number of affiliates in good standing

    affiliates_in_good_standing = 0
    for _, org_info in ipairs( org_infos ) do
        if ( org_info.uptodate_reporting == 'Tick' or org_info.uptodate_reporting == 'Tick-N' ) and org_info.recognition_status == 'recognised' then
            affiliates_in_good_standing = affiliates_in_good_standing + 1
        end
    end

    return affiliates_in_good_standing
end

function p.count_affiliates_out_of_compliance()
    -- Function for counting affiliates that are out of compliance
    --
    -- Return integer: number of affiliates out of compliance

    affiliates_out_of_compliance = 0
    for _, org_info in ipairs( org_infos ) do
        if ( org_info.uptodate_reporting == 'Cross' or org_info.uptodate_reporting == 'Cross-N' ) and org_info.recognition_status == 'recognised' then
            affiliates_out_of_compliance = affiliates_out_of_compliance + 1
        end
    end

    return affiliates_out_of_compliance
end

function p.count_affiliates_in_derecognition()
    -- Function for counting affiliates in a derecognized state
    --
    -- Return integer: number of affiliates in a derecognized state

    affiliates_in_derecognition = 0
    for _, org_info in ipairs( org_infos ) do
        if org_info.recognition_status == 'derecognised' then
            affiliates_in_derecognition = affiliates_in_derecognition + 1
        end
    end

    return affiliates_in_derecognition
end

function p.render_affiliates_in_suspension()
    -- Function for displaying affiliates that have been suspended
    --
    -- Return string: wikitext

    affiliates_in_suspension = ''
    for _, org_info in ipairs( org_infos ) do
        if org_info.recognition_status == 'suspended' then
            affiliates_in_suspension = affiliates_in_suspension .. "* [[" .. org_info.group_name .. "]]\n\n"
        end
    end

    if affiliates_in_suspension == '' then
        affiliates_in_suspension = "''No affiliates are in suspension at the moment.''"
    end

    return affiliates_in_suspension
end

function p.count_affiliates_in_suspension()
    -- Function for counting affiliates in a suspension state
    --
    -- Return integer: number of affiliates in a suspension state

    affiliates_in_suspension = 0
    for _, org_info in ipairs( org_infos ) do
        if org_info.recognition_status == 'suspended' then
            affiliates_in_suspension = affiliates_in_suspension + 1
        end
    end

    return affiliates_in_suspension
end

function p.render_affiliates_in_initial_review()
    -- Function for displaying affiliates out of compliance in initial review
    --
    -- Return string: wikitext

    affiliates_in_review = ''
    for _, org_info in ipairs( org_infos ) do
        if ( org_info.uptodate_reporting == 'Cross' or
                org_info.uptodate_reporting == 'Cross-N' ) and
                org_info.out_of_compliance_level == '2' and
                org_info.recognition_status == 'recognised'
        then
            affiliates_in_review = affiliates_in_review .. "* [[" .. org_info.group_name .. "]]\n\n"
        end
    end

    if affiliates_in_review == '' then
        affiliates_in_review = "''No affiliates are in review at the moment.''"
    end

    return affiliates_in_review
end

function p.count_affiliates_in_initial_review()
    -- Function for counting affiliates out of compliance in initial review
    --
    -- Return integer: number of affiliates in review

    affiliates_in_review = 0
    for _, org_info in ipairs( org_infos ) do
        if ( org_info.uptodate_reporting == 'Cross' or
                org_info.uptodate_reporting == 'Cross-N' ) and
                org_info.out_of_compliance_level == '2' and
                org_info.recognition_status == 'recognised'
        then
            affiliates_in_review = affiliates_in_review + 1
        end
    end

    return affiliates_in_review
end

function p.render_affiliates_in_first_notice()
    -- Function for displaying affiliates out of compliance in first notice
    --
    -- Return string: wikitext

    affiliates_in_first_notice = ''
    for _, org_info in ipairs( org_infos ) do
        if ( org_info.uptodate_reporting == 'Cross' or
                org_info.uptodate_reporting == 'Cross-N' ) and
                org_info.out_of_compliance_level == '3' and
                org_info.recognition_status == 'recognised'
        then
            affiliates_in_first_notice = affiliates_in_first_notice .. "* [[" .. org_info.group_name .. "]]\n\n"
        end
    end

    if affiliates_in_first_notice == '' then
        affiliates_in_first_notice = "''No affiliates are in first notice at the moment.''"
    end

    return affiliates_in_first_notice
end

function p.count_affiliates_in_first_notice()
    -- Function for counting affiliates out of compliance in first notice
    --
    -- Return integer: number of affiliates in first notice of OOC

    affiliates_in_first_notice = 0
    for _, org_info in ipairs( org_infos ) do
        if ( org_info.uptodate_reporting == 'Cross' or
                org_info.uptodate_reporting == 'Cross-N' ) and
                org_info.out_of_compliance_level == '3' and
                org_info.recognition_status == 'recognised'
        then
            affiliates_in_first_notice = affiliates_in_first_notice + 1
        end
    end

    return affiliates_in_first_notice
end

function p.render_affiliates_in_second_notice()
    -- Function for displaying affiliates out of compliance in second notice
    --
    -- Return string: wikitext

    affiliates_in_second_notice = ''
    for _, org_info in ipairs( org_infos ) do
        if ( org_info.uptodate_reporting == 'Cross' or
                org_info.uptodate_reporting == 'Cross-N' ) and
                org_info.out_of_compliance_level == '4' and
                org_info.recognition_status == 'recognised'
        then
            affiliates_in_second_notice = affiliates_in_second_notice .. "* [[" .. org_info.group_name .. "]]\n\n"
        end
    end

    if affiliates_in_second_notice == '' then
        affiliates_in_second_notice = "''No affiliates are in second notice at the moment.''"
    end

    return affiliates_in_second_notice
end

function p.count_affiliates_in_second_notice()
    -- Function for counting affiliates out of compliance in second notice
    --
    -- Return integer: number of affiliates in second notice of OOC

    affiliates_in_second_notice = 0
    for _, org_info in ipairs( org_infos ) do
        if ( org_info.uptodate_reporting == 'Cross' or
                org_info.uptodate_reporting == 'Cross-N' ) and
                org_info.out_of_compliance_level == '4' and
                org_info.recognition_status == 'recognised'
        then
            affiliates_in_second_notice = affiliates_in_second_notice + 1
        end
    end

    return affiliates_in_second_notice
end

function p.render_affiliates_in_third_notice()
    -- Function for displaying affiliates out of compliance in third notice
    --
    -- Return string: wikitext

    local affiliates_in_third_notice = ''
    for _, org_info in ipairs( org_infos ) do
        if ( org_info.uptodate_reporting == 'Cross' or
                org_info.uptodate_reporting == 'Cross-N' ) and
                org_info.out_of_compliance_level == '5' and
                org_info.recognition_status == 'recognised'
        then
            affiliates_in_third_notice = affiliates_in_third_notice .. "* [[" .. org_info.group_name .. "]]\n\n"
        end
    end

    if affiliates_in_third_notice == '' then
        affiliates_in_third_notice = "''No affiliates are in third notice at the moment.''"
    end

    return affiliates_in_third_notice
end

function p.count_affiliates_in_third_notice()
    -- Function for counting affiliates out of compliance in third notice
    --
    -- Return integer: number of affiliates in third notice of OOC

    local affiliates_in_third_notice_count = 0
    for _, org_info in ipairs( org_infos ) do
        if ( org_info.uptodate_reporting == 'Cross' or
                org_info.uptodate_reporting == 'Cross-N' ) and
                org_info.out_of_compliance_level == '5' and
                org_info.recognition_status == 'recognised'
        then
            affiliates_in_third_notice_count = affiliates_in_third_notice_count + 1
        end
    end

    return affiliates_in_third_notice_count
end

function p.render_affiliates_in_final_notice()
    -- Function for displaying affiliates out of compliance in final notice
    --
    -- Return string: wikitext

    local affiliates_in_final_notice = ''
    for _, org_info in ipairs( org_infos ) do
        if ( org_info.uptodate_reporting == 'Cross' or
                org_info.uptodate_reporting == 'Cross-N' ) and
                org_info.out_of_compliance_level == '6' and
                org_info.recognition_status == 'recognised'
        then
            affiliates_in_final_notice = affiliates_in_final_notice .. "* [[" .. org_info.group_name .. "]]\n\n"
        end
    end

    if affiliates_in_final_notice == '' then
        affiliates_in_final_notice = "''No affiliates are in final notice at the moment.''"
    end

    return affiliates_in_final_notice
end

function p.count_affiliates_in_final_notice()
    -- Function for counting affiliates out of compliance in final notice
    --
    -- Return integer: number of affiliates in final notice of OOC

    local affiliates_in_final_notice_count = 0
    for _, org_info in ipairs( org_infos ) do
        if ( org_info.uptodate_reporting == 'Cross' or
                org_info.uptodate_reporting == 'Cross-N' ) and
                org_info.out_of_compliance_level == '6' and
                org_info.recognition_status == 'recognised'
        then
            affiliates_in_final_notice_count = affiliates_in_final_notice_count + 1
        end
    end

    return affiliates_in_final_notice_count
end

return p
