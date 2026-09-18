targetScope = 'resourceGroup'

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
param adminObjectId string
@minLength(1)
param adminPrincipalName string
@allowed([
  'User'
  'Group'
  'ServicePrincipal'
])
param adminPrincipalType string = 'Group'
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

resource entraAdmin 'Microsoft.DBforPostgreSQL/flexibleServers/administrators@2024-08-01' = {
  parent: server
  name: adminObjectId
  properties: {
    tenantId: tenantId
    principalName: adminPrincipalName
    principalType: adminPrincipalType
  }
}

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
}

// Firewall rules are intentionally absent. Approval is a separate deployment.
output name string = server.name
output fqdn string = server.properties.fullyQualifiedDomainName
