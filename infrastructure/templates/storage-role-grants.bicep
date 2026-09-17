targetScope = 'resourceGroup'

@minLength(3)
@maxLength(24)
param storageAccountName string
@description('Existing web app in this resource group. Role assignments use its system-assigned identity, never a caller-supplied principal ID.')
@minLength(2)
@maxLength(60)
param webAppName string
@description('Approved system-assigned principal ID. The current web identity must match before any grant is issued.')
@minLength(36)
@maxLength(36)
param approvedWebPrincipalId string
@description('Review the Contributor role including its delete permission; use Reader for read-only integrations.')
@allowed([
  'Reader'
  'Contributor'
])
param blobDataAccess string = 'Reader'
@description('Approval for these two container scopes; this operation requires role-assignment write privileges.')
@minLength(1)
@maxLength(200)
param approvalReference string

var roleId = blobDataAccess == 'Contributor'
  ? 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
  : '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1'

resource web 'Microsoft.Web/sites@2024-04-01' existing = {
  name: webAppName
}
@export()
func bindApprovedPrincipal(actualPrincipalId string, approvedPrincipalId string) string => !empty(actualPrincipalId) && toLower(actualPrincipalId) == toLower(approvedPrincipalId)
  ? toLower(approvedPrincipalId)
  : fail('The web identity changed or is absent; obtain new approval before granting Blob access.')

var webPrincipalId = bindApprovedPrincipal(web.?identity.?principalId ?? '', approvedWebPrincipalId)

resource storage 'Microsoft.Storage/storageAccounts@2024-01-01' existing = {
  name: storageAccountName
}
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2024-01-01' existing = {
  parent: storage
  name: 'default'
}
resource containers 'Microsoft.Storage/storageAccounts/blobServices/containers@2024-01-01' existing = [for name in [
  'site-documents'
  'project-documents'
]: {
  parent: blobService
  name: name
}]
resource assignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for (name, index) in [
  'site-documents'
  'project-documents'
]: {
  name: guid(containers[index].id, web.id, roleId)
  scope: containers[index]
  properties: {
    principalId: webPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleId)
    description: 'SunSum ${name}: ${approvalReference}'
  }
}]
output roleAssignmentIds array = [for (name, index) in ['site-documents', 'project-documents']: assignments[index].id]
