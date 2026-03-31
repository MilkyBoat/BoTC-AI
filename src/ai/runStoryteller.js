
const { AgentState, renderStateTable } = require("./game/state");
const { ReActAgent } = require("./agent/agent");

function getDefaultPrompt() {
  return require("./utils/console").prompt;
}

function getDefaultRecord() {
  return require("./common/record").record;
}

function createDefaultInteraction() {
  const { Interaction } = require("./game/interaction");
  return new Interaction();
}

function createDefaultLlm(llmConfig) {
  return require("./agent/llm/llmFactory").createLlm(llmConfig);
}

function getDefaultSelectScript() {
  return require("./game/scriptLoader").selectAndLoadScript;
}

function getScriptName(scriptData) {
  if (Array.isArray(scriptData)) {
    const meta = scriptData.find((item) => item && item.id === "_meta");
    return meta?.name || "";
  }
  return scriptData?.name || "";
}

async function defaultAllocateRoles(params) {
  const { RoleAllocAgent } = require("./agent/roleAllocAgent");
  const allocator = new RoleAllocAgent();
  return allocator.allocate(params);
}

async function runStoryteller(options = {}) {
  const debug = true; // todo: 临时调试
  const playerCount = Number(options.playerCount ?? 8);
  const promptImpl = options.promptImpl || getDefaultPrompt();
  const recordImpl = options.recordImpl || getDefaultRecord();
  const interactionFactory = options.createInteraction || createDefaultInteraction;
  const llmConfig = options.llmConfig || {};
  const llmFactory = options.createLlm || (() => createDefaultLlm(llmConfig));
  const selectScript = options.selectScript || getDefaultSelectScript();
  const allocateRoles = options.allocateRoles || defaultAllocateRoles;
  const debugAdapter = options.debugAdapter || null;

  recordImpl("info", "开始运行 AI 说书人");

  const scriptData = await selectScript({ debug });
  if (!scriptData) return null;

  recordImpl("info", `已选择脚本: ${getScriptName(scriptData)}`);

  let customRules = String(options.customRules || "");
  if (!customRules && !debug) {
    customRules = await promptImpl("请输入分配风格或自定义规则(回车跳过): ");
  }

  let allocation = null;
  try {
    allocation = await allocateRoles({
      debug,
      playerCount,
      script: scriptData,
      customRules,
    });
  } catch (error) {
    recordImpl("error", `角色分配失败: ${String((error && error.message) || error)}`);
    return null;
  }

  const state = new AgentState({
    players: (allocation && allocation.players) || [],
  });
  const interaction = interactionFactory();
  const llm = llmFactory();
  const agent = new ReActAgent({
    debugAdapter,
    llm,
    state,
    interaction,
    recordImpl,
    script: scriptData,
  });

  const initialStateText = renderStateTable(state);
  recordImpl("state", initialStateText);
  debugAdapter?.setLatestState?.(initialStateText);
  await agent.loop(50);

  return {
    agent,
    allocation,
    interaction,
    llm,
    script: scriptData,
    state,
  };
}

module.exports = { runStoryteller };