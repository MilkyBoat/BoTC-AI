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

  test("房主建房与 Hash 玩家加入只使用本地中继", async ({ browser }) => {
    const hostContext = await browser.newContext({
      permissions: ["clipboard-write"],
    });
    const playerContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();
    const observedWebSockets = [];
    const blockedExternalWebSockets = [];
    const blockedExternalRequests = [];

    const guardTraffic = async (page) => {
      page.on("websocket", (socket) => observedWebSockets.push(socket.url()));
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
    };

    await guardTraffic(hostPage);
    await guardTraffic(playerPage);
    await hostPage.goto("/");
    await hostPage.locator("#app").focus();

    hostPage.once("dialog", (dialog) => dialog.accept("Alice"));
    await hostPage.keyboard.press("a");

    hostPage.once("dialog", (dialog) => dialog.accept("Local Room"));
    const hostSocketPromise = hostPage.waitForEvent("websocket", {
      predicate: (socket) => new URL(socket.url()).port === "8081",
    });
    await hostPage.keyboard.press("h");
    const hostSocket = await hostSocketPromise;

    const playerSocketPromise = playerPage.waitForEvent("websocket", {
      predicate: (socket) => new URL(socket.url()).port === "8081",
    });
    await playerPage.goto("/#localroom");
    const playerSocket = await playerSocketPromise;

    expect(hostSocket.url()).toBe("ws://127.0.0.1:8081/localroom/host");
    expect(playerSocket.url()).toMatch(
      /^ws:\/\/127\.0\.0\.1:8081\/localroom\/[a-z0-9]+$/,
    );
    await expect(
      playerPage.locator(".player").filter({ hasText: "Alice" }),
    ).toBeVisible();
    expect(blockedExternalWebSockets).toEqual([]);
    expect(
      blockedExternalRequests.some((url) => url.includes("clocktower.online")),
    ).toBe(false);
    expect(
      observedWebSockets.every((url) => LOCAL_HOSTS.has(new URL(url).hostname)),
    ).toBe(true);

    await hostContext.close();
    await playerContext.close();
  });

  test("恢复本地存储中的旧会话时不连接公共服务", async ({ page }) => {
    const webSockets = [];
    const blockedExternalRequests = [];
    await page.addInitScript(() => {
      localStorage.setItem("session", JSON.stringify([false, "Stored Room"]));
    });
    page.on("websocket", (socket) => webSockets.push(socket.url()));
    await page.routeWebSocket(/.*/, async (socket) => {
      const url = new URL(socket.url());
      if (!LOCAL_HOSTS.has(url.hostname)) {
        await socket.close({ code: 1008, reason: "测试禁止外部 WebSocket" });
        return;
      }
      socket.connectToServer();
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

    const socketPromise = page.waitForEvent("websocket", {
      predicate: (socket) => new URL(socket.url()).port === "8081",
    });
    await page.goto("/");
    const socket = await socketPromise;

    expect(socket.url()).toBe("ws://127.0.0.1:8081/storedroom/host");
    expect(
      webSockets.every((url) => LOCAL_HOSTS.has(new URL(url).hostname)),
    ).toBe(true);
    expect(
      blockedExternalRequests.some((url) => url.includes("clocktower.online")),
    ).toBe(false);
  });
});
