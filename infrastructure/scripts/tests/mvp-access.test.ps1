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
    if ($global:MvpAccessCalls -ne 3) { throw 'Sign-in prerequisite inspection did not reach the missing-secret guard.' }
    $path = Join-Path $fixture 'BlobRoles.json'
    Assert-Throws {
        & (Join-Path $PSScriptRoot '..\Deploy-AccessConfiguration.ps1') -Operation BlobRoles `
            -SubscriptionId $subscription -ResourceGroupName $group -ConfigurationPath $path `
            -ExpectedSha256 (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash `
            -OutputPath (Join-Path $fixture 'wrong-principal.parameters.json') -Apply
    }
    if ($global:MvpAccessCalls -ne 4) { throw 'Blob role prerequisite did not inspect the web identity exactly once.' }
    $global:MvpRaceOutput = Join-Path $fixture 'race.parameters.json'
    $global:MvpAccessCalls = 0
    function global:az {
        $global:MvpAccessCalls++
        $global:LASTEXITCODE = 0
        if ($args[0] -ceq 'webapp' -and $args[1] -ceq 'show') {
            return '{"id":"synthetic-test-resource","httpsOnly":true,"kind":"app,linux"}'
        }
        if ($args[0] -ceq 'rest') { return '{"properties":{"platform":{"enabled":false}}}' }
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
    if ($global:MvpAccessCalls -ne 3 -or
        (Get-Content -LiteralPath "$global:MvpRaceOutput.before-auth.json" -Raw).Trim() -cne 'concurrent-review-baseline') {
        throw 'Create-only writes must preserve a concurrent audit record and stop before deployment.'
    }
    $global:MvpAuthReads = 0
    $global:MvpAuthWrites = 0
    $global:MvpLatestAuth = ''
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
        if ($args[0] -ceq 'webapp' -and $args[1] -ceq 'config') {
            return '[{"name":"MICROSOFT_PROVIDER_AUTHENTICATION_SECRET","value":"synthetic-test-only","slotSetting":true}]'
        }
        if ($args[0] -ceq 'deployment') { $global:MvpAuthWrites++; return }
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
            } else {
                Assert-Throws { & (Join-Path $PSScriptRoot '..\Deploy-AccessConfiguration.ps1') @signInArgs -Apply }
                if ($global:MvpAuthWrites -ne 0) { throw 'Changed or unreadable sign-in configuration must block deployment.' }
            }
            if ($global:MvpAuthReads -ne 2) { throw 'Expected a final authentication recheck.' }
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
        if ($args[0] -ceq 'deployment') { $global:MvpBlobWrites++; return }
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
    Remove-Variable -Name MvpRaceOutput -Scope Global -ErrorAction SilentlyContinue
    Remove-Variable -Name MvpAuthReads, MvpAuthWrites, MvpLatestAuth -Scope Global -ErrorAction SilentlyContinue
    Remove-Variable -Name MvpStorageState, MvpStorageUpdate -Scope Global -ErrorAction SilentlyContinue
    Remove-Variable -Name MvpBlobWrites, MvpContainerPrivacy, MvpContainerReads -Scope Global -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $fixture -Recurse -Force
}
Write-Output 'MVP access safety checks passed: explicit identities, directory approval, scoped roles, storage policy approval and no-cloud dry-runs.'
