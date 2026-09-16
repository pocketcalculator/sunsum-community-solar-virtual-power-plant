import "server-only";
import { AzureCliCredential, ManagedIdentityCredential } from "@azure/identity";
import type { TokenCredential } from "@azure/identity";
import type { DatabaseAuthentication } from "./config";
import { DatabaseAuthenticationError } from "./errors";

export const POSTGRES_TOKEN_SCOPE =
  "https://ossrdbms-aad.database.windows.net/.default";

export const databasePassword = (
  auth: DatabaseAuthentication,
  credential?: TokenCredential,
): string | (() => Promise<string>) => {
  if (auth.mode === "password") return auth.password;

  const identity =
    credential ??
    (auth.mode === "azure-cli"
      ? new AzureCliCredential({ processTimeoutInMs: 5_000 })
      : new ManagedIdentityCredential());

  // pg invokes this for each new physical connection; the Azure SDK owns token caching/refresh.
  return async () => {
    const token = await identity.getToken(POSTGRES_TOKEN_SCOPE, {
      abortSignal: AbortSignal.timeout(5_000),
    });
    if (
      !token?.token ||
      !Number.isFinite(token.expiresOnTimestamp) ||
      token.expiresOnTimestamp <= Date.now() + 60_000
    ) {
      throw new DatabaseAuthenticationError("Azure PostgreSQL returned no usable access token.");
    }
    return token.token;
  };
};
