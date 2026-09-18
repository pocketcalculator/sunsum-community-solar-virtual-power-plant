targetScope = 'resourceGroup'

@minLength(3)
@maxLength(63)
param postgresServerName string

@description('Nonsecret review/ticket reference retained in the deployment record.')
@minLength(1)
@maxLength(200)
param approvalReference string

@description('Approved canonical public IPv4 addresses. Both this template and Set-PostgresFirewall.ps1 reject unsafe addresses; an invalid list fails rather than creating a subset of rules.')
@maxLength(128)
param approvedIpv4Addresses string[] = []

func isAllowedNetwork(octets int[]) bool => !contains([
  octets[0] == 0 || octets[0] == 10 || octets[0] == 127 || octets[0] >= 224
  octets[0] == 100 && octets[1] >= 64 && octets[1] <= 127
  octets[0] == 169 && octets[1] == 254
  octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31
  octets[0] == 192 && (octets[1] == 168 || (octets[1] == 0 && (octets[2] == 0 || octets[2] == 2)))
  octets[0] == 198 && (octets[1] == 18 || octets[1] == 19 || (octets[1] == 51 && octets[2] == 100))
  octets[0] == 203 && octets[1] == 0 && octets[2] == 113
], true)

func isCanonicalPublicIpv4(address string) bool => length(split(address, '.')) == 4
  ? (empty(filter(split(address, '.'), octet => !contains(map(range(0, 256), number => string(number)), octet)))
    ? isAllowedNetwork(map(split(address, '.'), octet => int(octet)))
    : false)
  : false

@export()
func validateFirewallAddresses(addresses string[]) string[] => length(addresses) <= 128 && length(union(addresses, addresses)) == length(addresses) && empty(filter(addresses, address => !isCanonicalPublicIpv4(address)))
  ? addresses
  : fail('Firewall addresses must be unique canonical public IPv4 values (maximum 128); private, reserved, documentation and Azure-wide bypass addresses are forbidden.')

var validatedAddresses = validateFirewallAddresses(approvedIpv4Addresses)

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' existing = {
  name: postgresServerName
}

resource rules 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = [for address in validatedAddresses: {
  parent: server
  name: 'sunsum-${replace(address, '.', '-')}'
  properties: {
    startIpAddress: address
    endIpAddress: address
  }
}]

output APPROVAL_REFERENCE string = approvalReference
