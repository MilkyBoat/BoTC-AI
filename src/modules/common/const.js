
// 游戏常量配置
// debug阵容
exports.DEBUG_PANEL = { players: [
        { seat: 1, knownRole: '红唇女郎', realRole: '红唇女郎', tokens: [] },
        { seat: 2, knownRole: '猎手', realRole: '猎手', tokens: [] },
        { seat: 3, knownRole: '送葬者', realRole: '送葬者', tokens: [] },
        { seat: 4, knownRole: '间谍', realRole: '间谍', tokens: [] },
        { seat: 5, knownRole: '贞洁者', realRole: '贞洁者', tokens: [] },
        { seat: 6, knownRole: '厨师', realRole: '厨师', tokens: [] },
        { seat: 7, knownRole: '男爵', realRole: '男爵', tokens: [] },
        { seat: 8, knownRole: '共情者', realRole: '酒鬼', tokens: ['是酒鬼'] },
        { seat: 9, knownRole: '小恶魔', realRole: '小恶魔', tokens: [] },
        { seat: 10, knownRole: '守鸦人', realRole: '守鸦人', tokens: [] },
        { seat: 11, knownRole: '调查员', realRole: '调查员', tokens: [] },
        { seat: 12, knownRole: '镇长', realRole: '镇长', tokens: [] },
        { seat: 13, knownRole: '圣徒', realRole: '圣徒', tokens: [] }
      ] }

// 角色配比表：根据玩家数量确定各类角色数量
exports.ROLE_RATIO = {
  5: { townsfolk: 3, outsider: 0, minion: 1, demon: 1 },
  6: { townsfolk: 3, outsider: 1, minion: 1, demon: 1 },
  7: { townsfolk: 5, outsider: 0, minion: 1, demon: 1 },
  8: { townsfolk: 5, outsider: 1, minion: 1, demon: 1 },
  9: { townsfolk: 5, outsider: 2, minion: 1, demon: 1 },
  10: { townsfolk: 7, outsider: 0, minion: 2, demon: 1 },
  11: { townsfolk: 7, outsider: 1, minion: 2, demon: 1 },
  12: { townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
  13: { townsfolk: 9, outsider: 0, minion: 3, demon: 1 },
  14: { townsfolk: 9, outsider: 1, minion: 3, demon: 1 },
  15: { townsfolk: 9, outsider: 2, minion: 3, demon: 1 }
}