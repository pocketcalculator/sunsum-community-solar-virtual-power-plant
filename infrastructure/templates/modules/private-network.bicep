/*
  The private path from the web app to the storage data plane.

  storage.bicep leaves publicNetworkAccess Disabled and the network ACL default
  action Deny, which is also what tenant policy pins, so the blob endpoint is
  only reachable from inside a virtual network through a private endpoint. This
  module creates that network and the endpoint together, because the endpoint
  without its DNS zone resolves to the public address and the zone without a
  virtual-network link resolves for nobody.

  It is opt-in at the root: a virtual network, a private endpoint and its
  network interface are separately billable, and the address space has to be
  chosen deliberately rather than defaulted into an occupied range.

  PostgreSQL deliberately gets no private endpoint here. Its documented posture
  is public network access with separately approved individual firewall rules
  (postgres-firewall.bicep); moving it behind private link is a reviewed
  architecture change, not a side effect of adding observability.
*/

targetScope = 'resourceGroup'

@minLength(1)
param location string
@minLength(2)
@maxLength(64)
param virtualNetworkName string
@description('Address space for the virtual network. Confirm the range is free in the subscription; overlapping ranges break routing rather than failing deployment.')
param addressPrefix string
@description('Subnet the App Service integrates into. Delegated to Microsoft.Web/serverFarms and usable by one plan only. It cannot be resized after a plan joins it.')
param appSubnetPrefix string
@description('Subnet holding the private endpoint network interface. Azure reserves five addresses in any subnet.')
param privateEndpointSubnetPrefix string
@minLength(3)
@maxLength(24)
param storageAccountName string
param tags object = {}

var appSubnetName = 'snet-app'
var privateEndpointSubnetName = 'snet-privatelink'
var blobPrivateEndpointName = 'pe-${storageAccountName}-blob'

resource virtualNetwork 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: virtualNetworkName
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [addressPrefix]
    }
    subnets: [
      {
        name: appSubnetName
        properties: {
          addressPrefix: appSubnetPrefix
          delegations: [
            {
              name: 'serverfarm-delegation'
              properties: {
                serviceName: 'Microsoft.Web/serverFarms'
              }
            }
          ]
        }
      }
      {
        name: privateEndpointSubnetName
        properties: {
          addressPrefix: privateEndpointSubnetPrefix
          // Private endpoint network interfaces require network policies off,
          // otherwise the endpoint deploys while route and NSG rules are not
          // applied to it the way an operator would expect.
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

/*
  The application keeps requesting <account>.blob.<storage suffix>. Azure public
  DNS answers with a CNAME into privatelink.blob.<storage suffix>, and this zone
  is what turns that name into the endpoint's private address for clients in the
  virtual network. environment() rather than a literal suffix so the template is
  not wrong in a sovereign cloud.
*/
resource privateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'privatelink.blob.${environment().suffixes.storage}'
  location: 'global'
  tags: tags
}

resource privateDnsZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: privateDnsZone
  name: '${virtualNetworkName}-link'
  location: 'global'
  tags: tags
  properties: {
    virtualNetwork: {
      id: virtualNetwork.id
    }
    // Nothing in this network needs its own registered hostname; the zone
    // exists only to resolve the storage endpoint.
    registrationEnabled: false
  }
}

/*
  Named references rather than positions in the inline subnet array, so
  inserting or reordering a subnet cannot silently repoint the private endpoint
  at the delegated App Service subnet. Only resource ids are read, so these add
  no deployment-time read while still ordering consumers after the network.
*/
resource appSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-11-01' existing = {
  parent: virtualNetwork
  name: appSubnetName
}

resource privateEndpointSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-11-01' existing = {
  parent: virtualNetwork
  name: privateEndpointSubnetName
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2024-01-01' existing = {
  name: storageAccountName
}

resource blobPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: blobPrivateEndpointName
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateEndpointSubnet.id
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

resource blobPrivateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = {
  parent: blobPrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'privatelink-blob'
        properties: {
          privateDnsZoneId: privateDnsZone.id
        }
      }
    ]
  }
  dependsOn: [
    privateDnsZoneLink
  ]
}

output virtualNetworkName string = virtualNetwork.name
output appSubnetId string = appSubnet.id
output privateEndpointSubnetId string = privateEndpointSubnet.id
output privateDnsZoneName string = privateDnsZone.name
output privateDnsZoneLinkName string = privateDnsZoneLink.name
output blobPrivateEndpointName string = blobPrivateEndpoint.name
