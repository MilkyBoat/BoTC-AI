const { DynamicStructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const { renderStateTable } = require("../game/state");

function createGameTools({
  debugAdapter = null,
  interaction,
  recordImpl = () => {},
  renderStateTableImpl = renderStateTable,
  state,
}) {
  const messageTool = new DynamicStructuredTool({
    name: "message_tool",
    description: `用于与玩家进行消息交互。通过seat指定目标玩家座位号，通过message指定内容。
包含以下操作类型(command_type)：
- ask: 向特定座位或全体玩家提问并等待回复。
    额外参数: { "seat": number, "message": string }
    seat=0表示向全体提问等待任意玩家回复。
- tell: 向特定座位发送私密信息，不需要等待回复。
    额外参数: { "seat": number, "message": string }
- broadcast: 向全体玩家广播信息。
    额外参数: { "message": string }
`,
    schema: z.object({
      command_type: z.enum(["ask", "tell", "broadcast"]).describe("操作类型"),
      seat: z.number().optional().describe("目标座位号"),
      message: z.string().describe("消息内容"),
    }),
    func: async ({ command_type, seat, message }) => {
      const targetSeat = Number(seat || 0);
      const content = String(message || "");
      let resultText = "";
      if (command_type === "ask") {
        const response =
          targetSeat > 0
            ? await interaction.questionForSeat(targetSeat, content)
            : await interaction.questionAny(content);
        recordImpl("response", `座位${response.seat} -> ${response.text}`);
        resultText = `event: player_response, seat: ${response.seat}, text: ${response.text}`;
      } else if (command_type === "tell") {
        interaction.send(targetSeat, content);
        resultText = `event: tell, seat: ${targetSeat}, text: ${content}`;
      } else if (command_type === "broadcast") {
        interaction.broadcast(content);
        resultText = `event: broadcast, text: ${content}`;
      } else {
        resultText = `Error: Unknown command_type ${command_type}`;
      }
      debugAdapter?.recordToolCall?.({
        args: {
          command_type,
          message: content,
          seat: targetSeat,
        },
        commandType: command_type,
        result: resultText,
        toolName: "message_tool",
      });
      return resultText;
    },
  });

  const grimoireTool = new DynamicStructuredTool({
    name: "grimoire_tool",
    description: `用于维护魔典（游戏状态）。
包含以下操作类型(command_type):
- replace_token: 全量覆写某座位的全部标记(Token)。每次编辑一个玩家，会覆盖所有原数据，需要保留的部分token应当通过附加到tokens字段以重新写入。
    额外参数: { "seat": number, "tokens": string[] }
- global_status: 全量覆写全局状态，如昼夜、天数等。
    额外参数: { "tokens": string[] }
- mark_death: 标记某位玩家死亡或生还。
    额外参数: { "seat": number, "status": "death" | "alive" }
- set_character: 修改玩家的角色信息（已知角色或真实角色）。
    额外参数: { "seat": number, "new_real": string, "new_known": string }
- game_over: 结束游戏，并宣布善良阵营或邪恶阵营获胜。
    额外参数: { "winner": string, "reason": string }
`,
    schema: z.object({
      command_type: z
        .enum([
          "replace_token",
          "global_status",
          "mark_death",
          "set_character",
          "game_over",
        ])
        .describe("操作类型"),
      seat: z.number().int().optional().describe("座位号,0表示全局状态"),
      tokens: z.array(z.string()).optional().describe("replace_token使用,替换的标记列表"),
      status: z.enum(["death", "alive"]).optional().describe("mark_death使用,玩家生死状态"),
      new_real: z.string().optional().describe("set_character使用,新的真实角色"),
      new_known: z.string().optional().describe("set_character使用,新的已知角色"),
      winner: z.string().optional().describe("game_over使用,游戏赢家"),
      reason: z.string().optional().describe("game_over使用,游戏结束原因"),
    }),
    func: async ({
      command_type,
      seat,
      tokens,
      status,
      new_real,
      new_known,
      winner,
      reason,
    }) => {
      const targetSeat = Number(seat || 0);
      let resultText = "";
      if (command_type === "replace_token") {
        state.replaceTokens(targetSeat, tokens);
        resultText = `event: replace_token, seat: ${targetSeat}, tokens: ${tokens || ""}`;
      } else if (command_type === "global_status") {
        state.replaceTokens(0, tokens);
        resultText = `event: set_global_status, tokens: ${tokens || ""}`;
      } else if (command_type === "mark_death") {
        const nextStatus = String(status || "").toLowerCase();
        if (nextStatus === "death") {
          state.kill(targetSeat);
        } else if (nextStatus === "alive") {
          state.revive(targetSeat);
        }
        resultText = `event: mark_death, seat: ${targetSeat}, status: ${nextStatus}`;
      } else if (command_type === "set_character") {
        if (new_real) {
          state.setRealRole(targetSeat, new_real);
        }
        if (new_known) {
          state.setKnownRole(targetSeat, new_known);
        }
        resultText = `event: set_character, seat: ${targetSeat}, new_known: ${
          new_known || ""
        }, new_real: ${new_real || ""}`;
      } else if (command_type === "game_over") {
        const content = reason
          ? `游戏结束，${winner}获胜: ${reason}`
          : `游戏结束，${winner}获胜`;
        interaction.broadcast(content);
        resultText = `GAME_OVER: ${content}`;
      } else {
        resultText = `Error: Unknown command_type ${command_type}`;
      }
      const latestState = renderStateTableImpl(state);
      recordImpl("state", latestState);
      debugAdapter?.setLatestState?.(latestState);
      debugAdapter?.recordToolCall?.({
        args: {
          command_type,
          new_known,
          new_real,
          reason,
          seat: targetSeat,
          status,
          tokens,
          winner,
        },
        commandType: command_type,
        result: resultText,
        toolName: "grimoire_tool",
      });
      return resultText;
    },
  });

  return [messageTool, grimoireTool];
}

module.exports = { createGameTools };
