# 方案落实台账：Obsidian 知识库协作引擎 MVP

## 状态

- 方案 ID：`plan-obsidian-engine-mvp`
- 状态：`done`
- 来源：用户要求完善“Obsidian 作为知识库，其他能力封装为 Engine 协作开发层”的方案并实现业务代码。
- 变更等级：`S3`
- 工作区：`E:/agent-context-os-worktrees/obsidian-engine-mvp`
- 分支：`codex/obsidian-engine-mvp`

## 目标

- 将 Obsidian Vault 中可审查的 Markdown 知识作为项目记忆事实源。
- 提供可运行的 Engine CLI，完成配置校验、知识采集、本地索引和证据检索闭环。
- 保持用户项目极薄，索引可重建且不进入 Git。
- 保留 provider 边界，允许后续增加全文、向量或团队服务型检索实现。

## 非目标

- 本期不提供 Obsidian 插件或图形界面。
- 本期不自动改写 Vault 内容。
- 本期不接入云端嵌入模型、远程数据库或团队权限系统。
- 本期不把检索结果提升为高于代码、测试或用户确认的事实。

## 已确认点

- Obsidian 是首选知识库载体。
- Engine 独立承担上下文路由、采集、索引和检索能力。
- 首版必须有实际可运行代码，而不只是规范或模板。
- 采用本机可执行的 Node.js 标准库实现，避免新增安装依赖。

## 开发顺序与任务

| ID | 任务 | 依赖 | 验收口径 | 状态 |
|---|---|---|---|---|
| T1 | 固化架构、配置契约和知识模型 | 无 | 台账、实现说明和影响矩阵完整 | `done` |
| T2 | 实现 Engine CLI、Vault 采集、索引和检索 | T1 | 可对示例 Vault 执行 validate、index、search | `done` |
| T3 | 添加测试、示例 Vault 和薄入口模板 | T2 | 正常、过滤、错误路径均有自动化测试 | `done` |
| T4 | 同步核心文档和结构检查 | T2、T3 | README、核心文档、模板与检查脚本一致 | `done` |
| T5 | 完整验证、台账核对和本地提交 | T1-T4 | Node 测试和强检查通过，提交只含本次改动 | `done` |

## 系统影响矩阵

| 影响类型 | 影响 |
|---|---|
| 用户影响 | 用户可在 Obsidian 中维护项目知识，通过 CLI 建索引和检索 |
| 业务影响 | 项目记忆正式来源从仅 JSONL 扩展为 Obsidian Markdown / JSONL provider |
| 模块影响 | 新增配置、provider、索引、检索和 CLI 模块 |
| 接口影响 | `.agent-context/config.json` 增加 `memory.sources[]` 契约 |
| 数据影响 | 新增可删除重建的 `.agent-context/local-index/index.json` |
| 安全影响 | Engine 只读 Vault；索引必须保持本地且不进 Git |
| 测试影响 | 增加 Node 单元和集成测试，扩展 PowerShell 强检查 |
| 发布影响 | 需要 Node.js 20+；首版通过仓库命令运行，不自动发布包 |

## 多 Agent 分工

- 未启用。配置、采集、索引和检索组成强串行契约，首版由单 Agent 完成并统一验证。

## 完成核对

- 总任务：5
- 完成：5
- 阻塞：0
- 延期：0
- 未开始或进行中：0

## 变更记录

- 2026-08-12：根据用户执行要求创建台账并转为 `active`。
- 2026-08-12：Engine MVP、示例、测试和文档完成，7 项 Node 测试与强检查通过，台账转为 `done`。
