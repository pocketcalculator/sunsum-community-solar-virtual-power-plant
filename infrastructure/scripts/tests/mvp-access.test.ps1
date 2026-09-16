#requires -Version 7.2
$ErrorActionPreference = 'Stop'
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
Assert-AccessConfiguration $roles BlobRoles $subscription $group | Out-Null
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
} finally {
    Remove-Item -LiteralPath Function:\az -ErrorAction SilentlyContinue
    Remove-Variable -Name MvpAccessCalls -Scope Global -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $fixture -Recurse -Force
}
Write-Output 'MVP access safety checks passed: explicit identities, directory approval, scoped roles, storage policy approval and no-cloud dry-runs.'
