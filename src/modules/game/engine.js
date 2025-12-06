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
    // 1) 白天开始后先进行一次胜利判定（如有结束则直接返回）
    {
      const msgs = this.llm.buildDayCheckMessages({ stateSnapshot: this.state.snapshot(), script: this.rawScriptData })
      const ops = await this.llm.invokeRoleOps(msgs)
      process.stdout.write(`白天检查（阶段开始）完成，开始应用工具调用\n`)
      if (ops && ops.length) {
        this.printOps(ops)
        const r = await this.storyteller.applyOps(ops)
        if (r && r.ended) { this.ended = true; return }
      }
    }
    // 2) 私聊阶段（占位），3) 可多次接收聊天，4) 系统事件标明私聊结束
    if (typeof this.storyteller.startPrivateChat === 'function') {
      this.storyteller.startPrivateChat()
      while (true) {
        const chatResp = await this.storyteller.awaitResponse()
        const t = String(chatResp && chatResp.text || '').trim().toLowerCase()
        if (t === '/end') { break }
        // 再次进入私聊，继续接收下一条聊天
        this.storyteller.startPrivateChat()
      }
    }
    // 5) 提名环节：只允许 execute 或 none，非法则循环重试
    if (typeof this.storyteller.promptExecution === 'function') {
      while (true) {
        this.storyteller.promptExecution()
        const resp = await this.storyteller.awaitResponse()
        const ok = this._handleDayExecutionResponse(resp)
        if (ok) break
      }
    }
    // 6) 处决后再次胜利判定
    {
      const msgs = this.llm.buildDayCheckMessages({ stateSnapshot: this.state.snapshot(), script: this.rawScriptData })
      const ops = await this.llm.invokeRoleOps(msgs)
      process.stdout.write(`白天检查（处决后）完成，开始应用工具调用\n`)
      if (ops && ops.length) {
        this.printOps(ops)
        const r = await this.storyteller.applyOps(ops)
        if (r && r.ended) { this.ended = true; return }
      }
    }
  }

  _handleDayExecutionResponse(resp) {
    if (!resp || !resp.context || resp.context.type !== 'execution') { process.stdout.write('提示: 输入 "execute 座位号" 或 "none"\n'); return false }
    const t = String(resp.text || '').trim().toLowerCase()
    if (t === 'none' || t === 'skip') {
      process.stdout.write('广播: 白天无人处决\n')
      return true
    }
    if (t.startsWith('execute ')) {
      const num = parseInt(t.split(/\s+/)[1], 10)
      if (num && this.state.getPlayer(num)) {
        this.state.markExecuted(num)
        process.stdout.write(`广播: 白天处决座位 ${num}\n`)
        return true
      } else { process.stdout.write('提示: 输入 "execute 座位号" 或 "none"\n'); return false }
    }
    process.stdout.write('提示: 输入 "execute 座位号" 或 "none"\n')
    return false
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
