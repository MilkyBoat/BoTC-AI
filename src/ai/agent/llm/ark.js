
const { OpenAI } = require("openai");
const {
  BaseChatModel,
} = require("@langchain/core/language_models/chat_models");
const {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} = require("@langchain/core/messages");
const {
  convertToOpenAITool,
} = require("@langchain/core/utils/function_calling");
const { LLM_CACHE_TIME, DEFAULT_TEMPERATURE } = require("../../common/const");
const { RunnableBinding } = require("@langchain/core/runnables");
const { SERVER_DEFAULT_VALUE } = require("../../runtime/browserConfig");

class ChatArk extends BaseChatModel {
  constructor(fields) {
    super(fields);
    this.model = fields?.model || process.env.MODEL;
    this.apiKey = fields?.apiKey || process.env.API_KEY;
    this.baseURL = fields?.baseURL || process.env.BASE_URL;
    this.defaultExtraBody = {
      temperature: DEFAULT_TEMPERATURE,

      // session cache 相关配置
      caching: { type: "enabled" },
      store: true,
      expire_at: Math.floor(Date.now() / 1000) + LLM_CACHE_TIME, // 缓存时间取首次调用后的3小时，所以对局超过3小时会报错

      parallel_tool_calls: true, // 开启并行调用工具
    };
    this.extraBody = { ...this.defaultExtraBody, ...(fields?.extraBody || {}) };
    this.client =
      typeof window === "undefined"
        ? new OpenAI({ apiKey: this.apiKey, baseURL: this.baseURL })
        : null;
    this.previous_response_id = undefined;
    this.last_msg_count = 0;
  }

  _llmType() {
    return "ark";
  }

  bindTools(tools, kwargs) {
    return this.bind({
      tools: tools.map(convertToOpenAITool),
      ...kwargs,
    });
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
    const serializeContent = (content) =>
      typeof content === "string" ? content : JSON.stringify(content || "");

    const openaiMessages = messages
      .map((m) => {
      if (m._getType() === "human") {
        return { role: "user", content: serializeContent(m.content) };
      } else if (m._getType() === "ai") {
        if (m.tool_calls && m.tool_calls.length > 0) {
          return null;
        }
        return {
          role: "assistant",
          content: serializeContent(m.content || ""),
        };
      } else if (m._getType() === "system") {
        return { role: "system", content: serializeContent(m.content) };
      } else if (m._getType() === "tool") {
        return {
          type: "function_call_output",
          call_id: m.tool_call_id,
          output: serializeContent(m.content),
        };
      }
      return { role: "user", content: serializeContent(m.content) };
      })
      .filter(Boolean);

    // Detect reset (if messages count dropped, assume new conversation)
    if (openaiMessages.length < this.last_msg_count) {
      this.previous_response_id = undefined;
      this.last_msg_count = 0;
    }

    const hasTools = Boolean(options.tools && options.tools.length);
    let inputMessages = openaiMessages;
    let previousResponseId = this.previous_response_id;

    if (hasTools) {
      previousResponseId = undefined;
    }

    if (
      previousResponseId &&
      this.extraBody.caching?.type === "enabled"
    ) {
      if (openaiMessages.length > this.last_msg_count) {
        inputMessages = openaiMessages.slice(this.last_msg_count);
      }
    }

    // Update count for next time
    this.last_msg_count = openaiMessages.length;

    const body = {
      model: this.model,
      input: inputMessages,
      ...this.extraBody,
    };

    if (previousResponseId) {
      body.previous_response_id = previousResponseId;
    }

    if (hasTools) {
      delete body.caching;
      delete body.store;
      delete body.expire_at;
    }

    // Handle tools
    if (hasTools) {
      body.tools = options.tools
        .map((tool) => {
          if (tool.function) {
            return {
              type: "function",
              ...tool.function,
            };
          }
          return null;
        })
        .filter(Boolean);
    }

    const r =
      typeof window === "undefined"
        ? await this.client.responses.create(body)
        : await this.invokeBrowser(body);
    this.previous_response_id = hasTools ? undefined : r.id;

    // Parse response
    let txt = "";
    let reason = "";
    let toolCalls = [];

    for (const msg of r.output) {
      if (msg.type === "message") {
        if (msg.content && msg.content[0] && msg.content[0].text) {
          txt += msg.content[0].text;
        }
        // Check for tool calls in the message object
        if (msg.tool_calls) {
          msg.tool_calls.forEach((tc) => {
            toolCalls.push({
              id: tc.id,
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments),
            });
          });
        }
      } else if (msg.type === "reasoning") {
        reason =
          msg.summary && msg.summary[0] && msg.summary[0].text
            ? msg.summary[0].text
            : "";
      } else if (msg.type === "function_call") {
        // Assuming structure if it exists separately
        if (msg.items) {
          // openai style
          msg.items.forEach((tc) => {
            toolCalls.push({
              id: tc.id,
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments),
            });
          });
        } else {
          // ark style
          toolCalls.push({
            id: msg.call_id,
            name: msg.name,
            args: JSON.parse(msg.arguments),
          });
        }
      }
    }

    const generations = [
      {
        text: txt,
        message: new AIMessage({
          content: txt,
          tool_calls: toolCalls,
          additional_kwargs: { reason, raw: r },
        }),
      },
    ];

    return {
      generations,
    };
  }

  async invokeBrowser(body) {
    if (!this.baseURL) {
      throw new Error("缺少 BASE_URL，请在 AI Debug Panel 中配置");
    }
    if (!this.model) {
      throw new Error("缺少 MODEL，请在 AI Debug Panel 中配置");
    }
    const headers = {
      "Content-Type": "application/json",
      "x-debug-base-url": this.baseURL,
    };
    if (this.apiKey && this.apiKey !== SERVER_DEFAULT_VALUE) {
      headers["x-debug-api-key"] = this.apiKey;
    }
    const response = await fetch("/api/ai/llm/ark/responses", {
      body: JSON.stringify(body),
      headers,
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`Ark请求失败: ${response.status} ${await response.text()}`);
    }
    return response.json();
  }
}

module.exports = { ChatArk };