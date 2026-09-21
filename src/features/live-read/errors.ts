import type { ConnectionId } from "./registry";
import type { ReadError, ReadResult } from "./types";

export function readError(
  kind: ReadError["kind"],
  message: string,
  code: string | null = null,
  connectionId: ConnectionId | null = null,
  status: number | null = null,
): ReadError {
  return { kind, message, code, connectionId, status };
}

export class ReadFault extends Error {
  constructor(readonly error: ReadError) {
    super(error.message);
    this.name = "ReadFault";
  }
}

export function rejectRead(
  kind: ReadError["kind"],
  message: string,
  code: string | null = null,
): never {
  throw new ReadFault(readError(kind, message, code));
}

export function success<T>(data: T): ReadResult<T> {
  return { ok: true, data };
}

export function failure(error: ReadError): ReadResult<never> {
  return { ok: false, error };
}

export function malformed(): never {
  return rejectRead(
    "malformed",
    "The service response does not match the admitted read contract.",
    "invalid_response",
  );
}
