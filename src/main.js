// 单文件入口：选择剧本 → 角色分配 → 初始化状态 → 启动 ReActAgent 循环
// - 剧本选择与加载：selectAndLoadScript({ debug })
// - 角色分配入口唯一：RoleAllocAgent.allocate
// - 所有输出统一使用 record
require('dotenv').config()
const { AgentState, renderStateTable } = require('./modules/game/state')
const { Interaction } = require('./modules/game/interaction')
const { ReActAgent } = require('./modules/agent/agent')
const { createStorytellerLlm } = require('./modules/agent/storytellerLlm')
const { selectAndLoadScript } = require('./modules/game/scriptLoader')
const { RoleAllocAgent } = require('./modules/agent/roleAllocAgent')
const { prompt } = require('./modules/utils/console')
const { record } = require('./modules/common/record')

async function run() {
  const debug = process.env.DEBUG === '1'
  let playerCount = 8
  const scriptData = await selectAndLoadScript({ debug })
  if (!scriptData) return
  const customRules = await prompt('请输入分配风格或自定义规则(回车跳过): ')
  const allocator = new RoleAllocAgent()
  let allocation = null
  try {
    allocation = await allocator.allocate({ playerCount, script: scriptData, customRules })
  } catch (e) {
    record('error', `角色分配失败: ${String(e && e.message || e)}`)
    return
  }
  const state = new AgentState({ players: (allocation && allocation.players) || [] })
  const interaction = new Interaction()
  const llm = createStorytellerLlm()
  const agent = new ReActAgent({ llm, state, interaction, script: scriptData })
  // 打印当前状态表
  record('state', renderStateTable(state))
  record('info', '开始循环，单一prompt驱动')
  await agent.loop(20)
}

if (require.main === module) {
  run().catch(err => {
    record('error', `运行失败: ${err && err.message}`)
  })
}

module.exports = { run }
