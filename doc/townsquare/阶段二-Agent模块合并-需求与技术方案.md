# 阶段二：Agent 模块合并（需求与技术方案）

## 1. 需求描述

### 1.1 目标

- 将现有 Node 端的 Agent 逻辑合并为主持人网页端的内置模块
- 在主持人页面展示 Agent 的输出（文本、日志、建议），但不做能力对接
- 主持人端新增配置表单，输入 API_KEY 等配置并保存到 localStorage
- 调试阶段允许从 server .env 注入默认配置

### 1.2 不做的事项

- 不允许 Agent 直接修改游戏状态
- 不允许 Agent 发送聊天消息给玩家

## 2. 技术方案（细化到模块）

### 2.1 Agent 逻辑浏览器化

- 迁移/拆分现有模块：
  - `src/modules/agent/*` → `src/web/agent/*`
  - `src/modules/game/state.js` 的结构映射为前端可读状态对象
  - LLM SDK 选择：优先使用浏览器可用的 SDK 或封装 HTTP 请求

- 新增浏览器端入口：
  - `src/web/agent/index.js`：负责初始化、推理流程、输出汇总

### 2.2 主持人端输出展示

- 新增 UI：
  - `src/web/townsquare/components/AgentPanel.vue`
  - 显示：Agent 状态、输出文本、推理日志、建议摘要
  - 仅展示，不做 Action 执行

- `src/web/townsquare/components/Menu.vue`
  - Host 菜单中增加 “Agent” 面板入口

### 2.3 配置输入与持久化

- 新增配置模块：
  - `src/web/config/index.js`：读写 localStorage
  - `src/web/config/defaults.js`：读取注入的 .env 默认值

- 新增配置表单：
  - `src/web/config/ConfigPanel.vue`
  - Host-only 可见
  - 字段：API_KEY、Provider、Model、Temperature、MaxTokens

### 2.4 .env 默认配置（调试）

- Server 在开发模式注入 `window.__APP_CONFIG__`
- 前端读取默认值并在 UI 内展示为“默认值（调试）”

## 3. 验收标准

- Agent 模块在主持人端可运行并输出内容
- 主持人可输入 API_KEY 并持久化
- 刷新页面后配置仍存在
- Agent 仍不具备修改状态或聊天能力
