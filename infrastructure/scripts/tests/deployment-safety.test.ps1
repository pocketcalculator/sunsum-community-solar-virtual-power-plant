#requires -Version 7.2
[CmdletBinding()]
param([string] $BicepPath)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot '..\DeploymentSafety.psm1') -Force

function Assert-Throws([scriptblock] $Action, [string] $Message) {
    $threw = $false
    try { & $Action | Out-Null } catch { $threw = $true }
    if (-not $threw) { throw $Message }
}

foreach ($address in @('20.30.40.50', '8.8.8.8')) {
    Assert-ExactPublicIpv4 $address
}
foreach ($address in @(
    '', '0.0.0.0', '0.0.0.1', '255.255.255.255', '127.0.0.1', '127.1',
    '10.0.0.4', '172.16.0.1', '192.168.1.1', '169.254.169.254', '224.0.0.1',
    '20.30.40.50/32', '20.30.40.0/24', '20.30.40.50-20.30.40.60',
    '20.30.40.256', '020.30.40.50', '20.30.40.50 ', '::1', '::ffff:20.30.40.50',
    '100.64.0.1', '192.0.2.1', '198.51.100.1', '203.0.113.1'
)) {
    Assert-Throws { Assert-ExactPublicIpv4 $address } "Accepted unsafe IPv4 input: $address"
}

foreach ($name in @('package.json', 'package-lock.json', 'next.config.ts', 'app/page.tsx', 'src/backend/database.ts', 'src/backend/infrastructure/database/credentials.ts', 'public/icon.svg')) {
    if (-not (Test-AppServiceArchivePath $name)) { throw "Rejected expected archive entry: $name" }
}
foreach ($name in @(
    '.env', '.env.production', '.azure/config.json', 'tooling/setup.ts',
    'node_modules/pg/index.js', '.next/server/app.js',
    '.git/config', '.npmrc', 'tests/unit/test.ts', 'src/.env.local',
    'src/secrets/token.json', 'src/credentials/service.json', 'public/credentials.json', 'src/config.local.json',
    'src/cert.pem', 'src/x.test.ts', 'src/__tests__/x.ts',
    '../package.json', '/package.json', 'app/../.env', 'app\\page.tsx'
)) {
    if (Test-AppServiceArchivePath $name) { throw "Accepted unsafe archive entry: $name" }
}

$target = @{
    subscriptionId = '11111111-1111-4111-8111-111111111111'
    resourceGroupName = 'sample-resource-group'
    postgresServerName = 'sample-postgres'
}
$approval = @{
    subscriptionId = $target.subscriptionId
    resourceGroupName = $target.resourceGroupName
    postgresServerName = $target.postgresServerName
    approvalReference = 'review-123'
    approvedIpv4Addresses = @('20.30.40.50')
}
Assert-FirewallApproval $approval @target | Out-Null
$invalid = $approval.Clone()
$invalid.approvedIpv4Addresses = @('0.0.0.0')
Assert-Throws { Assert-FirewallApproval $invalid @target } 'Accepted an Azure-wide firewall bypass.'
$invalid = $approval.Clone()
$invalid.approvedIpv4Addresses = @('20.30.40.50', '20.30.40.50')
Assert-Throws { Assert-FirewallApproval $invalid @target } 'Accepted duplicate approvals.'
$invalid = $approval.Clone()
$invalid.resourceGroupName = 'wrong-target'
Assert-Throws { Assert-FirewallApproval $invalid @target } 'Accepted approval for the wrong target.'
$invalid = $approval.Clone()
$invalid.approvalReference = ''
Assert-Throws { Assert-FirewallApproval $invalid @target } 'Accepted an unapproved proposal.'
$invalid = $approval.Clone()
$invalid.approvedIpv4Addresses = '20.30.40.50'
Assert-Throws { Assert-FirewallApproval $invalid @target } 'Accepted a scalar instead of an IPv4 array.'

$fixture = Join-Path $PSScriptRoot ".validation\$([guid]::NewGuid().ToString('N'))"
try {
    foreach ($directory in @('app', 'src', 'src\secrets', 'node_modules', '.azure', 'tooling')) {
        $null = New-Item -ItemType Directory -Path (Join-Path $fixture "source\$directory") -Force
    }
    $source = Join-Path $fixture 'source'
    @{
        'package.json' = '{"name":"fixture","scripts":{"start":"next start"}}'
        'package-lock.json' = '{"name":"fixture","lockfileVersion":3,"packages":{"":{}}}'
        'tsconfig.json' = '{}'
        'next.config.ts' = 'export default {};'
        'app\layout.tsx' = 'export default function Layout() { return null; }'
        'src\module.ts' = 'export const value = 1;'
        '.env' = 'not-a-real-secret'
        '.npmrc' = 'not-a-real-credential'
        '.azure\config.json' = '{}'
        'tooling\state.json' = '{}'
        'app\.env.local' = 'not-a-real-secret'
        'src\secrets\token.json' = '{}'
        'node_modules\windows.js' = 'throw new Error();'
    }.GetEnumerator() | ForEach-Object {
        Set-Content -LiteralPath (Join-Path $source $_.Key) -Value $_.Value -Encoding utf8NoBOM
    }
    $zipPath = Join-Path $fixture 'package.zip'
    $package = & (Join-Path $PSScriptRoot '..\New-AppServicePackage.ps1') -SourceRoot $source -OutputPath $zipPath
    if ($package.Files -ne 6 -or $package.SHA256 -notmatch '^[A-F0-9]{64}$') {
        throw 'The real packaging script did not enforce its source allowlist.'
    }
    $global:AzureSafetyTestCalls = 0
    function global:az {
        $global:AzureSafetyTestCalls++
        throw 'An unexpected Azure command was attempted by a local-only check.'
    }
    $provisionParameters = @{
        parameters = @{
            environmentName = @{ value = 'test' }
            location = @{ value = 'centralus' }
            appServicePlanName = @{ value = 'sample-plan' }
            webAppName = @{ value = 'sample-web' }
            postgresServerName = @{ value = 'sample-postgres' }
            storageAccountName = @{ value = 'samplestorage' }
            tenantId = @{ value = '22222222-2222-4222-8222-222222222222' }
            postgresAdminObjectId = @{ value = '33333333-3333-4333-8333-333333333333' }
            postgresAdminPrincipalName = @{ value = 'synthetic-administrator' }
        }
    }
    $provisionPath = Join-Path $fixture 'provision.json'
    $provisionParameters | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $provisionPath -Encoding utf8NoBOM
    $provision = @{
        SubscriptionId = $target.subscriptionId
        ResourceGroupName = $target.resourceGroupName
        ParametersPath = $provisionPath
        ExpectedSha256 = (Get-FileHash -LiteralPath $provisionPath -Algorithm SHA256).Hash
        ApprovalReference = 'review-123'
        DatabaseBudgetApproval = 'budget-123'
        StorageBudgetApproval = 'storage-budget-123'
    }
    & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision | Out-Null
    $rejectedRoles = @('postgres', 'azure_pg_admin', 'pg_read_all_data', 'sunsum_migrator', 'other_existing_role', 'SUNSUM_RUNTIME')
    foreach ($roleName in $rejectedRoles) {
        $provisionParameters.parameters.runtimeRoleName = @{ value = $roleName }
        $provisionParameters | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $provisionPath -Encoding utf8NoBOM
        $provision.ExpectedSha256 = (Get-FileHash -LiteralPath $provisionPath -Algorithm SHA256).Hash
        foreach ($apply in @($false, $true)) {
            $message = ''
            try { & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision -Apply:$apply | Out-Null } catch { $message = $_.Exception.Message }
            if ($message -notlike '*requires runtimeRoleName=sunsum_runtime*' -or $global:AzureSafetyTestCalls -ne 0) {
                throw 'An unsupported runtime role must be rejected before Azure calls.'
            }
        }
    }
    $provisionParameters.parameters.runtimeRoleName = @{ value = 'sunsum_runtime' }
    $provisionParameters | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $provisionPath -Encoding utf8NoBOM
    $provision.ExpectedSha256 = (Get-FileHash -LiteralPath $provisionPath -Algorithm SHA256).Hash
    & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision | Out-Null
    $provision.ExpectedSha256 = '0' * 64
    Assert-Throws { & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision -Apply } 'Accepted changed provisioning parameters.'
    $provisionParameters.parameters.webAppName.value = '<placeholder>'
    $provisionParameters | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $provisionPath -Encoding utf8NoBOM
    $provision.ExpectedSha256 = (Get-FileHash -LiteralPath $provisionPath -Algorithm SHA256).Hash
    Assert-Throws { & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision -Apply } 'Accepted placeholder provisioning parameters.'
    $approvalPath = Join-Path $fixture 'approval.json'
    $approval | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $approvalPath -Encoding utf8NoBOM
    $parametersPath = Join-Path $fixture 'firewall.parameters.json'
    & (Join-Path $PSScriptRoot '..\Set-PostgresFirewall.ps1') @target `
        -ApprovalFile $approvalPath -OutputPath $parametersPath | Out-Null
    $parameters = Get-Content -LiteralPath $parametersPath -Raw | ConvertFrom-Json -AsHashtable
    if ($parameters.parameters.approvedIpv4Addresses.value.Count -ne 1 -or
        $parameters.parameters.approvalReference.value -cne $approval.approvalReference) {
        throw 'Network parameter generation lost the exact address array or approval reference.'
    }
    $deploy = @{
        SubscriptionId = $target.subscriptionId
        ResourceGroupName = $target.resourceGroupName
        WebAppName = 'sample-web'
        PackagePath = $package.Path
        ExpectedSha256 = $package.SHA256
        ApprovalReference = 'review-123'
    }
    & (Join-Path $PSScriptRoot '..\Deploy-AppServiceCode.ps1') @deploy | Out-Null
    $deploy.ExpectedSha256 = '0' * 64
    Assert-Throws { & (Join-Path $PSScriptRoot '..\Deploy-AppServiceCode.ps1') @deploy -Apply } 'Accepted an unreviewed hash.'
    $invalid.approvedIpv4Addresses = @('0.0.0.0')
    $invalid | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $approvalPath -Encoding utf8NoBOM
    Assert-Throws {
        & (Join-Path $PSScriptRoot '..\Set-PostgresFirewall.ps1') @target -ApprovalFile $approvalPath `
            -OutputPath (Join-Path $fixture 'invalid.parameters.json') -Apply
    } 'Accepted unsafe network input with -Apply.'
    if ($global:AzureSafetyTestCalls -ne 0) { throw 'A local-only or invalid-input path called Azure.' }
    function global:az {
        $global:AzureSafetyTestCalls++
        if ($args[0] -cne 'webapp' -or $args[1] -cne 'show') { throw 'Discovery attempted a non-read operation.' }
        $global:LASTEXITCODE = 0
        return '{"id":"synthetic-test-resource","current":"20.30.40.50","possible":"20.30.40.50,20.30.40.51"}'
    }
    $proposalPath = Join-Path $fixture 'proposal.json'
    & (Join-Path $PSScriptRoot '..\Get-AppServiceEgressProposal.ps1') -SubscriptionId $target.subscriptionId `
        -ResourceGroupName $target.resourceGroupName -WebAppName 'sample-web' `
        -OperatorIpv4Addresses @('20.30.40.52') -OutputPath $proposalPath | Out-Null
    $proposal = Get-Content -LiteralPath $proposalPath -Raw | ConvertFrom-Json -AsHashtable
    if ($proposal.status -cne 'proposal-only-not-approved' -or $proposal.proposedIpv4Addresses.Count -ne 3 -or
        $global:AzureSafetyTestCalls -ne 1) {
        throw 'Read-only egress discovery did not return an unapproved deduplicated proposal.'
    }
    $global:AzureProvisionInventory = '[]'
    $global:AzureProvisionExitCode = 0
    $global:AzureProvisionWrites = 0
    $global:AzureExistingWeb = '{"id":"/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/sample-resource-group/providers/Microsoft.Web/sites/sample-web","kind":"app,linux","httpsOnly":true,"defaultHostName":"sample-web.azurewebsites.net"}'
    $global:AzureWebReadFailure = $false
    $global:AzureWebReads = 0
    $global:AzureAvailabilityFailureType = ''
    $global:AzureAvailabilityResponse = '{"nameAvailable":true}'
    $global:AzureAvailabilityExitCode = 0
    $global:AzureAvailabilityChecks = @()
    function global:az {
        $global:AzureSafetyTestCalls++
        if ($args[0] -ceq 'resource' -and $args[1] -ceq 'list') {
            $global:LASTEXITCODE = $global:AzureProvisionExitCode
            return $global:AzureProvisionInventory
        }
        if ($args[0] -ceq 'webapp' -and $args[1] -ceq 'show') {
            $global:AzureWebReads++
            $global:LASTEXITCODE = if ($global:AzureWebReadFailure) { 1 } else { 0 }
            return $global:AzureExistingWeb
        }
        if ($args[0] -ceq 'rest') {
            $bodyPath = [string]$args[[array]::IndexOf($args, '--body') + 1]
            $body = Get-Content -LiteralPath $bodyPath.Substring(1) -Raw | ConvertFrom-Json -AsHashtable
            $url = [string]$args[[array]::IndexOf($args, '--url') + 1]
            $expected = switch ($body.type) {
                'Microsoft.DBforPostgreSQL/flexibleServers' { @{ name = 'sample-postgres'; version = '2021-06-01' } }
                'Microsoft.Storage/storageAccounts' { @{ name = 'samplestorage'; version = '2024-01-01' } }
                'Microsoft.Web/sites' { @{ name = 'sample-web'; version = '2024-04-01' } }
                default { throw 'Unexpected name-availability type.' }
            }
            $provider = $body.type.Split('/')[0]
            $expectedUrl = "https://management.azure.com/subscriptions/11111111-1111-4111-8111-111111111111/providers/$provider/checkNameAvailability?api-version=$($expected.version)"
            if ($url -cne $expectedUrl -or $body.name -cne $expected.name -or
                $args[[array]::IndexOf($args, '--method') + 1] -cne 'post') { throw 'Name check was not bound to the reviewed target.' }
            $global:AzureAvailabilityChecks += $body.type
            if ($global:AzureAvailabilityFailureType -ceq $body.type) {
                $global:LASTEXITCODE = $global:AzureAvailabilityExitCode
                return $global:AzureAvailabilityResponse
            }
            $global:LASTEXITCODE = 0
            return '{"nameAvailable":true}'
        }
        if ($args[0] -ceq 'deployment' -and $args[1] -ceq 'group' -and $args[2] -ceq 'create') {
            $global:AzureProvisionWrites++
            $global:LASTEXITCODE = 0
            return
        }
        throw 'Unexpected provisioning command.'
    }
    $provisionParameters.parameters.webAppName.value = 'sample-web'
    foreach ($mode in @('Existing', 'Create')) {
        $global:AzureWebReads = 0
        $global:AzureAvailabilityChecks = @()
        $provisionParameters.parameters.webAppMode = @{ value = $mode }
        $provisionParameters | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $provisionPath -Encoding utf8NoBOM
        $provision.ExpectedSha256 = (Get-FileHash -LiteralPath $provisionPath -Algorithm SHA256).Hash
        foreach ($inventory in @(
            '[{"type":"Microsoft.DBforPostgreSQL/flexibleServers","name":"SAMPLE-POSTGRES"}]',
            '[{"type":"Microsoft.Storage/storageAccounts","name":"samplestorage"}]',
            '{}', 'null', '[{}]', 'invalid-json'
        )) {
            $global:AzureProvisionInventory = $inventory
            $global:AzureSafetyTestCalls = 0
            $global:AzureProvisionWrites = 0
            Assert-Throws { & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision -Apply } "Accepted existing targets or invalid inventory in $mode mode."
            if ($global:AzureSafetyTestCalls -ne 1 -or $global:AzureProvisionWrites -ne 0) { throw 'Provisioning did not stop after discovery.' }
        }
        $global:AzureProvisionInventory = '[]'
        $global:AzureProvisionExitCode = 1
        Assert-Throws { & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision -Apply } 'Accepted failed discovery.'
        if ($global:AzureProvisionWrites -ne 0) { throw 'Failed discovery allowed deployment.' }
        $global:AzureProvisionExitCode = 0
        & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision -Apply | Out-Null
        if ($global:AzureProvisionWrites -ne 1) { throw 'Available names and a valid web target should permit first-time provisioning.' }
        $expectedChecks = @('Microsoft.DBforPostgreSQL/flexibleServers', 'Microsoft.Storage/storageAccounts')
        if ($mode -ceq 'Create') { $expectedChecks += 'Microsoft.Web/sites' }
        if (($global:AzureAvailabilityChecks -join '|') -cne ($expectedChecks -join '|') -or
            $global:AzureWebReads -ne $(if ($mode -ceq 'Existing') { 1 } else { 0 })) { throw 'Provisioning preflights did not check the required targets.' }
        foreach ($inventory in @(
            '[{"type":"Microsoft.Web/sites","name":"sample-web"}]',
            '[{"type":"Microsoft.Web/serverfarms","name":"sample-plan"}]'
        )) {
            $global:AzureProvisionInventory = $inventory
            $global:AzureProvisionWrites = 0
            if ($mode -ceq 'Create') {
                Assert-Throws { & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision -Apply } 'Create mode accepted an existing web target.'
                if ($global:AzureProvisionWrites -ne 0) { throw 'Existing web target was overwritten.' }
            } else {
                & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision -Apply | Out-Null
                if ($global:AzureProvisionWrites -ne 1) { throw 'Existing mode should leave web targets alone.' }
            }
        }
        $global:AzureProvisionInventory = '[{"type":"Microsoft.Storage/storageAccounts","name":"unrelatedstorage"}]'
        $global:AzureProvisionWrites = 0
        & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision -Apply | Out-Null
        if ($global:AzureProvisionWrites -ne 1) { throw 'Unrelated resources should not block provisioning.' }
        $global:AzureProvisionInventory = '[]'
        foreach ($failedType in $expectedChecks) {
            $global:AzureAvailabilityFailureType = $failedType
            foreach ($response in @('{"nameAvailable":false}', '{"nameAvailable":null}', '{"nameAvailable":"true"}', '{}', '[]', 'null', 'invalid-json', 'read-failure')) {
                $global:AzureAvailabilityChecks = @()
                $global:AzureAvailabilityResponse = $response
                $global:AzureAvailabilityExitCode = if ($response -ceq 'read-failure') { 1 } else { 0 }
                $global:AzureProvisionWrites = 0
                Assert-Throws { & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision -Apply } 'Unavailable or unknown global name allowed deployment.'
                if ($global:AzureProvisionWrites -ne 0 -or $global:AzureAvailabilityChecks[-1] -cne $failedType) { throw 'Name preflight did not stop at the failed provider.' }
            }
        }
        $global:AzureAvailabilityFailureType = ''
        $global:AzureAvailabilityExitCode = 0
        if ($mode -ceq 'Existing') {
            $validWeb = $global:AzureExistingWeb
            foreach ($response in @('{}', '[]', 'null', 'invalid-json', 'read-failure',
                $validWeb.Replace('sample-web', 'wrong-web'),
                $validWeb.Replace('sample-resource-group', 'wrong-group'),
                $validWeb.Replace('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'),
                $validWeb.Replace('app,linux', 'app'), $validWeb.Replace('app,linux', 'functionapp,linux'),
                $validWeb.Replace('true', 'false'), $validWeb.Replace('true', '"true"'),
                $validWeb.Replace('sample-web.azurewebsites.net', ''), $validWeb.Replace('azurewebsites.net', 'example.com'))) {
                $global:AzureExistingWeb = $response
                $global:AzureWebReadFailure = $response -ceq 'read-failure'
                $global:AzureWebReads = 0
                $global:AzureAvailabilityChecks = @()
                $global:AzureProvisionWrites = 0
                Assert-Throws { & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision -Apply } 'Invalid existing web target allowed deployment.'
                if ($global:AzureWebReads -ne 1 -or $global:AzureProvisionWrites -ne 0 -or $global:AzureAvailabilityChecks.Count -ne 0) { throw 'Existing target validation must stop before provisioning or name checks.' }
            }
            $global:AzureExistingWeb = $validWeb
            $global:AzureWebReadFailure = $false
        }
    }
    $global:AzureCodeWrites = 0
    $global:AzureCodeReadFailure = $false
    $global:AzureCodeRuntime = @{}
    $global:AzureCodeBuildSettings = @()
    function global:az {
        $global:LASTEXITCODE = 0
        if ($args -contains '--help') { return '--track-status' }
        if ($args[0] -ceq 'webapp' -and $args[1] -ceq 'show') {
            return '{"id":"synthetic-test-resource","host":"sample-web.azurewebsites.net","httpsOnly":true,"kind":"app,linux"}'
        }
        if ($args[0] -ceq 'resource' -and $args[1] -ceq 'show') { return 'false' }
        if ($args[0] -ceq 'webapp' -and $args[1] -ceq 'config') {
            if ($global:AzureCodeReadFailure) { $global:LASTEXITCODE = 1; return '' }
            if ($args[2] -ceq 'show') { return ($global:AzureCodeRuntime | ConvertTo-Json) }
            return (ConvertTo-Json -InputObject $global:AzureCodeBuildSettings -Depth 5)
        }
        if ($args[0] -ceq 'webapp' -and $args[1] -ceq 'deploy') {
            $global:AzureCodeWrites++
            $global:LASTEXITCODE = 1
            return
        }
        throw 'Unexpected code deployment command.'
    }
    $deploy.ExpectedSha256 = $package.SHA256
    foreach ($scenario in @('missing-runtime', 'wrong-node', 'wrong-startup', 'missing-build', 'build-disabled', 'wrong-build', 'duplicate-build', 'run-from-package', 'read-failure', 'valid')) {
        $global:AzureCodeWrites = 0
        $global:AzureCodeReadFailure = $scenario -ceq 'read-failure'
        $global:AzureCodeRuntime = @{ linuxFxVersion = 'NODE|22-lts'; appCommandLine = 'npm run start -- --hostname 0.0.0.0' }
        $global:AzureCodeBuildSettings = @(
            @{ name = 'SCM_DO_BUILD_DURING_DEPLOYMENT'; value = 'true' },
            @{ name = 'CUSTOM_BUILD_COMMAND'; value = 'npm ci --include=dev && npm run build' }
        )
        switch ($scenario) {
            'missing-runtime' { $global:AzureCodeRuntime = @{} }
            'wrong-node' { $global:AzureCodeRuntime.linuxFxVersion = 'NODE|20-lts' }
            'wrong-startup' { $global:AzureCodeRuntime.appCommandLine = '' }
            'missing-build' { $global:AzureCodeBuildSettings = @() }
            'build-disabled' { $global:AzureCodeBuildSettings[0].value = 'false' }
            'wrong-build' { $global:AzureCodeBuildSettings[1].value = 'npm ci' }
            'duplicate-build' { $global:AzureCodeBuildSettings += $global:AzureCodeBuildSettings[0] }
            'run-from-package' { $global:AzureCodeBuildSettings += @{ name = 'WEBSITE_RUN_FROM_PACKAGE'; value = '1' } }
        }
        $message = ''
        try { & (Join-Path $PSScriptRoot '..\Deploy-AppServiceCode.ps1') @deploy -Apply | Out-Null } catch { $message = $_.Exception.Message }
        if ($scenario -ceq 'valid') {
            if ($global:AzureCodeWrites -ne 1 -or $message -notlike 'Deployment did not report success*') { throw 'Valid source-build configuration must reach the mocked deployment.' }
        } elseif ($global:AzureCodeWrites -ne 0 -or $message -eq '') {
            throw "Unsafe source-build scenario $scenario reached deployment."
        }
    }
    if ($BicepPath) {
        foreach ($templateName in @('resources', 'web')) {
            $templatePath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\templates\$templateName.bicep"))
            $compiledJson = & $BicepPath build $templatePath --no-restore --stdout
            if ($LASTEXITCODE -ne 0) { throw "Cannot compile $templateName." }
            $compiled = ($compiledJson -join "`n") | ConvertFrom-Json -AsHashtable
            $roleParameter = $compiled.parameters.runtimeRoleName
            if ($roleParameter.allowedValues.Count -ne 1 -or $roleParameter.allowedValues[0] -cne 'sunsum_runtime' -or
                $roleParameter.defaultValue -cne 'sunsum_runtime') { throw 'Compiled runtime-role allowlist must contain only sunsum_runtime.' }
            $templateParameters = @{}
            if ($templateName -ceq 'resources') {
                foreach ($entry in $provisionParameters.parameters.GetEnumerator()) { $templateParameters[$entry.Key] = $entry.Value.value }
            } else {
                $templateParameters = @{
                    location = 'centralus'; planName = 'sample-plan'; webAppName = 'sample-web'
                    databaseHost = 'sample-postgres.postgres.database.azure.com'; databaseName = 'sunsum'
                    blobEndpoint = 'https://samplestorage.blob.core.windows.net/'
                }
            }
            $relativeTemplate = [System.IO.Path]::GetRelativePath($fixture, $templatePath).Replace('\', '/')
            foreach ($roleName in @('omitted', 'sunsum_runtime', '') + $rejectedRoles) {
                $null = $templateParameters.Remove('runtimeRoleName')
                if ($roleName -cne 'omitted') { $templateParameters.runtimeRoleName = $roleName }
                $lines = @("using '$relativeTemplate'") + @($templateParameters.GetEnumerator() | ForEach-Object { "param $($_.Key) = '$($_.Value)'" })
                $inputPath = Join-Path $fixture 'runtime-role.bicepparam'
                $outputPath = Join-Path $fixture 'runtime-role.json'
                if (Test-Path -LiteralPath $outputPath) { Remove-Item -LiteralPath $outputPath }
                Set-Content -LiteralPath $inputPath -Value $lines -Encoding utf8NoBOM
                $diagnostics = & $BicepPath build-params $inputPath --no-restore --outfile $outputPath 2>&1
                if ($roleName -cin @('omitted', 'sunsum_runtime')) {
                    if ($LASTEXITCODE -ne 0) { throw "Valid runtime role failed: $diagnostics" }
                } elseif ($LASTEXITCODE -eq 0 -or ($diagnostics -join "`n") -notlike '*sunsum_runtime*') {
                    throw "Unsupported runtime role did not fail template validation: $diagnostics"
                }
            }
        }
        Write-Output 'Runtime role template guards passed: both compiled allowlists and 18 parameter cases.'
    }
    $zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Update)
    try { $null = $zip.CreateEntry('.env') } finally { $zip.Dispose() }
    Assert-Throws { & (Join-Path $PSScriptRoot '..\Test-AppServicePackage.ps1') -Path $zipPath } 'Accepted a tampered archive.'
} finally {
    Remove-Item -LiteralPath Function:\az -ErrorAction SilentlyContinue
    Remove-Variable -Name AzureSafetyTestCalls -Scope Global -ErrorAction SilentlyContinue
    Remove-Variable -Name AzureProvisionInventory, AzureProvisionExitCode, AzureProvisionWrites -Scope Global -ErrorAction SilentlyContinue
    Remove-Variable -Name AzureExistingWeb, AzureWebReadFailure, AzureWebReads, AzureAvailabilityFailureType, AzureAvailabilityResponse, AzureAvailabilityExitCode, AzureAvailabilityChecks -Scope Global -ErrorAction SilentlyContinue
    Remove-Variable -Name AzureCodeWrites, AzureCodeReadFailure, AzureCodeRuntime, AzureCodeBuildSettings -Scope Global -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force }
}
Write-Output 'Deployment safety: IPv4, real ZIP exclusion/tamper checks and target-bound approval checks passed.'
exit 0
