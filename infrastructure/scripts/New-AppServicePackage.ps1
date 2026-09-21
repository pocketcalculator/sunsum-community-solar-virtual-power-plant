#requires -Version 7.2
[CmdletBinding()]
param(
    [string] $SourceRoot = (Join-Path $PSScriptRoot '..\..'),
    [string] $OutputPath = '.azure\artifacts\web-source.zip'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'DeploymentSafety.psm1') -Force

$root = (Resolve-Path -LiteralPath $SourceRoot).Path
$rootEntry = Get-Item -LiteralPath $root -Force
if (-not $rootEntry.PSIsContainer -or ($rootEntry.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
    throw 'Deployment source root must be a directory, not a symbolic link or junction.'
}
$destination = [System.IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $destination) { throw 'The output archive already exists. Use a new path for each reviewed artifact.' }
$files = [System.Collections.Generic.List[object]]::new()

function Add-SourceFiles([string] $Directory) {
    foreach ($entry in Get-ChildItem -LiteralPath $Directory -Force) {
        if ($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            throw 'Deployment source must not contain symbolic links or junctions.'
        }
        $relative = [System.IO.Path]::GetRelativePath($root, $entry.FullName).Replace('\', '/')
        if ($entry.PSIsContainer) {
            if (Test-AppServiceArchivePath "$relative/probe.ts") { Add-SourceFiles $entry.FullName }
            continue
        }
        if (Test-AppServiceArchivePath $relative) {
            $files.Add(@{ Path = $entry.FullName; Entry = $relative })
        }
    }
}

foreach ($entry in Get-ChildItem -LiteralPath $root -Force) {
    if ($entry.PSIsContainer -and $entry.Name -cin @('app', 'src', 'public')) {
        if ($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Source directory is a link.' }
        Add-SourceFiles $entry.FullName
    } elseif (-not $entry.PSIsContainer -and (Test-AppServiceArchivePath $entry.Name)) {
        if ($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Source file is a link.' }
        $files.Add(@{ Path = $entry.FullName; Entry = $entry.Name })
    }
}
$creditsPath = $root
foreach ($segment in @('docs', 'ws1', 'audio-credits.txt')) {
    $creditsPath = Join-Path $creditsPath $segment
    $creditsItem = Get-Item -LiteralPath $creditsPath -Force
    if ($creditsItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw 'Public audio credits must not be a symbolic link or pass through a junction.'
    }
}
if ($creditsItem.PSIsContainer -or $creditsItem.Length -eq 0 -or $creditsItem.Length -gt 32MB) {
    throw 'The public audio credits must be a nonempty file within the entry limit.'
}
$existingCredits = @($files | Where-Object { $_.Entry -ceq 'AUDIO-CREDITS.txt' })
if ($existingCredits.Count -eq 0) {
    $files.Add(@{ Path = $creditsPath; Entry = 'AUDIO-CREDITS.txt' })
} elseif ((Get-Item -LiteralPath $existingCredits[0].Path).Length -ne $creditsItem.Length -or
    (Get-FileHash -LiteralPath $existingCredits[0].Path -Algorithm SHA256).Hash -ine
    (Get-FileHash -LiteralPath $creditsPath -Algorithm SHA256).Hash) {
    throw 'Root AUDIO-CREDITS.txt conflicts with the canonical docs/ws1/audio-credits.txt notice.'
}
foreach ($required in @(
    'package.json', 'package-lock.json', 'tsconfig.json', 'app/layout.tsx', 'AUDIO-CREDITS.txt',
    'src/features/participation/content/pageAudioAssets.json',
    'public/audio/need.mp3', 'public/audio/opportunity.mp3', 'public/audio/impact.mp3'
)) {
    if ($required -cnotin $files.Entry) { throw "Required application file is missing: $required" }
}
if ($files.Count -gt 10000) { throw 'Too many source archive entries.' }
[long] $total = 0
foreach ($file in $files) {
    $size = (Get-Item -LiteralPath $file.Path).Length
    $total += $size
    if ($size -gt 32MB -or $total -gt 64MB) { throw 'Uncompressed source exceeds the safety limit.' }
}
$package = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$lock = Get-Content -LiteralPath (Join-Path $root 'package-lock.json') -Raw | ConvertFrom-Json -AsHashtable
if ($lock.lockfileVersion -lt 2 -or $package.name -cne $lock.name) { throw 'Expected a matching npm lockfile.' }
if ($package.scripts.start -cne 'next start') { throw 'Review the startup contract before packaging a different start script.' }

$null = New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force
$temporary = Join-Path (Split-Path -Parent $destination) ".sunsum-source-$([guid]::NewGuid().ToString('N')).tmp"
try {
    $archive = [System.IO.Compression.ZipFile]::Open($temporary, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($file in $files | Sort-Object Entry) {
            $null = [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $archive, $file.Path, $file.Entry, [System.IO.Compression.CompressionLevel]::Optimal
            )
        }
    } finally { $archive.Dispose() }
    $result = & (Join-Path $PSScriptRoot 'Test-AppServicePackage.ps1') -Path $temporary
    [System.IO.File]::Move($temporary, $destination)
    $result.Path = $destination
    $result
} finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
}
