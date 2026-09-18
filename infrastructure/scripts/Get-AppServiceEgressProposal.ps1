#requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory)][guid] $SubscriptionId,
    [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9_().-]{1,90}$')][string] $ResourceGroupName,
    [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9-]{0,58}[a-zA-Z0-9]$')][string] $WebAppName,
    [string[]] $OperatorIpv4Addresses = @(),
    [string] $OutputPath = '.azure\artifacts\egress-proposal.json'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'DeploymentSafety.psm1') -Force
if ($SubscriptionId -eq [guid]::Empty) { throw 'An explicit subscription is required.' }
foreach ($address in $OperatorIpv4Addresses) { Assert-ExactPublicIpv4 $address }
if (Test-Path -LiteralPath $OutputPath) { throw 'Use a new proposal path to retain the previous audit record.' }

$raw = & az webapp show --subscription $SubscriptionId --resource-group $ResourceGroupName --name $WebAppName `
    --query '{id:id,current:outboundIpAddresses,possible:possibleOutboundIpAddresses}' --output json --only-show-errors
if ($LASTEXITCODE -ne 0) { throw 'Read-only App Service egress discovery failed.' }
$app = ($raw -join "`n") | ConvertFrom-Json
$current = @($app.current -split ',' | Where-Object { $_ -ne '' } | Sort-Object -Unique)
$possible = @($app.possible -split ',' | Where-Object { $_ -ne '' } | Sort-Object -Unique)
if ($current.Count -eq 0 -or $possible.Count -eq 0) {
    throw 'Azure did not return both egress sets. Do not invent an allowance or enable the Azure-wide bypass.'
}
$proposed = @($current + $possible + $OperatorIpv4Addresses | Sort-Object -Unique)
if ($proposed.Count -gt 128) { throw 'More than 128 addresses require separate network design review.' }
foreach ($address in $proposed) { Assert-ExactPublicIpv4 $address }
$proposal = [ordered]@{
    status = 'proposal-only-not-approved'
    observedAtUtc = [datetime]::UtcNow.ToString('o')
    resourceId = $app.id
    currentOutboundIpv4Addresses = $current
    possibleOutboundIpv4Addresses = $possible
    operatorIpv4Addresses = $OperatorIpv4Addresses
    proposedIpv4Addresses = $proposed
}
$destination = [System.IO.Path]::GetFullPath($OutputPath)
$null = New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force
$proposal | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $destination -Encoding utf8NoBOM
Write-Output "Saved proposal only ($($proposed.Count) unique addresses); no firewall changes were made."
