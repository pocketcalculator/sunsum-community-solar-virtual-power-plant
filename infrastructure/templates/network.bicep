@description('Name of the virtual network.')
param virtualNetworkName string = 'vnet-sunsum-solar-dev-centralus'

@description('Location for the network resources. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Address space for the virtual network. No other VNet exists in this subscription, so this range was free to choose; change it if that stops being true.')
param addressPrefix string = '10.20.0.0/16'

@description('Subnet the App Service integrates into. Must be delegated to Microsoft.Web/serverFarms and used by nothing else.')
param appSubnetPrefix string = '10.20.1.0/26'

@description('Subnet holding the storage private endpoint NIC.')
param privateEndpointSubnetPrefix string = '10.20.2.0/28'

param tags object = {
  project: 'sunsum-solar'
  workstream: 'ws2'
  env: 'dev'
  purpose: 'private-blob-access'
}

/*
  The network that makes the storage account reachable at all.

  storage.bicep already creates a private endpoint when it is handed a subnet
  id and a DNS zone id, but nothing created either, so the only documented route
  to the data plane was not actually deployable. This is that missing half.

  Why a private endpoint rather than a firewall rule: publicNetworkAccess is
  pinned to Disabled by the tenant policy StorageAccount_PublicNetwork_Modify,
  which rewrites the property on every write and returns HTTP 200 while doing
  it. No IP rule can be reached, because the rejection happens before network
  ACLs are consulted. A private endpoint bypasses the public endpoint entirely
  rather than trying to poke a hole in it.
*/
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
        /*
          App Service regional VNet integration requires a subnet delegated to
          Microsoft.Web/serverFarms and dedicated to one plan. A /26 is the size
          Microsoft recommends: integration consumes an address per instance and
          more during a scale or slot swap, and the prefix cannot be resized
          after the plan is joined to it.
        */
        name: 'snet-app'
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
        /*
          A private endpoint NIC needs network policies disabled on its subnet,
          otherwise the endpoint deploys but NSG and route rules silently do not
          apply to it the way an operator would expect. Sixteen addresses is
          ample for the one blob endpoint; Azure reserves five of them.
        */
        name: 'snet-privatelink'
        properties: {
          addressPrefix: privateEndpointSubnetPrefix
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

/*
  Without this zone the private endpoint exists but nothing resolves to it.

  The blob endpoint hostname does not change when an account goes private — the
  application keeps asking for <account>.blob.core.windows.net. Azure's public
  DNS answers that with a CNAME to <account>.privatelink.blob.core.windows.net,
  and this zone is what turns that second name into the endpoint's private IP
  for clients inside the VNet. Skip it and lookups fall through to the public
  address, which is exactly what the policy refuses.

  environment() rather than a literal suffix so the template is not wrong in a
  sovereign cloud.
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
    // Nothing in this VNet needs its own hostname registered; the zone exists
    // only to resolve the storage endpoint.
    registrationEnabled: false
  }
}

output virtualNetworkName string = virtualNetwork.name
output appSubnetId string = virtualNetwork.properties.subnets[0].id
output privateEndpointSubnetId string = virtualNetwork.properties.subnets[1].id
output privateDnsZoneId string = privateDnsZone.id
output privateDnsZoneName string = privateDnsZone.name
