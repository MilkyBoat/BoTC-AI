const DEVELOPMENT_RELAY_URL = "ws://127.0.0.1:8081/";

const unavailable = (message) => ({
  available: false,
  url: "",
  message,
});

/**
 * 解析构建期会话中继配置。生产和测试环境缺少配置时必须保持关闭，
 * 只有开发环境可以使用仅绑定本机的安全默认值。
 */
export const resolveSessionRelayConfig = ({
  configuredUrl,
  environment,
} = {}) => {
  const value = typeof configuredUrl === "string" ? configuredUrl.trim() : "";

  if (!value) {
    if (environment === "development") {
      return {
        available: true,
        url: DEVELOPMENT_RELAY_URL,
        message: "",
      };
    }
    return unavailable("当前构建未配置会话中继");
  }

  try {
    const url = new URL(value);
    if (
      !["ws:", "wss:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return unavailable("会话中继配置无效");
    }
    if (!url.pathname.endsWith("/")) url.pathname += "/";

    return {
      available: true,
      url: url.toString(),
      message: "",
    };
  } catch (_error) {
    return unavailable("会话中继配置无效");
  }
};

export const getSessionRelayConfig = () =>
  resolveSessionRelayConfig({
    configuredUrl: process.env.VUE_APP_SESSION_RELAY_URL,
    environment: process.env.NODE_ENV,
  });
