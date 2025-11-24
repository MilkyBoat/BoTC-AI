const { createLlmAgent } = require('../agent/llmAgent')

async function allocateRoles({ playerCount, scriptData, customRules }) {
  const llm = createLlmAgent({})
  const res = await llm.decideAllocation({ playerCount, script: scriptData, customRules })
  return res
}

function shuffleTokenMap(obj) {
  if (!obj || !Array.isArray(obj.players) || obj.players.length === 0) return obj
  const arr = obj.players.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t
  }
  obj.players = arr.map((p, idx) => ({
    seat: idx + 1,
    knownRole: p.knownRole,
    realRole: p.realRole,
    tokens: Array.isArray(p.tokens) ? p.tokens.slice() : []
  }))
  return obj
}

module.exports = { allocateRoles, shuffleTokenMap }