/**
 * SYNTHETIC TEST DATA ONLY. No account, session, cookie, sign-in or real API passthrough.
 * Playwright: route.fulfill(fixtures.responseFor(request.url(), request.method())).
 * Low-level builders permit deliberate malformed-response overrides; use the
 * factory for a coherent, role-scoped set of accepted WS2 endpoint responses.
 */
import { JOURNEY_STAGES, type JourneyStageId } from "@/domain/journey";
import type {
  LiveRole, ProjectStage, SiteType, SubmissionStatus, ViabilityStatus,
} from "@/features/live-read/types";

export const SYNTHETIC_LIVE_READ_IDS = Object.freeze({
  ownerUserId: "11111111-1111-4111-8111-111111111111",
  operatorUserId: "22222222-2222-4222-8222-222222222222",
  siteId: "33333333-3333-4333-8333-333333333333",
  projectId: "44444444-4444-4444-8444-444444444444",
  investorId: "55555555-5555-4555-8555-555555555555",
  documentId: "66666666-6666-4666-8666-666666666666",
  assessmentId: "77777777-7777-4777-8777-777777777777",
  overrideId: "88888888-8888-4888-8888-888888888888",
  engagementId: "99999999-9999-4999-8999-999999999999",
  activityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  fundingNeedId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  unconvertedSiteId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  investorUserId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
});

export const SYNTHETIC_LIVE_READ_TIME = "2026-09-20T12:00:00Z";
export const SYNTHETIC_LIVE_READ_OBSERVED_AT = "2026-09-21T08:00:00.000Z";
export const SYNTHETIC_LIVE_READ_PRIVATE_CANARY = "PRIVATE-CANARY";

function syntheticPdf(): string {
  const content = "BT /F1 12 Tf 20 100 Td (SYNTHETIC TEST ONLY) Tj ET\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 250 160] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  return `${body}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}

export const SYNTHETIC_LIVE_READ_PDF = syntheticPdf();

const {
  ownerUserId: USER, operatorUserId: OTHER, siteId: SITE, projectId: PROJECT,
  investorId: INVESTOR, documentId: DOCUMENT, assessmentId: ASSESSMENT,
  overrideId: OVERRIDE, engagementId: ENGAGEMENT, activityId: ACTIVITY,
  fundingNeedId: FUNDING, unconvertedSiteId: UNCONVERTED, investorUserId: INVESTOR_USER,
} = SYNTHETIC_LIVE_READ_IDS;
const TIME = SYNTHETIC_LIVE_READ_TIME;
const PDF = SYNTHETIC_LIVE_READ_PDF;
const CANARY = SYNTHETIC_LIVE_READ_PRIVATE_CANARY;

export function syntheticIdentity(role: LiveRole = "site-owner", extra: Record<string, unknown> = {}) {
  return {
    user_id: USER,
    role: role === "site-owner" ? "site_owner" : role,
    ...(role === "investor" ? {
      onboarded: true,
      investor: { id: INVESTOR, organization_name: "Synthetic cooperative", onboarding_completed_at: TIME },
    } : {}),
    ...extra,
  };
}

export function syntheticSite(extra: Record<string, unknown> = {}) {
  return {
    id: SITE, owner_user_id: USER, address_raw: "Synthetic private address",
    latitude: null, longitude: null, geocode_confidence: null,
    site_type: "rooftop", submission_status: "submitted", created_at: TIME, updated_at: TIME,
    ownership_status: null, approximate_area_sqm: null, electricity_usage_kwh_annual: null,
    electricity_bill_doc_id: null, has_existing_solar: null, consent_given_at: null,
    ...extra,
  };
}

export function syntheticAssessment(extra: Record<string, unknown> = {}) {
  return {
    id: ASSESSMENT, site_id: SITE, ruleset_version: "stored-test-rules",
    estimated_system_size_kw_low: 12, estimated_system_size_kw_high: 20,
    estimated_annual_generation_kwh_low: 15_000, estimated_annual_generation_kwh_high: 26_000,
    preliminary_project_type: null,
    viability_status: "potentially_viable", is_override: false,
    override_reason: null, overridden_by_user_id: null,
    flags: ["stored flag"], missing_information: [], created_at: TIME,
    inputs_used: { site_type: "rooftop", approximate_area_sqm: 200, opaque: CANARY },
    ...extra,
  };
}

export function syntheticDocument(extra: Record<string, unknown> = {}) {
  return {
    id: DOCUMENT, site_id: SITE, project_id: null, original_filename: "Synthetic report.pdf",
    content_type: "application/pdf", size_bytes: PDF.length, doc_type: "report",
    disclosure_class: "owner_private", uploaded_by_user_id: USER, created_at: TIME,
    ...extra,
  };
}

export function syntheticOwnerSite(extra: Record<string, unknown> = {}) {
  return {
    site: syntheticSite(), assessment: syntheticAssessment(), submission_status: "submitted",
    project_stage: null, journey_stage_id: "submitted",
    documents: [syntheticDocument()], outstanding: [], acknowledgements: [], ...extra,
  };
}

export function syntheticPipelineCard(extra: Record<string, unknown> = {}) {
  return {
    id: PROJECT, site_id: SITE, project_id: PROJECT, display_name: "Synthetic project",
    site_type: "rooftop", submission_status: "accepted", project_stage: "pre_development",
    journey_stage_id: "pre-development", estimated_capacity_kw: 17, updated_at: TIME, ...extra,
  };
}

export function syntheticPipeline(extra: Record<string, unknown> = {}) {
  return { columns: [{ journey_stage_id: "pre-development", count: 1, items: [syntheticPipelineCard()] }], ...extra };
}

export function syntheticSubmissionDetail(extra: Record<string, unknown> = {}) {
  const automatic = syntheticAssessment({ created_at: null });
  const human = syntheticAssessment({
    id: OVERRIDE, is_override: true, estimated_system_size_kw_low: 14,
    override_reason: "Stored human review", overridden_by_user_id: OTHER,
  });
  return {
    site: syntheticSite({ submission_status: "accepted" }),
    assessment: human, assessment_history: [automatic, human],
    owner: { id: USER, name: null, email: null, role: "site_owner", created_at: null },
    documents: [syntheticDocument()],
    activity: [{
      id: ACTIVITY, site_id: SITE, project_id: PROJECT, action: "submission_accepted",
      actor_user_id: null, created_at: null, from_value: "screening", to_value: "accepted",
    }],
    ...extra,
  };
}

export function syntheticPortfolioItem(extra: Record<string, unknown> = {}) {
  return {
    project_id: PROJECT, name: "Synthetic project", locality: "Synthetic neighbourhood",
    stage: "pre_development", journey_stage_id: "pre-development",
    site_type: "rooftop", viability_status: "potentially_viable",
    estimated_system_size_kw_low: 12, estimated_system_size_kw_high: 20,
    estimated_annual_generation_kwh_low: 15_000, estimated_annual_generation_kwh_high: 26_000,
    my_engagement_state: "interested", ...extra,
  };
}

export function syntheticPortfolio(extra: Record<string, unknown> = {}) {
  return { items: [syntheticPortfolioItem()], project_count: 1, total_estimated_capacity_kw: 16, mandate_match: false, ...extra };
}

export function syntheticInvestorProfile(extra: Record<string, unknown> = {}) {
  return {
    id: INVESTOR, user_id: USER, organization_name: "Synthetic cooperative",
    funding_stage_focus: ["pre_development"], geographies: ["Synthetic region"],
    onboarding_completed_at: TIME, ...extra,
  };
}

export function syntheticEngagement(extra: Record<string, unknown> = {}) {
  return {
    id: ENGAGEMENT, investor_id: INVESTOR, project_id: PROJECT, funding_need_id: FUNDING,
    state: "interested", state_changed_at: TIME, is_binding: false,
    project_name: "Synthetic project", project_stage: "pre_development",
    journey_stage_id: "pre-development", created_at: TIME, ...extra,
  };
}

export function syntheticFundingNeed(extra: Record<string, unknown> = {}) {
  return {
    id: FUNDING, project_id: PROJECT, need_type: "stored need", stage: "pre_development",
    amount_requested: 12_000, amount_committed: 0, status: "open",
    description: "Stored funding description", created_at: null, ...extra,
  };
}

export function syntheticDealRoom(extra: Record<string, unknown> = {}) {
  return {
    project: { id: PROJECT, site_id: SITE, name: "Synthetic project", stage: "pre_development" },
    site: { id: SITE, locality: "Synthetic neighbourhood", site_type: "rooftop" },
    journey_stage_id: "pre-development",
    assessment: syntheticAssessment(), assessment_history: [syntheticAssessment()],
    timeline: [],
    documents: [syntheticDocument({ disclosure_class: "investor_tier_1" })],
    ...extra,
  };
}

export function syntheticExportBundle(role: LiveRole = "site-owner", extra: Record<string, unknown> = {}) {
  return {
    user_id: USER, role: role === "site-owner" ? "site_owner" : role,
    generated_at: TIME, scope: "Synthetic caller-scoped records",
    project_count: 1, document_count: 1,
    projects: [{
      site_id: role === "site-owner" ? SITE : null,
      project_id: role === "site-owner" ? null : PROJECT,
      name: "Synthetic project", address: role === "site-owner" ? "Synthetic private address" : null,
      locality: "Synthetic neighbourhood", site_type: "rooftop",
      submission_status: role === "site-owner" ? "submitted" : null,
      project_stage: role === "site-owner" ? null : "pre_development",
      journey_stage_id: role === "site-owner" ? "submitted" : "pre-development",
    }],
    documents: [syntheticDocument({
      site_id: role === "investor" ? null : SITE,
      content_url: `https://unadmitted.invalid/${CANARY}?sig=${CANARY}`,
    })],
    ...extra,
  };
}

export const SYNTHETIC_SAVE_CANARIES = Object.freeze({
  "sunsum-design-lab-v1": '{"version":1,"canary":"SYNTHETIC_SAVE_V1_RETAIN_EXACT_BYTES"}',
  "sunsum-design-lab-v2": '{"version":2,"canary":"SYNTHETIC_SAVE_V2_RETAIN_EXACT_BYTES"}',
});

export function syntheticLocalOrigin(baseURL: string | undefined): string {
  if (baseURL === undefined) throw new Error("A configured local Playwright baseURL is required.");
  const url = new URL(baseURL);
  if (!["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Connected test guards require the exact configured loopback origin.");
  }
  return url.origin;
}

export function syntheticStorageState(origin: string) {
  return {
    cookies: [],
    origins: [{
      origin,
      localStorage: Object.entries(SYNTHETIC_SAVE_CANARIES).map(([name, value]) => ({ name, value })),
    }],
  };
}

export interface SyntheticStorageAttempt {
  readonly operation: "getItem" | "setItem" | "removeItem" | "clear";
  readonly area: "localStorage" | "sessionStorage";
  readonly key: string | null;
}

export interface SyntheticStorageSnapshot {
  readonly attempts: readonly SyntheticStorageAttempt[];
  readonly canaries: Readonly<Record<string, string | null>>;
}

interface SyntheticStorageWindow extends Window {
  __sunsumRecordSyntheticStorageAttempt: (attempt: SyntheticStorageAttempt) => Promise<unknown>;
  __sunsumSyntheticStorageAudit: { snapshot(): Promise<SyntheticStorageSnapshot> };
}

// Serialized by addInitScript: keep all runtime dependencies inside the function.
export function installSyntheticSaveAudit(canaries: Readonly<Record<string, string>>): void {
  const host = window as SyntheticStorageWindow;
  const local = window.localStorage;
  const session = window.sessionStorage;
  const originalGet = Storage.prototype.getItem;
  const originalSet = Storage.prototype.setItem;
  const originalRemove = Storage.prototype.removeItem;
  const originalClear = Storage.prototype.clear;
  const attempts: SyntheticStorageAttempt[] = [];
  const pending: Promise<unknown>[] = [];
  const record = (storage: Storage, operation: SyntheticStorageAttempt["operation"], key: string | null) => {
    if (operation !== "clear" && !key?.startsWith("sunsum-design-lab")) return;
    if (storage !== local && storage !== session) throw new Error("Unexpected storage receiver in synthetic-save guard.");
    const attempt: SyntheticStorageAttempt = {
      operation, key, area: storage === local ? "localStorage" : "sessionStorage",
    };
    attempts.push(attempt);
    // Record before the native method: caught native errors must not hide access.
    pending.push(host.__sunsumRecordSyntheticStorageAttempt(attempt));
  };
  Storage.prototype.getItem = function (key: string) {
    record(this, "getItem", String(key));
    return originalGet.call(this, key);
  };
  Storage.prototype.setItem = function (key: string, value: string) {
    record(this, "setItem", String(key));
    return originalSet.call(this, key, value);
  };
  Storage.prototype.removeItem = function (key: string) {
    record(this, "removeItem", String(key));
    return originalRemove.call(this, key);
  };
  Storage.prototype.clear = function () {
    record(this, "clear", null);
    return originalClear.call(this);
  };
  Object.defineProperty(host, "__sunsumSyntheticStorageAudit", {
    configurable: false,
    writable: false,
    value: {
      async snapshot(): Promise<SyntheticStorageSnapshot> {
        await Promise.all(pending);
        return {
          attempts: [...attempts],
          canaries: Object.fromEntries(Object.keys(canaries).map((key) => [key, originalGet.call(local, key)])),
        };
      },
    },
  });
}

export function readSyntheticSaveAudit(): Promise<SyntheticStorageSnapshot> {
  const audit = (window as SyntheticStorageWindow).__sunsumSyntheticStorageAudit;
  if (!audit) throw new Error("Synthetic-save guards were not installed before application code.");
  return audit.snapshot();
}

export interface SyntheticTrafficRequest {
  readonly url: string;
  readonly method: string;
  readonly resourceType: string;
  readonly rsc?: boolean;
}

export interface SyntheticTrafficObservation extends SyntheticTrafficRequest {
  readonly origin: string;
  readonly path: string;
  readonly violation: string | null;
}

export function syntheticTrafficViolation(
  request: SyntheticTrafficRequest,
  origin: string,
  fixtures: SyntheticLiveReadFixtures | null,
): string | null {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch (error) {
    if (error instanceof TypeError) return "invalid-url";
    throw error;
  }
  if (request.method !== "GET") return "non-get";
  const dataRead = request.resourceType === "fetch" || request.resourceType === "xhr";
  if (url.protocol === "data:" && !dataRead && ["image", "font", "media"].includes(request.resourceType)) return null;
  if (url.protocol === "blob:" && url.origin === origin && request.method === "GET" && !dataRead) return null;
  if (url.origin !== origin) return "foreign-origin";
  if (url.username || url.password) return "invalid-url";
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    return fixtures === null ? "unconfigured-api-read" : fixtures.requestViolation(request.url, request.method);
  }
  if (dataRead) {
    if (url.pathname.startsWith("/_next/")) return null;
    const frameworkDocuments = [
      "/", "/app", "/join", "/need", "/opportunity", "/impact", "/nope", "/privacy", "/terms",
      "/concepts", "/concepts/sunroom", "/concepts/gridline", "/dashboard/site-owner",
    ];
    if (request.rsc === true && url.searchParams.has("_rsc") && frameworkDocuments.includes(url.pathname)) return null;
    return "non-api-data-read";
  }
  return null;
}

export type SyntheticResponseOverride = (
  path: string,
  response: SyntheticLiveReadResponse,
) => SyntheticLiveReadResponse | "network" | Promise<SyntheticLiveReadResponse | "network">;

export interface SyntheticBrowserAudit {
  readonly calls: SyntheticTrafficObservation[];
  readonly unexpected: SyntheticTrafficObservation[];
  readonly storageAttempts: SyntheticStorageAttempt[];
  readonly errors: string[];
  useFixtures(fixtures: SyntheticLiveReadFixtures, override?: SyntheticResponseOverride): void;
  storageSnapshot(): Promise<SyntheticStorageSnapshot>;
}

export interface SyntheticBrowserRequest {
  url(): string;
  method(): string;
  resourceType(): string;
  headers(): Record<string, string>;
}

export interface SyntheticBrowserRoute {
  request(): SyntheticBrowserRequest;
  abort(errorCode?: string): Promise<void>;
  fulfill(response: SyntheticLiveReadResponse): Promise<void>;
  continue(): Promise<void>;
}

export interface SyntheticAuditContext {
  on(event: "request", listener: (request: SyntheticBrowserRequest) => void): unknown;
  exposeBinding(name: string, callback: (source: unknown, attempt: SyntheticStorageAttempt) => void): Promise<void>;
  addInitScript(callback: typeof installSyntheticSaveAudit, canaries: Readonly<Record<string, string>>): Promise<void>;
  route(pattern: string, handler: (route: SyntheticBrowserRoute) => Promise<void>): Promise<void>;
}

export interface SyntheticAuditPage {
  context(): SyntheticAuditContext;
  on(event: "pageerror", listener: (error: Error) => void): unknown;
  evaluate(callback: typeof readSyntheticSaveAudit): Promise<SyntheticStorageSnapshot>;
}

export async function installSyntheticBrowserAudit(page: SyntheticAuditPage, origin: string): Promise<SyntheticBrowserAudit> {
  const calls: SyntheticTrafficObservation[] = [];
  const unexpected: SyntheticTrafficObservation[] = [];
  const storageAttempts: SyntheticStorageAttempt[] = [];
  const errors: string[] = [];
  const context = page.context();
  let fixtures: SyntheticLiveReadFixtures | null = null;
  let override: SyntheticResponseOverride | undefined;
  const observe = (request: SyntheticBrowserRequest): SyntheticTrafficObservation => {
    const url = new URL(request.url());
    const input: SyntheticTrafficRequest = {
      url: request.url(), method: request.method(), resourceType: request.resourceType(),
      rsc: request.headers()["rsc"] === "1",
    };
    return {
      ...input, origin: url.origin, path: `${url.pathname}${url.search}`,
      violation: syntheticTrafficViolation(input, origin, fixtures),
    };
  };
  // Observe the whole test context, independently of fulfillment or case overrides.
  context.on("request", (request) => {
    const entry = observe(request);
    if (new URL(entry.url).pathname.startsWith("/api") || entry.violation !== null) calls.push(entry);
    if (entry.violation !== null) unexpected.push(entry);
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await context.exposeBinding("__sunsumRecordSyntheticStorageAttempt", (_source, attempt: SyntheticStorageAttempt) => {
    storageAttempts.push(attempt);
  });
  await context.addInitScript(installSyntheticSaveAudit, SYNTHETIC_SAVE_CANARIES);
  await context.route("**/*", async (route) => {
    const request = route.request();
    const entry = observe(request);
    if (entry.violation !== null) {
      await route.abort("blockedbyclient");
      return;
    }
    const url = new URL(request.url());
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      if (fixtures === null) throw new Error("An unconfigured API request escaped the synthetic guard.");
      const response = fixtures.responseFor(request.url(), request.method());
      const selected = override === undefined ? response : await override(entry.path, response);
      if (selected === "network") await route.abort("failed");
      else await route.fulfill(selected);
      return;
    }
    await route.continue();
  });
  return {
    calls, unexpected, storageAttempts, errors,
    useFixtures(next, nextOverride) {
      fixtures = next.atOrigin(origin);
      override = nextOverride;
    },
    storageSnapshot: () => page.evaluate(readSyntheticSaveAudit),
  };
}

export interface SyntheticLiveReadResponse {
  readonly status: number;
  readonly contentType: "application/json" | "application/pdf";
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface SyntheticLiveReadFixtureOptions {
  readonly investorEngaged?: boolean;
  readonly documentBytesAvailable?: boolean;
  readonly origin?: string;
  readonly collectionScenario?: "page-two";
  readonly exportPhase?: "preview-a" | "release-b";
}

export type SyntheticFixtureIds = {
  readonly [Key in keyof typeof SYNTHETIC_LIVE_READ_IDS]: string;
};

export interface SyntheticFixtureRecord {
  readonly id: string;
  readonly siteId: string;
  readonly name: string;
  readonly journeyStageId: JourneyStageId;
  readonly siteType: SiteType;
  readonly documentId: string;
  readonly documentName: string;
  readonly continuityMatch: boolean;
}

export type SyntheticRequestViolation =
  | "invalid-url" | "foreign-origin" | "non-get" | "unknown-endpoint"
  | "role-endpoint" | "invalid-query";

export interface SyntheticLiveReadFixtures {
  readonly classification: "SYNTHETIC_TEST_ONLY";
  readonly role: LiveRole;
  readonly origin: string;
  readonly ids: SyntheticFixtureIds;
  readonly records: readonly SyntheticFixtureRecord[];
  readonly responses: Readonly<Record<string, SyntheticLiveReadResponse>>;
  requestViolation(url: string, method?: string): SyntheticRequestViolation | null;
  atOrigin(origin: string): SyntheticLiveReadFixtures;
  responseFor(url: string, method?: string): SyntheticLiveReadResponse;
}

function jsonResponse(body: unknown, status = 200): SyntheticLiveReadResponse {
  return Object.freeze({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
    headers: Object.freeze({ "cache-control": "no-store", "x-sunsum-fixture": "SYNTHETIC_TEST_ONLY" }),
  });
}

function errorResponse(status: number, code: string): SyntheticLiveReadResponse {
  return jsonResponse({ code, message: `SYNTHETIC TEST ONLY: ${code}. No real service is contacted.` }, status);
}

const statuses = ["draft", "submitted", "screening", "info_requested", "accepted", "rejected"] as const satisfies readonly SubmissionStatus[];
const stages = ["pre_development", "development", "construction", "commissioning", "operations"] as const satisfies readonly ProjectStage[];
const siteTypes = ["rooftop", "land"] as const satisfies readonly SiteType[];
const viabilities = ["potentially_viable", "more_information_required", "not_currently_eligible"] as const satisfies readonly ViabilityStatus[];

function validValues(params: URLSearchParams, key: string, allowed: readonly string[]): boolean {
  return params.getAll(key).every((value) => allowed.includes(value));
}

function validFilters(params: URLSearchParams, investor: boolean): boolean {
  const allowed = investor ? ["mandate_match", "stage", "viability", "project_type"] : ["status", "type", "viability", "location"];
  if ([...params.keys()].some((key) => !allowed.includes(key))) return false;
  const repeated = investor ? "stage" : "status";
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    if (key !== repeated && values.length !== 1) return false;
    if (new Set(values).size !== values.length) return false;
  }
  const queryText = params.get(investor ? "project_type" : "location");
  if (queryText !== null && (!queryText.trim() || queryText.length > 200 || /[\u0000-\u001f\u007f]/.test(queryText))) return false;
  if (!validValues(params, "viability", viabilities)) return false;
  if (investor) return validValues(params, "stage", stages) && validValues(params, "mandate_match", ["true", "false"]);
  return validValues(params, "status", statuses) && validValues(params, "type", siteTypes);
}

function releasedAssessment(value: ReturnType<typeof syntheticAssessment>) {
  return Object.fromEntries(Object.entries(value).filter(([key]) =>
    !["inputs_used", "override_reason", "overridden_by_user_id"].includes(key)));
}

function scenarioIds(index: number, phase: SyntheticLiveReadFixtureOptions["exportPhase"]): SyntheticFixtureIds {
  if (index === 0 && phase === undefined) return SYNTHETIC_LIVE_READ_IDS;
  const prefix = phase === "preview-a" ? "a" : phase === "release-b" ? "b" : "c";
  const identifier = (family: number) =>
    `e${prefix}${family.toString(16).padStart(6, "0")}-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`;
  return {
    ...SYNTHETIC_LIVE_READ_IDS,
    siteId: identifier(1), projectId: identifier(2), documentId: identifier(3),
    assessmentId: identifier(4), overrideId: identifier(5), engagementId: identifier(6),
    activityId: identifier(7), fundingNeedId: identifier(8),
  };
}

function projectFixture(
  ids: SyntheticFixtureIds,
  name: string,
  documentName: string,
  siteType: SiteType = "rooftop",
  stage: ProjectStage = "pre_development",
  continuityMatch = false,
) {
  const journeyByStage: Record<ProjectStage, JourneyStageId> = {
    pre_development: "pre-development", development: "development", construction: "construction",
    commissioning: "commissioning", operations: "operations",
  };
  const journey = journeyByStage[stage];
  const updated = "2026-09-20T13:00:00Z";
  const site = syntheticSite({
    id: ids.siteId, owner_user_id: ids.ownerUserId, site_type: siteType,
    address_raw: `Synthetic private address / ${name}`,
    submission_status: "accepted", updated_at: updated,
  });
  const original = syntheticAssessment({
    id: ids.assessmentId, site_id: ids.siteId, preliminary_project_type: "synthetic_project_type",
  });
  const current = syntheticAssessment({
    id: ids.overrideId, site_id: ids.siteId, is_override: true, estimated_system_size_kw_low: 14,
    preliminary_project_type: "synthetic_project_type", override_reason: "Synthetic stored human review",
    overridden_by_user_id: ids.operatorUserId, created_at: updated,
  });
  const project = {
    id: ids.projectId, site_id: ids.siteId, name, assigned_operator_user_id: ids.operatorUserId,
    stage, estimated_capacity_kw: 17, next_action: "Synthetic stored next action", target_date: null,
    visible_to_investors: true, created_at: updated, updated_at: updated,
  };
  const document = syntheticDocument({
    id: ids.documentId, site_id: ids.siteId, project_id: null,
    original_filename: documentName, disclosure_class: "investor_tier_1",
  });
  // This invariant belongs to stored metadata, not contextual export fallback rows.
  if (Number(document.site_id != null) + Number(document.project_id != null) !== 1) {
    throw new Error("Synthetic private document metadata must have exactly one parent.");
  }
  const releasedDocument = {
    id: ids.documentId, original_filename: documentName,
    content_type: document.content_type, size_bytes: document.size_bytes,
    doc_type: document.doc_type, created_at: document.created_at,
  };
  const activity = {
    id: ids.activityId, site_id: ids.siteId, project_id: ids.projectId, action: "submission_accepted",
    actor_user_id: ids.operatorUserId, note: "Synthetic stored activity",
    from_value: "screening", to_value: "accepted", created_at: updated,
  };
  const card = syntheticPipelineCard({
    id: ids.projectId, site_id: ids.siteId, project_id: ids.projectId,
    display_name: name, address_raw: site.address_raw, site_type: siteType,
    project_stage: stage, journey_stage_id: journey,
    viability_status: "potentially_viable", updated_at: updated,
  });
  const summary: SyntheticFixtureRecord = {
    id: ids.projectId, siteId: ids.siteId, name, journeyStageId: journey, siteType,
    documentId: ids.documentId, documentName, continuityMatch,
  };
  return { ids, site, original, current, project, document, releasedDocument, activity, card, summary };
}

export function createSyntheticLiveReadFixtures(
  fixtureRole: LiveRole,
  options: SyntheticLiveReadFixtureOptions = {},
): SyntheticLiveReadFixtures {
  if (!["site-owner", "operator", "investor"].includes(fixtureRole)) {
    throw new Error("Unknown synthetic live-read fixture role.");
  }
  const configured = new URL(options.origin ?? "https://synthetic.invalid");
  if (!["http:", "https:"].includes(configured.protocol) || configured.username || configured.password ||
    configured.pathname !== "/" || configured.search || configured.hash) {
    throw new Error("Synthetic fixtures require an exact HTTP(S) origin.");
  }
  const origin = configured.origin;
  const ids = scenarioIds(0, options.exportPhase);
  const userId = fixtureRole === "site-owner" ? USER : fixtureRole === "operator" ? OTHER : INVESTOR_USER;
  const engaged = options.investorEngaged !== false;
  const name = options.exportPhase === "preview-a" ? "SYNTHETIC_PREVIEW_A_ONLY_PROJECT" :
    options.exportPhase === "release-b" ? "SYNTHETIC_RELEASE_B_ONLY_PROJECT" : "Synthetic project";
  const documentName = options.exportPhase === "preview-a" ? "SYNTHETIC_PREVIEW_A_ONLY.pdf" :
    options.exportPhase === "release-b" ? "SYNTHETIC_RELEASE_B_ONLY.pdf" : "Synthetic report.pdf";
  const entries = [projectFixture(ids, name, documentName)];
  if (options.collectionScenario === "page-two") {
    for (let index = 1; index <= 60; index += 1) {
      entries.push(projectFixture(
        scenarioIds(index, undefined), `Continuity record ${String(index).padStart(3, "0")}`,
        `Continuity record ${String(index).padStart(3, "0")}.pdf`, "rooftop", "pre_development", true,
      ));
    }
    entries.push(
      projectFixture(scenarioIds(61, undefined), "Excluded by search", "Excluded search.pdf"),
      projectFixture(scenarioIds(62, undefined), "Continuity excluded stage", "Excluded stage.pdf", "rooftop", "operations"),
      projectFixture(scenarioIds(63, undefined), "Continuity excluded type", "Excluded type.pdf", "land"),
    );
  }
  const pendingSite = syntheticSite({
    id: UNCONVERTED, site_type: "land", address_raw: "Synthetic unconverted site",
  });
  const owner = { id: USER, role: "site_owner", name: "Synthetic owner", email: "owner@example.invalid", created_at: TIME };
  const ownerSites = [
    ...entries.map((entry) => syntheticOwnerSite({
      site: entry.site, project: entry.project, assessment: entry.current,
      submission_status: "accepted", project_stage: entry.project.stage,
      journey_stage_id: entry.summary.journeyStageId, documents: [entry.document],
    })),
    syntheticOwnerSite({ site: pendingSite, assessment: null, documents: [] }),
  ];
  const pendingSubmission = { site: pendingSite, owner };
  const cards = [
    syntheticPipelineCard({
      id: UNCONVERTED, site_id: UNCONVERTED, project_id: null,
      display_name: pendingSite.address_raw, address_raw: pendingSite.address_raw,
      site_type: "land", submission_status: "submitted", project_stage: null,
      journey_stage_id: "submitted", estimated_capacity_kw: null, viability_status: null,
    }),
    ...entries.map((entry) => entry.card),
  ];
  const sites = new Map(entries.map((entry) => [entry.ids.siteId, entry.site]));
  sites.set(UNCONVERTED, pendingSite);
  const pipelineBody = (items: typeof cards) => ({
    columns: JOURNEY_STAGES.map((stage) => {
      const members = items.filter((card) => card.journey_stage_id === stage.id);
      return { journey_stage_id: stage.id, count: members.length, items: members };
    }),
  });
  const portfolioCards = entries.map((entry) => syntheticPortfolioItem({
    project_id: entry.ids.projectId, name: entry.project.name,
    stage: entry.project.stage, journey_stage_id: entry.summary.journeyStageId,
    site_type: entry.summary.siteType, estimated_system_size_kw_low: 14,
    preliminary_project_type: "synthetic_project_type",
    open_funding_needs_count: 1, my_engagement_state: engaged ? "interested" : undefined,
  }));
  const portfolioBody = (items: typeof portfolioCards, mandateMatch: boolean) => syntheticPortfolio({
    items, project_count: items.length,
    total_estimated_capacity_kw: items.length * 17,
    mandate_match: mandateMatch,
  });
  const manifestRows = cards.map((card) => ({
    site_id: fixtureRole === "investor" ? null : card.site_id,
    project_id: card.project_id,
    name: card.display_name,
    address: fixtureRole === "investor" ? null : sites.get(card.site_id)?.address_raw ?? null,
    locality: fixtureRole === "investor" ? "Synthetic neighbourhood" : null,
    site_type: card.site_type,
    submission_status: fixtureRole === "investor" ? null : card.submission_status,
    project_stage: card.project_stage,
    journey_stage_id: card.journey_stage_id,
    viability_status: card.project_id !== null ? "potentially_viable" : null,
    estimated_system_size_kw_low: card.project_id !== null && fixtureRole !== "operator" ? 14 : null,
    estimated_system_size_kw_high: card.project_id !== null && fixtureRole !== "operator" ? 20 : null,
    estimated_annual_generation_kwh_low: card.project_id !== null && fixtureRole !== "operator" ? 15_000 : null,
    estimated_annual_generation_kwh_high: card.project_id !== null && fixtureRole !== "operator" ? 26_000 : null,
    updated_at: fixtureRole === "investor" ? null : card.updated_at,
  })).filter((card) => fixtureRole !== "investor" || card.project_id !== null);
  const contentPath = (entry: (typeof entries)[number]) =>
    `/api/sites/${entry.ids.siteId}/documents/${entry.ids.documentId}/content`;
  const exportedDocuments = fixtureRole === "investor" && !engaged ? [] : entries.map((entry) => ({
    ...entry.releasedDocument,
    site_id: fixtureRole === "investor" ? null : entry.document.site_id,
    project_id: fixtureRole === "investor" ? null : entry.document.project_id,
    content_url: fixtureRole === "investor" ? null : contentPath(entry),
  }));
  const manifest = syntheticExportBundle(fixtureRole, {
    user_id: userId, projects: manifestRows, documents: exportedDocuments,
    project_count: manifestRows.length, document_count: exportedDocuments.length,
    ...(options.exportPhase === undefined ? {} : {
      scope: options.exportPhase === "preview-a" ? "SYNTHETIC PREVIEW A SCOPE ONLY" : "SYNTHETIC RELEASE B SCOPE ONLY",
      generated_at: options.exportPhase === "preview-a" ? TIME : "2026-09-21T01:00:00Z",
    }),
  });
  const investorEngagements = entries.map((entry) => syntheticEngagement({
    id: entry.ids.engagementId, project_id: entry.ids.projectId, funding_need_id: entry.ids.fundingNeedId,
    project_name: entry.project.name, project_stage: entry.project.stage, journey_stage_id: entry.summary.journeyStageId,
  }));
  const all: Record<string, SyntheticLiveReadResponse> = {
    "/api/me": jsonResponse(syntheticIdentity(fixtureRole, { user_id: userId })),
    "/api/me/sites": jsonResponse(ownerSites),
    "/api/me/outstanding": jsonResponse([]),
    "/api/submissions": jsonResponse([pendingSubmission]),
    "/api/pipeline": jsonResponse(pipelineBody(cards)),
    [`/api/submissions/${UNCONVERTED}`]: jsonResponse(syntheticSubmissionDetail({
      site: pendingSite, owner, assessment: null, assessment_history: [], documents: [], activity: [],
    })),
    "/api/portfolio": jsonResponse(portfolioBody(portfolioCards, false)),
    "/api/investors/me/profile": jsonResponse(syntheticInvestorProfile({
      user_id: INVESTOR_USER, investor_type: "impact_investor", capital_type: "grant",
      ticket_size_min: 5_000, ticket_size_max: 50_000,
      investment_objectives: ["Synthetic community objective"],
      impact_priorities: ["Synthetic community benefit"],
      decision_criteria: ["Synthetic review criterion"],
      deal_room_profile: "SYNTHETIC TEST ONLY investor profile",
      visible_portfolio_scope: ["Synthetic neighbourhood"],
      created_at: TIME, updated_at: TIME,
    })),
    "/api/me/engagements": jsonResponse(engaged ? investorEngagements : []),
    "/api/export?format=json": jsonResponse(manifest),
  };
  for (const entry of entries) {
    all[`/api/submissions/${entry.ids.siteId}`] = jsonResponse(syntheticSubmissionDetail({
      site: entry.site, owner, assessment: entry.current, assessment_history: [entry.original, entry.current],
      documents: [entry.document], activity: [entry.activity],
    }));
    all[`/api/projects/${entry.ids.projectId}/engagements`] = jsonResponse(engaged ? [{
      id: entry.ids.engagementId, investor_id: INVESTOR, project_id: entry.ids.projectId,
      funding_need_id: entry.ids.fundingNeedId, state: "interested",
      state_changed_at: TIME, is_binding: false, created_at: TIME,
    }] : []);
    all[`/api/projects/${entry.ids.projectId}/funding-needs`] = jsonResponse([syntheticFundingNeed({
      id: entry.ids.fundingNeedId, project_id: entry.ids.projectId, created_at: TIME,
    })]);
    all[`/api/projects/${entry.ids.projectId}/deal-room`] = engaged ? jsonResponse(syntheticDealRoom({
      project: entry.project, journey_stage_id: entry.summary.journeyStageId,
      site: { id: entry.ids.siteId, locality: "Synthetic neighbourhood", site_type: entry.summary.siteType,
        ownership_status: null, approximate_area_sqm: null, electricity_usage_kwh_annual: null, has_existing_solar: null },
      assessment: releasedAssessment(entry.current),
      assessment_history: [releasedAssessment(entry.original), releasedAssessment(entry.current)],
      timeline: [{ id: entry.ids.activityId, action: entry.activity.action, from_value: entry.activity.from_value,
        to_value: entry.activity.to_value, created_at: entry.activity.created_at }],
      documents: [entry.releasedDocument],
    })) : errorResponse(403, "forbidden_tier");
    all[contentPath(entry)] = options.documentBytesAvailable === false ? errorResponse(404, "not_found") : Object.freeze({
      status: 200, contentType: "application/pdf", body: PDF,
      headers: Object.freeze({ "cache-control": "no-store", "x-sunsum-fixture": "SYNTHETIC_TEST_ONLY" }),
    });
  }

  const rolePaths: Record<LiveRole, readonly string[]> = {
    "site-owner": ["/api/me/sites", "/api/me/outstanding", ...entries.map(contentPath)],
    operator: [
      "/api/submissions", "/api/pipeline", `/api/submissions/${UNCONVERTED}`,
      ...entries.flatMap((entry) => [
        `/api/submissions/${entry.ids.siteId}`, `/api/projects/${entry.ids.projectId}/engagements`,
        `/api/projects/${entry.ids.projectId}/funding-needs`, contentPath(entry),
      ]),
    ],
    investor: [
      "/api/portfolio", "/api/investors/me/profile", "/api/me/engagements",
      ...entries.flatMap((entry) => [
        `/api/projects/${entry.ids.projectId}/deal-room`, `/api/projects/${entry.ids.projectId}/funding-needs`,
      ]),
    ],
  };
  const allowed = new Set(["/api/me", "/api/export?format=json", ...rolePaths[fixtureRole]]);
  const responses = Object.freeze(Object.fromEntries(Object.entries(all).filter(([path]) => allowed.has(path))));

  function requestViolation(url: string, method = "GET"): SyntheticRequestViolation | null {
    if (method !== "GET") return "non-get";
    let parsed: URL;
    try {
      parsed = new URL(url, origin);
    } catch (error) {
      if (error instanceof TypeError) return "invalid-url";
      throw error;
    }
    if (parsed.origin !== origin) return "foreign-origin";
    if (parsed.username || parsed.password || parsed.hash) return "invalid-url";
    const key = `${parsed.pathname}${parsed.search}`;
    if (responses[key] !== undefined) return null;
    if (!allowed.has(parsed.pathname)) {
      if (all[key] !== undefined || all[parsed.pathname] !== undefined) return "role-endpoint";
      return parsed.pathname === "/api/export" ? "invalid-query" : "unknown-endpoint";
    }
    if (parsed.pathname === "/api/portfolio") return validFilters(parsed.searchParams, true) ? null : "invalid-query";
    if (parsed.pathname === "/api/submissions" || parsed.pathname === "/api/pipeline") {
      return validFilters(parsed.searchParams, false) ? null : "invalid-query";
    }
    return "invalid-query";
  }

  function responseFor(url: string, method = "GET"): SyntheticLiveReadResponse {
    const violation = requestViolation(url, method);
    if (violation !== null) {
      if (violation === "non-get") return errorResponse(405, "invalid_body");
      if (violation === "foreign-origin") return errorResponse(403, "forbidden_origin");
      if (violation === "role-endpoint") return errorResponse(403, "forbidden_role");
      return violation === "unknown-endpoint" ? errorResponse(404, "not_found") : errorResponse(400, "invalid_query");
    }
    const parsed = new URL(url, origin);
    const exact = responses[`${parsed.pathname}${parsed.search}`];
    if (exact !== undefined) return exact;
    const params = parsed.searchParams;
    if (parsed.pathname === "/api/portfolio") {
      const requestedStages = params.getAll("stage");
      const included = portfolioCards.filter((item) =>
        (!requestedStages.length || requestedStages.includes(item.stage)) &&
        (params.get("viability") === null || params.get("viability") === item.viability_status) &&
        (params.get("project_type") === null || params.get("project_type") === "synthetic_project_type"));
      return jsonResponse(portfolioBody(included, params.get("mandate_match") === "true"));
    }
    if (parsed.pathname === "/api/submissions" || parsed.pathname === "/api/pipeline") {
      const requestedStatuses = params.getAll("status");
      const matches = (status: string, siteType: string, address: string, viability: string | null) =>
        (!requestedStatuses.length || requestedStatuses.includes(status)) &&
        (params.get("type") === null || params.get("type") === siteType) &&
        (params.get("viability") === null || params.get("viability") === viability) &&
        (params.get("location") === null || address.toLowerCase().includes(params.get("location")?.toLowerCase() ?? ""));
      if (parsed.pathname === "/api/submissions") {
        return jsonResponse(matches("submitted", "land", pendingSite.address_raw, null) ? [pendingSubmission] : []);
      }
      return jsonResponse(pipelineBody(cards.filter((card) => matches(
        card.submission_status, card.site_type,
        sites.get(card.site_id)?.address_raw ?? "",
        card.project_id !== null ? "potentially_viable" : null,
      ))));
    }
    return errorResponse(400, "invalid_query");
  }

  return Object.freeze({
    classification: "SYNTHETIC_TEST_ONLY",
    role: fixtureRole,
    origin,
    ids,
    records: Object.freeze(entries.map((entry) => Object.freeze(entry.summary))),
    responses,
    requestViolation,
    atOrigin: (nextOrigin: string) => createSyntheticLiveReadFixtures(fixtureRole, { ...options, origin: nextOrigin }),
    responseFor,
  });
}
