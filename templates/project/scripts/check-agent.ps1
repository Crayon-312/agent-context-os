[CmdletBinding()]
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [switch]$AllowPlaceholders
)

$ErrorActionPreference = "Stop"
$Issues = New-Object System.Collections.Generic.List[string]
$SensitivePatterns = @(
    "(?i)\b(api[_-]?key|token|access[_-]?token|refresh[_-]?token|secret|password|passwd|pwd|credential|private[_-]?key|cookie|session[_-]?id)\b",
    "账号",
    "密码",
    "密钥",
    "凭据",
    "私钥",
    "访问令牌",
    "刷新令牌",
    "真实隐私"
)

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

function Test-NonPlaceholder {
    param(
        [string]$Value,
        [string]$Field
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        Add-Issue "$Field must not be empty"
        return
    }

    if (-not $AllowPlaceholders -and ($Value -match "<[^>]+>" -or $Value -match "YYYY")) {
        Add-Issue "$Field still contains a placeholder"
    }
}

function Test-NoPlaceholderObject {
    param(
        [object]$Value,
        [string]$Field
    )

    if ($null -eq $Value) {
        return
    }

    if ($Value -is [string]) {
        Test-NonPlaceholder $Value $Field
        return
    }

    if ($Value -is [System.Array]) {
        for ($Index = 0; $Index -lt $Value.Count; $Index++) {
            Test-NoPlaceholderObject $Value[$Index] "$Field[$Index]"
        }
        return
    }

    if ($Value -is [System.Management.Automation.PSCustomObject]) {
        foreach ($Property in $Value.PSObject.Properties) {
            Test-NoPlaceholderObject $Property.Value "$Field.$($Property.Name)"
        }
    }
}

function Test-NoSensitiveText {
    param(
        [string]$Value,
        [string]$Field
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return
    }

    foreach ($Pattern in $SensitivePatterns) {
        if ($Value -match $Pattern) {
            Add-Issue "$Field contains sensitive marker '$($Matches[0])'"
            return
        }
    }
}

function Test-NoSensitiveObject {
    param(
        [object]$Value,
        [string]$Field
    )

    if ($null -eq $Value) {
        return
    }

    if ($Value -is [string]) {
        Test-NoSensitiveText $Value $Field
        return
    }

    if ($Value -is [System.Array]) {
        for ($Index = 0; $Index -lt $Value.Count; $Index++) {
            Test-NoSensitiveObject $Value[$Index] "$Field[$Index]"
        }
        return
    }

    if ($Value -is [System.Management.Automation.PSCustomObject]) {
        foreach ($Property in $Value.PSObject.Properties) {
            Test-NoSensitiveObject $Property.Value "$Field.$($Property.Name)"
        }
    }
}

function Test-DateString {
    param(
        [string]$Value,
        [string]$Field
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        Add-Issue "$Field must not be empty"
        return
    }

    if ($AllowPlaceholders -and $Value -match "YYYY") {
        return
    }

    if ($Value -notmatch "^\d{4}-\d{2}-\d{2}$") {
        Add-Issue "$Field must use YYYY-MM-DD"
    }
}

function Test-MemorySourceLine {
    param(
        [string]$Path,
        [string]$Line,
        [int]$LineNumber
    )

    try {
        $Record = $Line | ConvertFrom-Json
    }
    catch {
        Add-Issue "$Path line $LineNumber is not valid JSON: $($_.Exception.Message)"
        return
    }

    foreach ($Field in @("id", "status", "type", "scope", "summary", "source", "confidence", "last_verified")) {
        if (-not ($Record.PSObject.Properties.Name -contains $Field)) {
            Add-Issue "$Path line $LineNumber missing field '$Field'"
        }
    }

    Test-NoPlaceholderObject $Record "$Path line $LineNumber"
    Test-NoSensitiveObject $Record "$Path line $LineNumber"

    if ($Record.status -and @("current", "draft", "assumption", "stale", "deprecated") -notcontains $Record.status) {
        Add-Issue "$Path line $LineNumber has invalid status '$($Record.status)'"
    }

    if ($Record.confidence -and @("high", "medium", "low") -notcontains $Record.confidence) {
        Add-Issue "$Path line $LineNumber has invalid confidence '$($Record.confidence)'"
    }

    if ($Record.scope -and ($Record.scope -isnot [System.Array] -or $Record.scope.Count -eq 0)) {
        Add-Issue "$Path line $LineNumber scope must be a non-empty array"
    }

    if ($Record.source) {
        foreach ($Field in @("kind", "ref", "date")) {
            if (-not ($Record.source.PSObject.Properties.Name -contains $Field)) {
                Add-Issue "$Path line $LineNumber source missing field '$Field'"
            }
        }

        if ($Record.source.date) {
            Test-DateString ([string]$Record.source.date) "$Path line $LineNumber source.date"
        }
    }

    if ($Record.last_verified) {
        Test-DateString ([string]$Record.last_verified) "$Path line $LineNumber last_verified"
    }
}

function Get-MemorySourceFiles {
    param([object]$SourcePaths)

    $Files = New-Object System.Collections.Generic.List[object]
    $Seen = @{}

    foreach ($SourcePath in @($SourcePaths)) {
        if ([string]::IsNullOrWhiteSpace([string]$SourcePath)) {
            continue
        }

        $FullPattern = Join-Path $Root ([string]$SourcePath)
        $Matches = @(Get-ChildItem -Path $FullPattern -File -ErrorAction SilentlyContinue)

        foreach ($File in $Matches) {
            if (-not $Seen.ContainsKey($File.FullName)) {
                $Seen[$File.FullName] = $true
                $Files.Add($File) | Out-Null
            }
        }
    }

    return $Files.ToArray()
}

function Get-ConfiguredMemorySources {
    param([object]$MemoryConfig)

    $Sources = New-Object System.Collections.Generic.List[object]
    if ($MemoryConfig -and $MemoryConfig.sources) {
        foreach ($Source in @($MemoryConfig.sources)) {
            $Sources.Add($Source) | Out-Null
        }
    }
    elseif ($MemoryConfig -and $MemoryConfig.source_paths) {
        $Index = 0
        foreach ($SourcePath in @($MemoryConfig.source_paths)) {
            $Index++
            $Sources.Add([pscustomobject]@{
                id = "legacy-jsonl-$Index"
                provider = "jsonl"
                path = [string]$SourcePath
            }) | Out-Null
        }
    }

    return $Sources.ToArray()
}

function Resolve-ConfiguredPath {
    param([string]$ConfiguredPath)

    if ([System.IO.Path]::IsPathRooted($ConfiguredPath)) {
        return [System.IO.Path]::GetFullPath($ConfiguredPath)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $Root $ConfiguredPath))
}

function Test-ObsidianSource {
    param([object]$Source)

    $ConfiguredPath = [string]$Source.path
    if ($ConfiguredPath -match "<[^>]+>") {
        if (-not $AllowPlaceholders) {
            Add-Issue "memory.sources.path still contains a placeholder"
        }
        return
    }

    $VaultPath = Resolve-ConfiguredPath $ConfiguredPath
    if (-not (Test-Path -LiteralPath $VaultPath -PathType Container)) {
        Add-Issue "Obsidian source '$($Source.id)' vault not found: $VaultPath"
        return
    }

    $MarkdownFiles = @(Get-ChildItem -LiteralPath $VaultPath -Recurse -File -Filter "*.md" | Where-Object {
        $_.FullName -notmatch "[\\/](\.obsidian|\.git|\.trash)[\\/]"
    })
    if ($MarkdownFiles.Count -eq 0) {
        Add-Issue "Obsidian source '$($Source.id)' did not match any Markdown file"
        return
    }

    $SeenIds = @{}
    foreach ($File in $MarkdownFiles) {
        $Content = Get-Content -LiteralPath $File.FullName -Raw -Encoding UTF8
        Test-NoSensitiveText $Content $File.FullName
        $Frontmatter = @{}
        if ($Content -match "(?s)^\uFEFF?---\r?\n(.*?)\r?\n---(?:\r?\n|$)") {
            foreach ($Line in ($Matches[1] -split "\r?\n")) {
                if ($Line -match "^([A-Za-z0-9_-]+):\s*(.*)$") {
                    $Frontmatter[$Matches[1]] = $Matches[2].Trim().Trim('"', "'")
                }
            }
        }

        $RequiredFrontmatter = New-Object System.Collections.Generic.List[string]
        foreach ($Field in @("id", "type", "status", "summary")) {
            $RequiredFrontmatter.Add($Field) | Out-Null
        }
        if ($Source.PSObject.Properties.Name -contains "required_frontmatter" -and $Source.required_frontmatter) {
            foreach ($Field in @($Source.required_frontmatter)) {
                if (-not $RequiredFrontmatter.Contains([string]$Field)) {
                    $RequiredFrontmatter.Add([string]$Field) | Out-Null
                }
            }
        }
        foreach ($Field in $RequiredFrontmatter.ToArray()) {
            if (-not $Frontmatter.ContainsKey([string]$Field) -or [string]::IsNullOrWhiteSpace([string]$Frontmatter[[string]$Field])) {
                Add-Issue "$($File.FullName) missing required frontmatter '$Field'"
            }
        }

        if ($Frontmatter.ContainsKey("type") -and @("project_fact", "business_rule", "interaction_rule", "architecture_rule", "implementation_note", "known_issue", "decision", "open_question") -notcontains [string]$Frontmatter.type) {
            Add-Issue "$($File.FullName) has invalid type '$($Frontmatter.type)'"
        }
        if ($Frontmatter.ContainsKey("status") -and @("current", "draft", "assumption", "stale", "deprecated") -notcontains [string]$Frontmatter.status) {
            Add-Issue "$($File.FullName) has invalid status '$($Frontmatter.status)'"
        }
        if ($Frontmatter.ContainsKey("confidence") -and @("high", "medium", "low") -notcontains [string]$Frontmatter.confidence) {
            Add-Issue "$($File.FullName) has invalid confidence '$($Frontmatter.confidence)'"
        }
        if ($Frontmatter.ContainsKey("last_verified")) {
            Test-DateString ([string]$Frontmatter.last_verified) "$($File.FullName) last_verified"
        }

        if ($Frontmatter.ContainsKey("id") -and -not [string]::IsNullOrWhiteSpace([string]$Frontmatter.id)) {
            if ($SeenIds.ContainsKey($Frontmatter.id)) {
                Add-Issue "Obsidian source '$($Source.id)' has duplicate id '$($Frontmatter.id)'"
            }
            $SeenIds[$Frontmatter.id] = $true
        }
    }
}

function Test-LocalIndexProtection {
    param([object]$LocalIndex)

    if (-not $LocalIndex -or [string]::IsNullOrWhiteSpace([string]$LocalIndex.path)) {
        return
    }
    if ($AllowPlaceholders -and [string]$LocalIndex.path -match "<[^>]+>") {
        return
    }

    $ConfiguredPath = Resolve-ConfiguredPath ([string]$LocalIndex.path)
    if (-not [System.IO.Path]::HasExtension($ConfiguredPath)) {
        $ConfiguredPath = Join-Path $ConfiguredPath "index.json"
    }

    $PreviousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $GitRootOutput = & git -C $Root rev-parse --show-toplevel 2>$null
        $GitRootExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $PreviousErrorActionPreference
    }
    if ($GitRootExitCode -ne 0 -or [string]::IsNullOrWhiteSpace([string]$GitRootOutput)) {
        return
    }

    $GitRoot = [System.IO.Path]::GetFullPath(([string]$GitRootOutput).Trim()).TrimEnd('\', '/')
    $FullIndexPath = [System.IO.Path]::GetFullPath($ConfiguredPath)
    if (-not $FullIndexPath.StartsWith($GitRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        return
    }

    $RelativePath = $FullIndexPath.Substring($GitRoot.Length).TrimStart('\', '/').Replace('\', '/')
    $ErrorActionPreference = "Continue"
    try {
        & git -C $GitRoot ls-files --error-unmatch -- $RelativePath *> $null
        $TrackedExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $PreviousErrorActionPreference
    }
    if ($TrackedExitCode -eq 0) {
        Add-Issue "local index path is tracked by Git: $FullIndexPath"
        return
    }

    $ErrorActionPreference = "Continue"
    try {
        & git -C $GitRoot check-ignore --quiet --no-index -- $RelativePath *> $null
        $IgnoredExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $PreviousErrorActionPreference
    }
    if ($IgnoredExitCode -ne 0) {
        Add-Issue "local index path is not ignored by Git: $FullIndexPath"
    }
}

try {
    $Root = (Resolve-Path -LiteralPath $ProjectRoot).Path
}
catch {
    Write-Host "Agent project check failed: project root not found: $ProjectRoot" -ForegroundColor Red
    exit 1
}

Test-RequiredFile "AGENTS.md"
Test-RequiredFile ".agent-context/config.json"
Test-RequiredFile ".gitignore"

Test-ContainsText "AGENTS.md" ".agent-context/config.json"
Test-ContainsText "AGENTS.md" "local-index"
Test-ContainsText ".gitignore" ".agent-context/local-index/"
Test-ContainsText ".gitignore" ".agent-context/cache/"

$ConfigPath = Join-Path $Root ".agent-context/config.json"
if (Test-Path -LiteralPath $ConfigPath -PathType Leaf) {
    try {
        $Config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    catch {
        Add-Issue ".agent-context/config.json is not valid JSON: $($_.Exception.Message)"
        $Config = $null
    }

    if ($null -ne $Config) {
        foreach ($Field in @("schema_version", "project_id", "project_name", "engine", "memory", "quality")) {
            if (-not ($Config.PSObject.Properties.Name -contains $Field)) {
                Add-Issue ".agent-context/config.json missing field '$Field'"
            }
        }

        if ($Config.schema_version -notin @(1, 2)) {
            Add-Issue "schema_version must be 1 or 2"
        }

        Test-NonPlaceholder ([string]$Config.project_id) "project_id"
        Test-NonPlaceholder ([string]$Config.project_name) "project_name"

        if ($Config.engine) {
            foreach ($Field in @("name", "mode", "version", "source")) {
                if (-not ($Config.engine.PSObject.Properties.Name -contains $Field)) {
                    Add-Issue ".agent-context/config.json engine missing field '$Field'"
                }
            }

            if ($Config.engine.mode -ne "thin-launcher") {
                Add-Issue "engine.mode must be 'thin-launcher'"
            }

            Test-NonPlaceholder ([string]$Config.engine.name) "engine.name"
            Test-NonPlaceholder ([string]$Config.engine.mode) "engine.mode"
            Test-NonPlaceholder ([string]$Config.engine.version) "engine.version"
            Test-NonPlaceholder ([string]$Config.engine.source) "engine.source"
        }

        if ($Config.memory) {
            $HasSources = $Config.memory.PSObject.Properties.Name -contains "sources"
            $HasLegacyPaths = $Config.memory.PSObject.Properties.Name -contains "source_paths"
            if (-not $HasSources -and -not $HasLegacyPaths) {
                Add-Issue ".agent-context/config.json memory missing field 'sources'"
            }

            $ConfiguredSources = @(Get-ConfiguredMemorySources $Config.memory)
            if ($ConfiguredSources.Count -eq 0) {
                Add-Issue "memory.sources must not be empty"
            }

            $SourceIds = @{}
            foreach ($Source in $ConfiguredSources) {
                foreach ($Field in @("id", "provider", "path")) {
                    if (-not ($Source.PSObject.Properties.Name -contains $Field)) {
                        Add-Issue "memory source missing field '$Field'"
                    }
                    else {
                        Test-NonPlaceholder ([string]$Source.$Field) "memory.sources.$Field"
                    }
                }

                if ($Source.id) {
                    if ($SourceIds.ContainsKey([string]$Source.id)) {
                        Add-Issue "memory source id '$($Source.id)' must be unique"
                    }
                    $SourceIds[[string]$Source.id] = $true
                }

                if ($Source.provider -and @("obsidian", "jsonl") -notcontains [string]$Source.provider) {
                    Add-Issue "memory source provider '$($Source.provider)' is not supported"
                }

                if ($Source.provider -eq "jsonl") {
                    if ([string]$Source.path -notlike "*.jsonl") {
                        Add-Issue "jsonl memory source paths must target JSONL files"
                    }
                    if ([string]$Source.path -like "*_example*") {
                        Add-Issue "jsonl memory sources must not include example files"
                    }
                }
            }

            if (-not ($Config.memory.PSObject.Properties.Name -contains "local_index")) {
                Add-Issue ".agent-context/config.json memory missing field 'local_index'"
            }
            elseif ($Config.memory.local_index.git_tracked -ne $false) {
                Add-Issue "memory.local_index.git_tracked must be false"
            }

            if ($Config.memory.local_index) {
                foreach ($Field in @("provider", "path", "git_tracked")) {
                    if (-not ($Config.memory.local_index.PSObject.Properties.Name -contains $Field)) {
                        Add-Issue ".agent-context/config.json memory.local_index missing field '$Field'"
                    }
                }

                Test-NonPlaceholder ([string]$Config.memory.local_index.provider) "memory.local_index.provider"
                Test-NonPlaceholder ([string]$Config.memory.local_index.path) "memory.local_index.path"
                if ($Config.memory.local_index.provider -ne "embedded-json") {
                    Add-Issue "memory.local_index.provider must be 'embedded-json'"
                }
                Test-LocalIndexProtection $Config.memory.local_index
            }
        }

        if ($Config.quality) {
            foreach ($Field in @("check_command", "validation_commands")) {
                if (-not ($Config.quality.PSObject.Properties.Name -contains $Field)) {
                    Add-Issue ".agent-context/config.json quality missing field '$Field'"
                }
            }

            Test-NonPlaceholder ([string]$Config.quality.check_command) "quality.check_command"

            if ($Config.quality.validation_commands.Count -eq 0) {
                Add-Issue "quality.validation_commands must not be empty"
            }
            else {
                foreach ($Command in @($Config.quality.validation_commands)) {
                    Test-NonPlaceholder ([string]$Command) "quality.validation_commands"
                }
            }
        }
    }
}

if ($Config -and $Config.memory) {
    foreach ($Source in @(Get-ConfiguredMemorySources $Config.memory)) {
        if ($Source.provider -eq "obsidian") {
            Test-ObsidianSource $Source
            continue
        }

        if ($Source.provider -ne "jsonl") {
            continue
        }

        $JsonlFiles = @(Get-MemorySourceFiles @($Source.path))
        if ($JsonlFiles.Count -eq 0 -and -not $AllowPlaceholders) {
            Add-Issue "JSONL memory source '$($Source.id)' did not match any file"
        }

        foreach ($File in $JsonlFiles) {
        if ($File.Name.StartsWith("_")) {
            Add-Issue "$($File.FullName) is an example or reserved file and must not be an active memory source"
            continue
        }

        $Lines = @(Get-Content -LiteralPath $File.FullName -Encoding UTF8)
        $NonEmptyLineCount = 0
        for ($Index = 0; $Index -lt $Lines.Count; $Index++) {
            $Line = $Lines[$Index].Trim()
            if ([string]::IsNullOrWhiteSpace($Line)) {
                continue
            }

            $NonEmptyLineCount++
            Test-MemorySourceLine $File.FullName $Line ($Index + 1)
        }

        if ($NonEmptyLineCount -eq 0 -and -not $AllowPlaceholders) {
            Add-Issue "$($File.FullName) must contain at least one memory record"
        }
        }
    }
}

if ($Issues.Count -gt 0) {
    Write-Host "Agent project check failed:" -ForegroundColor Red
    foreach ($Issue in $Issues) {
        Write-Host (" - " + $Issue) -ForegroundColor Red
    }
    exit 1
}

Write-Host "Agent project check passed." -ForegroundColor Green
exit 0
