const { ChatArk } = require("./ark");
const { ChatClaude } = require("./claude");
const { getBrowserConfig } = require("../../runtime/browserConfig");

/**
 * 根据 LLM_PROVIDER 环境变量返回对应的 LLM 实例
 * LLM_PROVIDER=claude  → ChatClaude（Anthropic Claude）
 * LLM_PROVIDER=ark 或未设置 → ChatArk（字节跳动 Ark / OpenAI 兼容接口）
 */
function createLlm(opts = {}) {
  const browserConfig =
    typeof window !== "undefined" ? getBrowserConfig() : {};
  const provider = (
    opts.provider ||
    browserConfig.provider ||
    process.env.LLM_PROVIDER ||
    "ark"
  ).toLowerCase();
  if (provider === "claude") {
    return new ChatClaude({ ...browserConfig, ...opts, provider });
  }
  return new ChatArk({ ...browserConfig, ...opts, provider });
}

module.exports = { createLlm };
