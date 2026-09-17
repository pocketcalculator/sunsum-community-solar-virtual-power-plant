// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import {
  buildPoolConfig,
  usesEntraAuth,
} from "@/backend/db/client";
import {
  clearEntraTokenCache,
  getPostgresAccessToken,
  POSTGRES_ENTRA_SCOPE,
  setEntraCredentialForTesting,
} from "@/backend/db/entra";
import type { AccessToken, TokenCredential } from "@azure/identity";

const LOCAL_URL = "postgresql://sunsum:devpassword@localhost:55432/sunsum";
const AZURE_URL =
  "postgresql://app@psql-sunsum-dev.postgres.database.azure.com:5432/sunsum";

const originalAuth = process.env.SUNSUM_DB_AUTH;

afterEach(() => {
  if (originalAuth === undefined) {
    delete process.env.SUNSUM_DB_AUTH;
  } else {
    process.env.SUNSUM_DB_AUTH = originalAuth;
  }

  setEntraCredentialForTesting(undefined);
  clearEntraTokenCache();
});

/** A credential that hands out predictable tokens and counts the calls. */
function stubCredential(
  expiresOnTimestamp: number,
  tokens: string[] = ["token-1", "token-2", "token-3"],
): TokenCredential & { calls: string[] } {
  const calls: string[] = [];
  let next = 0;

  return {
    calls,
    getToken(scopes): Promise<AccessToken> {
      calls.push(Array.isArray(scopes) ? scopes.join(",") : scopes);
      const token = tokens[Math.min(next, tokens.length - 1)] ?? "token";
      next += 1;
      return Promise.resolve({ token, expiresOnTimestamp });
    },
  };
}

describe("usesEntraAuth", () => {
  it("uses a password for a local container", () => {
    delete process.env.SUNSUM_DB_AUTH;

    expect(usesEntraAuth(LOCAL_URL)).toBe(false);
  });

  it("uses Entra for an Azure flexible server, which has password auth disabled", () => {
    delete process.env.SUNSUM_DB_AUTH;

    expect(usesEntraAuth(AZURE_URL)).toBe(true);
  });

  it("lets SUNSUM_DB_AUTH force Entra against a host that does not look like Azure", () => {
    // A private endpoint reached through an alias is the real case here.
    process.env.SUNSUM_DB_AUTH = "entra";

    expect(usesEntraAuth(LOCAL_URL)).toBe(true);
  });

  it("lets SUNSUM_DB_AUTH force a password against an Azure host", () => {
    process.env.SUNSUM_DB_AUTH = "password";

    expect(usesEntraAuth(AZURE_URL)).toBe(false);
  });

  it("ignores casing and surrounding whitespace in the override", () => {
    process.env.SUNSUM_DB_AUTH = "  Entra  ";

    expect(usesEntraAuth(LOCAL_URL)).toBe(true);
  });

  it("rejects a misspelled override rather than silently guessing", () => {
    process.env.SUNSUM_DB_AUTH = "aad";

    expect(() => usesEntraAuth(AZURE_URL)).toThrow(/SUNSUM_DB_AUTH/);
  });

  it("leaves an unparseable connection string for the pool to report", () => {
    delete process.env.SUNSUM_DB_AUTH;

    expect(usesEntraAuth("not a url")).toBe(false);
  });
});

describe("buildPoolConfig", () => {
  it("passes the connection string straight through for a password connection", () => {
    delete process.env.SUNSUM_DB_AUTH;

    const config = buildPoolConfig(LOCAL_URL);

    expect(config.connectionString).toBe(LOCAL_URL);
    expect(config.password).toBeUndefined();
    expect(config.ssl).toBeUndefined();
  });

  it("supplies a token function, not a token, so the pool survives expiry", async () => {
    delete process.env.SUNSUM_DB_AUTH;
    setEntraCredentialForTesting(stubCredential(Date.now() + 3_600_000));

    const config = buildPoolConfig(AZURE_URL);

    expect(typeof config.password).toBe("function");
    await expect(
      (config.password as () => Promise<string>)(),
    ).resolves.toBe("token-1");
  });

  it("verifies the server certificate", () => {
    delete process.env.SUNSUM_DB_AUTH;

    const config = buildPoolConfig(AZURE_URL);

    expect(config.ssl).toEqual({ rejectUnauthorized: true });
  });
});

describe("getPostgresAccessToken", () => {
  it("requests the PostgreSQL scope", async () => {
    const credential = stubCredential(Date.now() + 3_600_000);
    setEntraCredentialForTesting(credential);

    await getPostgresAccessToken();

    expect(credential.calls).toEqual([POSTGRES_ENTRA_SCOPE]);
  });

  it("reuses a token that is still comfortably valid", async () => {
    const now = Date.now();
    const credential = stubCredential(now + 3_600_000);
    setEntraCredentialForTesting(credential);

    await expect(getPostgresAccessToken(now)).resolves.toBe("token-1");
    await expect(getPostgresAccessToken(now + 1_000)).resolves.toBe("token-1");
    expect(credential.calls).toHaveLength(1);
  });

  it("fetches a fresh token before the cached one expires in flight", async () => {
    const now = Date.now();
    // Expires in four minutes, inside the five-minute safety margin.
    const credential = stubCredential(now + 4 * 60 * 1000);
    setEntraCredentialForTesting(credential);

    await expect(getPostgresAccessToken(now)).resolves.toBe("token-1");
    await expect(getPostgresAccessToken(now)).resolves.toBe("token-2");
    expect(credential.calls).toHaveLength(2);
  });

  it("fails loudly when no identity is available", async () => {
    setEntraCredentialForTesting({
      getToken: () => Promise.resolve(null),
    });

    await expect(getPostgresAccessToken()).rejects.toThrow(
      /Could not acquire a Microsoft Entra token/,
    );
  });
});
