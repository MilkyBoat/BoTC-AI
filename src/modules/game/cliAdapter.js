const readline = require('readline')

function question(promptText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(promptText, answer => { rl.close(); resolve(answer) }))
}

function createCliAdapter() {
  function send(toSeat, payload) {
    if (typeof toSeat === 'number') process.stdout.write(`[发送给${toSeat}] ${JSON.stringify(payload)}\n`)
  }
  function broadcast(payload) {
    process.stdout.write(`[广播] ${JSON.stringify(payload)}\n`)
  }
  async function questionForSeat(seat, promptText) {
    process.stdout.write(`询问座位${seat}: ${promptText}\n`)
    const text = await question('文本> ')
    return { seat, text }
  }
  async function questionAny(promptText) {
    process.stdout.write(`${promptText}\n`)
    const text = await question('文本> ')
    return { seat: null, text }
  }
  function close() {}
  return { send, broadcast, questionForSeat, questionAny, close }
}

module.exports = { createCliAdapter }