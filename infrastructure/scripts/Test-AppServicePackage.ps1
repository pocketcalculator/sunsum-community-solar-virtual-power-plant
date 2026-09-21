#requires -Version 7.2
[CmdletBinding()]
param([Parameter(Mandatory)][string] $Path)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'DeploymentSafety.psm1') -Force

function Get-EntryDigest([System.IO.Compression.ZipArchiveEntry] $Entry) {
    $stream = $Entry.Open()
    $hash = [System.Security.Cryptography.IncrementalHash]::CreateHash([System.Security.Cryptography.HashAlgorithmName]::SHA256)
    try {
        $buffer = [byte[]]::new(65536)
        [long] $actual = 0
        while (($count = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $actual += $count
            if ($actual -gt $Entry.Length -or $actual -gt 32MB) { throw 'Archive entry expands beyond its declared safety limit.' }
            $hash.AppendData($buffer, 0, $count)
        }
        if ($actual -ne $Entry.Length) { throw 'Archive entry length does not match its content.' }
        return [Convert]::ToHexString($hash.GetHashAndReset())
    } finally {
        $hash.Dispose()
        $stream.Dispose()
    }
}

function Assert-ManifestFields($Value, [string[]] $Fields, [string] $Label) {
    if ($Value -isnot [System.Collections.IDictionary] -or $Value.Count -ne $Fields.Count) {
        throw "Invalid public audio manifest fields: $Label"
    }
    foreach ($field in $Value.Keys) {
        if ($field -cnotin $Fields) { throw "Unexpected public audio manifest field: $Label" }
    }
}

function Test-PositiveInteger($Value) {
    return ($Value -is [long] -or $Value -is [int]) -and $Value -gt 0
}

$resolved = (Resolve-Path -LiteralPath $Path).Path
$compressedBytes = (Get-Item -LiteralPath $resolved).Length
if ($compressedBytes -gt 64MB) { throw 'Source archive exceeds the 64 MiB safety limit.' }
$archive = [System.IO.Compression.ZipFile]::OpenRead($resolved)
try {
    if ($archive.Entries.Count -gt 10000) { throw 'Too many source archive entries.' }
    $names = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $exactNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    $fileHashes = [System.Collections.Generic.List[object]]::new()
    $inventory = [System.Collections.Generic.Dictionary[string, object]]::new([System.StringComparer]::Ordinal)
    [long] $total = 0
    foreach ($entry in $archive.Entries) {
        if (-not (Test-AppServiceArchivePath $entry.FullName) -or -not $names.Add($entry.FullName)) {
            throw 'Archive contains an unexpected, duplicate or unsafe path.'
        }
        $null = $exactNames.Add($entry.FullName)
        if ((($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000 -or
            ($entry.ExternalAttributes -band [System.IO.FileAttributes]::ReparsePoint)) {
            throw 'Archive contains a symbolic link.'
        }
        $total += $entry.Length
        if ($total -gt 64MB -or $entry.Length -gt 32MB) { throw 'Uncompressed source exceeds the safety limit.' }
    }
    $manifestPath = 'src/features/participation/content/pageAudioAssets.json'
    foreach ($required in @(
        'package.json', 'package-lock.json', 'tsconfig.json', 'app/layout.tsx', $manifestPath, 'AUDIO-CREDITS.txt',
        'public/audio/need.mp3', 'public/audio/opportunity.mp3', 'public/audio/impact.mp3'
    )) {
        if (-not $exactNames.Contains($required)) { throw "Archive is missing required file with exact Linux casing: $required" }
    }
    foreach ($entry in $archive.Entries | Sort-Object FullName) {
        $record = [pscustomobject]@{ path = $entry.FullName; bytes = $entry.Length; sha256 = (Get-EntryDigest $entry) }
        $fileHashes.Add($record)
        $inventory.Add($entry.FullName, $record)
    }
    $reader = [System.IO.StreamReader]::new($archive.GetEntry($manifestPath).Open(), [System.Text.UTF8Encoding]::new($false, $true))
    try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json -AsHashtable -Depth 8 }
    finally { $reader.Dispose() }
    Assert-ManifestFields $manifest @('schemaVersion', 'tracks') 'root'
    if (-not (Test-PositiveInteger $manifest.schemaVersion) -or $manifest.schemaVersion -ne 1) {
        throw 'Unsupported public audio manifest schemaVersion.'
    }
    Assert-ManifestFields $manifest.tracks @('need', 'opportunity', 'impact') 'tracks'
    $audio = @(foreach ($topic in @('need', 'opportunity', 'impact')) {
        $track = $manifest.tracks[$topic]
        Assert-ManifestFields $track @(
            'path', 'title', 'attribution', 'mime', 'bytes', 'sha256', 'durationSeconds', 'sampleRateHz', 'channels'
        ) $topic
        if ($track.path -cne "audio/$topic.mp3" -or $track.mime -cne 'audio/mpeg' -or
            $track.title -isnot [string] -or [string]::IsNullOrWhiteSpace($track.title) -or
            $track.attribution -isnot [string] -or [string]::IsNullOrWhiteSpace($track.attribution) -or
            $track.sha256 -isnot [string] -or $track.sha256 -cnotmatch '^[A-Fa-f0-9]{64}$' -or
            -not (Test-PositiveInteger $track.bytes) -or $track.bytes -gt 32MB -or
            -not (Test-PositiveInteger $track.sampleRateHz) -or
            -not (Test-PositiveInteger $track.channels) -or $track.channels -gt 2) {
            throw "Invalid public audio metadata: $topic"
        }
        $duration = $track.durationSeconds
        if (($duration -isnot [long] -and $duration -isnot [int] -and $duration -isnot [double] -and $duration -isnot [decimal]) -or
            -not [double]::IsFinite($duration) -or $duration -le 0) {
            throw "Invalid public audio duration: $topic"
        }
        $file = $inventory["public/audio/$topic.mp3"]
        if ($track.bytes -ne $file.bytes -or $track.sha256 -ine $file.sha256) {
            throw "Audio bytes or SHA-256 do not match the public manifest: $topic"
        }
        [pscustomobject]@{
            topic = $topic; path = $track.path; title = $track.title; attribution = $track.attribution
            mime = $track.mime; bytes = $file.bytes; sha256 = $file.sha256
            durationSeconds = $duration; sampleRateHz = $track.sampleRateHz; channels = $track.channels
        }
    })
    $reader = [System.IO.StreamReader]::new($archive.GetEntry('AUDIO-CREDITS.txt').Open(), [System.Text.UTF8Encoding]::new($false, $true))
    try { $credits = $reader.ReadToEnd() }
    finally { $reader.Dispose() }
    if (-not $credits.Contains('THIRD-PARTY AUDIO - NOT COVERED BY THE MIT CODE LICENSE', [StringComparison]::Ordinal)) {
        throw 'The public audio credits must distinguish third-party media from the MIT code license.'
    }
    foreach ($track in $audio) {
        if (-not $credits.Contains($track.title, [StringComparison]::Ordinal) -or
            -not $credits.Contains($track.attribution, [StringComparison]::Ordinal)) {
            throw "The public audio credits do not match the canonical manifest: $($track.topic)"
        }
    }
    [pscustomobject]@{
        Path = $resolved
        Files = $archive.Entries.Count
        CompressedBytes = $compressedBytes
        UncompressedBytes = $total
        SHA256 = (Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash
        FileHashes = $fileHashes.ToArray()
        AudioManifest = $inventory[$manifestPath]
        AudioCredits = $inventory['AUDIO-CREDITS.txt']
        Audio = $audio
    }
} finally {
    $archive.Dispose()
}
