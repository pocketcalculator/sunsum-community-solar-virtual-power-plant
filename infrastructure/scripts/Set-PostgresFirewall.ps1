#requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $SubscriptionId,
    [Parameter(Mandatory)][string] $ResourceGroupName,
    [Parameter(Mandatory)][string] $PostgresServerName,
    [Parameter(Mandatory)][string] $ApprovalFile,
    [string] $OutputPath = '.azure\artifacts\postgres-firewall.parameters.json',
    [switch] $Apply
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'DeploymentSafety.psm1') -Force
$approval = Get-Content -LiteralPath $ApprovalFile -Raw | ConvertFrom-Json -AsHashtable
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
$parameters | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $destination -Encoding utf8NoBOM
if (-not $Apply) {
    Write-Output "Validated $($addresses.Count) exact addresses and wrote parameters. No Azure calls; -Apply requires separate authorization."
    return
}
if ($addresses.Count -eq 0) { throw 'An empty incremental deployment does not revoke existing rules. Review removals separately.' }

$template = Join-Path $PSScriptRoot '..\templates\postgres-firewall.bicep'
& az deployment group create --subscription $SubscriptionId --resource-group $ResourceGroupName `
    --name "sunsum-firewall-$([datetime]::UtcNow.ToString('yyyyMMddHHmmss'))" --mode Incremental `
    --template-file $template --parameters "@$destination" --only-show-errors --output none
if ($LASTEXITCODE -ne 0) { throw 'Firewall deployment failed; inspect its deployment record before retrying.' }
Write-Output 'Approved individual firewall rules applied. Existing rules were not removed.'
