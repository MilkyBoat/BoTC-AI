// new_single_agent 的入口：
// - 初始化玩家与状态
// - 构建单一 prompt 的 Agent
// - 循环执行直到 game_over
require('dotenv').config()
const path = require('path')
const { NewSingleAgentState, renderStateTable } = require('./modules/game/state')
const { Interaction } = require('./modules/game/interaction')
const { NewReActAgent } = require('./modules/agent/agent')
const { createStoryTellerAgent } = require('./modules/agent/storyteller')
const { listScripts, loadScript } = require('./modules/game/scriptLoader')
const { record } = require('./modules/common/record')

async function run() {
  // Debug 演示：固定 8 人配置（与旧版一致）
  const players = [
    { seat: 1, knownRole: '红唇女郎', realRole: '红唇女郎', tokens: [] },
    { seat: 2, knownRole: '洗衣妇', realRole: '洗衣妇', tokens: [] },
    { seat: 3, knownRole: '僧侣', realRole: '僧侣', tokens: [] },
    { seat: 4, knownRole: '小恶魔', realRole: '小恶魔', tokens: [] },
    { seat: 5, knownRole: '镇长', realRole: '镇长', tokens: [] },
    { seat: 6, knownRole: '厨师', realRole: '厨师', tokens: [] },
    { seat: 7, knownRole: '士兵', realRole: '士兵', tokens: [] },
    { seat: 8, knownRole: '图书管理员', realRole: '酒鬼', tokens: ['是酒鬼'] },
  ]
  const state = new NewSingleAgentState({ players })
  const interaction = new Interaction()
  let scriptData = null
  try {
    const debug = process.env.DEBUG === '1'
    if (debug) {
      const p = path.resolve(process.cwd(), 'game_script/#暗流涌动.json')
      scriptData = await loadScript(p)
    } else {
      const scripts = await listScripts()
      if (scripts && scripts.length) scriptData = await loadScript(scripts[0])
    }
  } catch {}
  const llm = createStoryTellerAgent()
  const agent = new NewReActAgent({ llm, state, interaction, script: scriptData })
  // 打印当前状态表
  record('state', renderStateTable(state))
  record('info', '开始循环，单一prompt驱动')
  await agent.loop(100)
}

if (require.main === module) {
  run().catch(err => {
    record('error', `运行失败: ${err && err.message}`)
  })
}

module.exports = { run }
