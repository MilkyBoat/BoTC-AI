# 参与者权限视图

本模块实现独立版本 `0.1.0` 的只读参与者投影。调用方只能通过
`createParticipantViewService({ resolvePrincipal })` 创建服务，并使用：

- `createSnapshot(source, credential)`：由可信主体解析器决定唯一视图类型；
- `projectEvent(source, event, credential)`：按已注册事件类型生成最小视图事件。

模块不会先复制完整真相再删字段。`SeatView` 只从认知与已投递信息构造，
`ObserverView` 只从 `PublicView` 继续删除，隐藏事件返回 `null`，未知事件失败关闭。
领域事件 ID、权威序号、因果命令 ID、Prompt、模型数据和凭据均不进入投影结果。

`ParticipantViewSource` 当前是 M1-R3 的房主侧只读接入契约。后续真实领域状态必须
由可信适配器生成该契约，UI、远端客户端和 Agent 不得自行拼装。
