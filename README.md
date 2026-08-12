# Agent Context OS

**以 Obsidian 为知识库的 AI Agent 协作开发层。**

Agent Context OS is an executable Agent collaboration layer and reusable blueprint for AI-agent-assisted software development.

它把“Agent 协作层规则”和“项目业务知识”拆开：Agent 集中管理上下文采集、索引、检索和 Agent 工作规则；Obsidian Vault 保存团队可审查的项目知识；用户项目只保留极薄入口和配置。

## 定位

Agent Context OS 不是某个项目的文档库，也不是某种技术栈的开发规范。它是一套带可运行 MVP 的 Agent 协作层，用于管理：

- Agent 进入项目的入口规则
- 上下文路由和 Token 成本控制
- S0-S3 变更分级与执行门禁
- 方案理解、方案摄取和方案落实台账
- 质量门禁和验证报告
- 单 Agent / 多 Agent 协作策略
- 多 Codex 任务并行开发隔离
- 项目记忆源与本地检索索引的边界
- 老项目 Agent 协作层原地换芯升级

项目业务背景、业务规则、用户交互习惯、团队开发习惯、代码实现摘要和历史坑，属于用户项目的项目记忆，不属于 Agent 协作层本体。

## 三层模型

| 层 | 负责内容 | 存放位置 |
|---|---|---|
| Agent 协作层 | 知识采集、索引、检索、任务拆解、上下文路由、执行门禁 | 本仓库 `agent/` 或版本化 Agent 协作层包 |
| 项目知识库 | 业务背景、业务规则、交互习惯、开发习惯、历史坑、证据路径 | 默认使用 Obsidian Vault；JSONL 作为兼容 provider |
| 本地检索索引 | 规范化知识、关键词和过滤元数据 | 用户机器本地缓存或 `.agent-context/local-index/` |

原则是：**Obsidian + Git 管事实，Agent 本地索引管搜索。**

## 可运行 MVP

运行环境要求 Node.js 20+，无需安装第三方依赖：

```powershell
node agent/bin/agent-context.js validate --project examples/obsidian-project
node agent/bin/agent-context.js index --project examples/obsidian-project
node agent/bin/agent-context.js search "库存校验" --project examples/obsidian-project
```

当前 Agent 只读知识库，支持 Obsidian Markdown、约定的 Frontmatter、双向链接提取、JSON 本地索引、关键词检索以及类型和状态过滤。详见 `docs/18-obsidian-agent-runtime.md`。

## 设计原则

1. **Agent 协作层集中**：协作规则不复制到每个项目里，升级时只替换 Agent 协作层逻辑。
2. **项目极薄**：用户项目默认只保留 `AGENTS.md`、`.agent-context/config.json`、记忆源和检查脚本。
3. **记忆可审查**：团队共享的是小型项目记忆源，不是大型向量数据库文件。
4. **索引可重建**：本地向量库或全文索引只是生成产物，不进入 Git。
5. **按需加载**：Agent 先检索摘要和路径，再读取真实代码、测试或文档。
6. **事实分级**：代码和测试优先于记忆源；记忆源优先于检索索引；索引只负责定位。
7. **原地换芯**：老项目升级时清退旧 Agent 协作层文件，只迁移有效项目记忆。
8. **成本可控**：默认不全量读文档，不上传大索引，不无脑启用多 Agent。
9. **质量可执行**：关键门禁必须能被脚本、提交流程或 CI 检查。

## 仓库结构

```text
agent-context-os/
├─ AGENTS.md
├─ docs/
│  ├─ 00-system-overview.md
│  ├─ 01-context-routing.md
│  ├─ 02-business-modeling.md
│  ├─ 03-architecture-boundaries.md
│  ├─ 04-implementation-spec.md
│  ├─ 05-quality-gates.md
│  ├─ 06-known-issues-system.md
│  ├─ 07-token-budget.md
│  ├─ 08-multi-agent-policy.md
│  ├─ 09-project-memory.md
│  ├─ 10-progressive-adoption.md
│  ├─ 11-plan-intake.md
│  ├─ 12-execution-gates.md
│  ├─ 13-project-style-profile.md
│  ├─ 14-retrieval-memory-store.md
│  ├─ 15-release-readiness-review.md
│  ├─ 16-plan-execution-ledger.md
│  ├─ 17-thin-launcher-runtime.md
│  └─ 18-obsidian-agent-runtime.md
├─ agent/
│  ├─ bin/
│  └─ src/
├─ templates/
│  ├─ project/
│  ├─ business/
│  ├─ modules/
│  └─ reports/
├─ examples/
└─ scripts/
```

## 用户项目默认结构

```text
<项目根目录>/
├─ AGENTS.md
├─ .agent-context/
│  └─ config.json
├─ <Obsidian Vault>/
│  └─ <项目知识>.md
└─ scripts/
   └─ check-agent.ps1
```

用户项目不默认复制完整 `docs/agent/`、workflow、checklist 或本地向量库文件。

## 快速接入：新项目

1. 复制 `templates/project/` 到项目根目录。
2. 替换 `.agent-context/config.json` 中的项目、Agent 协作层、Obsidian Vault 路径和验证命令。
3. 在 Obsidian Vault 中用带 Frontmatter 的 Markdown 维护项目知识；无法使用 Obsidian 时可配置 JSONL provider。
4. 确认 `.agent-context/local-index/`、`.agent-context/index/` 和缓存文件不进入 Git。
5. 执行 `scripts/check-agent.ps1`。
6. 执行 Agent 的 `validate`、`index` 和 `search` 命令验证完整闭环。

## 快速接入：老项目

老项目升级默认走原地换芯：

1. 识别旧 Agent 协作层文件和其中混入的项目记忆。
2. 将仍有效的业务背景、开发习惯、交互习惯和历史坑迁入 Obsidian Vault，并补齐约定的 Frontmatter。
3. 清退旧 Agent 协作层文件，不长期保留两套协作结构。
4. 写入新版极薄入口和 `.agent-context/config.json`。
5. 重建本地检索索引。
6. 执行 `scripts/check-agent.ps1` 和当前 Agent 协作层要求的验证。

## 核心收益

| 目标 | 机制 |
|---|---|
| 高效 | Agent 协作层集中管理规则，项目入口极薄，Agent 先检索再深读 |
| 节约 | 大型本地索引不进 Git，Token 消耗来自精准召回 |
| 更懂业务 | 业务背景、交互习惯、开发习惯和历史坑沉淀为项目记忆源 |
| 升级轻 | 老项目只换 Agent 协作层逻辑，项目记忆源和本地索引分离 |
| 团队共享 | Git 同步可审查记忆源，新成员本地重建索引 |
| 防误读 | 检索索引只定位上下文，最终以代码、测试和确认事实为准 |
| 支持多 Agent | 复杂任务由 Agent 协作层调度，多 Agent 不污染项目记忆源 |
| 支持并行开发 | 按变更等级和冲突风险选择主工作区或独立 Git worktree |

## License

MIT
