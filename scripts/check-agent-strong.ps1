[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Issues = New-Object System.Collections.Generic.List[string]

function Add-Issue {
    param([string]$Message)
    $Issues.Add($Message) | Out-Null
}

function Invoke-GitCheck {
    param(
        [string]$Label,
        [string[]]$Arguments
    )

    $PreviousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $Output = & git @Arguments 2>&1
        $ExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $PreviousErrorActionPreference
    }

    if ($ExitCode -ne 0) {
        Add-Issue "$Label failed: git $($Arguments -join ' ')"
        foreach ($Line in $Output) {
            Add-Issue "  $Line"
        }
    }
}

function Invoke-CheckScript {
    param(
        [string]$RelativePath,
        [string[]]$Arguments = @()
    )

    $Path = Join-Path $Root $RelativePath
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Write-Host "Strong check skipped: $RelativePath not found."
        return
    }

    $PreviousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $Output = & powershell -NoProfile -ExecutionPolicy Bypass -File $Path @Arguments 2>&1
        $ExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $PreviousErrorActionPreference
    }

    if ($ExitCode -ne 0) {
        Add-Issue "Check script failed: $RelativePath"
        foreach ($Line in $Output) {
            Add-Issue "  $Line"
        }
    }
}

function Invoke-ExpectedFailureScript {
    param(
        [string]$RelativePath,
        [string[]]$Arguments = @(),
        [string]$ExpectedText = ""
    )

    $Path = Join-Path $Root $RelativePath
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Add-Issue "Expected-failure check script not found: $RelativePath"
        return
    }

    $PreviousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $Output = & powershell -NoProfile -ExecutionPolicy Bypass -File $Path @Arguments 2>&1
        $ExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $PreviousErrorActionPreference
    }

    if ($ExitCode -eq 0) {
        Add-Issue "Expected check script to fail but it passed: $RelativePath $($Arguments -join ' ')"
        return
    }

    if (-not [string]::IsNullOrWhiteSpace($ExpectedText)) {
        $JoinedOutput = ($Output -join "`n")
        if ($JoinedOutput -notlike "*$ExpectedText*") {
            Add-Issue "Expected failure from $RelativePath did not mention '$ExpectedText'"
            foreach ($Line in $Output) {
                Add-Issue "  $Line"
            }
        }
    }
}

function New-ProjectFixture {
    param(
        [string]$ProjectId,
        [string]$ProjectName,
        [string]$MemoryLine
    )

    $FixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("agent-context-os-check-" + [guid]::NewGuid().ToString("N"))
    Copy-Item -LiteralPath (Join-Path $Root "templates/project") -Destination $FixtureRoot -Recurse

    $ConfigPath = Join-Path $FixtureRoot ".agent-context/config.json"
    $Config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $Config.project_id = $ProjectId
    $Config.project_name = $ProjectName
    $Config.engine.version = "1.0.0"
    $Config.engine.source = "agent-context-os"
    $Config.memory.sources = @([pscustomobject]@{
        id = "project-vault"
        provider = "obsidian"
        path = "knowledge"
        required_frontmatter = @("id", "type", "status", "summary")
    })
    $Config.memory.local_index.provider = "embedded-json"
    $Config.memory.local_index.path = ".agent-context/local-index"
    $Config.quality.validation_commands = @("scripts/check-agent.ps1")
    $Config | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ConfigPath -Encoding UTF8

    $KnowledgePath = Join-Path $FixtureRoot "knowledge"
    New-Item -ItemType Directory -Path $KnowledgePath | Out-Null
    $MemoryPath = Join-Path $KnowledgePath "bootstrap.md"
    Set-Content -LiteralPath $MemoryPath -Value $MemoryLine -Encoding UTF8

    return $FixtureRoot
}

$TempFixtures = New-Object System.Collections.Generic.List[string]

Push-Location $Root
try {
    Invoke-GitCheck "Working tree whitespace check" @("diff", "--check", "--")
    Invoke-GitCheck "Staged whitespace check" @("diff", "--cached", "--check", "--")

    Invoke-CheckScript "scripts/check-agent-context-os.ps1"
    Invoke-CheckScript "scripts/check-agent-project.ps1" @("-ProjectRoot", "templates/project", "-AllowPlaceholders")
    Invoke-CheckScript "scripts/check-agent-worktrees.ps1"
    Invoke-CheckScript "scripts/check-agent-drift.ps1"
    Invoke-ExpectedFailureScript "scripts/check-agent-project.ps1" @("-ProjectRoot", "templates/project") "placeholder"

    $NodeOutput = & node --test 2>&1
    if ($LASTEXITCODE -ne 0) {
        Add-Issue "Engine tests failed: node --test"
        foreach ($Line in $NodeOutput) {
            Add-Issue "  $Line"
        }
    }

    $ValidMemory = "---`nid: mem-20260720-001`nstatus: current`ntype: business_rule`nsummary: Thin launcher is the only project agent entry.`n---`n# Thin launcher"
    $ValidFixture = New-ProjectFixture "valid-project" "Valid Project" $ValidMemory
    $TempFixtures.Add($ValidFixture) | Out-Null
    Invoke-CheckScript "scripts/check-agent-project.ps1" @("-ProjectRoot", $ValidFixture)

    $SensitiveMemory = "---`nid: mem-20260720-002`nstatus: current`ntype: business_rule`nsummary: Do not write token values into memory sources.`n---`n# Sensitive"
    $SensitiveFixture = New-ProjectFixture "sensitive-project" "Sensitive Project" $SensitiveMemory
    $TempFixtures.Add($SensitiveFixture) | Out-Null
    Invoke-ExpectedFailureScript "scripts/check-agent-project.ps1" @("-ProjectRoot", $SensitiveFixture) "sensitive marker"

    $ChineseSensitiveMemory = "---`nid: mem-20260720-003`nstatus: current`ntype: business_rule`nsummary: Do not write 密码 into memory sources.`n---`n# Sensitive"
    $ChineseSensitiveFixture = New-ProjectFixture "chinese-sensitive-project" "Chinese Sensitive Project" $ChineseSensitiveMemory
    $TempFixtures.Add($ChineseSensitiveFixture) | Out-Null
    Invoke-ExpectedFailureScript "scripts/check-agent-project.ps1" @("-ProjectRoot", $ChineseSensitiveFixture) "sensitive marker"

    $InvalidMetadata = "---`nid: mem-20260720-004`nstatus: confirmed`ntype: invented_type`nsummary: Invalid metadata must fail.`n---`n# Invalid"
    $InvalidMetadataFixture = New-ProjectFixture "invalid-metadata-project" "Invalid Metadata Project" $InvalidMetadata
    $TempFixtures.Add($InvalidMetadataFixture) | Out-Null
    Invoke-ExpectedFailureScript "scripts/check-agent-project.ps1" @("-ProjectRoot", $InvalidMetadataFixture) "invalid status"
}
finally {
    Pop-Location

    foreach ($Fixture in $TempFixtures) {
        if (Test-Path -LiteralPath $Fixture -PathType Container) {
            $ResolvedFixture = (Resolve-Path -LiteralPath $Fixture).Path
            $ResolvedTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
            if ($ResolvedFixture.StartsWith($ResolvedTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
                Remove-Item -LiteralPath $ResolvedFixture -Recurse -Force
            }
        }
    }
}

if ($Issues.Count -gt 0) {
    Write-Host "Agent strong check failed:" -ForegroundColor Red
    foreach ($Issue in $Issues) {
        Write-Host (" - " + $Issue) -ForegroundColor Red
    }
    exit 1
}

Write-Host "Agent strong check passed." -ForegroundColor Green
exit 0
