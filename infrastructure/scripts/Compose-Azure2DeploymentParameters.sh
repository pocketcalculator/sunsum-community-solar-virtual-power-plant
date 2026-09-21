#!/usr/bin/env bash
set -euo pipefail

# Creates a mode-0600 file from the identity values supplied by the workflow.
# Its nonsecret values mirror resources.dev.bicepparam; the infrastructure unit
# test keeps those values synchronized.
parameters_file="${1:?A deployment parameters path is required.}"
umask 077
rm -f "$parameters_file"
touch "$parameters_file"
chmod 600 "$parameters_file"

jq -n \
  --arg tenantId "$TENANT_ID" \
  --arg postgresAdminObjectId "$POSTGRES_ADMIN_OBJECT_ID" \
  --arg postgresAdminPrincipalName "$POSTGRES_ADMIN_PRINCIPAL_NAME" \
  '{
    "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
    contentVersion: "1.0.0.0",
    parameters: {
      environmentName: { value: "dev-test" },
      location: { value: "centralus" },
      appServicePlanName: { value: "asp-sunsum-dev-test-centralus" },
      webAppName: { value: "app-sunsum-dev-test-centralus" },
      storageAccountName: { value: "stsunsumdevtestcentralus" },
      postgresServerName: { value: "db-sunsum-dev-test-centralus" },
      databaseName: { value: "sunsum_test" },
      runtimeRoleName: { value: "sunsum_runtime" },
      tenantId: { value: $tenantId },
      postgresAdminObjectId: { value: $postgresAdminObjectId },
      postgresAdminPrincipalName: { value: $postgresAdminPrincipalName },
      postgresAdminPrincipalType: { value: "User" },
      postgresTier: { value: "Burstable" },
      postgresSkuName: { value: "Standard_B1ms" },
      postgresStorageSizeGB: { value: 32 },
      postgresVersion: { value: "17" },
      enableObservability: { value: true },
      logAnalyticsWorkspaceName: { value: "log-sunsum-dev-test-centralus" },
      applicationInsightsName: { value: "appi-sunsum-dev-test-centralus" },
      logAnalyticsRetentionDays: { value: 30 },
      logAnalyticsDailyQuotaGb: { value: 1 },
      enablePrivateNetworking: { value: true },
      virtualNetworkName: { value: "vnet-sunsum-dev-test-centralus" },
      virtualNetworkAddressPrefix: { value: "10.30.0.0/16" },
      appSubnetPrefix: { value: "10.30.1.0/26" },
      privateEndpointSubnetPrefix: { value: "10.30.2.0/28" }
    }
  }' > "$parameters_file"
