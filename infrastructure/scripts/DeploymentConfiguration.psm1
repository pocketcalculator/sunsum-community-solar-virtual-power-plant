#requires -Version 7.2
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-DeploymentConfiguration {
    param($Config, [Parameter(Mandatory)][ValidateSet('Infrastructure', 'Code')][string] $Operation)
    $fields = @('subscriptionId', 'resourceGroupName', 'webAppName', 'infrastructure', 'code')
    if ($Config -isnot [System.Collections.IDictionary] -or $Config.Count -ne $fields.Count) {
        throw 'Deployment config must contain shared subscriptionId, resourceGroupName and webAppName, plus infrastructure and code sections.'
    }
    foreach ($field in $fields) {
        if (-not $Config.Contains($field)) { throw "Missing deployment config field: $field." }
    }
    foreach ($field in @('subscriptionId', 'resourceGroupName', 'webAppName')) {
        if ($Config[$field] -isnot [string] -or [string]::IsNullOrWhiteSpace($Config[$field]) -or $Config[$field] -match '[<>\x00-\x1f]') {
            throw "Invalid shared deployment target: $field."
        }
    }
    $subscriptionId = [guid]::Empty
    if (-not [guid]::TryParseExact($Config.subscriptionId, 'D', [ref]$subscriptionId) -or $subscriptionId -eq [guid]::Empty -or
        $Config.resourceGroupName -cnotmatch '\A[a-zA-Z0-9_().-]{1,90}\z' -or $Config.resourceGroupName.EndsWith('.') -or
        $Config.webAppName -cnotmatch '\A[a-zA-Z0-9][a-zA-Z0-9-]{0,58}[a-zA-Z0-9]\z') {
        throw 'A valid shared subscription, resource group and web app name are required.'
    }
    $sectionName = $Operation.ToLowerInvariant()
    $section = $Config[$sectionName]
    $sectionFields = @(if ($Operation -eq 'Infrastructure') { 'deploymentName', 'templatePath', 'parametersPath' } else { 'expectedAccessMode' })
    if ($section -isnot [System.Collections.IDictionary] -or $section.Count -ne $sectionFields.Count) {
        throw "Invalid $sectionName deployment section; use only its documented fields."
    }
    foreach ($field in $sectionFields) {
        if (-not $section.Contains($field) -or $section[$field] -isnot [string] -or
            [string]::IsNullOrWhiteSpace($section[$field]) -or $section[$field] -match '[<>\x00-\x1f]') {
            throw "Invalid $sectionName deployment field: $field."
        }
    }
    if ($Operation -eq 'Infrastructure' -and $section.deploymentName -cnotmatch '\A[a-zA-Z0-9_().-]{1,64}\z') {
        throw 'A valid infrastructure deployment name is required.'
    }
    if ($Operation -eq 'Code' -and $section.expectedAccessMode -cnotin @('Preview', 'ApprovedSignIn')) {
        throw 'Code deployment requires a supported HTTP access mode.'
    }
}

Export-ModuleMember -Function Assert-DeploymentConfiguration