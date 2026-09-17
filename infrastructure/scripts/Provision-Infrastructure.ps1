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
    [Parameter(Mandatory)][string] $ApprovalPath,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string] $ApprovalSha256,
    [switch] $Apply
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'DeploymentSafety.psm1') -Force
if ($SubscriptionId -eq [guid]::Empty -or $ResourceGroupName.EndsWith('.') -or
    [string]::IsNullOrWhiteSpace($ApprovalReference) -or
    [string]::IsNullOrWhiteSpace($DatabaseBudgetApproval) -or [string]::IsNullOrWhiteSpace($StorageBudgetApproval)) {
    throw 'An explicit target, infrastructure review, and separate PostgreSQL/Storage budget approvals are required.'
}
$snapshot = New-DeploymentSnapshot -Path $ParametersPath -ExpectedSha256 $ExpectedSha256
$approvalSnapshot = $null
try {
    $path = $snapshot.Path
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
    if ($document.parameters.Contains('runtimeRoleName') -and $document.parameters.runtimeRoleName.value -cne 'sunsum_runtime') {
        throw 'This foundation requires runtimeRoleName=sunsum_runtime; verify the distinct non-admin Entra role through SQL bootstrap before enabling database access.'
    }
    $databaseName = if ($document.parameters.Contains('databaseName')) { $document.parameters.databaseName.value } else { 'sunsum' }
    if ($databaseName -isnot [string] -or $databaseName -cnotmatch '\A[a-z][a-z0-9_]{0,62}\z' -or
        $databaseName -cmatch '\A(pg_|azure_)' -or $databaseName -cin @('postgres', 'public', 'template0', 'template1')) {
        throw 'databaseName must match the bootstrap contract: 1-63 lowercase ASCII letters/digits/underscores, starting with a letter; reserved database names and pg_/azure_ prefixes are forbidden.'
    }
    $approvalSnapshot = New-DeploymentApproval -Path $ApprovalPath -ExpectedSha256 $ApprovalSha256 -Expected @{
        operation = 'ProvisionInfrastructure'; subscriptionId = [string]$SubscriptionId; resourceGroupName = $ResourceGroupName
        payloadSha256 = $ExpectedSha256; approvalReference = $ApprovalReference
        databaseBudgetApproval = $DatabaseBudgetApproval; storageBudgetApproval = $StorageBudgetApproval
    }
    if (-not $Apply) {
        Write-Output 'Reviewed parameters, explicit target and budget acknowledgement validated. No Azure calls; -Apply requires separate provisioning authorization.'
        return
    }
    $raw = & az resource list --subscription $SubscriptionId --resource-group $ResourceGroupName --output json --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw 'Cannot check existing resources before first-time provisioning.' }
    $resources = ($raw -join "`n") | ConvertFrom-Json -AsHashtable -NoEnumerate
    if ($resources -isnot [array] -or @($resources | Where-Object {
        $_ -isnot [System.Collections.IDictionary] -or
        [string]::IsNullOrWhiteSpace($_.type) -or [string]::IsNullOrWhiteSpace($_.name)
    }).Count -gt 0) {
        throw 'Resource discovery did not return a valid inventory; provisioning is blocked.'
    }
    if (@($resources | Where-Object {
        ($_.type -ieq 'Microsoft.DBforPostgreSQL/flexibleServers' -and $_.name -ieq $document.parameters.postgresServerName.value) -or
        ($_.type -ieq 'Microsoft.Storage/storageAccounts' -and $_.name -ieq $document.parameters.storageAccountName.value)
    }).Count -gt 0) {
        throw 'PostgreSQL or Storage already exists. First-time provisioning cannot update existing targets; use separately reviewed targeted operations.'
    }
    if ($webMode -ceq 'Create') {
        if (@($resources | Where-Object {
            ($_.type -ieq 'Microsoft.Web/sites' -and $_.name -ieq $document.parameters.webAppName.value) -or
            ($_.type -ieq 'Microsoft.Web/serverfarms' -and $_.name -ieq $document.parameters.appServicePlanName.value)
        }).Count -gt 0) {
            throw 'Create mode would overwrite an existing app/plan. Use Existing mode and reviewed targeted identity/settings operations.'
        }
    } else {
        $raw = & az webapp show --subscription $SubscriptionId --resource-group $ResourceGroupName --name $document.parameters.webAppName.value `
            --query '{id:id,kind:kind,httpsOnly:httpsOnly,defaultHostName:defaultHostName}' --output json --only-show-errors
        if ($LASTEXITCODE -ne 0) { throw 'Cannot verify the existing web app; no infrastructure deployment was attempted.' }
        $web = ($raw -join "`n") | ConvertFrom-Json -AsHashtable -NoEnumerate
        $expectedWebId = "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroupName/providers/Microsoft.Web/sites/$($document.parameters.webAppName.value)"
        if ($web -isnot [System.Collections.IDictionary] -or $web.id -ine $expectedWebId -or
            $web.kind -isnot [string] -or 'app' -notin ($web.kind -split ',') -or 'linux' -notin ($web.kind -split ',') -or
            $web.httpsOnly -isnot [bool] -or $web.httpsOnly -ne $true -or
            $web.defaultHostName -isnot [string] -or $web.defaultHostName -cnotmatch '^[a-z0-9][a-z0-9.-]*\.azurewebsites\.net$') {
            throw 'Existing mode requires the exact HTTPS-only Linux web app with a public-cloud hostname; no infrastructure deployment was attempted.'
        }
    }
    $nameChecks = @(
        @{ name = $document.parameters.postgresServerName.value; type = 'Microsoft.DBforPostgreSQL/flexibleServers'; apiVersion = '2021-06-01' },
        @{ name = $document.parameters.storageAccountName.value; type = 'Microsoft.Storage/storageAccounts'; apiVersion = '2024-01-01' }
    )
    if ($webMode -ceq 'Create') {
        $nameChecks += @{ name = $document.parameters.webAppName.value; type = 'Microsoft.Web/sites'; apiVersion = '2024-04-01' }
    }
    foreach ($check in $nameChecks) {
        $provider = $check.type.Split('/')[0]
        $requestPath = [System.IO.Path]::GetTempFileName()
        try {
            @{ name = $check.name; type = $check.type } | ConvertTo-Json -Compress | Set-Content -LiteralPath $requestPath -Encoding utf8NoBOM
            $raw = & az rest --method post --url "https://management.azure.com/subscriptions/$SubscriptionId/providers/$provider/checkNameAvailability?api-version=$($check.apiVersion)" `
                --body "@$requestPath" --output json --only-show-errors
            if ($LASTEXITCODE -ne 0) { throw "Cannot check name availability for $($check.type); no infrastructure deployment was attempted." }
            $availability = ($raw -join "`n") | ConvertFrom-Json -AsHashtable -NoEnumerate
            if ($availability -isnot [System.Collections.IDictionary] -or -not $availability.Contains('nameAvailable') -or
                $availability.nameAvailable -isnot [bool] -or $availability.nameAvailable -ne $true) {
                throw "Name is unavailable or availability is unknown for $($check.type); no infrastructure deployment was attempted."
            }
        } finally { Remove-Item -LiteralPath $requestPath -Force }
    }
    $template = Join-Path $PSScriptRoot '..\templates\resources.bicep'
    Assert-DeploymentSnapshot $snapshot
    Assert-DeploymentSnapshot $approvalSnapshot
    & az deployment group create --subscription $SubscriptionId --resource-group $ResourceGroupName `
        --name "sunsum-foundation-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))" --mode Incremental `
        --template-file $template --parameters "@$path" --only-show-errors --output none
    if ($LASTEXITCODE -ne 0) {
        throw 'Provisioning did not report success; inspect the deployment before retrying. No provider registration, permissions change, or tier fallback was attempted.'
    }
    Write-Output 'Infrastructure deployment reported success. Network approvals, SQL bootstrap and application deployment remain separate operations.'
} finally {
    try {
        if ($null -ne $approvalSnapshot) { Remove-DeploymentSnapshot $approvalSnapshot }
    } finally { Remove-DeploymentSnapshot $snapshot }
}
