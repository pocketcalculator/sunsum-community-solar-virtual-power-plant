targetScope = 'resourceGroup'

@minLength(1)
param location string
@minLength(3)
@maxLength(24)
param storageAccountName string
param tags object = {}
@description('Closed by default. AuthenticatedPublic requires an explicit tenant-policy approval; containers and shared keys remain private/disabled.')
@allowed([
  'Closed'
  'AuthenticatedPublic'
])
param networkMode string = 'Closed'
@description('Nonsecret policy/review reference. An empty value leaves the firewall closed, even when public mode is requested.')
@maxLength(200)
param publicEndpointApproval string = ''

resource storage 'Microsoft.Storage/storageAccounts@2024-01-01' = {
  name: storageAccountName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      bypass: 'None'
      defaultAction: networkMode == 'AuthenticatedPublic' && !empty(publicEndpointApproval) ? 'Allow' : 'Deny'
      ipRules: []
      virtualNetworkRules: []
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2024-01-01' = {
  parent: storage
  name: 'default'
  properties: {
    isVersioningEnabled: false
  }
}

resource siteDocuments 'Microsoft.Storage/storageAccounts/blobServices/containers@2024-01-01' = {
  parent: blobService
  name: 'site-documents'
  properties: {
    publicAccess: 'None'
  }
}

resource projectDocuments 'Microsoft.Storage/storageAccounts/blobServices/containers@2024-01-01' = {
  parent: blobService
  name: 'project-documents'
  properties: {
    publicAccess: 'None'
  }
}

output storageAccountId string = storage.id
output blobEndpoint string = storage.properties.primaryEndpoints.blob
output siteDocumentsContainerId string = siteDocuments.id
output projectDocumentsContainerId string = projectDocuments.id
output networkAccessEnabled bool = networkMode == 'AuthenticatedPublic' && !empty(publicEndpointApproval)
