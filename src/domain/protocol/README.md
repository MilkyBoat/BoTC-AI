# 领域协议模块

`src/domain/protocol/` 是房主浏览器中的权威状态与事件底座，不依赖 Vue、Vuex、WebSocket 或 LLM。当前协议版本为 `0.6.0`：`game.create` 精确绑定 M1-R1 规则集和一个不可变角色规则包，`src/domain/rules/` 提供基础阶段、生死、提名投票、流放、处决与常规胜负，`src/domain/abilities/` 提供能力实例、触发队列、效果生命周期和结构化说书人裁量。仓库既保留不含具体角色的默认框架包，也提供 `src/domain/rulesets/trouble-brewing/` 与 `src/domain/rulesets/bad-moon-rising/` 中完整的《暗流涌动》和《黯月初升》规则包。

## 最小用法

```js
import {
  createDomainProtocol,
  createGameCommand,
  M1_ROLE_ABILITY_FRAMEWORK_PACKAGE,
  createStartGameCommand,
} from "@/domain/protocol";

const engine = createDomainProtocol({
  gameId: "game-001",
  rolePackage: M1_ROLE_ABILITY_FRAMEWORK_PACKAGE,
});
const receipt = engine.dispatch(
  createGameCommand({
    commandId: "command-001",
    gameId: "game-001",
    expectedRevision: 0,
    actor: { kind: "host", id: "host-001" },
    seed: "seed-001",
    rulePackage: M1_ROLE_ABILITY_FRAMEWORK_PACKAGE.identity,
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
    abilityInstances: [],
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
- `createOpenNominationCommand`：由存活席位发起当天普通提名，同一玩家每天只能提名和被提名一次，旅行者不能成为目标。
- `createOpenVoteCommand`：由 Host/System 从辩护阶段打开投票，内核固定从被提名者下一席开始、以被提名者结束的顺序与存活人数门槛。
- `createRecordVoteCommand`：只记录当前游标席位的布尔决定；死亡赞成票会原子消耗死亡票。
- `createCloseVoteCommand`：由 Host/System 在全部席位完成后结算票数、最高票、平票与唯一处决候选。
- `createOpenExileCommand` / `createSetExileSupportCommand` / `createCloseExileCommand`：提议、设置或修改支持并结算旅行者流放；门槛按全部席位，流放不消耗死亡票。
- `createResolveExecutionCommand`：只对当前唯一候选原子记录处决、可能的死亡、胜负或入夜；旅行者始终拒绝。

窗口打开/关闭、阶段、生死和处决控制命令只接受 `host` 与 `system` 审计主体。提名、逐席投票、流放提议与逐席支持还接受 `seat` 主体，但主体 ID 必须等于负载中的行动席位；Host/System 可代理明确席位。角色类型只服务基础阶段、常规胜负和旅行者边界；具体角色与标准设置必须由已装载规则包验证。

`game.start` 的席位可选携带真实角色、感知角色、阵营和角色实例 ID；命令、`game.started` 事件与权威状态还可携带严格的 `troubleBrewing` 或 `badMoonRising` 子状态。空框架对局可不提供这些字段；协议不提供任意自由写扩展容器。

任意时刻最多存在一个活动普通提名或流放。活动窗口期间基础生死、复活、阶段和处决被冻结；有处决候选时不能按无人处决直接入夜。每个成功命令批次和事件流恢复边界都会验证席位唯一、昼夜编号、提名历史、投票游标、死亡票、候选、流放、处决记录与胜负一致性。

## 角色能力框架入口

创建协议实例时只装载一个通过 `createRoleAbilityPackage` 编译的规则包。清单保存包身份、M1 规则集精确绑定、能力定义、固定来源、触发、动作主体、限次、死亡保留、醉酒/中毒策略和允许的语义事件；同步运行时提供纯处理器与严格事件定义。清单完整性、处理器集合或事件白名单不一致时不能创建可写引擎。

角色包运行时可以只读声明 `validateGameStart`、`handlePhaseAdvance`、`handleKill`、`handleRevive` 和 `handleExecution` 五个白名单钩子。开局钩子只能返回空值或严格领域错误；其余钩子返回空值时继续基础逻辑，返回标准命令处理结果时接管当次结算。基础不变量仍严格验证常规胜负；圣徒、镇长和主谋等特殊胜负由角色包扩展语义继续验证。

`@/domain/abilities` 导出以下通用命令构造器：

- `createReplaceAbilityInstancesCommand`：角色变化或能力得失时原子终止旧实例来源记录并安装新实例；新实例可产生进场触发。
- `createSetAbilityConditionCommand`：由 Host/System 创建或解除来源化的醉酒、中毒和失去能力条件。
- `createResolveAbilityTriggerCommand` / `createCancelAbilityTriggerCommand`：只结算队首触发，Seat 只能处理包内声明属于自己的动作。
- `createCancelAbilityEffectCommand`：按封闭原因终止持续或延迟效果。
- `createResolveAbilityAdjudicationCommand` / `createCancelAbilityAdjudicationCommand`：由 Host/System 解决或取消仅说书人可见的结构化裁量任务。

首夜、其他夜、进场、明确领域事件与到期延迟效果由确定性反应器自动排队，调用方不能上传顺序。能力处理器只接收冻结状态、触发和已校验输入，只能返回包白名单事件、来源化效果和至多一个裁量任务；非法计划、重复 ID、超过用量或 256 个连锁事件上限会使整个命令失败且不写日志。阶段仍有待触发或裁量时不能推进。

## 《暗流涌动》入口

`@/domain/rulesets/trouble-brewing` 导出专用创建、恢复、开局、猎手动作与权限投影入口。`createTroubleBrewingDomainProtocol` 固定装载 `botc-ai.trouble-brewing@0.1.0`，`createTroubleBrewingGameCommand` 自动绑定包身份，`createTroubleBrewingStartCommand` 把已校验角色分配转换成席位、能力实例和严格 `troubleBrewing` 子状态；也可先用 `generateTroubleBrewingSetup` 从固定种子生成合法的 5 至 15 人开局。

规则包固定 22 个角色来源和首夜/其他夜顺序。常规玩家交互使用能力框架的队首结算命令，猎手的白天公开尝试使用 `createSlayerUseCommand`。保护、免疫、死亡转移、恶魔继任、处决插入和特殊胜负通过开局/阶段/死亡/处决白名单钩子与包内语义事件接管基础边界；同一事件流必须用 `restoreTroubleBrewingDomainProtocol` 和完全相同的包恢复。

`createTroubleBrewingParticipantView` 只从房主侧权威状态正向构造 `storyteller`、`seat`、`public` 或 `observer` 快照。座位主体必须绑定明确 `seatId`，只获得自己的感知角色和已投递信息；公开与旁观主体不获得真相角色、干扰项、邪恶方信息、间谍魔典、登记或标记。

## 《黯月初升》入口

`@/domain/rulesets/bad-moon-rising` 导出专用创建、恢复、开局与权限投影入口。`createBadMoonRisingDomainProtocol` 固定装载 `botc-ai.bad-moon-rising@0.1.0`，`createBadMoonRisingStartCommand` 把 25 角色分配、教父设置修正、祖母孙子、疯子伪信息和恶魔伪装转换成严格席位、能力实例与 `badMoonRising` 子状态；也可用 `generateBadMoonRisingSetup` 从固定种子生成合法 5 至 15 人开局。

包内死亡管线区分免死、表面死亡和实际死亡，保存每个目标的来源归因；处决钩子允许存活目标被处决但不死，并处理僵怖与主谋特殊流程。复活钩子只接受教授或沙巴洛斯来源，原子保留旧能力实例、建立新角色实例和重置能力用量。`restoreBadMoonRisingDomainProtocol` 只归约固定包事件；`createBadMoonRisingParticipantView` 对公开、旁观、座位和说书人分别正向构造最小字段。

## 扩展约束

- 新命令和事件必须在创建引擎时以定义注册，并提供严格负载 Schema。
- 命令处理器只读取冻结状态并返回候选事件或结构化拒绝，不能直接修改状态。
- 事件归约器必须是同步纯函数，不读取时间、随机数、网络或浏览器存储。
- 不允许注册通用状态补丁事件；每项状态变化都应有稳定领域语义和对应测试。
- 恢复日志时必须再次提供与事件流身份完全相同且校验通过的角色规则包；恢复只归约已记录事件，不重新运行处理器或反应器。`0.1.0` 至 `0.5.0` 事件流不会被 `0.6.0` 静默补充角色真相、剧本状态或结算语义。
- 权威状态与完整事件流只能保留在房主侧；面向参与者的数据必须经过 `src/domain/views/` 的正向权限投影。

测试中应注入确定性的 `clock` 与 `idFactory`。生产默认 ID 工厂使用浏览器 `crypto.randomUUID()`；不支持该能力的环境必须显式提供安全实现。
