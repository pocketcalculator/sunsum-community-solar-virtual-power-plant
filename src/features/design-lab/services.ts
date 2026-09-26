import type { Role } from "./model";

export type WireRole = "site_owner" | "operator" | "investor";
export const wireRole = (role: Role): WireRole => role === "site-owner" ? "site_owner" : role;
export const legacyRole = (role: Role): "site-owner" | "operator" | "financier" => role === "investor" ? "financier" : role;
export const isServiceId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "unavailable" | "unauthenticated" | "denied" | "missing" | "conflict" | "invalid" | "network" | "malformed" | "canceled" | "uncertain"; message: string; status?: number };

export interface AcceptedSession {
  apiBaseUrl: string;
  origin: string;
  principalId: string;
  role: Role;
}

export function apiUrl(base: string, path: string): string {
  const root = new URL(`${base.replace(/\/$/, "")}/`);
  if (root.protocol !== "https:" || root.username || root.password || root.search || root.hash ||
    !path || path.startsWith("/") || /[?#\\]|(^|\/)\.\.?($|\/)|%/i.test(path)) throw new TypeError("Unsupported API URL");
  return new URL(path, root).href;
}

// Callers need an independently established session; demo role selection is never one.
export async function requestService<T>(
  session: AcceptedSession | null,
  path: string,
  parse: (value: unknown) => T | null,
  options: { method?: "GET" | "POST" | "PUT"; body?: unknown; signal?: AbortSignal } = {},
): Promise<ServiceResult<T>> {
  if (options.signal?.aborted) return { ok: false, kind: "canceled", message: "The request was canceled before it started." };
  if (!session || !isServiceId(session.principalId)) return { ok: false, kind: "unavailable", message: "A verified application session is unavailable." };
  const endpoint = apiUrl(session.apiBaseUrl, path);
  if (new URL(endpoint).origin !== session.origin) return { ok: false, kind: "unavailable", message: "This session contract requires same-origin access. No request was made." };
  const method = options.method ?? "GET";
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method, credentials: "same-origin", redirect: "error",
      headers: { Accept: "application/json", ...(options.body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (!(error instanceof TypeError) && !(error instanceof DOMException && error.name === "AbortError")) throw error;
    const canceled = error instanceof DOMException && error.name === "AbortError";
    return { ok: false, kind: method !== "GET" ? "uncertain" : canceled ? "canceled" : "network",
      message: method !== "GET" ? "The write outcome is uncertain. Reconcile the record before retrying." : canceled ? "Waiting was canceled." : "The service could not be reached. Preview data has not been substituted." };
  }
  if (options.signal?.aborted) return { ok: false, kind: method === "GET" ? "canceled" : "uncertain", message: "The context changed while waiting. No response was applied; reconcile any write before retrying." };
  if (!response.ok) {
    const kind = response.status === 401 ? "unauthenticated" : response.status === 403 ? "denied" :
      response.status === 404 ? "missing" : response.status === 409 ? "conflict" :
        response.status === 400 || response.status === 422 ? "invalid" :
          method !== "GET" && response.status >= 500 ? "uncertain" : "unavailable";
    return { ok: false, kind, status: response.status, message: `The service returned ${response.status}. No simulated success or automatic retry occurred.` };
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch (error) {
    if (!(error instanceof SyntaxError) && !(error instanceof TypeError)) throw error;
    return { ok: false, kind: method === "GET" ? "malformed" : "uncertain", message: "The response could not be read. No local success was inferred." };
  }
  const data = parse(value);
  return data === null
    ? { ok: false, kind: method === "GET" ? "malformed" : "uncertain", message: "The response does not match the accepted contract." }
    : { ok: true, data };
}
