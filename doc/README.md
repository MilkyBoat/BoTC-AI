# BotC-AI 文档索引

本目录维护产品、架构、需求与里程碑的事实来源。任何文档都应能独立阅读，不依赖聊天记录理解。

## 文档入口

- [产品全量功能文档](product/product.md)：描述产品目标、用户流程、全部目标能力和质量要求。
- [长期里程碑规划](milestone/roadmap.md)：描述第一阶段产品化与第二阶段强化学习的交付顺序和需求拆分。
- [目标架构](architecture/architecture.md)：描述浏览器内 Agent、规则内核、权限视图、在线会话和 LLM 适配边界。
- [上游基线与同步约定](upstream/townsquare.md)：记录 townsquare 来源、版本、许可证和同步方法。
- [本次项目初始化需求](modify/2026-07-16-project-initialization.md)：记录仓库初始化的范围与验收结果。
- [站点部署需求](modify/2026-07-16-site-deployment.md)：记录魔典站点发布目标、授权、验收条件与当前阻断。

## 维护规则

- 新需求先从 `modify/TEMPLATE.md` 创建需求文档，澄清完成后再开发。
- 大迭代先从 `milestone/TEMPLATE.md` 创建里程碑并拆分需求。
- 产品能力改变时，直接重写 `product/product.md` 的相关章节，使其始终表达当前完整产品，而不是历史补丁集合。
- 已完成的需求文档保留为决策与验收记录，但不能替代产品全量文档。
