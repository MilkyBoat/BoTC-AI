// new_single_agent 的统一输出收集器
// 作用：
// 1) 记录所有对外可视的信息（prompt、event、info 等）到内存 buffer
// 2) 直接打印到 stdout，便于观察运行过程
const buffer = []

// 统一入口：record(type, obj)
// - type：'info' | 'event' | 'prompt' | 'response' 等分级类别
// - obj：字符串优先；对象将以 JSON 方式简化打印
function record(type, obj) {
  const ts = new Date().toISOString()
  const text = typeof obj === 'string' ? obj : JSON.stringify(obj)
  buffer.push({ ts, type, obj })
  process.stdout.write(`[${type}] ${text}\n`)
}

// 获取当前内存缓冲（只读副本）
function getBuffer() {
  return buffer.slice()
}

module.exports = { record, getBuffer }
