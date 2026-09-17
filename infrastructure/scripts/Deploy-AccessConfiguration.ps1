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
    if (-not $web.httpsOnly -or $web.kind -notmatch 'linux') { throw 'Expected the existing HTTPS-only Linux app.' }
}
if ($Operation -eq 'SignIn') {
    $raw = & az rest --method get --url "https://management.azure.com$($web.id)/config/authsettingsV2?api-version=2024-04-01" --output json --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect current authentication; do not activate blindly.' }
    $auth = ($raw -join "`n") | ConvertFrom-Json -AsHashtable
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
if ($Operation -eq 'StorageNetwork') {
    $raw = & az storage account show --subscription $SubscriptionId --resource-group $ResourceGroupName --name $config.storageAccountName --output json --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw 'Cannot verify the existing storage account before network changes.' }
    $storage = ($raw -join "`n") | ConvertFrom-Json -AsHashtable
    if ($storage.location -ine $config.location -or $storage.sku.name -cne 'Standard_LRS' -or
        $storage.kind -cne 'StorageV2' -or $storage.allowSharedKeyAccess -ne $false -or $storage.allowBlobPublicAccess -ne $false) {
        throw 'Storage does not match the reviewed LRS/private/passwordless baseline; no takeover is allowed.'
    }
    if ($storage.networkRuleSet.ipRules.Count -ne 0 -or $storage.networkRuleSet.virtualNetworkRules.Count -ne 0 -or
        ($storage.networkRuleSet.Contains('resourceAccessRules') -and $storage.networkRuleSet.resourceAccessRules.Count -gt 0)) {
        throw 'Existing network exceptions require separate review; this template would replace them.'
    }
    Write-NewAccessRecord "$output.before-storage.json" ($storage | ConvertTo-Json -Depth 50)
    $defaultAction = if ($config.networkMode -ceq 'AuthenticatedPublic') { 'Allow' } else { 'Deny' }
    & az storage account update --subscription $SubscriptionId --resource-group $ResourceGroupName `
        --name $config.storageAccountName --default-action $defaultAction --bypass None `
        --public-network-access Enabled --only-show-errors --output none
    if ($LASTEXITCODE -ne 0) { throw 'Storage network update failed; no alternate network path or policy bypass was attempted.' }
    Write-Output 'Reviewed Storage network mode updated without replacing account/container configuration. Verify both authorized and denied data access.'
    return
}
$templateName = switch ($Operation) {
    'SignIn' { 'web-sign-in.bicep' }
    'BlobRoles' { 'storage-role-grants.bicep' }
}
& az deployment group create --subscription $SubscriptionId --resource-group $ResourceGroupName `
    --name "sunsum-$($Operation.ToLowerInvariant())-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))" `
    --mode Incremental --template-file (Join-Path $PSScriptRoot "..\templates\$templateName") `
    --parameters "@$output" --only-show-errors --output none
if ($LASTEXITCODE -ne 0) { throw 'Access deployment did not report success. Inspect the recorded operation; do not broaden permissions or retry automatically.' }
Write-Output 'Access configuration deployment reported success. Complete positive and negative access checks; business authorization is not established by provisioning.'
