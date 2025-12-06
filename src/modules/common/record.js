const fs = require('fs')
const path = require('path')
let dayjs = null
try { dayjs = require('dayjs') } catch {}
const buffer = []
let inited = false
let wsAll = null
let wsLLM = null
let wsUser = null
let sessionDir = null
let wsState = null

function nowISO() { return dayjs ? dayjs().toISOString() : new Date().toISOString() }
function sessionName() {
  if (dayjs) return dayjs().format('YYYY_MMDD_HHmm')
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  const y = d.getFullYear(), m = pad(d.getMonth() + 1), dd = pad(d.getDate()), H = pad(d.getHours()), M = pad(d.getMinutes())
  return `${y}_${m}${dd}_${H}${M}`
}

function ensureSession() {
  if (inited) return
  const baseDir = path.resolve(process.cwd(), 'log')
  try { fs.mkdirSync(baseDir, { recursive: true }) } catch {}
  const name = sessionName()
  sessionDir = path.join(baseDir, name)
  try { fs.mkdirSync(sessionDir, { recursive: true }) } catch {}
  wsAll = fs.createWriteStream(path.join(sessionDir, 'all.log'), { flags: 'a' })
  wsLLM = fs.createWriteStream(path.join(sessionDir, 'llm.log'), { flags: 'a' })
  wsUser = fs.createWriteStream(path.join(sessionDir, 'user.log'), { flags: 'a' })
  wsState = fs.createWriteStream(path.join(sessionDir, 'state.log'), { flags: 'a' })
  process.stdout.write(`[log] session=${name} dir=${sessionDir} provider=${dayjs ? 'dayjs' : 'date'}\n`)
  inited = true
}

function writeLine(type, line) {
  try { wsAll && wsAll.write(line) } catch {}
  if (type === 'llm') { try { wsLLM && wsLLM.write(line) } catch {} } else { try { wsUser && wsUser.write(line) } catch {} }
  if (type === 'state') { try { wsState && wsState.write(line) } catch {} }
}

function record(type, obj) {
  ensureSession()
  const ts = nowISO()
  const text = typeof obj === 'string' ? obj : JSON.stringify(obj)
  buffer.push({ ts, type, obj })
  const fileLine = `[${ts}] [${type}] ${text}\n`
  const stdLine = `[${type}] ${text}\n`
  writeLine(type, fileLine)
  process.stdout.write(stdLine)
}

function getBuffer() {
  return buffer.slice()
}

module.exports = { record, getBuffer }
