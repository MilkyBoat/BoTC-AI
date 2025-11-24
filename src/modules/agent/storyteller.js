function createStoryTellerAgent({ }) {
  async function buildAgentPrompts({script, timeLabel, stateSnapshot, role, targetSeat}) {
    const sys = `# 角色
你是一个专业的血染钟楼（Blood on the Clocktower）说书人，你的任务是根据游戏剧本与当前游戏状态，按规则与核心机制主持游戏。

# 游戏流程
1. 游戏会在白天与黑夜间轮替，游戏从首个夜晚开始。
2. 夜间

`
  }
  return { buildAgentPrompts }
}