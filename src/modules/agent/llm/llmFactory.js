const { ChatArk } = require('./ark')
const { ChatClaude } = require('./claude')

/**
 * 根据 LLM_PROVIDER 环境变量返回对应的 LLM 实例
 * LLM_PROVIDER=claude  → ChatClaude（Anthropic Claude）
 * LLM_PROVIDER=ark 或未设置 → ChatArk（字节跳动 Ark / OpenAI 兼容接口）
 */
function createLlm(opts = {}) {
  const provider = (process.env.LLM_PROVIDER || 'ark').toLowerCase()
  if (provider === 'claude') {
    return new ChatClaude(opts)
  }
  return new ChatArk(opts)
}

module.exports = { createLlm }
