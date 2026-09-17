#requires -Version 7.2
[CmdletBinding()]
param([Parameter(Mandatory)][string] $Path)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'DeploymentSafety.psm1') -Force

$resolved = (Resolve-Path -LiteralPath $Path).Path
if ((Get-Item -LiteralPath $resolved).Length -gt 64MB) { throw 'Source archive exceeds the 64 MiB safety limit.' }
$archive = [System.IO.Compression.ZipFile]::OpenRead($resolved)
try {
    if ($archive.Entries.Count -gt 10000) { throw 'Too many source archive entries.' }
    $names = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $exactNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    [long] $total = 0
    foreach ($entry in $archive.Entries) {
        if (-not (Test-AppServiceArchivePath $entry.FullName) -or -not $names.Add($entry.FullName)) {
            throw 'Archive contains an unexpected, duplicate or unsafe path.'
        }
        $null = $exactNames.Add($entry.FullName)
        if ((($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) {
            throw 'Archive contains a symbolic link.'
        }
        $total += $entry.Length
        if ($total -gt 64MB -or $entry.Length -gt 32MB) { throw 'Uncompressed source exceeds the safety limit.' }
    }
    foreach ($required in @('package.json', 'package-lock.json', 'tsconfig.json', 'app/layout.tsx')) {
        if (-not $exactNames.Contains($required)) { throw "Archive is missing required file with exact Linux casing: $required" }
    }
    [pscustomobject]@{
        Path = $resolved
        Files = $archive.Entries.Count
        UncompressedBytes = $total
        SHA256 = (Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash
    }
} finally {
    $archive.Dispose()
}
