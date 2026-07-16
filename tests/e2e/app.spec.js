const { test, expect } = require("@playwright/test");

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

test.describe("BotC-AI 本地页面", () => {
  test("加载首页并打开菜单，且不连接公共会话服务", async ({ page }) => {
    const blockedExternalRequests = [];
    const blockedExternalWebSockets = [];
    const webSockets = [];

    page.on("websocket", (socket) => webSockets.push(socket.url()));
    await page.routeWebSocket(/.*/, async (socket) => {
      const url = new URL(socket.url());
      if (LOCAL_HOSTS.has(url.hostname)) {
        socket.connectToServer();
        return;
      }
      blockedExternalWebSockets.push(url.href);
      await socket.close({ code: 1008, reason: "测试禁止外部 WebSocket" });
    });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (LOCAL_HOSTS.has(url.hostname)) {
        await route.continue();
        return;
      }
      blockedExternalRequests.push(url.href);
      await route.abort("blockedbyclient");
    });

    await page.goto("/");

    await expect(page).toHaveTitle("BotC-AI - 血染钟楼在线魔典");
    await expect(page.locator("#version")).toHaveText("v0.1.0");
    await expect(page.locator(".intro")).toContainText("Virtual Town Square");

    await page.locator(".menu > svg").click();
    await expect(page.locator(".menu")).toHaveClass(/open/);

    expect(
      webSockets.every((url) => LOCAL_HOSTS.has(new URL(url).hostname)),
    ).toBe(true);
    expect(blockedExternalWebSockets).toEqual([]);
    expect(
      blockedExternalRequests.some((url) =>
        url.includes("live.clocktower.online"),
      ),
    ).toBe(false);
  });
});
