import { resolveSessionRelayConfig } from "@/config/sessionRelay";

describe("会话中继配置", () => {
  test("开发环境未配置时只使用本机中继", () => {
    expect(resolveSessionRelayConfig({ environment: "development" })).toEqual({
      available: true,
      url: "ws://127.0.0.1:8081/",
      message: "",
    });
  });

  test("生产环境未配置时禁用在线会话", () => {
    expect(resolveSessionRelayConfig({ environment: "production" })).toEqual({
      available: false,
      url: "",
      message: "当前构建未配置会话中继",
    });
  });

  test("规范化显式配置并保留受控路径", () => {
    expect(
      resolveSessionRelayConfig({
        environment: "production",
        configuredUrl: "  wss://relay.example.test/botc  ",
      }),
    ).toEqual({
      available: true,
      url: "wss://relay.example.test/botc/",
      message: "",
    });
  });

  test.each([
    "https://relay.example.test",
    "wss://user:secret@relay.example.test",
    "wss://relay.example.test?token=secret",
    "wss://relay.example.test/#room",
    "not-a-url",
  ])("拒绝不安全或无效的显式配置：%s", (configuredUrl) => {
    expect(
      resolveSessionRelayConfig({
        environment: "production",
        configuredUrl,
      }),
    ).toEqual({
      available: false,
      url: "",
      message: "会话中继配置无效",
    });
  });
});
