#requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $SubscriptionId,
    [Parameter(Mandatory)][string] $ResourceGroupName,
    [Parameter(Mandatory)][string] $PostgresServerName,
    [Parameter(Mandatory)][string] $ApprovalFile,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string] $ExpectedSha256,
    [string] $OutputPath = '.azure\artifacts\postgres-firewall.parameters.json',
    [switch] $Apply
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'DeploymentSafety.psm1') -Force
$approvalPath = (Resolve-Path -LiteralPath $ApprovalFile).Path
$approvalBytes = [System.IO.File]::ReadAllBytes($approvalPath)
if ([System.Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($approvalBytes)) -ine $ExpectedSha256) {
    throw 'Firewall approval no longer matches its reviewed hash.'
}
$encoding = [System.Text.UTF8Encoding]::new($false, $true)
$approval = $encoding.GetString($approvalBytes).TrimStart([char]0xfeff) | ConvertFrom-Json -AsHashtable
$addresses = Assert-FirewallApproval -Approval $approval -SubscriptionId $SubscriptionId `
    -ResourceGroupName $ResourceGroupName -PostgresServerName $PostgresServerName
$parameters = @{
    '$schema' = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'
    contentVersion = '1.0.0.0'
    parameters = @{
        postgresServerName = @{ value = $PostgresServerName }
        approvalReference = @{ value = $approval.approvalReference }
        approvedIpv4Addresses = @{ value = @($addresses) }
    }
}
$destination = [System.IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $destination) { throw 'Use a new parameter path to preserve the review record.' }
$null = New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force
$parameterBytes = $encoding.GetBytes(($parameters | ConvertTo-Json -Depth 5))
$parameterHash = [System.Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($parameterBytes))
$stream = [System.IO.File]::Open($destination, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
try {
    $stream.Write($parameterBytes, 0, $parameterBytes.Length)
    $stream.Flush()
    if (-not $Apply) {
        Write-Output "Validated $($addresses.Count) exact addresses and wrote parameters. No Azure calls; -Apply requires separate authorization."
        return
    }
    if ($addresses.Count -eq 0) { throw 'An empty incremental deployment does not revoke existing rules. Review removals separately.' }

    $stream.Dispose()
    $stream = [System.IO.File]::Open($destination, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    $template = Join-Path $PSScriptRoot '..\templates\postgres-firewall.bicep'
    if ((Get-FileHash -LiteralPath $approvalPath -Algorithm SHA256).Hash -ine $ExpectedSha256) {
        throw 'Firewall approval changed before deployment; obtain a new review.'
    }
    if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ine $parameterHash) {
        throw 'Generated firewall parameters changed before deployment.'
    }
    & az deployment group create --subscription $SubscriptionId --resource-group $ResourceGroupName `
        --name "sunsum-firewall-$([datetime]::UtcNow.ToString('yyyyMMddHHmmss'))" --mode Incremental `
        --template-file $template --parameters "@$destination" --only-show-errors --output none
    if ($LASTEXITCODE -ne 0) { throw 'Firewall deployment failed; inspect its deployment record before retrying.' }
    Write-Output 'Approved individual firewall rules applied. Existing rules were not removed.'
} finally { $stream.Dispose() }
