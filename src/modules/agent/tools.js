const { DynamicStructuredTool } = require('@langchain/core/tools')
const { z } = require('zod')
const { record } = require('../common/record')
const { renderStateTable } = require('../game/state')

/**
 * 创建游戏工具列表
 * @param {object} state - 游戏状态对象
 * @param {object} interaction - 交互对象
 * @returns {DynamicStructuredTool[]}
 */
function createGameTools(state, interaction) {
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
      command_type: z.enum(['ask', 'tell', 'broadcast']).describe("操作类型"),
      seat: z.number().optional().describe("目标座位号"),
      message: z.string().describe("消息内容")
    }),
    func: async ({ command_type, seat, message }) => {
      seat = Number(seat || 0)
      message = String(message || '')
      if (command_type === 'ask') {
        if (seat > 0) {
          const r = await interaction.questionForSeat(seat, message)
          record('response', `座位${r.seat} -> ${r.text}`)
          return `event: player_response, seat: ${r.seat}, text: ${r.text}`
        } else {
          while (true) {
            const r = await interaction.questionAny(msg)
            if (r.seat && r.seat > 0 && String(r.text || '').trim().length > 0) {
              record('response', `座位${r.seat} -> ${r.text}`)
              return `event: player_response, seat: ${r.seat}, text: ${r.text}`
            }
            record('info', '提示: 请按以下格式输入 "座位号 内容"')
          }
        }
      } else if (command_type === 'tell') {
        interaction.send(seat, message)
        return `event: tell, seat: ${seat}, text: ${message}`
      } else if (command_type === 'broadcast') {
        interaction.broadcast(message)
        return `event: broadcast, text: ${message}`
      }
      return `Error: Unknown command_type ${command_type}`
    }
  })

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
      command_type: z.enum(['replace_token', 'global_status', 'mark_death', 'set_character', 'game_over']).describe("操作类型"),
      seat: z.number().int().optional().describe("座位号,0表示全局状态"),
      tokens: z.array(z.string()).optional().describe("replace_token使用,替换的标记列表"),
      status: z.enum(['death', 'alive']).optional().describe("mark_death使用,玩家生死状态"),
      new_real: z.string().optional().describe("set_character使用,新的真实角色"),
      new_known: z.string().optional().describe("set_character使用,新的已知角色"),
      winner: z.string().optional().describe("game_over使用,游戏赢家"),
      reason: z.string().optional().describe("game_over使用,游戏结束原因")
    }),
    func: async ({ command_type, seat, tokens, status, new_real, new_known, winner, reason }) => {
      seat = Number(seat || 0)
      if (command_type === 'replace_token') {
        state.replaceTokens(seat, tokens)
        const snapshot = renderStateTable(state)
        record('state', snapshot)
        return `event: replace_token, seat: ${seat}, tokens: ${tokens || ''}`
      } else if (command_type === 'global_status') {
        state.replaceTokens(0, tokens)
        return `event: set_global_status, tokens: ${tokens || ''}`
      } else if (command_type === 'mark_death') {
        const st = String(status || '').toLowerCase()
        if (st === 'death') {
          state.kill(seat)
        } else if (st === 'alive') {
          state.revive(seat)
        }
        return `event: mark_death, seat: ${seat}, status: ${st}`
      } else if (command_type === 'set_character') {
        if (new_real) { state.setRealRole(seat, new_real) }
        if (new_known) { state.setKnownRole(seat, new_known) }
        return `event: set_character, seat: ${seat}, new_known: ${new_known || ''}, new_real: ${new_real || ''}`
      } else if (command_type === 'game_over') {
        const msg = reason ? `游戏结束，${winner}获胜: ${reason}` : `游戏结束，${winner}获胜`
        interaction.broadcast(msg)
        return `GAME_OVER: ${msg}`
      }
      return `Error: Unknown command_type ${command_type}`
    }
  })

  return [messageTool, grimoireTool]
}

module.exports = { createGameTools }
