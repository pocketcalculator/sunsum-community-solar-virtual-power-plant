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
foreach ($required in @('package.json', 'package-lock.json', 'tsconfig.json', 'app/layout.tsx')) {
    if ($required -cnotin $files.Entry) { throw "Required application file is missing: $required" }
}
$package = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$lock = Get-Content -LiteralPath (Join-Path $root 'package-lock.json') -Raw | ConvertFrom-Json -AsHashtable
if ($lock.lockfileVersion -lt 2 -or $package.name -cne $lock.name) { throw 'Expected a matching npm lockfile.' }
if ($package.scripts.start -cne 'next start') { throw 'Review the startup contract before packaging a different start script.' }

$null = New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force
$archive = [System.IO.Compression.ZipFile]::Open($destination, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $files | Sort-Object Entry) {
        $null = [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive, $file.Path, $file.Entry, [System.IO.Compression.CompressionLevel]::Optimal
        )
    }
} finally {
    $archive.Dispose()
}
& (Join-Path $PSScriptRoot 'Test-AppServicePackage.ps1') -Path $destination
