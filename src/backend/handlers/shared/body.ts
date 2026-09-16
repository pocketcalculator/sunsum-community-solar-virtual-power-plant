import { failure, ok, type Result } from "../../core/shared";

export type JsonObject = Readonly<Record<string, unknown>>;

export async function readJsonObject(request: Request): Promise<Result<JsonObject>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return failure("invalid_body", "The request body must be valid JSON.");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return failure("invalid_body", "The request body must be a JSON object.");
  }
  return ok(value as JsonObject);
}

export function rejectUnknownKeys(
  body: JsonObject,
  allowed: readonly string[],
): Result<void> {
  const unknown = Object.keys(body).find((key) => !allowed.includes(key));
  return unknown === undefined
    ? ok(undefined)
    : failure("invalid_body", "The request body contains an unknown field.", {
        field: unknown,
      });
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function validatePathId(
  value: string,
  code: "invalid_query" | "invalid_body",
): Result<string> {
  return isUuid(value)
    ? ok(value)
    : failure(code, "Expected a UUID path parameter.", {
        location: "path",
        parameter: "id",
        value,
      });
}
