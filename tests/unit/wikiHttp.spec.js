const { createHttpClient } = require("../../scripts/wiki-sync/http");

const response = ({ status = 200, body = "ok", headers = {}, url } = {}) => ({
  status,
  url: url || "https://clocktower-wiki.gstonegames.com/page",
  headers: new Headers(headers),
  arrayBuffer: async () => Buffer.from(body),
});

describe("Wiki 受限 HTTP 客户端", () => {
  test("按 Retry-After 重试限流并携带明确 User-Agent", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        response({ status: 429, headers: { "retry-after": "2" } }),
      )
      .mockResolvedValueOnce(response({ body: "done" }));
    const sleep = jest.fn().mockResolvedValue();
    const client = createHttpClient({
      fetchImpl,
      sleep,
      request: {
        userAgent: "ClocktowerKnowledgeSync/Test",
        minIntervalMs: 1000,
        timeoutMs: 5000,
        retries: 2,
        maxResponseBytes: 1024,
      },
    });

    await expect(
      client.getText("https://clocktower-wiki.gstonegames.com/page"),
    ).resolves.toMatchObject({ status: 200, body: "done" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1].headers["User-Agent"]).toBe(
      "ClocktowerKnowledgeSync/Test",
    );
    expect(sleep).toHaveBeenCalledWith(2000, undefined);
  });

  test("拒绝跨域重定向和超出上限的响应", async () => {
    const redirected = createHttpClient({
      fetchImpl: jest.fn().mockResolvedValue(
        response({
          url: "https://evil.example/page",
          body: "moved",
        }),
      ),
      sleep: jest.fn(),
      allowedOrigins: ["https://clocktower-wiki.gstonegames.com"],
      request: {
        userAgent: "ClocktowerKnowledgeSync/Test",
        minIntervalMs: 0,
        timeoutMs: 5000,
        retries: 0,
        maxResponseBytes: 1024,
      },
    });
    await expect(
      redirected.getText("https://clocktower-wiki.gstonegames.com/page"),
    ).rejects.toThrow(/跨域重定向/);

    const oversized = createHttpClient({
      fetchImpl: jest.fn().mockResolvedValue(response({ body: "too large" })),
      sleep: jest.fn(),
      request: {
        userAgent: "ClocktowerKnowledgeSync/Test",
        minIntervalMs: 0,
        timeoutMs: 5000,
        retries: 0,
        maxResponseBytes: 3,
      },
    });
    await expect(
      oversized.getText("https://clocktower-wiki.gstonegames.com/page"),
    ).rejects.toThrow(/响应体超过上限/);
  });
});
