/*
  One deploy for the whole document-storage path.

  Two shapes, chosen by enablePrivateBlobAccess:

  - false (default) — storage account and containers only. This is the state the
    resource group is in today: the account exists, and its data plane is
    unreachable because tenant policy pins publicNetworkAccess to Disabled.
    Deploying this changes nothing and costs nothing.

  - true — additionally builds the network that makes the data plane reachable:
    a VNet, a private endpoint, private DNS, and App Service VNet integration.
    This moves the App Service plan off Free F1, which bills, so it is opt-in
    rather than the default.

  The flag defaults to false deliberately. The alternative to the private path
  is a policy exemption, which nobody in this workstream can grant — see
  ../docs/blob-storage.md and ../docs/policy-exemption-request.md.
*/

targetScope = 'resourceGroup'

@description('Storage account name. Globally unique, 3-24 lowercase alphanumeric characters.')
@minLength(3)
@maxLength(24)
param storageAccountName string = 'stsunsumsolardevcus'

@description('Location for all resources. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Build the VNet, private endpoint, DNS and App Service integration that make the blob data plane reachable. Off by default because it moves the App Service plan to a billed SKU.')
param enablePrivateBlobAccess bool = false

@description('Existing App Service to integrate into the VNet. Only used when enablePrivateBlobAccess is true.')
param appServiceName string = 'app-sunsum-smoke-928e5e28'

@description('Existing App Service plan. Only used when enablePrivateBlobAccess is true, and only to raise its SKU.')
param appServicePlanName string = 'asp-sunsum-smoke-free'

@description('SKU to move the plan to. Free and Shared tiers cannot do regional VNet integration at all, so the private path needs at least Basic.')
@allowed(['B1', 'B2', 'P0v3', 'P1v3'])
param appServicePlanSku string = 'B1'

@description('Object ids to grant Storage Blob Data Contributor. Needs User Access Administrator or Owner to apply; plain Contributor cannot.')
param blobDataContributorPrincipalIds array = []

@description('Principal type for the ids above. ServicePrincipal covers a managed identity.')
@allowed(['User', 'ServicePrincipal', 'Group'])
param blobDataContributorPrincipalType string = 'ServicePrincipal'

param tags object = {
  project: 'sunsum-solar'
  workstream: 'ws2'
  env: 'dev'
}

module network 'network.bicep' = if (enablePrivateBlobAccess) {
  name: 'sunsum-network'
  params: {
    location: location
    tags: union(tags, { purpose: 'private-blob-access' })
  }
}

/*
  The account itself. storage.bicep is the shared definition — shared keys and
  anonymous access disabled, public network access closed unless an approval
  reference is supplied — and it owns the two containers the deployment
  workstream provisions. Everything this workstream adds on top of that account
  is declared below, against an existing reference, so neither template
  redefines what the other owns.
*/
module storage 'storage.bicep' = {
  name: 'sunsum-storage'
  params: {
    storageAccountName: storageAccountName
    location: location
    tags: union(tags, { purpose: 'site-documents' })
  }
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2024-01-01' existing = {
  name: storageAccountName
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2024-01-01' existing = {
  parent: storageAccount
  name: 'default'
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
var documentContainerNames = [
  'owner-private'
  'investor-tier-1'
]

resource documentContainers 'Microsoft.Storage/storageAccounts/blobServices/containers@2024-01-01' = [
  for name in documentContainerNames: {
    parent: blobService
    name: name
    properties: {
      publicAccess: 'None'
    }
    dependsOn: [
      storage
    ]
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
    dependsOn: [
      storage
    ]
  }
]

/*
  The only route to the data plane, given publicNetworkAccess is pinned to
  Disabled by policy. Skipped by default because it needs a subnet, and the
  smoke App Service currently runs on a Free F1 plan, which cannot do VNet
  integration at all.

  The ?: on the subnet and zone ids is required rather than stylistic: a module
  output cannot be referenced at all when the module did not deploy.
*/
resource privateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = if (enablePrivateBlobAccess) {
  name: '${storageAccountName}-blob-pe'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: enablePrivateBlobAccess ? network!.outputs.privateEndpointSubnetId : ''
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
  dependsOn: [
    storage
  ]
}

resource privateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = if (enablePrivateBlobAccess) {
  parent: privateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'privatelink-blob'
        properties: {
          privateDnsZoneId: enablePrivateBlobAccess ? network!.outputs.privateDnsZoneId : ''
        }
      }
    ]
  }
}

/*
  Raising the plan SKU is the prerequisite for everything below it: Free and
  Shared tiers do not offer regional VNet integration, so without this the
  integration below fails rather than degrading.

  Declared with only the properties that define the tier. The App Service itself
  is deliberately not declared anywhere in this template — it was created
  outside Bicep and carries app settings this workstream does not own, and
  declaring a site replaces its settings list wholesale.
*/
resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = if (enablePrivateBlobAccess) {
  name: appServicePlanName
  location: location
  tags: tags
  kind: 'linux'
  sku: {
    name: appServicePlanSku
  }
  properties: {
    // The existing plan is Linux; a Linux plan is invalid without this.
    reserved: true
  }
}

resource appService 'Microsoft.Web/sites@2023-12-01' existing = {
  name: appServiceName
}

/*
  Joins the App Service to the VNet so its outbound calls to the storage
  endpoint resolve through the private DNS zone and reach the private endpoint.

  A child resource on an existing site rather than a site declaration, so app
  settings, deployment configuration and the current release are untouched.
*/
resource vnetIntegration 'Microsoft.Web/sites/networkConfig@2023-12-01' = if (enablePrivateBlobAccess) {
  parent: appService
  name: 'virtualNetwork'
  properties: {
    subnetResourceId: enablePrivateBlobAccess ? network!.outputs.appSubnetId : ''
    swiftSupported: true
  }
  dependsOn: [
    appServicePlan
  ]
}

output storageAccountName string = storageAccountName
output blobEndpoint string = storage.outputs.blobEndpoint
output containerNames array = documentContainerNames
output privateBlobAccessEnabled bool = enablePrivateBlobAccess

@description('Empty until the App Service is given a managed identity. That is the one step this template cannot take, because identity is a property of the site.')
output remainingManualSteps array = enablePrivateBlobAccess
  ? [
      'az webapp identity assign --name ${appServiceName} --resource-group ${resourceGroup().name}'
      'Re-run this template with blobDataContributorPrincipalIds=["<the printed principalId>"]'
      'az webapp config appsettings set --name ${appServiceName} --resource-group ${resourceGroup().name} --settings SUNSUM_BLOB=azure AZURE_STORAGE_ACCOUNT_NAME=${storageAccountName}'
    ]
  : [
      'Private blob access is off. The data plane stays unreachable and SUNSUM_BLOB must remain memory or azurite.'
    ]
