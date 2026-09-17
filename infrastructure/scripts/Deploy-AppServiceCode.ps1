#requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory)][guid] $SubscriptionId,
    [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9_().-]{1,90}$')][string] $ResourceGroupName,
    [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9-]{0,58}[a-zA-Z0-9]$')][string] $WebAppName,
    [Parameter(Mandatory)][string] $PackagePath,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string] $ExpectedSha256,
    [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string] $ApprovalReference,
    [ValidateSet('Preview', 'ApprovedSignIn')][string] $ExpectedAccessMode = 'Preview',
    [switch] $Apply
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'DeploymentSafety.psm1') -Force
if ($SubscriptionId -eq [guid]::Empty -or [string]::IsNullOrWhiteSpace($ApprovalReference)) {
    throw 'An explicit subscription and code-deployment review reference are required.'
}
$snapshot = New-DeploymentSnapshot -Path $PackagePath -ExpectedSha256 $ExpectedSha256
try {
    $artifact = & (Join-Path $PSScriptRoot 'Test-AppServicePackage.ps1') -Path $snapshot.Path
    if ($artifact.SHA256 -ine $ExpectedSha256) { throw 'The source ZIP no longer matches the reviewed SHA-256.' }
    if (-not $Apply) {
        Write-Output 'Artifact and explicit target validated. No Azure calls; -Apply requires separate deployment authorization.'
        return
    }
    $help = & az webapp deploy --help
    if ($LASTEXITCODE -ne 0 -or ($help -join "`n") -notmatch '--track-status' -or ($help -join "`n") -notmatch '--clean') {
        throw 'This Azure CLI must support webapp deploy --track-status and --clean; update tooling separately.'
    }
    $raw = & az webapp show --subscription $SubscriptionId --resource-group $ResourceGroupName --name $WebAppName `
        --query '{id:id,host:defaultHostName,httpsOnly:httpsOnly,kind:kind}' --output json --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw 'Could not verify the existing App Service target.' }
    $app = ($raw -join "`n") | ConvertFrom-Json
    if ($app.httpsOnly -isnot [bool] -or $app.httpsOnly -ne $true -or $app.kind -isnot [string] -or
        'app' -notin ($app.kind -split ',') -or 'linux' -notin ($app.kind -split ',') -or 'functionapp' -in ($app.kind -split ',') -or
        $app.host -cnotmatch '^[a-z0-9][a-z0-9.-]*\.azurewebsites\.net$') {
        throw 'The target must be the HTTPS-only Linux app in Azure public cloud.'
    }
    foreach ($policy in @('ftp', 'scm')) {
        $raw = & az resource show --ids "$($app.id)/basicPublishingCredentialsPolicies/$policy" `
            --api-version 2024-04-01 --query properties.allow --output json --only-show-errors
        if ($LASTEXITCODE -ne 0 -or ($raw -join "`n").Trim() -cne 'false') {
            throw 'Both publishing-credential policies must already be disabled. This script will not modify them.'
        }
    }

    $raw = & az webapp config show --subscription $SubscriptionId --resource-group $ResourceGroupName --name $WebAppName `
        --query '{linuxFxVersion:linuxFxVersion,appCommandLine:appCommandLine,minTlsVersion:minTlsVersion,scmMinTlsVersion:scmMinTlsVersion}' --output json --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw 'Cannot verify the existing Node and startup configuration before source deployment.' }
    $runtime = ($raw -join "`n") | ConvertFrom-Json -AsHashtable
    if ($runtime.linuxFxVersion -cne 'NODE|22-lts' -or $runtime.appCommandLine -cne 'npm run start -- --hostname 0.0.0.0') {
        throw 'Source deployment requires the reviewed Node 22 and npm startup configuration; correct settings through a separate approved operation.'
    }
    if (-not $runtime.Contains('minTlsVersion') -or -not $runtime.Contains('scmMinTlsVersion') -or
        $runtime.minTlsVersion -isnot [string] -or $runtime.minTlsVersion -cnotin @('1.2', '1.3') -or
        $runtime.scmMinTlsVersion -isnot [string] -or $runtime.scmMinTlsVersion -cnotin @('1.2', '1.3')) {
        throw 'Source deployment requires site and SCM minimum TLS 1.2 or 1.3; remediate transport settings through a separate approved operation.'
    }
    $raw = & az webapp config appsettings list --subscription $SubscriptionId --resource-group $ResourceGroupName --name $WebAppName `
        --query "[?name=='SCM_DO_BUILD_DURING_DEPLOYMENT' || name=='CUSTOM_BUILD_COMMAND' || name=='WEBSITE_RUN_FROM_PACKAGE']" --output json --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw 'Cannot verify the existing remote-build settings before source deployment.' }
    $buildSettings = ($raw -join "`n") | ConvertFrom-Json -AsHashtable -NoEnumerate
    if ($buildSettings -isnot [array]) { throw 'Expected a remote-build settings array.' }
    foreach ($required in @{
        SCM_DO_BUILD_DURING_DEPLOYMENT = 'true'
        CUSTOM_BUILD_COMMAND = 'npm ci --include=dev && npm run build'
    }.GetEnumerator()) {
        $matches = @($buildSettings | Where-Object { $_.name -ceq $required.Key })
        if ($matches.Count -ne 1 -or $matches[0].value -cne $required.Value) {
            throw 'Source ZIP deployment requires the reviewed Oryx build settings; this script will not change them automatically.'
        }
    }
    if (@($buildSettings | Where-Object { $_.name -ceq 'WEBSITE_RUN_FROM_PACKAGE' -and -not [string]::IsNullOrWhiteSpace($_.value) -and $_.value -cne '0' }).Count -gt 0) {
        throw 'Run-from-package is incompatible with this source ZIP remote-build path.'
    }
    Assert-DeploymentSnapshot $snapshot
    & az webapp deploy --subscription $SubscriptionId --resource-group $ResourceGroupName --name $WebAppName `
        --src-path $artifact.Path --type zip --clean true --async false --track-status false --timeout 600000 `
        --only-show-errors --output none
    if ($LASTEXITCODE -ne 0) {
        throw 'Deployment did not report success. It may still finish remotely: inspect deployment logs before retrying; do not change the web tier.'
    }
    $online = $false
    for ($attempt = 0; $attempt -lt 12; $attempt++) {
        try {
            $online = Test-AppServiceResponse -Uri "https://$($app.host)/" -ExpectedAccessMode $ExpectedAccessMode
            if ($online) { break }
        } catch [System.Net.Http.HttpRequestException] {
            Write-Warning "Preview check $($attempt + 1) encountered a network failure; retrying within the bounded window."
        } catch [System.Threading.Tasks.TaskCanceledException] {
            Write-Warning "Preview check $($attempt + 1) timed out; retrying within the bounded window."
        } catch [System.TimeoutException] {
            Write-Warning "Preview check $($attempt + 1) timed out; retrying within the bounded window."
        }
        if ($attempt -lt 11) { Start-Sleep -Seconds 10 }
    }
    if (-not $online) { throw 'The expected preview/sign-in response was not observed within bounded checks. Inspect deployment logs; no automatic retry, rollback or tier change was attempted.' }
    Write-Output "Code deployment succeeded and the expected $ExpectedAccessMode response was observed. This is not a readiness, participant-authorization, database, or Blob integration check."
} finally { Remove-DeploymentSnapshot $snapshot }
