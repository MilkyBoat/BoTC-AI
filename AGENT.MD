# 血染钟楼 AI 说书人 — Agent 开发指南

## 项目概述

基于大语言模型（LLM）的「血染钟楼」(Blood on the Clocktower / BotC) AI 说书人系统。  
系统通过 ReAct 循环驱动 LLM 完成角色分配、夜晚/白天规则推进、玩家交互及全局状态维护。

## 运行方式

```bash
# 安装依赖
npm install

# 正常启动（交互式选择剧本与规则）
node src/main.js
# 或
npm start

# 调试模式（固定使用 #暗流涌动.json + 13人预设阵容）
DEBUG=1 node src/main.js
```

### 环境变量（`.env`）

```
BASE_URL=   # LLM API 基础地址（也可用 OPENAI_BASE_URL）
MODEL=      # 模型标识（也可用 OPENAI_MODEL）
API_KEY=    # API 密钥（也可用 OPENAI_API_KEY）
DEBUG=      # 设为 1 启用调试模式
```

参考 `.env.example` 复制后填写。

---

## 目录结构

```
src/
├── main.js                        # 程序入口：剧本选择 → 角色分配 → 状态初始化 → Agent 循环
└── modules/
    ├── agent/
    │   ├── agent.js               # ReActAgent：LLM→tools→applyTools 主循环
    │   ├── ark.js                 # ChatArk：OpenAI 兼容接口封装
    │   ├── ark.test.js            # ChatArk 单元测试
    │   ├── roleAllocAgent.js      # RoleAllocAgent：开局角色分配
    │   ├── storytellerLlm.js      # createStorytellerLlm：说书人提示构建与工具推导
    │   └── tools.js               # applyTools：工具执行器（ask/tell/broadcast/...）
    ├── game/
    │   ├── interaction.js         # Interaction：命令行交互适配（questionForSeat/questionAny/send/broadcast）
    │   ├── scriptLoader.js        # 剧本加载、解析、渲染（selectAndLoadScript/renderScript）
    │   └── state.js               # AgentState：玩家状态与 tokenMap 管理
    ├── common/
    │   ├── const.js               # 常量：ROLE_RATIO、DEBUG_PANEL、LLM_CACHE_TIME
    │   └── record.js              # record(type, text)：分级日志（控制台+文件）
    └── utils/
        ├── console.js             # prompt()：命令行输入工具
        ├── roleUtils.js           # shuffleTokenMap()：角色座位随机洗牌
        └── toolsUtils.js          # parseToolsFromLLM()：LLM 输出解析为工具列表

game_script/                       # 剧本 JSON 文件（#暗流涌动.json 等）
knowledge/                         # 游戏规则与角色知识库（Markdown）
logs/                              # 运行时日志（自动生成，按会话分目录）
scripts/
└── spider.js                      # 知识库抓取脚本（可选）
```

---

## 核心模块说明

### AgentState（`src/modules/game/state.js`）

管理全局游戏状态，所有状态变更均通过此类方法操作：

| 方法 | 说明 |
|------|------|
| `getPlayer(seat)` | 按座位号查找玩家 |
| `replaceTokens(seat, tokens[])` | 替换指定座位全部 token（seat=0 为全局魔典） |
| `kill(seat)` | 标记夜晚死亡 |
| `markExecuted(seat)` | 标记白天处决死亡 |
| `isAlive(seat)` / `aliveCount()` | 查询存活状态 |
| `setRealRole(seat, role)` / `setKnownRole(seat, role)` | 认知覆盖（如酒鬼） |
| `seatsByRole(roleName)` | 按角色名查询存活座位 |
| `snapshot()` | 导出 LLM 可读快照 |

玩家对象字段：`{ seat, knownRole, realRole, alive, executed, tokens }`

### RoleAllocAgent（`src/modules/agent/roleAllocAgent.js`）

开局角色分配，调用 LLM 生成符合阵营比例约束的分配方案：

```js
const allocation = await new RoleAllocAgent().allocate({ playerCount, script, customRules })
// 返回: { players: [{ seat, knownRole, realRole, tokens }] }
```

- 阵营比例来源：`ROLE_RATIO[playerCount]`（`src/modules/common/const.js`）
- 角色能力中的 `[...]` 内容会被解析为初始比例调整规则（差额从镇民扣除）
- 含「你以为自己是 xxx」的角色允许 `knownRole ≠ realRole`
- `DEBUG=1` 时跳过 LLM，直接返回 `DEBUG_PANEL`（13人预设阵容）

### createStorytellerLlm（`src/modules/agent/storytellerLlm.js`）

说书人 LLM 适配器，提供两个方法：

- `buildInitialMessages({ stateText, time, script })` — 构建初始 system/user 提示，注入游戏规则、当前状态表、剧本摘要
- `deriveTools(messages)` — 调用 ChatArk，解析 LLM 返回为工具列表

### ReActAgent（`src/modules/agent/agent.js`）

主循环驱动器（最多 `maxSteps=20` 轮）：

```
初始化 messages → while(!ended):
  deriveTools(messages)
  → 摘要追加为 assistant 消息
  → applyTools({ state, interaction, tools })
  → 追加工具层返回的 user 消息（玩家回应、状态快照）
  → 若 ended=true 退出
```

### applyTools（`src/modules/agent/tools.js`）

工具执行器，将 LLM 产出的 `{ type, payload }` 列表逐一执行：

| 工具 | 说明 |
|------|------|
| `ask` | 阻塞等待玩家输入；`seat=0` 接受任意玩家；`seat>0` 等待指定座位 |
| `tell` | 私密告知指定座位玩家 |
| `broadcast` | 向所有玩家公开广播 |
| `replace_token` | 替换指定座位全部 token，执行后自动插入状态快照消息 |
| `mark_death` | 标记玩家死亡（`status: "death"`）并广播公告 |
| `set_character` | 修改角色/阵营（`new_known` / `new_real`） |
| `game_over` | 结束游戏，广播胜利方与原因，设置 `ended=true` |

所有工具执行后会将事件追加为 `user` 消息，供下一轮 LLM 参考。

---

## 日志系统

`record(type, text)` 统一管理输出，每次运行在 `logs/<YYYY_MMDD_HHmm>/` 下创建会话目录：

| type | 控制台 | all.log | llm.log | game.log | state.log |
|------|--------|---------|---------|----------|-----------|
| `info` / `error` / `response` 等 | ✅ | ✅ | | ✅ | |
| `llm` | | ✅ | ✅ | | |
| `tool` / `script` | | ✅ | | | |
| `state` | ✅ | ✅ | | | ✅ |

> LLM 原始返回仅写入 `llm.log`，不打印到控制台，避免噪音。  
> 路径输出使用相对路径，避免泄露绝对路径。

---

## 角色配比表（`ROLE_RATIO`）

| 人数 | 镇民 | 外来者 | 爪牙 | 恶魔 |
|------|------|--------|------|------|
| 5 | 3 | 0 | 1 | 1 |
| 6 | 3 | 1 | 1 | 1 |
| 7 | 5 | 0 | 1 | 1 |
| 8 | 5 | 1 | 1 | 1 |
| 9 | 5 | 2 | 1 | 1 |
| 10 | 7 | 0 | 2 | 1 |
| 11 | 7 | 1 | 2 | 1 |
| 12 | 7 | 2 | 2 | 1 |
| 13 | 9 | 0 | 3 | 1 |
| 14 | 9 | 1 | 3 | 1 |
| 15 | 9 | 2 | 3 | 1 |

---

## 剧本格式（`game_script/*.json`）

标准 JSON 数组，每个元素为角色对象：

```jsonc
[
  { "id": "_meta", "name": "暗流涌动", ... },          // 剧本元信息
  {
    "id": "washerwoman",
    "name": "洗衣妇",
    "team": "townsfolk",                               // townsfolk / outsider / minion / demon / traveler
    "ability": "你知道...",
    "firstNight": 18,                                  // 首夜行动顺序（数字越小越先）
    "otherNight": 0,                                   // 其他夜晚顺序（0=不行动）
    "reminders": ["是洗衣妇目标", "错误"],              // 可绑定到特定座位的 token
    "remindersGlobal": []                              // 全局 token（seat=0）
  }
]
```

`traveler` 类型角色在分配时会被忽略。

---

## 知识库（`knowledge/`）

Markdown 格式的游戏规则与角色说明，分三个子目录：

- `knowledge/基础/` — 通用规则（投票、处决、中毒、醉酒、疯狂等）
- `knowledge/剧本/` — 各剧本角色汇总
- `knowledge/角色/` — 单个角色详细说明

当前版本未强依赖知识库（不做 RAG），如需引入可在提示词中注入对应内容。  
知识库数据可通过 `node scripts/spider.js` 从[钟楼百科](https://clocktower-wiki.gstonegames.com/)抓取。

---

## 扩展方向

- **Web/IM 接入**：替换 `src/modules/game/interaction.js`，将 `questionForSeat/questionAny/send/broadcast` 对接 WebSocket 或 IM Bot
- **RAG 知识增强**：将 `knowledge/` 内容向量化，在 `buildInitialMessages` 中动态注入相关规则片段
- **规则引擎纠偏**：将高频约束（胜利条件检查、阵营比例校验）固化为工具前置校验，减少 LLM 幻觉
- **新剧本**：在 `game_script/` 下放置标准格式 JSON 即可自动被 `selectAndLoadScript` 识别
- **自定义 LLM**：`ChatArk` 遵循 OpenAI SDK 接口，替换 `baseURL`/`model` 即可对接任意兼容接口
