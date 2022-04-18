--[[
Require all necessary modules for testing the backend.
Author: Derick Alangi (WMF)
]]

local ScribuntoUnit = require('Module:ScribuntoUnit')
local suite = ScribuntoUnit:new()

-- ------------------------------------------------------------ --

--[[ Pass the method name to invoke and call it. ]]
function suite:invoke(method)
    return "{{#invoke:WADP_Backend|" .. method .. "}}"
end

function suite:processFrame(method)
    local frame = self.frame
    local result = frame:preprocess(suite:invoke(method))

    return result
end

-- ------------------------------------------------------------ --

--[[ A simple test to see that this works. ]]
function suite:testSum()
    self:assertEquals(2, 1 + 1, "Expected value didn't match actual.")
end

--[[ Test `render_affiliates_in_final_notice()` ]]
function suite:testRenderAffiliatesInFinalNotice()
    local results = suite:processFrame('render_affiliates_in_final_notice')

    -- Return value should be a string
    self:assertEquals('string', type(results))
    -- If the string has affiliates, the length should
    -- should be greater than zero and contain some specific
    -- strings that we can use to assert.
    if #results > 0 then
        self:assertStringContains('User Group', results)
        self:assertStringContains('Wikimedia', results)
    else
        self:assertEquals(
                'No affiliates are in final notice at the moment.',
                results
        )
    end
end

--[[ Test `count_affiliates_in_final_notice()` ]]
function suite:testCountAffiliatesInFinalNotice()
    local results = suite:processFrame('count_affiliates_in_final_notice')

    self:assertTrue(
            tonumber(results) >= 0,
            "Number of affiliates in final notice is not a valid count."
    )
end

return suite