const { OpenAI } = require('openai')
const { LLM_CACHE_TIME, DEFAULT_TEMPERATURE } = require('../common/const')

class ChatArk {
  constructor({ model, apiKey, baseURL, extraBody = {} } = {}) {
    this.model = model || process.env.MODEL
    this.apiKey = apiKey || process.env.API_KEY
    this.baseURL = baseURL || process.env.BASE_URL
    // 合并默认值和外部传入的值，外部传入的值优先级更高
    this.defaultExtraBody = {
      "temperature": DEFAULT_TEMPERATURE,
      "caching": { "type": "enabled" }, // 开启后每轮对话只需要传入增量消息，存量数据不需要重复
      "expire_at": Math.floor(Date.now() / 1000) + LLM_CACHE_TIME, // UTC秒级时间戳,过期时间
      // "thinking": {"type": "disabled"},
    }
    this.extraBody = { ...this.defaultExtraBody, ...extraBody }
    this.client = new OpenAI({ apiKey: this.apiKey, baseURL: this.baseURL })
  }
  async invoke(messages) {
    const body = {
      model: this.model,
      previous_response_id: this.previous_response_id,
      input: messages,
      ...this.extraBody
    }
    const r = await this.client.responses.create(body)
    this.previous_response_id = r.id
    var txt = '', reason = ''
    for (const msg of r.output) {
      if (msg.type === 'message') {
        txt = msg.content && msg.content[0] && msg.content[0].text ? msg.content[0].text : ''
      } else if (msg.type === 'reasoning') {
        reason = msg.summary && msg.summary[0] && msg.summary[0].text ? msg.summary[0].text : ''
      }
    }
    return { content: txt, reason: reason, raw: r }
  }
}

module.exports = { ChatArk }