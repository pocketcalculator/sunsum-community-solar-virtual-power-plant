#requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $OutputDirectory,
    [string] $SourceRoot = (Join-Path $PSScriptRoot '..')
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = (Resolve-Path -LiteralPath $SourceRoot).Path
$destination = [System.IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $destination) {
    throw 'Release output already exists. Use a new directory for each reviewed release.'
}
$revision = & git -C $root rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify the reviewed source revision.' }
$status = & git -C $root status --porcelain
if ($LASTEXITCODE -ne 0 -or @($status).Count -ne 0) {
    throw 'Commit the reviewed source first; release bundles require a clean source worktree.'
}
$demo = Join-Path $root 'build\vibehub'
if (-not (Test-Path -LiteralPath (Join-Path $demo 'index.html') -PathType Leaf)) {
    throw 'The synthetic build is absent. Run npm run build:demo before packaging.'
}
$stamp = Get-Content -LiteralPath (Join-Path $demo 'demo-build.json') -Raw | ConvertFrom-Json -AsHashtable
if ($stamp.mode -cne 'SYNTHETIC_DEMO_ONLY' -or $stamp.sourceClean -ne $true -or
    $stamp.sourceRevision -cne ([string]$revision).Trim()) {
    throw 'The static build is stale, unreviewed or from another revision. Build it again from this clean commit.'
}
$demoFiles = @(Get-ChildItem -LiteralPath $demo -Recurse -Force)
foreach ($entry in $demoFiles) {
    if ($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw 'The static artifact must not contain links or junctions.'
    }
    $relative = [System.IO.Path]::GetRelativePath($demo, $entry.FullName).Replace('\', '/')
    if (-not $entry.PSIsContainer -and $relative -cne 'demo-build.json' -and
        $entry.Extension -notin @('.html', '.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.ico', '.txt')) {
        throw "Unexpected static artifact extension: $($entry.Extension)"
    }
    if (-not $entry.PSIsContainer -and $relative -cne 'demo-build.json') {
        if (-not $stamp.files.Contains($relative) -or
            (Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash -ine $stamp.files[$relative]) {
            throw "The static artifact changed after its build: $relative"
        }
    }
}
$contentFiles = @($demoFiles | Where-Object {
    -not $_.PSIsContainer -and
    [System.IO.Path]::GetRelativePath($demo, $_.FullName).Replace('\', '/') -cne 'demo-build.json'
})
if ($contentFiles.Count -ne $stamp.files.Count) {
    throw "The static artifact file count ($($contentFiles.Count)) does not match its build manifest ($($stamp.files.Count))."
}

$null = New-Item -ItemType Directory -Path $destination
$app = & (Join-Path $root 'infrastructure\scripts\New-AppServicePackage.ps1') `
    -SourceRoot $root -OutputPath (Join-Path $destination 'sunsum-app-source.zip')

$staticPath = Join-Path $destination 'sunsum-synthetic-demo.zip'
$archive = [System.IO.Compression.ZipFile]::Open($staticPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($entry in $demoFiles | Where-Object { -not $_.PSIsContainer } | Sort-Object FullName) {
        $relative = [System.IO.Path]::GetRelativePath($demo, $entry.FullName).Replace('\', '/')
        $null = [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive, $entry.FullName, $relative, [System.IO.Compression.CompressionLevel]::Optimal
        )
    }
} finally {
    $archive.Dispose()
}

$operator = Join-Path $destination 'operator'
$handoffPaths = @(
    'README.md', 'LICENSE',
    'docs\ws1\connections.md',
    'docs\ws1\architecture.md',
    'docs\ws1\contracts.md',
    'docs\ws1\connection-and-deployment-guide.md',
    'docs\ws1\live-read.env.example',
    'docs\ws1\code-approval.example.json',
    'infrastructure\scripts\New-AppServicePackage.ps1',
    'infrastructure\scripts\Test-AppServicePackage.ps1',
    'infrastructure\scripts\Deploy-AppServiceCode.ps1',
    'infrastructure\scripts\DeploymentSafety.psm1',
    'infrastructure\docs\app-service-postgres.md'
)
foreach ($path in $handoffPaths) {
    $source = Join-Path $root $path
    $target = Join-Path $operator $path
    $item = Get-Item -LiteralPath $source
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw 'Operator handoff must not contain linked files.'
    }
    $null = New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force
    Copy-Item -LiteralPath $source -Destination $target
}
$handoffFiles = @(Get-ChildItem -LiteralPath $operator -Recurse -File | Sort-Object FullName)
$manifest = [ordered]@{
    schemaVersion = 1
    sourceRepository = 'https://github.com/pocketcalculator/sunsum-community-solar-virtual-power-plant'
    sourceRevision = ([string]$revision).Trim()
    nodeRequirement = '^22.22.2'
    npmRequirement = '^10.0.0'
    application = @{
        file = 'sunsum-app-source.zip'
        sha256 = $app.SHA256
        files = $app.Files
        uncompressedBytes = $app.UncompressedBytes
        mode = 'LIVE_READ_ONLY'
        startup = 'npm run start -- --hostname 0.0.0.0'
        workflowWrites = 'WORKFLOW_WRITES_NOT_IMPLEMENTED'
    }
    demo = @{
        file = 'sunsum-synthetic-demo.zip'
        sha256 = (Get-FileHash -LiteralPath $staticPath -Algorithm SHA256).Hash
        mode = 'SYNTHETIC_DEMO_ONLY'
        entry = 'index.html'
    }
    operator = @($handoffFiles | ForEach-Object {
        @{
            file = [System.IO.Path]::GetRelativePath($destination, $_.FullName).Replace('\', '/')
            sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
        }
    })
    deployment = 'Not performed by packaging. Existing-target authority and artifact approval remain required.'
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $destination 'release-manifest.json') -Encoding utf8
[pscustomobject]@{
    Directory = $destination
    Revision = $manifest.sourceRevision
    ApplicationSHA256 = $manifest.application.sha256
    DemoSHA256 = $manifest.demo.sha256
    AzureCalls = 0
}
