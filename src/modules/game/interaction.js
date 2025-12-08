const { record } = require('../common/record')
const readline = require('readline')

function question(promptText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(promptText, answer => { rl.close(); resolve(answer) }))
}

// 封装所有的交互，作为用户、魔典、Agent的输入输出统一接口
// TODO: 后期函数声明稳定后，定义成接口，写两个不同的实现，Web/CLI
class Interaction {
  broadcast(text) {
    // TODO: 和魔典交互
    record('event', text)
  }
  send(seat, message) {
    // TODO: 和魔典交互
    record('event', `座位${seat} 私密: ${message}`)
  }
  // 全局输入：支持“座位号 内容”格式，未携带座位号则 seat=0
  async questionAny(prompt) {
    // TODO: 和魔典交互
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
    // TODO: 和魔典交互
    record('prompt', `座位${seat}: ${prompt}`)
    const line = await question('文本> ')
    return { seat, text: String(line || '') }
  }
}

module.exports = { Interaction }
