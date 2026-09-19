#requires -Version 7.2
[CmdletBinding(DefaultParameterSetName = 'Validate')]
param(
    [string] $ConfigPath = (Join-Path $PSScriptRoot '..\config\dev.json'),
    [string] $BicepPath = 'bicep',
    [Parameter(ParameterSetName = 'Preview')][switch] $Preview,
    [Parameter(ParameterSetName = 'Apply')][switch] $Apply
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'DeploymentSafety.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'DeploymentConfiguration.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'InfrastructureValidation.psm1') -Force
$configFile = (Resolve-Path -LiteralPath $ConfigPath).Path
$config = Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json -AsHashtable
Assert-DeploymentConfiguration -Config $config -Operation Infrastructure
$SubscriptionId = [guid]$config.subscriptionId
$ResourceGroupName = $config.resourceGroupName
$DeploymentName = $config.infrastructure.deploymentName
$configDirectory = Split-Path -Parent $configFile
$TemplatePath = [System.IO.Path]::GetFullPath($config.infrastructure.templatePath, $configDirectory)
$ParametersPath = [System.IO.Path]::GetFullPath($config.infrastructure.parametersPath, $configDirectory)
if ([System.IO.Path]::GetExtension($TemplatePath) -cne '.bicep' -or
    [System.IO.Path]::GetExtension($ParametersPath) -cne '.bicepparam' -or
    -not (Test-Path -LiteralPath $TemplatePath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $ParametersPath -PathType Leaf)) {
    throw 'The config must reference existing Bicep source and native Bicep parameter files.'
}
$compiler = Get-Command $BicepPath -ErrorAction Stop
$raw = & $compiler build-params $ParametersPath --bicep-file $TemplatePath --no-restore --stdout
if ($LASTEXITCODE -ne 0) { throw 'Bicep compilation failed. No Azure calls or deployment attempted.' }
$build = ($raw -join "`n") | ConvertFrom-Json -AsHashtable
if ($build -isnot [System.Collections.IDictionary] -or $build['templateJson'] -isnot [string] -or
    $build['parametersJson'] -isnot [string] -or $build['templateSpecId']) {
    throw 'Expected local compiled template and parameters from Bicep.'
}
$artifactRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.azure\dev\deployments'))
$runDirectory = Join-Path $artifactRoot "$DeploymentName-$([guid]::NewGuid().ToString('N'))"
$null = New-Item -ItemType Directory -Path $runDirectory
$compiledPath = Join-Path $runDirectory 'template.json'
$parameterPath = Join-Path $runDirectory 'parameters.json'
[System.IO.File]::WriteAllText($compiledPath, $build.templateJson)
[System.IO.File]::WriteAllText($parameterPath, $build.parametersJson)
$templateHash = (Get-FileHash -LiteralPath $compiledPath -Algorithm SHA256).Hash
$parameterHash = (Get-FileHash -LiteralPath $parameterPath -Algorithm SHA256).Hash
@{
    subscriptionId = [string]$SubscriptionId; resourceGroupName = $ResourceGroupName; deploymentName = $DeploymentName
    templateSha256 = $templateHash; parametersSha256 = $parameterHash
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runDirectory 'manifest.json') -Encoding utf8NoBOM
$snapshots = [System.Collections.Generic.List[object]]::new()
try {
    $template = New-DeploymentSnapshot -Path $compiledPath -ExpectedSha256 $templateHash
    $snapshots.Add($template)
    $parameters = New-DeploymentSnapshot -Path $parameterPath -ExpectedSha256 $parameterHash
    $snapshots.Add($parameters)
    $compiled = Get-Content -LiteralPath $template.Path -Raw | ConvertFrom-Json -AsHashtable
    $inputs = Get-Content -LiteralPath $parameters.Path -Raw | ConvertFrom-Json -AsHashtable
    Assert-InfrastructureTemplate -Compiled $compiled -Inputs $inputs -ExpectedWebAppName $config.webAppName -RequireDeploymentIdentity:($Preview -or $Apply)
    Write-Output "Compiled artifacts: $runDirectory"
    if (-not $Preview -and -not $Apply) {
        Write-Output 'Bicep sources compiled and validated locally. No Azure calls.'
        return
    }
    $raw = & az deployment group what-if --subscription $SubscriptionId --resource-group $ResourceGroupName `
        --name $DeploymentName --mode Incremental --template-file $template.Path --parameters "@$($parameters.Path)" `
        --no-pretty-print --output json --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw 'What-if failed. No deployment attempted.' }
    [System.IO.File]::WriteAllText((Join-Path $runDirectory 'what-if.json'), ($raw -join "`n"))
    $result = ($raw -join "`n") | ConvertFrom-Json -AsHashtable
    $managed = Get-ValidatedInfrastructureChanges -Result $result -SubscriptionId $SubscriptionId -ResourceGroupName $ResourceGroupName
    foreach ($snapshot in $snapshots) { Assert-DeploymentSnapshot $snapshot }
    $managed.Values | Sort-Object resourceId | ForEach-Object { Write-Output "$($_.changeType): $($_.resourceId)" }
    if ($Preview) { Write-Output 'Preview passed. No deployment applied.'; return }
    $errorPath = Join-Path $runDirectory 'deployment-error.txt'
    $deploymentOutput = & az deployment group create --subscription $SubscriptionId --resource-group $ResourceGroupName `
        --name $DeploymentName --mode Incremental --template-file $template.Path --parameters "@$($parameters.Path)" `
        --only-show-errors --output none 2> $errorPath
    if ($LASTEXITCODE -ne 0) {
        $diagnostics = (Get-Content -LiteralPath $errorPath -Raw) + [Environment]::NewLine + ($deploymentOutput -join [Environment]::NewLine)
        [System.IO.File]::WriteAllText($errorPath, $diagnostics)
        $summary = Get-InfrastructureFailureSummary -ErrorText $diagnostics
        Write-Output "Deployment diagnostics (may contain private values): $errorPath"
        Write-Output "Read-only inspection: az deployment operation group list --subscription '$SubscriptionId' --resource-group '$ResourceGroupName' --name '$DeploymentName' --query `"[?properties.provisioningState=='Failed'].properties`" --output json"
        Write-Output 'For a failed nested deployment, repeat the inspection with that deployment name. Keep raw diagnostics local.'
        throw "Deployment '$DeploymentName' did not report success; partial resources may exist. $summary No automatic retry or rollback."
    }
    Write-Output 'Infrastructure deployment reported success. Application, SQL migrations and data-plane checks remain separate.'
} finally {
    foreach ($snapshot in $snapshots) { Remove-DeploymentSnapshot $snapshot }
}