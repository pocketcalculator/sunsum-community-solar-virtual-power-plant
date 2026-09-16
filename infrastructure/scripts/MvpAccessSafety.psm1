#requires -Version 7.2
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-AccessUuid([object] $Value) {
    $parsed = [guid]::Empty
    if ($Value -isnot [string] -or
        -not [guid]::TryParseExact($Value, 'D', [ref] $parsed) -or $parsed -eq [guid]::Empty) {
        throw 'A nonempty canonical UUID is required; never substitute a name or email.'
    }
}

function Assert-AccessConfiguration {
    param([System.Collections.IDictionary] $Config, [string] $Operation, [string] $SubscriptionId, [string] $ResourceGroupName)
    Assert-AccessUuid $SubscriptionId
    if ($ResourceGroupName -notmatch '^[a-zA-Z0-9_().-]{1,90}$' -or $ResourceGroupName.EndsWith('.')) {
        throw 'Invalid resource group name.'
    }
    $common = @('subscriptionId', 'resourceGroupName', 'approvalReference')
    $fields = switch ($Operation) {
        'SignIn' { @('webAppName', 'tenantId', 'clientId', 'clientSecretSettingName', 'approvedParticipantObjectIds', 'directoryPrerequisitesConfirmed', 'allowReplaceExistingSignIn') }
        'BlobRoles' { @('storageAccountName', 'webAppName', 'webPrincipalId', 'blobDataAccess') }
        'StorageNetwork' { @('storageAccountName', 'location', 'networkMode', 'publicEndpointApproval') }
        default { throw 'Unsupported access operation.' }
    }
    foreach ($key in $Config.Keys) {
        if ($key -cnotin ($common + $fields)) { throw 'Unknown access configuration field.' }
    }
    foreach ($key in ($common + $fields)) {
        if (-not $Config.Contains($key)) { throw "Missing access configuration field: $key" }
    }
    if ($Config.subscriptionId -ine $SubscriptionId -or $Config.resourceGroupName -ine $ResourceGroupName) {
        throw 'Access approval does not match the explicit subscription/resource group.'
    }
    if ($Config.approvalReference -isnot [string] -or
        [string]::IsNullOrWhiteSpace($Config.approvalReference) -or
        $Config.approvalReference.Length -gt 200 -or $Config.approvalReference -match '[<>\x00-\x1f]') {
        throw 'A nonsecret review reference is required.'
    }
    if ($Operation -in @('SignIn', 'BlobRoles') -and
        $Config.webAppName -cnotmatch '^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$') {
        throw 'Invalid existing web app name.'
    }
    if ($Operation -in @('StorageNetwork', 'BlobRoles') -and
        $Config.storageAccountName -cnotmatch '^[a-z0-9]{3,24}$') {
        throw 'Storage names must contain 3-24 lowercase letters/digits.'
    }
    $parameters = @{}
    switch ($Operation) {
        'SignIn' {
            Assert-AccessUuid $Config.tenantId
            Assert-AccessUuid $Config.clientId
            if ($Config.directoryPrerequisitesConfirmed -isnot [bool] -or -not $Config.directoryPrerequisitesConfirmed) {
                throw 'Directory app, assignment-required, guest onboarding and exact redirect URI must be confirmed before activation.'
            }
            if ($Config.allowReplaceExistingSignIn -isnot [bool]) { throw 'Existing sign-in replacement requires an explicit boolean decision.' }
            if ($Config.clientSecretSettingName -cnotmatch '^[A-Z][A-Z0-9_]{0,63}$') { throw 'Use the name of an existing secret app setting, never the secret value.' }
            $identities = $Config.approvedParticipantObjectIds
            if ($identities -isnot [array] -or $identities.Count -lt 1 -or $identities.Count -gt 13) {
                throw 'Easy Auth requires 1-13 explicitly approved user/guest object IDs; an empty list would be unrestricted.'
            }
            $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
            foreach ($identity in $identities) {
                Assert-AccessUuid $identity
                if (-not $seen.Add($identity)) { throw 'Duplicate participant identity.' }
            }
            foreach ($key in @('webAppName', 'tenantId', 'clientId', 'approvedParticipantObjectIds', 'approvalReference')) {
                $parameters[$key] = @{ value = $Config[$key] }
            }
            $parameters.authSettingName = @{ value = $Config.clientSecretSettingName }
            $parameters.activationApproved = @{ value = $true }
        }
        'BlobRoles' {
            Assert-AccessUuid $Config.webPrincipalId
            if ($Config.blobDataAccess -cnotin @('Reader', 'Contributor')) { throw 'Only explicit Blob data Reader or Contributor is supported at the two container scopes.' }
            foreach ($key in @('storageAccountName', 'webPrincipalId', 'blobDataAccess', 'approvalReference')) {
                $parameters[$key] = @{ value = $Config[$key] }
            }
        }
        'StorageNetwork' {
            if ($Config.location -cnotmatch '^[a-z0-9]+$') { throw 'An explicit Azure location is required.' }
            if ($Config.networkMode -cnotin @('Closed', 'AuthenticatedPublic')) { throw 'Unsupported storage network mode; IP rules are not a same-region F1 workaround.' }
            if ($Config.publicEndpointApproval -isnot [string] -or $Config.publicEndpointApproval.Length -gt 200 -or
                $Config.publicEndpointApproval -match '[<>\x00-\x1f]' -or
                ($Config.networkMode -ceq 'AuthenticatedPublic' -and [string]::IsNullOrWhiteSpace($Config.publicEndpointApproval))) {
                throw 'AuthenticatedPublic requires an explicit tenant-policy approval; never weaken a denied policy.'
            }
            foreach ($key in @('storageAccountName', 'location', 'networkMode', 'publicEndpointApproval')) {
                $parameters[$key] = @{ value = $Config[$key] }
            }
        }
    }
    return $parameters
}

Export-ModuleMember -Function Assert-AccessConfiguration
