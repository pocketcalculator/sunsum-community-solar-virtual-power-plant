export interface LiveReadConfiguration {
  canAttemptReads: boolean;
  canAttemptExports: boolean;
  canAttemptDocumentDownloads: boolean;
  apiBasePath: "/api";
  source: "database-configured" | "not-confirmed";
  reason: string;
}

interface ConfigurationEvidence {
  dataMode?: string | undefined;
  apiBase?: string | undefined;
  store?: string | undefined;
  demoAuth?: string | undefined;
  sessionSecretConfigured: boolean;
  participantSignInApproved?: boolean;
  exportApproved?: boolean;
  documentDownloadsApproved?: boolean;
}

// SUNSUM-CONNECTION:WS2-IDENTITY: configuration admits an attempt, never a session.
export function resolveLiveReadConfiguration(
  evidence: ConfigurationEvidence,
): LiveReadConfiguration {
  const unavailable = (reason: string): LiveReadConfiguration => ({
    canAttemptReads: false,
    canAttemptExports: false,
    canAttemptDocumentDownloads: false,
    apiBasePath: "/api",
    source: "not-confirmed",
    reason,
  });

  if (evidence.dataMode !== "connected") {
    return unavailable(
      "The existing-service connection is out of reach right now. This workspace does not substitute fictional projects when it is unconfigured.",
    );
  }
  const base = evidence.apiBase?.trim();
  if (base && base !== "/api") {
    return unavailable(
      "Use the existing application's same-origin /api path. A separate service host is not admitted by this release.",
    );
  }
  if (evidence.store !== "db") {
    return unavailable(
      "The application's database-backed store has not been confirmed. A successful response from a fixture store is not live project data.",
    );
  }
  const demoAuth = evidence.demoAuth?.trim().toLowerCase();
  if (demoAuth && demoAuth !== "false" && demoAuth !== "0") {
    return unavailable(
      "Demo sign-in is enabled or its setting is unrecognized. Use the existing legitimate participant sign-in, with demo sign-in disabled.",
    );
  }
  if (!evidence.sessionSecretConfigured) {
    return unavailable(
      "The existing application's session configuration is out of reach right now. No demo identity or replacement account has been created.",
    );
  }
  if (!evidence.participantSignInApproved) {
    return unavailable(
      "The service owner has not confirmed the existing participant sign-in and role mapping for this connection. Configuration alone is not authentication.",
    );
  }
  return {
    canAttemptReads: true,
    canAttemptExports: evidence.exportApproved === true,
    canAttemptDocumentDownloads: evidence.documentDownloadsApproved === true,
    apiBasePath: "/api",
    source: "database-configured",
    reason: "Configuration is present. The existing service must still confirm your session, permitted records and their provenance.",
  };
}
