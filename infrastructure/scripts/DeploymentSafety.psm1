#requires -Version 7.2
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function New-DeploymentSnapshot {
    param(
        [Parameter(Mandatory)][string] $Path,
        [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string] $ExpectedSha256
    )
    $sourcePath = (Resolve-Path -LiteralPath $Path).Path
    $source = [System.IO.File]::Open($sourcePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    $directory = Join-Path ([System.IO.Path]::GetTempPath()) "sunsum-deployment-$([guid]::NewGuid().ToString('N'))"
    $snapshotPath = Join-Path $directory "input$([System.IO.Path]::GetExtension($sourcePath))"
    $stream = $null
    try {
        $null = [System.IO.Directory]::CreateDirectory($directory)
        $writer = [System.IO.File]::Open($snapshotPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        try { $source.CopyTo($writer) } finally { $writer.Dispose() }
        $stream = [System.IO.File]::Open($snapshotPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
        $snapshot = [pscustomobject]@{
            Path = $snapshotPath
            SourcePath = $sourcePath
            SHA256 = $ExpectedSha256
            Stream = $stream
            SourceStream = $source
            Directory = $directory
        }
        Assert-DeploymentSnapshot $snapshot
        return $snapshot
    } catch {
        if ($null -ne $stream) { $stream.Dispose() }
        $source.Dispose()
        if ([System.IO.Directory]::Exists($directory)) { [System.IO.Directory]::Delete($directory, $true) }
        throw
    }
}

function Assert-DeploymentSnapshot {
    param([Parameter(Mandatory)] $Snapshot)
    foreach ($path in @($Snapshot.SourcePath, $Snapshot.Path)) {
        if ((Get-FileHash -LiteralPath $path -Algorithm SHA256 -ErrorAction Stop).Hash -ine $Snapshot.SHA256) {
            throw 'Deployment input or snapshot no longer matches the reviewed SHA-256.'
        }
    }
}

function Remove-DeploymentSnapshot {
    param([Parameter(Mandatory)] $Snapshot)
    $Snapshot.Stream.Dispose()
    $Snapshot.SourceStream.Dispose()
    [System.IO.Directory]::Delete($Snapshot.Directory, $true)
}

function New-DeploymentApproval {
    param(
        [Parameter(Mandatory)][string] $Path,
        [Parameter(Mandatory)][string] $ExpectedSha256,
        [Parameter(Mandatory)][System.Collections.IDictionary] $Expected
    )
    $snapshot = New-DeploymentSnapshot -Path $Path -ExpectedSha256 $ExpectedSha256
    try {
        $record = Get-Content -LiteralPath $snapshot.Path -Raw | ConvertFrom-Json -AsHashtable
        if ($record -isnot [System.Collections.IDictionary] -or $record.Count -ne $Expected.Count) {
            throw 'Deployment approval must contain exactly the documented fields.'
        }
        foreach ($key in $Expected.Keys) {
            if (-not $record.Contains($key) -or $record[$key] -isnot [string] -or
                [string]::IsNullOrWhiteSpace($record[$key]) -or $record[$key] -match '[<>\x00-\x1f]') {
                throw "Invalid deployment approval field: $key."
            }
            $valueMatches = if ($key -in @('subscriptionId', 'resourceGroupName', 'webAppName', 'payloadSha256')) {
                $record[$key] -ieq [string]$Expected[$key]
            } else { $record[$key] -ceq [string]$Expected[$key] }
            if (-not $valueMatches) { throw "Deployment approval does not match the explicit operation ($key)." }
        }
        return $snapshot
    } catch {
        Remove-DeploymentSnapshot $snapshot
        throw
    }
}

function Assert-AppServiceFreePlan {
    param(
        [Parameter(Mandatory)][guid] $SubscriptionId,
        [AllowNull()][object] $PlanResourceId
    )
    $planPattern = '\A/subscriptions/' + [regex]::Escape([string]$SubscriptionId) + '/resourceGroups/[a-zA-Z0-9_().-]{1,90}/providers/Microsoft[.]Web/serverfarms/[a-zA-Z0-9-]{1,60}\z'
    if ($PlanResourceId -isnot [string] -or $PlanResourceId -inotmatch $planPattern) {
        throw 'The web app must identify its App Service plan in the explicit subscription before deployment.'
    }
    $raw = & az appservice plan show --ids $PlanResourceId --subscription $SubscriptionId `
        --query '{id:id,sku:sku}' --output json --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw 'Cannot verify the linked App Service plan; no deployment was attempted.' }
    $plan = ($raw -join "`n") | ConvertFrom-Json -AsHashtable -NoEnumerate
    if ($plan -isnot [System.Collections.IDictionary] -or -not $plan.Contains('id') -or
        $plan.id -isnot [string] -or $plan.id -ine $PlanResourceId -or
        -not $plan.Contains('sku') -or $plan.sku -isnot [System.Collections.IDictionary] -or
        -not $plan.sku.Contains('name') -or $plan.sku.name -isnot [string] -or $plan.sku.name -ine 'F1' -or
        -not $plan.sku.Contains('tier') -or $plan.sku.tier -isnot [string] -or $plan.sku.tier -ine 'Free') {
        throw 'This deployment path requires the linked F1/Free App Service plan; paid or unknown plans require separate review. No plan change was attempted.'
    }
}

function Assert-AppServicePublishingDisabled {
    param(
        [Parameter(Mandatory)][guid] $SubscriptionId,
        [Parameter(Mandatory)][string] $ResourceGroupName,
        [Parameter(Mandatory)][string] $WebAppName,
        [AllowNull()][object] $FtpsState
    )
    if ($FtpsState -isnot [string] -or $FtpsState -cne 'Disabled') {
        throw 'The web app must have ftpsState=Disabled before this operation; remediate publishing settings through a separately reviewed operation.'
    }
    $webId = "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroupName/providers/Microsoft.Web/sites/$WebAppName"
    foreach ($policy in @('ftp', 'scm')) {
        $raw = & az resource show --ids "$webId/basicPublishingCredentialsPolicies/$policy" --subscription $SubscriptionId `
            --api-version 2024-04-01 --query properties.allow --output json --only-show-errors
        if ($LASTEXITCODE -ne 0 -or ($raw -join "`n").Trim() -cne 'false') {
            throw 'Both FTP and SCM basic-publishing credential policies must be explicitly disabled; no update was attempted.'
        }
    }
}

function Assert-ExactPublicIpv4 {
    param([AllowEmptyString()][string] $Address)
    if ($Address -cnotmatch '^(0|[1-9][0-9]{0,2})(\.(0|[1-9][0-9]{0,2})){3}$') {
        throw 'Only canonical individual IPv4 addresses are accepted; no ranges, CIDRs or whitespace.'
    }
    $ip = $null
    if (-not [System.Net.IPAddress]::TryParse($Address, [ref] $ip)) {
        throw 'Invalid IPv4 address.'
    }
    $b = $ip.GetAddressBytes()
    if ($b.Count -ne 4 -or $b[0] -eq 0 -or $b[0] -eq 10 -or $b[0] -eq 127 -or $b[0] -ge 224 -or
        ($b[0] -eq 100 -and $b[1] -ge 64 -and $b[1] -le 127) -or
        ($b[0] -eq 169 -and $b[1] -eq 254) -or
        ($b[0] -eq 172 -and $b[1] -ge 16 -and $b[1] -le 31) -or
        ($b[0] -eq 192 -and ($b[1] -eq 168 -or ($b[1] -eq 0 -and $b[2] -in @(0, 2)))) -or
        ($b[0] -eq 198 -and ($b[1] -in @(18, 19) -or ($b[1] -eq 51 -and $b[2] -eq 100))) -or
        ($b[0] -eq 203 -and $b[1] -eq 0 -and $b[2] -eq 113)) {
        throw 'Private, reserved, documentation and Azure-wide bypass addresses are not permitted.'
    }
}

function Test-AppServiceArchivePath {
    param([string] $Path)
    if ($Path -cmatch '\\|^/|(^|/)\.\.?(/|$)' -or $Path -match '[\x00-\x1f]') { return $false }
    if ($Path -cin @(
        'package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts',
        'next.config.js', 'next.config.mjs', 'eslint.config.mjs',
        'postcss.config.js', 'postcss.config.mjs', 'tailwind.config.ts', 'AUDIO-CREDITS.txt'
    )) { return $true }
    if ($Path -cnotmatch '^(app|src|public)/') { return $false }
    if ($Path -match '(^|/)(\.|node_modules/|tests/|__tests__/|coverage/|obj/|bin/|secrets?/|credentials?/)' -or
        $Path -match '(^|/)(secrets?|credentials?)\.(json|txt)$' -or
        $Path -match '(^|/)[^/]*\.(local|test|spec)\.' -or
        $Path -match '\.(pem|key|pfx|p12|crt|cer|der|jks)$') { return $false }
    if ($Path -cin @('public/audio/need.mp3', 'public/audio/opportunity.mp3', 'public/audio/impact.mp3')) {
        return $true
    }
    return $Path -cmatch '\.(ts|tsx|js|jsx|mjs|cjs|json|css|svg|woff|woff2|ttf|otf|png|jpg|jpeg|webp|avif|ico|txt)$'
}

function Assert-FirewallApproval {
    param(
        [System.Collections.IDictionary] $Approval,
        [string] $SubscriptionId,
        [string] $ResourceGroupName,
        [string] $PostgresServerName
    )
    $id = [guid]::Empty
    if (-not [guid]::TryParseExact($SubscriptionId, 'D', [ref] $id) -or $id -eq [guid]::Empty) {
        throw 'A nonempty subscription UUID is required.'
    }
    if ($ResourceGroupName -notmatch '^[a-zA-Z0-9_().-]{1,90}$' -or $ResourceGroupName.EndsWith('.') -or
        $PostgresServerName -cnotmatch '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$') {
        throw 'Invalid resource group or PostgreSQL server name.'
    }
    foreach ($entry in @{
        subscriptionId = $SubscriptionId
        resourceGroupName = $ResourceGroupName
        postgresServerName = $PostgresServerName
    }.GetEnumerator()) {
        if ($Approval[$entry.Key] -isnot [string] -or $Approval[$entry.Key] -ine $entry.Value) {
            throw "Firewall approval does not match the explicit target ($($entry.Key))."
        }
    }
    $reference = $Approval['approvalReference']
    if ($reference -isnot [string] -or [string]::IsNullOrWhiteSpace($reference) -or
        $reference.Length -gt 200 -or $reference -match '[\x00-\x1f<>]') {
        throw 'Record a nonempty review/ticket reference; a discovery proposal is not approval.'
    }
    $addresses = $Approval['approvedIpv4Addresses']
    if ($addresses -isnot [array] -or $addresses.Count -gt 128) {
        throw 'Approval must contain an IPv4 array with no more than 128 addresses.'
    }
    $seen = [System.Collections.Generic.HashSet[string]]::new()
    foreach ($address in $addresses) {
        if ($address -isnot [string]) { throw 'Each approved IPv4 address must be a string.' }
        Assert-ExactPublicIpv4 $address
        if (-not $seen.Add($address)) { throw 'Duplicate approved IPv4 address.' }
    }
    return ,@($addresses | Sort-Object)
}

function Test-AppServiceResponse {
    param(
        [Parameter(Mandatory)][uri] $Uri,
        [ValidateSet('Preview', 'ApprovedSignIn')][string] $ExpectedAccessMode
    )
    $handler = [System.Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $false
    $handler.UseCookies = $false
    $client = [System.Net.Http.HttpClient]::new($handler)
    $client.Timeout = [timespan]::FromSeconds(10)
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, $Uri)
    $response = $null
    try {
        $response = $client.Send($request, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead)
        if ($ExpectedAccessMode -eq 'Preview') { return [int]$response.StatusCode -eq 200 }
        if ([int]$response.StatusCode -ne 302 -or $null -eq $response.Headers.Location) { return $false }
        $redirect = $null
        if (-not [uri]::TryCreate($Uri, [string]$response.Headers.Location, [ref]$redirect)) { return $false }
        return $redirect.Scheme -eq 'https' -and $redirect.Port -eq 443 -and $redirect.UserInfo -eq '' -and (
            ($redirect.Host -eq $Uri.Host -and $redirect.AbsolutePath -eq '/.auth/login/aad') -or
            $redirect.Host -eq 'login.microsoftonline.com'
        )
    } finally {
        if ($null -ne $response) { $response.Dispose() }
        $request.Dispose()
        $client.Dispose()
    }
}

Export-ModuleMember -Function Assert-AppServicePublishingDisabled, Assert-AppServiceFreePlan, New-DeploymentApproval, New-DeploymentSnapshot, Assert-DeploymentSnapshot, Remove-DeploymentSnapshot, Assert-ExactPublicIpv4, Test-AppServiceArchivePath, Assert-FirewallApproval, Test-AppServiceResponse
