import { hydrateBrowserConfigDefaults } from "./browserConfig";
import { getBrowserInteractionState } from "./browserInteraction";
import { getBrowserRecordEntries } from "./browserRecord";
import { createBrowserShellDependencies } from "./browserShellDependencies";

const { runStoryteller } = require("../runStoryteller");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const startBrowserStoryteller = async ({ existingSession } = {}) => {
  if (existingSession && existingSession.status === "running") {
    return {
      ...existingSession,
      reused: true,
    };
  }

  await hydrateBrowserConfigDefaults();
  const dependencies = createBrowserShellDependencies();
  await wait(400);

  const startedAt = existingSession?.startedAt || Date.now();
  const sessionId =
    existingSession?.sessionId || `browser-storyteller-${startedAt}`;

  dependencies.recordImpl("info", "浏览器端 AI 统一启动入口已接通");
  const runPromise = runStoryteller({
    customRules: "",
    debug: false,
    playerCount: 8,
    ...dependencies,
  }).catch((error) => {
    dependencies.recordImpl(
      "error",
      `浏览器端 AI 运行失败: ${String((error && error.message) || error)}`,
    );
    return null;
  });

  return {
    dependencies,
    interactionSubscriptions: getBrowserInteractionState().subscriptions,
    logCount: getBrowserRecordEntries().length,
    mode: "browser-real",
    runPromise,
    reused: false,
    sessionId,
    startedAt,
    status: "running",
  };
};

export const stopBrowserStoryteller = async ({ existingSession } = {}) => {
  await wait(50);

  existingSession?.dependencies?.recordImpl?.("info", "浏览器端 AI 已强制停止");

  return {
    interactionSubscriptions: getBrowserInteractionState().subscriptions,
    logCount: getBrowserRecordEntries().length,
    mode: existingSession?.mode || "browser-real",
    sessionId: null,
    startedAt: null,
    status: "stopped",
    stoppedAt: Date.now(),
  };
};