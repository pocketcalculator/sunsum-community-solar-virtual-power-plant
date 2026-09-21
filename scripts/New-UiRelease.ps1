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
$rootEntry = Get-Item -LiteralPath $root -Force
if (-not $rootEntry.PSIsContainer -or ($rootEntry.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
    throw 'Release source root must be a directory, not a symbolic link or junction.'
}
Import-Module (Join-Path $root 'infrastructure\scripts\DeploymentSafety.psm1') -Force

function Get-UnlinkedSourceItem([string] $Relative) {
    $current = $root
    foreach ($segment in $Relative -split '[\\/]') {
        $current = Join-Path $current $segment
        $item = Get-Item -LiteralPath $current -Force
        if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            throw "Release input must not contain links or junctions: $Relative"
        }
    }
    return $item
}

$revision = & git -C $root rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify the reviewed source revision.' }
$status = & git -C $root status --porcelain
if ($LASTEXITCODE -ne 0 -or @($status).Count -ne 0) {
    throw 'Commit the reviewed source first; release bundles require a clean source worktree.'
}
$demo = Join-Path $root 'build\vibehub'
if (-not (Test-Path -LiteralPath $demo -PathType Container)) {
    throw 'The synthetic build is absent. Run npm run build:demo before packaging.'
}
$null = Get-UnlinkedSourceItem 'build\vibehub'
$demoFiles = [System.Collections.Generic.List[System.IO.FileInfo]]::new()
$names = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$audioPaths = @('audio/need.mp3', 'audio/opportunity.mp3', 'audio/impact.mp3')

function Add-StaticFiles([string] $Directory) {
    foreach ($entry in Get-ChildItem -LiteralPath $Directory -Force) {
        if ($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            throw 'The static artifact must not contain links or junctions.'
        }
        $relative = [System.IO.Path]::GetRelativePath($demo, $entry.FullName).Replace('\', '/')
        if ($entry.PSIsContainer) {
            if (-not (Test-AppServiceArchivePath "public/$relative/probe.ts")) {
                throw "Unsafe static artifact directory: $relative"
            }
            Add-StaticFiles $entry.FullName
            continue
        }
        if ($relative -cne 'demo-build.json' -and $relative -cnotin $audioPaths -and
            $entry.Extension -cnotin @('.html', '.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.ico', '.txt')) {
            throw "Unexpected static artifact path: $relative"
        }
        # Reuse the source path/credential guard; HTML is specific to the static entry.
        $policyPath = if ($entry.Extension -ceq '.html') { "public/$relative.js" } else { "public/$relative" }
        if (-not (Test-AppServiceArchivePath $policyPath) -or -not $names.Add($relative)) {
            throw "Unsafe or duplicate static artifact path: $relative"
        }
        $demoFiles.Add($entry)
        if ($demoFiles.Count -gt 10000) { throw 'Too many static archive entries.' }
    }
}
Add-StaticFiles $demo
[long] $demoBytes = 0
foreach ($entry in $demoFiles) {
    $demoBytes += $entry.Length
    if ($entry.Length -gt 32MB -or $demoBytes -gt 64MB) { throw 'Uncompressed static artifact exceeds the safety limit.' }
}
$stamp = Get-Content -LiteralPath (Join-Path $demo 'demo-build.json') -Raw | ConvertFrom-Json -AsHashtable
if ($stamp.mode -cne 'SYNTHETIC_DEMO_ONLY' -or $stamp.sourceClean -isnot [bool] -or $stamp.sourceClean -ne $true -or
    $stamp.sourceRevision -cne ([string]$revision).Trim()) {
    throw 'The static build is stale, unreviewed or from another revision. Build it again from this clean commit.'
}
$demoInventory = [System.Collections.Generic.Dictionary[string, object]]::new([System.StringComparer]::Ordinal)
foreach ($entry in $demoFiles | Sort-Object FullName) {
    $relative = [System.IO.Path]::GetRelativePath($demo, $entry.FullName).Replace('\', '/')
    $hash = (Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash
    if ($relative -cne 'demo-build.json' -and
        ($stamp.files -isnot [System.Collections.IDictionary] -or $relative -cnotin $stamp.files.Keys -or
            $stamp.files[$relative] -isnot [string] -or $stamp.files[$relative] -cnotmatch '^[A-Fa-f0-9]{64}$' -or
            $hash -ine $stamp.files[$relative])) {
        throw "The static artifact changed after its build: $relative"
    }
    $demoInventory.Add($relative, [pscustomobject]@{ path = $relative; bytes = $entry.Length; sha256 = $hash })
}
if (-not $demoInventory.ContainsKey('index.html') -or $demoFiles.Count - 1 -ne $stamp.files.Count) {
    throw 'The static artifact is missing its entry or does not match its build manifest file count.'
}
$audioManifestPath = 'src/features/participation/content/pageAudioAssets.json'
$audioManifestItem = Get-UnlinkedSourceItem $audioManifestPath
$audioManifestHash = (Get-FileHash -LiteralPath $audioManifestItem.FullName -Algorithm SHA256).Hash
$audioManifest = Get-Content -LiteralPath $audioManifestItem.FullName -Raw | ConvertFrom-Json -AsHashtable -Depth 8
foreach ($topic in @('need', 'opportunity', 'impact')) {
    $path = "audio/$topic.mp3"
    if ($audioManifest.tracks -isnot [System.Collections.IDictionary] -or
        $topic -cnotin $audioManifest.tracks.Keys -or -not $demoInventory.ContainsKey($path)) {
        throw "Required static audio or its public manifest entry is missing: $path"
    }
    $track = $audioManifest.tracks[$topic]
    $file = $demoInventory[$path]
    if ($track.path -cne $path -or $track.bytes -ne $file.bytes -or $track.sha256 -ine $file.sha256) {
        throw "Static audio bytes or SHA-256 do not match the public manifest: $path"
    }
}
$creditsSourcePath = 'docs\ws1\audio-credits.txt'
$creditsItem = Get-UnlinkedSourceItem $creditsSourcePath
if ($creditsItem.PSIsContainer -or $creditsItem.Length -eq 0 -or $creditsItem.Length -gt 32MB) {
    throw 'The public audio credits must be a nonempty file within the entry limit.'
}
$creditsHash = (Get-FileHash -LiteralPath $creditsItem.FullName -Algorithm SHA256).Hash
if (-not $demoInventory.ContainsKey('AUDIO-CREDITS.txt') -or
    $demoInventory['AUDIO-CREDITS.txt'].bytes -ne $creditsItem.Length -or
    $demoInventory['AUDIO-CREDITS.txt'].sha256 -ine $creditsHash) {
    throw 'Static audio credits are missing or do not match the public notice. Rebuild with AUDIO-CREDITS.txt from docs/ws1/audio-credits.txt.'
}
$package = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json -AsHashtable
if ($package.engines.node -isnot [string] -or [string]::IsNullOrWhiteSpace($package.engines.node) -or
    $package.engines.npm -isnot [string] -or [string]::IsNullOrWhiteSpace($package.engines.npm)) {
    throw 'The reviewed package manifest must declare the Node and npm engine requirements.'
}
$handoffPaths = @(
    'README.md', 'LICENSE',
    'docs\ws1\connections.md',
    'docs\ws1\architecture.md',
    'docs\ws1\contracts.md',
    'docs\ws1\connection-and-deployment-guide.md',
    'docs\ws1\live-read.env.example',
    'docs\ws1\server-demo.env.example',
    'docs\ws1\media-credits.md',
    $creditsSourcePath,
    'docs\ws1\code-approval.example.json',
    $audioManifestPath,
    'scripts\New-UiRelease.ps1',
    'infrastructure\scripts\New-AppServicePackage.ps1',
    'infrastructure\scripts\Test-AppServicePackage.ps1',
    'infrastructure\scripts\Deploy-AppServiceCode.ps1',
    'infrastructure\scripts\DeploymentSafety.psm1',
    'infrastructure\docs\app-service-postgres.md'
)
foreach ($path in $handoffPaths) {
    if ((Get-UnlinkedSourceItem $path).PSIsContainer) { throw "Expected an operator handoff file: $path" }
}

$null = New-Item -ItemType Directory -Path $destination
$app = & (Join-Path $root 'infrastructure\scripts\New-AppServicePackage.ps1') `
    -SourceRoot $root -OutputPath (Join-Path $destination 'sunsum-app-source.zip')
if ($app.AudioManifest.sha256 -ine $audioManifestHash) {
    throw 'The public audio manifest changed during release assembly.'
}
if ($app.AudioCredits.sha256 -ine $creditsHash) { throw 'The public audio credits changed during release assembly.' }

$staticPath = Join-Path $destination 'sunsum-synthetic-demo.zip'
$archive = [System.IO.Compression.ZipFile]::Open($staticPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($entry in $demoFiles | Sort-Object FullName) {
        $relative = [System.IO.Path]::GetRelativePath($demo, $entry.FullName).Replace('\', '/')
        $null = [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive, $entry.FullName, $relative, [System.IO.Compression.CompressionLevel]::Optimal
        )
    }
} finally { $archive.Dispose() }
$staticBytes = (Get-Item -LiteralPath $staticPath).Length
if ($staticBytes -gt 64MB) { throw 'Static archive exceeds the 64 MiB safety limit.' }
$archive = [System.IO.Compression.ZipFile]::OpenRead($staticPath)
try {
    if ($archive.Entries.Count -gt 10000 -or $archive.Entries.Count -ne $demoInventory.Count) {
        throw 'Static archive entry count does not match its reviewed content.'
    }
    $archiveNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    [long] $actualBytes = 0
    foreach ($entry in $archive.Entries) {
        if (-not $demoInventory.ContainsKey($entry.FullName) -or -not $archiveNames.Add($entry.FullName) -or
            (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000 -or
            ($entry.ExternalAttributes -band [System.IO.FileAttributes]::ReparsePoint)) {
            throw 'Static archive contains an unexpected, duplicate or linked entry.'
        }
        $actualBytes += $entry.Length
        if ($entry.Length -gt 32MB -or $actualBytes -gt 64MB) { throw 'Uncompressed static artifact exceeds the safety limit.' }
        $expected = $demoInventory[$entry.FullName]
        $stream = $entry.Open()
        try { $hash = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($stream)) }
        finally { $stream.Dispose() }
        if ($entry.Length -ne $expected.bytes -or $hash -ine $expected.sha256) {
            throw "Static archive bytes changed during packaging: $($entry.FullName)"
        }
    }
} finally { $archive.Dispose() }

$operator = Join-Path $destination 'operator'
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
if ((Get-FileHash -LiteralPath (Join-Path $operator $audioManifestPath) -Algorithm SHA256).Hash -ine $app.AudioManifest.sha256) {
    throw 'The operator audio manifest does not match the packaged source.'
}
if ((Get-FileHash -LiteralPath (Join-Path $operator $creditsSourcePath) -Algorithm SHA256).Hash -ine $app.AudioCredits.sha256) {
    throw 'The operator audio credits do not match the packaged notice.'
}
$finalRevision = & git -C $root rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $finalRevision -cne $revision) { throw 'The source revision changed during release assembly.' }
$finalStatus = & git -C $root status --porcelain
if ($LASTEXITCODE -ne 0 -or @($finalStatus).Count -ne 0) { throw 'The source worktree changed during release assembly.' }
$interest = @{ method = 'POST'; path = '/api/projects/{id}/engagements'; body = @{} }
$manifest = [ordered]@{
    schemaVersion = 2
    sourceRepository = 'https://github.com/pocketcalculator/sunsum-community-solar-virtual-power-plant'
    sourceRevision = ([string]$revision).Trim()
    backendContractRevision = 'db0c6a5d6e39fe7cf079dab27e9616189945cf6c'
    deployedRevision = $null
    nodeRequirement = $package.engines.node
    npmRequirement = $package.engines.npm
    limits = @{ compressedBytes = 64MB; uncompressedBytes = 64MB; entryBytes = 32MB; entries = 10000 }
    application = @{
        file = 'sunsum-app-source.zip'
        sha256 = $app.SHA256
        files = $app.Files
        compressedBytes = $app.CompressedBytes
        uncompressedBytes = $app.UncompressedBytes
        fileHashes = $app.FileHashes
        mode = 'DYNAMIC_WORKSPACE'
        supportedSourceModes = @('connected', 'server-demo')
        allowedMutations = @{
            connected = @($interest)
            'server-demo' = @($interest, @{
                method = 'POST'; path = '/api/auth/demo-switch'
                bodyContract = 'Existing DemoRoleSwitcher role selection; explicit mock-backed server-demo only.'
            })
        }
        admission = @{
            connected = 'Database store, demo auth disabled, approved legitimate sign-in/mapping and fresh authorized identity.'
            'server-demo' = 'Explicit server-demo mode, mock store, SUNSUM_DEMO_AUTH=enabled, configured signing and same-origin /api.'
        }
        excludedMutations = 'All other frontend business, provider and session mutations; existing backend APIs are unchanged.'
        startup = 'npm run start -- --hostname 0.0.0.0'
    }
    demo = @{
        file = 'sunsum-synthetic-demo.zip'
        sha256 = (Get-FileHash -LiteralPath $staticPath -Algorithm SHA256).Hash
        files = $demoFiles.Count
        compressedBytes = $staticBytes
        uncompressedBytes = $actualBytes
        fileHashes = @($demoInventory.Values | Sort-Object path)
        mode = 'SYNTHETIC_DEMO_ONLY'
        allowedMutations = @()
        serviceTransport = $false
        sessionTransport = $false
        entry = 'index.html'
    }
    audio = @{
        manifest = $app.AudioManifest
        credits = $app.AudioCredits
        license = 'THIRD_PARTY_NOT_MIT'
        tracks = @($app.Audio | ForEach-Object {
            @{
                topic = $_.topic; applicationPath = "public/$($_.path)"; demoPath = $_.path
                bytes = $_.bytes; sha256 = $_.sha256; mime = $_.mime
                title = $_.title; attribution = $_.attribution
                durationSeconds = $_.durationSeconds; sampleRateHz = $_.sampleRateHz; channels = $_.channels
            }
        })
    }
    operator = @($handoffFiles | ForEach-Object {
        @{
            file = [System.IO.Path]::GetRelativePath($destination, $_.FullName).Replace('\', '/')
            bytes = $_.Length
            sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
        }
    })
    deployment = 'Not performed by packaging. Existing-target authority and artifact approval remain required.'
    AzureCalls = 0
}
$manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $destination 'release-manifest.json') -Encoding utf8
[pscustomobject]@{
    Directory = $destination
    Revision = $manifest.sourceRevision
    ApplicationSHA256 = $manifest.application.sha256
    DemoSHA256 = $manifest.demo.sha256
    AzureCalls = 0
}
