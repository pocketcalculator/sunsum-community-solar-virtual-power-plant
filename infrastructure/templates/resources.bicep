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

module web './web.bicep' = {
  name: 'web-${uniqueString(deployment().name)}'
  params: {
    location: location
    planName: appServicePlanName
    webAppName: webAppName
    databaseHost: postgres.outputs.fqdn
    databaseName: databaseName
    runtimeRoleName: runtimeRoleName
    tags: tags
  }
}

output AZURE_WEB_APP_NAME string = web.outputs.name
output AZURE_WEB_APP_URL string = web.outputs.url
output AZURE_WEB_APP_PRINCIPAL_ID string = web.outputs.principalId
output AZURE_POSTGRES_SERVER_NAME string = postgres.outputs.name
output PGHOST string = postgres.outputs.fqdn
output PGPORT string = '5432'
output PGDATABASE string = databaseName
output PGUSER string = runtimeRoleName
output PGSSLMODE string = 'verify-full'
output SUNSUM_DATABASE_AUTH string = 'managed-identity'
