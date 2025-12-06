const { record } = require('../common/record')
const readline = require('readline')

function question(promptText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(promptText, answer => { rl.close(); resolve(answer) }))
}

// 交互层：封装标准输出与 stdin 读取
class Interaction {
  broadcast(text) {
    record('event', text)
  }
  send(seat, message) {
    record('event', `座位${seat} 私密: ${message}`)
  }
  // 全局输入：支持“座位号 内容”格式，未携带座位号则 seat=0
  async questionAny(prompt) {
    record('prompt', prompt)
    const line = await question('文本> ')
    const trimmed = String(line || '').trim()
    let seat = 0
    let text = trimmed
    const m = trimmed.match(/^(\d+)\s+(.+)$/)
    if (m) { seat = parseInt(m[1], 10); text = m[2] }
    return { seat, text }
  }
  // 定向输入：向指定座位发起提示，读取一行作为回应
  async questionForSeat(seat, prompt) {
    record('prompt', `座位${seat}: ${prompt}`)
    const line = await question('文本> ')
    return { seat, text: String(line || '') }
  }
}

module.exports = { Interaction }
