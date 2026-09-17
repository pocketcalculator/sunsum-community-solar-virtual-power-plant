// Parameters for the shared development environment. These values are not
// secret: the application authenticates to PostgreSQL with a managed identity,
// so no connection password exists to leak.
using './app-service.bicep'

param appName = 'app-sunsum-smoke-928e5e28'
param planName = 'asp-sunsum-smoke-free'
param planSku = 'F1'
param postgresHost = 'db-sunsum-dev-centralus.postgres.database.azure.com'
param postgresDatabase = 'sunsumsolardb'
param postgresPort = 5432

// The deployment workflow exports this so a running site can be traced back to
// the commit it was built from.
param sourceCommit = readEnvironmentVariable('SUNSUM_SOURCE_COMMIT', 'unknown')
