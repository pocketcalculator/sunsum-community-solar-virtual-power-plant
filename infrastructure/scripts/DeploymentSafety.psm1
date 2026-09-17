#requires -Version 7.2
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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
        'postcss.config.js', 'postcss.config.mjs', 'tailwind.config.ts'
    )) { return $true }
    if ($Path -cnotmatch '^(app|src|public)/') { return $false }
    if ($Path -match '(^|/)(\.|node_modules/|tests/|__tests__/|coverage/|obj/|bin/|secrets?/|credentials?/)' -or
        $Path -match '(^|/)(secrets?|credentials?)\.(json|txt)$' -or
        $Path -match '(^|/)[^/]*\.(local|test|spec)\.' -or
        $Path -match '\.(pem|key|pfx|p12|crt|cer|der|jks)$') { return $false }
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

Export-ModuleMember -Function Assert-ExactPublicIpv4, Test-AppServiceArchivePath, Assert-FirewallApproval, Test-AppServiceResponse
