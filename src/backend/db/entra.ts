/**
 * Authenticating to Azure Database for PostgreSQL with Microsoft Entra ID.
 *
 * The cloud server is provisioned with `passwordAuth: 'Disabled'` and
 * `activeDirectoryAuth: 'Enabled'`, so there is no password to put in a
 * connection string and nothing to rotate. The server accepts an Entra access
 * token *in the password field* instead, which is why this file exists: it
 * produces that token, and `client.ts` hands it to `pg`.
 *
 * Tokens expire, and a pool opens new connections for the life of the process,
 * so the token cannot be fetched once at startup. `pg` accepts a function for
 * `password` and calls it per connection, which is the seam this is written
 * for. The cache below exists only to keep that per-connection call from
 * becoming a network round trip every time.
 *
 * Locally there is no Entra at all — the container in `docker-compose.yml`
 * authenticates with a password — so nothing here runs unless the connection
 * actually points at Azure. See `usesEntraAuth` in `client.ts`.
 */

import { DefaultAzureCredential, type TokenCredential } from "@azure/identity";

/**
 * The resource the token must be issued for. This is a fixed Azure identifier,
 * not a per-tenant or per-server value, and it is the one string here that
 * cannot be inferred from configuration.
 */
export const POSTGRES_ENTRA_SCOPE =
  "https://ossrdbms-aad.database.windows.net/.default";

/**
 * How long before expiry a cached token stops being reused.
 *
 * A token that is valid when we read it can still expire in flight, and a
 * connection that fails authentication is not retried by the pool. Five minutes
 * is the usual margin for exactly this reason.
 */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

interface CachedToken {
  readonly token: string;
  readonly expiresOnTimestamp: number;
}

let cached: CachedToken | undefined;
let credential: TokenCredential | undefined;

/**
 * The credential used for token requests.
 *
 * `DefaultAzureCredential` resolves a managed identity in Azure and a developer
 * sign-in (`az login`) on a workstation, so the same code path works in both
 * without a branch. `AZURE_CLIENT_ID` selects *which* user-assigned identity
 * when the container has more than one; a system-assigned identity leaves it
 * unset.
 */
function getCredential(): TokenCredential {
  if (credential === undefined) {
    const clientId = process.env.AZURE_CLIENT_ID;
    credential =
      clientId === undefined || clientId === ""
        ? new DefaultAzureCredential()
        : new DefaultAzureCredential({ managedIdentityClientId: clientId });
  }

  return credential;
}

/** Replaces the credential. For tests; production resolves its own. */
export function setEntraCredentialForTesting(
  next: TokenCredential | undefined,
): void {
  credential = next;
  cached = undefined;
}

/** Drops the cached token, forcing the next call to fetch a fresh one. */
export function clearEntraTokenCache(): void {
  cached = undefined;
}

/**
 * Returns an access token to use as the PostgreSQL password.
 *
 * Reuses the cached token until it is within `EXPIRY_MARGIN_MS` of expiry. The
 * failure is deliberately loud: a missing identity in production is a
 * configuration error, and falling back to anything else would mean connecting
 * as someone other than the caller intended.
 */
export async function getPostgresAccessToken(
  now: number = Date.now(),
): Promise<string> {
  if (cached !== undefined && cached.expiresOnTimestamp - EXPIRY_MARGIN_MS > now) {
    return cached.token;
  }

  const issued = await getCredential().getToken(POSTGRES_ENTRA_SCOPE);

  if (issued === null) {
    throw new Error(
      "Could not acquire a Microsoft Entra token for PostgreSQL. In Azure this " +
        "means the container has no managed identity with access to the server; " +
        "locally it usually means `az login` has not been run.",
    );
  }

  cached = {
    token: issued.token,
    expiresOnTimestamp: issued.expiresOnTimestamp,
  };

  return issued.token;
}
