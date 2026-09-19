#requires -Version 7.2
[CmdletBinding(DefaultParameterSetName = 'Package')]
param(
    [string] $ConfigPath = (Join-Path $PSScriptRoot '..\config\dev.json'),
    [string] $SourceRoot = (Join-Path $PSScriptRoot '..\..'),
    [string] $OutputRoot = (Join-Path $PSScriptRoot '..\..\.azure\code\deployments'),
    [Parameter(Mandatory, ParameterSetName = 'Apply')][switch] $Apply,
    [Parameter(Mandatory, ParameterSetName = 'Apply')][ValidateNotNullOrEmpty()][string] $ApprovalReference
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'DeploymentConfiguration.psm1') -Force
$config = Get-Content -LiteralPath (Resolve-Path -LiteralPath $ConfigPath).Path -Raw | ConvertFrom-Json -AsHashtable
Assert-DeploymentConfiguration -Config $config -Operation Code
$subscriptionId = [guid]$config.subscriptionId
if ($PSCmdlet.ParameterSetName -ceq 'Apply' -and
    ([string]::IsNullOrWhiteSpace($ApprovalReference) -or $ApprovalReference -match '[<>\x00-\x1f]')) {
    throw 'Supply a real code-deployment review reference before applying.'
}
$reference = if ($Apply) { $ApprovalReference } else { 'local-package-validation' }
$runDirectory = Join-Path ([System.IO.Path]::GetFullPath($OutputRoot)) "$($config.webAppName)-$([guid]::NewGuid().ToString('N'))"
$null = New-Item -ItemType Directory -Path $runDirectory
$artifact = & (Join-Path $PSScriptRoot 'New-AppServicePackage.ps1') -SourceRoot $SourceRoot -OutputPath (Join-Path $runDirectory 'web-source.zip')
$recordPath = Join-Path $runDirectory 'deployment-record.json'
@{
    operation = 'CodeDeployment'
    subscriptionId = [string]$subscriptionId
    resourceGroupName = $config.resourceGroupName
    webAppName = $config.webAppName
    payloadSha256 = $artifact.SHA256
    approvalReference = $reference
    expectedAccessMode = $config.code.expectedAccessMode
} | ConvertTo-Json | Set-Content -LiteralPath $recordPath -Encoding utf8NoBOM
$recordHash = (Get-FileHash -LiteralPath $recordPath -Algorithm SHA256).Hash
Write-Output "Code artifacts: $runDirectory"
Write-Output "Target: /subscriptions/$subscriptionId/resourceGroups/$($config.resourceGroupName)/providers/Microsoft.Web/sites/$($config.webAppName)"
Write-Output "Source ZIP SHA256: $($artifact.SHA256)"
& (Join-Path $PSScriptRoot 'Deploy-AppServiceCode.ps1') `
    -SubscriptionId $subscriptionId -ResourceGroupName $config.resourceGroupName -WebAppName $config.webAppName `
    -PackagePath $artifact.Path -ExpectedSha256 $artifact.SHA256 -ApprovalReference $reference `
    -ApprovalPath $recordPath -ApprovalSha256 $recordHash -ExpectedAccessMode $config.code.expectedAccessMode -Apply:$Apply
if (-not $Apply) {
    Write-Output 'Source packaged and validated locally. No build or Azure calls. With -Apply, Azure builds the source using the existing Oryx configuration.'
}