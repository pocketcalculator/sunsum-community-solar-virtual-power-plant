/*
  Workspace-based Application Insights for the dev-test stack.

  Deployed only when the root template is given enableObservability = true,
  because Log Analytics ingestion and retention are separately billable. The
  workspace is capped by an explicit daily quota rather than left unbounded, so
  an unexpected log volume stops ingesting instead of silently accumulating
  cost.

  The component is workspace-based: classic Application Insights is retired and
  a component without WorkspaceResourceId cannot be created. Nothing here reads
  or exports the instrumentation key or connection string; the web module reads
  the connection string from the deployed component so the value is never
  written into a deployment output.
*/

targetScope = 'resourceGroup'

@minLength(1)
param location string
@minLength(4)
@maxLength(63)
param workspaceName string
@minLength(1)
@maxLength(255)
param applicationInsightsName string
@description('Log Analytics retention. 30 days is the included minimum; longer retention is separately billed.')
@minValue(30)
@maxValue(730)
param retentionInDays int = 30
@description('Explicit daily ingestion cap in GiB. Ingestion stops for the rest of the UTC day once the cap is reached; it is a cost guard, not a quality-of-service guarantee.')
@minValue(1)
@maxValue(100)
param dailyQuotaGb int = 1
param tags object = {}

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: workspaceName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: retentionInDays
    workspaceCapping: {
      dailyQuotaGb: dailyQuotaGb
    }
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
    features: {
      // Query access follows Azure RBAC on the workspace rather than the
      // legacy per-workspace permission model.
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

resource component 'Microsoft.Insights/components@2020-02-02' = {
  name: applicationInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
    IngestionMode: 'LogAnalytics'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

output workspaceId string = workspace.id
output workspaceName string = workspace.name
output applicationInsightsName string = component.name
output applicationInsightsId string = component.id
