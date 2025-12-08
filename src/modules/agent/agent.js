const { record } = require('../common/record')
const { applyTools } = require('./tools')
const { renderStateTable } = require('../game/state')

// 单一 Prompt 的 Agent：
// - 初始化一次 system/user 提示
// - 循环：LLM→tools→applyTools→追加 messages（当前 role=user）
// - ask 在工具层同步读取输入并返回消息；状态变更会返回快照消息；直到 game_over 结束
// 理想情况下，这个agent可以当作一个通用的ReActAgent，只是目前只有说书人用到了
// 后期可以简单重构一下，不依赖script，只要传入一个llm，以及传入一个初始的messages就行
class ReActAgent {
  constructor({ llm, state, interaction, script }) {
    this.llm = llm
    this.state = state
    this.interaction = interaction
    this.script = script
    this.messages = this.llm.buildInitialMessages({
      stateText: renderStateTable(this.state),
      time: '开始',
      script: this.script
    })
    this.ended = false
  }
  async loop(maxSteps = 20) {
    let steps = 0
    while (!this.ended && steps < maxSteps) {
      // 调用 LLM，打印工具调用摘要
      const tools = await this.llm.deriveTools(this.messages)
      record('tool', '工具调用:')
      for (const tool of tools) {
        record('tool', `- ${tool.type} ${JSON.stringify(tool.payload || {})}`)
      }
      // 先将本轮 tools 摘要追加为 assistant 内容，供下一轮 LLM 参考
      {
        const m = { role: 'assistant', content: JSON.stringify({ tools }) }
        this.messages.push(m)
        record('llm', `role: ${m.role}, content: ${m.content}`)
      }
      // 应用工具，并追加工具层返回的 messages（玩家回应/状态快照等）
      const r = await applyTools({ state: this.state, interaction: this.interaction, tools })
      if (r.messages && r.messages.length) {
        for (const m of r.messages) {
          this.messages.push(m)
          record('llm', `追加LLM消息: role: ${m.role}, content: ${m.content}`)
        }
      }
      if (r.ended) { this.ended = true; break }
      steps++
    }
  }
}

module.exports = { ReActAgent }
