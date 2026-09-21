using './resources.bicep'

param environmentName = 'dev-test'
param location = 'centralus'
param appServicePlanName = 'asp-sunsum-dev-test-centralus'
param webAppName = 'app-sunsum-dev-test-centralus'
param storageAccountName = 'stsunsumdevtestcentralus'
param postgresServerName = 'db-sunsum-dev-test-centralus'
param databaseName = 'sunsum_test'
param runtimeRoleName = 'sunsum_runtime'
param tenantId = '00000000-0000-0000-0000-000000000000'
param postgresAdminObjectId = '00000000-0000-0000-0000-000000000000'
param postgresAdminPrincipalName = '<postgres-admin-principal-name>'
param postgresAdminPrincipalType = 'User'
param postgresTier = 'Burstable'
param postgresSkuName = 'Standard_B1ms'
param postgresStorageSizeGB = 32
param postgresVersion = '17'
param enableObservability = true
param logAnalyticsWorkspaceName = 'log-sunsum-dev-test-centralus'
param applicationInsightsName = 'appi-sunsum-dev-test-centralus'
param logAnalyticsRetentionDays = 30
param logAnalyticsDailyQuotaGb = 1
param enablePrivateNetworking = true
param virtualNetworkName = 'vnet-sunsum-dev-test-centralus'
param virtualNetworkAddressPrefix = '10.30.0.0/16'
param appSubnetPrefix = '10.30.1.0/26'
param privateEndpointSubnetPrefix = '10.30.2.0/28'
