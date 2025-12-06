const { record } = require('../common/collector')
const { applyOps } = require('./tools')
const { renderStateTable } = require('../game/state')

// 单一 Prompt 的 Agent：
// - 初始化一次 system/user 提示
// - 循环：LLM→ops→applyOps→追加 messages（当前 role=assistant）
// - ask 在工具层同步读取输入并返回消息；状态变更会返回快照消息；直到 game_over 结束
class NewSingleAgent {
  constructor({ llm, state, interaction, script }) {
    this.llm = llm
    this.state = state
    this.interaction = interaction
    this.script = script
    this.messages = this.llm.buildInitialMessages({ stateText: renderStateTable(this.state), time: '开始', script: this.script })
    this.ended = false
  }
  async loop(maxSteps = 50) {
    let steps = 0
    while (!this.ended && steps < maxSteps) {
      // 调用 LLM，打印工具调用摘要
      const ops = await this.llm.invokeOps(this.messages)
      const normOps = Array.isArray(ops) ? ops.map(o => {
        if (typeof o === 'string') return { type: o, payload: {} }
        if (o && typeof o === 'object') {
          if (o.type) return { type: String(o.type), payload: o.payload || {} }
          const keys = Object.keys(o)
          if (keys.length === 1) {
            const k = keys[0]
            const v = o[k]
            return { type: String(k), payload: (v && typeof v === 'object') ? v : {} }
          }
        }
        return null
      }).filter(Boolean) : []
      record('info', '工具调用:')
      for (const op of normOps) record('info', `- ${op.type} ${JSON.stringify(op.payload || {})}`)
      // 先将本轮 ops 摘要追加为 assistant 内容，供下一轮 LLM 参考
      this.messages.push({ role: 'assistant', content: JSON.stringify({ ops: normOps }) })
      // 应用工具，并追加工具层返回的 messages（玩家回应/状态快照等）
      const r = await applyOps({ state: this.state, interaction: this.interaction, ops: normOps })
      if (r.messages && r.messages.length) {
        for (const m of r.messages) this.messages.push(m)
      }
      if (r.ended) { this.ended = true; break }
      steps++
    }
  }
}

module.exports = { NewSingleAgent }
