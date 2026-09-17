targetScope = 'resourceGroup'

param location string
@minLength(1)
@maxLength(40)
param planName string
@minLength(2)
@maxLength(60)
param webAppName string
param databaseHost string
param blobEndpoint string
@minLength(1)
@maxLength(63)
param databaseName string
@description('Designated runtime SQL role; role naming does not establish its Entra mapping or privileges.')
@allowed([
  'sunsum_runtime'
])
@minLength(1)
@maxLength(63)
param runtimeRoleName string = 'sunsum_runtime'
param tags object = {}

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: planName
  location: location
  kind: 'linux'
  tags: tags
  sku: {
    name: 'F1'
    tier: 'Free'
    capacity: 1
  }
  properties: {
    reserved: true
  }
}

resource web 'Microsoft.Web/sites@2024-04-01' = {
  name: webAppName
  location: location
  kind: 'app,linux'
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: 'npm run start -- --hostname 0.0.0.0'
      alwaysOn: false
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      http20Enabled: true
      appSettings: [
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
        {
          name: 'CUSTOM_BUILD_COMMAND'
          value: 'npm ci --include=dev && npm run build'
        }
        {
          name: 'NPM_CONFIG_ENGINE_STRICT'
          value: 'true'
        }
        {
          name: 'SUNSUM_DATABASE_AUTH'
          value: 'managed-identity'
        }
        {
          name: 'PGHOST'
          value: databaseHost
        }
        {
          name: 'PGPORT'
          value: '5432'
        }
        {
          name: 'PGDATABASE'
          value: databaseName
        }
        {
          name: 'PGUSER'
          value: runtimeRoleName
        }
        {
          name: 'PGSSLMODE'
          value: 'verify-full'
        }
        {
          name: 'AZURE_STORAGE_BLOB_ENDPOINT'
          value: blobEndpoint
        }
        {
          name: 'SITE_DOCUMENTS_CONTAINER'
          value: 'site-documents'
        }
        {
          name: 'PROJECT_DOCUMENTS_CONTAINER'
          value: 'project-documents'
        }
      ]
    }
  }
}

resource ftpPolicy 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-04-01' = {
  parent: web
  name: 'ftp'
  properties: {
    allow: false
  }
}

resource scmPolicy 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-04-01' = {
  parent: web
  name: 'scm'
  properties: {
    allow: false
  }
}

output name string = web.name
output url string = 'https://${web.properties.defaultHostName}'
output principalId string = web.identity.principalId
