
const https = require('https')
const fs = require('fs')
const path = require('path')

const BASE = 'https://clocktower-wiki.gstonegames.com'
const PREFIX = `${BASE}/index.php?title=`
const ENTRY = `${PREFIX}首页`

const RULE_LINKS = [
  `${PREFIX}规则概要`,
  `${PREFIX}重要细节`,
  `${PREFIX}术语汇总`,
  `${PREFIX}给说书人的建议`,
  `${PREFIX}相克规则`,
  `${PREFIX}哪些是“可以但不建议”`,
  `${PREFIX}夜晚行动顺序一览`,
  `${PREFIX}钟楼谜团隐性规则汇总`
]
const SCRIPT_LINKS = [
  `${PREFIX}暗流涌动`,
  `${PREFIX}黯月初升`,
  `${PREFIX}梦殒春宵`,
  `${PREFIX}旅行者`,
  `${PREFIX}传奇角色`,
  `${PREFIX}实验性角色`,
  `${PREFIX}奇遇角色`,
  `${PREFIX}华灯初上`
]
const SPECIAL_LINKS = [
  `${PREFIX}角色能力类别总览`,
]

function pageFilter(title) {
  return /特殊|登录|剧本创作大赛/.test(title)
}

function getRuleCategory(name) {
  return (
    name === '给说书人的建议' ||
    name === '相克规则' ||
    name === '钟楼谜团隐性规则汇总' ||
    name === '哪些是“可以但不建议”'
  ) ? '进阶' : '基础'
}

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      const chunks = []
      res.on('data', d => chunks.push(d))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    }).on('error', reject)
  })
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function getCorrectNavUl(html) {
  const divRe = /(<div[^>]*class=["'][^"']*side-nav[^"']*["'][^>]*>)([\s\S]*?)<\/div>/gi
  let dm
  while ((dm = divRe.exec(html)) != null) {
    const open = dm[1]
    const inner = dm[2]
    if (/style\s*=/.test(open)) continue
    const ulRe = /<ul[^>]*>([\s\S]*?)<\/ul>/gi
    const um = ulRe.exec(inner)
    if (um) return um[0]
  }
  const re = /<ul([^>]*)>([\s\S]*?)<\/ul>/gi
  let m
  while ((m = re.exec(html)) != null) {
    const attrs = m[1]
    const full = m[0]
    if (!/class[\s]*=[\s]*(["'])[^\1]*side-nav[^\1]*\1/i.test(attrs)) continue
    if (/style\s*=/.test(attrs)) continue
    return full
  }
  return ''
}

function extractNavLists(ulHtml) {
  const rules = []
  const scripts = []
  let special = null
  let start = false
  let afterRoles = false
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi
  let lm
  while ((lm = liRe.exec(ulHtml)) != null) {
    const inner = lm[1]
    const text = decodeEntities(stripAllTags(inner).trim())
    if (!start && /游戏信息/.test(text)) { start = true; continue }
    if (!start) continue
    if (!afterRoles && /角色/.test(text)) { afterRoles = true; continue }
    const am = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(inner)
    if (!am) continue
    let href = am[1]
    const label = decodeEntities(stripAllTags(am[2]).trim())
    if (href.startsWith('/')) href = `${BASE}${href}`
    if (!href.startsWith(PREFIX)) continue
    const it = { href, text: label }
    if (!afterRoles) {
      rules.push(it)
    } else {
      if (label === '角色能力类别总览') special = it
      else scripts.push(it)
    }
  }
  return { rules, scripts, special }
}

function stripAllTags(s) {
  return s.replace(/<[^>]+>/g, '')
}

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim()
}

function ensureDirs() {
  const base = path.resolve(process.cwd(), 'knowledge')
  try { fs.mkdirSync(base) } catch {}
  ;['基础','剧本','角色','进阶','其他'].forEach(d => {
    const p = path.join(base, d)
    try { fs.mkdirSync(p) } catch {}
  })
  return base
}

function getDivContent(html) {
  const openRe = /<div[^>]*class=["'][^"']*mw-parser-output[^"']*["'][^>]*>/i
  const m = openRe.exec(html)
  if (m) {
    const start = m.index + m[0].length
    const tagRe = /<\/?div\b[^>]*>/gi
    let level = 1
    tagRe.lastIndex = start
    let end = -1
    let tm
    while ((tm = tagRe.exec(html)) != null) {
      const isClose = /^<\//.test(tm[0])
      level += isClose ? -1 : 1
      if (level === 0) { end = tm.index; break }
    }
    if (end > start) return html.slice(start, end)
  }
  const m1 = /<div[^>]*id=["']mw-content-text["'][^>]*>([\s\S]*?)<\/div>/i.exec(html)
  if (m1) return m1[1]
  const m0 = /<div[^>]*id=["']content["'][^>]*>([\s\S]*?)<\/div>/i.exec(html)
  return m0 ? m0[1] : ''
}

function getFirstH1(content) {
  const m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(content)
  if (!m) return ''
  return decodeEntities(stripAllTags(m[1]).trim())
}

function normalizeUrl(href, baseUrl) {
  try { return new URL(href, baseUrl).toString() } catch { return null }
}

function convertToMarkdown(content, baseUrl) {
  let s = content
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '')
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '')
  // 保留表格文本
  s = s.replace(/<thead[\s\S]*?<\/thead>/gi, '')
  s = s.replace(/<caption[\s\S]*?<\/caption>/gi, '')
  s = s.replace(/<tr[^>]*>/gi, '\n')
  s = s.replace(/<th[^>]*>([\s\S]*?)<\/th>/gi, (_, a) => `**${decodeEntities(stripAllTags(a))}**\t`)
  s = s.replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, (_, a) => `${decodeEntities(stripAllTags(a))}\t`)
  s = s.replace(/<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/gi, (_, src, alt) => {
    const abs = normalizeUrl(src, baseUrl) || src
    const a = decodeEntities(alt || '')
    return `![${a}](${abs})`
  })
  s = s.replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, (_, src) => {
    const abs = normalizeUrl(src, baseUrl) || src
    return `![](${abs})`
  })
  s = s.replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
    const txt = decodeEntities(stripAllTags(inner).trim())
    const abs = normalizeUrl(href, baseUrl) || href
    if (!abs.startsWith(PREFIX)) return `${txt}`
    return `[${txt}](${abs})`
  })
  s = s.replace(/<br\s*\/?\s*>/gi, '\n')
  s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, a) => `# ${decodeEntities(stripAllTags(a))}\n`)
  s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, a) => `## ${decodeEntities(stripAllTags(a))}\n`)
  s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, a) => `### ${decodeEntities(stripAllTags(a))}\n`)
  s = s.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, a) => `#### ${decodeEntities(stripAllTags(a))}\n`)
  s = s.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, a) => `${decodeEntities(stripAllTags(a))}\n`)
  s = s.replace(/<dt[^>]*>([\s\S]*?)<\/dt>/gi, (_, a) => `- ${decodeEntities(stripAllTags(a))}: `)
  s = s.replace(/<dd[^>]*>([\s\S]*?)<\/dd>/gi, (_, a) => `${decodeEntities(stripAllTags(a))}\n`)
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, a) => `- ${decodeEntities(stripAllTags(a))}\n`)
  s = s.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, a) => `> ${decodeEntities(stripAllTags(a))}\n`)
  s = s.replace(/<[^>]+>/g, '')
  s = decodeEntities(s)
  s = s.replace(/[ \t]+/g, ' ')
  s = s.replace(/\n{3,}/g, '\n\n')
  s = s.split('\n').map(l => l.trim()).filter(l => l.length > 0).join('\n')
  return s
}

function extractLinks(content, baseUrl) {
  const out = []
  const re = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = re.exec(content)) != null) {
    const href = m[1]
    const abs = normalizeUrl(href, baseUrl)
    if (!abs) continue
    if (!abs.startsWith(PREFIX)) continue
    out.push(abs)
  }
  const seen = new Set()
  return out.filter(u => { if (seen.has(u)) return false; seen.add(u); return true })
}

function getTitleFromUrl(u) {
  try { return decodeURIComponent(new URL(u).searchParams.get('title') || '') } catch { return '' }
}

async function crawlOnce(url) {
  const html = await fetch(url)
  const content = getDivContent(html)
  const title = getTitleFromUrl(url)
  process.stdout.write(`content length for ${title}: ${content.length}\n`)
  const h1 = getFirstH1(content) || title
  const md = convertToMarkdown(content, url)
  const links = extractLinks(content, url)
  return { name: h1, title, md, links }
}

function writeDoc(baseDir, category, name, md, processed) {
  if (!name) return null
  const n = sanitizeFilename(`${name}.md`)
  const out = path.join(baseDir, category, n)
  if (processed.has(n)) return out
  try { fs.writeFileSync(out, md, 'utf8'); processed.add(n); process.stdout.write(`saved: ${category}/${n}\n`) } catch {}
  return out
}

async function main() {
  const baseDir = ensureDirs()
  const processed = new Set()
  const rules = RULE_LINKS
  const scripts = SCRIPT_LINKS
  const specials = SPECIAL_LINKS
  for (const href of rules) {
    const { name, title, md } = await crawlOnce(href)
    if (pageFilter(title)) continue
    const category = getRuleCategory(name)
    writeDoc(baseDir, category, name, md, processed)
  }
  for (const href of scripts) {
    const top = await crawlOnce(href)
    if (pageFilter(top.title)) continue
    writeDoc(baseDir, '剧本', top.name, top.md, processed)
    process.stdout.write(`sub-links for ${top.name}: ${top.links.length}\n`)
    for (const link of top.links) {
      const sub = await crawlOnce(link)
      if (pageFilter(sub.title)) continue
      writeDoc(baseDir, '角色', sub.name, sub.md, processed)
    }
  }
  for (const special of specials) {
    const sp = await crawlOnce(special)
    if (pageFilter(sp.title)) return
    writeDoc(baseDir, '基础', sp.name, sp.md, processed)
    for (const link of sp.links) {
      const sub = await crawlOnce(link)
      if (pageFilter(sub.title)) continue
      writeDoc(baseDir, '基础', sub.name, sub.md, processed)
    }
  }
}

main()
