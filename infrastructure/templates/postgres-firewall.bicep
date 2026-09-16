targetScope = 'resourceGroup'

@minLength(3)
@maxLength(63)
param postgresServerName string

@description('Nonsecret review/ticket reference retained in the deployment record.')
@minLength(1)
@maxLength(200)
param approvalReference string

@description('Approved individual public IPv4 addresses, validated by Set-PostgresFirewall.ps1. Never pass CIDRs, ranges or the Azure-wide 0.0.0.0 bypass.')
@maxLength(128)
param approvedIpv4Addresses string[] = []

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' existing = {
  name: postgresServerName
}

resource rules 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = [for address in approvedIpv4Addresses: {
  parent: server
  name: 'sunsum-${replace(address, '.', '-')}'
  properties: {
    startIpAddress: address
    endIpAddress: address
  }
}]

output APPROVAL_REFERENCE string = approvalReference
