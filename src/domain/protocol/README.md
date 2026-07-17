# 领域协议模块

`src/domain/protocol/` 是房主浏览器中的权威状态与事件底座，不依赖 Vue、Vuex、WebSocket 或 LLM。当前协议版本为 `0.2.0`：`game.create` 固定 M1-R1 规则范围身份并进入准备阶段，`src/domain/rules/` 在同一命令总线上提供开局、首夜/昼夜、基础生死、复活、常规处决和常规胜负。提名投票、具体角色、特殊胜负和 UI 接入仍由后续 M1 需求实现。

## 最小用法

```js
import {
  createDomainProtocol,
  createGameCommand,
  createStartGameCommand,
} from "@/domain/protocol";

const engine = createDomainProtocol({ gameId: "game-001" });
const receipt = engine.dispatch(
  createGameCommand({
    commandId: "command-001",
    gameId: "game-001",
    expectedRevision: 0,
    actor: { kind: "host", id: "host-001" },
    seed: "seed-001",
  }),
);

engine.dispatch(
  createStartGameCommand({
    commandId: "command-002",
    gameId: "game-001",
    expectedRevision: receipt.revisionAfter,
    actor: { kind: "host", id: "host-001" },
    seats: [
      { seatId: "seat-1", order: 1, characterType: "demon" },
      { seatId: "seat-2", order: 2, characterType: "townsfolk" },
      { seatId: "seat-3", order: 3, characterType: "minion" },
    ],
  }),
);

const state = engine.getState();
const stream = engine.exportEventStream();
```

生产调用方需要为每条新命令提供新的稳定命令 ID，并使用最近一次状态的 `revision` 作为 `expectedRevision`。同一命令重试必须原样复用命令 ID 和内容；修订冲突后若需要再次表达意图，必须读取最新状态并创建新命令。

## 基础规则入口

`@/domain/rules` 与 `@/domain/protocol` 都导出以下命令构造器：

- `createStartGameCommand`：提交连续席位和基础角色类型并进入首夜。
- `createAdvancePhaseCommand`：按首夜、白天、其他夜晚的固定顺序推进。
- `createKillPlayerCommand` / `createRevivePlayerCommand`：改变基础生死并保留原因；真正死亡后自动检查常规胜负。
- `createResolveExecutionCommand`：在白天原子记录处决、可能的死亡、胜负或入夜。

这些控制命令当前只接受 `host` 与 `system` 审计主体。角色类型只服务基础阶段与常规胜负，不表示具体角色能力或标准设置已经实现。每个成功命令批次和事件流恢复边界都会验证席位唯一、昼夜编号、处决记录与胜负一致性。

## 扩展约束

- 新命令和事件必须在创建引擎时以定义注册，并提供严格负载 Schema。
- 命令处理器只读取冻结状态并返回候选事件或结构化拒绝，不能直接修改状态。
- 事件归约器必须是同步纯函数，不读取时间、随机数、网络或浏览器存储。
- 不允许注册通用状态补丁事件；每项状态变化都应有稳定领域语义和对应测试。
- 恢复包含扩展事件的日志时，必须提供与写入时相同的命令和事件定义版本；`0.1.0` 事件流不会被 `0.2.0` 静默补字段。
- 权威状态与完整事件流只能保留在房主侧；面向参与者的数据必须等待 M1-R3 权限投影。

测试中应注入确定性的 `clock` 与 `idFactory`。生产默认 ID 工厂使用浏览器 `crypto.randomUUID()`；不支持该能力的环境必须显式提供安全实现。
