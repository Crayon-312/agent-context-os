# 发布前质量审查记录

本文记录 Agent Context OS 作为可交付蓝图对外提供前的质量审查结论、发现项、修复状态和验证方式。

## 审查范围

- 根目录协作入口、README 和系统文档。
- `templates/project/` 下游项目模板。
- `templates/business/`、`templates/modules/`、`templates/reports/` 通用模板。
- `scripts/` 根仓库检查脚本。
- 下游项目复制模板后的脚本可用性。
- 敏感信息、危险命令、JSON / JSONL 结构、换行和 Git 状态。

## 发现与修复记录

| 编号 | 问题 | 风险 | 状态 |
|---|---|---|---|
| RR-001 | `templates/project/` 未包含项目级检查脚本 | 用户复制模板后没有极薄入口和项目记忆源检查，质量门禁可能落空 | 已修复：新增 `templates/project/scripts/check-agent.ps1` 并由根检查脚本校验 |
| RR-002 | README 新项目接入步骤指向根仓库检查脚本 | 下游项目按文档操作时可能找不到 `scripts/check-agent-context-os.ps1` | 已修复：改为运行项目模板内的检查脚本 |
| RR-003 | README 仓库结构未列出 `docs/14-retrieval-memory-store.md` | 结构说明与实际仓库不一致，用户可能漏读检索式记忆规范 | 已修复 |
| RR-004 | drift 检查未覆盖脚本、配置和常见构建文件 | `.ps1`、JSON、YAML、Dockerfile 等高风险改动可能绕过文档同步检查 | 已修复：扩展代码/配置路径识别范围 |
| RR-005 | drift 检查在下游项目缺少 `docs/agent` 时会跳过 | 未正确接入模板的项目可能误以为检查通过 | 已修复：仅蓝图模板仓库允许跳过，下游项目缺失时失败 |
| RR-006 | 旧 memory-store 检查和新极薄入口不匹配 | 强检查会要求用户项目保留旧协作文档结构 | 已修复：改为校验 `.agent-context/config.json`、项目记忆源和本地索引排除规则 |
| RR-007 | 项目记忆源缺少敏感信息边界 | 账号、密钥、token、cookie 等敏感标记可能被写入记忆源 | 已修复：项目模板和检查脚本明确禁止敏感信息进入记忆源 |
| RR-008 | 默认隐私标记只覆盖英文词 | 中文项目中“密码”“密钥”“凭据”等敏感词不易被拦截 | 已修复：补充中文敏感标记 |
| RR-009 | 主检查未覆盖薄入口配置 | 模板结构变化后，旧检查可能仍要求 `docs/agent/` | 已修复：根检查脚本校验薄入口配置和项目级检查脚本 |
| RR-010 | `templates/project/` 未包含 `.gitattributes` 和 `.gitignore` | 用户初始化 Git 后可能出现换行噪声，或误提交环境变量、日志和构建产物 | 已修复：模板项目包含基础 Git 文件并纳入根检查 |
| RR-011 | drift 检查返回空 Git 改动集合时不稳定 | 干净项目可能误报失败，且没有清晰错误原因 | 已修复：显式返回字符串数组 |
| RR-012 | 多个检查脚本分散，任务收尾时容易漏跑 worktree、drift 或空白检查 | 关键协作链路只靠 Agent 自觉，可能在改动后未进行完整强检查 | 已修复：新增 `scripts/check-agent-strong.ps1` 聚合强检查矩阵，并由模板和质量门禁引用 |
| RR-013 | 生产项目配置允许关键占位符残留 | 老项目可能只替换项目名就检查通过，但实际未接入可加载 Agent 协作层或本地索引 | 已修复：项目检查脚本在非模板模式下校验 agent、local_index 和 validation_commands |
| RR-014 | 示例 JSONL 会被默认纳入项目记忆源 | Agent 可能召回 `<模块名>`、`YYYY-MM-DD` 等占位符，污染业务上下文 | 已修复：示例改为 `_example.jsonl.example`，默认只匹配 `memory-*.jsonl` |
| RR-015 | 敏感信息检查只停留在文档说明 | 账号、密码、密钥、token、cookie 等内容可能进入正式记忆源 | 已修复：项目检查脚本递归扫描正式记忆源的敏感标记 |
| RR-016 | 薄入口项目的 drift 责任不清 | 下游项目可能把旧 drift 脚本当成完整运行态门禁 | 已修复：drift 脚本先运行项目检查，并明确薄入口运行态门禁由当前 Agent 协作层负责 |

## 剩余边界

- 检查脚本只能拦截明确的敏感标记，不能证明所有真实隐私数据都不存在。
- drift 检查只能基于 Git 工作区判断变更，无法替代项目自身测试、构建和业务验收。
- 本仓库提供 PowerShell 脚本；非 Windows 环境应确认 PowerShell 可用。

## 发版前验证清单

- 优先运行 `scripts/check-agent-strong.ps1`。
- 必要时单独运行 `scripts/check-agent-context-os.ps1`。
- 必要时单独运行 `scripts/check-agent-project.ps1 -ProjectRoot templates/project -AllowPlaceholders`。
- 必要时单独运行 `scripts/check-agent-worktrees.ps1`。
- 必要时单独运行 `scripts/check-agent-drift.ps1`。
- 对极薄入口配置、项目记忆源、本地索引排除规则、占位符、敏感标记和 drift 进行负向验证。
- 扫描敏感信息和危险命令。
- 检查 `.ps1` 换行符合 `.gitattributes`。
- 确认 Git 工作区干净。
