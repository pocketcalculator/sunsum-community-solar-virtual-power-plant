import { CONNECTION_REGISTRY, WS2_CONTRACT_REVISION } from "@/domain/connections";

export const BACKEND_REVISION = WS2_CONTRACT_REVISION;
export const ASSESSMENT_CANDIDATE_REVISION = "0c1c6d4bbbc15ec91cb8d0a59daa6e5094ff5301";

export interface PublicConfiguration {
  mode: "preview" | "connected" | "unavailable";
  apiBaseUrl: string | null;
  issue: string | null;
}

export function resolveConfiguration(values: {
  SUNSUM_PUBLIC_DATA_MODE?: string | undefined;
  SUNSUM_PUBLIC_API_BASE_URL?: string | undefined;
}): PublicConfiguration {
  const mode = values.SUNSUM_PUBLIC_DATA_MODE || "preview";
  const raw = values.SUNSUM_PUBLIC_API_BASE_URL?.trim();
  if (mode !== "preview" || raw) {
    return {
      mode: "unavailable",
      apiBaseUrl: null,
      issue: "SYNTHETIC_DEMO_ONLY: this entry cannot connect to services. Use the separate Next /app workspace for admitted live reads.",
    };
  }
  return { mode: "preview", apiBaseUrl: null, issue: null };
}

export const PREVIEW_CONFIGURATION: PublicConfiguration = resolveConfiguration({});

export const SERVICE_CAPABILITIES = CONNECTION_REGISTRY.map((connection) => ({
  id: connection.id,
  label: connection.label,
  source: connection.sourceCommit
    ? `Existing source contract ${connection.sourceCommit.slice(0, 12)}`
    : "Separate existing-service handoff required",
  reason: `${connection.demoCounterpart} ${connection.nextHandoff}`,
}));
