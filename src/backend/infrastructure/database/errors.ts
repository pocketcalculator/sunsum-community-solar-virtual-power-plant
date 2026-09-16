import "server-only";
import { DrizzleQueryError } from "drizzle-orm";

export class DatabaseConfigurationError extends Error {
  override name = "DatabaseConfigurationError";
}

export class DatabaseAuthenticationError extends Error {
  override name = "DatabaseAuthenticationError";
}

export const databaseErrorCode = (error: unknown): string => {
  const failure = error instanceof DrizzleQueryError ? error.cause : error;
  if (failure instanceof DatabaseConfigurationError) return "CONFIGURATION";
  if (failure instanceof DatabaseAuthenticationError) return "AUTHENTICATION";
  if (typeof failure !== "object" || failure === null || !("code" in failure)) {
    return "DATABASE_ERROR";
  }
  const code = failure.code;
  if (
    typeof code === "string" &&
    (/^[0-9A-Z]{5}$/.test(code) ||
      ["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT"].includes(code))
  ) {
    return code;
  }
  return "DATABASE_ERROR";
};

export const databaseFailureMessage = (error: unknown): string => {
  if (
    error instanceof DatabaseConfigurationError ||
    error instanceof DatabaseAuthenticationError
  ) {
    return error.message;
  }
  return `PostgreSQL operation failed (${databaseErrorCode(error)}). Check network, TLS, and database grants.`;
};
