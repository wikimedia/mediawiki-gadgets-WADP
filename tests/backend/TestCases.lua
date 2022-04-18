--[[Require all necessary modules for testing the backend.]]
-- Author: Derick Alangi (WMF)

local sutModule = require('Module:WADP_Backend')
local ScribuntoUnit = require('Module:ScribuntoUnit')
local suite = ScribuntoUnit:new()

function suite:testSum()
    self:assertEquals(2, 1 + 1, "Expected value didn't match actual.")
end

return suite