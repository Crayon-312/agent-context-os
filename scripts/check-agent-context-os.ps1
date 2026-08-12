$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Issues = New-Object System.Collections.Generic.List[string]

function Add-Issue {
    param([string]$Message)
    $Issues.Add($Message) | Out-Null
}

function Test-RequiredFile {
    param([string]$RelativePath)
    $Path = Join-Path $Root $RelativePath
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Add-Issue "Missing file: $RelativePath"
    }
}

function Test-RequiredDirectory {
    param([string]$RelativePath)
    $Path = Join-Path $Root $RelativePath
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        Add-Issue "Missing directory: $RelativePath"
    }
}

function Test-ContainsText {
    param(
        [string]$RelativePath,
        [string]$ExpectedText
    )

    $Path = Join-Path $Root $RelativePath
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return
    }

    $Content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    if (-not $Content.Contains($ExpectedText)) {
        Add-Issue "File '$RelativePath' does not reference '$ExpectedText'"
    }
}

function Invoke-CheckScript {
    param(
        [string]$RelativePath,
        [string[]]$Arguments = @()
    )

    $Path = Join-Path $Root $RelativePath
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Add-Issue "Check script not found: $RelativePath"
        return
    }

    $Output = & powershell -NoProfile -ExecutionPolicy Bypass -File $Path @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        Add-Issue "Check script failed: $RelativePath"
        foreach ($Line in $Output) {
            Add-Issue "  $Line"
        }
    }
}

$RequiredDirectories = @(
    "docs",
    "templates",
    "templates/project",
    "templates/project/.agent-context",
    "templates/project/.agent-context/memory-sources",
    "templates/project/scripts",
    "templates/business",
    "templates/modules",
    "templates/reports",
    "examples",
    "scripts"
)

$RequiredFiles = @(
    "README.md",
    "AGENTS.md",
    "LICENSE",
    ".gitignore",
    ".gitattributes",
    "docs/00-system-overview.md",
    "docs/01-context-routing.md",
    "docs/02-business-modeling.md",
    "docs/03-architecture-boundaries.md",
    "docs/04-implementation-spec.md",
    "docs/05-quality-gates.md",
    "docs/06-known-issues-system.md",
    "docs/07-token-budget.md",
    "docs/08-multi-agent-policy.md",
    "docs/09-project-memory.md",
    "docs/10-progressive-adoption.md",
    "docs/11-plan-intake.md",
    "docs/12-execution-gates.md",
    "docs/13-project-style-profile.md",
    "docs/14-retrieval-memory-store.md",
    "docs/15-release-readiness-review.md",
    "docs/16-plan-execution-ledger.md",
    "docs/17-thin-launcher-runtime.md",
    "docs/18-obsidian-agent-runtime.md",
    "agent/bin/agent-context.js",
    "agent/src/cli.js",
    "agent/src/config.js",
    "agent/src/frontmatter.js",
    "agent/src/index-store.js",
    "agent/src/memory-schema.js",
    "agent/src/search.js",
    "agent/src/version.js",
    "agent/src/providers/obsidian.js",
    "agent/src/providers/jsonl.js",
    "package.json",
    "templates/project/.gitignore",
    "templates/project/.gitattributes",
    "templates/project/AGENTS.md",
    "templates/project/.agent-context/config.json",
    "templates/project/.agent-context/memory-sources/README.md",
    "templates/project/.agent-context/memory-sources/_example.jsonl.example",
    "templates/project/scripts/check-agent.ps1",
    "templates/business/module-overview.md",
    "templates/business/business-flow.md",
    "templates/business/field-rules.md",
    "templates/business/state-machine.md",
    "templates/business/api-contract.md",
    "templates/business/edge-cases.md",
    "templates/business/acceptance.md",
    "templates/modules/module-card.md",
    "templates/reports/implementation-spec.md",
    "templates/reports/task-report.md",
    "templates/reports/plan-intake-report.md",
    "templates/reports/known-issue.md",
    "scripts/check-agent-context-os.ps1",
    "scripts/check-agent-project.ps1",
    "scripts/check-agent-drift.ps1",
    "scripts/check-agent-worktrees.ps1",
    "scripts/check-agent-strong.ps1"
)

foreach ($Directory in $RequiredDirectories) {
    Test-RequiredDirectory $Directory
}

foreach ($File in $RequiredFiles) {
    Test-RequiredFile $File
}

Test-ContainsText "README.md" "thin-launcher"
Test-ContainsText "README.md" "local-index"
Test-ContainsText "AGENTS.md" "Agent Context OS"
Test-ContainsText "AGENTS.md" "check-agent-strong.ps1"
Test-ContainsText ".gitattributes" "*.ps1 text eol=crlf"
Test-ContainsText "docs/00-system-overview.md" ".agent-context/config.json"
Test-ContainsText "docs/01-context-routing.md" ".agent-context/config.json"
Test-ContainsText "docs/05-quality-gates.md" "check-agent-strong.ps1"
Test-ContainsText "docs/09-project-memory.md" ".agent-context/memory-sources/"
Test-ContainsText "docs/10-progressive-adoption.md" "check-agent.ps1"
Test-ContainsText "docs/11-plan-intake.md" "discussion_only"
Test-ContainsText "docs/12-execution-gates.md" "S0"
Test-ContainsText "docs/13-project-style-profile.md" ".agent-context/memory-sources/"
Test-ContainsText "docs/14-retrieval-memory-store.md" "local-index"
Test-ContainsText "docs/15-release-readiness-review.md" "RR-001"
Test-ContainsText "docs/16-plan-execution-ledger.md" "confirmed"
Test-ContainsText "docs/17-thin-launcher-runtime.md" "Memory Source"
Test-ContainsText "docs/17-thin-launcher-runtime.md" "local-index"
Test-ContainsText "docs/18-obsidian-agent-runtime.md" "provider"
Test-ContainsText "docs/18-obsidian-agent-runtime.md" "Frontmatter"
Test-ContainsText "agent/src/providers/obsidian.js" ".obsidian"
Test-ContainsText "agent/src/index-store.js" "buildIndex"
Test-ContainsText "agent/src/search.js" "searchIndex"
Test-ContainsText "package.json" "node --test"
Test-ContainsText "templates/project/.gitattributes" "*.ps1 text eol=crlf"
Test-ContainsText "templates/project/.gitignore" ".agent-context/local-index/"
Test-ContainsText "templates/project/.gitignore" ".agent-context/cache/"
Test-ContainsText "templates/project/AGENTS.md" ".agent-context/config.json"
Test-ContainsText "templates/project/AGENTS.md" "local-index"
Test-ContainsText "templates/project/.agent-context/config.json" "thin-launcher"
Test-ContainsText "templates/project/.agent-context/config.json" "sources"
Test-ContainsText "templates/project/.agent-context/config.json" "obsidian"
Test-ContainsText "templates/project/.agent-context/config.json" '"agent"'
Test-ContainsText "templates/project/.agent-context/config.json" "git_tracked"
Test-ContainsText "templates/project/.agent-context/memory-sources/README.md" "JSONL"
Test-ContainsText "templates/project/.agent-context/memory-sources/README.md" "_example.jsonl.example"
Test-ContainsText "templates/project/.agent-context/memory-sources/_example.jsonl.example" "mem-YYYYMMDD-001"
Test-ContainsText "templates/project/scripts/check-agent.ps1" "local_index.git_tracked"
Test-ContainsText "templates/project/scripts/check-agent.ps1" "SensitiveValuePatterns"
Test-ContainsText "templates/project/scripts/check-agent.ps1" "SensitiveFieldNames"
Test-ContainsText "templates/project/scripts/check-agent.ps1" "Test-ObsidianSource"
Test-ContainsText "templates/business/field-rules.md" "field_name"
Test-ContainsText "templates/reports/implementation-spec.md" "Obsidian Vault"
Test-ContainsText "templates/reports/task-report.md" "local-index"
Test-ContainsText "templates/reports/plan-intake-report.md" "discussion_only"
Test-ContainsText "scripts/check-agent-project.ps1" "check-agent.ps1"
Test-ContainsText "scripts/check-agent-drift.ps1" "thin-launcher"
Test-ContainsText "scripts/check-agent-drift.ps1" "runtime drift is enforced by current agent"
Test-ContainsText "scripts/check-agent-worktrees.ps1" "git worktree list"
Test-ContainsText "scripts/check-agent-strong.ps1" "check-agent-project.ps1"
Test-ContainsText "scripts/check-agent-strong.ps1" "Invoke-ExpectedFailureScript"
Test-ContainsText "scripts/check-agent-strong.ps1" "diff"

$ProjectTemplateCheckArgs = @("-ProjectRoot", "templates/project", "-AllowPlaceholders")
Invoke-CheckScript "scripts/check-agent-project.ps1" $ProjectTemplateCheckArgs
Invoke-CheckScript "scripts/check-agent-worktrees.ps1"

if ($Issues.Count -gt 0) {
    Write-Host 'Agent Context OS check failed:' -ForegroundColor Red
    foreach ($Issue in $Issues) {
        Write-Host (' - ' + $Issue) -ForegroundColor Red
    }
    exit 1
}

Write-Host 'Agent Context OS check passed.' -ForegroundColor Green
exit 0
