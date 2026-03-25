# 血染钟楼 AI 说书人

基于大语言模型（LLM）的「血染钟楼」(Blood on the Clocktower / BotC) AI 说书人系统。系统通过 ReAct 循环驱动 LLM 完成角色分配、夜晚/白天规则推进、玩家交互及全局状态维护。

## 快速开始

```bash
npm install

# 正常启动（交互式选择剧本与规则）
node src/main.js

# 调试模式（固定使用 #暗流涌动.json + 13人预设阵容）
DEBUG=1 node src/main.js
```

## 环境配置

复制 `.env.example` 为 `.env` 并填写对应配置。

### Ark（字节跳动，默认）

```
BASE_URL=https://...
MODEL=ep-xxx
API_KEY=your_key
```

### Claude（Anthropic）

```
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
# CLAUDE_MODEL=claude-sonnet-4-6   # 可选，默认 claude-sonnet-4-6
```

其他可用环境变量：`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL`（等同于 `API_KEY` / `BASE_URL` / `MODEL`）

---

## 游戏流程

### 命令行交互格式

- 玩家发言：`座位号 文本内容`（如 `3 我怀疑1号是恶魔`）
- 说书人询问投票结果时：输入逗号分隔的投票座位号（如 `1,3,5`）
- 确认无更多提名时：输入 `none`

### 昼夜流程

1. **首个夜晚**：说书人按剧本顺序逐一唤醒玩家执行技能，完成后进入白天
2. **白天**：玩家自由交流，可发动白天主动技能；之后进入提名环节，说书人统计票数并宣布处决结果
3. **后续夜晚**：按非首夜行动顺序执行技能，夜晚结束后广播死亡信息
4. **游戏结束**：无恶魔存活→善良胜；场上仅剩2人且含恶魔→邪恶胜

---

## 角色配比

| 人数 | 镇民 | 外来者 | 爪牙 | 恶魔 |
|------|------|--------|------|------|
| 5    | 3    | 0      | 1    | 1    |
| 6    | 3    | 1      | 1    | 1    |
| 7    | 5    | 0      | 1    | 1    |
| 8    | 5    | 1      | 1    | 1    |
| 9    | 5    | 2      | 1    | 1    |
| 10   | 7    | 0      | 2    | 1    |
| 11   | 7    | 1      | 2    | 1    |
| 12   | 7    | 2      | 2    | 1    |
| 13   | 9    | 0      | 3    | 1    |
| 14   | 9    | 1      | 3    | 1    |
| 15   | 9    | 2      | 3    | 1    |

部分角色技能（`[...]` 内容）会在此基础上做阵营数量调整，差额从镇民扣除。

---

## 工具系统

说书人 LLM 通过 JSON 指令驱动游戏，所有指令格式为 `{ "type": "...", "payload": {...} }`：

| 工具 | 说明 |
|------|------|
| `ask` | 阻塞等待玩家输入；`seat=0` 接受任意玩家，`seat>0` 等待指定座位 |
| `tell` | 私密告知指定座位玩家信息 |
| `broadcast` | 向所有玩家公开广播 |
| `replace_token` | 一次性替换指定座位的全部 token（数组），`seat=0` 为全局魔典 |
| `mark_death` | 标记玩家死亡，自动广播公告 |
| `set_character` | 修改玩家角色/阵营（`new_known` / `new_real` / `team`） |
| `game_over` | 结束游戏，广播胜利方与原因，并公布所有人真实身份 |

---

## 剧本格式（`game_script/*.json`）

标准 JSON 数组，每个元素为角色对象：

```jsonc
[
  { "id": "_meta", "name": "暗流涌动", ... },
  {
    "id": "washerwoman",
    "name": "洗衣妇",
    "team": "townsfolk",       // townsfolk / outsider / minion / demon / traveler
    "ability": "你知道...",
    "firstNight": 18,          // 首夜行动顺序（数字越小越先，0=不行动）
    "otherNight": 0,           // 其他夜晚顺序
    "reminders": ["是洗衣妇目标", "错误"],
    "remindersGlobal": []
  }
]
```

`traveler` 类型角色在分配时会被忽略。新剧本放入 `game_script/` 目录后自动被识别。

---

## 知识库（`knowledge/`）

Markdown 格式的游戏规则与角色说明：

- `knowledge/基础/` — 通用规则（投票、处决、中毒、醉酒、疯狂等）
- `knowledge/剧本/` — 各剧本角色汇总
- `knowledge/角色/` — 单个角色详细说明

当前版本未启用 RAG，如需引入可在 `buildInitialMessages` 中注入对应内容。
知识库数据可通过以下命令从[钟楼百科](https://clocktower-wiki.gstonegames.com/)抓取：

```bash
node scripts/spider.js
```

---

开发相关约定参见 [AGENT.MD](AGENT.MD)。

## License

本项目采用 [CC BY-NC 4.0](LICENSE) 许可协议，禁止商业用途。
