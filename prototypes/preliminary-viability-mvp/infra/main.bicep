targetScope = 'resourceGroup'

@description('Deployment region')
param location string = resourceGroup().location

@description('Globally unique short prefix')
param namePrefix string

@description('Pre-built container image, for example ghcr.io/org/sunsum:sha')
param containerImage string

@secure()
@description('Production PostgreSQL SQLAlchemy URL. Store the actual value in Key Vault after bootstrap.')
param databaseUrl string

@description('Azure Maps account client ID used with managed identity')
param azureMapsClientId string = ''

var tags = {
  application: 'sunsum-solar'
  environment: 'pilot'
  dataClassification: 'confidential'
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-logs'
  location: location
  tags: tags
  properties: {
    retentionInDays: 30
    features: { enableLogAccessUsingOnlyResourcePermissions: true }
  }
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${namePrefix}-env'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: take(replace('${namePrefix}files', '-', ''), 24)
  location: location
  tags: tags
  sku: { name: 'Standard_ZRS' }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Disabled'
  }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${namePrefix}-kv'
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enablePurgeProtection: true
    enableSoftDelete: true
    publicNetworkAccess: 'Disabled'
    sku: { family: 'A', name: 'standard' }
  }
}

resource databaseSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'database-url'
  properties: { value: databaseUrl }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-app'
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8000
        transport: 'auto'
        allowInsecure: false
      }
      secrets: [
        { name: 'database-url', keyVaultUrl: databaseSecret.properties.secretUri, identity: 'system' }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: containerImage
          env: [
            { name: 'SUNSUM_ENVIRONMENT', value: 'azure-pilot' }
            { name: 'SUNSUM_DATABASE_URL', secretRef: 'database-url' }
            { name: 'SUNSUM_USE_AZURE_IDENTITY', value: 'true' }
            { name: 'SUNSUM_AZURE_MAPS_CLIENT_ID', value: azureMapsClientId }
          ]
          resources: { cpu: json('0.5'), memory: '1Gi' }
          probes: [
            { type: 'Liveness', httpGet: { path: '/api/health', port: 8000 }, initialDelaySeconds: 10, periodSeconds: 30 }
            { type: 'Readiness', httpGet: { path: '/api/health', port: 8000 }, initialDelaySeconds: 5, periodSeconds: 10 }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

output applicationUrl string = 'https://${app.properties.configuration.ingress.fqdn}'
output managedIdentityPrincipalId string = app.identity.principalId
output keyVaultName string = vault.name
output storageAccountName string = storage.name
