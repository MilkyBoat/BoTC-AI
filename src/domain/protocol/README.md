# 领域协议模块

`src/domain/protocol/` 是房主浏览器中的权威状态与事件底座，不依赖 Vue、Vuex、WebSocket 或 LLM。当前协议版本为 `0.1.0`，只内置 `game.create` / `game.created` 初始化切片；它固定 M1-R1 规则范围身份，但不表示具体游戏规则已经实现。

## 最小用法

```js
import {
  createDomainProtocol,
  createGameCommand,
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

const state = engine.getState();
const stream = engine.exportEventStream();
```

生产调用方需要为每条新命令提供新的稳定命令 ID，并使用最近一次状态的 `revision` 作为 `expectedRevision`。同一命令重试必须原样复用命令 ID 和内容；修订冲突后若需要再次表达意图，必须读取最新状态并创建新命令。

## 扩展约束

- 新命令和事件必须在创建引擎时以定义注册，并提供严格负载 Schema。
- 命令处理器只读取冻结状态并返回候选事件或结构化拒绝，不能直接修改状态。
- 事件归约器必须是同步纯函数，不读取时间、随机数、网络或浏览器存储。
- 不允许注册通用状态补丁事件；每项状态变化都应有稳定领域语义和对应测试。
- 恢复包含扩展事件的日志时，必须提供与写入时相同的命令和事件定义版本。
- 权威状态与完整事件流只能保留在房主侧；面向参与者的数据必须等待 M1-R3 权限投影。

测试中应注入确定性的 `clock` 与 `idFactory`。生产默认 ID 工厂使用浏览器 `crypto.randomUUID()`；不支持该能力的环境必须显式提供安全实现。
