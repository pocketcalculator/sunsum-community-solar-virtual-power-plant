#requires -Version 7.2
[CmdletBinding()]
param([Parameter(Mandatory)][string] $BicepPath)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot '..\DeploymentSafety.psm1') -Force

$fixture = Join-Path $PSScriptRoot ".validation\$([guid]::NewGuid().ToString('N'))"
$null = New-Item -ItemType Directory -Path $fixture -Force
$template = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\templates\postgres-firewall.bicep'))
$relativeTemplate = [System.IO.Path]::GetRelativePath($fixture, $template).Replace('\', '/')
$script:caseCount = 0

function Assert-TemplateAddresses([AllowEmptyCollection()][string[]] $Addresses, [bool] $Allowed) {
    $script:caseCount++
    $wrapperAllowed = $true
    try {
        $null = Assert-FirewallApproval @{
            subscriptionId = '11111111-1111-4111-8111-111111111111'
            resourceGroupName = 'sample-resource-group'
            postgresServerName = 'sample-postgres'
            approvalReference = 'synthetic-test-review'
            approvedIpv4Addresses = @($Addresses)
        } -SubscriptionId '11111111-1111-4111-8111-111111111111' -ResourceGroupName 'sample-resource-group' -PostgresServerName 'sample-postgres'
    } catch { $wrapperAllowed = $false }
    if ($wrapperAllowed -ne $Allowed) { throw 'Expected result differs from the existing wrapper policy.' }
    $encoded = (ConvertTo-Json -InputObject @($Addresses) -Compress).Replace('\', '\\').Replace("'", "\'")
    $source = @"
using '$relativeTemplate'
import { validateFirewallAddresses } from '$relativeTemplate'
param postgresServerName = 'sample-postgres'
param approvalReference = 'synthetic-test-review'
param approvedIpv4Addresses = validateFirewallAddresses(json('$encoded'))
"@
    $inputPath = Join-Path $fixture 'case.bicepparam'
    $outputPath = Join-Path $fixture 'case.json'
    if (Test-Path -LiteralPath $outputPath) { Remove-Item -LiteralPath $outputPath }
    Set-Content -LiteralPath $inputPath -Value $source -Encoding utf8NoBOM
    $diagnostics = & $BicepPath build-params $inputPath --no-restore --outfile $outputPath 2>&1
    if ($Allowed) {
        if ($LASTEXITCODE -ne 0) { throw "Valid addresses failed Bicep evaluation: $diagnostics" }
        $parameters = Get-Content -LiteralPath $outputPath -Raw | ConvertFrom-Json -AsHashtable
        $actual = ConvertTo-Json -InputObject @($parameters.parameters.approvedIpv4Addresses.value) -Compress
        if ($actual -cne (ConvertTo-Json -InputObject @($Addresses) -Compress)) { throw 'Bicep changed the approved address list.' }
    } else {
        if ($LASTEXITCODE -eq 0 -or ($diagnostics -join "`n") -notlike '*Firewall addresses must be unique canonical public IPv4*') {
            throw "Expected the template firewall guard to fail; result: $diagnostics"
        }
        if (Test-Path -LiteralPath $outputPath) { throw 'Rejected addresses produced deployable parameters.' }
    }
}

try {
    $compiledJson = & $BicepPath build $template --no-restore --stdout
    if ($LASTEXITCODE -ne 0) { throw 'Firewall template did not compile.' }
    $compiled = ($compiledJson -join "`n") | ConvertFrom-Json -AsHashtable
    if ($compiled.variables.validatedAddresses -cne "[__bicep.validateFirewallAddresses(parameters('approvedIpv4Addresses'))]" -or
        $compiled.resources.rules.copy.count -cne "[length(variables('validatedAddresses'))]" -or
        $compiled.resources.rules.properties.startIpAddress -cne "[variables('validatedAddresses')[copyIndex()]]" -or
        $compiled.resources.rules.properties.endIpAddress -cne "[variables('validatedAddresses')[copyIndex()]]") {
        throw 'Firewall resource generation must consume only the complete validated list.'
    }
    if ($compiled.parameters.approvedIpv4Addresses.items.type -cne 'string' -or
        $compiled.parameters.approvedIpv4Addresses.maxLength -ne 128) {
        throw 'Compiled firewall parameter constraints were weakened.'
    }
    Assert-TemplateAddresses @() $true
    Assert-TemplateAddresses @('20.30.40.50', '8.8.8.8') $true
    Assert-TemplateAddresses @(
        '1.0.0.0', '9.255.255.255', '11.0.0.0', '126.255.255.255', '128.0.0.0', '223.255.255.255',
        '100.63.255.255', '100.128.0.0', '169.253.255.255', '169.255.0.0',
        '172.15.255.255', '172.32.0.0', '192.167.255.255', '192.169.0.0',
        '192.0.1.0', '192.0.3.0', '198.17.255.255', '198.20.0.0',
        '198.51.99.255', '198.51.101.0', '203.0.112.255', '203.0.114.0'
    ) $true
    foreach ($address in @(
        '', '0.0.0.0', '0.255.255.255', '10.0.0.0', '10.255.255.255',
        '127.0.0.1', '127.255.255.255', '224.0.0.0', '255.255.255.255',
        '100.64.0.0', '100.127.255.255', '169.254.0.0', '169.254.255.255',
        '172.16.0.0', '172.31.255.255', '192.168.0.0', '192.168.255.255',
        '192.0.0.0', '192.0.0.255', '192.0.2.0', '192.0.2.255',
        '198.18.0.0', '198.19.255.255', '198.51.100.0', '198.51.100.255',
        '203.0.113.0', '203.0.113.255', '127.1', '1.2.3', '1.2.3.4.5',
        '20.30.40.50/32', '20.30.40.0/24', '20.30.40.50-20.30.40.60',
        '20.30.40.256', '020.30.40.50', '20.030.40.50', '20.30.040.50', '20.30.40.050',
        '20..40.50', '-1.2.3.4', '+1.2.3.4', '1e1.2.3.4', '0x14.30.40.50',
        ' 20.30.40.50', '20.30.40.50 ', "20.30.40.50`n", '::1', '::ffff:20.30.40.50',
        'https://20.30.40.50', "20.30.40.'50", '20.30.40.\50'
    )) {
        Assert-TemplateAddresses @($address) $false
    }
    Assert-TemplateAddresses @('20.30.40.50', '0.0.0.0') $false
    Assert-TemplateAddresses @('0.0.0.0', '20.30.40.50') $false
    Assert-TemplateAddresses @('20.30.40.50', '20.30.40.50') $false
    Assert-TemplateAddresses @(1..128 | ForEach-Object { "20.30.40.$_" }) $true
    Assert-TemplateAddresses @(1..129 | ForEach-Object { "20.30.40.$_" }) $false
} finally {
    Remove-Item -LiteralPath $fixture -Recurse -Force
}
Write-Output "Firewall template evaluation checks passed: $script:caseCount cases, wrapper parity, and compiled resource wiring."