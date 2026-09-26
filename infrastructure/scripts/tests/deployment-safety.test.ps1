#requires -Version 7.2
[CmdletBinding()]
param([string] $BicepPath)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot '..\DeploymentSafety.psm1') -Force

function Assert-Throws([scriptblock] $Action, [string] $Message, [string] $ExpectedMessage) {
    $threw = $false
    try { & $Action | Out-Null } catch {
        $threw = $true
        if ($ExpectedMessage -and $_.Exception.Message -cne $ExpectedMessage) {
            throw "Wrong failure for '$Message': $($_.Exception.Message)"
        }
    }
    if (-not $threw) { throw $Message }
}

function Assert-TestFileReleased([string] $Path) {
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    try {
        if (-not $stream.CanWrite) { throw "The fixture is not writable after snapshot cleanup: $Path" }
    } finally { $stream.Dispose() }
}

function New-TestJsonFixture([string] $Directory, [hashtable] $Value) {
    $path = Join-Path $Directory "input-$([guid]::NewGuid().ToString('N')).json"
    $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes(($Value | ConvertTo-Json -Depth 5) + [Environment]::NewLine)
    $stream = [System.IO.File]::Open($path, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
    return $path
}

function Update-TestDeploymentApproval([hashtable] $Arguments, [string] $Operation) {
    $record = @{
        operation = $Operation; subscriptionId = $Arguments.SubscriptionId; resourceGroupName = $Arguments.ResourceGroupName
        payloadSha256 = $Arguments.ExpectedSha256; approvalReference = $Arguments.ApprovalReference
    }
    if ($Operation -eq 'CodeDeployment') {
        $record.webAppName = $Arguments.WebAppName
        $record.expectedAccessMode = 'Preview'
    } else {
        $record.databaseBudgetApproval = $Arguments.DatabaseBudgetApproval
        $record.storageBudgetApproval = $Arguments.StorageBudgetApproval
    }
    if (Test-Path -LiteralPath $Arguments.ApprovalPath) { Assert-TestFileReleased $Arguments.ApprovalPath }
    $Arguments.ApprovalPath = New-TestJsonFixture -Directory (Split-Path -Parent $Arguments.ApprovalPath) -Value $record
    $Arguments.ApprovalSha256 = (Get-FileHash -LiteralPath $Arguments.ApprovalPath -Algorithm SHA256).Hash
}

function Test-DeploymentApprovalRejections([hashtable] $Arguments, [string] $ScriptPath) {
    $originalPath = $Arguments.ApprovalPath
    $originalHash = $Arguments.ApprovalSha256
    $record = Get-Content -LiteralPath $Arguments.ApprovalPath -Raw | ConvertFrom-Json -AsHashtable
    try {
        foreach ($key in $record.Keys) {
            $changed = $record.Clone()
            $changed[$key] = 'unreviewed-value'
            $Arguments.ApprovalPath = New-TestJsonFixture -Directory (Split-Path -Parent $originalPath) -Value $changed
            $Arguments.ApprovalSha256 = (Get-FileHash -LiteralPath $Arguments.ApprovalPath -Algorithm SHA256).Hash
            foreach ($apply in @($false, $true)) {
                $message = ''
                try { & $ScriptPath @Arguments -Apply:$apply | Out-Null } catch { $message = $_.Exception.Message }
                if ($message -notlike '*Deployment approval does not match*' -or $global:AzureSafetyTestCalls -ne 0) {
                    throw "Unbound deployment approval field reached Azure or bypassed the review check: $key."
                }
                Assert-TestFileReleased $Arguments.ApprovalPath
            }
        }
        $Arguments.ApprovalSha256 = $originalHash
        $message = ''
        try { & $ScriptPath @Arguments -Apply | Out-Null } catch { $message = $_.Exception.Message }
        if ($message -notlike '*no longer matches the reviewed SHA-256*') { throw 'A changed approval file retained its old reviewed digest.' }
        Assert-TestFileReleased $Arguments.ApprovalPath
    } finally {
        $Arguments.ApprovalPath = $originalPath
        $Arguments.ApprovalSha256 = $originalHash
    }
    if ((Get-FileHash -LiteralPath $originalPath -Algorithm SHA256).Hash -cne $originalHash) {
        throw 'Independent rejection fixtures changed the original approval.'
    }
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

foreach ($name in @(
    'package.json', 'package-lock.json', 'next.config.ts', 'app/page.tsx', 'src/backend/database.ts',
    'src/backend/infrastructure/database/credentials.ts', 'public/icon.svg',
    'public/audio/need.mp3', 'public/audio/opportunity.mp3', 'public/audio/impact.mp3', 'AUDIO-CREDITS.txt'
)) {
    if (-not (Test-AppServiceArchivePath $name)) { throw "Rejected expected archive entry: $name" }
}
foreach ($name in @(
    '.env', '.env.production', '.azure/config.json', 'tooling/setup.ts',
    'node_modules/pg/index.js', '.next/server/app.js',
    '.git/config', '.npmrc', 'tests/unit/test.ts', 'src/.env.local',
    'src/secrets/token.json', 'src/credentials/service.json', 'public/credentials.json', 'src/config.local.json',
    'src/cert.pem', 'src/x.test.ts', 'src/__tests__/x.ts',
    '../package.json', '/package.json', 'app/../.env', 'app\\page.tsx',
    'public/audio/Need.mp3', 'public/audio/need.MP3', 'public/audio/other.mp3',
    'public/uploads/need.mp3', 'src/audio/need.mp3', 'public/audio/../need.mp3',
    'public/audio/private/impact.mp3', 'public/audio/need.mp3.key',
    'audio-credits.txt', 'docs/ws1/audio-credits.txt'
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
    foreach ($directory in @(
        'app', 'src', 'src\secrets', 'src\features\participation\content',
        'public\audio', 'docs\ws1', 'node_modules', '.azure', 'tooling'
    )) {
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
    $tracks = @{}
    foreach ($topic in @('need', 'opportunity', 'impact')) {
        $audioPath = Join-Path $source "public\audio\$topic.mp3"
        [System.IO.File]::WriteAllBytes($audioPath, [System.Text.Encoding]::UTF8.GetBytes("synthetic-package-audio:$topic"))
        $tracks[$topic] = @{
            path = "audio/$topic.mp3"; title = "$topic packaging fixture"; attribution = 'Synthetic test bytes, not a recording.'
            mime = 'audio/mpeg'; bytes = (Get-Item -LiteralPath $audioPath).Length
            sha256 = (Get-FileHash -LiteralPath $audioPath -Algorithm SHA256).Hash
            durationSeconds = 1; sampleRateHz = 44100; channels = 1
        }
    }
    @{ schemaVersion = 1; tracks = $tracks } | ConvertTo-Json -Depth 5 |
        Set-Content -LiteralPath (Join-Path $source 'src\features\participation\content\pageAudioAssets.json') -Encoding utf8NoBOM
    $credits = @('THIRD-PARTY AUDIO - NOT COVERED BY THE MIT CODE LICENSE', 'Synthetic packaging fixtures, not recordings.')
    foreach ($topic in @('need', 'opportunity', 'impact')) {
        $credits += @($tracks[$topic].title, $tracks[$topic].attribution)
    }
    $credits | Set-Content -LiteralPath (Join-Path $source 'docs\ws1\audio-credits.txt') -Encoding utf8NoBOM
    $zipPath = Join-Path $fixture 'package.zip'
    $package = & (Join-Path $PSScriptRoot '..\New-AppServicePackage.ps1') -SourceRoot $source -OutputPath $zipPath
    if ($package.Files -ne 11 -or $package.SHA256 -notmatch '^[A-F0-9]{64}$' -or $package.Audio.Count -ne 3) {
        throw 'The real packaging script did not enforce its source allowlist.'
    }
    $snapshot = New-DeploymentSnapshot -Path $zipPath -ExpectedSha256 $package.SHA256.ToLowerInvariant()
    foreach ($wrongName in @('Package.json', 'package-Lock.json', 'Tsconfig.json', 'app/Layout.tsx', 'APP/layout.tsx', 'collision')) {
        $caseZip = Join-Path $fixture "$([guid]::NewGuid().ToString('N')).zip"
        Copy-Item -LiteralPath $zipPath -Destination $caseZip
        $archive = [System.IO.Compression.ZipFile]::Open($caseZip, [System.IO.Compression.ZipArchiveMode]::Update)
        try {
            if ($wrongName -eq 'collision') {
                # Both names pass the path allowlist; only duplicate detection rejects this.
                $null = $archive.CreateEntry('app/Layout.tsx')
            } else {
                $required = @('package.json', 'package-lock.json', 'tsconfig.json', 'app/layout.tsx') |
                    Where-Object { $_ -ieq $wrongName }
                $original = $archive.GetEntry($required)
                if ($null -eq $original) { throw 'The valid casing fixture is missing its original entry.' }
                $content = [System.IO.MemoryStream]::new()
                try {
                    $entryStream = $original.Open()
                    try { $entryStream.CopyTo($content) } finally { $entryStream.Dispose() }
                    $original.Delete()
                    $output = $archive.CreateEntry($wrongName).Open()
                    try {
                        $content.Position = 0
                        $content.CopyTo($output)
                    } finally { $output.Dispose() }
                } finally { $content.Dispose() }
            }
        } finally { $archive.Dispose() }
        $expected = if ($wrongName -ceq 'app/Layout.tsx') {
            'Archive is missing required file with exact Linux casing: app/layout.tsx'
        } else {
            'Archive contains an unexpected, duplicate or unsafe path.'
        }
        Assert-Throws { & (Join-Path $PSScriptRoot '..\Test-AppServicePackage.ps1') -Path $caseZip } `
            'Wrong-case required files or case collisions were accepted.' $expected
    }
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
    $provisionPath = New-TestJsonFixture -Directory $fixture -Value $provisionParameters
    $provision = @{
        SubscriptionId = $target.subscriptionId
        ResourceGroupName = $target.resourceGroupName
        ParametersPath = $provisionPath
        ExpectedSha256 = (Get-FileHash -LiteralPath $provisionPath -Algorithm SHA256).Hash
        ApprovalReference = 'review-123'
        DatabaseBudgetApproval = 'budget-123'
        StorageBudgetApproval = 'storage-budget-123'
        ApprovalPath = Join-Path $fixture 'provision-approval.json'
    }
    Update-TestDeploymentApproval $provision ProvisionInfrastructure
    Test-DeploymentApprovalRejections $provision (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1')
    & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision | Out-Null
    Assert-TestFileReleased $provisionPath
    Assert-TestFileReleased $provision.ApprovalPath
    $rejectedRoles = @('postgres', 'azure_pg_admin', 'pg_read_all_data', 'sunsum_migrator', 'other_existing_role', 'SUNSUM_RUNTIME')
    foreach ($mode in @('Existing', 'Create')) {
        $provisionParameters.parameters.webAppMode = @{ value = $mode }
        foreach ($databaseName in @('sunsum-prod', 'postgres', 'public', 'template0', 'template1', 'pg_custom', 'azure_custom',
            'SunSum', '_sunsum', '1sunsum', 'sunsum.prod', 'sunsum prod', ('a' * 64), ('db' + [char]0xe9),
            '', ' sunsum', 'sunsum ', "sunsum`n", 'app;drop', 123, $null)) {
            $provisionParameters.parameters.databaseName = @{ value = $databaseName }
            $provisionPath = New-TestJsonFixture -Directory $fixture -Value $provisionParameters
            $provision.ParametersPath = $provisionPath
            $provision.ExpectedSha256 = (Get-FileHash -LiteralPath $provisionPath -Algorithm SHA256).Hash
            foreach ($apply in @($false, $true)) {
                $message = ''
                try { & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision -Apply:$apply | Out-Null } catch { $message = $_.Exception.Message }
                if ($message -eq '' -or $global:AzureSafetyTestCalls -ne 0) { throw 'Invalid database names must fail before any Azure call.' }
                if ($databaseName -ceq 'sunsum-prod' -and $message -notlike '*databaseName must match the bootstrap contract*') { throw 'Expected the database-name preflight rejection.' }
                Assert-TestFileReleased $provisionPath
            }
        }
        foreach ($databaseName in @('a', 'sunsum', 'sunsum_prod', 'app123', ('a' * 63))) {
            $provisionParameters.parameters.databaseName = @{ value = $databaseName }
            $provisionPath = New-TestJsonFixture -Directory $fixture -Value $provisionParameters
            $provision.ParametersPath = $provisionPath
            $provision.ExpectedSha256 = (Get-FileHash -LiteralPath $provisionPath -Algorithm SHA256).Hash
            Update-TestDeploymentApproval $provision ProvisionInfrastructure
            & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision | Out-Null
            Assert-TestFileReleased $provisionPath
            Assert-TestFileReleased $provision.ApprovalPath
        }
    }
    $provisionParameters.parameters.Remove('databaseName')
    $provisionParameters.parameters.Remove('webAppMode')
    foreach ($roleName in $rejectedRoles) {
        $provisionParameters.parameters.runtimeRoleName = @{ value = $roleName }
        $provisionPath = New-TestJsonFixture -Directory $fixture -Value $provisionParameters
        $provision.ParametersPath = $provisionPath
        $provision.ExpectedSha256 = (Get-FileHash -LiteralPath $provisionPath -Algorithm SHA256).Hash
        foreach ($apply in @($false, $true)) {
            $message = ''
            try { & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision -Apply:$apply | Out-Null } catch { $message = $_.Exception.Message }
            if ($message -notlike '*requires runtimeRoleName=sunsum_runtime*' -or $global:AzureSafetyTestCalls -ne 0) {
                throw 'An unsupported runtime role must be rejected before Azure calls.'
            }
            Assert-TestFileReleased $provisionPath
        }
    }
    $provisionParameters.parameters.runtimeRoleName = @{ value = 'sunsum_runtime' }
    $provisionPath = New-TestJsonFixture -Directory $fixture -Value $provisionParameters
    $provision.ParametersPath = $provisionPath
    $provision.ExpectedSha256 = (Get-FileHash -LiteralPath $provisionPath -Algorithm SHA256).Hash
    Update-TestDeploymentApproval $provision ProvisionInfrastructure
    & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision | Out-Null
    Assert-TestFileReleased $provisionPath
    $provision.ExpectedSha256 = '0' * 64
    Assert-Throws { & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision -Apply } 'Accepted changed provisioning parameters.'
    Assert-TestFileReleased $provisionPath
    $provisionParameters.parameters.webAppName.value = '<placeholder>'
    $provisionPath = New-TestJsonFixture -Directory $fixture -Value $provisionParameters
    $provision.ParametersPath = $provisionPath
    $provision.ExpectedSha256 = (Get-FileHash -LiteralPath $provisionPath -Algorithm SHA256).Hash
    Assert-Throws { & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision -Apply } 'Accepted placeholder provisioning parameters.'
    Assert-TestFileReleased $provisionPath
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
        ApprovalPath = Join-Path $fixture 'code-approval.json'
    }
    Update-TestDeploymentApproval $deploy CodeDeployment
    Test-DeploymentApprovalRejections $deploy (Join-Path $PSScriptRoot '..\Deploy-AppServiceCode.ps1')
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
    $global:AzurePlanId = '/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/sample-resource-group/providers/Microsoft.Web/serverfarms/sample-plan'
    $freePlan = @{ id = $global:AzurePlanId; sku = @{ name = 'F1'; tier = 'Free' } } | ConvertTo-Json -Depth 4 -Compress
    $global:AzurePlanResponse = $freePlan
    $global:AzurePlanReads = 0
    $invalidPlanLinks = @($null, '', 123, @('not-an-id'), 'missing',
        $global:AzurePlanId.Replace('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'),
        $global:AzurePlanId.Replace('Microsoft.Web', 'MicrosoftXWeb'), "$global:AzurePlanId/slots/extra")
    function Get-TestAppServicePlan([object[]] $Arguments) {
        if (($Arguments[0..2] -join ' ') -cne 'appservice plan show' -or
            $Arguments[[array]::IndexOf($Arguments, '--ids') + 1] -cne $global:AzurePlanId -or
            $Arguments[[array]::IndexOf($Arguments, '--subscription') + 1] -cne '11111111-1111-4111-8111-111111111111') {
            throw 'Plan inspection must be a read of the linked resource in the explicit subscription.'
        }
        $global:AzurePlanReads++
        $global:LASTEXITCODE = if ($global:AzurePlanResponse -eq 'read-failure') { 1 } else { 0 }
        return $global:AzurePlanResponse
    }
    $global:AzureExistingWeb = @{ id = '/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/sample-resource-group/providers/Microsoft.Web/sites/sample-web'; kind = 'app,linux'; httpsOnly = $true; defaultHostName = 'sample-web.azurewebsites.net'; serverFarmId = $global:AzurePlanId } | ConvertTo-Json -Compress
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
        if ($args[0] -ceq 'appservice') { return (Get-TestAppServicePlan $args) }
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
        $global:AzurePlanReads = 0
        $global:AzureWebReads = 0
        $global:AzureAvailabilityChecks = @()
        $provisionParameters.parameters.webAppMode = @{ value = $mode }
        $provisionPath = New-TestJsonFixture -Directory $fixture -Value $provisionParameters
        $provision.ParametersPath = $provisionPath
        $global:AzureProvisionOriginalPath = [System.IO.Path]::GetFullPath($provisionPath)
        $provision.ExpectedSha256 = (Get-FileHash -LiteralPath $provisionPath -Algorithm SHA256).Hash
        $global:AzureProvisionExpectedHash = $provision.ExpectedSha256
        Update-TestDeploymentApproval $provision ProvisionInfrastructure
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
        if ($global:AzurePlanReads -ne $(if ($mode -eq 'Existing') { 1 } else { 0 })) { throw 'Only Existing mode should inspect the existing linked plan.' }
        if (Test-Path -LiteralPath (Split-Path -Parent $global:AzureProvisionSnapshotPath)) { throw 'Provisioning must clean up its snapshot on success.' }
        Assert-TestFileReleased $provisionPath
        Assert-TestFileReleased $provision.ApprovalPath
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
        Assert-TestFileReleased $provisionPath
        Assert-TestFileReleased $provision.ApprovalPath
        if ($mode -ceq 'Existing') {
            foreach ($response in @($freePlan.Replace('F1', 'S1').Replace('Free', 'Standard'), $freePlan.Replace('F1', 'P1v3').Replace('Free', 'PremiumV3'),
                $freePlan.Replace('F1', 'B1'), $freePlan.Replace('Free', 'Shared'), $freePlan.Replace('sample-plan', 'wrong-plan'),
                '{}', '{"sku":null}', '[]', 'null', 'invalid-json', 'read-failure')) {
                $global:AzurePlanResponse = $response
                $global:AzurePlanReads = 0
                $global:AzureAvailabilityChecks = @()
                $global:AzureProvisionWrites = 0
                Assert-Throws { & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision -Apply } 'A paid or unknown plan permitted provisioning.'
                if ($global:AzurePlanReads -ne 1 -or $global:AzureProvisionWrites -ne 0 -or $global:AzureAvailabilityChecks.Count -ne 0) { throw 'Plan rejection must precede name checks and provisioning.' }
            }
            $global:AzurePlanResponse = $freePlan
            $validWeb = $global:AzureExistingWeb
            foreach ($link in $invalidPlanLinks) {
                $webWithInvalidPlan = $validWeb | ConvertFrom-Json -AsHashtable
                if ($link -ceq 'missing') { $webWithInvalidPlan.Remove('serverFarmId') } else { $webWithInvalidPlan.serverFarmId = $link }
                $global:AzureExistingWeb = $webWithInvalidPlan | ConvertTo-Json -Compress
                $global:AzurePlanReads = 0
                $global:AzureAvailabilityChecks = @()
                $global:AzureProvisionWrites = 0
                $message = ''
                try { & (Join-Path $PSScriptRoot '..\Provision-Infrastructure.ps1') @provision -Apply | Out-Null } catch { $message = $_.Exception.Message }
                if ($message -notlike '*must identify its App Service plan*' -or $global:AzurePlanReads -ne 0 -or
                    $global:AzureAvailabilityChecks.Count -ne 0 -or $global:AzureProvisionWrites -ne 0) { throw 'Invalid linked plan must stop before plan reads, name checks or provisioning.' }
            }
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
    $global:AzureCodePolicy = @{ ftp = 'false'; scm = 'false' }
    $global:AzureCodePolicyReads = @()
    $global:AzureCodeRuntime = @{}
    $global:AzureCodeBuildSettings = @()
    $global:AzureCodeKind = 'app,linux'
    $global:AzureCodeHelp = '--track-status --clean --timeout'
    $global:AzureCodeDeployExitCode = 1
    $global:AzureCodeDeployResponseId = 'current-deployment'
    $global:AzureCodeDeploymentRecords = @()
    $global:AzureCodeDeploymentStatus = 4
    $global:AzureCodeDeploymentStatusReads = 0
    $global:AzureCodeChange = $false
    $global:AzureCodeChanged = $false
    $global:AzureCodePlanId = $global:AzurePlanId
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
            $web = @{ id = 'synthetic-test-resource'; host = 'sample-web.azurewebsites.net'; httpsOnly = $true; kind = $global:AzureCodeKind }
            if ($global:AzureCodePlanId -cne 'missing') { $web.serverFarmId = $global:AzureCodePlanId }
            return ($web | ConvertTo-Json)
        }
        if ($args[0] -ceq 'appservice') { return (Get-TestAppServicePlan $args) }
        if ($args[0] -ceq 'resource' -and $args[1] -ceq 'show') {
            $id = [string]$args[[array]::IndexOf($args, '--ids') + 1]
            $policy = ($id -split '/')[-1]
            if ($policy -cnotin @('ftp', 'scm') -or $id -cne "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/sample-resource-group/providers/Microsoft.Web/sites/sample-web/basicPublishingCredentialsPolicies/$policy") { throw 'Unexpected publishing policy target.' }
            $global:AzureCodePolicyReads += $policy
            $response = $global:AzureCodePolicy[$policy]
            if ($response -eq 'failed-read') { $global:LASTEXITCODE = 1; return '' }
            return $response
        }
        if ($args[0] -ceq 'webapp' -and $args[1] -ceq 'config') {
            if ($global:AzureCodeReadFailure) { $global:LASTEXITCODE = 1; return '' }
            if ($args[2] -ceq 'show') { return ($global:AzureCodeRuntime | ConvertTo-Json) }
            return (ConvertTo-Json -InputObject $global:AzureCodeBuildSettings -Depth 5)
        }
        if ($args[0] -ceq 'webapp' -and $args[1] -ceq 'log' -and $args[2] -ceq 'deployment' -and $args[3] -ceq 'show') {
            $global:AzureCodeDeploymentStatusReads++
            $record = if ($global:AzureCodeDeploymentRecords.Count -ge $global:AzureCodeDeploymentStatusReads) {
                $global:AzureCodeDeploymentRecords[$global:AzureCodeDeploymentStatusReads - 1]
            } else {
                @{ id = $global:AzureCodeDeployResponseId; status = $global:AzureCodeDeploymentStatus; received_time = [DateTimeOffset]::UtcNow.ToString('o') }
            }
            return ($record | ConvertTo-Json)
        }
        if ($args[0] -ceq 'webapp' -and $args[1] -ceq 'deploy') {
            if ($args -notcontains '--clean' -or $args[[array]::IndexOf($args, '--clean') + 1] -cne 'true') {
                throw 'Source ZIP upload must explicitly request target cleanup.'
            }
            if ($args -notcontains '--async' -or $args[[array]::IndexOf($args, '--async') + 1] -cne 'true') {
                throw 'Source ZIP upload must use asynchronous Kudu processing.'
            }
            if ($args -notcontains '--timeout' -or $args[[array]::IndexOf($args, '--timeout') + 1] -ne 3600) {
                throw 'Source ZIP upload must set a bounded Azure CLI deployment timeout.'
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
            $global:LASTEXITCODE = $global:AzureCodeDeployExitCode
            return (@{ id = $global:AzureCodeDeployResponseId } | ConvertTo-Json)
        }
        throw 'Unexpected code deployment command.'
    }
    $deploy.ExpectedSha256 = $package.SHA256
    $global:AzureCodeOriginalPath = $package.Path
    $global:AzureCodeExpectedHash = $package.SHA256
    $global:AzureCodeSnapshotPath = ''
    foreach ($scenario in @('function-app', 'wrong-kind', 'mixed-function-kind', 'no-clean-support', 'no-track-support', 'no-timeout-support', 'missing-runtime', 'wrong-node', 'wrong-startup', 'missing-build', 'build-disabled', 'wrong-build', 'duplicate-build', 'run-from-package', 'read-failure', 'valid')) {
        $global:AzureCodeWrites = 0
        $global:AzureCodeKind = 'app,linux'
        $global:AzureCodeHelp = '--track-status --clean --timeout'
        $global:AzureCodeReadFailure = $scenario -ceq 'read-failure'
        $global:AzureCodeRuntime = @{ linuxFxVersion = 'NODE|22-lts'; appCommandLine = 'npm run start -- --hostname 0.0.0.0'; minTlsVersion = '1.2'; scmMinTlsVersion = '1.2'; ftpsState = 'Disabled' }
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
            'no-timeout-support' { $global:AzureCodeHelp = '--track-status --clean' }
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
    $global:AzureCodeKind = 'app,linux'
    $global:AzureCodeRuntime = @{ linuxFxVersion = 'NODE|22-lts'; appCommandLine = 'npm run start -- --hostname 0.0.0.0'; minTlsVersion = '1.2'; scmMinTlsVersion = '1.2'; ftpsState = 'Disabled' }
    $global:AzureCodeBuildSettings = @(
        @{ name = 'SCM_DO_BUILD_DURING_DEPLOYMENT'; value = 'true' },
        @{ name = 'CUSTOM_BUILD_COMMAND'; value = 'npm ci --include=dev && npm run build' }
    )
    $global:AzureCodeDeployExitCode = 0
    $global:AzureCodeDeploymentStatus = 3
    $global:AzureCodeDeploymentStatusReads = 0
    $global:AzureCodeWrites = 0
    $message = ''
    try { & (Join-Path $PSScriptRoot '..\Deploy-AppServiceCode.ps1') @deploy -Apply | Out-Null } catch { $message = $_.Exception.Message }
    if ($global:AzureCodeWrites -ne 1 -or $global:AzureCodeDeploymentStatusReads -ne 1 -or $message -notlike 'Remote App Service deployment failed*') {
        throw 'A failed asynchronous Kudu deployment status must fail before the homepage probe.'
    }
    $global:AzureCodeDeployResponseId = ''
    $global:AzureCodeDeploymentStatusReads = 0
    $global:AzureCodeWrites = 0
    $message = ''
    try { & (Join-Path $PSScriptRoot '..\Deploy-AppServiceCode.ps1') @deploy -Apply | Out-Null } catch { $message = $_.Exception.Message }
    if ($global:AzureCodeWrites -ne 1 -or $global:AzureCodeDeploymentStatusReads -ne 0 -or $message -notlike 'Azure CLI did not return an async deployment id*') {
        throw 'An async deployment without an id must fail before status polling.'
    }
    $global:AzureCodeDeployResponseId = 'new-deployment'
    $global:AzureCodeDeploymentRecords = @(
        @{ id = 'previous-deployment'; status = 4; received_time = [DateTimeOffset]::UtcNow.AddMinutes(-10).ToString('o') },
        @{ id = 'new-deployment'; status = 3; received_time = [DateTimeOffset]::UtcNow.ToString('o') }
    )
    $global:AzureCodeDeploymentStatusReads = 0
    $global:AzureCodeWrites = 0
    $global:AzureCodeSleepSeconds = 0
    function global:Start-Sleep { param([int] $Seconds) $global:AzureCodeSleepSeconds += $Seconds }
    $message = ''
    try { & (Join-Path $PSScriptRoot '..\Deploy-AppServiceCode.ps1') @deploy -Apply | Out-Null } catch { $message = $_.Exception.Message }
    finally {
        Remove-Item Function:\Start-Sleep -Force
    }
    if ($global:AzureCodeWrites -ne 1 -or $global:AzureCodeDeploymentStatusReads -ne 2 -or
        $global:AzureCodeSleepSeconds -ne 15 -or $message -notlike 'Remote App Service deployment failed*') {
        throw 'A stale successful deployment record must not satisfy the asynchronous status check.'
    }
    $global:AzureCodeDeployExitCode = 1
    $global:AzureCodeDeployResponseId = 'current-deployment'
    $global:AzureCodeDeploymentRecords = @()
    $global:AzureCodeDeploymentStatus = 4
    foreach ($property in @('minTlsVersion', 'scmMinTlsVersion')) {
        foreach ($value in @('1.0', '1.1', $null, '', 'TLS1_2', 'unknown', 1.2, 'missing')) {
            $global:AzureCodeRuntime = @{ linuxFxVersion = 'NODE|22-lts'; appCommandLine = 'npm run start -- --hostname 0.0.0.0'; minTlsVersion = '1.2'; scmMinTlsVersion = '1.2'; ftpsState = 'Disabled' }
            if ($value -ceq 'missing') { $global:AzureCodeRuntime.Remove($property) } else { $global:AzureCodeRuntime[$property] = $value }
            $global:AzureCodeWrites = 0
            $message = ''
            try { & (Join-Path $PSScriptRoot '..\Deploy-AppServiceCode.ps1') @deploy -Apply | Out-Null } catch { $message = $_.Exception.Message }
            if ($global:AzureCodeWrites -ne 0 -or $message -notlike '*requires site and SCM minimum TLS*') { throw 'Unsafe site/SCM TLS reached ZIP deployment.' }
        }
    }
    foreach ($siteTls in @('1.2', '1.3')) {
        foreach ($scmTls in @('1.2', '1.3')) {
            $global:AzureCodeRuntime = @{ linuxFxVersion = 'NODE|22-lts'; appCommandLine = 'npm run start -- --hostname 0.0.0.0'; minTlsVersion = $siteTls; scmMinTlsVersion = $scmTls; ftpsState = 'Disabled' }
            $global:AzureCodeWrites = 0
            $message = ''
            try { & (Join-Path $PSScriptRoot '..\Deploy-AppServiceCode.ps1') @deploy -Apply | Out-Null } catch { $message = $_.Exception.Message }
            if ($global:AzureCodeWrites -ne 1 -or $message -notlike 'Deployment did not report success*') { throw 'Supported site/SCM TLS should reach the mocked deployment.' }
        }
    }
    foreach ($response in @($freePlan, $freePlan.Replace('F1', 'S1').Replace('Free', 'Standard'), $freePlan.Replace('F1', 'P1v3').Replace('Free', 'PremiumV3'),
        $freePlan.Replace('F1', 'B1'), $freePlan.Replace('Free', 'Shared'), $freePlan.Replace('sample-plan', 'wrong-plan'),
        '{}', '{"sku":null}', '[]', 'null', 'invalid-json', 'read-failure')) {
        $global:AzurePlanResponse = $response
        $global:AzurePlanReads = 0
        $global:AzureCodeWrites = 0
        $message = ''
        try { & (Join-Path $PSScriptRoot '..\Deploy-AppServiceCode.ps1') @deploy -Apply | Out-Null } catch { $message = $_.Exception.Message }
        if ($global:AzurePlanReads -ne 0 -or $global:AzureCodeWrites -ne 1 -or $message -notlike 'Deployment did not report success*') {
            throw 'Code upload must not depend on plan SKU or plan read permissions.'
        }
    }
    $global:AzurePlanResponse = $freePlan
    foreach ($link in $invalidPlanLinks) {
        $global:AzureCodePlanId = $link
        $global:AzurePlanReads = 0
        $global:AzureCodeWrites = 0
        $message = ''
        try { & (Join-Path $PSScriptRoot '..\Deploy-AppServiceCode.ps1') @deploy -Apply | Out-Null } catch { $message = $_.Exception.Message }
        if ($message -notlike 'Deployment did not report success*' -or $global:AzurePlanReads -ne 0 -or $global:AzureCodeWrites -ne 1) {
            throw 'Code upload must not require a plan reference.'
        }
    }
    $global:AzureCodePlanId = $global:AzurePlanId
    foreach ($state in @('AllAllowed', 'FtpsOnly', '', $null, 0, @('Disabled'), 'missing')) {
        if ($state -ceq 'missing') { $global:AzureCodeRuntime.Remove('ftpsState') } else { $global:AzureCodeRuntime.ftpsState = $state }
        $global:AzureCodeWrites = 0
        $global:AzureCodePolicyReads = @()
        $message = ''
        try { & (Join-Path $PSScriptRoot '..\Deploy-AppServiceCode.ps1') @deploy -Apply | Out-Null } catch { $message = $_.Exception.Message }
        if ($message -notlike '*ftpsState=Disabled*' -or $global:AzureCodeWrites -ne 0 -or $global:AzureCodePolicyReads.Count -ne 0) { throw 'Unsafe FTP state reached publishing-policy reads or upload.' }
    }
    $global:AzureCodeRuntime.ftpsState = 'Disabled'
    foreach ($policy in @('ftp', 'scm')) {
        foreach ($response in @('true', 'null', '"false"', '', '{}', 'invalid-json', 'failed-read')) {
            $global:AzureCodePolicy = @{ ftp = 'false'; scm = 'false' }
            $global:AzureCodePolicy[$policy] = $response
            $global:AzureCodePolicyReads = @()
            $global:AzureCodeWrites = 0
            $message = ''
            try { & (Join-Path $PSScriptRoot '..\Deploy-AppServiceCode.ps1') @deploy -Apply | Out-Null } catch { $message = $_.Exception.Message }
            if ($message -notlike '*basic-publishing credential policies*' -or $global:AzureCodeWrites -ne 0 -or
                ($global:AzureCodePolicyReads -join ',') -cne $(if ($policy -eq 'ftp') { 'ftp' } else { 'ftp,scm' })) { throw 'Enabled or unreadable publishing policy reached upload.' }
        }
    }
    $global:AzureCodePolicy = @{ ftp = 'false'; scm = 'false' }
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
            $relativePath = if ($templateName -ceq 'web') { 'modules/web.bicep' } else { 'resources.bicep' }
            $templatePath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "../../templates/$relativePath"))
            $compiledJson = & $BicepPath build $templatePath --no-restore --stdout
            if ($LASTEXITCODE -ne 0) { throw "Cannot compile $templateName." }
            $compiled = ($compiledJson -join "`n") | ConvertFrom-Json -AsHashtable
            if ($templateName -ceq 'web') {
                $planResource = @($compiled.resources | Where-Object { $_.type -ceq 'Microsoft.Web/serverfarms' })
                $webResource = @($compiled.resources | Where-Object { $_.type -ceq 'Microsoft.Web/sites' })
                $planReference = "[resourceId('Microsoft.Web/serverfarms', parameters('planName'))]"
                if ($planResource.Count -ne 1 -or $planResource[0].sku.name -cne 'B1' -or
                    $planResource[0].sku.tier -cne 'Basic' -or $planResource[0].sku.capacity -ne 1 -or
                    $planResource[0].kind -cne 'linux' -or $planResource[0].properties.reserved -ne $true -or
                    $webResource.Count -ne 1 -or $webResource[0].properties.serverFarmId -cne $planReference -or
                    $planReference -cnotin $webResource[0].dependsOn -or $webResource[0].properties.siteConfig.alwaysOn -ne $false) {
                    throw 'The web module must create one Linux B1/Basic plan and link the web app to it with Always On disabled.'
                }
                $appSettings = $webResource[0].properties.siteConfig.appSettings
                if ($appSettings -isnot [string] -or -not $appSettings.StartsWith("[concat(variables('baseAppSettings'), ")) {
                    throw 'Web app settings must extend the reviewed base list instead of replacing it.'
                }
                $appended = $appSettings.Substring("[concat(variables('baseAppSettings'), ".Length)
                if ($appended -cnotmatch "'APPLICATIONINSIGHTS_CONNECTION_STRING'" -or
                    $appended -cmatch "'(PG[A-Z]*|SUNSUM_DATABASE_AUTH|DATABASE_URL|SUNSUM_DB_AUTH)'") {
                    throw 'Only the telemetry connection string may be appended to the web app settings.'
                }
                $settings = @($compiled.variables.baseAppSettings)
                $store = @($settings | Where-Object { $_.name -ceq 'SUNSUM_STORE' })
                if ($store.Count -ne 1 -or $store[0].value -cne 'mock' -or
                    @($settings | Where-Object { $_.name -cmatch '^(PG|SUNSUM_DATABASE_AUTH$|DATABASE_URL$|SUNSUM_DB_AUTH$)' }).Count -ne 0) {
                    throw 'The preparation web host must be explicitly fixture-only with no database settings.'
                }
                foreach ($removed in @('databaseHost', 'databaseName', 'runtimeRoleName')) {
                    if ($compiled.parameters.Contains($removed)) { throw 'Unused database inputs must not remain in the web module.' }
                }
                continue
            }
            $rootResources = if ($compiled.resources -is [System.Collections.IDictionary]) { @($compiled.resources.Values) } else { @($compiled.resources) }
            $modules = @($rootResources | Where-Object { $_.type -ceq 'Microsoft.Resources/deployments' })
            $requiredModules = @($modules | Where-Object { -not $_.Contains('condition') })
            $optionalModules = @($modules | Where-Object { $_.Contains('condition') })
            $postgresModule = @($requiredModules | Where-Object { $_.properties.parameters.Contains('serverName') })
            if ($requiredModules.Count -ne 3 -or $postgresModule.Count -ne 1) { throw 'The root must deploy web, Storage and PostgreSQL modules.' }
            foreach ($optional in $optionalModules) {
                if ($optional.condition -cnotin @("[parameters('enableObservability')]", "[parameters('enablePrivateNetworking')]", "[parameters('deployRbac')]")) {
                    throw 'Optional root modules must stay gated behind their explicit switches.'
                }
            }
            $blobRoles = @($optionalModules | Where-Object { $_.properties.parameters.Contains('blobDataAccess') })
            if ($blobRoles.Count -ne 1 -or $compiled.parameters.deployRbac.defaultValue -ne $false -or
                $blobRoles[0].condition -cne "[parameters('deployRbac')]" -or
                $blobRoles[0].properties.parameters.blobDataAccess.value -cne 'Contributor' -or
                $blobRoles[0].properties.parameters.approvedWebPrincipalId.value -cne "[parameters('approvedWebPrincipalId')]" -or
                $blobRoles[0].properties.parameters.approvalReference.value -cne "[parameters('blobRoleApprovalReference')]") {
                throw 'Blob grants must remain optional and bound to the approved web identity and review reference.'
            }
            $postgresInputs = $postgresModule[0].properties.parameters
            if ($compiled.parameters.postgresAdministrators.minLength -ne 1 -or
                $compiled.parameters.postgresAdministrators.defaultValue.Count -ne 1 -or
                $compiled.parameters.postgresAdministrators.defaultValue[0].objectId -cne "[parameters('postgresAdminObjectId')]" -or
                $compiled.parameters.postgresAdministrators.defaultValue[0].principalName -cne "[parameters('postgresAdminPrincipalName')]" -or
                $compiled.parameters.postgresAdministrators.defaultValue[0].principalType -cne "[parameters('postgresAdminPrincipalType')]") {
                throw 'The root must accept a nonempty administrator list and retain the exact single-admin fallback.'
            }
            foreach ($binding in @{ serverName='postgresServerName'; databaseName='databaseName'; tenantId='tenantId'; administrators='postgresAdministrators' }.GetEnumerator()) {
                if ($postgresInputs[$binding.Key].value -cne "[parameters('$($binding.Value)')]") { throw "PostgreSQL input is not bound to the root: $($binding.Key)" }
            }
            $postgresResources = $postgresModule[0].properties.template.resources
            if ($postgresResources -is [System.Collections.IDictionary]) { $postgresResources = @($postgresResources.Values) }
            $server = @($postgresResources | Where-Object { $_.type -ceq 'Microsoft.DBforPostgreSQL/flexibleServers' })
            $database = @($postgresResources | Where-Object { $_.type -ceq 'Microsoft.DBforPostgreSQL/flexibleServers/databases' })
            $administrator = @($postgresResources | Where-Object { $_.type -ceq 'Microsoft.DBforPostgreSQL/flexibleServers/administrators' })
            if ($server.Count -ne 1 -or $server[0].properties.createMode -cne 'Default' -or
                $server[0].properties.authConfig.activeDirectoryAuth -cne 'Enabled' -or
                $server[0].properties.authConfig.passwordAuth -cne 'Disabled' -or
                $database.Count -ne 1 -or $administrator.Count -ne 1 -or
                @($postgresResources | Where-Object { $_.type -like '*/firewallRules' }).Count) {
                throw 'The root must create a new Entra-only PostgreSQL server, administrator and database without firewall rules.'
            }
            if ($compiled.outputs.PGHOST.value -notlike '*outputs.fqdn.value]*' -or
                $compiled.outputs.AZURE_POSTGRES_SERVER_NAME.value -notlike '*outputs.name.value]*') {
                throw 'Database connection outputs must come from the new PostgreSQL module.'
            }
            $roleParameter = $compiled.parameters.runtimeRoleName
            if ($roleParameter.allowedValues.Count -ne 1 -or $roleParameter.allowedValues[0] -cne 'sunsum_runtime' -or
                $roleParameter.defaultValue -cne 'sunsum_runtime') { throw 'Compiled runtime-role allowlist must contain only sunsum_runtime.' }
            $templateParameters = @{}
            foreach ($entry in $provisionParameters.parameters.GetEnumerator()) {
                if ($compiled.parameters.Contains($entry.Key)) { $templateParameters[$entry.Key] = $entry.Value.value }
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
        Write-Output 'Template guards passed: complete test stack creation, B1 plan, Entra-only PostgreSQL, fixture-only web settings and nine root runtime-role parameter cases.'
        $databaseTemplate = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\templates\modules\postgres.bicep'))
        $compiledJson = & $BicepPath build $databaseTemplate --no-restore --stdout
        if ($LASTEXITCODE -ne 0) { throw 'Cannot compile the PostgreSQL database-name guard.' }
        $compiled = ($compiledJson -join "`n") | ConvertFrom-Json -AsHashtable
        foreach ($dependency in @{
            secureTransport='server'
            minimumTls='secureTransport'
            entraAdmin='minimumTls'
            database='entraAdmin'
        }.GetEnumerator()) {
            if ($dependency.Value -cnotin $compiled.resources[$dependency.Key].dependsOn) {
                throw "PostgreSQL child writes must be serialized: $($dependency.Key) must depend on $($dependency.Value)."
            }
        }
        if ($compiled.resources.entraAdmin.copy.mode -cne 'serial' -or $compiled.resources.entraAdmin.copy.batchSize -ne 1 -or
            $compiled.resources.entraAdmin.copy.count -cne "[length(variables('validatedAdministrators'))]" -or
            $compiled.resources.entraAdmin.properties.tenantId -cne "[parameters('tenantId')]" -or
            $compiled.resources.entraAdmin.name -notlike '*validatedAdministrators*copyIndex()*objectId*' -or
            $compiled.resources.entraAdmin.properties.principalName -notlike '*validatedAdministrators*copyIndex()*principalName*' -or
            $compiled.resources.entraAdmin.properties.principalType -notlike '*validatedAdministrators*copyIndex()*principalType*' -or
            $compiled.variables.validatedAdministrators -cne "[__bicep.validateAdministrators(parameters('administrators'))]" -or
            $compiled.parameters.administrators.minLength -ne 1 -or $compiled.parameters.administrators.defaultValue.Count -ne 1 -or
            $compiled.parameters.administrators.defaultValue[0].objectId -cne "[parameters('adminObjectId')]") {
            throw 'PostgreSQL administrators must use validated, same-tenant, serialized list entries and preserve the single-admin fallback.'
        }
        if ($compiled.variables.validatedDatabaseName -cne "[__bicep.validateDatabaseName(parameters('databaseName'))]" -or
            -not $compiled.resources.database.name.Contains("variables('validatedDatabaseName')") -or
            $compiled.parameters.databaseName.defaultValue -cne 'sunsum') {
            throw 'PostgreSQL database creation must consume only the validated name and retain the default.'
        }
        $policy = Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\postgres-database-name-policy.json') -Raw | ConvertFrom-Json -AsHashtable
        $relativeDatabaseTemplate = [System.IO.Path]::GetRelativePath($fixture, $databaseTemplate).Replace('\', '/')
        $firstAdmin=@{objectId='aaaaaaaa-1111-4111-8111-111111111111';principalName='synthetic-admin';principalType='User'}
        $secondAdmin=@{objectId='bbbbbbbb-2222-4222-8222-222222222222';principalName='synthetic-admin-group';principalType='Group'}
        $thirdAdmin=@{objectId='cccccccc-3333-4333-8333-333333333333';principalName='synthetic-admin-service';principalType='ServicePrincipal'}
        $adminCases=[System.Collections.Generic.List[object]]::new()
        $adminCases.Add(@{allowed=$true;value=@($firstAdmin)})
        $adminCases.Add(@{allowed=$true;value=@($firstAdmin,$secondAdmin,$thirdAdmin)})
        $adminCases.Add(@{allowed=$false;value=@()})
        $adminCases.Add(@{allowed=$false;value=@($firstAdmin,$firstAdmin)})
        $uppercase=$firstAdmin.Clone()
        $uppercase.objectId=$firstAdmin.objectId.ToUpperInvariant()
        $adminCases.Add(@{allowed=$true;value=@($uppercase)})
        $adminCases.Add(@{allowed=$false;value=@($firstAdmin,$uppercase)})
        foreach ($entry in @(
            @{field='objectId';value='00000000-0000-0000-0000-000000000000'},
            @{field='objectId';value='gggggggg-1111-4111-8111-111111111111'},
            @{field='objectId';value='aaaaaaaa1111-4111-8111-111111111111-'},
            @{field='objectId';value='short'},
            @{field='principalName';value=''},
            @{field='principalName';value=' '},
            @{field='principalName';value='<redacted>'},
            @{field='principalName';value="invalid`nname"},
            @{field='principalType';value='user'},
            @{field='principalType';value='ManagedIdentity'}
        )) {
            $changed=$firstAdmin.Clone()
            $changed[$entry.field]=$entry.value
            $adminCases.Add(@{allowed=$false;value=@($changed)})
        }
        foreach ($case in $adminCases) {
            $encoded=(ConvertTo-Json -InputObject $case.value -Depth 5 -Compress).Replace('\', '\\').Replace("'", "\'")
            $inputPath=Join-Path $fixture "admin-list-$([guid]::NewGuid().ToString('N')).bicepparam"
            $outputPath=[System.IO.Path]::ChangeExtension($inputPath, '.json')
            $lines=@(
                "using '$relativeDatabaseTemplate'",
                "import { validateAdministrators } from '$relativeDatabaseTemplate'",
                "param location = 'centralus'",
                "param serverName = 'sample-postgres'",
                "param tenantId = '22222222-2222-4222-8222-222222222222'",
                "param administrators = validateAdministrators(json('$encoded'))"
            )
            Set-Content -LiteralPath $inputPath -Value $lines -Encoding utf8NoBOM
            $diagnostics=& $BicepPath build-params $inputPath --no-restore --outfile $outputPath 2>&1
            if ($case.allowed) {
                if ($LASTEXITCODE -ne 0) { throw "Valid administrator list failed: $diagnostics" }
                $actual=Get-Content -LiteralPath $outputPath -Raw | ConvertFrom-Json -AsHashtable
                if ($actual.parameters.administrators.value.Count -ne $case.value.Count) { throw 'Administrator list changed during compilation.' }
            } elseif ($LASTEXITCODE -eq 0 -or (Test-Path -LiteralPath $outputPath)) {
                throw 'Invalid administrator list passed Bicep evaluation.'
            }
        }
        Write-Output "PostgreSQL administrator list guard passed: $($adminCases.Count) evaluations, single-admin fallback and serialized resource wiring."
        $databaseNames = @('a', 'sunsum', 'sunsum_prod', 'app123', ('a' * 63),
            'postgres', 'public', 'template0', 'template1', 'pg_custom', 'azure_custom', 'SunSum', '_sunsum', '1sunsum',
            'sunsum-prod', 'sunsum.prod', 'sunsum prod', ('a' * 64), ('db' + [char]0xe9), '', ' sunsum', 'sunsum ',
            "sunsum`n", 'app;drop', "app'name", 'app\name')
        foreach ($databaseName in $databaseNames) {
            $allowed = $databaseName -cmatch $policy.pattern -and $databaseName -cnotmatch '[\x00-\x1f\x7f]' -and
                $databaseName -cnotin $policy.reservedNames -and
                @($policy.reservedPrefixes | Where-Object { $databaseName.StartsWith($_, [System.StringComparison]::Ordinal) }).Count -eq 0
            $encoded = (ConvertTo-Json -InputObject $databaseName -Compress).Replace('\', '\\').Replace("'", "\'")
            $inputPath = Join-Path $fixture 'database-name.bicepparam'
            $outputPath = Join-Path $fixture 'database-name.json'
            $lines = @(
                "using '$relativeDatabaseTemplate'",
                "import { validateDatabaseName } from '$relativeDatabaseTemplate'",
                "param location = 'centralus'",
                "param serverName = 'sample-postgres'",
                "param tenantId = '22222222-2222-4222-8222-222222222222'",
                "param adminObjectId = '33333333-3333-4333-8333-333333333333'",
                "param adminPrincipalName = 'synthetic-administrator'",
                "param databaseName = validateDatabaseName(json('$encoded'))"
            )
            Set-Content -LiteralPath $inputPath -Value $lines -Encoding utf8NoBOM
            if (Test-Path -LiteralPath $outputPath) { Remove-Item -LiteralPath $outputPath }
            $diagnostics = & $BicepPath build-params $inputPath --no-restore --outfile $outputPath 2>&1
            if ($allowed) {
                if ($LASTEXITCODE -ne 0) { throw "Valid database name failed Bicep evaluation: $diagnostics" }
                $actual = Get-Content -LiteralPath $outputPath -Raw | ConvertFrom-Json -AsHashtable
                if ($actual.parameters.databaseName.value -cne $databaseName) { throw 'Database-name validation changed the reviewed value.' }
            } elseif ($LASTEXITCODE -eq 0 -or ($diagnostics -join "`n") -notlike '*Database name must be*' -or (Test-Path -LiteralPath $outputPath)) {
                throw "Unsupported database name did not fail template evaluation: $diagnostics"
            }
        }
        Write-Output "PostgreSQL database-name guard passed: $($databaseNames.Count) Bicep evaluations, shared policy parity and compiled resource wiring."
    }
    $entryScripts = Join-Path $fixture 'entry/infrastructure/scripts'
    $entryConfigDirectory = Join-Path $fixture 'entry/infrastructure/config'
    $entryOutput = Join-Path $fixture 'entry/.azure/code/deployments'
    $null = New-Item -ItemType Directory -Path $entryScripts, $entryConfigDirectory -Force
    foreach ($name in @('Deploy-Application.ps1', 'New-AppServicePackage.ps1', 'Test-AppServicePackage.ps1', 'DeploymentSafety.psm1', 'DeploymentConfiguration.psm1')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot "../$name") -Destination (Join-Path $entryScripts $name)
    }
    $entry = Join-Path $entryScripts 'Deploy-Application.ps1'
    $entryConfig = Join-Path $entryConfigDirectory 'dev.json'
    $codeConfig = @{
        subscriptionId=$target.subscriptionId; resourceGroupName=$target.resourceGroupName; webAppName='sample-web'
        infrastructure=@{deploymentName='sample-infra';templatePath='missing.bicep';parametersPath='missing.bicepparam'}
        code=@{expectedAccessMode='Preview'}
    }
    $codeConfig | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $entryConfig -Encoding utf8NoBOM
    $global:ApplicationEntryCalls = [System.Collections.Generic.List[object]]::new()
    $global:ApplicationEntryFail = $false
    @'
param($SubscriptionId, $ResourceGroupName, $WebAppName, $PackagePath, $ExpectedSha256, $ApprovalReference, $ApprovalPath, $ApprovalSha256, $ExpectedAccessMode, [switch] $Apply)
Import-Module (Join-Path $PSScriptRoot 'DeploymentSafety.psm1') -Force
$record = New-DeploymentApproval -Path $ApprovalPath -ExpectedSha256 $ApprovalSha256 -Expected @{
    operation='CodeDeployment'; subscriptionId=[string]$SubscriptionId; resourceGroupName=$ResourceGroupName
    webAppName=$WebAppName; payloadSha256=$ExpectedSha256; approvalReference=$ApprovalReference; expectedAccessMode=$ExpectedAccessMode
}
try {
    $archive = & (Join-Path $PSScriptRoot 'Test-AppServicePackage.ps1') -Path $PackagePath
    if ($archive.SHA256 -cne $ExpectedSha256 -or $archive.Files -ne 11) { throw 'Entry did not bind the validated source ZIP.' }
    $global:ApplicationEntryCalls.Add(@{ Apply=[bool]$Apply; PackagePath=$PackagePath; Reference=$ApprovalReference; Mode=$ExpectedAccessMode; Target=$WebAppName; Subscription=[string]$SubscriptionId; Group=$ResourceGroupName })
    if ($Apply -and $global:ApplicationEntryFail) { throw 'Simulated build/upload failure.' }
} finally { Remove-DeploymentSnapshot $record }
'@ | Set-Content -LiteralPath (Join-Path $entryScripts 'Deploy-AppServiceCode.ps1') -Encoding utf8NoBOM
    Push-Location ([System.IO.Path]::GetTempPath())
    try {
        & $entry -SourceRoot $source | Out-Null
        & $entry -SourceRoot $source | Out-Null
        if ($global:ApplicationEntryCalls.Count -ne 2 -or $global:ApplicationEntryCalls[0].Apply -or
            $global:ApplicationEntryCalls[1].Apply -or $global:ApplicationEntryCalls[0].PackagePath -ceq $global:ApplicationEntryCalls[1].PackagePath) {
            throw 'Default entry must validate locally with unique artifacts on repeated runs from any directory.'
        }
        foreach ($badConfig in @('{}', 'null', '[]', 'invalid-json')) {
            Set-Content -LiteralPath $entryConfig -Value $badConfig
            Assert-Throws { & $entry -SourceRoot $source } 'Malformed code config was accepted.'
        }
        foreach ($field in @('subscriptionId', 'resourceGroupName', 'webAppName')) {
            foreach ($badValue in @('', $null, $true, '<unreviewed>', 'invalid/value')) {
                $changedConfig = $codeConfig.Clone()
                $changedConfig[$field] = $badValue
                $changedConfig | ConvertTo-Json | Set-Content -LiteralPath $entryConfig
                Assert-Throws { & $entry -SourceRoot $source -Apply -ApprovalReference 'review-123' } 'Invalid code target reached deployment.'
            }
        }
        foreach ($missingField in $codeConfig.Keys) {
            $changedConfig=$codeConfig.Clone()
            $null=$changedConfig.Remove($missingField)
            $changedConfig | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $entryConfig
            Assert-Throws { & $entry -SourceRoot $source } 'Missing shared code config field was accepted.'
        }
        foreach ($badSection in @($null, @(), 'invalid', @{}, @{expectedAccessMode='Preview';Apply=$true})) {
            $changedConfig=$codeConfig.Clone()
            $changedConfig.code=$badSection
            $changedConfig | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $entryConfig
            Assert-Throws { & $entry -SourceRoot $source -Apply -ApprovalReference 'review-123' } 'Malformed code section reached deployment.'
        }
        foreach ($badMode in @('', $null, $true, '<unreviewed>', 'unknown')) {
            $changedConfig=$codeConfig.Clone()
            $changedConfig.code=@{expectedAccessMode=$badMode}
            $changedConfig | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $entryConfig
            Assert-Throws { & $entry -SourceRoot $source -Apply -ApprovalReference 'review-123' } 'Invalid HTTP mode reached deployment.'
        }
        $legacy=@{subscriptionId=$target.subscriptionId;resourceGroupName=$target.resourceGroupName;webAppName='sample-web';expectedAccessMode='Preview'}
        $legacy | ConvertTo-Json | Set-Content -LiteralPath $entryConfig
        Assert-Throws { & $entry -SourceRoot $source } 'Legacy independent code config was accepted.'
        $changedConfig = $codeConfig.Clone()
        $changedConfig.Apply = $true
        $changedConfig | ConvertTo-Json | Set-Content -LiteralPath $entryConfig
        Assert-Throws { & $entry -SourceRoot $source } 'Config enabled deployment.'
        $codeConfig.code.expectedAccessMode = 'ApprovedSignIn'
        $codeConfig | ConvertTo-Json | Set-Content -LiteralPath $entryConfig
        foreach ($invalidReference in @(' ', '<review>', "review`nother")) {
            Assert-Throws { & $entry -SourceRoot $source -Apply -ApprovalReference $invalidReference } 'Invalid review reference was accepted.'
        }
        Assert-Throws { & $entry -SourceRoot (Join-Path $fixture 'missing-source') -Apply -ApprovalReference 'review-123' } 'Missing source reached deployment.'
        if ($global:ApplicationEntryCalls.Count -ne 2) { throw 'Invalid inputs reached the code uploader.' }
        & $entry -SourceRoot $source -Apply -ApprovalReference 'review-123' | Out-Null
        $last = $global:ApplicationEntryCalls[2]
        if (-not $last.Apply -or $last.Reference -cne 'review-123' -or $last.Mode -cne 'ApprovedSignIn' -or $last.Target -cne 'sample-web') {
            throw 'Entry did not preserve explicit apply, target, review and HTTP mode.'
        }
        $global:ApplicationEntryFail = $true
        Assert-Throws { & $entry -SourceRoot $source -Apply -ApprovalReference 'review-123' } 'Failed upload/build was swallowed.'
        if ($global:ApplicationEntryCalls.Count -ne 4) { throw 'Entry retried a failed upload/build.' }
        if (@(Get-ChildItem -LiteralPath $entryOutput -Filter deployment-record.json -Recurse).Count -ne 4) { throw 'Expected one execution record per packaged run.' }
        $global:ApplicationEntryFail = $false
        foreach ($unusedInfrastructure in @($null, 'not-ready', @{templatePath='not-a-template';parametersPath='missing-private-values'})) {
            $changedConfig=$codeConfig.Clone()
            $changedConfig.infrastructure=$unusedInfrastructure
            $changedConfig | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $entryConfig
            & $entry -SourceRoot $source -Apply -ApprovalReference 'review-123' | Out-Null
        }
        $localConfig=Join-Path $fixture 'shared.local.json'
        $changedConfig=$codeConfig.Clone()
        $changedConfig.subscriptionId='44444444-4444-4444-8444-444444444444'
        $changedConfig.resourceGroupName='other-approved-group'
        $changedConfig.webAppName='other-approved-web'
        $changedConfig | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $localConfig
        & $entry -ConfigPath $localConfig -SourceRoot $source -Apply -ApprovalReference 'review-456' | Out-Null
        $last=$global:ApplicationEntryCalls[$global:ApplicationEntryCalls.Count - 1]
        if ($global:ApplicationEntryCalls.Count -ne 8 -or $last.Target -cne $changedConfig.webAppName -or
            $last.Subscription -cne $changedConfig.subscriptionId -or $last.Group -cne $changedConfig.resourceGroupName) {
            throw 'Code entry must use the shared target without resolving unused infrastructure sources or identities.'
        }
    } finally { Pop-Location }
    $zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Update)
    try { $null = $zip.CreateEntry('.env') } finally { $zip.Dispose() }
    Assert-Throws { & (Join-Path $PSScriptRoot '..\Test-AppServicePackage.ps1') -Path $zipPath } 'Accepted a tampered archive.'
} finally {
    Remove-Variable -Name ApplicationEntryCalls, ApplicationEntryFail -Scope Global -ErrorAction SilentlyContinue
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
    Remove-Variable -Name AzureCodePolicy, AzureCodePolicyReads -Scope Global -ErrorAction SilentlyContinue
    Remove-Variable -Name AzurePlanId, AzurePlanResponse, AzurePlanReads, AzureCodePlanId -Scope Global -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force }
}
Write-Output 'Deployment safety: IPv4, real ZIP exclusion/tamper checks and target-bound approval checks passed.'
exit 0
