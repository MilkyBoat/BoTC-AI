const { OpenAI } = require('openai')
const { BaseChatModel } = require('@langchain/core/language_models/chat_models')
const { AIMessage, HumanMessage, SystemMessage, ToolMessage } = require('@langchain/core/messages')
const { convertToOpenAITool } = require('@langchain/core/utils/function_calling')
const { LLM_CACHE_TIME, DEFAULT_TEMPERATURE } = require('../../common/const')
const { RunnableBinding } = require('@langchain/core/runnables')

class ChatArk extends BaseChatModel {
  constructor(fields) {
    super(fields)
    this.model = fields?.model || process.env.MODEL
    this.apiKey = fields?.apiKey || process.env.API_KEY
    this.baseURL = fields?.baseURL || process.env.BASE_URL
    this.defaultExtraBody = {
      "temperature": DEFAULT_TEMPERATURE,

      // session cache 相关配置
      "caching": { "type": "enabled" },
      "store": true,
      "expire_at": Math.floor(Date.now() / 1000) + LLM_CACHE_TIME, // 缓存时间取首次调用后的3小时，所以对局超过3小时会报错
    
      "parallel_tool_calls": true, // 开启并行调用工具
    }
    this.extraBody = { ...this.defaultExtraBody, ...(fields?.extraBody || {}) }
    this.client = new OpenAI({ apiKey: this.apiKey, baseURL: this.baseURL })
    this.previous_response_id = undefined
    this.last_msg_count = 0
  }

  _llmType() {
    return "ark"
  }

  bindTools(tools, kwargs) {
    return this.bind({
      tools: tools.map(convertToOpenAITool),
      ...kwargs,
    })
  }

  bind(kwargs) {
    return new RunnableBinding({
      bound: this,
      kwargs: kwargs,
    });
  }

  /**
   * @param {BaseMessage[]} messages
   * @param {this["ParsedCallOptions"]} options
   * @returns {Promise<ChatResult>}
   */
  async _generate(messages, options) {
    // Convert LangChain messages to OpenAI format
    const openaiMessages = messages.map(m => {
      if (m._getType() === 'human') {
        return { role: 'user', content: m.content }
      } else if (m._getType() === 'ai') {
        const msg = { role: 'assistant', content: m.content || "" } // Ensure content is not null
        if (m.tool_calls && m.tool_calls.length > 0) {
          msg.tool_calls = m.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args)
            }
          }))
        }
        return msg
      } else if (m._getType() === 'system') {
        return { role: 'system', content: m.content }
      } else if (m._getType() === 'tool') {
        return {
          role: 'tool',
          tool_call_id: m.tool_call_id,
          content: m.content
        }
      }
      return { role: 'user', content: m.content }
    })

    // Detect reset (if messages count dropped, assume new conversation)
    if (openaiMessages.length < this.last_msg_count) {
      this.previous_response_id = undefined
      this.last_msg_count = 0
    }

    let inputMessages = openaiMessages
    // Optimization: send only new messages if caching is enabled and we have a previous ID
    if (this.previous_response_id && this.extraBody.caching?.type === 'enabled') {
      if (openaiMessages.length > this.last_msg_count) {
        inputMessages = openaiMessages.slice(this.last_msg_count)
      }
    }

    // Update count for next time
    this.last_msg_count = openaiMessages.length

    const body = {
      model: this.model,
      previous_response_id: this.previous_response_id,
      input: inputMessages,
      ...this.extraBody
    }

    // Handle tools
    if (options.tools) {
      body.tools = options.tools.map(tool => {
        // openai functioncall 格式和 ark 的不一致需要转换
        if (tool.function) {
          return {
            type: 'function',
            ...tool.function
          };
        }
      })
    }

    // Call the custom API
    const r = await this.client.responses.create(body)
    this.previous_response_id = r.id

    // Parse response
    let txt = ''
    let reason = ''
    let toolCalls = []

    for (const msg of r.output) {
      if (msg.type === 'message') {
        if (msg.content && msg.content[0] && msg.content[0].text) {
          txt += msg.content[0].text
        }
        // Check for tool calls in the message object
        if (msg.tool_calls) {
          msg.tool_calls.forEach(tc => {
            toolCalls.push({
              id: tc.id,
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments)
            })
          })
        }
      } else if (msg.type === 'reasoning') {
        reason = msg.summary && msg.summary[0] && msg.summary[0].text ? msg.summary[0].text : ''
      } else if (msg.type === 'function_call') {
        // Assuming structure if it exists separately
        if (msg.items) {
          // openai style
          msg.items.forEach(tc => {
            toolCalls.push({
              id: tc.id,
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments)
            })
          })
        } else {
          // ark style
          toolCalls.push({
            id: msg.call_id,
            name: msg.name,
            args: JSON.parse(msg.arguments)
          })
        }
      }
    }

    const generations = [
      {
        text: txt,
        message: new AIMessage({
          content: txt,
          tool_calls: toolCalls,
          additional_kwargs: { reason, raw: r }
        })
      }
    ]

    return {
      generations
    }
  }
}

module.exports = { ChatArk }
