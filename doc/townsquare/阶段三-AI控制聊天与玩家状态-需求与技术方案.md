# 阶段三：AI 控制聊天与玩家状态（需求与技术方案）

## 1. 需求描述

### 1.1 目标

- AI 在主持人浏览器端运行，并可全自动执行动作
- AI 可控制聊天模块（广播 + 私聊）
- AI 可控制玩家状态模块（死亡、无票、角色、座位调整等）
- 所有动作由主持人端 Vuex 变更触发，并同步给玩家端

### 1.2 不做的事项

- 不实现半自动模式
- 不提供人工审批流程

## 2. 技术方案（细化到模块）

### 2.1 Action 规范

在前端定义统一 Action 结构（浏览器端可执行）：

- `type`：如 `chat.send`、`players.update`、`players.swap`、`players.move`、`session.nomination` 等
- `payload`：与 Vuex mutation 形状一致
- `reason`：AI 输出的理由文本（用于展示与日志）

### 2.2 Action 执行器

- 新增 `src/web/agent/actions/dispatcher.js`
  - 将 Action 映射为 Vuex mutation
  - 执行前做前置条件校验（例如 seat 是否存在）

- 新增 `src/web/agent/actions/registry.js`
  - 维护 Action 类型与执行函数映射

### 2.3 TownSquare 适配器

- `src/web/agent/adapters/townsquareAdapter.js`
  - 读取 TownSquare Vuex 快照，生成 AgentState
  - 把 Agent 输出动作映射为 Action 列表

### 2.4 聊天模块接入

- 复用阶段一的 `chat` module 与 socket 支持
- 新增 `chat.send` Action：
  - 广播：调用 `sendChatBroadcast`
  - 私聊：调用 `sendChatDirect`

### 2.5 玩家状态接入

- `players.update`、`players.swap`、`players.move`、`players.remove` 作为可执行 Action
- `session` 相关控制（提名、投票、夜晚/白天）可作为扩展 Action

### 2.6 日志与审计

- 新增 `src/web/agent/log`：记录 AI 动作、执行结果与失败原因
- UI 内展示最近执行的动作列表

## 3. 验收标准

- AI 能自动广播与私聊玩家
- AI 能修改玩家状态，并同步到所有玩家端
- 所有 AI 动作在主持人端可见日志
