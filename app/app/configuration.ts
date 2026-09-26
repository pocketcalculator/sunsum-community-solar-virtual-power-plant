import "server-only";

import { DEMO_IDENTITY_IDS } from "@/backend";
import { resolveLiveReadConfiguration, type WorkspaceConfiguration } from "@/domain/live-configuration";

export function getWorkspaceConfiguration(): WorkspaceConfiguration {
  const {
    SUNSUM_PUBLIC_DATA_MODE, SUNSUM_PUBLIC_API_BASE_URL, SUNSUM_STORE, SUNSUM_DEMO_AUTH,
    SUNSUM_SESSION_SECRET, SUNSUM_LIVE_READ_AUTH_APPROVED,
    SUNSUM_LIVE_EXPORT_APPROVED, SUNSUM_LIVE_DOCUMENTS_APPROVED,
  } = process.env;
  return resolveLiveReadConfiguration({
    dataMode: SUNSUM_PUBLIC_DATA_MODE,
    apiBase: SUNSUM_PUBLIC_API_BASE_URL,
    store: SUNSUM_STORE,
    demoAuth: SUNSUM_DEMO_AUTH,
    sessionSecretConfigured: typeof SUNSUM_SESSION_SECRET === "string" && SUNSUM_SESSION_SECRET.length >= 32,
    participantSignInApproved: SUNSUM_LIVE_READ_AUTH_APPROVED === "true",
    exportApproved: SUNSUM_LIVE_EXPORT_APPROVED === "true",
    documentDownloadsApproved: SUNSUM_LIVE_DOCUMENTS_APPROVED === "true",
    syntheticIdentities: DEMO_IDENTITY_IDS,
  });
}
