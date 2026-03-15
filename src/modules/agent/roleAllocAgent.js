const { SystemMessage, HumanMessage } = require('@langchain/core/messages')
const { ROLE_RATIO, DEBUG_PANEL } = require('../common/const')
const { ChatArk } = require('./ark')
const { shuffleTokenMap } = require('../utils/roleUtils')
const { record } = require('../common/record')

// 角色分配 Agent：根据玩家人数与剧本，调用 LLM 生成开局角色与初始 token 图
// 实现参考 llmAgent.js 中的 decideAllocation，但以类形式封装，便于复用与测试
class RoleAllocAgent {
  constructor({ chat } = {}) {
    // 可注入自定义聊天实现；默认延迟到调用时创建 ChatArk，避免 DEBUG 分支也要求凭证
    this.chat = chat || null
  }

  buildCandidates(script) {
    const entries = Array.isArray(script) ? script : []
    const roles = entries.filter(x => x && x.id && x.team && x.id !== '_meta' && x.team !== 'traveler')
    const byTeam = { townsfolk: [], outsider: [], minion: [], demon: [] }
    for (const r of roles) { if (byTeam[r.team]) byTeam[r.team].push({ name: r.name, team: r.team, ability: r.ability }) }
    const meta = entries.find(x => x && x.id === '_meta') || {}
    return { candidates: byTeam, meta }
  }

  buildMessages({ playerCount, script, customRules }) {
    const { candidates, meta } = this.buildCandidates(script)
    const base = ROLE_RATIO[playerCount] || {}
    const sys = `角色: 血染钟楼AI说书人
任务: 根据玩家人数与剧本乱序随机分配角色, 并生成全局 token 图
输出: 仅返回 JSON 对象，格式：
{ "players": [ { "seat": number, "knownRole": string, "realRole"?: string, "tokens": string[] } ] }

硬约束:
- 所有角色唯一分配（同名角色不可重复）
- 阵营数量必须满足基础比例（镇民/外来者/爪牙/恶魔）
- 仅可从候选角色列表中选择分配
- 座位号从 1 到玩家总数连续分配

初始比例特殊调整规则:
- 如果你决定的初始角色中，技能描述的末尾包含以”[]“包围的描述，那么你在按照初始比例分配角色之后，还需要按照其 [] 内的要求继续进行调整，对应的差额数量从镇民中扣除

一致性规则:
- 若技能描述包含“你以为自己是 xxx”（认知覆盖类角色），则 knownRole 与 realRole 不一致，knownRole 要按照角色能力描述分配；否则 knownRole = realRole

提示:
- 初始 tokens 请根据 setup 与开局信息最小化生成（如 "是酒鬼"、首夜信息等）`
    const userPayload = { playerCount, baseRatio: base, scriptName: meta && meta.name || '', candidates, require: { format: { players: [{ seat: 1, knownRole: '', realRole: '', tokens: [] }] } } }
    const user = JSON.stringify(userPayload)
    const msgs = [new SystemMessage(sys), new HumanMessage(user)]
    if (customRules) msgs.push(new HumanMessage(customRules))
    return msgs
  }

  async allocate({ playerCount, script, customRules } = {}) {
    if (process.env.DEBUG === '1') {
      record('info', '角色分配：使用固定角色分配')
      return DEBUG_PANEL
    }
    const msgs = this.buildMessages({ playerCount, script, customRules })
    record('info', '角色分配：LLM思考中...')
    const chat = this.chat || new ChatArk({})
    const r = await chat.invoke(msgs)
    const txt = typeof r.content === 'string' ? r.content : JSON.stringify(r.content)
    record('info', '角色分配：LLM思考完成。')
    try { const obj = JSON.parse(txt); return shuffleTokenMap(obj) } catch { return null }
  }
}

module.exports = { RoleAllocAgent }