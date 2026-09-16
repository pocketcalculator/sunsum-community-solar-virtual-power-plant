#requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory)][guid] $SubscriptionId,
    [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9_().-]{1,90}$')][string] $ResourceGroupName,
    [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9-]{0,58}[a-zA-Z0-9]$')][string] $WebAppName,
    [Parameter(Mandatory)][string] $PackagePath,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string] $ExpectedSha256,
    [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string] $ApprovalReference,
    [switch] $Apply
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($SubscriptionId -eq [guid]::Empty -or [string]::IsNullOrWhiteSpace($ApprovalReference)) {
    throw 'An explicit subscription and code-deployment review reference are required.'
}
$artifact = & (Join-Path $PSScriptRoot 'Test-AppServicePackage.ps1') -Path $PackagePath
if ($artifact.SHA256 -ine $ExpectedSha256) { throw 'The source ZIP no longer matches the reviewed SHA-256.' }
if (-not $Apply) {
    Write-Output 'Artifact and explicit target validated. No Azure calls; -Apply requires separate deployment authorization.'
    return
}
$help = & az webapp deploy --help
if ($LASTEXITCODE -ne 0 -or ($help -join "`n") -notmatch '--track-status') {
    throw 'This Azure CLI must support webapp deploy --track-status; update tooling separately.'
}
$raw = & az webapp show --subscription $SubscriptionId --resource-group $ResourceGroupName --name $WebAppName `
    --query '{id:id,host:defaultHostName,httpsOnly:httpsOnly,kind:kind}' --output json --only-show-errors
if ($LASTEXITCODE -ne 0) { throw 'Could not verify the existing App Service target.' }
$app = ($raw -join "`n") | ConvertFrom-Json
if (-not $app.httpsOnly -or $app.kind -notmatch 'linux' -or
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

& az webapp deploy --subscription $SubscriptionId --resource-group $ResourceGroupName --name $WebAppName `
    --src-path $artifact.Path --type zip --async false --track-status false --timeout 600000 `
    --only-show-errors --output none
if ($LASTEXITCODE -ne 0) {
    throw 'Deployment did not report success. It may still finish remotely: inspect deployment logs before retrying; do not change the web tier.'
}
$online = $false
for ($attempt = 0; $attempt -lt 12; $attempt++) {
    try {
        $response = Invoke-WebRequest -Uri "https://$($app.host)/" -TimeoutSec 10 -MaximumRedirection 0 -SkipHttpErrorCheck
        if ($response.StatusCode -eq 200) { $online = $true; break }
    } catch [System.Net.Http.HttpRequestException] {
        Write-Warning "Preview check $($attempt + 1) encountered a network failure; retrying within the bounded window."
    } catch [System.Threading.Tasks.TaskCanceledException] {
        Write-Warning "Preview check $($attempt + 1) timed out; retrying within the bounded window."
    } catch [System.TimeoutException] {
        Write-Warning "Preview check $($attempt + 1) timed out; retrying within the bounded window."
    }
    if ($attempt -lt 11) { Start-Sleep -Seconds 10 }
}
if (-not $online) { throw 'No HTTP 200 within the bounded preview checks. Inspect deployment logs; no automatic retry, rollback or tier change was attempted.' }
Write-Output 'The code-deployment command succeeded and the public preview returned HTTP 200. This does not test database connectivity or identity.'
