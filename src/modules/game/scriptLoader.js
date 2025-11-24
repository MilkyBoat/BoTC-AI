const fs = require('fs')
const path = require('path')

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
    const lines = []
    lines.push('# 剧本完整角色摘要(包含不在场角色)')
    for (const r of roles) {
      lines.push(`- 名称: ${r.name} | 阵营: ${r.team}`)
      if (r.ability) lines.push(`  能力: ${r.ability}`)
    }
    return lines.join('\n')
  } catch {
    return ''
  }
}

module.exports = { listScripts, loadScript, parseScript, renderScript }