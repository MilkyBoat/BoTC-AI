// 工具解析与归一化工具集：
// - 目标：从 LLM 原始返回或已有数据结构中提取并规范化工具列表
// - 术语：统一使用 tools（数组）/ tool（单个），输出始终为 { type, payload }[]
// - 约定：不做“修复 JSON”的激进处理，解析失败时返回空数组
function parseToolsFromLLM(input) {
  // 解析阶段：支持三类输入
  // 1) 数组：视为工具条目数组
  // 2) 对象：优先读取 input.tools，否则视为单条或对象数组
  // 3) 字符串：按严格 JSON 解析，支持数组或 { tools: [...] }
  let raw = []
  try {
    if (Array.isArray(input)) {
      raw = input
    } else if (input && typeof input === 'object') {
      raw = Array.isArray(input.tools) ? input.tools : input
    } else if (typeof input === 'string') {
      const o = JSON.parse(input)
      raw = Array.isArray(o) ? o : (o && Array.isArray(o.tools) ? o.tools : [])
    }
  } catch {
    raw = []
  }
  // 归一化阶段：将字符串/对象/单键对象统一为 { type, payload }
  const list = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? [raw] : [])
  return list.map(o => {
    if (typeof o === 'string') return { type: o, payload: {} }
    if (o && typeof o === 'object') {
      // 已有 { type, payload }
      if (o.type) return { type: String(o.type), payload: o.payload || {} }
      // 单键对象 { <type>: <payload> }
      const keys = Object.keys(o)
      if (keys.length === 1) {
        const k = keys[0]
        const v = o[k]
        return { type: String(k), payload: (v && typeof v === 'object') ? v : {} }
      }
    }
    return null
  }).filter(Boolean)
}

module.exports = { parseToolsFromLLM }
