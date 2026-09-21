targetScope = 'resourceGroup'

@export()
@sealed()
type EntraAdministrator = {
  @minLength(36)
  @maxLength(36)
  objectId: string
  @minLength(1)
  principalName: string
  principalType: 'User' | 'Group' | 'ServicePrincipal'
}

param location string
@minLength(3)
@maxLength(63)
param serverName string
@minLength(1)
@maxLength(63)
param databaseName string = 'sunsum'
@minLength(36)
@maxLength(36)
param tenantId string
@minLength(36)
@maxLength(36)
param adminObjectId string = '00000000-0000-0000-0000-000000000000'
@minLength(1)
param adminPrincipalName string = '<postgres-admin-principal-name>'
@allowed([
  'User'
  'Group'
  'ServicePrincipal'
])
param adminPrincipalType string = 'Group'
@description('Approved Entra administrators in tenantId. Defaults to the legacy single-admin fields. Incremental deployment does not revoke omitted administrators.')
@minLength(1)
param administrators EntraAdministrator[] = [
  {
    objectId: adminObjectId
    principalName: adminPrincipalName
    principalType: adminPrincipalType
  }
]
@allowed([
  'Burstable'
  'GeneralPurpose'
  'MemoryOptimized'
])
param tier string = 'Burstable'
@description('Explicit separately billable compute. Check this SKU is supported for the tier and region.')
param skuName string = 'Standard_B1ms'
@minValue(32)
@maxValue(16384)
param storageSizeGB int = 32
@allowed([
  '16'
  '17'
])
param postgresVersion string = '17'
param tags object = {}

@export()
func validateDatabaseName(name string) string => length(name) >= 1 && length(name) <= 63 && contains('abcdefghijklmnopqrstuvwxyz', substring(name, 0, min(length(name), 1))) && empty(filter(range(0, length(name)), index => !contains('abcdefghijklmnopqrstuvwxyz0123456789_', substring(name, index, 1)))) && !startsWith(name, 'pg_') && !startsWith(name, 'azure_') && !contains(['postgres', 'public', 'template0', 'template1'], name)
  ? name
  : fail('Database name must be 1-63 lowercase ASCII letters/digits/underscores, start with a letter, and exclude pg_/azure_ prefixes and postgres/public/template0/template1.')

var validatedDatabaseName = validateDatabaseName(databaseName)

func isNonemptyObjectId(objectId string) bool => map(split(objectId, '-'), part => length(part)) == [8, 4, 4, 4, 12] && objectId != '00000000-0000-0000-0000-000000000000' && empty(filter(range(0, length(replace(objectId, '-', ''))), index => !contains('0123456789abcdef', substring(toLower(replace(objectId, '-', '')), index, 1))))

@export()
func validateAdministrators(administrators EntraAdministrator[]) EntraAdministrator[] => !empty(administrators) && empty(filter(administrators, administrator => !isNonemptyObjectId(administrator.objectId) || empty(trim(administrator.principalName)) || contains(administrator.principalName, '<') || contains(administrator.principalName, '>') || contains(administrator.principalName, '\r') || contains(administrator.principalName, '\n') || contains(administrator.principalName, '\t'))) && length(union(map(administrators, administrator => toLower(administrator.objectId)), [])) == length(administrators)
  ? administrators
  : fail('PostgreSQL administrators require at least one entry, nonzero UUIDs, real principal names and unique object IDs.')

var validatedAdministrators = validateAdministrators(administrators)

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: serverName
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: tier
  }
  properties: {
    version: postgresVersion
    createMode: 'Default'
    authConfig: {
      activeDirectoryAuth: 'Enabled'
      passwordAuth: 'Disabled'
      tenantId: tenantId
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
    storage: {
      storageSizeGB: storageSizeGB
      autoGrow: 'Disabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }
}

@batchSize(1)
resource entraAdmin 'Microsoft.DBforPostgreSQL/flexibleServers/administrators@2024-08-01' = [for administrator in validatedAdministrators: {
  parent: server
  name: administrator.objectId
  properties: {
    tenantId: tenantId
    principalName: administrator.principalName
    principalType: administrator.principalType
  }
  dependsOn: [
    minimumTls
  ]
}]

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: server
  name: validatedDatabaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
  dependsOn: [
    entraAdmin
  ]
}

resource secureTransport 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: server
  name: 'require_secure_transport'
  properties: {
    value: 'on'
    source: 'user-override'
  }
}

resource minimumTls 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: server
  name: 'ssl_min_protocol_version'
  properties: {
    value: 'TLSv1.2'
    source: 'user-override'
  }
  dependsOn: [
    secureTransport
  ]
}

// Firewall rules are intentionally absent. Approval is a separate deployment.
output name string = server.name
output fqdn string = server.properties.fullyQualifiedDomainName
