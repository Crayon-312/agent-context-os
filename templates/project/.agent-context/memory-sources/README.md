# 项目记忆源

本目录是 JSONL 兼容记忆源示例。新项目默认使用 `.agent-context/config.json` 指向的 Obsidian Vault；只有无法使用 Obsidian 时才启用本目录中的 JSONL provider。它不是向量数据库，也不是本地索引目录。

## 存放内容

- 业务背景、业务规则、验收口径。
- 用户交互习惯、端侧风格、团队开发习惯。
- 模块边界、实现约束、历史坑和防复发规则。
- 指向真实代码、测试、文档或提交的证据路径。

## 不存放内容

- 本地向量库文件、索引文件、缓存文件。
- 账号、密码、密钥、凭据、token、cookie 或真实隐私数据。
- 未经确认的 Agent 推测。
- 可从代码、测试或构建产物重新生成的大文件。

## 文件命名

- 正式记忆源使用 `memory-<主题>.jsonl`，例如 `memory-auth.jsonl`。
- `_example.jsonl.example` 只作为格式参考，不会被默认 `source_paths` 纳入检索。
- 不要把 `_example`、`draft` 或其他示例文件改成真实记忆源；需要记录事实时新建正式 `memory-*.jsonl`。

## JSONL 字段

每行是一条 JSON 记忆。推荐字段：

```json
{
  "id": "mem-YYYYMMDD-001",
  "status": "current",
  "type": "business_rule",
  "scope": ["<模块名>", "<业务对象>"],
  "summary": "<一句话摘要>",
  "source": {
    "kind": "user_confirmed",
    "ref": "<来源路径或说明>",
    "date": "YYYY-MM-DD"
  },
  "evidence": ["<代码路径或测试路径>"],
  "confidence": "high",
  "last_verified": "YYYY-MM-DD",
  "tags": ["<标签>"]
}
```

## 规则

- 记忆源进入 Git（版本控制工具）。
- 本地索引由记忆源生成，不进入 Git。
- 同一事实只维护一条当前记录；过期记录标记为 `stale` 或 `deprecated`。
- Agent 召回记忆后必须回到证据路径验证高风险内容。
- 运行 `scripts/check-agent.ps1` 时，正式记忆源中的占位符和敏感标记会被拦截。
