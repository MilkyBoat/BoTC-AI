const { record } = require('../common/collector')

// 工具执行器：将 LLM 产出的 ops 应用到状态与交互
// 交互型工具（ask）在此处直接阻塞读取输入，无需 paused 概念
// 返回：{ ended, results, userResponses }
async function applyOps({ state, interaction, ops }) {
  let ended = false
  const results = []
  const userResponses = []
  const messages = []
  for (const op of (Array.isArray(ops) ? ops : [])) {
    const t = op.type
    const pl = op.payload || {}
    if (t === 'ask') {
      const seat = Number(pl.seat || 0)
      const msg = String(pl.message || '')
      if (seat > 0) {
        const r = await interaction.questionForSeat(seat, msg)
        record('response', `座位${r.seat} -> ${r.text}`)
        userResponses.push(r)
        messages.push({ role: 'user', content: JSON.stringify({ event: 'player_response', seat: r.seat, text: r.text }) })
      } else {
        while (true) {
          const r = await interaction.questionAny(msg)
          if (r.seat && r.seat > 0 && String(r.text || '').trim().length > 0) {
            record('response', `座位${r.seat} -> ${r.text}`)
            userResponses.push(r)
            messages.push({ role: 'user', content: JSON.stringify({ event: 'player_response', seat: r.seat, text: r.text }) })
            break
          }
          record('info', '提示: 请输入 "座位号 内容"')
        }
      }
      results.push({ type: 'ask', seat, message: msg })
      continue
    }
    if (t === 'tell') {
      const seat = Number(pl.seat || 0)
      const msg = String(pl.message || '')
      interaction.send(seat, msg)
      results.push({ type: 'tell', seat, message: msg })
      continue
    }
    if (t === 'broadcast') {
      const msg = String(pl.message || pl.value || '')
      interaction.broadcast(msg)
      results.push({ type: 'broadcast', message: msg })
      continue
    }
    if (t === 'add_token') {
      const seat = Number(pl.seat || 0)
      const token = String(pl.token || '')
      state.addToken(seat, token)
      results.push({ type: 'add_token', seat, token })
      const { renderStateTable } = require('../game/state')
      messages.push({ role: 'assistant', content: JSON.stringify({ event: 'state_snapshot', text: renderStateTable(state) }) })
      continue
    }
    if (t === 'remove_token') {
      const seat = Number(pl.seat || 0)
      const token = String(pl.token || '')
      state.removeToken(seat, token)
      results.push({ type: 'remove_token', seat, token })
      const { renderStateTable } = require('../game/state')
      messages.push({ role: 'assistant', content: JSON.stringify({ event: 'state_snapshot', text: renderStateTable(state) }) })
      continue
    }
    if (t === 'mark_death') {
      const seat = Number(pl.seat || 0)
      const st = String(pl.status || '').toLowerCase()
      if (st === 'death') state.kill(seat)
      interaction.broadcast(`公告: 座位${seat} ${st === 'death' ? '死亡' : '生还'}`)
      results.push({ type: 'mark_death', seat, status: st })
      continue
    }
    if (t === 'set_character') {
      const seat = Number(pl.seat || 0)
      if (pl.new_real) state.setRealRole(seat, pl.new_real)
      if (pl.new_known) state.setKnownRole(seat, pl.new_known)
      results.push({ type: 'set_character', seat, new_known: pl.new_known || '', new_real: pl.new_real || '' })
      continue
    }
    if (t === 'game_over') {
      ended = true
      const msg = pl && pl.reason ? `游戏结束: ${pl.reason}` : '游戏结束'
      interaction.broadcast(msg)
      results.push({ type: 'game_over', winner: pl && pl.winner, reason: pl && pl.reason })
      continue
    }
    if (t === 'end_role') {
      results.push({ type: 'end_role' })
      continue
    }
  }
  return { ended, results, userResponses, messages }
}

module.exports = { applyOps }
