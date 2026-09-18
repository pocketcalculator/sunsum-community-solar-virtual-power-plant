targetScope = 'resourceGroup'

param location string
@minLength(1)
@maxLength(40)
param planName string
@minLength(2)
@maxLength(60)
param webAppName string
param blobEndpoint string
param tags object = {}

/*
Plan creation is retained for a later change; dev currently reuses an existing plan.
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
*/

resource existingPlan 'Microsoft.Web/serverfarms@2024-04-01' existing = {
  name: planName
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
    // serverFarmId: plan.id
    serverFarmId: existingPlan.id
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
          name: 'SUNSUM_STORE'
          value: 'mock'
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
