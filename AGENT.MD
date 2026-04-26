# 血染钟楼 AI 说书人 — Agent 开发指南

> 本文档以 `dev` 分支当前实现为准。当前 Agent 主体位于 `src/ai/`，使用 LangChain tool calling 运行 ReAct 风格循环。

## 当前架构速览

- **Agent 入口**：`src/ai/main.js`
- **主流程编排**：`src/ai/runStoryteller.js`
- **Agent 循环**：`src/ai/agent/agent.js`
- **工具定义**：`src/ai/agent/tools.js`
- **状态/魔典**：`src/ai/game/state.js`
- **交互适配**：`src/ai/game/interaction.js`
- **LLM 工厂**：`src/ai/agent/llm/llmFactory.js`

主链路：

```text
src/ai/main.js
  → runStoryteller()
    → selectAndLoadScript()
    → RoleAllocAgent.allocate()
    → new AgentState()
    → createLlm()
    → new ReActAgent()
    → agent.loop()
```

---

## 目录结构

```text
src/ai/
├── main.js                         # CLI/调试入口：调用 runStoryteller()
├── runStoryteller.js               # 主流程：剧本选择 → 角色分配 → 状态初始化 → Agent 循环
├── agent/
│   ├── agent.js                    # ReActAgent：LangChain bindTools/tool_calls 主循环
│   ├── roleAllocAgent.js           # RoleAllocAgent：开局角色分配
│   ├── storytellerLlm.js           # createStorytellerLlm：构建说书人初始系统提示
│   ├── tools.js                    # createGameTools：message_tool / grimoire_tool
│   └── llm/
│       ├── llmFactory.js           # createLlm()：根据 LLM_PROVIDER 返回 LLM 实例
│       ├── ark.js                  # ChatArk：Ark / OpenAI Responses API 兼容封装
│       └── claude.js               # ChatClaude：Anthropic Claude Messages API 封装
├── game/
│   ├── interaction.js              # Interaction：命令行/浏览器交互适配
│   ├── scriptLoader.js             # 剧本加载、解析、渲染
│   └── state.js                    # AgentState：玩家状态与 tokenMap 管理
├── common/
│   ├── const.js                    # 常量：ROLE_RATIO、DEBUG_PANEL、LLM_CACHE_TIME 等
│   └── record.js                   # record(type, text)：分级日志
├── runtime/
│   └── browserConfig.js            # 浏览器调试面板配置桥接
└── utils/
    ├── console.js                  # prompt()：命令行输入工具
    ├── roleUtils.js                # shuffleTokenMap()：角色座位随机洗牌
    └── toolsUtils.js               # 遗留：解析 LLM JSON 工具输出

game_script/                        # 剧本 JSON 文件
knowledge/                          # 游戏规则与角色知识库（Markdown；当前未启用 RAG）
logs/                               # 运行时日志（自动生成，按会话分目录）
scripts/                            # 知识库下载/抓取脚本
```

---

## 核心运行流程

### `src/ai/main.js`

当前入口会调用：

```js
runStoryteller({
  customRules: "",
  debug: true,
  playerCount: 8,
  promptImpl: prompt,
  recordImpl: record,
})
```

> 注意：`runStoryteller.js` 内部目前仍有 `const debug = true` 的临时调试写法，会覆盖外部传入值。修改交互式体验前应先修复该点。

### `src/ai/runStoryteller.js`

负责串起完整生命周期：

1. 加载剧本：`selectScript({ debug })`
2. 分配角色：`allocateRoles({ debug, playerCount, script, customRules })`
3. 初始化状态：`new AgentState({ players })`
4. 初始化交互层：`new Interaction()`
5. 初始化 LLM：`createLlm(llmConfig)`
6. 初始化 Agent：`new ReActAgent(...)`
7. 渲染初始状态并进入 `agent.loop()`

---

## ReActAgent 当前实现

文件：`src/ai/agent/agent.js`

当前实现使用 LangChain 原生 tool calling，而不是手写 `deriveTools → applyTools` 流程。

初始化：

```js
this.messages = helper.buildInitialMessages({
  stateText: this.renderStateTable(this.state),
  script: this.script,
});
this.runnable = this.model.bindTools(this.tools);
```

循环核心：

```text
while (!gameEnded):
  result = await runnable.invoke(messages)
  messages.push(result)

  if result.tool_calls.length > 0:
    for each tool_call:
      tool.invoke(tool_call.args)
      messages.push(new ToolMessage(...))
      if grimoire_tool.game_over: gameEnded = true
  else:
    record result.content
    messages.push(new HumanMessage("请继续..."))
```

结束条件：

- LLM 调用 `grimoire_tool` 且 `command_type === "game_over"`
- 或普通文本中包含 `GAME_OVER`

> `agent.loop(50)` 目前的参数没有被 `loop()` 使用；如果需要防止无限循环，应显式添加 `maxSteps` 参数和步数检查。

---

## 说书人提示词

文件：`src/ai/agent/storytellerLlm.js`

`createStorytellerLlm().buildInitialMessages({ stateText, script })` 负责构建初始上下文，主要包含：

- 说书人身份与目标
- BotC 基本规则
- 昼夜流程
- 提名、投票、处决规则
- 胜利条件
- 首夜/白天/后续夜晚主持流程
- 工具使用说明
- 平衡性原则：处理“可能”信息时略偏向邪恶方
- 术语说明：魔典、F4、认知覆盖等
- 当前剧本内容
- 当前全场状态表

`deriveTools()` 当前仍存在，但主流程已经不依赖它。除非回退到“LLM 输出 JSON 指令 → 手动解析工具”的旧架构，否则不应在新代码中使用它作为主路径。

---

## 工具系统

文件：`src/ai/agent/tools.js`

`createGameTools(...)` 返回两个 LangChain `DynamicStructuredTool`：

### `message_tool`

用于所有玩家交互。

| command_type | 作用 | 关键参数 |
|---|---|---|
| `ask` | 向指定座位或全体提问，并等待玩家输入 | `seat`, `message` |
| `tell` | 向指定座位私密发送信息 | `seat`, `message` |
| `broadcast` | 向所有玩家公开广播 | `message` |

约定：

- `seat = 0` 表示全体/任意玩家。
- `ask` 会返回 `event: player_response, seat: X, text: ...`。
- `tell` 和 `broadcast` 不等待玩家回复。

### `grimoire_tool`

用于维护魔典/游戏状态。

| command_type | 作用 | 关键参数 |
|---|---|---|
| `replace_token` | 全量覆写某座位的 token；`seat=0` 可作为全局魔典 | `seat`, `tokens` |
| `global_status` | 全量覆写全局状态 token | `tokens` |
| `mark_death` | 标记玩家死亡或复活 | `seat`, `status` |
| `set_character` | 修改玩家真实角色或认知角色 | `seat`, `new_real`, `new_known` |
| `game_over` | 结束游戏并广播结果 | `winner`, `reason` |

重要约束：

- `replace_token` 是**全量替换**，调用时必须把要保留的旧 token 一并传回。
- `mark_death` 当前只区分 `death` / `alive`，没有区分“夜晚死亡”和“白天处决”。如需依赖处决来源，必须额外修复工具或用 token 记录。
- `game_over` 会通过 `interaction.broadcast()` 公告结果，并让 Agent 循环结束。

---

## AgentState

文件：`src/ai/game/state.js`

玩家对象核心字段：

```js
{
  seat,        // 座位号
  knownRole,   // 玩家认知身份，如酒鬼/疯子等可与 realRole 不同
  realRole,    // 真实身份
  alive,       // 是否存活
  executed,    // 是否被处决；当前工具链尚未充分使用
  tokens       // 自由字符串 token，用于维护状态/标记/技能结果
}
```

核心方法：

```js
state.getPlayer(seat)
state.getTokens(seat)
state.replaceTokens(seat, tokens)
state.kill(seat)
state.markExecuted(seat)
state.revive(seat)
state.isAlive(seat)
state.aliveCount()
state.setRealRole(seat, role)
state.setKnownRole(seat, role)
state.seatsByRole(roleName)
state.snapshot()
```

注意：

- `snapshot()` 返回对象，不是 LLM 可读字符串。
- 给 LLM 看的状态文本由 `renderStateTable(state)` 生成。
- `tokenMap` 使用 `Map<seat, Set<string>>` 保存 token；渲染时会展示全局 token 与每个玩家 token。

---

## LLM 接入

文件：`src/ai/agent/llm/llmFactory.js`

统一通过 `createLlm(opts)` 获取模型实例，业务代码不要直接 `new ChatArk()` / `new ChatClaude()`，除非是在适配器或测试中。

Provider 选择：

```text
LLM_PROVIDER=claude  → ChatClaude
LLM_PROVIDER=ark     → ChatArk
未设置              → ChatArk
```

### ChatArk

文件：`src/ai/agent/llm/ark.js`

- 继承 LangChain `BaseChatModel`
- 使用 OpenAI SDK 的 `responses.create()`
- 支持 `bindTools()`
- 支持 `parallel_tool_calls: true`
- 支持 Ark / OpenAI Responses API 风格工具调用解析
- 服务端使用环境变量，浏览器调试模式走 `/api/ai/llm/ark/responses`

常用环境变量：

```env
BASE_URL=https://...
MODEL=ep-xxx
API_KEY=your_key
```

### ChatClaude

文件：`src/ai/agent/llm/claude.js`

- 继承 LangChain `BaseChatModel`
- 使用 `@anthropic-ai/sdk`
- 支持 Anthropic tool use / tool result
- 默认模型：`claude-sonnet-4-6`
- 浏览器调试模式走 `/api/ai/llm/claude/messages`

常用环境变量：

```env
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-6
```

### LLM 返回值约定

当前 `chat.invoke(messages)` 返回 LangChain `AIMessage` 风格对象，而不是 `{ content, reason, raw }` 的普通对象。

常用读取方式：

```js
const result = await chat.invoke(messages);
const text = result.content;
const toolCalls = result.tool_calls || [];
const reason = result.additional_kwargs?.reason;
const raw = result.additional_kwargs?.raw;
```

---

## 角色分配

文件：`src/ai/agent/roleAllocAgent.js`

`RoleAllocAgent` 根据玩家人数、剧本和自定义规则生成开局身份：

```js
const allocator = new RoleAllocAgent();
const allocation = await allocator.allocate({
  debug,
  playerCount,
  script,
  customRules,
});
```

输出格式：

```json
{
  "players": [
    {
      "seat": 1,
      "knownRole": "洗衣妇",
      "realRole": "洗衣妇",
      "tokens": []
    }
  ]
}
```

约束：

- 所有角色唯一。
- 阵营数量应符合人数配比与角色技能调整。
- 只能从当前剧本候选角色中选择。
- 认知覆盖类角色允许 `knownRole !== realRole`。

Debug 模式下会直接返回 `DEBUG_PANEL`，不会调用 LLM。

---

## 交互层

文件：`src/ai/game/interaction.js`

`Interaction` 是说书人与玩家交互的适配层：

```js
interaction.questionForSeat(seat, message)
interaction.questionAny(message)
interaction.send(seat, message)
interaction.broadcast(message)
```

CLI 输入格式：

```text
座位号 文本内容
```

例如：

```text
3 我怀疑1号是恶魔
```

会解析为：

```js
{ seat: 3, text: "我怀疑1号是恶魔" }
```

如果将来接入 Web / IM / Bot，只需要替换 Interaction，实现同样四个方法即可。

---

## 日志规范

`record(type, text)` 统一管理输出。运行时日志写入 `logs/`，不同类型用于分离控制台、LLM、游戏事件和状态表。

常见类型：

| type | 含义 |
|---|---|
| `info` | 普通流程日志 |
| `error` | 错误日志 |
| `llm` | LLM 文本输出或原始返回 |
| `tool` | 工具调用记录 |
| `state` | 当前魔典/状态表 |
| `event` | 游戏事件/广播 |
| `prompt` | 向玩家发出的提问 |
| `response` | 玩家输入响应 |
| `script` | 剧本内容 |

---

## 扩展点

### 新 LLM Provider

1. 在 `src/ai/agent/llm/` 下新增适配器。
2. 继承 LangChain `BaseChatModel` 或提供兼容 `bindTools()` / `invoke()` 的对象。
3. 在 `llmFactory.js` 中按 `LLM_PROVIDER` 分支返回新实例。
4. 确保返回的 AIMessage 能携带：
   - `content`
   - `tool_calls`
   - `additional_kwargs.reason`（可选）
   - `additional_kwargs.raw`（可选）

### 新交互渠道

替换或扩展 `src/ai/game/interaction.js`，保持以下接口不变：

```js
questionForSeat(seat, message)
questionAny(message)
send(seat, message)
broadcast(message)
```

### 新剧本

把标准 JSON 剧本放入 `game_script/`。`scriptLoader` 会读取并渲染剧本内容给说书人上下文。

### RAG / 知识库增强

当前 `knowledge/` 未自动注入主流程。若启用 RAG，建议在 `buildInitialMessages()` 中按剧本与角色动态注入最小必要知识，避免 prompt 过大。

---

## 已知问题与维护注意事项

1. **debug 被强制开启**
   - `runStoryteller.js` 内部当前写死 `const debug = true`。
   - 这会导致角色分配走固定 `DEBUG_PANEL`。
   - 若要恢复正常交互，应改为读取 `options.debug` 或环境变量。

2. **`agent.loop(50)` 参数未生效**
   - `loop()` 当前没有接收 `maxSteps` 参数。
   - 建议补上最大步数保护，避免 LLM 不结束时无限循环。

3. **死亡来源未区分**
   - `AgentState` 有 `markExecuted()`，但 `grimoire_tool.mark_death` 当前只调用 `kill()`。
   - 会影响依赖“处决死亡”的角色或统计。
   - 建议新增 `mark_execution` 或让 `mark_death` 支持 `phase: "day" | "night"`。

4. **token 缺少 schema**
   - 当前 token 是自由字符串，容易出现同义不同名。
   - 建议定义 token 命名规范，例如：
     - `daynight:night`
     - `date:1`
     - `status:poisoned`
     - `status:drunk`
     - `death:night`
     - `death:execution`

5. **`deriveTools()` 是遗留路径**
   - 当前主流程已经走 LangChain `bindTools()`。
   - 新功能应优先维护 `tools.js` 与 `agent.js`，不要把新逻辑接回 `deriveTools()`。

6. **核心规则主要依赖 LLM 执行**
   - 提名合法性、投票过半、夜晚顺序、胜负检查等目前主要靠 prompt。
   - 若要提升稳定性，应逐步把这些规则硬编码到工具或状态机中。

---

## 开发约定

- 业务代码调用 LLM 时优先通过 `createLlm()`。
- 新增工具时优先放在 `createGameTools()` 中，并为 schema 写清楚 `command_type` 与参数含义。
- 会改变游戏状态的行为应通过 `grimoire_tool` 或 `AgentState` 方法完成，不要在 Agent 循环中散落修改状态。
- 给玩家的公开/私密消息应通过 `message_tool` 或 `Interaction` 发送。
- 修改 prompt 时要同步考虑：工具能力、状态表格式、剧本渲染格式三者是否一致。
- 修改状态字段或 token 语义时，应同步更新本文档和说书人系统提示。

---

## 沟通记录规范

- 每次完成重要沟通或方案确认后，在 `/doc/discussion/` 目录下新增记录。
- 同一天同一主题可聚合到同一个文件中。
- 文件命名格式：`YYYY-MM-DD-topic.md`。
- 记录内容建议包含：
  - 主题
  - 用户原始想法或需求
  - 关键判断与取舍
  - 实际修改/交付结果
  - 后续待办
