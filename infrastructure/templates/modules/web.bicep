targetScope = 'resourceGroup'

param location string
@minLength(1)
@maxLength(40)
param planName string
@minLength(2)
@maxLength(60)
param webAppName string
param blobEndpoint string
@description('Existing telemetry component supplying APPLICATIONINSIGHTS_CONNECTION_STRING. Empty leaves the site without a telemetry connection string; the value is read here rather than passed through a deployment output.')
param telemetryComponentName string = ''
@description('Delegated subnet for regional virtual-network integration. Empty leaves the site without integration, which is the current dev-test behavior.')
param appSubnetId string = ''
param tags object = {}

resource telemetry 'Microsoft.Insights/components@2020-02-02' existing = if (!empty(telemetryComponentName)) {
  name: telemetryComponentName
}

var telemetrySettings = empty(telemetryComponentName)
  ? []
  : [
      {
        name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
        value: telemetry!.properties.ConnectionString
      }
    ]

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: planName
  location: location
  kind: 'linux'
  tags: tags
  sku: {
    name: 'B1'
    tier: 'Basic'
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
    virtualNetworkSubnetId: empty(appSubnetId) ? null : appSubnetId
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: 'npm run start -- --hostname 0.0.0.0'
      alwaysOn: false
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      http20Enabled: true
      appSettings: concat([
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
      ], telemetrySettings)
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
output virtualNetworkIntegrated bool = !empty(appSubnetId)
