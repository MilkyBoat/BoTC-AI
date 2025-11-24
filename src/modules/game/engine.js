const { parseScript } = require('./scriptLoader')

class GameEngine {
  constructor({ scriptData, storyteller, llmAgent, state }) {
    this.storyteller = storyteller
    this.llm = llmAgent
    this.state = state
    this.script = parseScript(scriptData)
    this.rawScriptData = scriptData
    this.ended = false
    this.nightCounter = 0
  }
  renderStateTable() {
    const rows = this.state.players.map(p => {
      const tokens = this.state.getTokens(p.seat).join(', ')
      return `${p.seat}\t${p.alive ? '存活' : '死亡'}\t${p.knownRole || ''}\t${p.realRole || ''}\t${tokens}`
    })
    const header = '座位\t状态\t可见身份\t真实身份\tTokens'
    return [header, ...rows].join('\n')
  }
  printOps(ops) {
    if (!Array.isArray(ops)) return
    process.stdout.write('工具调用:\n')
    for (const op of ops) {
      const type = op.type
      const pl = op.payload || {}
      const line = `${type} ${JSON.stringify(pl)}`
      process.stdout.write(`- ${line}\n`)
    }
  }
  async runFirstNight() {
    this.nightCounter = 1
    await this.storyteller.startNight(this.nightCounter)
    for (const role of this.script.nightOrder.firstNight) {
      if (Number(role.firstNight) === 0) { continue }
      const seats = this.state.seatsByRole(role.name)
      for (const seat of seats) {
        await this.runRoleConversation('firstNight', role, seat)
        if (this.ended) return
      }
    }
    process.stdout.write(`夜晚 ${this.nightCounter} 结束\n${this.renderStateTable()}\n`)
  }
  async runOtherNight() {
    this.nightCounter += 1
    await this.storyteller.startNight(this.nightCounter)
    for (const role of this.script.nightOrder.otherNight) {
      if (Number(role.otherNight) === 0) { continue }
      const seats = this.state.seatsByRole(role.name)
      for (const seat of seats) {
        await this.runRoleConversation('otherNight', role, seat)
        if (this.ended) return
      }
    }
    process.stdout.write(`夜晚 ${this.nightCounter} 结束\n${this.renderStateTable()}\n`)
  }
  async runDay() {
    this.dayCounter = (this.dayCounter || 0) + 1
    await this.storyteller.startDay(this.dayCounter)
    await this.storyteller.awaitResponse()
    // 白天结束后进行一次胜利判定（仅允许 gameover 或 end_role）
    const msgs = this.llm.buildDayCheckMessages({ stateSnapshot: this.state.snapshot(), script: this.rawScriptData })
    const ops = await this.llm.invokeRoleOps(msgs)
    if (ops && ops.length) {
      this.printOps(ops)
      const r = await this.storyteller.applyOps(ops)
      if (r && r.ended) { this.ended = true; return }
    }
  }
  async loop(maxCycles = 20) {
    let cycles = 0
    await this.runFirstNight()
    while (!this.ended && cycles < maxCycles) {
      await this.runDay()
      if (this.ended) break
      await this.runOtherNight()
      cycles++
    }
  }
  async runRoleConversation(phase, role, targetSeat) {
    const timeLabel = phase === 'firstNight' || phase === 'otherNight' ? `第${this.nightCounter}个夜晚` : `第${this.dayCounter || 0}个白天`
    const baseMsgs = this.llm.buildRoleMessages({ phase, role, stateSnapshot: this.state.snapshot(), script: this.rawScriptData, targetSeat, timeLabel })
    const msgs = baseMsgs.slice()
    const maxSteps = 10
    for (let step = 0; step < maxSteps; step++) {
      const ops = await this.llm.invokeRoleOps(msgs)
      if (!ops || ops.length === 0) {
        msgs.push({ role: 'user', content: '你没有做出任何决策。如果认为无需与当前玩家发生任何交互，请在 ops 中调用 end_role 以结束当前角色；否则请给出合适的 ops(prompt_player/send_to_player/broadcast/add_token/remove_token)。' })
        continue
      }
      this.printOps(ops)
      msgs.push({ role: 'assistant', content: JSON.stringify({ ops }) })
      const r = await this.storyteller.applyOps(ops)
      if (r && r.ended) { this.ended = true; return }
      const hasEnd = ops.some(o => o.type === 'end_role')
      if (r && r.paused) {
        const resp = await this.storyteller.awaitResponse()
        msgs.push({ role: 'user', content: JSON.stringify({ event: 'player_response', seat: resp && resp.seat, text: resp && resp.text, context: resp && resp.context, state: this.state.snapshot() }) })
        continue
      }
      if (hasEnd) break
      break
    }
  }
}

module.exports = { GameEngine }