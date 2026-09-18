#requires -Version 7.2
[CmdletBinding(DefaultParameterSetName = 'Validate')]
param(
    [Parameter(Mandatory)][guid] $SubscriptionId,
    [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9_().-]{1,90}$')][string] $ResourceGroupName,
    [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9_().-]{1,64}$')][string] $DeploymentName,
    [Parameter(Mandatory)][string] $TemplatePath,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string] $TemplateSha256,
    [Parameter(Mandatory)][string] $ParametersPath,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string] $ParametersSha256,
    [Parameter(Mandatory)][string] $ApprovalPath,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string] $ApprovalSha256,
    [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string] $ApprovalReference,
    [Parameter(ParameterSetName = 'Preview')][switch] $Preview,
    [Parameter(ParameterSetName = 'Apply')][switch] $Apply
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'DeploymentSafety.psm1') -Force
if ($SubscriptionId -eq [guid]::Empty -or $ResourceGroupName.EndsWith('.') -or
    [string]::IsNullOrWhiteSpace($ApprovalReference) -or $ApprovalReference -match '[<>\x00-\x1f]') {
    throw 'An explicit target and review reference are required.'
}
$snapshots = [System.Collections.Generic.List[object]]::new()
try {
    $template = New-DeploymentSnapshot -Path $TemplatePath -ExpectedSha256 $TemplateSha256
    $snapshots.Add($template)
    $parameters = New-DeploymentSnapshot -Path $ParametersPath -ExpectedSha256 $ParametersSha256
    $snapshots.Add($parameters)
    $approval = New-DeploymentSnapshot -Path $ApprovalPath -ExpectedSha256 $ApprovalSha256
    $snapshots.Add($approval)
    $record = Get-Content -LiteralPath $approval.Path -Raw | ConvertFrom-Json -AsHashtable
    $expected = @{
        operation = 'DeployInfrastructure'; subscriptionId = [string]$SubscriptionId
        resourceGroupName = $ResourceGroupName; deploymentName = $DeploymentName
        templateSha256 = $TemplateSha256; parametersSha256 = $ParametersSha256
        approvalReference = $ApprovalReference
    }
    if ($record -isnot [System.Collections.IDictionary] -or $record.Count -ne $expected.Count + 1) {
        throw 'Approval must contain exactly the documented fields and resourceIds.'
    }
    foreach ($key in $expected.Keys) {
        if (-not $record.Contains($key) -or $record[$key] -isnot [string]) { throw "Invalid approval field: $key." }
        $matchesExpected = if ($key -in @('subscriptionId', 'resourceGroupName', 'templateSha256', 'parametersSha256')) {
            $record[$key] -ieq $expected[$key]
        } else { $record[$key] -ceq $expected[$key] }
        if (-not $matchesExpected) { throw "Approval does not match the explicit operation ($key)." }
    }
    $scope = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $prefix = "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroupName/providers/"
    $resourcePattern = '\A' + [regex]::Escape($prefix) + '[a-zA-Z0-9.]+(?:/[a-zA-Z0-9_.()-]+/[a-zA-Z0-9_.()-]+)+\z'
    if (-not $record.Contains('resourceIds') -or $record.resourceIds -isnot [array] -or $record.resourceIds.Count -eq 0) {
        throw 'Approval needs a nonempty array of exact managed resource IDs.'
    }
    foreach ($resourceId in $record.resourceIds) {
        if ($resourceId -isnot [string] -or $resourceId -inotmatch $resourcePattern -or
            $resourceId -imatch '/providers/Microsoft.Resources/deployments/' -or -not $scope.Add($resourceId)) {
            throw 'Managed resource IDs must be unique literal resources in the explicit resource group, not deployment records.'
        }
    }
    $compiled = Get-Content -LiteralPath $template.Path -Raw | ConvertFrom-Json -AsHashtable
    $inputs = Get-Content -LiteralPath $parameters.Path -Raw | ConvertFrom-Json -AsHashtable
    if ($compiled -isnot [System.Collections.IDictionary] -or -not $compiled.Contains('resources') -or
        $inputs -isnot [System.Collections.IDictionary] -or -not $inputs.Contains('parameters')) {
        throw 'Expected a compiled ARM template and ARM parameters JSON.'
    }
    function Assert-InlineTemplate([System.Collections.IDictionary] $Document) {
        $resources = $Document['resources']
        if ($resources -is [System.Collections.IDictionary]) { $resources = @($resources.Values) }
        if ($resources -isnot [array]) { throw 'Expected compiled resource declarations.' }
        foreach ($resource in $resources) {
            if ($resource -isnot [System.Collections.IDictionary] -or $resource['type'] -isnot [string]) { throw 'Malformed compiled resource.' }
            if ($resource.type -ieq 'Microsoft.Resources/deployments') {
                $properties = $resource['properties']
                if ($properties -isnot [System.Collections.IDictionary] -or $properties.Contains('templateLink') -or
                    $properties.Contains('parametersLink') -or $properties['template'] -isnot [System.Collections.IDictionary] -or
                    $properties['mode'] -cne 'Incremental') { throw 'Nested deployments must use inline templates and parameters in Incremental mode.' }
                Assert-InlineTemplate $properties.template
            }
        }
    }
    Assert-InlineTemplate $compiled
    if (-not $Preview -and -not $Apply) {
        Write-Output 'Template, parameters, approval and resource scope validated locally. No Azure calls.'
        return
    }
    $raw = & az deployment group what-if --subscription $SubscriptionId --resource-group $ResourceGroupName `
        --name $DeploymentName --mode Incremental --template-file $template.Path --parameters "@$($parameters.Path)" `
        --no-pretty-print --output json --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw 'What-if failed. No deployment attempted.' }
    $result = ($raw -join "`n") | ConvertFrom-Json -AsHashtable
    if ($result -isnot [System.Collections.IDictionary] -or $result['status'] -cne 'Succeeded' -or
        $result['error'] -or $result['diagnostics'] -or $result['changes'] -isnot [array]) {
        throw 'What-if must succeed with a complete changes array and no unresolved diagnostics.'
    }
    $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $managed = @{}
    foreach ($change in $result.changes) {
        if ($change -isnot [System.Collections.IDictionary] -or $change['resourceId'] -isnot [string] -or
            [string]::IsNullOrWhiteSpace($change.resourceId) -or -not $seen.Add($change.resourceId) -or $change['changeType'] -isnot [string]) {
            throw 'What-if contains malformed or duplicate resource entries.'
        }
        if ($scope.Contains($change.resourceId)) {
            if ($change.changeType -cnotin @('Create', 'Modify', 'NoChange')) {
                throw 'Managed resources may only be created, updated or unchanged; deletions and unresolved results are blocked.'
            }
            $managed[$change.resourceId] = $change
        } elseif ($change.changeType -cnotin @('Ignore', 'NoChange')) {
            throw 'What-if would write outside the approved resource scope.'
        }
    }
    if ($managed.Count -ne $scope.Count) { throw 'What-if omitted approved resources; review the incomplete preview.' }
    foreach ($resourceId in $managed.Keys) {
        $change = $managed[$resourceId]
        if ($resourceId -imatch '/providers/Microsoft.Web/serverfarms/[^/]+$') {
            if ($change['after'] -isnot [System.Collections.IDictionary] -or $change.after['sku'] -isnot [System.Collections.IDictionary] -or
                $change.after.sku['name'] -isnot [string] -or $change.after.sku['name'] -ine 'F1' -or
                $change.after.sku['tier'] -isnot [string] -or $change.after.sku['tier'] -ine 'Free') {
                throw 'Planned App Service plans must remain explicitly F1/Free; no paid-tier fallback.'
            }
        }
    }
    foreach ($resourceId in $managed.Keys) {
        if ($resourceId -imatch '/providers/Microsoft.Web/sites/[^/]+$') {
            $after = $managed[$resourceId]['after']
            if ($after -isnot [System.Collections.IDictionary] -or $after['properties'] -isnot [System.Collections.IDictionary] -or
                $after.properties['serverFarmId'] -isnot [string]) { throw 'What-if must expose the web app plan reference.' }
            $planId = $after.properties.serverFarmId
            $planPattern = '\A/subscriptions/' + [regex]::Escape([string]$SubscriptionId) + '/resourceGroups/[a-zA-Z0-9_().-]{1,90}/providers/Microsoft[.]Web/serverfarms/[a-zA-Z0-9-]{1,60}\z'
            if ($planId -inotmatch $planPattern) { throw 'Web apps must reference an App Service plan in the explicit subscription.' }
            if (-not $managed.ContainsKey($planId)) { Assert-AppServiceFreePlan -SubscriptionId $SubscriptionId -PlanResourceId $planId }
        }
    }
    foreach ($snapshot in $snapshots) { Assert-DeploymentSnapshot $snapshot }
    $managed.Values | Sort-Object resourceId | ForEach-Object { Write-Output "$($_.changeType): $($_.resourceId)" }
    if ($Preview) { Write-Output 'Preview passed. No deployment applied.'; return }
    & az deployment group create --subscription $SubscriptionId --resource-group $ResourceGroupName `
        --name $DeploymentName --mode Incremental --template-file $template.Path --parameters "@$($parameters.Path)" `
        --only-show-errors --output none
    if ($LASTEXITCODE -ne 0) {
        throw 'Deployment did not report success. Inspect deployment state before retrying; partial resources may exist. No automatic retry or rollback.'
    }
    Write-Output 'Infrastructure deployment reported success. Application, SQL migrations and data-plane checks remain separate.'
} finally {
    foreach ($snapshot in $snapshots) { Remove-DeploymentSnapshot $snapshot }
}