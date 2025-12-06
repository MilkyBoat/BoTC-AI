// 最小状态管理：
// - players: 座位、角色认知、真实角色、生死与 tokens
// - tokenMap: 每座位的标记列表
class NewSingleAgentState {
  constructor({ players }) {
    this.players = Array.isArray(players) ? players.map(p => ({ ...p, alive: true, executed: false, tokens: Array.isArray(p.tokens) ? p.tokens.slice() : [] })) : []
    this.tokenMap = new Map()
    for (const p of this.players) this.tokenMap.set(p.seat, new Set((p.tokens || []).map(t => String(t))))
  }
  // 查找玩家
  getPlayer(seat) {
    return this.players.find(p => p.seat === seat)
  }
  // 获取某座位的 tokens
  getTokens(seat) {
    const s = this.tokenMap.get(seat)
    return s ? Array.from(s) : []
  }
  // 添加标记
  addToken(seat, token) {
    const s = this.tokenMap.get(seat) || new Set()
    s.add(String(token))
    this.tokenMap.set(seat, s)
    const p = this.getPlayer(seat)
    if (p) p.tokens = this.getTokens(seat)
  }
  // 移除标记
  removeToken(seat, token) {
    const s = this.tokenMap.get(seat)
    if (s) s.delete(String(token))
    const p = this.getPlayer(seat)
    if (p) p.tokens = this.getTokens(seat)
  }
  // 标记死亡
  kill(seat) {
    const p = this.getPlayer(seat)
    if (p) {
      p.alive = false
      p.death = p.death || {}
      p.death.phase = 'night'
    }
  }
  markExecuted(seat) {
    const p = this.getPlayer(seat)
    if (p) {
      p.executed = true
      p.alive = false
      p.death = p.death || {}
      p.death.phase = 'day'
    }
  }
  isAlive(seat) {
    const p = this.getPlayer(seat)
    return !!(p && p.alive)
  }
  aliveCount() {
    return this.players.filter(p => p.alive).length
  }
  loadTokenMap(players) {
    for (const item of (Array.isArray(players) ? players : [])) {
      const seat = item.seat
      const p = this.getPlayer(seat)
      if (!p) continue
      p.knownRole = item.knownRole || p.knownRole || null
      p.realRole = item.realRole || p.realRole || null
      const s = this.tokenMap.get(seat) || new Set()
      const list = Array.isArray(item.tokens) ? item.tokens : []
      for (const t of list) s.add(String(t))
      this.tokenMap.set(seat, s)
      p.tokens = this.getTokens(seat)
    }
  }
  seatsByRole(roleName) {
    const name = String(roleName)
    const seats = []
    for (const p of this.players) {
      if (!p.alive) continue
      if (p.realRole === name || p.knownRole === name) seats.push(p.seat)
    }
    return seats
  }
  // 设置真实/已知角色（认知覆盖）
  setRealRole(seat, role) {
    const p = this.getPlayer(seat)
    if (p) p.realRole = role
  }
  setKnownRole(seat, role) {
    const p = this.getPlayer(seat)
    if (p) p.knownRole = role
  }
  // 导出简版快照（给 LLM）
  snapshot() {
    return { players: this.players.map(p => ({ seat: p.seat, alive: p.alive, executed: p.executed, knownRole: p.knownRole, realRole: p.realRole, tokens: this.getTokens(p.seat) })) }
  }
}

function renderStateTable(state) {
  const rows = state.players.map(p => {
    const tokens = state.getTokens(p.seat).join(', ')
    return `${p.seat}\t${p.alive ? '存活' : '死亡'}\t${p.knownRole || ''}\t${p.realRole || ''}\t${tokens}`
  })
  const header = '座位\t状态\t可见身份\t真实身份\tTokens'
  return [header, ...rows].join('\n')
}

module.exports = { NewSingleAgentState, renderStateTable }
