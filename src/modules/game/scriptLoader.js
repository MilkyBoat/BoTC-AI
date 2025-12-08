const fs = require('fs')
const path = require('path')
const { record } = require('../common/record')
const { prompt } = require('../utils/console')

const SCRIPTS_DIR = path.resolve(process.cwd(), 'game_script')

async function listScripts() {
  try {
    const files = await fs.promises.readdir(SCRIPTS_DIR)
    return files.filter(f => f.toLowerCase().endsWith('.json'))
  } catch {
    return []
  }
}

async function loadScript(filename) {
  const full = path.isAbsolute(filename) ? filename : path.join(SCRIPTS_DIR, filename)
  const raw = await fs.promises.readFile(full, 'utf8')
  const data = JSON.parse(raw)
  return data
}

function parseScript(data) {
  const roles = data.filter(x => x && x.id && x.team && x.id !== '_meta' && x.team !== 'traveler')
  const meta = data.find(x => x && x.id === '_meta') || {}
  const firstNight = roles.filter(r => Number(r.firstNight) > 0).sort((a, b) => Number(a.firstNight) - Number(b.firstNight))
  const otherNight = roles.filter(r => Number(r.otherNight) > 0).sort((a, b) => Number(a.otherNight) - Number(b.otherNight))
  return { roles, nightOrder: { firstNight, otherNight }, meta }
}

function renderScript(raw) {
  try {
    const entries = Array.isArray(raw) ? raw : []
    const roles = entries.filter(x => x && x.id && x.team && x.id !== '_meta')
    const { nightOrder } = parseScript(entries)
    const getOrderNames = list => (Array.isArray(list) ? list.map(e => String(e.name || e.id)) : [])
    const joinOrder = names => (names && names.length ? names.join(' -> ') : '无')
    const fmt = list => (Array.isArray(list) && list.length ? list.map(x => String(x)).join(', ') : '无')
  const lines = []
  lines.push('# 剧本完整角色摘要(包含不在场角色)')
  for (const r of roles) {
    lines.push(`- 名称: ${r.name} | 阵营: ${r.team}`)
    if (r.ability) lines.push(`  能力: ${r.ability}`)
    const reminders = Array.isArray(r.reminders) ? r.reminders : []
    const remindersGlobal = Array.isArray(r.remindersGlobal) ? r.remindersGlobal : (Array.isArray(r.reminders_global) ? r.reminders_global : [])
    if (reminders.length) lines.push(`  可选Token(绑定到特定座位): ${fmt(reminders)}`)
    if (remindersGlobal.length) lines.push(`  可选Token(全局，即座位0): ${fmt(remindersGlobal)}`)
  }
  lines.push(`首夜行动顺序: ${joinOrder(getOrderNames(nightOrder.firstNight))}`)
  lines.push(`其他夜晚行动顺序: ${joinOrder(getOrderNames(nightOrder.otherNight))}`)
  record('script', `[剧本] ${lines.join('\n')}`)
    return lines.join('\n')
  } catch {
    return ''
  }
}

module.exports = { listScripts, loadScript, parseScript, renderScript }

async function selectAndLoadScript({ debug }) {
  try {
    if (debug) {
      const p = path.resolve(process.cwd(), 'game_script/#暗流涌动.json')
      const rel = path.relative(process.cwd(), p)
      record('debug', `使用固定剧本: ${rel}`)
      return await loadScript(p)
    } else {
      const scripts = await listScripts()
      if (scripts.length === 0) {
        record('error', '未在 ./game_script 发现剧本，请提供标准格式的示例json后重试')
        return null
      }
      const list = scripts.map((f, i) => `${i + 1}. ${f}`).join('\n')
      record('info', `可用剧本:\n${list}`)
      const idxInput = await prompt('请选择剧本编号: ')
      const idx = parseInt(idxInput, 10)
      if (!idx || idx < 1 || idx > scripts.length) {
        record('error', '选择无效')
        return null
      }
      const scriptFile = scripts[idx - 1]
      const s = await loadScript(scriptFile)
      record('info', `已选择剧本: ${scriptFile}`)
      return s
    }
  } catch (e) {
    record('error', `剧本加载失败: ${String(e && e.message || e)}`)
    return null
  }
}

module.exports.selectAndLoadScript = selectAndLoadScript
