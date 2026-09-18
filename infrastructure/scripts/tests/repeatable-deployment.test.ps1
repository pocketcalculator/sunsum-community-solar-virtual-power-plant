#requires -Version 7.2
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
Set-StrictMode -Version Latest
$fixture = Join-Path ([System.IO.Path]::GetTempPath()) "sunsum-repeatable-$([guid]::NewGuid().ToString('N'))"
$null = New-Item -ItemType Directory -Path $fixture
$runner = Join-Path $PSScriptRoot '..\Deploy-Infrastructure.ps1'
$subscription = '11111111-1111-4111-8111-111111111111'
$prefix = "/subscriptions/$subscription/resourceGroups/sample-group/providers/"
$planId = "${prefix}Microsoft.Web/serverfarms/sample-plan"
$siteId = "${prefix}Microsoft.Web/sites/sample-web"
$storageId = "${prefix}Microsoft.Storage/storageAccounts/samplestorage"
$arguments = @{
    SubscriptionId = $subscription; ResourceGroupName = 'sample-group'; DeploymentName = 'repeatable-test'
    TemplatePath = Join-Path $fixture 'template.json'; ParametersPath = Join-Path $fixture 'parameters.json'
    ApprovalPath = Join-Path $fixture 'approval.json'; ApprovalReference = 'synthetic-review'
}
$state = @{ Mode = 'Create'; Calls = [System.Collections.Generic.List[string]]::new(); Snapshots = [System.Collections.Generic.List[string]]::new() }
$global:RepeatableDeploymentTestContext = @{
    State=$state; Arguments=$arguments; Subscription=$subscription; Prefix=$prefix
    PlanId=$planId; SiteId=$siteId; StorageId=$storageId
}
function Write-Approval {
    $record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $arguments.ApprovalPath -Encoding utf8NoBOM
    $arguments.ApprovalSha256 = (Get-FileHash -LiteralPath $arguments.ApprovalPath).Hash
}
function Assert-Blocked([scriptblock] $Action, [string] $Scenario, [bool] $NoCalls = $false) {
    $state.Calls.Clear()
    $message = ''
    try { & $Action | Out-Null } catch { $message = $_.Exception.Message }
    if (-not $message -or @($state.Calls | Where-Object { $_ -like 'deployment group create *' }).Count -or
        ($NoCalls -and $state.Calls.Count)) { throw "Unsafe repeatable scenario accepted: $Scenario" }
}
function global:az {
    $context = $global:RepeatableDeploymentTestContext
    $state = $context.State
    $arguments = $context.Arguments
    $subscription = $context.Subscription
    $prefix = $context.Prefix
    $planId = $context.PlanId
    $siteId = $context.SiteId
    $storageId = $context.StorageId
    $state.Calls.Add(($args -join ' '))
    $global:LASTEXITCODE = 0
    if ($args[0] -ceq 'appservice') {
        if ($state.Mode -ceq 'plan-read-failure') { $global:LASTEXITCODE = 1; return '' }
        return (@{id=$planId;sku=@{name=$(if ($state.Mode -ceq 'existing-paid') {'B1'} else {'F1'});tier='Free'}} | ConvertTo-Json -Depth 4)
    }
    if (($args[0..1] -join ' ') -cne 'deployment group') { throw 'Unexpected Azure command in mock.' }
    foreach ($pair in @{ '--subscription'=$subscription; '--resource-group'='sample-group'; '--name'='repeatable-test'; '--mode'='Incremental' }.GetEnumerator()) {
        if ($args[[array]::IndexOf($args, $pair.Key) + 1] -cne $pair.Value) { throw 'Target or Incremental mode not preserved.' }
    }
    foreach ($option in @('--template-file', '--parameters')) {
        $path = $args[[array]::IndexOf($args, $option) + 1].TrimStart('@')
        $original = if ($option -ceq '--template-file') { $arguments.TemplatePath } else { $arguments.ParametersPath }
        $expectedHash = if ($option -ceq '--template-file') { $arguments.TemplateSha256 } else { $arguments.ParametersSha256 }
        if ($path -ceq $original -or (Get-FileHash -LiteralPath $path).Hash -cne $expectedHash) { throw 'Azure must consume the protected reviewed copy.' }
        $state.Snapshots.Add($path)
    }
    if ($args[2] -ceq 'create') {
        if ($state.Mode -ceq 'apply-failure') { $global:LASTEXITCODE = 1 }
        return
    }
    if ($args[2] -cne 'what-if') { throw 'Unexpected Azure operation.' }
    if ($state.Mode -ceq 'read-failure') { $global:LASTEXITCODE = 1; return '' }
    if ($state.Mode -ceq 'invalid-json') { return 'not-json' }
    $changes = @(
        @{resourceId=$planId;changeType='Create';after=@{sku=@{name='F1';tier='Free'}}},
        @{resourceId=$siteId;changeType='Create';after=@{properties=@{serverFarmId=$planId}}},
        @{resourceId=$storageId;changeType='Create';after=@{properties=@{}}},
        @{resourceId="${prefix}Microsoft.Storage/storageAccounts/unrelated";changeType='Ignore'}
    )
    $result = @{status='Succeeded';changes=$changes}
    switch ($state.Mode) {
        'Modify' { foreach ($change in $changes[0..2]) { $change.changeType='Modify' }; $changes[2].delta=@(@{path='properties.example';propertyChangeType='Delete'}) }
        'NoChange' { foreach ($change in $changes[0..2]) { $change.changeType='NoChange' } }
        'mixed' { $changes[0].changeType='NoChange';$changes[1].changeType='Modify' }
        'Delete' { $changes[1].changeType='Delete' }
        'Ignore' { $changes[1].changeType='Ignore' }
        'Deploy' { $changes[1].changeType='Deploy' }
        'missing' { $result.changes=@($changes[0],$changes[2],$changes[3]) }
        'duplicate' { $changes[2].resourceId=$planId.ToUpperInvariant() }
        'outside' { $changes[3].changeType='Modify' }
        'outside-delete' { $changes[3].changeType='Delete' }
        'outside-nochange' { $changes[3].changeType='NoChange' }
        'malformed' { $result.changes=@(@{changeType='NoChange'}) }
        'no-changes' { $null=$result.Remove('changes') }
        'failed-status' { $result.status='Failed' }
        'diagnostics' { $result.diagnostics=@(@{message='Unresolved resource'}) }
        'error' { $result.error=@{message='Failure'} }
        'paid-plan' { $changes[0].after.sku.name='B1' }
        'boolean-plan' { $changes[0].after.sku.name=$true }
        'unknown-plan' { $null=$changes[0].Remove('after') }
        'bad-plan-id' { $changes[1].after.properties.serverFarmId=$storageId }
        'masked-site' { $changes[1].after.properties='*******' }
        'cross-subscription' { $changes[1].after.properties.serverFarmId=$planId.Replace($subscription,'22222222-2222-4222-8222-222222222222') }
        'snapshot-drift' { [System.IO.File]::WriteAllText($arguments.ApprovalPath, '{}') }
    }
    if ($state.Mode -in @('existing-plan','existing-paid','plan-read-failure')) { $changes[0].changeType='Ignore' }
    return ($result | ConvertTo-Json -Depth 12 -Compress)
}
try {
    '{"resources":[]}' | Set-Content -LiteralPath $arguments.TemplatePath -Encoding utf8NoBOM
    '{"parameters":{}}' | Set-Content -LiteralPath $arguments.ParametersPath -Encoding utf8NoBOM
    $arguments.TemplateSha256 = (Get-FileHash -LiteralPath $arguments.TemplatePath).Hash
    $arguments.ParametersSha256 = (Get-FileHash -LiteralPath $arguments.ParametersPath).Hash
    $record = @{
        operation='DeployInfrastructure';subscriptionId=$subscription;resourceGroupName='sample-group';deploymentName='repeatable-test'
        templateSha256=$arguments.TemplateSha256;parametersSha256=$arguments.ParametersSha256;approvalReference='synthetic-review'
        resourceIds=@($planId,$siteId,$storageId)
    }
    Write-Approval
    & $runner @arguments | Out-Null
    if ($state.Calls.Count) { throw 'Default validation called Azure.' }
    Assert-Blocked { & $runner @arguments -Preview -Apply } 'conflicting switches' $true
    foreach ($mode in @('Create','Modify','mixed','NoChange','NoChange','outside-nochange')) {
        $state.Mode=$mode
        $state.Calls.Clear()
        & $runner @arguments -Preview | Out-Null
        if (@($state.Calls | Where-Object { $_ -like 'deployment group create *' }).Count) { throw 'Preview performed a write.' }
        $state.Calls.Clear()
        & $runner @arguments -Apply | Out-Null
        if (@($state.Calls | Where-Object { $_ -like 'deployment group create *' }).Count -ne 1) { throw "Repeatable scenario rejected: $mode" }
        foreach ($path in $state.Snapshots) { if (Test-Path -LiteralPath $path) { throw 'Snapshot was not cleaned up.' } }
    }
    foreach ($mode in @('Delete','Ignore','Deploy','missing','duplicate','outside','outside-delete','malformed','no-changes','failed-status','diagnostics','error','paid-plan','boolean-plan','unknown-plan','bad-plan-id','masked-site','cross-subscription','read-failure','invalid-json','snapshot-drift')) {
        $state.Mode=$mode
        Assert-Blocked { & $runner @arguments -Apply } $mode
        Write-Approval
    }
    $record.resourceIds=@($siteId,$storageId)
    Write-Approval
    $state.Mode='existing-plan'
    & $runner @arguments -Apply | Out-Null
    foreach ($mode in @('existing-paid','plan-read-failure')) {
        $state.Mode=$mode
        Assert-Blocked { & $runner @arguments -Apply } $mode
    }
    $record.resourceIds=@($planId,$siteId,$storageId)
    $savedRecord=$record | ConvertTo-Json -Depth 8
    foreach ($key in @('operation','subscriptionId','resourceGroupName','deploymentName','templateSha256','parametersSha256','approvalReference')) {
        $record=$savedRecord | ConvertFrom-Json -AsHashtable
        $record[$key]='different'
        Write-Approval
        Assert-Blocked { & $runner @arguments -Apply } "approval $key" $true
    }
    foreach ($scope in @(@(),@($planId,$planId.ToUpperInvariant()),@('*'),@("${prefix}Microsoft.Resources/deployments/nested"),@('/subscriptions/other/resourceGroups/other/providers/Microsoft.Web/sites/other'))) {
        $record=$savedRecord | ConvertFrom-Json -AsHashtable
        $record.resourceIds=$scope
        Write-Approval
        Assert-Blocked { & $runner @arguments -Apply } 'invalid scope' $true
    }
    $record=$savedRecord | ConvertFrom-Json -AsHashtable
    Write-Approval
    $originalTemplate = [System.IO.File]::ReadAllBytes($arguments.TemplatePath)
    foreach ($nested in @(
        @{ mode='Incremental'; templateLink=@{uri='https://example.invalid/template.json'} },
        @{ mode='Incremental'; parametersLink=@{uri='https://example.invalid/parameters.json'}; template=@{resources=@()} },
        @{ mode='Complete'; template=@{resources=@()} }
    )) {
        @{ resources=@(@{type='Microsoft.Resources/deployments';properties=$nested}) } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $arguments.TemplatePath -Encoding utf8NoBOM
        $arguments.TemplateSha256=(Get-FileHash -LiteralPath $arguments.TemplatePath).Hash
        $record.templateSha256=$arguments.TemplateSha256
        Write-Approval
        Assert-Blocked { & $runner @arguments -Apply } 'linked or complete nested template' $true
    }
    [System.IO.File]::WriteAllBytes($arguments.TemplatePath,$originalTemplate)
    $arguments.TemplateSha256=(Get-FileHash -LiteralPath $arguments.TemplatePath).Hash
    $record.templateSha256=$arguments.TemplateSha256
    Write-Approval
    foreach ($path in @($arguments.TemplatePath,$arguments.ParametersPath,$arguments.ApprovalPath)) {
        $bytes=[System.IO.File]::ReadAllBytes($path)
        try {
            [System.IO.File]::AppendAllText($path,"`n")
            Assert-Blocked { & $runner @arguments -Apply } 'hash drift' $true
        } finally { [System.IO.File]::WriteAllBytes($path,$bytes) }
    }
    $state.Mode='apply-failure'
    $state.Calls.Clear()
    $message=''
    try { & $runner @arguments -Apply | Out-Null } catch { $message=$_.Exception.Message }
    if ($message -notlike '*partial resources may exist*' -or @($state.Calls | Where-Object { $_ -like 'deployment group create *' }).Count -ne 1) {
        throw 'Failed apply did not stop without retry.'
    }
    Write-Output 'Repeatable deployment checks passed: create/update/no-change, explicit scope, approval hashes, F1 checks and no retry.'
} finally {
    Remove-Item -LiteralPath Function:\az -Force
    Remove-Variable -Name RepeatableDeploymentTestContext -Scope Global
    Remove-Item -LiteralPath $fixture -Recurse -Force
}
exit 0