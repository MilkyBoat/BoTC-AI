const Anthropic = require("@anthropic-ai/sdk");
const {
  BaseChatModel,
} = require("@langchain/core/language_models/chat_models");
const { AIMessage } = require("@langchain/core/messages");
const {
  convertToOpenAITool,
} = require("@langchain/core/utils/function_calling");
const { RunnableBinding } = require("@langchain/core/runnables");
const { DEFAULT_TEMPERATURE } = require("../../common/const");
const { SERVER_DEFAULT_VALUE } = require("../../runtime/browserConfig");

/**
 * 将 LangChain BaseMessage[] 转换为 Anthropic messages 格式
 * - system 消息提取为独立字段
 * - 连续的 ToolMessage 合并到一个 user 消息的 content 数组中
 * - 连续的 HumanMessage 合并为一个 user 消息
 */
function toAnthropicMessages(messages) {
  let system = "";
  const result = [];

  for (const m of messages) {
    const type = m._getType();

    if (type === "system") {
      system +=
        (system ? "\n" : "") +
        (typeof m.content === "string" ? m.content : JSON.stringify(m.content));
      continue;
    }

    if (type === "tool") {
      const toolResult = {
        type: "tool_result",
        tool_use_id: m.tool_call_id,
        content:
          typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      };
      const last = result[result.length - 1];
      // 连续的 tool result 合并到同一个 user 消息
      if (
        last &&
        last.role === "user" &&
        Array.isArray(last.content) &&
        last.content[0]?.type === "tool_result"
      ) {
        last.content.push(toolResult);
      } else {
        result.push({ role: "user", content: [toolResult] });
      }
      continue;
    }

    if (type === "human") {
      const text =
        typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      const last = result[result.length - 1];
      // 连续的 human 消息合并
      if (last && last.role === "user" && typeof last.content === "string") {
        last.content += "\n" + text;
      } else {
        result.push({ role: "user", content: text });
      }
      continue;
    }

    if (type === "ai") {
      const content = [];
      const text = typeof m.content === "string" ? m.content : "";
      if (text) content.push({ type: "text", text });
      if (m.tool_calls && m.tool_calls.length > 0) {
        for (const tc of m.tool_calls) {
          content.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.args || {},
          });
        }
      }
      result.push({
        role: "assistant",
        content: content.length > 0 ? content : text || "",
      });
      continue;
    }
  }

  return { system, messages: result };
}

class ChatClaude extends BaseChatModel {
  constructor(fields = {}) {
    super(fields);
    this.model =
      fields.model || process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
    this.apiKey =
      fields.apiKey ||
      process.env.CLAUDE_API_KEY ||
      process.env.ANTHROPIC_API_KEY;
    const clientOpts = { apiKey: this.apiKey };
    if (fields.baseURL || process.env.CLAUDE_BASE_URL) {
      clientOpts.baseURL = fields.baseURL || process.env.CLAUDE_BASE_URL;
    }
    this.baseURL =
      fields.baseURL || process.env.CLAUDE_BASE_URL || "https://api.anthropic.com";
    this.client =
      typeof window === "undefined" ? new Anthropic.default(clientOpts) : null;
  }

  _llmType() {
    return "claude";
  }

  bindTools(tools, kwargs) {
    return this.bind({ tools: tools.map(convertToOpenAITool), ...kwargs });
  }

  bind(kwargs) {
    return new RunnableBinding({ bound: this, kwargs });
  }

  async _generate(messages, options) {
    const { system, messages: anthropicMsgs } = toAnthropicMessages(messages);

    // 将 OpenAI function calling 格式的工具转换为 Anthropic 格式
    let anthropicTools;
    if (options.tools && options.tools.length > 0) {
      anthropicTools = options.tools.map((tool) => {
        const fn = tool.function || tool;
        return {
          name: fn.name,
          description: fn.description || "",
          input_schema: fn.parameters || { type: "object", properties: {} },
        };
      });
    }

    // 为最后一个 user 消息添加前缀缓存标记（缓存整段对话历史）
    const lastUser = [...anthropicMsgs]
      .reverse()
      .find((m) => m.role === "user");
    if (lastUser) {
      if (typeof lastUser.content === "string") {
        lastUser.content = [
          {
            type: "text",
            text: lastUser.content,
            cache_control: { type: "ephemeral" },
          },
        ];
      } else if (
        Array.isArray(lastUser.content) &&
        lastUser.content.length > 0
      ) {
        const last = lastUser.content[lastUser.content.length - 1];
        if (!last.cache_control) last.cache_control = { type: "ephemeral" };
      }
    }

    const payload = {
      model: this.model,
      max_tokens: 8192,
      temperature: DEFAULT_TEMPERATURE,
      system: system
        ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
        : undefined,
      messages: anthropicMsgs,
      tools: anthropicTools,
    };
    const r =
      typeof window === "undefined"
        ? await this.client.messages.create(payload)
        : await this.invokeBrowser(payload);

    let txt = "";
    let reason = "";
    const toolCalls = [];

    for (const block of r.content) {
      if (block.type === "text") {
        txt += block.text;
      } else if (block.type === "thinking") {
        reason = block.thinking;
      } else if (block.type === "tool_use") {
        toolCalls.push({ id: block.id, name: block.name, args: block.input });
      }
    }

    return {
      generations: [
        {
          text: txt,
          message: new AIMessage({
            content: txt,
            tool_calls: toolCalls,
            additional_kwargs: { reason, raw: r },
          }),
        },
      ],
    };
  }

  async invokeBrowser(payload) {
    if (!this.model) {
      throw new Error("缺少 Claude Model，请在 AI Debug Panel 中配置");
    }
    const headers = {
      "content-type": "application/json",
      "x-debug-base-url": this.baseURL,
    };
    if (this.apiKey && this.apiKey !== SERVER_DEFAULT_VALUE) {
      headers["x-debug-api-key"] = this.apiKey;
    }
    const response = await fetch("/api/ai/llm/claude/messages", {
      body: JSON.stringify(payload),
      headers,
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(
        `Claude请求失败: ${response.status} ${await response.text()}`,
      );
    }
    return response.json();
  }
}

module.exports = { ChatClaude };
