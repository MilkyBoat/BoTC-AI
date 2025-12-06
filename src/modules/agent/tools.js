const { record } = require('../common/record')

// 工具执行器说明：
// - 输入: { state, interaction, tools }，其中 tools 为 { type, payload } 的列表
// - 输出: { ended, results, userResponses, messages }
// - 设计: 使用 handlers 映射按工具类型分发，降低条件分支耦合，便于扩展与测试

// 工具执行器：将 LLM 产出的 tools 应用到状态与交互
// 交互型工具（ask）在此处直接阻塞读取输入，无需 paused 概念
// 返回：{ ended, results, userResponses }
async function applyTools({ state, interaction, tools }) {
  let ended = false
  const results = []
  const userResponses = []
  const messages = []
  // 状态快照辅助：在状态变更后记录当前状态表
  function snapshot() {
    const { renderStateTable } = require('../game/state')
    record('state', renderStateTable(state))
    messages.push({ role: 'user', content: `event: state_snapshot, text: ${renderStateTable(state)}` })
  }
  // 工具接口约定：每个处理器接收 payload，内部通过闭包写入 results/userResponses/messages
  const handlers = {
    // 询问：seat=0 表示无特定座位，任意玩家回应
    ask: async pl => {
      const seat = Number(pl.seat || 0)
      const msg = String(pl.message || '')
      if (seat > 0) {
        const r = await interaction.questionForSeat(seat, msg)
        record('response', `座位${r.seat} -> ${r.text}`)
        userResponses.push(r)
        messages.push({ role: 'user', content: `event: player_response, seat: ${r.seat}, text: ${r.text}` })
      } else {
        while (true) {
          const r = await interaction.questionAny(msg)
          // TODO: 这里限制了用户主动说话时，必须有个真实的发起用户（即形如 1 xxx）。
          // 但实际上投票时，没有真正的信息输入人
          // 所以理论上，可以用seat=0来表示对说书人输入的公共信息
          if (r.seat && r.seat > 0 && String(r.text || '').trim().length > 0) {
            record('response', `座位${r.seat} -> ${r.text}`)
            userResponses.push(r)
            messages.push({ role: 'user', content: `event: player_response, seat: ${r.seat}, text: ${r.text}` })
            break
          }
          record('info', '提示: 请输入 "座位号 内容"')
        }
      }
      results.push({ type: 'ask', seat, message: msg })
    },
    // 私密告知：向指定座位发送信息
    tell: async pl => {
      const seat = Number(pl.seat || 0)
      const msg = String(pl.message || '')
      interaction.send(seat, msg)
      results.push({ type: 'tell', seat, message: msg })
      messages.push({ role: 'user', content: `event: tell, text: ${msg}` })
    },
    // 广播：向全体玩家发送信息
    broadcast: async pl => {
      const msg = String(pl.message || pl.value || '')
      interaction.broadcast(msg)
      results.push({ type: 'broadcast', message: msg })
      messages.push({ role: 'user', content: `event: broadcast, text: ${msg}` })
    },
    // 添加标记：为座位添加 token，并记录快照
    add_token: async pl => {
      const seat = Number(pl.seat || 0)
      const token = String(pl.token || '')
      state.addToken(seat, token)
      results.push({ type: 'add_token', seat, token })
      snapshot()
    },
    // 移除标记：清除座位 token，并记录快照
    remove_token: async pl => {
      const seat = Number(pl.seat || 0)
      const token = String(pl.token || '')
      state.removeToken(seat, token)
      results.push({ type: 'remove_token', seat, token })
      snapshot()
    },
    // 替换标记：将该座位的所有 token 替换为给定列表，并记录快照
    replace_token: async pl => {
      const seat = Number(pl.seat || 0)
      const tokens = Array.isArray(pl.tokens) ? pl.tokens.map(t => String(t)) : []
      state.replaceTokens(seat, tokens)
      results.push({ type: 'replace_token', seat, tokens })
      snapshot()
    },
    // 生死标记：根据 status 进行死亡或生还广播
    mark_death: async pl => {
      const seat = Number(pl.seat || 0)
      const st = String(pl.status || '').toLowerCase()
      if (st === 'death') { state.kill(seat) }
      interaction.broadcast(`公告: 座位${seat} ${st === 'death' ? '死亡' : '生还'}`)
      results.push({ type: 'mark_death', seat, status: st })
    },
    // 修改角色：更新 known/real 认知
    set_character: async pl => {
      const seat = Number(pl.seat || 0)
      if (pl.new_real) { state.setRealRole(seat, pl.new_real) }
      if (pl.new_known) { state.setKnownRole(seat, pl.new_known) }
      results.push({ type: 'set_character', seat, new_known: pl.new_known || '', new_real: pl.new_real || '' })
    },
    // 游戏结束：广播胜利方与原因，设置 ended
    game_over: async pl => {
      ended = true
      const msg = pl && pl.reason ? `游戏结束: ${pl.reason}` : '游戏结束'
      interaction.broadcast(msg)
      results.push({ type: 'game_over', winner: pl && pl.winner, reason: pl && pl.reason })
    },
    // 结束当前角色/阶段
    end_role: async pl => {
      results.push({ type: 'end_role' })
    }
  }
  // 主循环：分发执行工具，忽略未定义类型
  for (const tool of (Array.isArray(tools) ? tools : [])) {
    const t = tool.type
    const pl = tool.payload || {}
    const h = handlers[t]
    if (typeof h === 'function') { await h(pl) }
  }
  return { ended, results, userResponses, messages }
}

module.exports = { applyTools }
