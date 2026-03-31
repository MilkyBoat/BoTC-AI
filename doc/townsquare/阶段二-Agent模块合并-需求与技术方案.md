# 阶段二：Agent 模块合并（需求与技术方案）

## 1. 需求描述

### 1.1 本期目标

- 将 `townsquare/` 的 Web 能力并入当前仓库主工程，使当前项目以 Vue 主持人网页端作为主入口
- 将当前 AI 的 CLI 入口 [main.js](file:///Users/bytedance/code/github/blood_on_clocktower_ai/src/main.js) 从“直接在 Node 里启动”改造成“由主持人浏览器点击按钮触发启动”的浏览器端运行时
- 在右上角菜单栏新增一个 AI 专用 Tab，名称为“AI说书人”
- “AI说书人”Tab 的第一个菜单项为“启动AI说书”，点击后启动 Agent
- Agent 启动后必须保证单例；当 Agent 正在运行时，启动入口禁用并显示“正在运行”
- 当 AI 调用 `message_tool` 时，底层不再走命令行交互，而是以“说书人”身份写入聊天模块
- 当 AI 调用 `grimoire_tool` 时，底层不再直接驱动 TownSquare 魔典，而是在一个半屏、半透明的 debug panel 中显示工具调用记录和最新状态快照
- [record.js](file:///Users/bytedance/code/github/blood_on_clocktower_ai/src/modules/common/record.js) 在主持人浏览器端运行时不再写日志文件，只输出到浏览器 console
- 继续保留主持人端配置能力：API_KEY 等参数支持浏览器输入并存入 localStorage，开发调试时允许读取 `.env` 默认值

### 1.2 本期边界

- 本期不实现 AI Agent 状态图与 TownSquare 当前 Vuex 状态的双向同步
- 本期不让 `grimoire_tool` 直接修改 TownSquare 的玩家状态、昼夜状态、投票状态或 socket 同步数据
- 本期不实现半自动审批、人类监督回放和人工确认流
- 本期不实现玩家端 AI UI，仅主持人端可见
- 本期以“Web 内置运行 + UI 挂接 + 调试可视化”打通链路为主，不处理完整游戏自动托管

### 1.3 需求拆解

#### 1.3.1 工程合并

- 当前仓库主工程需要吸收 `townsquare/` 的 Vue2、Vuex、静态资源、WebSocket 会话与 UI 结构
- 合并后根目录 `package.json` 负责统一依赖与脚本
- 合并后根目录 `src/main.js` 应作为 Vue 应用入口；当前 Node CLI 版说书人启动逻辑需要迁移到新的浏览器运行时模块

#### 1.3.2 AI 启动入口

- 入口位置：右上角现有菜单栏内新增 AI Tab
- Tab 名称：`AI说书人`
- 首个菜单项：`启动AI说书`
- 启动行为：
  - 仅主持人可见
  - 未运行时可点击
  - 启动中/运行中不可重复点击
  - 文案状态至少包含：未启动、启动中、正在运行、运行失败

#### 1.3.3 聊天接入

- `message_tool` 需要脱离 [interaction.js](file:///Users/bytedance/code/github/blood_on_clocktower_ai/src/modules/game/interaction.js) 的命令行输入输出模型
- 广播、私聊、提问都统一接入 TownSquare 聊天模块
- 发送身份为“说书人”，展示层可沿用主持人高亮样式，但语义上归属于 AI 说书人
- 本期只要求 AI → 聊天模块的下行链路；是否等待玩家回复由浏览器端交互适配器控制

#### 1.3.4 Debug Panel

- `grimoire_tool` 的所有调用都写入主持人端 debug panel
- debug panel 形态：
  - 半屏宽度
  - 半透明悬浮层
  - 仅主持人可见
  - 可展示最近调用记录和当前最新状态快照
- 展示内容：
  - 调用时间
  - 工具名
  - `command_type`
  - 请求参数
  - 执行结果
  - 最新一份 Agent 侧状态快照

#### 1.3.5 浏览器日志

- `record` 在浏览器端不再创建 `logs/` 文件夹或写本地文件
- 主持人浏览器中统一输出到 `console.log` / `console.error`
- Node 侧能力保留与否属于实现细节，但阶段二验收口径只要求主持人浏览器端行为正确

## 2. 现状分析

### 2.1 当前 AI 工程现状

- [main.js](file:///Users/bytedance/code/github/blood_on_clocktower_ai/src/main.js) 是单文件 CLI 入口，负责：
  - 选择剧本
  - 分配角色
  - 初始化 `AgentState`
  - 启动 `ReActAgent`
- [tools.js](file:///Users/bytedance/code/github/blood_on_clocktower_ai/src/modules/agent/tools.js) 中：
  - `message_tool` 依赖 `Interaction`
  - `grimoire_tool` 直接操作 Agent 自身的 `AgentState`
- [record.js](file:///Users/bytedance/code/github/blood_on_clocktower_ai/src/modules/common/record.js) 当前面向 Node 日志落盘

### 2.2 当前 TownSquare 工程现状

- Vue 入口位于 [townsquare/src/main.js](file:///Users/bytedance/code/github/blood_on_clocktower_ai/townsquare/src/main.js)
- 页面根组件位于 [App.vue](file:///Users/bytedance/code/github/blood_on_clocktower_ai/townsquare/src/App.vue)
- 右上角菜单位于 [Menu.vue](file:///Users/bytedance/code/github/blood_on_clocktower_ai/townsquare/src/components/Menu.vue)
- 聊天面板位于 [ChatPanel.vue](file:///Users/bytedance/code/github/blood_on_clocktower_ai/townsquare/src/components/ChatPanel.vue)
- 聊天状态位于 [chat.js](file:///Users/bytedance/code/github/blood_on_clocktower_ai/townsquare/src/store/modules/chat.js)
- AI 聊天公开接口位于 [api.js](file:///Users/bytedance/code/github/blood_on_clocktower_ai/townsquare/src/chat/api.js)

### 2.3 阶段二的关键落点

- 不是“把 Node 脚本嵌到页面里”，而是把当前 Agent 编排层抽成浏览器可调用的运行时
- 不是“立刻接管 TownSquare 状态”，而是先把 AI 的启动入口、聊天出口、调试出口接到 Vue 页面
- 不是“仅新增一个按钮”，而是完成主工程入口迁移、UI 接入、运行时约束与日志适配

## 3. 技术方案

### 3.1 合并策略

#### 3.1.1 主入口调整

- 根目录主工程改为 Vue 应用主入口
- `townsquare/src/main.js` 的职责合并到根目录新的 `src/main.js`
- 当前 CLI 版 [main.js](file:///Users/bytedance/code/github/blood_on_clocktower_ai/src/main.js) 不再作为应用入口文件存在，其编排逻辑拆分到新的浏览器运行时模块

#### 3.1.2 目录归位建议

- TownSquare UI 与 store 合并到根目录 `src/`
- 现有 AI 逻辑保留在 `src/modules/` 基础上继续演进，但要新增 browser adapter 层
- 迁移完成后，`townsquare/` 目录只作为过渡参考；在完整验证通过后删除

#### 3.1.3 依赖合并

- 根目录 `package.json` 吸收 Vue2、Vuex、FontAwesome、sass、vue-template-compiler 等前端依赖
- 保留现有 `langchain`、`openai`、`@anthropic-ai/sdk` 等 AI 依赖
- 根目录 scripts 需要同时覆盖：
  - 本地开发启动
  - Web 构建
  - lint

### 3.2 Agent 浏览器化改造

#### 3.2.1 运行时拆分

- 将当前 [main.js](file:///Users/bytedance/code/github/blood_on_clocktower_ai/src/main.js) 的 `run()` 拆分为三个职责：
  - `createStorytellerRuntime`：组装依赖
  - `startStoryteller`：执行一次启动流程
  - `storytellerRuntimeStoreAdapter`：对接 Vuex / 聊天 / debug panel / 浏览器配置

#### 3.2.2 浏览器替换项

- `prompt` 替换为浏览器配置面板和预置参数
- `Interaction` 替换为 TownSquare 交互适配器
- `record` 替换为浏览器 console 输出与 UI 日志分发
- `scriptLoader` 替换为浏览器可读取的剧本来源；可优先从现有脚本数据或前端已加载剧本中选择

#### 3.2.3 单例约束

- 增加 Storyteller Runtime 状态机：
  - `idle`
  - `starting`
  - `running`
  - `error`
  - `stopped`
- 入口按钮的可点击性完全由该状态机驱动
- 运行中再次点击时不重新创建 Agent 实例

### 3.3 UI 方案

#### 3.3.1 菜单 Tab 扩展

- 在 [Menu.vue](file:///Users/bytedance/code/github/blood_on_clocktower_ai/townsquare/src/components/Menu.vue) 的顶部 tab 区增加一个 AI Tab
- AI Tab 的 headline 为 `AI说书人`
- 第一项菜单为 `启动AI说书`
- 同区块可继续容纳：
  - 当前运行状态
  - 配置入口
  - debug panel 显隐入口

#### 3.3.2 Debug Panel 位置

- 在 [App.vue](file:///Users/bytedance/code/github/blood_on_clocktower_ai/townsquare/src/App.vue) 根层挂载新的 debug panel 组件
- 面板采用 fixed 浮层，不挤占现有圆桌布局
- 推荐默认停靠在右半屏，与左侧聊天面板错开

### 3.4 工具适配方案

#### 3.4.1 `message_tool`

- 将 [tools.js](file:///Users/bytedance/code/github/blood_on_clocktower_ai/src/modules/agent/tools.js) 中 `message_tool` 的底层调用改为浏览器聊天适配器
- 映射关系：
  - `broadcast` → 聊天模块广播消息
  - `tell` → 聊天模块私聊消息
  - `ask` → 发送提问消息，并由浏览器交互层等待消息回流
- 展示身份统一为“说书人”

#### 3.4.2 `grimoire_tool`

- 保留工具协议与 Agent 内部状态更新逻辑
- 取消本期对 TownSquare Vuex 的直接写入
- 每次调用后输出两类信息到 debug panel：
  - 调用记录
  - 最新 `renderStateTable(state)` 结果

#### 3.4.3 `record`

- 在浏览器上下文提供 `record` 适配层
- 行为：
  - 输出到 console
  - 同时可向 debug store 追加结构化日志
- 本期不做文件落盘

### 3.5 配置方案

- 浏览器配置优先级保持为：`localStorage > .env 默认值 > 空值`
- 配置面板仍为主持人专属
- 阶段二至少保证以下参数在浏览器可读：
  - API Key
  - Provider
  - Model
  - Temperature
  - Max Tokens

## 4. 模块与文件改造清单

### 4.1 根工程与构建层

- 改造 [package.json](file:///Users/bytedance/code/github/blood_on_clocktower_ai/package.json)
- 参考 [townsquare/package.json](file:///Users/bytedance/code/github/blood_on_clocktower_ai/townsquare/package.json)
- 改造根目录 `src/main.js` 作为 Vue 入口

### 4.2 TownSquare UI 层

- 改造 [App.vue](file:///Users/bytedance/code/github/blood_on_clocktower_ai/townsquare/src/App.vue)
- 改造 [Menu.vue](file:///Users/bytedance/code/github/blood_on_clocktower_ai/townsquare/src/components/Menu.vue)
- 复用并扩展 [ChatPanel.vue](file:///Users/bytedance/code/github/blood_on_clocktower_ai/townsquare/src/components/ChatPanel.vue)
- 新增建议组件：
  - `src/components/ai/AIDebugPanel.vue`
  - `src/components/ai/AIConfigPanel.vue`

### 4.3 Vuex / 状态层

- 改造 [townsquare/src/store/index.js](file:///Users/bytedance/code/github/blood_on_clocktower_ai/townsquare/src/store/index.js)
- 改造 [chat.js](file:///Users/bytedance/code/github/blood_on_clocktower_ai/townsquare/src/store/modules/chat.js)
- 视需要新增：
  - `src/store/modules/aiRuntime.js`
  - `src/store/modules/aiDebug.js`
  - `src/store/modules/aiConfig.js`

### 4.4 聊天公开接口层

- 改造 [api.js](file:///Users/bytedance/code/github/blood_on_clocktower_ai/townsquare/src/chat/api.js)
- 目标：
  - 支持“说书人身份”发送
  - 支持 `ask / tell / broadcast` 统一入口
  - 为浏览器端 Agent 暴露稳定 API

### 4.5 AI 运行时层

- 拆分/迁移 [main.js](file:///Users/bytedance/code/github/blood_on_clocktower_ai/src/main.js)
- 改造 [tools.js](file:///Users/bytedance/code/github/blood_on_clocktower_ai/src/modules/agent/tools.js)
- 改造 [record.js](file:///Users/bytedance/code/github/blood_on_clocktower_ai/src/modules/common/record.js)
- 视需要改造：
  - [agent.js](file:///Users/bytedance/code/github/blood_on_clocktower_ai/src/modules/agent/agent.js)
  - [storytellerLlm.js](file:///Users/bytedance/code/github/blood_on_clocktower_ai/src/modules/agent/storytellerLlm.js)
  - [interaction.js](file:///Users/bytedance/code/github/blood_on_clocktower_ai/src/modules/game/interaction.js)

### 4.6 建议新增的浏览器适配文件

- `src/ai/runtime/createStorytellerRuntime.js`
- `src/ai/runtime/startStoryteller.js`
- `src/ai/runtime/browserInteraction.js`
- `src/ai/runtime/browserRecord.js`
- `src/ai/runtime/townsquareChatAdapter.js`
- `src/ai/runtime/debugPanelAdapter.js`

## 5. 实施顺序

### 5.1 第一步：完成工程入口合并

- 合并依赖、脚本、静态资源、Vue 主入口
- 让当前仓库可以直接以 Vue 项目启动 TownSquare 页面

### 5.2 第二步：抽离 AI 浏览器运行时

- 从 CLI 入口抽离出可复用的启动编排
- 去掉对命令行输入输出和日志文件的硬依赖

### 5.3 第三步：接入菜单入口与单例状态

- 在菜单栏加入 `AI说书人`
- 加入启动按钮和运行状态文案
- 用 Vuex 管理单例状态

### 5.4 第四步：打通聊天与 debug panel

- `message_tool` 接聊天
- `grimoire_tool` 接 debug panel
- `record` 接 console

### 5.5 第五步：补齐配置与验收

- 浏览器配置面板接入 localStorage
- 验证主持人端可启动、运行、查看日志与调用记录

## 6. 验收标准

- 当前仓库能够以 Vue 项目形式启动 TownSquare 页面
- 右上角菜单栏出现 `AI说书人` Tab
- `启动AI说书` 仅主持人可见，并在运行中显示不可用状态
- Agent 启动后重复点击不会产生第二个实例
- `message_tool` 的输出出现在聊天模块中，身份为说书人
- `grimoire_tool` 的调用记录与最新状态快照出现在半屏半透明 debug panel 中
- 主持人浏览器运行时 `record` 输出可在 console 中查看
- 本期仍未打通 AI 状态图与 TownSquare 状态同步
