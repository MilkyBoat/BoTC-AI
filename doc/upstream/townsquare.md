# townsquare 上游基线与同步约定

## 当前基线

- 上游仓库：`https://github.com/bra1n/townsquare.git`
- 默认分支：`develop`
- 导入提交：`d9c2b17dc9b2d7b091b55c988707784f12980f44`
- 上游包版本：`2.16.2`
- 导入日期：2026-07-16
- 许可证：GPL-3.0

当前仓库以一个新的本地初始提交保存上游源码快照，没有把 BotC-AI 的 `main` 直接设为上游历史分支。`upstream/develop` 与 `upstream/main` 只用于比较和获取更新。

## 初始化时的安全差异

- 包名与版本改为 `botc-ai@0.1.0`，保留上游作者归属。
- 删除上游 `CNAME`，避免错误声明或发布到 `clocktower.online`。
- GitHub Pages 工作流改为仅手动触发，避免 Push 到本仓库主分支时自动发布。
- 根 README 增加 BotC-AI 目标与文档入口，上游原始说明完整保留在其后。

## 同步原则

1. 同步上游属于独立需求，必须先创建 `doc/modify/` 文档并明确目标版本。
2. 获取更新前确认工作区干净，不直接在 `upstream/*` 分支修改。
3. 先比较源码、依赖、许可证、在线协议、部署文件和素材变化，再选择合并或按模块移植。
4. 保留 BotC-AI 的规则内核、权限视图和 Agent 边界，不允许上游同步绕过这些层。
5. 同步后运行单元、场景、在线协议回归、Lint 和生产构建。
6. 更新本文的基线提交和差异说明，并使用本仓库 QQ 邮箱身份本地提交。

## 常用只读命令

```bash
git fetch upstream develop main
git log --oneline --decorate HEAD..upstream/develop
git diff --stat HEAD...upstream/develop
git show upstream/develop:CHANGELOG.md
```

禁止把 BotC-AI 分支 Push 到 `upstream`。需要向原项目贡献时，应在独立需求中使用个人 Fork 和单独分支。
