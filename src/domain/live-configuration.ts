export type WorkspaceSourceMode = "connected" | "server-demo" | "unavailable";

export interface SyntheticIdentityIds {
  readonly userIds: readonly string[];
  readonly investorIds: readonly string[];
}

export interface LiveReadConfiguration {
  readonly mode?: WorkspaceSourceMode;
  canAttemptReads: boolean;
  readonly canAttemptInterest?: boolean;
  canAttemptExports: boolean;
  canAttemptDocumentDownloads: boolean;
  apiBasePath: "/api";
  source: "database-configured" | "mock-configured" | "not-confirmed";
  reason: string;
  readonly syntheticIdentities?: SyntheticIdentityIds;
}

export interface WorkspaceConfiguration extends LiveReadConfiguration {
  readonly mode: WorkspaceSourceMode;
  readonly canAttemptInterest: boolean;
  readonly syntheticIdentities: SyntheticIdentityIds;
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
  syntheticIdentities?: SyntheticIdentityIds;
}

// SUNSUM-CONNECTION:WS2-IDENTITY: configuration admits an attempt, never a session.
export function resolveLiveReadConfiguration(
  evidence: ConfigurationEvidence,
): WorkspaceConfiguration {
  const syntheticIdentities: SyntheticIdentityIds = {
    userIds: Object.freeze([...(evidence.syntheticIdentities?.userIds ?? [])]),
    investorIds: Object.freeze([...(evidence.syntheticIdentities?.investorIds ?? [])]),
  };
  const unavailable = (reason: string): WorkspaceConfiguration => ({
    mode: "unavailable",
    canAttemptReads: false,
    canAttemptInterest: false,
    canAttemptExports: false,
    canAttemptDocumentDownloads: false,
    apiBasePath: "/api",
    source: "not-confirmed",
    reason,
    syntheticIdentities,
  });

  if (evidence.dataMode !== "connected" && evidence.dataMode !== "server-demo") {
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
  if (!evidence.sessionSecretConfigured) {
    return unavailable(
      "The existing application's session configuration is out of reach right now. No demo identity or replacement account has been created.",
    );
  }
  if (evidence.dataMode === "server-demo") {
    if (evidence.store !== "mock" || evidence.demoAuth !== "enabled") {
      return unavailable(
        "Server demo requires the explicit mock store and SUNSUM_DEMO_AUTH=enabled. A different or missing setting never falls back to fictional data.",
      );
    }
    return {
      mode: "server-demo",
      canAttemptReads: true,
      canAttemptInterest: true,
      canAttemptExports: evidence.exportApproved === true,
      canAttemptDocumentDownloads: evidence.documentDownloadsApproved === true,
      apiBasePath: "/api",
      source: "mock-configured",
      syntheticIdentities,
      reason: "Explicit server demo: fictional mock records and seeded sessions. This is not real participant or service evidence.",
    };
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
  if (!evidence.participantSignInApproved) {
    return unavailable(
      "The service owner has not confirmed the existing participant sign-in and role mapping for this connection. Configuration alone is not authentication.",
    );
  }
  return {
    mode: "connected",
    canAttemptReads: true,
    canAttemptInterest: true,
    canAttemptExports: evidence.exportApproved === true,
    canAttemptDocumentDownloads: evidence.documentDownloadsApproved === true,
    apiBasePath: "/api",
    source: "database-configured",
    syntheticIdentities,
    reason: "Configuration is present. The existing service must still confirm your session, permitted records and their provenance.",
  };
}

export function workspaceSourceMode(configuration: LiveReadConfiguration): WorkspaceSourceMode {
  return configuration.mode ??
    (configuration.canAttemptReads && configuration.source === "database-configured" ? "connected" : "unavailable");
}
