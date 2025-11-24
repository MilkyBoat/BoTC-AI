class State {
  constructor() {
    this.players = []
    this.tokens = new Map()
  }
  initPlayers(count) {
    this.players = Array.from({ length: count }, (_, i) => ({ seat: i + 1, knownRole: null, realRole: null, alive: true }))
    this.tokens = new Map()
    this.players.forEach(p => this.tokens.set(p.seat, new Set()))
  }
  setKnownRole(seat, role) {
    const p = this.getPlayer(seat)
    if (p) p.knownRole = role
  }
  setRealRole(seat, role) {
    const p = this.getPlayer(seat)
    if (p) p.realRole = role
  }
  getPlayer(seat) {
    return this.players.find(p => p.seat === seat)
  }
  addToken(seat, token) {
    const s = this.tokens.get(seat)
    if (s) s.add(String(token))
  }
  removeToken(seat, token) {
    const s = this.tokens.get(seat)
    if (s) s.delete(String(token))
  }
  getTokens(seat) {
    const s = this.tokens.get(seat)
    return s ? Array.from(s) : []
  }
  markExecuted(seat) {
    const p = this.getPlayer(seat)
    if (p) {
      p.alive = false
      p.death = p.death || {}
      p.death.phase = 'day'
      p.death.reason = 'execution'
      p.death.index = typeof this.currentDayIndex === 'number' ? this.currentDayIndex : undefined
    }
  }
  kill(seat) {
    const p = this.getPlayer(seat)
    if (p) {
      p.alive = false
      p.death = p.death || {}
      p.death.phase = 'night'
      p.death.reason = p.death.reason || 'night_action'
      p.death.index = typeof this.currentNightIndex === 'number' ? this.currentNightIndex : undefined
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
    for (const item of players || []) {
      const seat = item.seat
      const p = this.getPlayer(seat)
      if (!p) continue
      p.knownRole = item.knownRole || null
      p.realRole = item.realRole || null
      const list = Array.isArray(item.tokens) ? item.tokens : []
      const s = this.tokens.get(seat)
      if (s) {
        list.forEach(t => s.add(String(t)))
      }
    }
  }
  snapshot() {
    return {
      players: this.players.map(p => ({ ...p })),
      tokens: Array.from(this.tokens.entries()).map(([k, v]) => [k, Array.from(v)])
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
}

module.exports = { State }