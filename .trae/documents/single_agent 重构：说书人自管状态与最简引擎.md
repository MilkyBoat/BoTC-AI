## 关键改动
- 统一使用 `record(type, obj)` 作为信息收集接口；`obj` 在当前模式下多数为字符串（与原代码一致），即外层已拼好消息文本。
- 默认实现仅“记录与打印”，不产生业务副作用。

## 收集器设计（字符串优先）
- 接口：`record(type, obj)`。
- 入参规范：
  - `obj` 支持两类：
    - 字符串：直接打印，不再二次格式化（保留原文样式）。
    - 结构化对象：按简洁 JSON 摘要打印（仅在少数需要结构化的场景，如 `state`、`ops`）。
- 打印模板：
  - 字符串：`[type] {text}\n`（`text`为传入字符串原样）。
  - 对象：`[type] {简要JSON}\n`（例如只保留关键字段和数量统计）。
- 采集：所有记录追加到内存缓冲（时间戳、type、obj），用于后续回放或导出。

## 集成要点
- 在新目录 `src/modules/single_agent` 中，所有输出替换为 `record(type, string)`：
  - 例如旧代码 `process.stdout.write('白天检查（处决后）完成，开始应用工具调用\n')`
    → `record('info', '白天检查（处决后）完成，开始应用工具调用')`
- 仅当需要审计结构化内容时使用对象：
  - `record('ops', { count: ops.length, sample: ops.slice(0,2) })`
  - `record('state', { seats, dayCounter, nightCounter, stage })`

## single_agent 结构
- `main.js`、`engine.js`、`storyteller.js`、`state.js`、`interaction.js`、`llm.js`、`tools/timer.js`（占位）、`collector.js`（导出 `record`）。
- 引擎：最简循环，只 `applyOps` 与 `awaitResponse`；胜负通过 `ops: gameover` 结束。
- Agent：通过 `stage_transition` 驱动 1–8 的白天流程；处决后立即再次 `applyOps`。
- 暂不实现暂停；私聊/提名阶段可多次 `awaitResponse`。

## 工具与 Prompt
- 工具集合与旧版一致（去除独立 `game_end` 文件），在单一 prompt 中分阶段列出可用操作与输入约束。

## 验证
- 用最小剧本跑通白天到夜晚的完整路径，观察 `record('info', '...')` 输出；确认处决后能触发 `gameover`。

## 交付
- 新代码全部位于 `src/modules/single_agent`；不改旧模块。