# Obsidian 协作引擎运行时

## 定位

Engine 是 Obsidian 项目知识库与 Agent 协作流程之间的运行层。首版提供可执行的最小闭环，而不是替代 Obsidian 编辑体验或实现完整知识管理平台。

## 运行要求

- Node.js 20 或更高版本。
- 不依赖第三方运行时包。
- 用户项目具有 `.agent-context/config.json`。
- Obsidian Vault 可由本机路径访问。

## 命令

```powershell
node <Engine路径>/engine/bin/agent-context.js validate --project <项目路径>
node <Engine路径>/engine/bin/agent-context.js index --project <项目路径>
node <Engine路径>/engine/bin/agent-context.js search "<查询>" --project <项目路径>
```

所有命令支持 `--json` 输出结构化结果。`search` 还支持 `--limit`、`--type` 和 `--status` 过滤。

## 配置契约

```json
{
  "memory": {
    "sources": [
      {
        "id": "project-vault",
        "provider": "obsidian",
        "path": "<Obsidian Vault 路径>",
        "required_frontmatter": ["id", "type", "status", "summary"]
      }
    ],
    "local_index": {
      "provider": "embedded-json",
      "path": ".agent-context/local-index",
      "git_tracked": false
    }
  }
}
```

`path` 相对路径以用户项目根目录为基准，也允许绝对路径。Engine 兼容旧 `memory.source_paths`，但新项目应使用 `memory.sources[]`。

## Obsidian 知识契约

每份正式知识至少包含：

```yaml
---
id: <稳定且唯一的知识 ID>
type: <project_fact | business_rule | interaction_rule | architecture_rule | implementation_note | known_issue | decision | open_question>
status: <current | draft | assumption | stale | deprecated>
summary: <一句话摘要>
scope: [<模块或业务对象>]
tags: [<检索标签>]
confidence: <high | medium | low>
last_verified: YYYY-MM-DD
---
```

Engine 会忽略 `.obsidian`、`.git`、`.trash` 和配置中的排除目录，读取正文标题、标签及 `[[双向链接]]`，并把知识规范化为本地索引记录。

## 安全和事实边界

- Engine 对 Vault 只读，不自动创建或修改 Markdown。
- 本地索引必须被 Git 排除，可随时删除重建。
- 不得把账号、密钥、token、cookie 或真实隐私数据写入 Vault 或索引。
- 检索结果只用于定位上下文；高风险结论必须回到代码、测试、知识原文或用户确认验证。
- 重复知识 ID 会使索引失败，缺少必需 Frontmatter 的文件会被报告并跳过。

## 当前限制

- Frontmatter 只支持引擎约定的 YAML 子集，包括标量、行内数组和简单列表。
- 当前索引为 JSON 文件和关键词加权检索，适合 MVP 和中小型 Vault。
- 尚未实现增量索引、SQLite 全文检索、向量检索、知识写回、Obsidian 插件和团队权限服务。
