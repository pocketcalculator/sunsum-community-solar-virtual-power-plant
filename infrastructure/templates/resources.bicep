targetScope = 'resourceGroup'

@minLength(1)
@maxLength(32)
param environmentName string
@description('Approved region. No resource-group or subscription defaults are assumed.')
@minLength(1)
param location string
param appServicePlanName string
param webAppName string
@description('Existing is nonmutating: identity/settings/sign-in on an existing app are explicit separate steps. Create deploys the F1 plan and web app.')
@allowed([
  'Existing'
  'Create'
])
param webAppMode string = 'Existing'
param postgresServerName string
@minLength(3)
@maxLength(24)
param storageAccountName string
param databaseName string = 'sunsum'
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

var tags = {
  environment: environmentName
  application: 'sunsum'
}

module postgres './postgres.bicep' = {
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

module storage './storage.bicep' = {
  name: 'storage-${uniqueString(deployment().name)}'
  params: {
    location: location
    storageAccountName: storageAccountName
    tags: tags
  }
}

resource existingWeb 'Microsoft.Web/sites@2024-04-01' existing = if (webAppMode == 'Existing') {
  name: webAppName
}

module web './web.bicep' = if (webAppMode == 'Create') {
  name: 'web-${uniqueString(deployment().name)}'
  params: {
    location: location
    planName: appServicePlanName
    webAppName: webAppName
    databaseHost: postgres.outputs.fqdn
    databaseName: databaseName
    runtimeRoleName: runtimeRoleName
    blobEndpoint: storage.outputs.blobEndpoint
    tags: tags
  }
}

output AZURE_WEB_APP_NAME string = webAppName
output AZURE_WEB_APP_URL string = webAppMode == 'Create' ? web!.outputs.url : 'https://${existingWeb!.properties.defaultHostName}'
output AZURE_WEB_APP_PRINCIPAL_ID string = webAppMode == 'Create' ? web!.outputs.principalId : (existingWeb!.identity.?principalId ?? '')
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
