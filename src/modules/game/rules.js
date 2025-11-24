const { allocateRoles } = require('./roleManager')
const { ROLE_RATIO } = require('../common/const')

async function determineRoleCounts(playerCount, script, customRules) {
  const res = await allocateRoles({ playerCount, scriptData: script, customRules })
  return res || null
}

module.exports = { determineRoleCounts }