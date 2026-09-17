metadata description = 'App Service host for the Sunsum application, connected to Azure Database for PostgreSQL through a system-assigned managed identity. Contains no secrets: the application authenticates to PostgreSQL with an Entra token rather than a password.'

@description('Azure region for the resources in this template.')
param location string = resourceGroup().location

@description('Name of the App Service web app. This name is also the PostgreSQL role granted to the application identity, so changing it requires re-running the database grant described in infrastructure/docs/deployment.md.')
@minLength(2)
@maxLength(60)
param appName string

@description('Name of the App Service plan that hosts the web app.')
@minLength(1)
param planName string

@description('App Service plan SKU. The free F1 tier cannot enable Always On and is subject to a daily CPU quota, so it suits smoke environments rather than demonstrations.')
@allowed([
  'F1'
  'B1'
  'S1'
])
param planSku string = 'F1'

@description('Fully qualified host name of the Azure Database for PostgreSQL flexible server. An azure.com host is also how the application infers that it should authenticate with an Entra token rather than a password.')
param postgresHost string

@description('Name of the application database on the PostgreSQL server.')
param postgresDatabase string

@description('TCP port the PostgreSQL server listens on.')
param postgresPort int = 5432

@description('Commit the deployed build was produced from, recorded as a tag so a running site can be traced back to a revision.')
param sourceCommit string = 'unknown'

@description('Tags applied to the web app. Declaring them here keeps a deployment from removing the tags the environment was created with, so each environment passes its own set rather than relying on this default.')
param tags object = {
  project: 'sunsum'
}

// Always On is unavailable on the free tier, so the site cold-starts there.
var alwaysOn = planSku != 'F1'

// The site was created with a source-commit tag. Deriving it from the deployment
// keeps it true rather than letting it drift to a commit that is no longer live.
var siteTags = union(tags, {
  'source-commit': sourceCommit
})

// Built rather than taken as a parameter so the user can never disagree with
// the identity: the PostgreSQL role granted to the site identity is the site
// name, so that is the user the application must connect as. The URL carries no
// password because the server does not accept one.
var databaseUrl = 'postgresql://${appName}@${postgresHost}:${postgresPort}/${postgresDatabase}'

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  sku: {
    name: planSku
  }
  // Linux plans must set reserved, otherwise the plan is created for Windows.
  properties: {
    reserved: true
  }
  kind: 'linux'
}

resource site 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  kind: 'app,linux'
  tags: siteTags
  // The identity this template creates is the account PostgreSQL authenticates.
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: false
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: 'npm run start -- --hostname 0.0.0.0'
      alwaysOn: alwaysOn
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      appSettings: [
        // Selects the PostgreSQL-backed store; without it the app serves the
        // in-memory fixtures instead.
        {
          name: 'SUNSUM_STORE'
          value: 'db'
        }
        // No password: the server has password authentication disabled and
        // takes a Microsoft Entra token in the password field instead, which
        // the application fetches from the identity above. The user in this
        // URL is the PostgreSQL role granted to that identity.
        {
          name: 'DATABASE_URL'
          value: databaseUrl
        }
        // The application already infers Entra from an azure.com host name.
        // Stating it means a host name change cannot silently downgrade a
        // deployed environment to looking for a password that does not exist.
        {
          name: 'SUNSUM_DB_AUTH'
          value: 'entra'
        }
        // Oryx installs dependencies and builds the Next.js app on the host,
        // so the deployment package ships source rather than build output.
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
        {
          name: 'ENABLE_ORYX_BUILD'
          value: 'true'
        }
        {
          name: 'NEXT_TELEMETRY_DISABLED'
          value: '1'
        }
      ]
      // AZURE_CLIENT_ID is deliberately absent. It selects which user-assigned
      // identity to authenticate as, and setting it for a site that uses a
      // system-assigned identity sends the token request looking for an
      // identity that does not exist.
    }
  }
}

@description('Default host name of the deployed site.')
output defaultHostName string = site.properties.defaultHostName

@description('Object ID of the site managed identity. The PostgreSQL role described in infrastructure/docs/deployment.md is created from this value.')
output principalId string = site.identity.principalId

@description('PostgreSQL role name the application authenticates as.')
output databaseRole string = appName
