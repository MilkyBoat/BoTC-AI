require('dotenv').config()
const path = require('path')
const { prompt } = require('./modules/utils/console')
const { createCliAdapter } = require('./modules/game/cliAdapter')
const { State } = require('./modules/game/state')
const { listScripts, loadScript } = require('./modules/game/scriptLoader')
const { determineRoleCounts } = require('./modules/game/rules')
const { createStoryteller } = require('./modules/game/storyteller')
const { GameEngine } = require('./modules/game/engine')
const { createLlmAgent } = require('./modules/agent/llmAgent')

async function main() {
  const debug = process.env.DEBUG === '1'
  let script
  let playerCount
  if (debug) {
    const pathDebug = path.resolve(process.cwd(), 'game_script/#暗流涌动.json')
    process.stdout.write(`[Debug] 使用固定剧本: ${pathDebug}\n`)
    script = await loadScript(pathDebug)
    playerCount = 8
    process.stdout.write('[Debug] 玩家数量: 8\n')
  } else {
    const scripts = await listScripts()
    if (scripts.length === 0) {
      process.stdout.write('未在 ./game_script 发现剧本，请提供标准格式的示例json后重试\n')
      process.exit(1)
    }
    process.stdout.write('可用剧本:\n')
    scripts.forEach((f, i) => process.stdout.write(`${i + 1}. ${f}\n`))
    const idxInput = await prompt('请选择剧本编号: ')
    const idx = parseInt(idxInput, 10)
    if (!idx || idx < 1 || idx > scripts.length) {
      process.stdout.write('选择无效\n')
      process.exit(1)
    }
    const scriptFile = scripts[idx - 1]
    script = await loadScript(scriptFile)
    const playerCountInput = await prompt('请输入玩家数量: ')
    playerCount = parseInt(playerCountInput, 10)
    if (!playerCount || playerCount < 3) {
      process.stdout.write('玩家数量无效\n')
      process.exit(1)
    }
  }
  const customRules = await prompt('请输入分配风格或自定义规则(回车跳过): ')
  let allocation
  try {
    allocation = await determineRoleCounts(playerCount, script, customRules)
  } catch (e) {
    process.stdout.write('需要标准规则的角色配比与剧本格式，请提供后继续\n')
    process.stdout.write(`[Error] ${String(e && e.message || e)}\n`)
    process.exit(1)
  }
  const state = new State()
  state.initPlayers(playerCount)
  if (allocation && allocation.players) {
    state.loadTokenMap(allocation.players)
  }
  process.stdout.write('开局分配完成，当前角色与状态：\n')
  const rows = state.players.map(p => {
    const tokens = state.getTokens(p.seat).join(', ')
    return `${p.seat}\t${p.knownRole || ''}\t${p.realRole || ''}\t${tokens}`
  })
  process.stdout.write(['座位\t可见身份\t真实身份\tTokens', ...rows].join('\n') + '\n')
  const ok = await prompt('请输入 go 继续: ')
  if ((ok || '').trim().toLowerCase() !== 'go') { process.stdout.write('未确认，退出\n'); process.exit(1) }
  process.stdout.write('进入对话。\n')

  const io = createCliAdapter()
  const storyteller = createStoryteller({ interaction: io, state, script })
  const llm = createLlmAgent({})
  const engine = new GameEngine({ scriptData: script, storyteller, llmAgent: llm, state })
  // 交互由说书人在需要时触发命令行读取
  process.stdout.write('首夜行动顺序已加载，待完成角色分配后开始。\n')
  await engine.loop()
}

main()