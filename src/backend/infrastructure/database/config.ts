import "server-only";
import { DatabaseConfigurationError } from "./errors";

export type DatabaseEnvironment = Readonly<Record<string, string | undefined>>;

export type DatabaseAuthentication =
  | { readonly mode: "password"; readonly password: string }
  | { readonly mode: "managed-identity" | "azure-cli" };

export type DatabaseConfig = {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly sslMode: "disable" | "verify-full";
  readonly auth: DatabaseAuthentication;
};

export type DatabaseConfigOptions = {
  readonly allowOperatorIdentity?: boolean;
};

const required = (environment: DatabaseEnvironment, name: string): string => {
  const value = environment[name];
  if (!value || !value.trim()) {
    throw new DatabaseConfigurationError(`${name} must be explicitly configured.`);
  }
  return value;
};

const identifier = (environment: DatabaseEnvironment, name: string): string => {
  const value = required(environment, name);
  if (
    value !== value.trim() ||
    Buffer.byteLength(value, "utf8") > 63 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new DatabaseConfigurationError(`${name} must be a valid PostgreSQL name of at most 63 bytes.`);
  }
  return value;
};

const authentication = (
  environment: DatabaseEnvironment,
  host: string,
  sslMode: DatabaseConfig["sslMode"],
  options: DatabaseConfigOptions,
): DatabaseAuthentication => {
  const mode = required(environment, "SUNSUM_DATABASE_AUTH");
  if (mode === "password") {
    if (
      environment.NODE_ENV === "production" ||
      !["localhost", "127.0.0.1", "::1"].includes(host)
    ) {
      throw new DatabaseConfigurationError("Password authentication is restricted to non-production loopback PostgreSQL.");
    }
    return { mode, password: required(environment, "PGPASSWORD") };
  }
  if (mode !== "managed-identity" && mode !== "azure-cli") {
    throw new DatabaseConfigurationError("SUNSUM_DATABASE_AUTH must be password, managed-identity, or explicit operator azure-cli.");
  }
  if (mode === "azure-cli" && !options.allowOperatorIdentity) {
    throw new DatabaseConfigurationError("Azure CLI authentication is allowed only by explicit operator tooling, never by the application.");
  }
  if (environment.PGPASSWORD !== undefined) {
    throw new DatabaseConfigurationError("PGPASSWORD must be absent for Entra authentication.");
  }
  if (
    sslMode !== "verify-full" ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.postgres\.database\.azure\.com$/i.test(host)
  ) {
    throw new DatabaseConfigurationError("Entra authentication requires a public-cloud Azure PostgreSQL hostname and PGSSLMODE=verify-full.");
  }
  return { mode };
};

export const readDatabaseConfig = (
  environment: DatabaseEnvironment,
  options: DatabaseConfigOptions = {},
): DatabaseConfig => {
  if (environment.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw new DatabaseConfigurationError("NODE_TLS_REJECT_UNAUTHORIZED must not disable certificate verification.");
  }
  const host = required(environment, "PGHOST");
  const portValue = required(environment, "PGPORT");
  const port = Number(portValue);
  if (!/^[1-9][0-9]{0,4}$/.test(portValue) || port > 65535) {
    throw new DatabaseConfigurationError("PGPORT must be an integer from 1 through 65535.");
  }
  const sslMode = required(environment, "PGSSLMODE");
  if (sslMode !== "disable" && sslMode !== "verify-full") {
    throw new DatabaseConfigurationError("PGSSLMODE must be disable for local development or verify-full.");
  }
  return {
    host,
    port,
    database: identifier(environment, "PGDATABASE"),
    user: identifier(environment, "PGUSER"),
    sslMode,
    auth: authentication(environment, host, sslMode, options),
  };
};
