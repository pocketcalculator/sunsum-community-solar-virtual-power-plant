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

// The tags this environment was created with. They live here rather than in the
// template because the review date belongs to this environment, not to every
// environment the template can produce. A deployment replaces the web app's
// tags, so anything omitted here is removed from the resource.
param tags = {
  project: 'sunsum'
  purpose: 'nextjs-smoke-test'
  'review-after': '2026-09-18'
}

// The deployment workflow exports this so a running site can be traced back to
// the commit it was built from.
param sourceCommit = readEnvironmentVariable('SUNSUM_SOURCE_COMMIT', 'unknown')
