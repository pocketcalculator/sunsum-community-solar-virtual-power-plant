export const WS2_CONTRACT_REVISION =
  "db0c6a5d6e39fe7cf079dab27e9616189945cf6c" as const;

export type ConnectionRole = "site-owner" | "operator" | "investor";

export type ConnectionId =
  | "SUNSUM-CONNECTION:WS2-IDENTITY"
  | "SUNSUM-CONNECTION:WS2-OWNER"
  | "SUNSUM-CONNECTION:WS2-OPERATOR"
  | "SUNSUM-CONNECTION:WS2-INVESTOR"
  | "SUNSUM-CONNECTION:WS2-DOCUMENTS-EXPORT"
  | "SUNSUM-CONNECTION:WS4-ASSESSMENT-READ"
  | "SUNSUM-CONNECTION:WS2-TO-WS4-SCREENING"
  | "SUNSUM-CONNECTION:MAPS-LOCATION"
  | "SUNSUM-CONNECTION:AI-IMAGE-EVIDENCE"
  | "SUNSUM-CONNECTION:FINANCE-GIS-EXTERNAL-DATA";

export interface ConnectionDefinition {
  readonly id: ConnectionId;
  readonly label: string;
  readonly owner: string;
  readonly sourceCommit: string | null;
  readonly acceptedOperations: readonly string[];
  readonly configNames: readonly string[];
  readonly auth: string;
  readonly disclosure: string;
  readonly roleScope: readonly ConnectionRole[];
  readonly freshness: string;
  readonly pagination: string;
  readonly status: "READ_ADMISSION_REQUIRED" | "OUT_OF_REACH_RIGHT_NOW";
  readonly statusReason: string;
  readonly demoCounterpart: string;
  readonly nextHandoff: string;
}

const allRoles: readonly ConnectionRole[] = Object.freeze([
  "site-owner",
  "operator",
  "investor",
]);

function connection(
  definition: ConnectionDefinition,
): ConnectionDefinition {
  return Object.freeze({
    ...definition,
    acceptedOperations: Object.freeze([...definition.acceptedOperations]),
    configNames: Object.freeze([...definition.configNames]),
    roleScope: Object.freeze([...definition.roleScope]),
  });
}

const ws2 = {
  owner: "WS2 existing application service",
  sourceCommit: WS2_CONTRACT_REVISION,
  configNames: ["SUNSUM_STORE", "SUNSUM_DEMO_AUTH", "SUNSUM_LIVE_READ_AUTH_APPROVED"],
  auth: "Existing signed HttpOnly same-origin session; GET /api/me determines role. Admission is not authentication.",
  freshness: "Explicit uncached GET observation; record timestamps may be unknown. No polling or connection certification.",
  pagination: "Pinned endpoints are unpaged. Results exceeding 5,000 items or the byte bound fail explicitly; no silent truncation.",
  status: "READ_ADMISSION_REQUIRED",
  statusReason: "Connected mode requires an approved database-backed configuration and legitimate participant session. Explicit server-demo uses only the mock store and seeded sessions. Metadata does not certify either runtime.",
  demoCounterpart: "Independent SYNTHETIC_DEMO_ONLY static presentation, or explicitly admitted fictional server-demo; never a failed-read fallback.",
  nextHandoff: "Service owner confirms participant sign-in and disclosure; deployment owner supplies public-safe admission configuration.",
} as const;

function seam(
  id: ConnectionId,
  label: string,
  owner: string,
  disclosure: string,
  nextHandoff: string,
): ConnectionDefinition {
  return connection({
    id,
    label,
    owner,
    sourceCommit: null,
    acceptedOperations: [],
    configNames: [],
    auth: "No authentication or provider transport admitted.",
    disclosure,
    roleScope: allRoles,
    freshness: "No live observation. Previously stored WS2 fields keep their own nullable source timestamps.",
    pagination: "No admitted endpoint or pagination contract.",
    status: "OUT_OF_REACH_RIGHT_NOW",
    statusReason: "This release has no admitted network read for this connection. Existing services are out of reach right now from this release.",
    demoCounterpart: "Explicit synthetic examples only in the separate design-lab entry.",
    nextHandoff,
  });
}

export const CONNECTION_REGISTRY: readonly ConnectionDefinition[] = Object.freeze([
  connection({
    ...ws2,
    id: "SUNSUM-CONNECTION:WS2-IDENTITY",
    label: "Existing participant identity",
    acceptedOperations: ["GET /api/me"],
    disclosure: "The service confirms the current role. Only the separate explicit server-demo adapter may request seeded demo switching; no account creation or caller-granted live role.",
    roleScope: allRoles,
  }),
  connection({
    ...ws2,
    id: "SUNSUM-CONNECTION:WS2-OWNER",
    label: "Owner sites and outstanding requests",
    acceptedOperations: ["GET /api/me/sites", "GET /api/me/outstanding"],
    disclosure: "Caller-owned sites, including unconverted submissions; authorized stored assessment and document metadata.",
    roleScope: ["site-owner"],
  }),
  connection({
    ...ws2,
    id: "SUNSUM-CONNECTION:WS2-OPERATOR",
    label: "Operator submissions and project pipeline",
    acceptedOperations: [
      "GET /api/submissions",
      "GET /api/pipeline",
      "GET /api/submissions/{siteId}",
      "GET /api/projects/{projectId}/engagements",
      "GET /api/projects/{projectId}/funding-needs",
    ],
    disclosure: "Operator-authorized stored records only. A project/site pair is verified before project reads; there is no generic GET project endpoint.",
    roleScope: ["operator"],
  }),
  connection({
    ...ws2,
    id: "SUNSUM-CONNECTION:WS2-INVESTOR",
    label: "Investor portfolio and nonbinding interest",
    acceptedOperations: [
      "GET /api/portfolio",
      "GET /api/investors/me/profile",
      "GET /api/me/engagements",
      "GET /api/projects/{projectId}/deal-room",
      "GET /api/projects/{projectId}/funding-needs",
      "POST /api/projects/{projectId}/engagements",
    ],
    disclosure: "Tier-zero coarse portfolio; tier-one metadata with an eligible current engagement. One explicit project-level nonbinding-interest POST is supported for admitted investors. No automatic interest, withdrawal or funding commitment.",
    roleScope: ["investor"],
  }),
  connection({
    ...ws2,
    id: "SUNSUM-CONNECTION:WS2-DOCUMENTS-EXPORT",
    label: "Original documents and normalized export manifests",
    acceptedOperations: [
      "GET /api/sites/{siteId}/documents/{documentId}/content",
      "GET /api/export?format=json",
    ],
    configNames: [
      ...ws2.configNames,
      "SUNSUM_LIVE_DOCUMENTS_APPROVED",
      "SUNSUM_LIVE_EXPORT_APPROVED",
    ],
    disclosure: "Separately admitted owner/operator original bytes, or caller-scoped normalized JSON/CSV manifests. Investor exports exclude private site data and original-content links. Content may legitimately be missing.",
    roleScope: allRoles,
  }),
  seam(
    "SUNSUM-CONNECTION:WS4-ASSESSMENT-READ",
    "Stored assessment service seam",
    "WS4 assessment service owner",
    "Only known assessment fields already stored in admitted WS2 responses are projected. No direct WS4 or private investor assessment read.",
    "Approve the WS4 read contract, source revision, disclosure, identity and reachability separately.",
  ),
  seam(
    "SUNSUM-CONNECTION:WS2-TO-WS4-SCREENING",
    "Screening and rescreening seam",
    "WS2 and WS4 service owners",
    "New screening, calculation, overrides and rescreening are workflow writes and are not implemented here.",
    "Hand off an approved write workflow and its separate authorization and operating controls.",
  ),
  seam(
    "SUNSUM-CONNECTION:MAPS-LOCATION",
    "Backend GeoJSON map seam",
    "Existing backend and location integration owners",
    "Stored authorized location fields remain available. Proposed map input is backend GeoJSON FeatureCollection (EPSG:4326). The browser never receives parcel credentials or ESRI provider/account tokens, including short-lived or referer-bound tokens. A separate basemap key or entitlement has not been provisioned.",
    "PR71 proposes operator-only GET /api/sites/candidate-parcels; it is not admitted by this frontend. Reconcile the proposed URL/handler, authentication, project-join contract, approved property projection, role/record disclosure, bounds and trusted fixture/live provenance before adding a typed GET. Refresh cadence is unknown: no polling by default; reviewed snapshots may suffice. Backend/operators own provider credentials. Edit this registry and the live-read transport/projection only after that handoff.",
  ),
  seam(
    "SUNSUM-CONNECTION:AI-IMAGE-EVIDENCE",
    "AI and image evidence seam",
    "Evidence and model integration owner",
    "No model invocation, image upload, remote inference or invented evidence.",
    "Approve evidence consent, retention, model/provider contract and human review boundaries.",
  ),
  seam(
    "SUNSUM-CONNECTION:FINANCE-GIS-EXTERNAL-DATA",
    "Finance, GIS and external data seam",
    "Finance and geospatial data owners",
    "Known stored funding fields only; unknown currency, rates, yields and GIS evidence stay unknown.",
    "Approve source licensing, freshness, units, disclosure and external-service costs before admission.",
  ),
]);
