--[[Require all necessary modules for testing the backend.]]
-- Author: Derick Alangi (WMF)

local ScribuntoUnit = require('Module:ScribuntoUnit')
local suite = ScribuntoUnit:new()

-- Pass the method name to invoke and call it.
function suite:invoke(method)
    return "{{#invoke:WADP_Backend|" .. method .. "}}"
end

-- A simple test to see that this works.
function suite:testSum()
    self:assertEquals(2, 1 + 1, "Expected value didn't match actual.")
end

-- Test `count_affiliates_in_final_notice()`
function suite:testCountAffiliatesInFinalNotice()
    local frame = self.frame
    local result = frame:preprocess(
            suite:invoke('count_affiliates_in_final_notice')
    )

    self:assertTrue(
            tonumber(result) >= 0,
            "Number of affiliates in final notice is not a valid count."
    )
end

return suite