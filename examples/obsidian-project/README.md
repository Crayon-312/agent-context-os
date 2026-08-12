# Obsidian 项目示例

> 本目录仅用于演示通用接入方式，不代表任何真实项目或行业配置。

该示例展示用户项目如何以 Obsidian Vault 作为知识库，并通过 Agent Context OS Agent 建立本地索引与检索上下文。

```powershell
node ../../agent/bin/agent-context.js validate --project .
node ../../agent/bin/agent-context.js index --project .
node ../../agent/bin/agent-context.js search "库存校验" --project .
```

索引生成到 `.agent-context/local-index/`，已由 `.gitignore` 排除。
