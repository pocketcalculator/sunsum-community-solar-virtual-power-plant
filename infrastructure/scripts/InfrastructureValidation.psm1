#requires -Version 7.2
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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
    param($Compiled, $Inputs, [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string] $ExpectedWebAppName, [switch] $RequireDeploymentIdentity)
    if ($Compiled -isnot [System.Collections.IDictionary] -or -not $Compiled.Contains('resources') -or
        $Inputs -isnot [System.Collections.IDictionary] -or $Inputs['parameters'] -isnot [System.Collections.IDictionary]) {
        throw 'Expected a compiled ARM template and ARM parameters JSON.'
    }
    Assert-InlineTemplate $Compiled
    $webApp = $Inputs.parameters['webAppName']
    if ($webApp -isnot [System.Collections.IDictionary] -or $webApp['value'] -isnot [string] -or
        $webApp.value -ine $ExpectedWebAppName) {
        throw 'Compiled webAppName must match the shared deployment config. Update the native parameters and shared target together. No Azure calls attempted.'
    }
    if ($Compiled['parameters'] -is [System.Collections.IDictionary] -and $Compiled.parameters.Contains('deployRbac')) {
        $rbac = if ($Inputs.parameters.Contains('deployRbac')) { $Inputs.parameters['deployRbac']['value'] } else { $Compiled.parameters.deployRbac['defaultValue'] }
        if ($rbac -isnot [bool]) { throw 'deployRbac must be an explicit boolean or have a boolean template default. No Azure calls attempted.' }
        if ($rbac) {
            $values = @{}
            foreach ($field in @('approvedWebPrincipalId', 'blobRoleApprovalReference')) {
                $value = if ($Inputs.parameters.Contains($field)) { $Inputs.parameters[$field]['value'] } else { $Compiled.parameters[$field]['defaultValue'] }
                if ($value -isnot [string] -or [string]::IsNullOrWhiteSpace($value) -or $value -match '[<>\x00-\x1f]') {
                    throw "Enabled RBAC requires a real $field. No Azure calls attempted."
                }
                $values[$field] = $value
            }
            $principal = [guid]::Empty
            if (-not [guid]::TryParseExact($values.approvedWebPrincipalId, 'D', [ref]$principal) -or $principal -eq [guid]::Empty) {
                throw 'Enabled RBAC requires a nonempty approvedWebPrincipalId UUID. No Azure calls attempted.'
            }
        }
    }
    if ($RequireDeploymentIdentity -and $Compiled['parameters'] -is [System.Collections.IDictionary] -and
        $Compiled.parameters.Contains('postgresAdminObjectId')) {
        foreach ($field in @('tenantId', 'postgresAdminObjectId', 'postgresAdminPrincipalName')) {
            $entry = $Inputs.parameters[$field]
            if ($entry -isnot [System.Collections.IDictionary] -or $entry['value'] -isnot [string] -or
                [string]::IsNullOrWhiteSpace($entry.value) -or $entry.value -match '[<>\x00-\x1f]') {
                throw "Supply a real $field locally before preview/apply; identity placeholders are for local compilation only. No Azure calls attempted."
            }
            if ($field -cne 'postgresAdminPrincipalName') {
                $identifier = [guid]::Empty
                if (-not [guid]::TryParseExact($entry.value, 'D', [ref]$identifier) -or $identifier -eq [guid]::Empty) {
                    throw "Supply a nonempty UUID for $field locally before preview/apply. No Azure calls attempted."
                }
            }
        }
    }
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
                $change.after.sku['name'] -isnot [string] -or $change.after.sku['name'] -ine 'B1' -or
                ($change.after.sku.Contains('tier') -and
                    ($change.after.sku['tier'] -isnot [string] -or $change.after.sku['tier'] -ine 'Basic'))) {
                throw 'What-if must report SKU B1 and, when present, tier Basic for App Service plans; no automatic tier fallback.'
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
                    throw 'Referenced App Service plans must be B1/Basic. No plan change was attempted.'
                }
            }
        }
    }
    return $managed
}

function Get-InfrastructureFailureSummary {
    param([AllowEmptyString()][string] $ErrorText)
    $codes = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    function Add-FailureCodes {
        param($Node, [int] $Depth = 0)
        if ($Depth -gt 32 -or $Node -isnot [System.Collections.IDictionary]) { return }
        if ($Node['code'] -is [string] -and $Node.code -cmatch '\A[A-Za-z][A-Za-z0-9_.-]{0,127}\z' -and
            $Node.code -inotin @('DeploymentFailed', 'ResourceDeploymentFailure')) {
            $null = $codes.Add($Node.code)
        }
        Add-FailureCodes -Node $Node['error'] -Depth ($Depth + 1)
        foreach ($detail in @($Node['details'])) { Add-FailureCodes -Node $detail -Depth ($Depth + 1) }
    }
    try {
        $start = $ErrorText.IndexOf('{')
        $end = $ErrorText.LastIndexOf('}')
        if ($start -ge 0 -and $end -ge $start) {
            $document = $ErrorText.Substring($start, $end - $start + 1) | ConvertFrom-Json -AsHashtable -ErrorAction Stop
            Add-FailureCodes $document
        }
    } catch {
        $codes.Clear()
    }
    if ($codes.Count -eq 0) { return 'Azure returned no recognized structured error codes. Inspect the saved diagnostics and deployment operations before retrying.' }
    $summary = 'Azure error codes: ' + ((@($codes) | Sort-Object | Select-Object -First 16) -join ', ') + '.'
    $readinessCodes = @('ServerIsBusy', 'AadAuthOperationCannotBePerformedWhenServerIsNotAccessible')
    if (@($codes | Where-Object { $_ -inotin $readinessCodes }).Count -eq 0) {
        return "$summary PostgreSQL may be temporarily busy or not ready. Check that the server is Ready and no other update is running; inspect partial resources, then preview and retry manually with the same config. Persistent failures need investigation; readiness alone is not proof of recovery."
    }
    return "$summary Inspect deployment operations and resolve the reported cause before retrying. Do not treat authorization, policy or validation failures as transient."
}

Export-ModuleMember -Function Assert-InfrastructureTemplate, Get-ValidatedInfrastructureChanges, Get-InfrastructureFailureSummary