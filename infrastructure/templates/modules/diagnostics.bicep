/*
  Platform diagnostics for resources the root template already owns.

  Split from observability.bicep so the dependency order stays one-directional:
  the workspace and the Application Insights component are created first, the
  web app reads the component's connection string, and only then are diagnostic
  settings attached to the deployed site and PostgreSQL server. Declaring the
  settings next to the workspace would require the workspace module to depend on
  the web module and the web module to depend on the workspace module.

  The settings are child resources on existing references, so no property of the
  site or the server is redeclared here.

  PostgreSQL is in scope for diagnostics even though private-network.bicep
  deliberately leaves it off private link: sending its platform logs to the
  workspace changes no network posture.
*/

targetScope = 'resourceGroup'

@minLength(1)
param workspaceId string
@minLength(2)
@maxLength(60)
param webAppName string
@minLength(3)
@maxLength(63)
param postgresServerName string
@description('Diagnostic setting name used for both resources; it is unique per parent resource.')
@minLength(1)
@maxLength(260)
param settingName string = 'send-to-log-analytics'

resource web 'Microsoft.Web/sites@2024-04-01' existing = {
  name: webAppName
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' existing = {
  name: postgresServerName
}

resource webDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: web
  name: settingName
  properties: {
    workspaceId: workspaceId
    logs: [
      {
        category: 'AppServiceHTTPLogs'
        enabled: true
      }
      {
        category: 'AppServiceConsoleLogs'
        enabled: true
      }
      {
        category: 'AppServiceAppLogs'
        enabled: true
      }
      {
        category: 'AppServicePlatformLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

resource postgresDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: postgres
  name: settingName
  properties: {
    workspaceId: workspaceId
    logs: [
      {
        category: 'PostgreSQLLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

output webDiagnosticSettingName string = webDiagnostics.name
output postgresDiagnosticSettingName string = postgresDiagnostics.name
