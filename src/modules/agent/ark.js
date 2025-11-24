const { OpenAI } = require('openai')

class ChatArk {
  constructor({ model, apiKey, baseURL, temperature = 0, extraBody = {} } = {}) {
    this.model = model || process.env.MODEL
    this.apiKey = apiKey || process.env.API_KEY
    this.baseURL = baseURL || process.env.BASE_URL
    this.temperature = temperature
    // 设置默认的extraBody值，包含response_format
    const defaultExtraBody = { response_format: { type: 'json_object' } }
    // 合并默认值和外部传入的值，外部传入的值优先级更高
    this.extraBody = { ...defaultExtraBody, ...extraBody }
    this.client = new OpenAI({ apiKey: this.apiKey, baseURL: this.baseURL })
  }
  async invoke(messages) {
    const body = {
      model: this.model,
      messages,
      temperature: this.temperature,
      ...this.extraBody
    }
    const r = await this.client.chat.completions.create(body)
    const txt = r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content ? r.choices[0].message.content : ''
    const reason = r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.reasoning_content ? r.choices[0].message.reasoning_content : ''
    return { content: txt, reason: reason, raw: r }
  }
}

module.exports = { ChatArk }