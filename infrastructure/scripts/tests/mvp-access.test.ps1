#requires -Version 7.2
[CmdletBinding()]
param([string] $BicepPath)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot '..\MvpAccessSafety.psm1') -Force
function Assert-Throws([scriptblock] $Action) {
    $threw = $false
    try { & $Action | Out-Null } catch { $threw = $true }
    if (-not $threw) { throw 'Expected rejection of unsafe access configuration.' }
}
function Assert-AccessSnapshot([object[]] $Arguments, [string] $Operation) {
    $argument = [string]$Arguments[[array]::IndexOf($Arguments, '--parameters') + 1]
    if (-not $argument.StartsWith('@')) { throw 'Expected an access parameter snapshot.' }
    $snapshotPath = $argument.Substring(1)
    if ((Split-Path -Leaf (Split-Path -Parent $snapshotPath)) -notlike 'sunsum-deployment-*') { throw 'Access deployment still uses the mutable audit output.' }
    $record = Get-Content -LiteralPath $snapshotPath -Raw | ConvertFrom-Json -AsHashtable
    if ($record.parameters.approvalReference.value -cne 'review-123') { throw 'Access snapshot lost approval binding.' }
    if ($Operation -eq 'SignIn' -and
        ($record.parameters.approvedParticipantObjectIds.value.Count -ne 1 -or
        $record.parameters.approvedParticipantObjectIds.value[0] -cne '44444444-4444-4444-8444-444444444444')) {
        throw 'Sign-in snapshot changed the approved participant list.'
    }
    if ($Operation -eq 'BlobRoles' -and
        ($record.parameters.blobDataAccess.value -cne 'Reader' -or
        $record.parameters.approvedWebPrincipalId.value -cne '44444444-4444-4444-8444-444444444444')) {
        throw 'Blob snapshot changed the approved role or identity.'
    }
    if ($IsWindows) {
        Assert-Throws { $writer = [System.IO.File]::OpenWrite($snapshotPath); $writer.Dispose() }
    }
    $global:MvpSnapshotPath = $snapshotPath
}
$subscription = '11111111-1111-4111-8111-111111111111'
$tenant = '22222222-2222-4222-8222-222222222222'
$client = '33333333-3333-4333-8333-333333333333'
$participant = '44444444-4444-4444-8444-444444444444'
$group = 'sample-resource-group'
$common = @{ subscriptionId = $subscription; resourceGroupName = $group; approvalReference = 'review-123' }
$signIn = $common + @{
    webAppName = 'sample-web'; tenantId = $tenant; clientId = $client
    clientSecretSettingName = 'MICROSOFT_PROVIDER_AUTHENTICATION_SECRET'
    approvedParticipantObjectIds = @($participant)
    directoryPrerequisitesConfirmed = $true; allowReplaceExistingSignIn = $false
}
$roles = $common + @{
    webAppName = 'sample-web'; webPrincipalId = $participant
    storageAccountName = 'samplestorage'; blobDataAccess = 'Reader'
}
$network = $common + @{
    storageAccountName = 'samplestorage'; location = 'centralus'
    networkMode = 'Closed'; publicEndpointApproval = ''
}
$parameters = Assert-AccessConfiguration $signIn SignIn $subscription $group
if (-not $parameters.activationApproved.value -or
    $parameters.approvedParticipantObjectIds.value.Count -ne 1 -or
    $parameters.authSettingName.value -cne $signIn.clientSecretSettingName) { throw 'Sign-in parameters lost restrictions.' }
$largest = $signIn.Clone()
$largest.approvedParticipantObjectIds = @(1..13 | ForEach-Object { '44444444-4444-4444-8444-{0:d12}' -f $_ })
$largestParameters = Assert-AccessConfiguration $largest SignIn $subscription $group
if ($largestParameters.approvedParticipantObjectIds.value.Count -ne 13 -or
    ($largestParameters.approvedParticipantObjectIds.value -join ',').Length -gt 500) {
    throw 'The exact supported participant bound must remain within the platform character limit.'
}
foreach ($patch in @(
    @{ approvedParticipantObjectIds = @() },
    @{ approvedParticipantObjectIds = @($participant, $participant.ToUpperInvariant()) },
    @{ approvedParticipantObjectIds = @('all') },
    @{ approvedParticipantObjectIds = $participant },
    @{ approvedParticipantObjectIds = @($participant) * 14 },
    @{ directoryPrerequisitesConfirmed = $false },
    @{ directoryPrerequisitesConfirmed = 'true' },
    @{ allowReplaceExistingSignIn = 'true' },
    @{ clientId = '' }, @{ tenantId = 'common' },
    @{ clientSecretSettingName = '' }, @{ clientSecretSettingName = 'secret-value-with-symbols' },
    @{ resourceGroupName = 'wrong-target' },
    @{ approvalReference = '' }, @{ clientSecret = 'must-not-be-accepted' }
)) {
    $invalid = $signIn.Clone()
    foreach ($key in $patch.Keys) { $invalid[$key] = $patch[$key] }
    Assert-Throws { Assert-AccessConfiguration $invalid SignIn $subscription $group }
}
$roleParameters = Assert-AccessConfiguration $roles BlobRoles $subscription $group
if ($roleParameters.webAppName.value -cne $roles.webAppName -or $roleParameters.Contains('webPrincipalId') -or
    $roleParameters.approvedWebPrincipalId.value -cne $roles.webPrincipalId) {
    throw 'The role template must bind the named web app to the approved principal ID.'
}
$invalid = $roles.Clone(); $invalid.blobDataAccess = 'Owner'
Assert-Throws { Assert-AccessConfiguration $invalid BlobRoles $subscription $group }
Assert-AccessConfiguration $network StorageNetwork $subscription $group | Out-Null
$invalid = $network.Clone(); $invalid.networkMode = 'AuthenticatedPublic'
Assert-Throws { Assert-AccessConfiguration $invalid StorageNetwork $subscription $group }
$public = $invalid.Clone(); $public.publicEndpointApproval = 'policy-approved-123'
Assert-AccessConfiguration $public StorageNetwork $subscription $group | Out-Null

$fixture = Join-Path $PSScriptRoot ".validation\$([guid]::NewGuid().ToString('N'))"
$null = New-Item -ItemType Directory -Path $fixture -Force
try {
    $global:MvpAccessCalls = 0
    function global:az { $global:MvpAccessCalls++; throw 'Local access validation must not call Azure.' }
    foreach ($operation in @('SignIn', 'BlobRoles', 'StorageNetwork')) {
        $config = switch ($operation) { 'SignIn' { $signIn } 'BlobRoles' { $roles } 'StorageNetwork' { $public } }
        $path = Join-Path $fixture "$operation.json"
        $config | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $path -Encoding utf8NoBOM
        $args = @{
            Operation = $operation; SubscriptionId = $subscription; ResourceGroupName = $group
            ConfigurationPath = $path; ExpectedSha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
            OutputPath = Join-Path $fixture "$operation.parameters.json"
        }
        & (Join-Path $PSScriptRoot '..\Deploy-AccessConfiguration.ps1') @args | Out-Null
        $record = Get-Content -LiteralPath $args.OutputPath -Raw | ConvertFrom-Json -AsHashtable
        if (@($record.Keys | Where-Object { $_ -cnotin @('$schema', 'contentVersion', 'parameters') }).Count -ne 0) {
            throw 'Access records must retain the ARM deployment-parameters document shape.'
        }
        if ($record.parameters.approvalReference.value -cne $config.approvalReference) {
            throw 'The saved access record must retain the change-review reference.'
        }
        foreach ($suffix in @('', '.before-auth.json', '.before-storage.json')) {
            $args.OutputPath = Join-Path $fixture "$operation-$([guid]::NewGuid().ToString('N')).json"
            $existingPath = "$($args.OutputPath)$suffix"
            Set-Content -LiteralPath $existingPath -Value 'preserved-review-baseline' -Encoding utf8NoBOM
            $existingHash = (Get-FileHash -LiteralPath $existingPath -Algorithm SHA256).Hash
            Assert-Throws { & (Join-Path $PSScriptRoot '..\Deploy-AccessConfiguration.ps1') @args -Apply }
            if ((Get-FileHash -LiteralPath $existingPath -Algorithm SHA256).Hash -cne $existingHash) {
                throw 'An existing review record was overwritten.'
            }
            if ($suffix -ne '' -and (Test-Path -LiteralPath $args.OutputPath)) {
                throw 'An orphaned audit sidecar should block before creating parameters.'
            }
        }
        $args.ExpectedSha256 = '0' * 64
        Assert-Throws { & (Join-Path $PSScriptRoot '..\Deploy-AccessConfiguration.ps1') @args -Apply }
    }
    if ($global:MvpAccessCalls -ne 0) { throw 'A dry-run or invalid hash called Azure.' }
    $global:MvpTargetKind = ''
    function global:az {
        $global:MvpAccessCalls++
        $global:LASTEXITCODE = 0
        if ($args[0] -cne 'webapp' -or $args[1] -cne 'show') { throw 'Invalid web kind must stop before any additional operation.' }
        return (@{ id = 'synthetic-test-resource'; httpsOnly = $true; kind = $global:MvpTargetKind } | ConvertTo-Json)
    }
    foreach ($operation in @('SignIn', 'BlobRoles')) {
        foreach ($kind in @('functionapp,linux', 'app', 'linux', 'app,linux-extra', 'app,functionapp,linux')) {
            $global:MvpTargetKind = $kind
            $global:MvpAccessCalls = 0
            $path = Join-Path $fixture "$operation.json"
            $message = ''
            try {
                & (Join-Path $PSScriptRoot '..\Deploy-AccessConfiguration.ps1') -Operation $operation `
                    -SubscriptionId $subscription -ResourceGroupName $group -ConfigurationPath $path `
                    -ExpectedSha256 (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash `
                    -OutputPath (Join-Path $fixture "$([guid]::NewGuid().ToString('N')).json") -Apply | Out-Null
            } catch { $message = $_.Exception.Message }
            if ($global:MvpAccessCalls -ne 1 -or $message -notlike '*not a Function App*') { throw 'Unexpected target kind was not rejected during web preflight.' }
        }
    }
    $global:MvpAccessCalls = 0
    $signIn.directoryPrerequisitesConfirmed = $false
    $path = Join-Path $fixture 'unapproved.json'
    $signIn | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $path -Encoding utf8NoBOM
    Assert-Throws {
        & (Join-Path $PSScriptRoot '..\Deploy-AccessConfiguration.ps1') -Operation SignIn `
            -SubscriptionId $subscription -ResourceGroupName $group -ConfigurationPath $path `
            -ExpectedSha256 (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash `
            -OutputPath (Join-Path $fixture 'unapproved.parameters.json') -Apply
    }
    if ($global:MvpAccessCalls -ne 0) { throw 'Unapproved sign-in activation called Azure.' }
    function global:az {
        $global:MvpAccessCalls++
        $global:LASTEXITCODE = 0
        if ($args[0] -ceq 'webapp' -and $args[1] -ceq 'show') {
            return '{"id":"/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/sample-resource-group/providers/Microsoft.Web/sites/sample-web","httpsOnly":true,"kind":"app,linux","identity":{"principalId":"55555555-5555-4555-8555-555555555555"}}'
        }
        if ($args[0] -ceq 'rest') { return '{"properties":{"platform":{"enabled":false}}}' }
        if ($args[0] -ceq 'webapp' -and $args[1] -ceq 'config' -and $args[2] -ceq 'show') { return '{"minTlsVersion":"1.2","scmMinTlsVersion":"1.2"}' }
        if ($args[0] -ceq 'webapp' -and $args[1] -ceq 'config') { return '[]' }
        throw 'A failed prerequisite must never reach a deployment.'
    }
    # Valid reviewed input but no existing code-flow secret: fail before auth is enabled.
    $path = Join-Path $fixture 'SignIn.json'
    Assert-Throws {
        & (Join-Path $PSScriptRoot '..\Deploy-AccessConfiguration.ps1') -Operation SignIn `
            -SubscriptionId $subscription -ResourceGroupName $group -ConfigurationPath $path `
            -ExpectedSha256 (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash `
            -OutputPath (Join-Path $fixture 'no-secret.parameters.json') -Apply
    }
    if ($global:MvpAccessCalls -ne 4) { throw 'Sign-in prerequisite inspection did not reach the missing-secret guard.' }
    $path = Join-Path $fixture 'BlobRoles.json'
    Assert-Throws {
        & (Join-Path $PSScriptRoot '..\Deploy-AccessConfiguration.ps1') -Operation BlobRoles `
            -SubscriptionId $subscription -ResourceGroupName $group -ConfigurationPath $path `
            -ExpectedSha256 (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash `
            -OutputPath (Join-Path $fixture 'wrong-principal.parameters.json') -Apply
    }
    if ($global:MvpAccessCalls -ne 5) { throw 'Blob role prerequisite did not inspect the web identity exactly once.' }
    $global:MvpRaceOutput = Join-Path $fixture 'race.parameters.json'
    $global:MvpAccessCalls = 0
    function global:az {
        $global:MvpAccessCalls++
        $global:LASTEXITCODE = 0
        if ($args[0] -ceq 'webapp' -and $args[1] -ceq 'show') {
            return '{"id":"synthetic-test-resource","httpsOnly":true,"kind":"app,linux"}'
        }
        if ($args[0] -ceq 'rest') { return '{"properties":{"platform":{"enabled":false}}}' }
        if ($args[0] -ceq 'webapp' -and $args[1] -ceq 'config' -and $args[2] -ceq 'show') { return '{"minTlsVersion":"1.2","scmMinTlsVersion":"1.2"}' }
        if ($args[0] -ceq 'webapp' -and $args[1] -ceq 'config') {
            Set-Content -LiteralPath "$global:MvpRaceOutput.before-auth.json" -Value 'concurrent-review-baseline' -Encoding utf8NoBOM
            return '[{"name":"MICROSOFT_PROVIDER_AUTHENTICATION_SECRET","value":"synthetic-test-only","slotSetting":true}]'
        }
        throw 'An audit collision must not reach deployment.'
    }
    $path = Join-Path $fixture 'SignIn.json'
    Assert-Throws {
        & (Join-Path $PSScriptRoot '..\Deploy-AccessConfiguration.ps1') -Operation SignIn `
            -SubscriptionId $subscription -ResourceGroupName $group -ConfigurationPath $path `
            -ExpectedSha256 (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash `
            -OutputPath $global:MvpRaceOutput -Apply
    }
    if ($global:MvpAccessCalls -ne 4 -or
        (Get-Content -LiteralPath "$global:MvpRaceOutput.before-auth.json" -Raw).Trim() -cne 'concurrent-review-baseline') {
        throw 'Create-only writes must preserve a concurrent audit record and stop before deployment.'
    }
    $global:MvpAuthReads = 0
    $global:MvpAuthWrites = 0
    $global:MvpLatestAuth = ''
    $global:MvpTlsResponse = '{"minTlsVersion":"1.2","scmMinTlsVersion":"1.2"}'
    $global:MvpTlsReads = 0
    function global:az {
        $global:LASTEXITCODE = 0
        if ($args[0] -ceq 'webapp' -and $args[1] -ceq 'show') {
            return '{"id":"synthetic-test-resource","httpsOnly":true,"kind":"app,linux"}'
        }
        if ($args[0] -ceq 'rest') {
            $global:MvpAuthReads++
            if ($global:MvpAuthReads -eq 1) { return '{"properties":{"platform":{"enabled":false}}}' }
            if ($global:MvpLatestAuth -ceq 'failed-read') { $global:LASTEXITCODE = 1; return '' }
            return $global:MvpLatestAuth
        }
        if ($args[0] -ceq 'webapp' -and $args[1] -ceq 'config' -and $args[2] -ceq 'show') {
            $global:MvpTlsReads++
            if ($global:MvpTlsResponse -ceq 'failed-read') { $global:LASTEXITCODE = 1; return '' }
            return $global:MvpTlsResponse
        }
        if ($args[0] -ceq 'webapp' -and $args[1] -ceq 'config') {
            return '[{"name":"MICROSOFT_PROVIDER_AUTHENTICATION_SECRET","value":"synthetic-test-only","slotSetting":true}]'
        }
        if ($args[0] -ceq 'deployment') { Assert-AccessSnapshot $args SignIn; $global:MvpAuthWrites++; return }
        throw 'Unexpected sign-in command.'
    }
    foreach ($allowReplace in @($false, $true)) {
        $signIn.directoryPrerequisitesConfirmed = $true
        $signIn.allowReplaceExistingSignIn = $allowReplace
        $path = Join-Path $fixture 'SignIn.json'
        $signIn | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $path -Encoding utf8NoBOM
        foreach ($latest in @(
            '{"properties":{"platform":{"enabled":false}}}',
            '{"properties":{"platform":{"enabled":true}}}',
            '{"properties":{"platform":{"enabled":false},"httpSettings":{"requireHttps":true}}}',
            '{"properties":null}', 'failed-read'
        )) {
            $global:MvpLatestAuth = $latest
            $global:MvpAuthReads = 0
            $global:MvpAuthWrites = 0
            $signInArgs = @{
                Operation = 'SignIn'; SubscriptionId = $subscription; ResourceGroupName = $group
                ConfigurationPath = $path; ExpectedSha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
                OutputPath = Join-Path $fixture "$([guid]::NewGuid().ToString('N')).json"
            }
            if ($latest -ceq '{"properties":{"platform":{"enabled":false}}}') {
                & (Join-Path $PSScriptRoot '..\Deploy-AccessConfiguration.ps1') @signInArgs -Apply | Out-Null
                if ($global:MvpAuthWrites -ne 1) { throw 'Unchanged sign-in configuration should allow deployment.' }
                if (Test-Path -LiteralPath (Split-Path -Parent $global:MvpSnapshotPath)) { throw 'Sign-in snapshot was not cleaned up.' }
            } else {
                Assert-Throws { & (Join-Path $PSScriptRoot '..\Deploy-AccessConfiguration.ps1') @signInArgs -Apply }
                if ($global:MvpAuthWrites -ne 0) { throw 'Changed or unreadable sign-in configuration must block deployment.' }
            }
            if ($global:MvpAuthReads -ne 2) { throw 'Expected a final authentication recheck.' }
        }
    }
    $global:MvpLatestAuth = '{"properties":{"platform":{"enabled":false}}}'
    foreach ($property in @('minTlsVersion', 'scmMinTlsVersion')) {
        foreach ($value in @('1.0', '1.1', $null, '', 'TLS1_2', 'unknown', 1.2, 'missing')) {
            $transport = @{ minTlsVersion = '1.2'; scmMinTlsVersion = '1.2' }
            if ($value -ceq 'missing') { $transport.Remove($property) } else { $transport[$property] = $value }
            $global:MvpTlsResponse = $transport | ConvertTo-Json -Compress
            $global:MvpTlsReads = 0; $global:MvpAuthReads = 0; $global:MvpAuthWrites = 0
            $signInArgs.OutputPath = Join-Path $fixture "$([guid]::NewGuid().ToString('N')).json"
            $message = ''
            try { & (Join-Path $PSScriptRoot '..\Deploy-AccessConfiguration.ps1') @signInArgs -Apply | Out-Null } catch { $message = $_.Exception.Message }
            if ($message -notlike '*require site and SCM minimum TLS*' -or $global:MvpTlsReads -ne 1 -or
                $global:MvpAuthReads -ne 0 -or $global:MvpAuthWrites -ne 0) { throw 'Unsafe site/SCM TLS must stop before reading secrets/auth or deploying.' }
        }
    }
    foreach ($response in @('failed-read', 'invalid-json', '[]', 'null')) {
        $global:MvpTlsResponse = $response
        $global:MvpTlsReads = 0; $global:MvpAuthReads = 0; $global:MvpAuthWrites = 0
        $signInArgs.OutputPath = Join-Path $fixture "$([guid]::NewGuid().ToString('N')).json"
        Assert-Throws { & (Join-Path $PSScriptRoot '..\Deploy-AccessConfiguration.ps1') @signInArgs -Apply }
        if ($global:MvpTlsReads -ne 1 -or $global:MvpAuthReads -ne 0 -or $global:MvpAuthWrites -ne 0) { throw 'Failed TLS discovery must block sign-in changes.' }
    }
    foreach ($siteTls in @('1.2', '1.3')) {
        foreach ($scmTls in @('1.2', '1.3')) {
            $global:MvpTlsResponse = @{ minTlsVersion = $siteTls; scmMinTlsVersion = $scmTls } | ConvertTo-Json -Compress
            $global:MvpTlsReads = 0; $global:MvpAuthReads = 0; $global:MvpAuthWrites = 0
            $signInArgs.OutputPath = Join-Path $fixture "$([guid]::NewGuid().ToString('N')).json"
            & (Join-Path $PSScriptRoot '..\Deploy-AccessConfiguration.ps1') @signInArgs -Apply | Out-Null
            if ($global:MvpTlsReads -ne 1 -or $global:MvpAuthWrites -ne 1) { throw 'Supported TLS settings should permit reviewed sign-in activation.' }
        }
    }
    $baseline = @{
        location = 'centralus'; sku = @{ name = 'Standard_LRS' }; kind = 'StorageV2'
        allowSharedKeyAccess = $false; allowBlobPublicAccess = $false
        enableHttpsTrafficOnly = $true; minimumTlsVersion = 'TLS1_2'
        publicNetworkAccess = 'Enabled'
        networkRuleSet = @{ ipRules = @(); virtualNetworkRules = @(); bypass = 'None'; defaultAction = 'Deny' }
    }
    $global:MvpStorageState = $baseline
    $global:MvpStorageUpdate = @()
    function global:az {
        $global:MvpAccessCalls++
        $global:LASTEXITCODE = 0
        if ($args[0] -cne 'storage' -or $args[1] -cne 'account') { throw 'Unexpected Storage command.' }
        if ($args[2] -ceq 'show') { return ($global:MvpStorageState | ConvertTo-Json -Depth 8) }
        if ($args[2] -ceq 'update') { $global:MvpStorageUpdate = @($args); return }
        throw 'Unexpected Storage operation.'
    }
    foreach ($configuration in @($network, $public)) {
        $path = Join-Path $fixture "storage-$($configuration.networkMode).json"
        $configuration | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $path -Encoding utf8NoBOM
        $storageArgs = @{
            Operation = 'StorageNetwork'; SubscriptionId = $subscription; ResourceGroupName = $group
            ConfigurationPath = $path; ExpectedSha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
            OutputPath = Join-Path $fixture "storage-$($configuration.networkMode).parameters.json"
        }
        foreach ($property in @('enableHttpsTrafficOnly', 'minimumTlsVersion')) {
            $values = if ($property -ceq 'enableHttpsTrafficOnly') { @($false, $null, 'true', 1, 'missing') } else { @('TLS1_0', 'TLS1_1', $null, '', 'unknown', 'missing') }
            foreach ($value in $values) {
                $global:MvpStorageState = $baseline.Clone()
                if ($value -ceq 'missing') { $global:MvpStorageState.Remove($property) } else { $global:MvpStorageState[$property] = $value }
                $global:MvpAccessCalls = 0
                $global:MvpStorageUpdate = @()
                $storageArgs.OutputPath = Join-Path $fixture "$([guid]::NewGuid().ToString('N')).json"
                $message = ''
                try { & (Join-Path $PSScriptRoot '..\Deploy-AccessConfiguration.ps1') @storageArgs -Apply | Out-Null } catch { $message = $_.Exception.Message }
                if ($message -notlike '*must already require HTTPS and minimum TLS 1.2*' -or
                    $global:MvpAccessCalls -ne 1 -or $global:MvpStorageUpdate.Count -ne 0 -or
                    (Test-Path -LiteralPath "$($storageArgs.OutputPath).before-storage.json")) {
                    throw "Unsafe or missing $property did not stop at the transport guard."
                }
            }
        }
        $global:MvpStorageState = $baseline
        $global:MvpAccessCalls = 0
        $global:MvpStorageUpdate = @()
        $storageArgs.OutputPath = Join-Path $fixture "$([guid]::NewGuid().ToString('N')).json"
        foreach ($bypass in @('AzureServices', 'Logging', 'Metrics', 'AzureServices,Logging', 'none', '', $null, @('None'), 'missing')) {
            $global:MvpStorageState = $baseline.Clone()
            $global:MvpStorageState.networkRuleSet = $baseline.networkRuleSet.Clone()
            if ($bypass -ceq 'missing') { $global:MvpStorageState.networkRuleSet.Remove('bypass') } else { $global:MvpStorageState.networkRuleSet.bypass = $bypass }
            $global:MvpStorageUpdate = @()
            $storageArgs.OutputPath = Join-Path $fixture "$([guid]::NewGuid().ToString('N')).json"
            $message = ''
            try { & (Join-Path $PSScriptRoot '..\Deploy-AccessConfiguration.ps1') @storageArgs -Apply | Out-Null } catch { $message = $_.Exception.Message }
            if ($message -notlike '*Existing network exceptions require separate review*' -or $global:MvpStorageUpdate.Count -ne 0) {
                throw 'An existing or unknown bypass must not be removed by the network update.'
            }
        }
        $global:MvpStorageState = $baseline
        $global:MvpAccessCalls = 0
        $storageArgs.OutputPath = Join-Path $fixture "$([guid]::NewGuid().ToString('N')).json"
        & (Join-Path $PSScriptRoot '..\Deploy-AccessConfiguration.ps1') @storageArgs -Apply | Out-Null
        $access = if ($configuration.networkMode -ceq 'Closed') { 'Disabled' } else { 'Enabled' }
        $action = if ($configuration.networkMode -ceq 'Closed') { 'Deny' } else { 'Allow' }
        $expected = @('storage', 'account', 'update', '--subscription', $subscription, '--resource-group', $group,
            '--name', 'samplestorage', '--default-action', $action, '--bypass', 'None',
            '--public-network-access', $access, '--only-show-errors', '--output', 'none')
        if ($global:MvpAccessCalls -ne 2 -or ($global:MvpStorageUpdate -join '|') -cne ($expected -join '|')) {
            throw "Storage $($configuration.networkMode) did not send the exact reviewed network update."
        }
        $recorded = Get-Content -LiteralPath "$($storageArgs.OutputPath).before-storage.json" -Raw | ConvertFrom-Json -AsHashtable
        $appliedRecord = Get-Content -LiteralPath $storageArgs.OutputPath -Raw | ConvertFrom-Json -AsHashtable
        if ($appliedRecord.parameters.approvalReference.value -cne $configuration.approvalReference -or
            $appliedRecord.parameters.networkMode.value -cne $configuration.networkMode -or
            $appliedRecord.parameters.publicEndpointApproval.value -cne $configuration.publicEndpointApproval) {
            throw 'The applied Storage record must retain both change approval and network policy approval.'
        }
        if ($recorded.enableHttpsTrafficOnly -ne $true -or $recorded.minimumTlsVersion -cne 'TLS1_2') {
            throw 'Storage transport baseline was not preserved in the audit record.'
        }
    }
    $global:MvpBlobWrites = 0
    $global:MvpContainerPrivacy = @('None', 'None')
    $global:MvpContainerReads = 0
    function global:az {
        $global:LASTEXITCODE = 0
        if ($args[0] -ceq 'webapp') {
            return '{"id":"synthetic-test-resource","httpsOnly":true,"kind":"app,linux","identity":{"principalId":"44444444-4444-4444-8444-444444444444"}}'
        }
        if ($args[0] -ceq 'storage' -and $args[2] -ceq 'show') { return ($global:MvpStorageState | ConvertTo-Json -Depth 8) }
        if ($args[0] -ceq 'rest') {
            $privacy = $global:MvpContainerPrivacy[$global:MvpContainerReads]
            $global:MvpContainerReads++
            if ($privacy -ceq 'failed-read') { $global:LASTEXITCODE = 1; return '' }
            return (@{ properties = @{ publicAccess = $privacy } } | ConvertTo-Json -Depth 4)
        }
        if ($args[0] -ceq 'deployment') { Assert-AccessSnapshot $args BlobRoles; $global:MvpBlobWrites++; return }
        throw 'Unexpected Blob role command.'
    }
    $path = Join-Path $fixture 'BlobRoles.json'
    $blobArgs = @{
        Operation = 'BlobRoles'; SubscriptionId = $subscription; ResourceGroupName = $group
        ConfigurationPath = $path; ExpectedSha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
    }
    foreach ($property in @('allowSharedKeyAccess', 'allowBlobPublicAccess')) {
        foreach ($value in @($true, $null, 'false')) {
            $global:MvpStorageState = $baseline.Clone()
            $global:MvpStorageState[$property] = $value
            $global:MvpContainerReads = 0
            $blobArgs.OutputPath = Join-Path $fixture "$([guid]::NewGuid().ToString('N')).json"
            Assert-Throws { & (Join-Path $PSScriptRoot '..\Deploy-AccessConfiguration.ps1') @blobArgs -Apply }
            if ($global:MvpBlobWrites -ne 0 -or $global:MvpContainerReads -ne 0) { throw 'Insecure account must block before container checks or grants.' }
        }
    }
    $global:MvpStorageState = $baseline
    foreach ($containerIndex in @(0, 1)) {
        foreach ($privacy in @('Blob', 'Container', $null, 'failed-read')) {
            $global:MvpContainerPrivacy = @('None', 'None')
            $global:MvpContainerPrivacy[$containerIndex] = $privacy
            $global:MvpContainerReads = 0
            $blobArgs.OutputPath = Join-Path $fixture "$([guid]::NewGuid().ToString('N')).json"
            Assert-Throws { & (Join-Path $PSScriptRoot '..\Deploy-AccessConfiguration.ps1') @blobArgs -Apply }
            if ($global:MvpBlobWrites -ne 0 -or $global:MvpContainerReads -ne $containerIndex + 1) { throw 'Nonprivate or unreadable containers must block grants.' }
        }
    }
    $global:MvpContainerPrivacy = @('None', 'None')
    $global:MvpContainerReads = 0
    $blobArgs.OutputPath = Join-Path $fixture "$([guid]::NewGuid().ToString('N')).json"
    & (Join-Path $PSScriptRoot '..\Deploy-AccessConfiguration.ps1') @blobArgs -Apply | Out-Null
    if ($global:MvpBlobWrites -ne 1 -or $global:MvpContainerReads -ne 2) { throw 'Private containers should permit the scoped grant.' }
    if (Test-Path -LiteralPath (Split-Path -Parent $global:MvpSnapshotPath)) { throw 'Blob snapshot was not cleaned up.' }
    Remove-Variable MvpSnapshotPath -Scope Global
    $global:MvpHashMismatchPath = ''
    function global:Get-FileHash {
        param($LiteralPath, $Algorithm, $ErrorAction)
        if ($LiteralPath -ceq $global:MvpHashMismatchPath) { return @{ Hash = '0' * 64 } }
        Microsoft.PowerShell.Utility\Get-FileHash -LiteralPath $LiteralPath -Algorithm $Algorithm -ErrorAction Stop
    }
    function global:az {
        $global:LASTEXITCODE = 0
        if ($global:MvpMutationPending) {
            $global:MvpMutationPending = $false
            if ($global:MvpMutationKind -eq 'digest') {
                $global:MvpHashMismatchPath = $global:MvpMutationPath
            } else {
                $replacement = "$global:MvpMutationPath.replacement"
                $changed = Get-Content -LiteralPath $global:MvpMutationPath -Raw | ConvertFrom-Json -AsHashtable
                $values = if ($changed.Contains('parameters')) { $changed.parameters } else { $changed }
                $name = switch ($global:MvpMutationOperation) { 'SignIn' { 'approvedParticipantObjectIds' } 'BlobRoles' { 'blobDataAccess' } 'StorageNetwork' { 'networkMode' } }
                $value = switch ($global:MvpMutationOperation) { 'SignIn' { ,@('55555555-5555-4555-8555-555555555555') } 'BlobRoles' { 'Contributor' } 'StorageNetwork' { 'Closed' } }
                if ($changed.Contains('parameters')) { $values[$name].value = $value } else { $values[$name] = $value }
                [System.IO.File]::WriteAllText($replacement, ($changed | ConvertTo-Json -Depth 8))
                try {
                    [System.IO.File]::Move($replacement, $global:MvpMutationPath, $true)
                    $global:MvpMutationSucceeded = $true
                } catch [System.IO.IOException], [System.UnauthorizedAccessException] {
                    if (-not $IsWindows) { throw }
                } finally {
                    if (Test-Path -LiteralPath $replacement) { Remove-Item -LiteralPath $replacement }
                }
            }
        }
        if ($args[0] -ceq 'webapp' -and $args[1] -ceq 'show') {
            return '{"id":"synthetic-test-resource","httpsOnly":true,"kind":"app,linux","identity":{"principalId":"44444444-4444-4444-8444-444444444444"}}'
        }
        if ($args[0] -ceq 'webapp' -and $args[2] -ceq 'show') { return '{"minTlsVersion":"1.2","scmMinTlsVersion":"1.2"}' }
        if ($args[0] -ceq 'webapp') { return '[{"name":"MICROSOFT_PROVIDER_AUTHENTICATION_SECRET","value":"synthetic-test-only","slotSetting":true}]' }
        if ($args[0] -ceq 'rest') {
            if (($args -join ' ') -like '*/containers/*') { return '{"properties":{"publicAccess":"None"}}' }
            return '{"properties":{"platform":{"enabled":false}}}'
        }
        if ($args[0] -ceq 'storage' -and $args[2] -ceq 'show') { return ($global:MvpStorageState | ConvertTo-Json -Depth 8) }
        if ($args[0] -ceq 'deployment') { Assert-AccessSnapshot $args $global:MvpMutationOperation }
        elseif ($args[0] -cne 'storage' -or $args[2] -cne 'update') { throw 'Unexpected access mutation-test command.' }
        $global:MvpMutationWrites++
        if ($global:MvpMutationKind -eq 'failure') { $global:LASTEXITCODE = 1 }
    }
    try {
        foreach ($operation in @('SignIn', 'BlobRoles', 'StorageNetwork')) {
            foreach ($scenario in @('input', 'output', 'digest', 'failure')) {
                $config = switch ($operation) { 'SignIn' { $signIn } 'BlobRoles' { $roles } 'StorageNetwork' { $public } }
                $path = Join-Path $fixture "mutation-$operation.json"
                $config | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $path -Encoding utf8NoBOM
                $accessArgs = @{
                    Operation = $operation; SubscriptionId = $subscription; ResourceGroupName = $group
                    ConfigurationPath = $path; ExpectedSha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
                    OutputPath = Join-Path $fixture "$operation-$scenario.parameters.json"
                }
                $global:MvpMutationPath = [System.IO.Path]::GetFullPath($(if ($scenario -eq 'input') { $path } else { $accessArgs.OutputPath }))
                $global:MvpMutationKind = $scenario
                $global:MvpMutationOperation = $operation
                $global:MvpMutationPending = $scenario -ne 'failure'
                $global:MvpMutationSucceeded = $false
                $global:MvpMutationWrites = 0
                $message = ''
                try { & (Join-Path $PSScriptRoot '..\Deploy-AccessConfiguration.ps1') @accessArgs -Apply | Out-Null } catch { $message = $_.Exception.Message }
                $global:MvpHashMismatchPath = ''
                if ($global:MvpMutationPending) { throw 'Access mutation test never reached preflight.' }
                if ($scenario -eq 'digest' -or $global:MvpMutationSucceeded) {
                    if ($global:MvpMutationWrites -ne 0 -or $message -notlike '*no longer matches the reviewed SHA-256*') { throw 'Changed access inputs or generated records reached a write.' }
                } elseif ($scenario -eq 'failure') {
                    if ($global:MvpMutationWrites -ne 1 -or $message -notmatch 'Access deployment did not report success|Storage network update failed') { throw 'Access deployment failure was not propagated.' }
                } elseif ($global:MvpMutationWrites -ne 1 -or $message -ne '') { throw "Access replacement denial did not preserve the reviewed operation: $message" }
                $released = [System.IO.File]::Open($accessArgs.OutputPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
                $released.Dispose()
                if ($global:MvpMutationWrites -eq 1 -and $operation -ne 'StorageNetwork' -and
                    (Test-Path -LiteralPath (Split-Path -Parent $global:MvpSnapshotPath))) { throw 'Access snapshot leaked after deployment.' }
            }
        }
    } finally {
        Remove-Item Function:\Get-FileHash -Force
        Remove-Variable MvpHashMismatchPath, MvpMutationPath, MvpMutationKind, MvpMutationOperation, MvpMutationPending, MvpMutationSucceeded, MvpMutationWrites, MvpSnapshotPath -Scope Global -ErrorAction SilentlyContinue
    }
    if ($BicepPath) {
        $templatePath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\templates\storage-role-grants.bicep'))
        $compiledJson = & $BicepPath build $templatePath --no-restore --stdout
        if ($LASTEXITCODE -ne 0) { throw 'Blob role template did not compile.' }
        $compiled = ($compiledJson -join "`n") | ConvertFrom-Json -AsHashtable
        $expectedExpression = "[__bicep.bindApprovedPrincipal(coalesce(tryGet(tryGet(reference('web', '2024-04-01', 'full'), 'identity'), 'principalId'), ''), parameters('approvedWebPrincipalId'))]"
        if ($compiled.resources.assignments.properties.principalId -cne $expectedExpression) {
            throw 'Blob grants must consume the web identity lookup constrained by the approved principal.'
        }
        $approved = 'abcdef12-3456-4789-abcd-0123456789ab'
        $relativeTemplate = [System.IO.Path]::GetRelativePath($fixture, $templatePath).Replace('\', '/')
        foreach ($mode in @('Reader', 'Contributor')) {
            foreach ($actual in @($approved, $approved.ToUpperInvariant(), '', '11111111-1111-4111-8111-111111111111')) {
                $inputPath = Join-Path $fixture 'identity.bicepparam'
                $outputPath = Join-Path $fixture 'identity.json'
                if (Test-Path -LiteralPath $outputPath) { Remove-Item -LiteralPath $outputPath }
                $source = @"
using '$relativeTemplate'
import { bindApprovedPrincipal } from '$relativeTemplate'
param storageAccountName = 'samplestorage'
param webAppName = 'sample-web'
param approvalReference = 'synthetic-test-review'
param blobDataAccess = '$mode'
param approvedWebPrincipalId = bindApprovedPrincipal('$actual', '$approved')
"@
                Set-Content -LiteralPath $inputPath -Value $source -Encoding utf8NoBOM
                $diagnostics = & $BicepPath build-params $inputPath --no-restore --outfile $outputPath 2>&1
                if ($actual -ieq $approved) {
                    if ($LASTEXITCODE -ne 0) { throw "Matching identity failed evaluation: $diagnostics" }
                    $result = Get-Content -LiteralPath $outputPath -Raw | ConvertFrom-Json -AsHashtable
                    if ($result.parameters.approvedWebPrincipalId.value -cne $approved) { throw 'Grant identity must equal the normalized approved principal.' }
                } elseif ($LASTEXITCODE -eq 0 -or ($diagnostics -join "`n") -notlike '*web identity changed or is absent*' -or (Test-Path -LiteralPath $outputPath)) {
                    throw "Unapproved identity did not fail evaluation: $diagnostics"
                }
            }
        }
        Write-Output 'Blob identity template checks passed: 8 evaluation cases and compiled assignment binding.'
    }
} finally {
    Remove-Item -LiteralPath Function:\az -ErrorAction SilentlyContinue
    Remove-Variable -Name MvpAccessCalls -Scope Global -ErrorAction SilentlyContinue
    Remove-Variable -Name MvpTargetKind -Scope Global -ErrorAction SilentlyContinue
    Remove-Variable -Name MvpRaceOutput -Scope Global -ErrorAction SilentlyContinue
    Remove-Variable -Name MvpAuthReads, MvpAuthWrites, MvpLatestAuth -Scope Global -ErrorAction SilentlyContinue
    Remove-Variable -Name MvpTlsReads, MvpTlsResponse -Scope Global -ErrorAction SilentlyContinue
    Remove-Variable -Name MvpStorageState, MvpStorageUpdate -Scope Global -ErrorAction SilentlyContinue
    Remove-Variable -Name MvpBlobWrites, MvpContainerPrivacy, MvpContainerReads -Scope Global -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $fixture -Recurse -Force
}
Write-Output 'MVP access safety checks passed: explicit identities, directory approval, scoped roles, storage policy approval and no-cloud dry-runs.'
exit 0
