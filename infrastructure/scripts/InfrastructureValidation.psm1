#requires -Version 7.2
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-InfrastructureConfig {
    param($Config)
    $fields = @('subscriptionId', 'resourceGroupName', 'deploymentName', 'templatePath', 'parametersPath')
    if ($Config -isnot [System.Collections.IDictionary] -or $Config.Count -ne $fields.Count) {
        throw 'Deployment configuration must contain exactly the documented target and artifact path fields.'
    }
    foreach ($field in $fields) {
        if (-not $Config.Contains($field) -or $Config[$field] -isnot [string] -or
            [string]::IsNullOrWhiteSpace($Config[$field]) -or $Config[$field] -match '[<>\x00-\x1f]') {
            throw "Invalid deployment configuration field: $field."
        }
    }
    $subscriptionId = [guid]::Empty
    if (-not [guid]::TryParseExact($Config.subscriptionId, 'D', [ref]$subscriptionId) -or $subscriptionId -eq [guid]::Empty -or
        $Config.resourceGroupName -notmatch '\A[a-zA-Z0-9_().-]{1,90}\z' -or $Config.resourceGroupName.EndsWith('.') -or
        $Config.deploymentName -notmatch '\A[a-zA-Z0-9_().-]{1,64}\z') {
        throw 'A valid subscription, resource group and deployment name are required.'
    }
}

function Assert-InlineTemplate {
    param([System.Collections.IDictionary] $Document)
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

function Assert-InfrastructureTemplate {
    param($Compiled, $Inputs)
    if ($Compiled -isnot [System.Collections.IDictionary] -or -not $Compiled.Contains('resources') -or
        $Inputs -isnot [System.Collections.IDictionary] -or -not $Inputs.Contains('parameters')) {
        throw 'Expected a compiled ARM template and ARM parameters JSON.'
    }
    Assert-InlineTemplate $Compiled
}

function Get-ValidatedInfrastructureChanges {
    param($Result, [guid] $SubscriptionId, [string] $ResourceGroupName)
    $prefix = "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroupName/providers/"
    if ($Result -isnot [System.Collections.IDictionary] -or $Result['status'] -cne 'Succeeded' -or
        $Result['error'] -or $Result['diagnostics'] -or $Result['changes'] -isnot [array]) {
        throw 'What-if must succeed with a complete changes array and no unresolved diagnostics.'
    }
    $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $managed = @{}
    foreach ($change in $Result.changes) {
        if ($change -isnot [System.Collections.IDictionary] -or $change['resourceId'] -isnot [string] -or
            [string]::IsNullOrWhiteSpace($change.resourceId) -or -not $seen.Add($change.resourceId) -or $change['changeType'] -isnot [string]) {
            throw 'What-if contains malformed or duplicate resource entries.'
        }
        if ($change.changeType -ceq 'Ignore') { continue }
        if ($change.changeType -cnotin @('Create', 'Modify', 'NoChange')) {
            throw 'Resources may only be created, updated or unchanged; deletions and unresolved results are blocked.'
        }
        if (-not $change.resourceId.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            if ($change.changeType -ceq 'NoChange') { continue }
            throw 'What-if would write outside the configured resource group.'
        }
        $managed[$change.resourceId] = $change
    }
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
            if (-not $managed.ContainsKey($planId)) {
                $raw = & az appservice plan show --ids $planId --subscription $SubscriptionId `
                    --query '{id:id,sku:sku}' --output json --only-show-errors
                if ($LASTEXITCODE -ne 0) { throw 'Cannot verify the existing App Service plan; no deployment was attempted.' }
                $plan = ($raw -join "`n") | ConvertFrom-Json -AsHashtable -NoEnumerate
                if ($plan -isnot [System.Collections.IDictionary] -or $plan['id'] -isnot [string] -or $plan.id -ine $planId -or
                    $plan['sku'] -isnot [System.Collections.IDictionary] -or
                    $plan.sku['name'] -isnot [string] -or $plan.sku.name -ine 'B1' -or
                    $plan.sku['tier'] -isnot [string] -or $plan.sku.tier -ine 'Basic') {
                    throw 'This dev infrastructure test requires the existing B1/Basic App Service plan. No plan change was attempted.'
                }
            }
        }
    }
    return $managed
}

Export-ModuleMember -Function Assert-InfrastructureConfig, Assert-InfrastructureTemplate, Get-ValidatedInfrastructureChanges