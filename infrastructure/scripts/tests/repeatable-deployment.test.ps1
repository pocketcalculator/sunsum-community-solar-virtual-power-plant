#requires -Version 7.2
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
Set-StrictMode -Version Latest
$fixture = Join-Path ([System.IO.Path]::GetTempPath()) "sunsum-repeatable-$([guid]::NewGuid().ToString('N'))"
$null = New-Item -ItemType Directory -Path $fixture
$scripts = Join-Path $fixture 'infrastructure/scripts'
$configDirectory = Join-Path $fixture 'infrastructure/config'
$templates = Join-Path $fixture 'infrastructure/templates'
$null = New-Item -ItemType Directory -Path $scripts, $configDirectory, $templates -Force
foreach ($name in @('Deploy-Infrastructure.ps1', 'DeploymentSafety.psm1', 'InfrastructureValidation.psm1')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "../$name") -Destination (Join-Path $scripts $name)
}
$runner = Join-Path $scripts 'Deploy-Infrastructure.ps1'
$subscription = '11111111-1111-4111-8111-111111111111'
$prefix = "/subscriptions/$subscription/resourceGroups/sample-group/providers/"
$planId = "${prefix}Microsoft.Web/serverfarms/sample-plan"
$siteId = "${prefix}Microsoft.Web/sites/sample-web"
$storageId = "${prefix}Microsoft.Storage/storageAccounts/samplestorage"
$configPath = Join-Path $configDirectory 'dev.json'
$runnerOptions = @{ BicepPath = 'Invoke-RepeatableTestCompiler' }
$configuration = @{
    subscriptionId=$subscription; resourceGroupName='sample-group'; deploymentName='repeatable-test'
    templatePath='../templates/main.bicep'; parametersPath='../templates/main.bicepparam'
}
$state = @{
    Mode='Create'; Calls=[System.Collections.Generic.List[string]]::new(); Snapshots=[System.Collections.Generic.List[string]]::new()
    Compilations=0; TemplateJson='{"resources":[]}'; ParametersJson='{"parameters":{}}'
}
$global:RepeatableDeploymentTestContext = @{
    State=$state; Subscription=$subscription; Prefix=$prefix; Templates=$templates
    PlanId=$planId; SiteId=$siteId; StorageId=$storageId
}
function global:Invoke-RepeatableTestCompiler {
    $context=$global:RepeatableDeploymentTestContext
    $state=$context.State
    $state.Compilations++
    $global:LASTEXITCODE=0
    if ($args[0] -cne 'build-params' -or $args[1] -cne (Join-Path $context.Templates 'main.bicepparam') -or
        $args[[array]::IndexOf($args, '--bicep-file') + 1] -cne (Join-Path $context.Templates 'main.bicep') -or
        '--no-restore' -notin $args -or '--stdout' -notin $args) { throw 'Compiler must bind source and parameters without downloading modules.' }
    if ($state.Mode -ceq 'compile-failure') { $global:LASTEXITCODE=1; return '' }
    if ($state.Mode -ceq 'bad-compile-json') { return 'invalid-json' }
    if ($state.Mode -ceq 'missing-compile-output') { return '{}' }
    return (@{templateJson=$state.TemplateJson;parametersJson=$state.ParametersJson;templateSpecId=$null} | ConvertTo-Json -Compress)
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
    $subscription = $context.Subscription
    $prefix = $context.Prefix
    $planId = $context.PlanId
    $siteId = $context.SiteId
    $storageId = $context.StorageId
    $state.Calls.Add(($args -join ' '))
    $global:LASTEXITCODE = 0
    if ($args[0] -ceq 'appservice') {
        if ($state.Mode -ceq 'plan-read-failure') { $global:LASTEXITCODE = 1; return '' }
        if ($args[[array]::IndexOf($args, '--ids') + 1] -cne $planId -or
            $args[[array]::IndexOf($args, '--subscription') + 1] -cne $subscription) { throw 'Existing plan read used the wrong target.' }
        $plan = @{id=$planId;sku=@{name='B1';tier='Basic'}}
        switch ($state.Mode) {
            'existing-wrong-sku' { $plan.sku.name='B2' }
            'existing-free' { $plan.sku.name='F1';$plan.sku.tier='Free' }
            'existing-wrong-tier' { $plan.sku.tier='Free' }
            'existing-wrong-id' { $plan.id="$planId-other" }
            'existing-boolean-sku' { $plan.sku.name=$true }
            'existing-missing-sku' { $null=$plan.Remove('sku') }
            'existing-malformed' { return 'invalid-json' }
        }
        return ($plan | ConvertTo-Json -Depth 4)
    }
    if (($args[0..1] -join ' ') -cne 'deployment group') { throw 'Unexpected Azure command in mock.' }
    foreach ($pair in @{ '--subscription'=$subscription; '--resource-group'='sample-group'; '--name'='repeatable-test'; '--mode'='Incremental' }.GetEnumerator()) {
        if ($args[[array]::IndexOf($args, $pair.Key) + 1] -cne $pair.Value) { throw 'Target or Incremental mode not preserved.' }
    }
    foreach ($option in @('--template-file', '--parameters')) {
        $path = $args[[array]::IndexOf($args, $option) + 1].TrimStart('@')
        $expected = if ($option -ceq '--template-file') { $state.TemplateJson } else { $state.ParametersJson }
        if ([System.IO.File]::ReadAllText($path) -cne $expected) { throw 'Azure must consume the same compiled bytes for preview and apply.' }
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
        'empty' { $result.changes=@() }
        'duplicate' { $changes[2].resourceId=$planId.ToUpperInvariant() }
        'outside' { $changes[3].changeType='Modify';$changes[3].resourceId=$changes[3].resourceId.Replace('sample-group','other-group') }
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
        'snapshot-drift' { [System.IO.File]::WriteAllText($state.Snapshots[$state.Snapshots.Count - 1], '{}') }
        'source-drift' { [System.IO.File]::WriteAllText((Join-Path $context.Templates 'main.bicep'), 'changed after compilation') }
    }
    if ($state.Mode.StartsWith('existing-') -or $state.Mode -ceq 'plan-read-failure') { $changes[0].changeType='Ignore' }
    return ($result | ConvertTo-Json -Depth 12 -Compress)
}
try {
    $configuration | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding utf8NoBOM
    Set-Content -LiteralPath (Join-Path $templates 'main.bicep') -Value "targetScope = 'resourceGroup'"
    Set-Content -LiteralPath (Join-Path $templates 'main.bicepparam') -Value "using './main.bicep'"
    if (Test-Path -LiteralPath (Join-Path $fixture '.azure')) { throw 'Fresh checkout test must start without generated files.' }
    & $runner @runnerOptions | Out-Null
    if ($state.Calls.Count -or $state.Compilations -ne 1) { throw 'Default must compile once without Azure.' }
    $artifactRoot=Join-Path $fixture '.azure/dev/deployments'
    if (@(Get-ChildItem -LiteralPath $artifactRoot -Recurse -Filter 'manifest.json').Count -ne 1) { throw 'Default did not generate artifacts.' }
    Assert-Blocked { & $runner @runnerOptions -Preview -Apply } 'conflicting switches' $true
    foreach ($mode in @('Create','Modify','mixed','NoChange','NoChange','outside-nochange','empty','existing-plan','source-drift')) {
        $state.Mode=$mode
        $state.Calls.Clear()
        & $runner @runnerOptions -Preview | Out-Null
        if (@($state.Calls | Where-Object { $_ -like 'deployment group create *' }).Count) { throw 'Preview performed a write.' }
        $state.Calls.Clear()
        $beforeApplyCompilation = $state.Compilations
        & $runner @runnerOptions -Apply | Out-Null
        if ($state.Compilations -ne $beforeApplyCompilation + 1) { throw 'Apply must compile once and deploy the exact previewed build.' }
        if (@($state.Calls | Where-Object { $_ -like 'deployment group create *' }).Count -ne 1) { throw "Repeatable scenario rejected: $mode" }
        if ($state.Calls[$state.Calls.Count - 1] -notlike 'deployment group create *') { throw 'Apply must not add post-deployment Azure checks.' }
        foreach ($path in $state.Snapshots) { if (Test-Path -LiteralPath $path) { throw 'Snapshot was not cleaned up.' } }
    }
    foreach ($mode in @('Delete','Deploy','duplicate','outside','outside-delete','malformed','no-changes','failed-status','diagnostics','error','paid-plan','boolean-plan','unknown-plan','bad-plan-id','masked-site','cross-subscription','read-failure','invalid-json','snapshot-drift','existing-wrong-sku','existing-free','existing-wrong-tier','existing-wrong-id','existing-boolean-sku','existing-missing-sku','existing-malformed','plan-read-failure')) {
        $state.Mode=$mode
        Assert-Blocked { & $runner @runnerOptions -Apply } $mode
    }
    foreach ($mode in @('compile-failure','bad-compile-json','missing-compile-output')) {
        $state.Mode=$mode
        Assert-Blocked { & $runner @runnerOptions -Apply } $mode $true
    }
    $state.Mode='Create'
    foreach ($nested in @(
        @{ mode='Incremental'; templateLink=@{uri='https://example.invalid/template.json'} },
        @{ mode='Incremental'; parametersLink=@{uri='https://example.invalid/parameters.json'}; template=@{resources=@()} },
        @{ mode='Complete'; template=@{resources=@()} }
    )) {
        $state.TemplateJson=@{ resources=@(@{type='Microsoft.Resources/deployments';properties=$nested}) } | ConvertTo-Json -Depth 10
        Assert-Blocked { & $runner @runnerOptions -Apply } 'linked or complete nested template' $true
    }
    $state.TemplateJson='{"resources":[]}'
    Push-Location ([System.IO.Path]::GetTempPath())
    try {
        $state.Calls.Clear()
        & $runner @runnerOptions | Out-Null
        if ($state.Calls.Count) { throw 'Default from another directory called Azure.' }
        Remove-Item -LiteralPath $configPath
        Assert-Blocked { & $runner @runnerOptions } 'missing dev config' $true
        foreach ($badConfig in @('{}', 'null', '[]', 'invalid-json')) {
            Set-Content -LiteralPath $configPath -Value $badConfig -Encoding utf8NoBOM
            Assert-Blocked { & $runner @runnerOptions -Apply } 'malformed dev config' $true
        }
        foreach ($badValue in @('', '<source>', 123, $null, 'missing.bicep', 'compiled.json')) {
            $changed = $configuration.Clone()
            $changed.templatePath = $badValue
            $changed | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding utf8NoBOM
            Assert-Blocked { & $runner @runnerOptions -Apply } 'invalid dev config field' $true
        }
        $changed = $configuration.Clone()
        $changed.Apply = $true
        $changed | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding utf8NoBOM
        Assert-Blocked { & $runner @runnerOptions } 'config cannot enable apply' $true
        foreach ($key in @('subscriptionId', 'resourceGroupName', 'deploymentName')) {
            $changedTarget = $configuration.Clone()
            $changedTarget[$key] = 'invalid/value'
            $changedTarget | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding utf8NoBOM
            Assert-Blocked { & $runner @runnerOptions -Apply } "invalid target: $key" $true
        }
        $configuration | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding utf8NoBOM
    } finally { Pop-Location }
    $state.Mode='apply-failure'
    $state.Calls.Clear()
    $message=''
    try { & $runner @runnerOptions -Apply | Out-Null } catch { $message=$_.Exception.Message }
    if ($message -notlike '*partial resources may exist*' -or @($state.Calls | Where-Object { $_ -like 'deployment group create *' }).Count -ne 1) {
        throw 'Failed apply did not stop without retry.'
    }
    if ($state.Calls[$state.Calls.Count - 1] -notlike 'deployment group create *') { throw 'Failed apply must not add Azure calls after deployment.' }
    Write-Output 'Repeatable deployment checks passed: source compilation, fresh checkout, create/update/no-change, snapshots, F1 creation and existing B1 checks, and no retry.'
} finally {
    Remove-Item -LiteralPath Function:\az -Force
    Remove-Item -LiteralPath Function:\Invoke-RepeatableTestCompiler -Force
    Remove-Variable -Name RepeatableDeploymentTestContext -Scope Global
    Remove-Item -LiteralPath $fixture -Recurse -Force
}
exit 0