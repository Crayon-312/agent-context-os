# 开发实现说明：Obsidian 知识库 + Agent 协作层 MVP

## 修改目标

把现有协作蓝图推进为可运行的最小业务闭环：Agent 从配置指定的 Obsidian Vault 读取 Markdown 知识，生成本地索引，并按查询返回摘要和证据路径。

## 非目标

- 不实现知识编辑、同步冲突解决、向量检索和图形界面。
- 不改变代码、测试和用户确认高于项目记忆的事实优先级。

## 变更等级与引用

- 等级：`S3`
- 方案：`plan-obsidian-agent-mvp`
- 台账：`docs/plans/obsidian-agent-mvp.md`
- 当前事实：现有代码只有蓝图、模板和检查脚本，没有 Agent 运行时或 Obsidian 适配。

## 核心方案

- 运行时：Node.js 20+，仅使用标准库。
- 配置：`memory.sources[]` 声明 `obsidian` 或 `jsonl` provider。
- 采集：递归读取 Markdown，忽略 `.obsidian`、`.git` 和 `.trash`。
- 知识模型：读取 Frontmatter 的 `id`、`type`、`status`、`scope`、`tags`、`summary` 等字段，并提取标题与双向链接。
- 索引：原子写入本地 JSON 索引，目录由 Git 排除。
- 检索：关键词、中文分词和结构化过滤加权，输出 `source_id:path` 证据引用。

## 数据流

```text
.agent-context/config.json
  -> Obsidian / JSONL provider
  -> 规范化知识文档
  -> .agent-context/local-index/index.json
  -> search 查询与过滤
  -> 摘要、类型、状态和证据路径
```

## 风险与回滚

- 简化 YAML 解析只覆盖约定的 Frontmatter 子集；复杂 YAML 留待后续成熟解析器。
- JSON 索引适合 MVP，不适合超大 Vault；provider 边界允许后续替换。
- 回滚可删除新增 Agent 文件并恢复旧配置模板；本地索引本身可直接删除重建。

## 验证矩阵

| 验证 | 预期 |
|---|---|
| `node --test` | 单元与集成测试全部通过 |
| 示例项目执行 `validate` | 配置和 Obsidian source 可识别 |
| 示例项目执行 `index` | 生成被 Git 排除的本地索引 |
| 示例项目执行 `search` | 返回相关知识及证据路径 |
| `scripts/check-agent-strong.ps1` | 蓝图、模板、项目、worktree 和 drift 检查通过 |
