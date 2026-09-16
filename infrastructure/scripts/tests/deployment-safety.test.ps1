#requires -Version 7.2
$ErrorActionPreference = 'Stop'
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
    }
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
    $zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Update)
    try { $null = $zip.CreateEntry('.env') } finally { $zip.Dispose() }
    Assert-Throws { & (Join-Path $PSScriptRoot '..\Test-AppServicePackage.ps1') -Path $zipPath } 'Accepted a tampered archive.'
} finally {
    Remove-Item -LiteralPath Function:\az -ErrorAction SilentlyContinue
    Remove-Variable -Name AzureSafetyTestCalls -Scope Global -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force }
}
Write-Output 'Deployment safety: IPv4, real ZIP exclusion/tamper checks and target-bound approval checks passed.'
