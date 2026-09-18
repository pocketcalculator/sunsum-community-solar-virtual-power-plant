#requires -Version 7.2
[CmdletBinding(DefaultParameterSetName = 'Validate')]
param(
    [Parameter(ParameterSetName = 'Preview')][switch] $Preview,
    [Parameter(ParameterSetName = 'Apply')][switch] $Apply
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$targetPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\templates\deployment.dev.json'))
$reviewPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.azure\dev\deployment.json'))
$sources = @(
    @{ Path = $targetPath; Fields = @('subscriptionId', 'resourceGroupName', 'deploymentName') },
    @{ Path = $reviewPath; Fields = @('templatePath', 'templateSha256', 'parametersPath', 'parametersSha256', 'approvalPath', 'approvalSha256', 'approvalReference') }
)
$config = @{}
foreach ($source in $sources) {
    if (-not (Test-Path -LiteralPath $source.Path -PathType Leaf)) {
        throw 'Dev deployment configuration is missing. Use the committed infrastructure/templates/deployment.dev.json target and prepare .azure/dev/deployment.json from infrastructure/templates/deployment.dev.example.json with reviewed artifacts and hashes.'
    }
    $document = Get-Content -LiteralPath $source.Path -Raw | ConvertFrom-Json -AsHashtable
    if ($document -isnot [System.Collections.IDictionary] -or $document.Count -ne $source.Fields.Count) {
        throw 'Dev target and local review configuration must each contain exactly their documented fields; local target overrides are not allowed.'
    }
    foreach ($field in $source.Fields) {
        if (-not $document.Contains($field) -or $document[$field] -isnot [string] -or
            [string]::IsNullOrWhiteSpace($document[$field]) -or $document[$field] -match '[<>\x00-\x1f]') {
            throw "Invalid or unconfigured dev deployment field: $field."
        }
        $config[$field] = $document[$field]
    }
}
foreach ($field in @('templatePath', 'parametersPath', 'approvalPath')) {
    $config[$field] = [System.IO.Path]::GetFullPath($config[$field], (Split-Path -Parent $reviewPath))
}
if ($Preview) { $config['Preview'] = $true }
if ($Apply) { $config['Apply'] = $true }
& (Join-Path $PSScriptRoot 'Deploy-Infrastructure.ps1') @config