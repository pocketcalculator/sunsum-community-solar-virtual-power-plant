# Azure pilot starter

This Bicep file is a non-deploying starter for Azure Container Apps, Log Analytics, private Blob Storage, Key Vault, and a system-assigned managed identity. It intentionally does not create Azure Maps, Azure OpenAI, PostgreSQL, private endpoints, DNS zones, Entra app registrations, or role assignments because those choices require subscription, network, region, retention, and ownership decisions.

Before deployment:

1. Provision Azure Database for PostgreSQL Flexible Server with private networking and Microsoft Entra authentication.
2. Build and push the image to a private Azure Container Registry; add registry configuration and `AcrPull` for the app identity.
3. Give the app identity `Key Vault Secrets User`, `Storage Blob Data Contributor`, `Azure Maps Data Reader`, and the minimum database role.
4. Add private endpoints and private DNS for Key Vault, Storage, PostgreSQL, and ACR. Container Apps must use a VNet-integrated environment.
5. Configure Entra authentication in front of the app and enforce owner/reviewer roles server-side.
6. Add Azure OpenAI environment variables and `Cognitive Services OpenAI User` only if image analysis is approved.
7. Run `az deployment group what-if` and the repository test suite before deployment.

Example validation only (does not deploy):

```bash
az bicep build --file infra/main.bicep
az deployment group what-if --resource-group <rg> --template-file infra/main.bicep \
  --parameters namePrefix=<unique-prefix> containerImage=<registry/image:tag> databaseUrl='<secret>'
```

Never place the database URL in source control or command history for a real pilot. Supply it through a secure deployment system and rotate it after bootstrap; prefer passwordless PostgreSQL in the completed design.
