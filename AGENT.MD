# 血染钟楼 AI 说书人 — Agent 开发指南

## 目录结构

```
src/
├── main.js                        # 程序入口：剧本选择 → 角色分配 → 状态初始化 → Agent 循环
└── modules/
    ├── agent/
    │   ├── agent.js               # ReActAgent：LLM→tools→applyTools 主循环
    │   ├── roleAllocAgent.js      # RoleAllocAgent：开局角色分配
    │   ├── storytellerLlm.js      # createStorytellerLlm：说书人提示构建与工具推导
    │   ├── tools.js               # applyTools：工具执行器
    │   └── llm/
    │       ├── llmFactory.js      # createLlm()：根据 LLM_PROVIDER 返回对应 LLM 实例
    │       ├── ark.js             # ChatArk：字节跳动 Ark / OpenAI 兼容接口封装
    │       ├── ark.test.js        # ChatArk 单元测试
    │       └── claude.js          # ChatClaude：Anthropic Claude 接口封装
    ├── game/
    │   ├── interaction.js         # Interaction：命令行交互适配
    │   ├── scriptLoader.js        # 剧本加载、解析、渲染
    │   └── state.js               # AgentState：玩家状态与 tokenMap 管理
    ├── common/
    │   ├── const.js               # 常量：ROLE_RATIO、DEBUG_PANEL、LLM_CACHE_TIME 等
    │   └── record.js              # record(type, text)：分级日志
    └── utils/
        ├── console.js             # prompt()：命令行输入工具
        ├── roleUtils.js           # shuffleTokenMap()：角色座位随机洗牌
        └── toolsUtils.js          # parseToolsFromLLM()：LLM 输出解析为工具列表

game_script/                       # 剧本 JSON 文件
knowledge/                         # 游戏规则与角色知识库（Markdown）
logs/                              # 运行时日志（自动生成，按会话分目录）
scripts/
└── spider.js                      # 知识库抓取脚本
```

---

## 核心模块接口

### LLM 接入（`src/modules/agent/llmFactory.js`）

所有 LLM 调用均通过 `createLlm(opts)` 工厂获取实例，禁止在业务代码中直接 `new ChatArk()` / `new ChatClaude()`。

```js
const { createLlm } = require('./llmFactory')
const chat = createLlm({ model, apiKey, baseURL })  // opts 可选，优先级高于环境变量
const { content, reason, raw } = await chat.invoke(messages)  // messages: OpenAI 格式数组
```

**接入新 LLM 提供商**：
1. 在 `src/modules/agent/` 下新建适配文件（如 `openai.js`），实现 `invoke(messages) → { content, reason, raw }` 接口
2. 在 `llmFactory.js` 中按 `LLM_PROVIDER` 值分支返回新实例

### AgentState（`src/modules/game/state.js`）

```js
state.getPlayer(seat)                    // 按座位号查找玩家
state.replaceTokens(seat, tokens[])      // 替换指定座位全部 token（seat=0 为全局魔典）
state.kill(seat)                         // 标记夜晚死亡
state.markExecuted(seat)                 // 标记白天处决死亡
state.isAlive(seat) / state.aliveCount() // 查询存活状态
state.setRealRole(seat, role)            // 设置真实角色
state.setKnownRole(seat, role)           // 设置认知角色（如酒鬼）
state.seatsByRole(roleName)              // 按角色名查询存活座位列表
state.snapshot()                         // 导出 LLM 可读快照字符串
```

玩家对象字段：`{ seat, knownRole, realRole, alive, executed, tokens }`

### createStorytellerLlm（`src/modules/agent/storytellerLlm.js`）

```js
const { buildInitialMessages, deriveTools } = createStorytellerLlm()
const messages = buildInitialMessages({ stateText, time, script })
const tools = await deriveTools(messages)  // 返回规范化工具数组
```

### ReActAgent（`src/modules/agent/agent.js`）

```
初始化 messages → while(!ended, maxSteps=20):
  deriveTools(messages)       → 解析 LLM 输出为 tools 列表
  → 摘要追加为 assistant 消息
  → applyTools(...)           → 执行工具，返回事件列表
  → 事件追加为 user 消息
  → 若 ended=true 退出
```

### Interaction（`src/modules/game/interaction.js`）

命令行交互适配层，替换此模块可接入 Web / IM 等其他渠道：

```js
interaction.questionForSeat(seat, message)  // 向指定座位询问，阻塞等待回答
interaction.questionAny(message)            // 等待任意玩家回答
interaction.send(seat, message)             // 私密发送消息给指定座位
interaction.broadcast(message)             // 向所有玩家广播
```

---

## 日志规范

`record(type, text)` 统一管理输出，每次运行在 `logs/<YYYY_MMDD_HHmm>/` 下创建会话目录：

| type | 控制台 | all.log | llm.log | game.log | state.log |
|------|--------|---------|---------|----------|-----------|
| `info` / `error` / `response` 等 | ✅ | ✅ | | ✅ | |
| `llm` | | ✅ | ✅ | | |
| `tool` / `script` | | ✅ | | | |
| `state` | ✅ | ✅ | | | ✅ |

> LLM 原始返回仅写入 `llm.log`，不打印到控制台，避免噪音。

---

## 扩展点

- **新 LLM 提供商**：实现 `invoke(messages)` 接口，在 `llmFactory.js` 中注册
- **Web/IM 接入**：替换 `src/modules/game/interaction.js`，实现相同的四个方法
- **RAG 知识增强**：在 `buildInitialMessages` 中动态注入 `knowledge/` 内容
- **新剧本**：在 `game_script/` 下放置标准格式 JSON，`selectAndLoadScript` 会自动识别

---

## 沟通记录规范

- 每次完成沟通后，立刻在 `/doc/discussion/` 目录下新增记录（同一天同一主题的可以聚合在同一个文件中）
- 文件命名格式：`YYYY-MM-DD-topic.md`
- 记录内容至少包含以下区块：
  - 主题
  - 用户原始想法（尽量保留原话与动机）
  - 我的思路与判断（关键取舍与理由）
  - 交付结果（实际产出与文件清单）
