targetScope = 'resourceGroup'

@minLength(1)
@maxLength(32)
param environmentName string
@description('Approved region. No resource-group or subscription defaults are assumed.')
@minLength(1)
param location string
param appServicePlanName string
param webAppName string
param postgresServerName string
@minLength(3)
@maxLength(24)
param storageAccountName string
param databaseName string = 'sunsum'
@description('Designated SQL role returned in operator connection outputs, not installed as app settings. Its Entra mapping and non-admin privileges must be verified by separate SQL bootstrap.')
@allowed([
  'sunsum_runtime'
])
param runtimeRoleName string = 'sunsum_runtime'

@minLength(36)
@maxLength(36)
param tenantId string
@minLength(36)
@maxLength(36)
param postgresAdminObjectId string
param postgresAdminPrincipalName string
@allowed([
  'User'
  'Group'
  'ServicePrincipal'
])
param postgresAdminPrincipalType string = 'Group'
@allowed([
  'Burstable'
  'GeneralPurpose'
  'MemoryOptimized'
])
param postgresTier string = 'Burstable'
param postgresSkuName string = 'Standard_B1ms'
@minValue(32)
@maxValue(16384)
param postgresStorageSizeGB int = 32
@allowed([
  '16'
  '17'
])
param postgresVersion string = '17'

@description('Create the separately billable Log Analytics workspace, workspace-based Application Insights component and platform diagnostic settings. Off by default so existing reviewed deployments keep their current resource set and cost.')
param enableObservability bool = false
@minLength(4)
@maxLength(63)
param logAnalyticsWorkspaceName string = 'log-sunsum-${environmentName}-${location}'
@minLength(1)
@maxLength(255)
param applicationInsightsName string = 'appi-sunsum-${environmentName}-${location}'
@description('Log Analytics retention in days. 30 is the included minimum.')
@minValue(30)
@maxValue(730)
param logAnalyticsRetentionDays int = 30
@description('Explicit daily Log Analytics ingestion cap in GB. A cost guard, not a service guarantee.')
@minValue(1)
@maxValue(100)
param logAnalyticsDailyQuotaGb int = 1

@description('Create the virtual network, blob private endpoint, private DNS zone/link and App Service virtual-network integration. Off by default; the network, endpoint and its interface are separately billable and the address space must be known free.')
param enablePrivateNetworking bool = false
@minLength(2)
@maxLength(64)
param virtualNetworkName string = 'vnet-sunsum-${environmentName}-${location}'
@description('Virtual network address space. Confirm the range is unused in the subscription before deploying.')
param virtualNetworkAddressPrefix string = '10.30.0.0/16'
@description('Subnet delegated to Microsoft.Web/serverFarms for App Service integration. It cannot be resized after the plan joins it.')
param appSubnetPrefix string = '10.30.1.0/26'
@description('Subnet holding the blob private endpoint network interface.')
param privateEndpointSubnetPrefix string = '10.30.2.0/28'

@description('Opt in only with role-assignment write permissions. False leaves existing assignments untouched in Incremental mode.')
param deployRbac bool = false
@description('Approved system-assigned principal ID of the target web app. Required when deployRbac is true; obtain it after provisioning a new app.')
@maxLength(36)
param approvedWebPrincipalId string = ''
@description('Nonsecret approval for Contributor access to the two document containers. Required when deployRbac is true.')
@maxLength(200)
param blobRoleApprovalReference string = ''

var tags = {
  environment: environmentName
  application: 'sunsum'
}

module postgres './modules/postgres.bicep' = {
  name: 'postgres-${uniqueString(deployment().name)}'
  params: {
    location: location
    serverName: postgresServerName
    databaseName: databaseName
    tenantId: tenantId
    adminObjectId: postgresAdminObjectId
    adminPrincipalName: postgresAdminPrincipalName
    adminPrincipalType: postgresAdminPrincipalType
    tier: postgresTier
    skuName: postgresSkuName
    storageSizeGB: postgresStorageSizeGB
    postgresVersion: postgresVersion
    tags: tags
  }
}

module storage './modules/storage.bicep' = {
  name: 'storage-${uniqueString(deployment().name)}'
  params: {
    location: location
    storageAccountName: storageAccountName
    tags: tags
  }
}

/*
  The network is created before the site so App Service integration and the
  blob private endpoint are in place in the same deployment. It reads the
  storage account by name, so the storage module must finish first.
*/
module privateNetwork './modules/private-network.bicep' = if (enablePrivateNetworking) {
  name: 'network-${uniqueString(deployment().name)}'
  params: {
    location: location
    virtualNetworkName: virtualNetworkName
    addressPrefix: virtualNetworkAddressPrefix
    appSubnetPrefix: appSubnetPrefix
    privateEndpointSubnetPrefix: privateEndpointSubnetPrefix
    storageAccountName: storageAccountName
    tags: tags
  }
  dependsOn: [
    storage
  ]
}

/*
  The workspace and telemetry component precede the site because the site reads
  the component's connection string directly. The connection string is never
  returned as a deployment output.
*/
module observability './modules/observability.bicep' = if (enableObservability) {
  name: 'observability-${uniqueString(deployment().name)}'
  params: {
    location: location
    workspaceName: logAnalyticsWorkspaceName
    applicationInsightsName: applicationInsightsName
    retentionInDays: logAnalyticsRetentionDays
    dailyQuotaGb: logAnalyticsDailyQuotaGb
    tags: tags
  }
}

module web './modules/web.bicep' = {
  name: 'web-${uniqueString(deployment().name)}'
  params: {
    location: location
    planName: appServicePlanName
    webAppName: webAppName
    blobEndpoint: storage.outputs.blobEndpoint
    telemetryComponentName: enableObservability ? applicationInsightsName : ''
    appSubnetId: enablePrivateNetworking ? privateNetwork!.outputs.appSubnetId : ''
    tags: tags
  }
  dependsOn: [
    observability
  ]
}

module diagnostics './modules/diagnostics.bicep' = if (enableObservability) {
  name: 'diagnostics-${uniqueString(deployment().name)}'
  params: {
    workspaceId: observability!.outputs.workspaceId
    webAppName: webAppName
    postgresServerName: postgresServerName
  }
  dependsOn: [
    web
    postgres
  ]
}

module blobRoles './storage-role-grants.bicep' = if (deployRbac) {
  name: 'blob-roles-${uniqueString(deployment().name)}'
  params: {
    storageAccountName: storageAccountName
    webAppName: web.outputs.name
    approvedWebPrincipalId: approvedWebPrincipalId
    blobDataAccess: 'Contributor'
    approvalReference: blobRoleApprovalReference
  }
}

output RBAC_REQUESTED bool = deployRbac
output BLOB_ROLE_ASSIGNMENT_IDS array = deployRbac ? blobRoles!.outputs.roleAssignmentIds : []
output AZURE_WEB_APP_NAME string = webAppName
output AZURE_WEB_APP_URL string = web.outputs.url
output AZURE_WEB_APP_PRINCIPAL_ID string = web.outputs.principalId
output AZURE_POSTGRES_SERVER_NAME string = postgres.outputs.name
output AZURE_STORAGE_ACCOUNT_NAME string = storageAccountName
output AZURE_STORAGE_BLOB_ENDPOINT string = storage.outputs.blobEndpoint
output SITE_DOCUMENTS_CONTAINER string = 'site-documents'
output PROJECT_DOCUMENTS_CONTAINER string = 'project-documents'
output PGHOST string = postgres.outputs.fqdn
output PGPORT string = '5432'
output PGDATABASE string = databaseName
output PGUSER string = runtimeRoleName
output PGSSLMODE string = 'verify-full'
output SUNSUM_DATABASE_AUTH string = 'managed-identity'
output AZURE_OBSERVABILITY_ENABLED bool = enableObservability
output AZURE_LOG_ANALYTICS_WORKSPACE_NAME string = enableObservability ? observability!.outputs.workspaceName : ''
output AZURE_APPLICATION_INSIGHTS_NAME string = enableObservability ? observability!.outputs.applicationInsightsName : ''
output AZURE_DIAGNOSTIC_SETTING_NAME string = enableObservability ? diagnostics!.outputs.webDiagnosticSettingName : ''
output AZURE_PRIVATE_NETWORKING_ENABLED bool = enablePrivateNetworking
output AZURE_VIRTUAL_NETWORK_NAME string = enablePrivateNetworking ? privateNetwork!.outputs.virtualNetworkName : ''
output AZURE_BLOB_PRIVATE_ENDPOINT_NAME string = enablePrivateNetworking ? privateNetwork!.outputs.blobPrivateEndpointName : ''
output AZURE_BLOB_PRIVATE_DNS_ZONE_NAME string = enablePrivateNetworking ? privateNetwork!.outputs.privateDnsZoneName : ''
output AZURE_PRIVATE_DNS_ZONE_LINK_NAME string = enablePrivateNetworking ? privateNetwork!.outputs.privateDnsZoneLinkName : ''
