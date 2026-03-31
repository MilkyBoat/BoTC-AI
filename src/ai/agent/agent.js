
const { HumanMessage, ToolMessage } = require("@langchain/core/messages");
const {
  BaseChatModel,
} = require("@langchain/core/language_models/chat_models");
const { createLlm } = require("./llm/llmFactory");
const { createStorytellerLlm } = require("./storytellerLlm");
const { renderStateTable } = require("../game/state");
const { createGameTools } = require("./tools");

class ReActAgent {
  constructor({
    llm,
    state,
    interaction,
    script,
    createGameToolsImpl = createGameTools,
    createStorytellerLlmImpl = createStorytellerLlm,
    debugAdapter = null,
    recordImpl = () => {},
    renderStateTableImpl = renderStateTable,
  }) {
    this.state = state;
    this.interaction = interaction;
    this.script = script;
    this.record = recordImpl;
    this.renderStateTable = renderStateTableImpl;
    this.createStorytellerLlm = createStorytellerLlmImpl;
    this.debugAdapter = debugAdapter;
    this.model =
      llm instanceof BaseChatModel || typeof llm?.bindTools === "function"
        ? llm
        : createLlm();
    this.tools = createGameToolsImpl({
      debugAdapter,
      interaction,
      recordImpl,
      renderStateTableImpl,
      state,
    });
    this.runnable = null;
    this.messages = [];
  }

  async init() {
    const helper = this.createStorytellerLlm();
    this.messages = helper.buildInitialMessages({
      stateText: this.renderStateTable(this.state),
      script: this.script,
    });
    this.runnable = this.model.bindTools(this.tools);
  }

  async loop() {
    if (!this.runnable) {
      await this.init();
    }

    this.record("info", "Agent 启动游戏循环...");
    this.messages.push(new HumanMessage("游戏开始。请按照流程主持首个夜晚。"));

    let gameEnded = false;

    try {
      while (!gameEnded) {
        const result = await this.runnable.invoke(this.messages);
        this.messages.push(result);

        if (result.tool_calls && result.tool_calls.length > 0) {
          this.record("tool", "工具调用:");
          for (const call of result.tool_calls) {
            this.record("tool", `- ${call.name} ${JSON.stringify(call.args)}`);
            const tool = this.tools.find((item) => item.name === call.name);
            let output = "";
            if (tool) {
              try {
                output = await tool.invoke(call.args);
              } catch (error) {
                output = `Error: ${error.message}`;
              }
            } else {
              output = `Error: Tool ${call.name} not found`;
            }

            this.messages.push(
              new ToolMessage({
                content:
                  typeof output === "string" ? output : JSON.stringify(output),
                tool_call_id: call.id,
                name: call.name,
              }),
            );

            if (
              call.name === "grimoire_tool" &&
              call.args.command_type === "game_over"
            ) {
              gameEnded = true;
            }
          }
        } else {
          const text = result.content;
          this.record("llm", `AI: ${text}`);

          if (String(text || "").includes("GAME_OVER")) {
            gameEnded = true;
          } else {
            this.messages.push(
              new HumanMessage(
                "请继续。如果需要玩家操作，请使用message_tool的ask命令。如果不需要，请推进流程。",
              ),
            );
          }
        }
      }
    } catch (error) {
      this.record("error", `Agent Loop Error: ${error.message}`);
      console.error(error);
    }
  }
}

module.exports = { ReActAgent };