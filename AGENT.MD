# AI说书人 Agent 说明（最新架构）

## 概述
- 目标：实现基于 LLM 的“血染钟楼”AI说书人，负责开局角色分配、夜晚/白天的规则推进、玩家交互，以及全局状态维护。
- 架构：大模型相关逻辑位于 `src/modules/agent/`；游戏机制位于 `src/modules/game/`；入口为 `src/main.js`。

## 入口与运行
- 入口：`node src/main.js`
- 调试：`DEBUG=1 node src/main.js`（固定剧本与 8 人分配）
- 环境变量：`.env` 需配置 `API_KEY`、`BASE_URL`、`MODEL`（用于 `ChatArk`）。

## 目录结构
```
├── src/
│   ├── main.js                       # 程序入口
│   └── modules/
│       ├── agent/
│       │   ├── agent.js              # ReActAgent 循环驱动
│       │   ├── ark.js                # ChatArk 封装
│       │   ├── roleAllocAgent.js     # 角色分配 Agent
│       │   └── storytellerLlm.js     # 说书人 LLM 适配器
│       ├── game/
│       │   ├── interaction.js        # 命令行交互适配
│       │   ├── scriptLoader.js       # 剧本加载/解析与选择
│       │   └── state.js              # 对局状态
│       ├── utils/
│       │   ├── roleUtils.js          # 角色工具（shuffleTokenMap）
│       │   └── toolkit.js            # 工具解析与规范化
│       └── common/
│           ├── const.js              # 常量（ROLE_RATIO 等）
│           └── record.js             # 日志（相对路径输出）
├── game_script/                      # 剧本 JSON
├── knowledge/                        # 规则与术语知识库
├── README.md
└── AGENT.MD
```

## 开局角色分配（RoleAllocAgent）
- 调用：`await new RoleAllocAgent().allocate({ playerCount, script, customRules })`
- 基本约束：
  - 角色唯一分配（同名不可重复）
  - 阵营数量满足基础比例（镇民/外来者/爪牙/恶魔），来源 `ROLE_RATIO[playerCount]`
  - 座位号连续 `1..playerCount`
  - 候选角色来自剧本，忽略 `_meta` 与 `traveler`
- 调整规则：从角色 `ability` 文本中提取中括号 `[ ... ]`，形成“比例特殊调整”，差额从镇民扣除
- 认知覆盖：若能力包含“你以为自己是 xxx”，则允许 `knownRole != realRole`，否则需一致
- 输出格式：
```
{
  "players": [ { "seat": 1, "knownRole": "洗衣妇", "realRole": "酒鬼", "tokens": ["是酒鬼"] } ]
}
```
- 调试分支：`DEBUG=1` 时返回固定 8 人分配，并记录 `record('info', '角色分配：LLM思考中/完成')`

## 说书人适配（createStorytellerLlmAgent）
- 消息构造：`buildInitialMessages({ stateText, time, script })` 生成 `system/user` 提示；`user` 注入当前状态表与时间；`script` 追加剧本摘要
- 工具推导：`deriveTools(messages)` 调用 `ChatArk`；以 `record('info', ...)` 记录“LLM思考中/完成”；将原始输出写入 `record('llm', ...)`；使用 `parseToolsFromLLM(...)` 解析
- 工具协议（规范化后在工具层执行）：
  - `ask`：夜间技能选择/一次性技能确认/白天等待提名或投票
  - `tell`：私密告知（信息最小化）
  - `broadcast`：公共广播（阶段/事件）
  - `replace_token`：一次性替换某座位的全部 Token；记录进度时 `seat=0`
  - `mark_death`：标记玩家生死（如处决）
  - `set_character`：改变角色/阵营（认知覆盖需区分 `new_known` 与 `new_real`）
  - `game_over`：宣布游戏结束与胜利方

## 对局循环（ReActAgent）
- 初始化：`buildInitialMessages` 生成系统与用户提示，注入当前状态表与时间标识
- 循环：
  - LLM 推导工具：`deriveTools(messages)`
  - 将本轮工具摘要作为 `assistant` 内容写入消息队列（供下一轮参考）
  - 应用工具：工具层驱动状态变更与交互（阻塞询问/广播/标记等），返回追加消息与是否结束
  - 结束条件：工具层返回 `ended` 为真则退出循环

## 日志与隐私
- 日志统一通过 `record(type, text)` 输出；会话初始化打印相对目录 `logs/<session>`，避免泄露绝对路径
- 剧本调试路径同样输出相对路径（如 `game_script/#暗流涌动.json`）
- LLM 原始返回仅写入文件日志（`llm.log`），控制台避免噪音

## 交互与输入
- 命令行：玩家输入 `座位号 文本`；说书人阻塞询问时读取对应座位的回应
- 提名/处决：支持 `execute 座位号` 或 `none`
- 继续流程：支持 `ok`

## 扩展建议
- 知识库：可引入 `knowledge/`（Wiki 抓取）并在提示中引用（当前未强依赖）
- Web/IM：将 `interaction` 层替换为 WebSocket/IM 接口
- 规则引擎：将常见约束固化并作为 LLM 纠偏器
