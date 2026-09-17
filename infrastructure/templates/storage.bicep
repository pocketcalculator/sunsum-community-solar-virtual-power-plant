@description('Storage account name. Globally unique, 3-24 lowercase alphanumeric characters.')
@minLength(3)
@maxLength(24)
param storageAccountName string = 'stsunsumsolardevcus'

@description('Location for the storage account. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Redundancy. LRS is intentional for dev: site documents are re-uploadable and GRS triples the cost for a hackathon environment.')
@allowed(['Standard_LRS', 'Standard_ZRS', 'Standard_GRS'])
param skuName string = 'Standard_LRS'

@description('Days to retain soft-deleted blobs and containers.')
@minValue(1)
@maxValue(365)
param softDeleteRetentionDays int = 7

@description('Object ids to grant Storage Blob Data Contributor on this account. Leave empty to skip; assigning roles needs User Access Administrator or Owner, which plain Contributor does not have.')
param blobDataContributorPrincipalIds array = []

@description('Principal type for the ids above. Use ServicePrincipal for a managed identity and User for a person.')
@allowed(['User', 'ServicePrincipal', 'Group'])
param blobDataContributorPrincipalType string = 'ServicePrincipal'

@description('Resource id of the subnet to place a private endpoint in. Required to reach this account at all — see the note on publicNetworkAccess below. Leave empty to skip.')
param privateEndpointSubnetId string = ''

@description('Resource id of the private DNS zone for blob private link (privatelink.blob, in this cloud suffix) to register the endpoint in. Optional.')
param privateDnsZoneId string = ''

param tags object = {
  project: 'sunsum-solar'
  workstream: 'ws2'
  env: 'dev'
  purpose: 'site-documents'
}

/*
  Site documents: electricity bills, site photos, and later the screening,
  summary and land reports.

  Shared keys are disabled, so the only way in is Entra plus RBAC. That is why
  no connection string or account key appears anywhere in this template, in the
  application, or in app settings — there is nothing to leak or rotate.
*/
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: skuName
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    // Documents are owner-private or disclosed to a named investor tier; none
    // of them are public, and anonymous access is refused at the account level
    // so a mis-set container cannot open them up.
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    /*
      Disabled, deliberately, and not negotiable from inside this template.

      A tenant policy with a modify effect — StorageAccount_PublicNetwork_Modify
      — rewrites this property to Disabled on every create and every update. A
      PATCH setting it to Enabled returns HTTP 200 and the value stays Disabled;
      nothing errors. Declaring Enabled here would therefore produce a template
      that never converges and a what-if that always shows drift.

      Two sibling policies enforce the other settings above the same way:
      StorageAccount_DisableLocalAuth_Modify (allowSharedKeyAccess) and
      StorageAccount_BlobAnonymousAccess_Modify (allowBlobPublicAccess).

      The consequence is that the account is unreachable over the public
      internet: an unauthenticated request to the blob endpoint is rejected with
      AuthorizationFailure at the network layer, before any token is evaluated.
      Reaching it requires the private endpoint below.
    */
    publicNetworkAccess: 'Disabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
    encryption: {
      keySource: 'Microsoft.Storage'
      services: {
        blob: {
          enabled: true
          keyType: 'Account'
        }
      }
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: softDeleteRetentionDays
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: softDeleteRetentionDays
    }
  }
}

/*
  One container per disclosure class, matching DOCUMENT_CONTAINERS in
  src/backend/core/documents/storage.ts.

  The application already enforces disclosure on every read. Splitting the
  containers puts a second boundary underneath that check: a credential scoped
  to investor-tier-1 cannot name a blob in owner-private at all, so an
  authorization bug in the application cannot by itself expose an owner's
  electricity bill.
*/
var containerNames = [
  'owner-private'
  'investor-tier-1'
]

resource containers 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = [
  for name in containerNames: {
    parent: blobService
    name: name
    properties: {
      publicAccess: 'None'
    }
  }
]

// Storage Blob Data Contributor. Built-in role ids are constant across clouds.
var blobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

resource blobDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for principalId in blobDataContributorPrincipalIds: {
    name: guid(storageAccount.id, principalId, blobDataContributorRoleId)
    scope: storageAccount
    properties: {
      roleDefinitionId: subscriptionResourceId(
        'Microsoft.Authorization/roleDefinitions',
        blobDataContributorRoleId
      )
      principalId: principalId
      principalType: blobDataContributorPrincipalType
    }
  }
]

/*
  The only route to the data plane, given publicNetworkAccess is pinned to
  Disabled by policy. Skipped by default because it needs a subnet, and the
  smoke App Service currently runs on a Free F1 plan, which cannot do VNet
  integration at all — lighting this up means moving that plan to Basic or
  higher first.
*/
resource privateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = if (privateEndpointSubnetId != '') {
  name: '${storageAccountName}-blob-pe'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: '${storageAccountName}-blob'
        properties: {
          privateLinkServiceId: storageAccount.id
          groupIds: ['blob']
        }
      }
    ]
  }
}

resource privateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = if (privateEndpointSubnetId != '' && privateDnsZoneId != '') {
  parent: privateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'privatelink-blob'
        properties: {
          privateDnsZoneId: privateDnsZoneId
        }
      }
    ]
  }
}

output storageAccountName string = storageAccount.name
output blobEndpoint string = storageAccount.properties.primaryEndpoints.blob
output containerNames array = containerNames