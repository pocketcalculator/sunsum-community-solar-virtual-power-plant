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
    $snapshot = New-DeploymentSnapshot -Path $zipPath -ExpectedSha256 $package.SHA256.ToLowerInvariant()
    $snapshotDirectory = $snapshot.Directory
    try {
        if ($snapshot.Path -ceq $package.Path) { throw 'A deployment snapshot must not reuse the source path.' }
        Assert-DeploymentSnapshot $snapshot
        $global:SnapshotHashFailurePath = $snapshot.Path
        function global:Get-FileHash {
            param($LiteralPath, $Algorithm, $ErrorAction)
            if ($LiteralPath -ceq $global:SnapshotHashFailurePath) { return @{ Hash = '0' * 64 } }
            Microsoft.PowerShell.Utility\Get-FileHash -LiteralPath $LiteralPath -Algorithm $Algorithm -ErrorAction Stop
        }
        try {
            Assert-Throws { Assert-DeploymentSnapshot $snapshot } 'A changed snapshot digest must fail.'
            $global:SnapshotHashFailurePath = $snapshot.SourcePath
            Assert-Throws { Assert-DeploymentSnapshot $snapshot } 'A changed source digest must fail.'
        } finally {
            Remove-Item Function:\Get-FileHash -Force
            Remove-Variable SnapshotHashFailurePath -Scope Global
        }
    } finally { Remove-DeploymentSnapshot $snapshot }
    if (Test-Path -LiteralPath $snapshotDirectory) { throw 'Snapshot cleanup must remove the temporary directory.' }
    $linkedRoot = Join-Path $fixture 'linked-source'
    $linkType = if ($IsWindows) { 'Junction' } else { 'SymbolicLink' }
    $null = New-Item -ItemType $linkType -Path $linkedRoot -Target ([System.IO.Path]::GetFullPath($source))
    try {
        $linkedZip = Join-Path $fixture 'linked-source.zip'
        $message = ''
        try { & (Join-Path $PSScriptRoot '..\New-AppServicePackage.ps1') -SourceRoot $linkedRoot -OutputPath $linkedZip | Out-Null } catch { $message = $_.Exception.Message }
        if ($message -notlike '*source root must be a directory*' -or (Test-Path -LiteralPath $linkedZip)) {
            throw 'A linked source root was not rejected before packaging.'
        }
    } finally { Remove-Item -LiteralPath $linkedRoot -Force }
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
    foreach ($mode in @('Existing', 'Create')) {
        $provisionParameters.parameters.webAppMode = @{ value = $mode }
        foreach ($databaseName in @('sunsum-prod', 'postgres', 'public', 'template0', 'template1', 'pg_custom', 'azure_custom',
            'SunSum', '_sunsum', '1sunsum', 'sunsum.prod', 'sunsum prod', ('a' * 64), ('db' + [char]0xe9),
            '', ' sunsum', 'sunsum ', "sunsum`n", 'app;drop', 123, $null)) {
            $provisionParameters.parameters.databaseName = @{ value = $databaseName }
            $provisionParameters | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $provisionPath -Encoding utf8NoBOM
            $provision.ExpectedSha256 = (Get-FileHash -LiteralPath $provisionPath -Algorithm SHA256).Hash
            foreach ($apply in @($false, $true)) {
                $message = ''
                try { & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision -Apply:$apply | Out-Null } catch { $message = $_.Exception.Message }
                if ($message -eq '' -or $global:AzureSafetyTestCalls -ne 0) { throw 'Invalid database names must fail before any Azure call.' }
                if ($databaseName -ceq 'sunsum-prod' -and $message -notlike '*databaseName must match the bootstrap contract*') { throw 'Expected the database-name preflight rejection.' }
            }
        }
        foreach ($databaseName in @('a', 'sunsum', 'sunsum_prod', 'app123', ('a' * 63))) {
            $provisionParameters.parameters.databaseName = @{ value = $databaseName }
            $provisionParameters | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $provisionPath -Encoding utf8NoBOM
            $provision.ExpectedSha256 = (Get-FileHash -LiteralPath $provisionPath -Algorithm SHA256).Hash
            & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision | Out-Null
        }
    }
    $provisionParameters.parameters.Remove('databaseName')
    $provisionParameters.parameters.Remove('webAppMode')
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
    $approvalHash = (Get-FileHash -LiteralPath $approvalPath -Algorithm SHA256).Hash
    & (Join-Path $PSScriptRoot '..\Set-PostgresFirewall.ps1') @target `
        -ApprovalFile $approvalPath -ExpectedSha256 $approvalHash.ToLowerInvariant() -OutputPath $parametersPath | Out-Null
    $parameters = Get-Content -LiteralPath $parametersPath -Raw | ConvertFrom-Json -AsHashtable
    if ($parameters.parameters.approvedIpv4Addresses.value.Count -ne 1 -or
        $parameters.parameters.approvalReference.value -cne $approval.approvalReference) {
        throw 'Network parameter generation lost the exact address array or approval reference.'
    }
    $recordHash = (Get-FileHash -LiteralPath $parametersPath -Algorithm SHA256).Hash
    Assert-Throws {
        & (Join-Path $PSScriptRoot '..\Set-PostgresFirewall.ps1') @target -ApprovalFile $approvalPath `
            -ExpectedSha256 $approvalHash -OutputPath $parametersPath -Apply
    } 'An existing firewall review record was overwritten.'
    if ((Get-FileHash -LiteralPath $parametersPath -Algorithm SHA256).Hash -cne $recordHash) {
        throw 'An existing firewall review record changed.'
    }
    Assert-Throws {
        & (Join-Path $PSScriptRoot '..\Set-PostgresFirewall.ps1') @target -ApprovalFile $approvalPath `
            -ExpectedSha256 'not-a-sha256' -OutputPath (Join-Path $fixture 'invalid-hash.json') -Apply
    } 'Accepted a malformed reviewed hash.'
    $changedApproval = $approval.Clone()
    $changedApproval.approvedIpv4Addresses = @('8.8.8.8')
    $changedApproval | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $approvalPath -Encoding utf8NoBOM
    foreach ($apply in @($false, $true)) {
        $rejectedOutput = Join-Path $fixture "changed-firewall-$apply.json"
        $message = ''
        try {
            & (Join-Path $PSScriptRoot '..\Set-PostgresFirewall.ps1') @target -ApprovalFile $approvalPath `
                -ExpectedSha256 $approvalHash -OutputPath $rejectedOutput -Apply:$apply | Out-Null
        } catch { $message = $_.Exception.Message }
        if ($message -notlike '*no longer matches its reviewed hash*' -or
            (Test-Path -LiteralPath $rejectedOutput) -or $global:AzureSafetyTestCalls -ne 0) {
            throw 'A changed valid IP list with the same approval reference must fail before output or Azure calls.'
        }
    }
    $approval | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $approvalPath -Encoding utf8NoBOM
    $global:FirewallApprovalMutationPath = $approvalPath
    $global:FirewallApprovalMutationContent = $changedApproval | ConvertTo-Json -Depth 4
    function global:New-Item {
        param($ItemType, $Path, [switch] $Force)
        [System.IO.File]::WriteAllText($global:FirewallApprovalMutationPath, $global:FirewallApprovalMutationContent)
        Microsoft.PowerShell.Management\New-Item -ItemType $ItemType -Path $Path -Force:$Force
    }
    try {
        $message = ''
        try {
            & (Join-Path $PSScriptRoot '..\Set-PostgresFirewall.ps1') @target -ApprovalFile $approvalPath `
                -ExpectedSha256 $approvalHash -OutputPath (Join-Path $fixture 'late-change.parameters.json') -Apply | Out-Null
        } catch { $message = $_.Exception.Message }
        if ($message -notlike '*changed before deployment*' -or $global:AzureSafetyTestCalls -ne 0) {
            throw 'Approval drift after parsing must be rejected immediately before deployment.'
        }
    } finally {
        Remove-Item Function:\New-Item -Force
        Remove-Variable FirewallApprovalMutationPath, FirewallApprovalMutationContent -Scope Global
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
            -ExpectedSha256 (Get-FileHash -LiteralPath $approvalPath -Algorithm SHA256).Hash `
            -OutputPath (Join-Path $fixture 'invalid.parameters.json') -Apply
    } 'Accepted unsafe network input with -Apply.'
    if ($global:AzureSafetyTestCalls -ne 0) { throw 'A local-only or invalid-input path called Azure.' }
    $approval | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $approvalPath -Encoding utf8BOM
    $approvalHash = (Get-FileHash -LiteralPath $approvalPath -Algorithm SHA256).Hash
    function global:Get-FileHash {
        param($LiteralPath, $Algorithm)
        if ($LiteralPath.EndsWith('mismatched-firewall.parameters.json')) { return @{ Hash = '0' * 64 } }
        Microsoft.PowerShell.Utility\Get-FileHash -LiteralPath $LiteralPath -Algorithm $Algorithm
    }
    try {
        $message = ''
        try {
            & (Join-Path $PSScriptRoot '..\Set-PostgresFirewall.ps1') @target -ApprovalFile $approvalPath `
                -ExpectedSha256 $approvalHash -OutputPath (Join-Path $fixture 'mismatched-firewall.parameters.json') -Apply | Out-Null
        } catch { $message = $_.Exception.Message }
        if ($message -notlike '*Generated firewall parameters changed*' -or $global:AzureSafetyTestCalls -ne 0) {
            throw 'A generated-parameter hash mismatch must abort before Azure calls.'
        }
    } finally { Remove-Item Function:\Get-FileHash -Force }
    function global:az {
        $global:AzureSafetyTestCalls++
        if (($args[0..2] -join ' ') -cne 'deployment group create' -or
            $args[[array]::IndexOf($args, '--subscription') + 1] -cne '11111111-1111-4111-8111-111111111111' -or
            $args[[array]::IndexOf($args, '--resource-group') + 1] -cne 'sample-resource-group' -or
            $args[[array]::IndexOf($args, '--mode') + 1] -cne 'Incremental') {
            throw 'Firewall apply was not bound to the reviewed target and incremental operation.'
        }
        $parameterArgument = [string]$args[[array]::IndexOf($args, '--parameters') + 1]
        if (-not $parameterArgument.StartsWith('@')) { throw 'Expected the generated firewall parameter file.' }
        $filePath = $parameterArgument.Substring(1)
        $document = Get-Content -LiteralPath $filePath -Raw | ConvertFrom-Json -AsHashtable
        if ($document.parameters.postgresServerName.value -cne 'sample-postgres' -or
            $document.parameters.approvalReference.value -cne 'review-123' -or
            $document.parameters.approvedIpv4Addresses.value.Count -ne 1 -or
            $document.parameters.approvedIpv4Addresses.value[0] -cne '20.30.40.50') {
            throw 'Firewall apply did not consume the verified approval snapshot.'
        }
        if ($IsWindows) {
            Assert-Throws {
                $writer = [System.IO.File]::OpenWrite($filePath)
                $writer.Dispose()
            } 'Generated parameters must deny concurrent writes during deployment on Windows.'
        }
        $global:LASTEXITCODE = if ($global:AzureSafetyTestCalls -eq 1) { 0 } else { 1 }
    }
    foreach ($outcome in @('success', 'failure')) {
        $applyPath = Join-Path $fixture "firewall-apply-$outcome.json"
        $message = ''
        try {
            & (Join-Path $PSScriptRoot '..\Set-PostgresFirewall.ps1') @target -ApprovalFile $approvalPath `
                -ExpectedSha256 $approvalHash -OutputPath $applyPath -Apply | Out-Null
        } catch { $message = $_.Exception.Message }
        if (($outcome -eq 'success' -and $message -ne '') -or
            ($outcome -eq 'failure' -and $message -notlike '*Firewall deployment failed*')) {
            throw "Unexpected firewall $outcome result: $message"
        }
        $released = [System.IO.File]::Open($applyPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
        $released.Dispose()
    }
    if ($global:AzureSafetyTestCalls -ne 2) { throw 'Expected exactly two mocked firewall deployments.' }
    $global:AzureSafetyTestCalls = 0
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
    $global:AzureProvisionSnapshotPath = ''
    $global:AzureProvisionOriginalPath = [System.IO.Path]::GetFullPath($provisionPath)
    $global:AzureProvisionExpectedHash = ''
    $global:AzureProvisionChange = $false
    $global:AzureProvisionChanged = $false
    $global:AzureProvisionFailure = $false
    function global:az {
        $global:AzureSafetyTestCalls++
        if ($args[0] -ceq 'resource' -and $args[1] -ceq 'list') {
            if ($global:AzureProvisionChange) {
                $replacement = "$global:AzureProvisionOriginalPath.replacement"
                $changed = Get-Content -LiteralPath $global:AzureProvisionOriginalPath -Raw | ConvertFrom-Json -AsHashtable
                $changed.parameters.postgresServerName.value = 'unreviewed-postgres'
                [System.IO.File]::WriteAllText($replacement, ($changed | ConvertTo-Json -Depth 5))
                try {
                    [System.IO.File]::Move($replacement, $global:AzureProvisionOriginalPath, $true)
                    $global:AzureProvisionChanged = $true
                } catch [System.IO.IOException], [System.UnauthorizedAccessException] {
                    if (-not $IsWindows) { throw }
                } finally {
                    if (Test-Path -LiteralPath $replacement) { Remove-Item -LiteralPath $replacement }
                }
            }
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
            $parameterArgument = [string]$args[[array]::IndexOf($args, '--parameters') + 1]
            if (-not $parameterArgument.StartsWith('@')) { throw 'Expected snapshotted provisioning parameters.' }
            $global:AzureProvisionSnapshotPath = $parameterArgument.Substring(1)
            if ($global:AzureProvisionSnapshotPath -ceq $global:AzureProvisionOriginalPath -or
                (Get-FileHash -LiteralPath $global:AzureProvisionSnapshotPath -Algorithm SHA256).Hash -ine $global:AzureProvisionExpectedHash) {
                throw 'Provisioning must deploy the reviewed snapshot, not the mutable input path.'
            }
            if ($IsWindows) {
                foreach ($protectedPath in @($global:AzureProvisionOriginalPath, $global:AzureProvisionSnapshotPath)) {
                    Assert-Throws { $writer = [System.IO.File]::OpenWrite($protectedPath); $writer.Dispose() } 'Provisioning inputs must remain protected during deployment.'
                }
            }
            $global:AzureProvisionWrites++
            $global:LASTEXITCODE = if ($global:AzureProvisionFailure) { 1 } else { 0 }
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
        $global:AzureProvisionExpectedHash = $provision.ExpectedSha256
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
        if (Test-Path -LiteralPath (Split-Path -Parent $global:AzureProvisionSnapshotPath)) { throw 'Provisioning must clean up its snapshot on success.' }
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
        $originalParameters = [System.IO.File]::ReadAllBytes($provisionPath)
        $global:AzureProvisionChange = $true
        $global:AzureProvisionChanged = $false
        $global:AzureProvisionWrites = 0
        $message = ''
        try {
            & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision -Apply | Out-Null
        } catch { $message = $_.Exception.Message }
        finally {
            $global:AzureProvisionChange = $false
            [System.IO.File]::WriteAllBytes($provisionPath, $originalParameters)
        }
        if ($global:AzureProvisionChanged) {
            if ($global:AzureProvisionWrites -ne 0 -or $message -notlike '*no longer matches the reviewed SHA-256*') { throw 'Changed provisioning parameters reached ARM.' }
        } elseif ($global:AzureProvisionWrites -ne 1 -or $message -ne '') { throw "A denied replacement should leave only the approved deployment: $message (writes=$global:AzureProvisionWrites)." }
        $global:AzureProvisionFailure = $true
        $message = ''
        try { & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision -Apply | Out-Null } catch { $message = $_.Exception.Message }
        $global:AzureProvisionFailure = $false
        if ($message -notlike '*Provisioning did not report success*' -or
            (Test-Path -LiteralPath (Split-Path -Parent $global:AzureProvisionSnapshotPath))) { throw 'Failed provisioning must clean up its snapshot and report failure.' }
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
    $global:AzureCodeKind = 'app,linux'
    $global:AzureCodeHelp = '--track-status --clean'
    $global:AzureCodeChange = $false
    $global:AzureCodeChanged = $false
    function global:az {
        $global:LASTEXITCODE = 0
        if ($args -contains '--help') {
            if ($global:AzureCodeChange) {
                $replacement = "$global:AzureCodeOriginalPath.replacement"
                [System.IO.File]::Copy($global:AzureCodeOriginalPath, $replacement)
                $archive = [System.IO.Compression.ZipFile]::Open($replacement, [System.IO.Compression.ZipArchiveMode]::Update)
                try { $null = $archive.CreateEntry('app/unreviewed.ts') } finally { $archive.Dispose() }
                try {
                    [System.IO.File]::Move($replacement, $global:AzureCodeOriginalPath, $true)
                    $global:AzureCodeChanged = $true
                } catch [System.IO.IOException], [System.UnauthorizedAccessException] {
                    if (-not $IsWindows) { throw }
                } finally {
                    if (Test-Path -LiteralPath $replacement) { Remove-Item -LiteralPath $replacement }
                }
            }
            return $global:AzureCodeHelp
        }
        if ($args[0] -ceq 'webapp' -and $args[1] -ceq 'show') {
            return (@{ id = 'synthetic-test-resource'; host = 'sample-web.azurewebsites.net'; httpsOnly = $true; kind = $global:AzureCodeKind } | ConvertTo-Json)
        }
        if ($args[0] -ceq 'resource' -and $args[1] -ceq 'show') { return 'false' }
        if ($args[0] -ceq 'webapp' -and $args[1] -ceq 'config') {
            if ($global:AzureCodeReadFailure) { $global:LASTEXITCODE = 1; return '' }
            if ($args[2] -ceq 'show') { return ($global:AzureCodeRuntime | ConvertTo-Json) }
            return (ConvertTo-Json -InputObject $global:AzureCodeBuildSettings -Depth 5)
        }
        if ($args[0] -ceq 'webapp' -and $args[1] -ceq 'deploy') {
            if ($args -notcontains '--clean' -or $args[[array]::IndexOf($args, '--clean') + 1] -cne 'true') {
                throw 'Source ZIP upload must explicitly request target cleanup.'
            }
            $global:AzureCodeSnapshotPath = [string]$args[[array]::IndexOf($args, '--src-path') + 1]
            if ($global:AzureCodeSnapshotPath -ceq $global:AzureCodeOriginalPath -or
                (Get-FileHash -LiteralPath $global:AzureCodeSnapshotPath -Algorithm SHA256).Hash -ine $global:AzureCodeExpectedHash) {
                throw 'Source ZIP upload must consume a separate hash-verified snapshot.'
            }
            if ($IsWindows) {
                foreach ($protectedPath in @($global:AzureCodeOriginalPath, $global:AzureCodeSnapshotPath)) {
                    Assert-Throws { $writer = [System.IO.File]::OpenWrite($protectedPath); $writer.Dispose() } 'ZIP inputs must remain protected during upload.'
                }
            }
            $global:AzureCodeWrites++
            $global:LASTEXITCODE = 1
            return
        }
        throw 'Unexpected code deployment command.'
    }
    $deploy.ExpectedSha256 = $package.SHA256
    $global:AzureCodeOriginalPath = $package.Path
    $global:AzureCodeExpectedHash = $package.SHA256
    $global:AzureCodeSnapshotPath = ''
    foreach ($scenario in @('function-app', 'wrong-kind', 'mixed-function-kind', 'no-clean-support', 'no-track-support', 'missing-runtime', 'wrong-node', 'wrong-startup', 'missing-build', 'build-disabled', 'wrong-build', 'duplicate-build', 'run-from-package', 'read-failure', 'valid')) {
        $global:AzureCodeWrites = 0
        $global:AzureCodeKind = 'app,linux'
        $global:AzureCodeHelp = '--track-status --clean'
        $global:AzureCodeReadFailure = $scenario -ceq 'read-failure'
        $global:AzureCodeRuntime = @{ linuxFxVersion = 'NODE|22-lts'; appCommandLine = 'npm run start -- --hostname 0.0.0.0'; minTlsVersion = '1.2'; scmMinTlsVersion = '1.2' }
        $global:AzureCodeBuildSettings = @(
            @{ name = 'SCM_DO_BUILD_DURING_DEPLOYMENT'; value = 'true' },
            @{ name = 'CUSTOM_BUILD_COMMAND'; value = 'npm ci --include=dev && npm run build' }
        )
        switch ($scenario) {
            'function-app' { $global:AzureCodeKind = 'functionapp,linux' }
            'wrong-kind' { $global:AzureCodeKind = 'app,linux-extra' }
            'mixed-function-kind' { $global:AzureCodeKind = 'app,functionapp,linux' }
            'no-clean-support' { $global:AzureCodeHelp = '--track-status' }
            'no-track-support' { $global:AzureCodeHelp = '--clean' }
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
            if (Test-Path -LiteralPath (Split-Path -Parent $global:AzureCodeSnapshotPath)) { throw 'The ZIP snapshot must be removed after deployment failure.' }
        } elseif ($global:AzureCodeWrites -ne 0 -or $message -eq '') {
            throw "Unsafe source-build scenario $scenario reached deployment."
        }
    }
    foreach ($property in @('minTlsVersion', 'scmMinTlsVersion')) {
        foreach ($value in @('1.0', '1.1', $null, '', 'TLS1_2', 'unknown', 1.2, 'missing')) {
            $global:AzureCodeRuntime = @{ linuxFxVersion = 'NODE|22-lts'; appCommandLine = 'npm run start -- --hostname 0.0.0.0'; minTlsVersion = '1.2'; scmMinTlsVersion = '1.2' }
            if ($value -ceq 'missing') { $global:AzureCodeRuntime.Remove($property) } else { $global:AzureCodeRuntime[$property] = $value }
            $global:AzureCodeWrites = 0
            $message = ''
            try { & (Join-Path $PSScriptRoot '..\Deploy-AppServiceCode.ps1') @deploy -Apply | Out-Null } catch { $message = $_.Exception.Message }
            if ($global:AzureCodeWrites -ne 0 -or $message -notlike '*requires site and SCM minimum TLS*') { throw 'Unsafe site/SCM TLS reached ZIP deployment.' }
        }
    }
    foreach ($siteTls in @('1.2', '1.3')) {
        foreach ($scmTls in @('1.2', '1.3')) {
            $global:AzureCodeRuntime = @{ linuxFxVersion = 'NODE|22-lts'; appCommandLine = 'npm run start -- --hostname 0.0.0.0'; minTlsVersion = $siteTls; scmMinTlsVersion = $scmTls }
            $global:AzureCodeWrites = 0
            $message = ''
            try { & (Join-Path $PSScriptRoot '..\Deploy-AppServiceCode.ps1') @deploy -Apply | Out-Null } catch { $message = $_.Exception.Message }
            if ($global:AzureCodeWrites -ne 1 -or $message -notlike 'Deployment did not report success*') { throw 'Supported site/SCM TLS should reach the mocked deployment.' }
        }
    }
    $originalArchive = [System.IO.File]::ReadAllBytes($zipPath)
    $global:AzureCodeChange = $true
    $global:AzureCodeWrites = 0
    $message = ''
    try { & (Join-Path $PSScriptRoot '..\Deploy-AppServiceCode.ps1') @deploy -Apply | Out-Null } catch { $message = $_.Exception.Message }
    finally {
        $global:AzureCodeChange = $false
        [System.IO.File]::WriteAllBytes($zipPath, $originalArchive)
    }
    if ($global:AzureCodeChanged) {
        if ($global:AzureCodeWrites -ne 0 -or $message -notlike '*no longer matches the reviewed SHA-256*') { throw 'An unreviewed replacement ZIP reached upload.' }
    } elseif ($global:AzureCodeWrites -ne 1 -or $message -notlike 'Deployment did not report success*') { throw 'A denied ZIP replacement must leave only the verified snapshot for upload.' }
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
    Remove-Variable -Name AzureProvisionSnapshotPath, AzureProvisionOriginalPath, AzureProvisionExpectedHash -Scope Global -ErrorAction SilentlyContinue
    Remove-Variable -Name AzureProvisionChange, AzureProvisionChanged, AzureProvisionFailure -Scope Global -ErrorAction SilentlyContinue
    Remove-Variable -Name AzureExistingWeb, AzureWebReadFailure, AzureWebReads, AzureAvailabilityFailureType, AzureAvailabilityResponse, AzureAvailabilityExitCode, AzureAvailabilityChecks -Scope Global -ErrorAction SilentlyContinue
    Remove-Variable -Name AzureCodeWrites, AzureCodeReadFailure, AzureCodeRuntime, AzureCodeBuildSettings -Scope Global -ErrorAction SilentlyContinue
    Remove-Variable -Name AzureCodeKind, AzureCodeHelp -Scope Global -ErrorAction SilentlyContinue
    Remove-Variable -Name AzureCodeOriginalPath, AzureCodeExpectedHash, AzureCodeSnapshotPath -Scope Global -ErrorAction SilentlyContinue
    Remove-Variable -Name AzureCodeChange, AzureCodeChanged -Scope Global -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force }
}
Write-Output 'Deployment safety: IPv4, real ZIP exclusion/tamper checks and target-bound approval checks passed.'
exit 0
