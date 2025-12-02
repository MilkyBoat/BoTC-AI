# AI说书人 Agent 说明

## 概述
- 目标：实现基于 LLM 的“血染钟楼”AI说书人，负责开局角色分配、夜晚/白天的规则推动、与玩家的交互，以及全局状态与 token 的维护。
- 架构：将大模型相关逻辑置于 `src/modules/agent/` 下，游戏机制相关逻辑置于 `src/modules/game/` 下，入口为 `src/main.js`。
- 交互：当前使用命令行适配器，未来可替换为 IM/Web。

## 目录结构
- `src/modules/agent/llmAgent.js`：LLM 调用与提示词（分配与技能执行）
- `src/modules/game/roleManager.js`：角色管理模块，包含角色分配接口和玩家洗牌功能
- `src/modules/game/state.js`：对局状态（玩家、身份、token、存活）
- `src/modules/game/scriptLoader.js`：剧本加载与解析（候选角色与夜序）
- `src/modules/game/rules.js`：分配入口与胜利检查（占位）
- `src/modules/game/storyteller.js`：说书人（广播、定向消息、阻塞询问与处决）
- `src/modules/game/engine.js`：昼夜循环与状态表输出（夜序调度、阻塞控制）
- `src/modules/game/cliAdapter.js`：命令行输入输出（座位号+文本）
- `knowledge/`：规则与术语参考（用于提示词内嵌）

## RAG 知识库
- 用途：为提示词提供可检索的规则、术语与剧本/角色说明。
- 准备：先运行 `node scripts/spider.js` 拉取官方 Wiki 并生成 `knowledge/` 下的 Markdown 文件；该目录已加入 `.gitignore`。
- 分类：
  - `基础`：规则概要、重要细节、术语汇总等基础规则
  - `进阶`：给说书人的建议、相克规则等进阶内容
  - `剧本`：剧本页面本身（暗流涌动、黯月初升、梦殒春宵、华灯初上等）
  - `角色`：剧本页面一层递归出的角色说明
  - `其他`：暂未归类的页面
- 过滤：标题包含 `特殊`、`登录`、`剧本创作大赛` 的页面被忽略且不递归。

## 运行配置
- `.env`
  - `BASE_URL`：LLM 接口地址
  - `MODEL`：模型标识
  - `API_KEY`：访问密钥
- 启动：`node src/main.js`
- 调试：设置 `DEBUG=1` 可固定剧本与玩家数（默认 8），仍使用真实 LLM（若 `.env` 完整）。

## 提示词设计（分配阶段）
- 系统提示包含：
  - 硬约束：忽略 `traveler`、角色唯一分配、阵营数量满足基础比例、只从候选列表选择。
  - 设置调整：从剧本 `ability` 中英文中括号 `[ ... ]` 自动提取并列出，如 `- 角色名(阵营): [调整说明]`。
  - 认知覆盖：自动汇总剧本中的“酒鬼”“疯子”等角色的能力文本，提示允许 `knownRole` 与 `realRole` 在认知覆盖场景下不一致，其他角色需一致。
  - 参考知识：注入 `knowledge` 中的“规则概要/重要细节/术语汇总/剧本摘要”。
- 用户负载包含：
  - `playerCount`：玩家总数
  - `baseRatio`：基础比例（镇民/外来者/爪牙/恶魔）
  - `scriptName`：剧本名称
  - `candidates`：按阵营列出的候选角色 `{ id, name, setup }`
  - 返回格式期望：`{ players: [{ seat, knownRole, realRole?, tokens: [] }] }`

### 返回示例
```
{
  "players": [
    { "seat": 1, "knownRole": "洗衣妇", "realRole": "酒鬼", "tokens": ["是酒鬼"] },
    { "seat": 2, "knownRole": "厨师", "realRole": "厨师", "tokens": [] },
    { "seat": 8, "knownRole": "小恶魔", "realRole": "小恶魔", "tokens": [] }
  ]
}
```

## 提示词设计（技能执行阶段）
- 系统提示包含：
  - 工具列表：`broadcast`、`send_to_player`、`add_token`、`remove_token`、`announce_game_end`、`end_role`
  - 规则约束：`firstNight/otherNight=0` 不行动、忽略 `traveler`、胜利条件（恶魔全灭/仅存两人且一人为恶魔）
- 用户负载包含：
  - `phase`：`firstNight` / `otherNight`
  - `role`：当前行动角色的完整条目
  - `stateSnapshot`：全局状态快照（玩家身份、存活、token）
- 返回格式期望：`{ ops: [{ type, payload }] }`

### 返回示例
```
{
  "ops": [
    { "type": "broadcast", "payload": { "kind": "reminder", "role": "僧侣", "text": "让僧侣选择除自己外的一名玩家。" } },
    { "type": "prompt_player", "payload": { "seat": 5, "roleName": "僧侣", "ability": "选择一名玩家：当晚恶魔的负面能力对他无效。" } },
    { "type": "add_token", "payload": { "seat": 3, "token": "保护" } },
    { "type": "end_role" }
  ]
}
```

## 工具接口
- `broadcast(payload)`：向全体发布提示或阶段信息
- `send_to_player(seat, message)`：向特定座位私聊信息
- `add_token(seat, token)` / `remove_token(seat, token)`：修改玩家状态 token
- `announce_game_end(winner, reason)`：宣布游戏结束与胜利方
- `end_role()`：当前角色行动结束

## 输入/输出格式
- 入口：命令行输入两段，`座位号` 与 `文本`
- 玩家回应：当说书人处于阻塞询问时，读取该座位回应并继续推进；否则忽略或用于调试 token
- 状态表：每个夜晚/白天开始与结束打印“座位/状态/可见身份/真实身份/tokens”表格

## 会话与阻塞机制
- 夜晚：每个角色行动后阻塞，若有指定座位询问则等待该座位回应，否则统一等待 `ok`
- 白天：阻塞等待处决决策（`execute 座位号` 或 `none`），结算后广播并继续
- 开局：打印分配表并阻塞等待 `ok` 确认再继续

## 日志规范
- LLM 请求/响应：打印完整 JSON 输入与原始输出
- 工具调用：以“工具调用:”列表输出 `type payload`
- 说书人提示/回应：醒目展示“询问/回应”，包含座位与能力提示
- 阶段广播：进入白天/夜晚、处决/无人处决，均以“广播:”输出

## 约束与校验（计划）
- 两阶段分配：先计算目标比例与候选集合，再由 LLM 细化分配
- 校验器：数量匹配、角色唯一性、设置调整、认知覆盖一致性、候选合法性
- 纠偏：自动生成违规报告并请求 LLM 重试；多次失败则使用保底的确定性分配器

## 调试与扩展
- 调试：`DEBUG=1 node src/main.js`（固定剧本与人数）
- 扩展：
  - 交互适配：将 `cliAdapter` 替换为 IM/Web 接口
  - RAG：将 `knowledge` 进一步清洗与结构化，接入检索增强提示
  - 规则引擎：将部分技能与设置调整固化成可验证的约束模块
