#requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory)][guid] $SubscriptionId,
    [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9_().-]{1,90}$')][string] $ResourceGroupName,
    [Parameter(Mandatory)][string] $ParametersPath,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string] $ExpectedSha256,
    [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string] $ApprovalReference,
    [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string] $DatabaseBudgetApproval,
    [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string] $StorageBudgetApproval,
    [switch] $Apply
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($SubscriptionId -eq [guid]::Empty -or $ResourceGroupName.EndsWith('.') -or
    [string]::IsNullOrWhiteSpace($ApprovalReference) -or
    [string]::IsNullOrWhiteSpace($DatabaseBudgetApproval) -or [string]::IsNullOrWhiteSpace($StorageBudgetApproval)) {
    throw 'An explicit target, infrastructure review, and separate PostgreSQL/Storage budget approvals are required.'
}
$path = (Resolve-Path -LiteralPath $ParametersPath).Path
if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ine $ExpectedSha256) {
    throw 'The parameters no longer match the reviewed SHA-256.'
}
$document = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json -AsHashtable
$required = @(
    'environmentName', 'location', 'appServicePlanName', 'webAppName', 'postgresServerName',
    'tenantId', 'postgresAdminObjectId', 'postgresAdminPrincipalName', 'storageAccountName'
)
$allowed = $required + @(
    'databaseName', 'runtimeRoleName', 'postgresAdminPrincipalType', 'webAppMode',
    'postgresTier', 'postgresSkuName', 'postgresStorageSizeGB', 'postgresVersion'
)
if (-not $document.Contains('parameters') -or $document.parameters -isnot [System.Collections.IDictionary]) {
    throw 'Expected an ARM deployment parameters document.'
}
foreach ($name in $required) {
    if (-not $document.parameters.Contains($name)) { throw "Missing required parameter: $name" }
}
foreach ($name in $document.parameters.Keys) {
    $entry = $document.parameters[$name]
    if ($name -cnotin $allowed -or $entry -isnot [System.Collections.IDictionary] -or
        $entry.Count -ne 1 -or -not $entry.Contains('value')) {
        throw 'Only reviewed literal values for documented parameters are allowed.'
    }
    $value = $entry.value
    if ($value -is [string]) {
        if ([string]::IsNullOrWhiteSpace($value) -or $value -match '[<>\x00-\x1f]|\$\{') {
            throw "Replace placeholders and control characters in parameter: $name"
        }
    } elseif ($value -isnot [long] -and $value -isnot [int]) {
        throw 'Parameters must contain only documented string or integer values.'
    }
}
foreach ($name in @('tenantId', 'postgresAdminObjectId')) {
    $id = [guid]::Empty
    if (-not [guid]::TryParseExact($document.parameters[$name].value, 'D', [ref] $id) -or $id -eq [guid]::Empty) {
        throw "A nonempty UUID is required for $name."
    }
    $webMode = if ($document.parameters.Contains('webAppMode')) { $document.parameters.webAppMode.value } else { 'Existing' }
    if ($webMode -cnotin @('Existing', 'Create') -or $document.parameters.storageAccountName.value -cnotmatch '^[a-z0-9]{3,24}$') {
        throw 'Invalid web mode or storage account name.'
    }
}
if (-not $Apply) {
    Write-Output 'Reviewed parameters, explicit target and budget acknowledgement validated. No Azure calls; -Apply requires separate provisioning authorization.'
    return
}
if ($webMode -ceq 'Create') {
    $raw = & az resource list --subscription $SubscriptionId --resource-group $ResourceGroupName --output json --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw 'Cannot check existing resources before new-web creation.' }
    $resources = @(($raw -join "`n") | ConvertFrom-Json)
    if (@($resources | Where-Object {
        ($_.type -ieq 'Microsoft.Web/sites' -and $_.name -ieq $document.parameters.webAppName.value) -or
        ($_.type -ieq 'Microsoft.Web/serverfarms' -and $_.name -ieq $document.parameters.appServicePlanName.value)
    }).Count -gt 0) {
        throw 'Create mode would overwrite an existing app/plan. Use Existing mode and reviewed targeted identity/settings operations.'
    }
}
$template = Join-Path $PSScriptRoot '..\templates\resources.bicep'
& az deployment group create --subscription $SubscriptionId --resource-group $ResourceGroupName `
    --name "sunsum-foundation-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))" --mode Incremental `
    --template-file $template --parameters "@$path" --only-show-errors --output none
if ($LASTEXITCODE -ne 0) {
    throw 'Provisioning did not report success; inspect the deployment before retrying. No provider registration, permissions change, or tier fallback was attempted.'
}
Write-Output 'Infrastructure deployment reported success. Network approvals, SQL bootstrap and application deployment remain separate operations.'
