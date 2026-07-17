# BotC-AI 文档索引

本目录维护产品、架构、需求与里程碑的事实来源。任何文档都应能独立阅读，不依赖聊天记录理解。

## 文档入口

- [产品全量功能文档](product/product.md)：描述产品目标、用户流程、全部目标能力和质量要求。
- [长期里程碑规划](milestone/roadmap.md)：描述第一阶段产品化与第二阶段强化学习的交付顺序和需求拆分。
- [目标架构](architecture/architecture.md)：描述浏览器内 Agent、规则内核、权限视图、在线会话和 LLM 适配边界。
- [townsquare 固定源码来源记录](upstream/townsquare.md)：记录 townsquare 来源、版本、许可证和冻结策略。
- [本次项目初始化需求](modify/2026-07-16-project-initialization.md)：记录仓库初始化的范围与验收结果。
- [本项目测试基础设施](modify/2026-07-16-test-infrastructure.md)：记录 M0-R3 的测试分层、门禁和验收结果。
- [安全开发会话环境](modify/2026-07-16-safe-development-session.md)：记录 M0-R4 的安全配置、本地中继和验收边界。
- [M1-R1 规则范围与版本策略](modify/2026-07-16-rules-scope-version-policy.md)：冻结三个基础官方中文剧本、旅行者/传奇角色/奇遇角色范围、80 个术语、31 个能力类别、7 个重要规则主题、中文官方来源与不可变版本策略。
- [M1-R2 领域状态与事件协议](modify/2026-07-17-domain-state-event-protocol.md)：定义严格版本化状态、命令、事件、幂等回执、原子提交和事件流重放边界。
- [M1-R3 参与者权限视图](modify/2026-07-17-participant-permission-views.md)：定义四类参与者快照、可信主体绑定、旁观者只减裁剪、事件投影和信息泄漏门禁。
- [M1-R4 阶段与基础规则内核](modify/2026-07-17-phase-basic-rules-kernel.md)：实现准备、首夜/昼夜、基础生死、复活、常规处决、常规胜负和重放不变量。
- [M1-R5 提名与投票规则](modify/2026-07-17-nomination-voting-rules.md)：实现每天提名限制、环形逐席投票、死亡票、最高票/平票候选、旅行者流放、处决约束与权限投影。
- [M1-R6 角色能力执行框架](modify/2026-07-17-role-ability-execution-framework.md)：实现版本化角色规则包、能力实例、确定性触发队列、持续/延迟效果生命周期和结构化说书人裁量任务。
- [M1-R7《暗流涌动》规则包](modify/2026-07-17-trouble-brewing-rules-package.md)：实现固定 22 角色来源、5 至 15 人开局、两套夜间队列、角色能力、保护/继任/特殊胜负、权限投影和事件重放。
- [M1-R8《黯月初升》规则包](modify/2026-07-17-bad-moon-rising-rules-package.md)：实现固定 25 角色来源、教父设置与疯子认知、两套夜间队列、死亡/免死/复活、僵怖和主谋特殊流程、权限投影和事件重放。
- [M2-R2 Wiki 同步与清洗工具](modify/2026-07-17-wiki-sync-cleaning.md)：定义固定修订同步、DOM 清洗、Markdown/元数据输出、失败恢复与抓取报告。

## 维护规则

- 新需求先从 `modify/TEMPLATE.md` 创建需求文档，澄清完成后再开发。
- 大迭代先从 `milestone/TEMPLATE.md` 创建里程碑并拆分需求。
- 产品能力改变时，直接重写 `product/product.md` 的相关章节，使其始终表达当前完整产品，而不是历史补丁集合。
- 已完成的需求文档保留为决策与验收记录，但不能替代产品全量文档。
