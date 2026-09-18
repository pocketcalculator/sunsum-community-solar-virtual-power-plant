targetScope = 'resourceGroup'

@minLength(2)
@maxLength(60)
param webAppName string
@description('Approved workforce tenant. Guests must have an object in this tenant.')
@minLength(36)
@maxLength(36)
param tenantId string
@description('Precreated, single-tenant Web app registration client ID; not the managed identity.')
@minLength(36)
@maxLength(36)
param clientId string
@description('Existing slot-sticky App Service secret setting for authorization-code flow. The value is never a template parameter.')
@minLength(1)
@maxLength(64)
param authSettingName string
@description('Explicit approved user/guest object IDs in the workforce tenant. 13 GUIDs stay within the Easy Auth 500-character identity limit. Empty means unrestricted in Easy Auth, so it is forbidden.')
@minLength(1)
@maxLength(13)
param approvedParticipantObjectIds string[]
@description('Separate opt-in after directory assignment, secret, redirect URI, and participant checks. This template is never called by resources.bicep.')
@allowed([true])
param activationApproved bool
@minLength(1)
@maxLength(200)
param approvalReference string

resource web 'Microsoft.Web/sites@2024-04-01' existing = {
  name: webAppName
}
resource authentication 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: web
  name: 'authsettingsV2'
  properties: {
    platform: {
      enabled: activationApproved
      runtimeVersion: '~1'
    }
    globalValidation: {
      requireAuthentication: true
      unauthenticatedClientAction: 'RedirectToLoginPage'
      redirectToProvider: 'azureactivedirectory'
      excludedPaths: []
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        isAutoProvisioned: false
        registration: {
          clientId: clientId
          clientSecretSettingName: authSettingName
          openIdIssuer: '${environment().authentication.loginEndpoint}${tenantId}/v2.0'
        }
        login: {
          loginParameters: [
            'scope=openid profile email'
          ]
        }
        validation: {
          allowedAudiences: [
            clientId
            'api://${clientId}'
          ]
          defaultAuthorizationPolicy: {
            allowedPrincipals: {
              identities: approvedParticipantObjectIds
            }
          }
        }
      }
    }
    login: {
      tokenStore: {
        enabled: false
      }
      cookieExpiration: {
        convention: 'FixedTime'
        timeToExpiration: '01:00:00'
      }
      nonce: {
        validateNonce: true
      }
      allowedExternalRedirectUrls: []
    }
    httpSettings: {
      requireHttps: true
      forwardProxy: {
        convention: 'NoProxy'
      }
    }
  }
}
output APPROVAL_REFERENCE string = approvalReference
