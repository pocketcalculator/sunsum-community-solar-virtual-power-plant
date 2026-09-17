#requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('SignIn', 'BlobRoles', 'StorageNetwork')][string] $Operation,
    [Parameter(Mandatory)][string] $SubscriptionId,
    [Parameter(Mandatory)][string] $ResourceGroupName,
    [Parameter(Mandatory)][string] $ConfigurationPath,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string] $ExpectedSha256,
    [Parameter(Mandatory)][string] $OutputPath,
    [switch] $Apply
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'MvpAccessSafety.psm1') -Force
function Write-NewAccessRecord([string] $Path, [string] $Content) {
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    try {
        $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($Content)
        $stream.Write($bytes, 0, $bytes.Length)
    } finally { $stream.Dispose() }
}
$path = (Resolve-Path -LiteralPath $ConfigurationPath).Path
if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ine $ExpectedSha256) { throw 'Access configuration no longer matches its reviewed hash.' }
$config = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json -AsHashtable
$parameters = Assert-AccessConfiguration $config $Operation $SubscriptionId $ResourceGroupName
$output = [System.IO.Path]::GetFullPath($OutputPath)
foreach ($recordPath in @($output, "$output.before-auth.json", "$output.before-storage.json")) {
    if (Test-Path -LiteralPath $recordPath) { throw 'Use a new output path with no existing parameters or audit sidecars for each review/apply record.' }
}
$null = New-Item -ItemType Directory -Path (Split-Path -Parent $output) -Force
Write-NewAccessRecord $output (@{
    '$schema' = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'
    contentVersion = '1.0.0.0'
    parameters = $parameters
} | ConvertTo-Json -Depth 8)
if (-not $Apply) {
    Write-Output 'Access inputs validated and parameters recorded locally. No Azure calls; -Apply requires separate authorization.'
    return
}
if ($Operation -in @('SignIn', 'BlobRoles')) {
    $raw = & az webapp show --subscription $SubscriptionId --resource-group $ResourceGroupName --name $config.webAppName --output json --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the explicit existing web app.' }
    $web = ($raw -join "`n") | ConvertFrom-Json -AsHashtable
    if ($web.httpsOnly -isnot [bool] -or $web.httpsOnly -ne $true -or $web.kind -isnot [string] -or
        'app' -notin ($web.kind -split ',') -or 'linux' -notin ($web.kind -split ',') -or 'functionapp' -in ($web.kind -split ',')) {
        throw 'Expected the existing HTTPS-only Linux web app, not a Function App.'
    }
}
if ($Operation -eq 'SignIn') {
    $raw = & az webapp config show --subscription $SubscriptionId --resource-group $ResourceGroupName --name $config.webAppName `
        --query '{minTlsVersion:minTlsVersion,scmMinTlsVersion:scmMinTlsVersion}' --output json --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw 'Cannot verify site and SCM minimum TLS before sign-in changes.' }
    $transport = ($raw -join "`n") | ConvertFrom-Json -AsHashtable -NoEnumerate
    if ($transport -isnot [System.Collections.IDictionary] -or
        -not $transport.Contains('minTlsVersion') -or -not $transport.Contains('scmMinTlsVersion') -or
        $transport.minTlsVersion -isnot [string] -or $transport.minTlsVersion -cnotin @('1.2', '1.3') -or
        $transport.scmMinTlsVersion -isnot [string] -or $transport.scmMinTlsVersion -cnotin @('1.2', '1.3')) {
        throw 'Sign-in changes require site and SCM minimum TLS 1.2 or 1.3; remediate transport settings through a separate approved operation.'
    }
    $raw = & az rest --method get --url "https://management.azure.com$($web.id)/config/authsettingsV2?api-version=2024-04-01" --output json --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect current authentication; do not activate blindly.' }
    $auth = ($raw -join "`n") | ConvertFrom-Json -AsHashtable
    if ($auth.properties -isnot [System.Collections.IDictionary]) { throw 'Authentication configuration did not contain a valid properties object.' }
    $authSnapshot = $auth.properties | ConvertTo-Json -Depth 50 -Compress
    if ($auth.properties.Contains('platform') -and $auth.properties.platform.Contains('enabled') -and
        $auth.properties.platform.enabled -and -not $config.allowReplaceExistingSignIn) { throw 'Existing sign-in is enabled; review its full replacement before opting in.' }
    $raw = & az webapp config appsettings list --subscription $SubscriptionId --resource-group $ResourceGroupName --name $config.webAppName --output json --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw 'Cannot verify the existing secret setting.' }
    $settings = @(($raw -join "`n") | ConvertFrom-Json)
    $secret = @($settings | Where-Object { $_.name -ceq $config.clientSecretSettingName })
    if ($secret.Count -ne 1 -or [string]::IsNullOrWhiteSpace($secret[0].value) -or
        $secret[0].value.StartsWith('@Microsoft.KeyVault(') -or -not $secret[0].slotSetting) {
        throw 'A nonempty, slot-sticky code-flow secret must already exist. This foundation does not provision or resolve Key Vault references.'
    }
    $raw = $null; $settings = $null; $secret = $null
    Write-NewAccessRecord "$output.before-auth.json" ($auth | ConvertTo-Json -Depth 50)
}
if ($Operation -eq 'BlobRoles' -and
    (-not $web.Contains('identity') -or $web.identity.principalId -ine $config.webPrincipalId)) {
    throw 'Approved Blob principal is not the existing web app system-assigned identity.'
}
if ($Operation -in @('StorageNetwork', 'BlobRoles')) {
    $raw = & az storage account show --subscription $SubscriptionId --resource-group $ResourceGroupName --name $config.storageAccountName --output json --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw 'Cannot verify the existing storage account before access changes.' }
    $storage = ($raw -join "`n") | ConvertFrom-Json -AsHashtable
    if (($Operation -eq 'StorageNetwork' -and $storage.location -ine $config.location) -or $storage.sku.name -cne 'Standard_LRS' -or
        $storage.kind -cne 'StorageV2' -or $storage.allowSharedKeyAccess -isnot [bool] -or $storage.allowSharedKeyAccess -ne $false -or
        $storage.allowBlobPublicAccess -isnot [bool] -or $storage.allowBlobPublicAccess -ne $false) {
        throw 'Storage does not match the reviewed LRS/private/passwordless baseline; no takeover is allowed.'
    }
    if (-not $storage.Contains('enableHttpsTrafficOnly') -or $storage.enableHttpsTrafficOnly -isnot [bool] -or
        $storage.enableHttpsTrafficOnly -ne $true -or -not $storage.Contains('minimumTlsVersion') -or
        $storage.minimumTlsVersion -cne 'TLS1_2') {
        throw 'Storage must already require HTTPS and minimum TLS 1.2. Missing or incompatible transport settings require separate review before network changes.'
    }
}
if ($Operation -eq 'BlobRoles') {
    foreach ($containerName in @('site-documents', 'project-documents')) {
        $containerId = "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroupName/providers/Microsoft.Storage/storageAccounts/$($config.storageAccountName)/blobServices/default/containers/$containerName"
        $raw = & az rest --method get --url "https://management.azure.com${containerId}?api-version=2024-01-01" --output json --only-show-errors
        if ($LASTEXITCODE -ne 0) { throw 'Cannot verify existing private containers before role assignment.' }
        $container = ($raw -join "`n") | ConvertFrom-Json -AsHashtable
        if ($container.properties.publicAccess -cne 'None') { throw 'Both document containers must already disable public access before role assignment.' }
    }
}
if ($Operation -eq 'StorageNetwork') {
    if ($storage.networkRuleSet.ipRules.Count -ne 0 -or $storage.networkRuleSet.virtualNetworkRules.Count -ne 0 -or
        ($storage.networkRuleSet.Contains('resourceAccessRules') -and $storage.networkRuleSet.resourceAccessRules.Count -gt 0)) {
        throw 'Existing network exceptions require separate review; this template would replace them.'
    }
    Write-NewAccessRecord "$output.before-storage.json" ($storage | ConvertTo-Json -Depth 50)
    $defaultAction = if ($config.networkMode -ceq 'AuthenticatedPublic') { 'Allow' } else { 'Deny' }
    $publicNetworkAccess = if ($config.networkMode -ceq 'AuthenticatedPublic') { 'Enabled' } else { 'Disabled' }
    & az storage account update --subscription $SubscriptionId --resource-group $ResourceGroupName `
        --name $config.storageAccountName --default-action $defaultAction --bypass None `
        --public-network-access $publicNetworkAccess --only-show-errors --output none
    if ($LASTEXITCODE -ne 0) { throw 'Storage network update failed; no alternate network path or policy bypass was attempted.' }
    Write-Output 'Reviewed Storage network mode updated without replacing account/container configuration. Verify both authorized and denied data access.'
    return
}
$templateName = switch ($Operation) {
    'SignIn' { 'web-sign-in.bicep' }
    'BlobRoles' { 'storage-role-grants.bicep' }
}
if ($Operation -eq 'SignIn') {
    $raw = & az rest --method get --url "https://management.azure.com$($web.id)/config/authsettingsV2?api-version=2024-04-01" --output json --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw 'Cannot recheck authentication immediately before deployment; no update was attempted.' }
    $latestAuth = ($raw -join "`n") | ConvertFrom-Json -AsHashtable
    if ($latestAuth.properties -isnot [System.Collections.IDictionary] -or
        ($latestAuth.properties | ConvertTo-Json -Depth 50 -Compress) -cne $authSnapshot) {
        throw 'Authentication changed after preflight. Obtain a new review and output path; no update was attempted.'
    }
}
& az deployment group create --subscription $SubscriptionId --resource-group $ResourceGroupName `
    --name "sunsum-$($Operation.ToLowerInvariant())-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))" `
    --mode Incremental --template-file (Join-Path $PSScriptRoot "..\templates\$templateName") `
    --parameters "@$output" --only-show-errors --output none
if ($LASTEXITCODE -ne 0) { throw 'Access deployment did not report success. Inspect the recorded operation; do not broaden permissions or retry automatically.' }
Write-Output 'Access configuration deployment reported success. Complete positive and negative access checks; business authorization is not established by provisioning.'
