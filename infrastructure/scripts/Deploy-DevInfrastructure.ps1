#requires -Version 7.2
[CmdletBinding(DefaultParameterSetName = 'Validate')]
param(
    [Parameter(ParameterSetName = 'Preview')][switch] $Preview,
    [Parameter(ParameterSetName = 'Apply')][switch] $Apply
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$configPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.azure\dev\deployment.json'))
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    throw 'Dev deployment configuration is missing. Prepare .azure/dev/deployment.json from infrastructure/templates/deployment.dev.example.json and retain the reviewed artifacts and hashes.'
}
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json -AsHashtable
$fields = @(
    'subscriptionId', 'resourceGroupName', 'deploymentName', 'templatePath', 'templateSha256',
    'parametersPath', 'parametersSha256', 'approvalPath', 'approvalSha256', 'approvalReference'
)
if ($config -isnot [System.Collections.IDictionary] -or $config.Count -ne $fields.Count) {
    throw 'Dev deployment configuration must contain exactly the documented fields.'
}
foreach ($field in $fields) {
    if (-not $config.Contains($field) -or $config[$field] -isnot [string] -or
        [string]::IsNullOrWhiteSpace($config[$field]) -or $config[$field] -match '[<>\x00-\x1f]') {
        throw "Invalid or unconfigured dev deployment field: $field."
    }
}
foreach ($field in @('templatePath', 'parametersPath', 'approvalPath')) {
    $config[$field] = [System.IO.Path]::GetFullPath($config[$field], (Split-Path -Parent $configPath))
}
if ($Preview) { $config['Preview'] = $true }
if ($Apply) { $config['Apply'] = $true }
& (Join-Path $PSScriptRoot 'Deploy-Infrastructure.ps1') @config