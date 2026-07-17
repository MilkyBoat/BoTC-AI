# 参与者权限视图

本模块实现独立版本 `0.2.0` 的只读参与者投影。调用方只能通过
`createParticipantViewService({ resolvePrincipal })` 创建服务，并使用：

- `createSnapshot(source, credential)`：由可信主体解析器决定唯一视图类型；
- `projectEvent(source, event, credential)`：按已注册事件类型生成最小视图事件。

模块不会先复制完整真相再删字段。`SeatView` 只从认知与已投递信息构造，
`ObserverView` 只从 `PublicView` 继续删除，隐藏事件返回 `null`，未知事件失败关闭。
领域事件 ID、权威序号、因果命令 ID、Prompt、模型数据和凭据均不进入投影结果。

公开席位状态包含 `deadVoteAvailable`，不能从“已经死亡”推断死亡票仍可用。内置投影器支持提名打开、投票打开、逐席投票、投票关闭、流放打开、逐席支持与流放关闭事件，只正向保留公开流程字段并移除 `ruleSourceId` 等房主侧元数据。`ObserverView` 在 `includeVoteDetails=false` 时隐藏单席投票与流放支持，并从最终结果删除投票/支持席位列表，但保留真实总数、门槛、处决候选和成功结果。

`ParticipantViewSource` 当前仍是房主侧只读接入契约。M1-R5 已在权威状态中提供生死、死亡票、提名、投票、候选与流放事实，但后续仍须由房主可信适配器把完整角色、认知和规则信息生成该契约；UI、远端客户端和 Agent 不得自行拼装。
