import type { LiveReadConfiguration } from "@/domain/live-configuration";
import { workspaceSourceMode } from "@/domain/live-configuration";
import { copyWorkspaceQuery, type WorkspaceQuery } from "@/domain/workspace-filters";

import { LIVE_READ_LIMITS } from "./constants";
import { failure, malformed, ReadFault, readError, rejectRead, success } from "./errors";
import {
  acknowledgements, activity, assessmentHistory, documentContentTypes,
  eligibleProjects, engagements, exportDocuments, exportProjects, fundingNeeds,
  identityFields, investorProfile, investorRoom, mergeRecords, outstanding,
  ownerEntries, person, pipeline, portfolio, privateAssessment, privateDocuments,
  privateProject, privateSite, siteRecord, submissions, type IdentityFields,
} from "./projections";
import { WS2_CONTRACT_REVISION } from "./registry";
import { currentProjectInterest } from "./interest";
import {
  createTransport, operationPath, throwIfAborted, validateQuery, type Operation,
} from "./transport";
import type {
  DetailReference, DocumentReference, LiveDetail, LiveExportManifest, LiveIdentity,
  InterestOptions, InterestReceipt, InterestResult,
  LiveReadClient, LiveReadClientOptions, LiveSnapshot, ReadDownload, ReadEngagement, ReadEngagements, ReadError,
  ReadInvestorDocument, ReadOperation, ReadOptions, ReadPrivateProject,
  ReadProvenance, ReadResult, ReadScope, ReadSummary, ScopedReadOptions,
  SnapshotReadOptions, WorkspaceClient,
} from "./types";
import { activeEngagementStates, count, id, isId, isObject, list, object, role, safeFileName, text, timestamp } from "./values";

type Channel = "identity" | "snapshot" | "detail" | "document" | "export" | "engagements" | "interest";
interface Group {
  readonly channel: Channel;
  readonly controller: AbortController;
  readonly operations: ReadOperation[];
  readonly cleanup: () => void;
  readonly expectedIdentity: IdentityFields | null;
  generation: number;
}

function sameIdentity(left: IdentityFields, right: IdentityFields): boolean {
  return left.userId === right.userId && left.role === right.role &&
    left.investorId === right.investorId && left.onboarded === right.onboarded &&
    left.organizationName === right.organizationName;
}

export function workspaceActorKey(identity: IdentityFields): string {
  return JSON.stringify([
    identity.userId, identity.role, identity.investorId, identity.onboarded, identity.organizationName,
  ]);
}

function validateOptions(options: unknown, allowedKeys: readonly string[]): void {
  if (!isObject(options) || Object.keys(options).some((key) => !allowedKeys.includes(key))) {
    rejectRead("invalid", "Only the documented service options are admitted.", "invalid_options");
  }
  if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) {
    rejectRead("invalid", "A valid AbortSignal is required.", "invalid_signal");
  }
}

function validateReference(reference: unknown): asserts reference is DetailReference {
  if (!isObject(reference)) rejectRead("invalid", "A typed detail reference is required.", "invalid_reference");
  const keys = reference.kind === "project" ? ["kind", "siteId", "projectId"] :
    reference.kind === "deal-room" ? ["kind", "projectId"] :
    reference.kind === "owner-site" || reference.kind === "submission" ? ["kind", "siteId"] : null;
  if (keys === null || Object.keys(reference).some((key) => !keys.includes(key)) ||
    keys.some((key) => key !== "kind" && !isId(reference[key]))) {
    rejectRead("invalid", "A known detail kind and canonical UUIDs are required.", "invalid_reference");
  }
}

function validateDocument(reference: unknown): asserts reference is DocumentReference {
  const keys = ["siteId", "documentId", "fileName", "contentType", "sizeBytes"];
  if (!isObject(reference) || Object.keys(reference).some((key) => !keys.includes(key)) ||
    !isId(reference.siteId) || !isId(reference.documentId) ||
    (reference.fileName !== null && typeof reference.fileName !== "string") ||
    (reference.contentType !== null && typeof reference.contentType !== "string") ||
    (reference.sizeBytes !== null &&
      (typeof reference.sizeBytes !== "number" || !Number.isSafeInteger(reference.sizeBytes) || reference.sizeBytes < 0))) {
    rejectRead("invalid", "A document reference from admitted metadata is required.", "invalid_reference");
  }
}

function configuredOrigin(value: string | undefined): string {
  const browserOrigin = typeof location === "undefined" ? undefined : location.origin;
  const raw = value ?? browserOrigin;
  if (!raw) rejectRead("out-of-reach", "A same-origin application context is required.", "missing_origin");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (error) {
    if (error instanceof TypeError) rejectRead("invalid", "The application origin is invalid.", "invalid_origin");
    throw error;
  }
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password ||
    parsed.pathname !== "/" || parsed.search || parsed.hash ||
    (browserOrigin !== undefined && parsed.origin !== browserOrigin)) {
    rejectRead("invalid", "Only the current application's origin is admitted.", "invalid_origin");
  }
  return parsed.origin;
}

function localSummary(records: LiveSnapshot["records"], projectsKnown = true): ReadSummary {
  return {
    recordCount: records.length,
    projectCount: projectsKnown ? records.filter((record) => record.projectId !== null).length : null,
    totalEstimatedCapacityKw: null,
    mandateMatch: null,
  };
}

export function createWorkspaceClient(
  configuration: LiveReadConfiguration,
  options: LiveReadClientOptions = {},
): ReadResult<WorkspaceClient> {
  try {
    if (!isObject(configuration) || configuration.canAttemptReads !== true || configuration.apiBasePath !== "/api") {
      return failure(readError("out-of-reach", "The existing-service read connection has not been admitted.", "configuration_not_admitted"));
    }
    const sourceMode = workspaceSourceMode(configuration);
    if ((sourceMode !== "connected" && sourceMode !== "server-demo") ||
      configuration.source !== (sourceMode === "server-demo" ? "mock-configured" : "database-configured")) {
      return failure(readError("out-of-reach", "The source mode and store do not match; no fallback is admitted.", "configuration_not_admitted"));
    }
    const mode = sourceMode;
    const configKeys = [
      "canAttemptReads", "canAttemptExports", "canAttemptDocumentDownloads",
      "apiBasePath", "source", "reason", "mode", "canAttemptInterest", "syntheticIdentities",
    ];
    if (Object.keys(configuration).some((key) => !configKeys.includes(key))) {
      rejectRead("invalid", "Only public-safe read admission configuration is accepted.", "invalid_configuration");
    }
    const synthetic = configuration.syntheticIdentities;
    if (synthetic !== undefined && (!isObject(synthetic) ||
      Object.keys(synthetic).some((key) => key !== "userIds" && key !== "investorIds") ||
      !Array.isArray(synthetic.userIds) || !Array.isArray(synthetic.investorIds) ||
      synthetic.userIds.length > 32 || synthetic.investorIds.length > 32 ||
      !synthetic.userIds.every(isId) || !synthetic.investorIds.every(isId))) {
      rejectRead("invalid", "Synthetic-identity evidence must contain bounded public UUID lists.", "invalid_configuration");
    }
    const syntheticUsers = new Set(synthetic?.userIds.map((value) => value.toLowerCase()));
    const syntheticInvestors = new Set(synthetic?.investorIds.map((value) => value.toLowerCase()));
    const parseIdentity = (value: unknown): IdentityFields => {
      const identity = identityFields(value);
      if (mode === "connected" && (syntheticUsers.has(identity.userId) ||
        (identity.investorId !== null && syntheticInvestors.has(identity.investorId)))) {
        rejectRead("denied", "This is a known seeded demo identity, not an admitted connected participant.", "synthetic_identity");
      }
      return identity;
    };
    validateOptions(options, ["origin", "fetch", "timeoutMs", "now"]);
    const origin = configuredOrigin(options.origin);
    const fetcher = options.fetch ?? globalThis.fetch?.bind(globalThis);
    if (typeof fetcher !== "function") rejectRead("out-of-reach", "A browser fetch implementation is required.", "fetch_unavailable");
    if (options.timeoutMs !== undefined && (typeof options.timeoutMs !== "number" || !Number.isFinite(options.timeoutMs))) {
      rejectRead("invalid", "The timeout must be a finite number.", "invalid_timeout");
    }
    if (options.now !== undefined && typeof options.now !== "function") {
      rejectRead("invalid", "The observation clock must be a function.", "invalid_clock");
    }
    const timeoutMs = Math.max(1, Math.min(options.timeoutMs ?? LIVE_READ_LIMITS.defaultTimeoutMs, LIVE_READ_LIMITS.maxTimeoutMs));
    const now = options.now ?? (() => new Date());
    const admitDocuments = configuration.canAttemptDocumentDownloads === true;
    const admitExports = configuration.canAttemptExports === true;
    const admitInterest = configuration.canAttemptInterest === true && configuration.mode === mode;
    const transport = createTransport(origin, fetcher, timeoutMs);
    const groups = new Map<Channel, Group>();
    const documents = new Map<string, DocumentReference>();
    const permittedInterestProjects = new Set<string>();
    let interestQuery: WorkspaceQuery | null = null;
    const unknownInterest = new Map<string, InterestReceipt>();
    let interestPending = false;
    let generation = 0;
    let current: IdentityFields | null = null;
    let observedActor: IdentityFields | null = null;
    let scope: ReadScope | null = null;

    function retire(error: ReadError, except?: Group): void {
      generation += 1;
      current = null;
      scope = null;
      documents.clear();
      permittedInterestProjects.clear();
      interestQuery = null;
      for (const pending of groups.values()) {
        if (pending !== except) pending.controller.abort(new ReadFault(error));
      }
    }

    function invalidate(): void {
      retire(readError("stale", "The read context has been retired.", "context_invalidated"));
    }

    function currentScope(expected?: unknown): ReadScope {
      if (scope === null || current === null ||
        (expected !== undefined && (!isObject(expected) || expected.generation !== generation ||
          expected.userId !== current.userId || expected.role !== current.role))) {
        rejectRead("stale", "This read scope is no longer current.", "stale_scope");
      }
      return scope;
    }

    function assertGroup(group: Group): void {
      throwIfAborted(group.controller.signal);
      if (group.generation !== generation) rejectRead("stale", "The read context changed.", "stale_scope");
    }

    function begin(channel: Channel, readOptions: ReadOptions): Group {
      const signal = readOptions.signal;
      if (signal?.aborted) throwIfAborted(signal);
      let expectedIdentity: IdentityFields | null = null;
      if (channel === "snapshot" && "scope" in readOptions && readOptions.scope !== undefined) {
        currentScope(readOptions.scope);
        expectedIdentity = current === null ? null : { ...current };
      }
      if (channel === "snapshot") invalidate();
      const superseded = new ReadFault(readError("canceled", "A newer read superseded this request.", "superseded"));
      groups.get(channel)?.controller.abort(superseded);
      if (channel === "detail") {
        groups.get("document")?.controller.abort(superseded);
        groups.get("export")?.controller.abort(superseded);
        documents.clear();
      }
      const controller = new AbortController();
      const relay = () => controller.abort(new ReadFault(readError("canceled", "The read was canceled.", "canceled")));
      signal?.addEventListener("abort", relay, { once: true });
      const group: Group = {
        channel, controller, operations: [], generation, expectedIdentity,
        cleanup: () => signal?.removeEventListener("abort", relay),
      };
      groups.set(channel, group);
      return group;
    }

    async function run<T>(
      channel: Channel,
      readOptions: ReadOptions,
      execute: (group: Group) => Promise<T>,
    ): Promise<ReadResult<T>> {
      let group: Group | undefined;
      try {
        validateOptions(readOptions, channel === "snapshot" ? ["signal", "query", "scope"] :
          channel === "interest" ? ["signal", "scope", "acknowledgeUnknownOutcome"] :
          channel === "identity" ? ["signal"] : ["signal", "scope"]);
        if (channel !== "snapshot" && channel !== "identity" &&
          (!("scope" in readOptions) || !isObject(readOptions.scope))) {
          rejectRead("stale", "A current read scope is required.", "stale_scope");
        }
        group = begin(channel, readOptions);
        const data = await execute(group);
        assertGroup(group);
        return success(data);
      } catch (error) {
        if (!(error instanceof ReadFault)) throw error;
        if (group?.controller.signal.aborted) {
          const reason: unknown = group.controller.signal.reason;
          return failure(reason instanceof ReadFault ? reason.error :
            readError("canceled", "The read was canceled.", "canceled"));
        }
        // A retired group's denial must not revoke the newer read context.
        if (group !== undefined && group.generation === generation && groups.get(channel) === group &&
          (error.error.kind === "unauthenticated" || error.error.kind === "denied")) {
          retire(error.error, group);
        }
        return failure(error.error);
      } finally {
        if (group !== undefined) {
          group.cleanup();
          group.controller.abort();
          if (groups.get(channel) === group) groups.delete(channel);
        }
      }
    }

    async function read<T>(group: Group, operation: Operation, project: (value: unknown) => T): Promise<T> {
      assertGroup(group);
      try {
        const payload = await transport.json(operation, group.controller.signal, group.operations);
        assertGroup(group);
        return project(payload);
      } catch (error) {
        if (!(error instanceof ReadFault)) throw error;
        throw new ReadFault({
          ...error.error,
          connectionId: error.error.connectionId ?? operationPath(operation).connectionId,
        });
      }
    }

    async function section<T>(group: Group, operation: Operation, project: (value: unknown) => T): Promise<ReadResult<T>> {
      try {
        return success(await read(group, operation, project));
      } catch (error) {
        if (!(error instanceof ReadFault)) throw error;
        if (["stale", "canceled", "unauthenticated", "denied"].includes(error.error.kind)) throw error;
        return failure(error.error);
      }
    }

    function provenance(group: Group, identityOnly = false): ReadProvenance {
      const observedAt = now();
      if (!(observedAt instanceof Date) || !Number.isFinite(observedAt.getTime())) {
        rejectRead("invalid", "The observation clock returned an invalid date.", "invalid_clock");
      }
      return {
        source: "WS2",
        mode,
        store: mode === "server-demo" ? "mock-configured" : "database-configured",
        contractRevision: WS2_CONTRACT_REVISION,
        deployedRevision: null,
        retrievedAt: observedAt.toISOString(),
        operations: group.operations.filter((operation) => !identityOnly || operation.path === "/api/me")
          .map((operation) => ({ ...operation })),
      };
    }

    function describe(identity: IdentityFields, group: Group): LiveIdentity {
      return { ...identity, scope: currentScope(), provenance: provenance(group, true) };
    }

    function adopt(identity: IdentityFields): void {
      if (observedActor !== null && !sameIdentity(observedActor, identity)) unknownInterest.clear();
      observedActor = { ...identity };
      current = Object.freeze({ ...identity });
      scope ??= Object.freeze({ userId: identity.userId, role: identity.role, generation });
    }

    function identityChanged(group: Group): never {
      const error = readError("stale", "The participant identity or disclosure context changed during the read.", "identity_changed", "SUNSUM-CONNECTION:WS2-IDENTITY");
      retire(error, group);
      throw new ReadFault(error);
    }

    async function establish(group: Group): Promise<IdentityFields> {
      const identity = await read(group, { kind: "identity" }, parseIdentity);
      if (current !== null && !sameIdentity(identity, current)) identityChanged(group);
      adopt(identity);
      return identity;
    }

    async function before(group: Group, expected: ReadScope): Promise<IdentityFields> {
      currentScope(expected);
      const identity = await establish(group);
      currentScope(expected);
      return identity;
    }

    async function after(group: Group, expected: IdentityFields): Promise<void> {
      const identity = await read(group, { kind: "identity" }, parseIdentity);
      if (!sameIdentity(identity, expected)) identityChanged(group);
      currentScope();
    }

    function requireInvestor(identity: IdentityFields): void {
      if (identity.role !== "investor" || identity.onboarded !== true || identity.investorId === null) {
        rejectRead("denied", "The existing service must confirm completed investor onboarding for this read.", "onboarding_required");
      }
    }

    function reconcileUnknownInterest(identity: IdentityFields, entries: readonly ReadEngagement[]): void {
      if (unknownInterest.size === 0) return;
      const latest = new Map<string, ReadEngagement>();
      for (const entry of entries) {
        if (entry.fundingNeedId === null) latest.set(entry.projectId, entry);
      }
      for (const entry of latest.values()) {
        if (entry.state !== null && activeEngagementStates.includes(entry.state)) {
          unknownInterest.delete(`${identity.userId}:${identity.investorId}:${entry.projectId}`);
        }
      }
    }

    function remember(entries: readonly { readonly download: DocumentReference | null }[]): void {
      for (const entry of entries) {
        const reference = entry.download;
        if (reference !== null) documents.set(`${reference.siteId}:${reference.documentId}`, Object.freeze({ ...reference }));
      }
    }

    function detailBase(identity: IdentityFields, group: Group) {
      return { identity: describe(identity, group), scope: currentScope(), provenance: provenance(group) };
    }

    async function readIdentity(readOptions: ReadOptions = {}): Promise<ReadResult<LiveIdentity>> {
      return run("identity", readOptions, async (group) => {
        const identity = await read(group, { kind: "identity" }, parseIdentity);
        if (current !== null && !sameIdentity(identity, current)) {
          retire(readError("stale", "The participant identity changed.", "identity_changed"), group);
          group.generation = generation;
        }
        adopt(identity);
        return describe(identity, group);
      });
    }

    async function readSnapshot(readOptions: SnapshotReadOptions = {}): Promise<ReadResult<LiveSnapshot>> {
      return run("snapshot", readOptions, async (group): Promise<LiveSnapshot> => {
        validateQuery(readOptions.query);
        const filter = readOptions.query === undefined ? undefined : copyWorkspaceQuery(readOptions.query);
        const identity = await establish(group);
        if (group.expectedIdentity !== null && !sameIdentity(group.expectedIdentity, identity)) identityChanged(group);
        validateQuery(filter, identity.role);
        if (identity.role === "site-owner") {
          const entries = await read(group, { kind: "owner-sites" }, (value) => ownerEntries(value, identity));
          const records = entries.map((entry) => siteRecord(entry, identity));
          const sites = new Set(records.flatMap((entry) => entry.siteId === null ? [] : [entry.siteId]));
          const attention = await section(group, { kind: "outstanding" }, (value) => outstanding(value, sites));
          await after(group, identity);
          return {
            ...detailBase(identity, group),
            role: "site-owner", records, sites: records,
            summary: localSummary(records), outstanding: attention,
            completeness: attention.ok ? "complete" : "partial",
          };
        }
        if (identity.role === "operator") {
          const query = filter === undefined ? {} : { query: filter };
          const queue = await read(group, { kind: "submissions", ...query }, submissions);
          const board = await section(group, { kind: "pipeline", ...query }, pipeline);
          const records = board.ok ? mergeRecords(queue, board.data) : queue;
          await after(group, identity);
          return {
            ...detailBase(identity, group),
            role: "operator", records, submissions: queue, pipeline: board,
            summary: localSummary(records, board.ok), completeness: board.ok ? "complete" : "partial",
          };
        }
        requireInvestor(identity);
        const query = filter === undefined ? {} : { query: filter };
        const collection = await read(group, { kind: "portfolio", ...query }, portfolio);
        const profile = await section(group, { kind: "profile" }, (value) => investorProfile(value, identity));
        const pipelineItems = await section(group, { kind: "my-engagements" }, (value) => engagements(value, identity));
        await after(group, identity);
        if (pipelineItems.ok) reconcileUnknownInterest(identity, pipelineItems.data);
        interestQuery = filter ?? {};
        for (const record of collection.records) {
          if (record.projectId !== null) permittedInterestProjects.add(record.projectId);
        }
        return {
          ...detailBase(identity, group),
          role: "investor", records: collection.records, summary: collection.summary,
          profile, engagements: pipelineItems,
          completeness: profile.ok && pipelineItems.ok ? "complete" : "partial",
        };
      });
    }

    async function readMyEngagements(readOptions: ScopedReadOptions): Promise<ReadResult<ReadEngagements>> {
      return run("engagements", readOptions, async (group) => {
        const identity = await before(group, readOptions.scope);
        requireInvestor(identity);
        const entries = await read(group, { kind: "my-engagements" }, (value) => engagements(value, identity));
        await after(group, identity);
        reconcileUnknownInterest(identity, entries);
        return { ...detailBase(identity, group), engagements: entries };
      });
    }

    async function expressInterest(projectId: string, readOptions: InterestOptions): Promise<InterestResult> {
      if (!admitInterest) return {
        kind: "not-sent", receipt: null,
        error: readError("out-of-reach", "Nonbinding interest has not been admitted for this configuration.", "interest_not_admitted"),
      };
      if (interestPending) return {
        kind: "not-sent", receipt: null,
        error: readError("invalid", "An interest request is already in progress. No additional request was sent.", "interest_pending"),
      };
      interestPending = true;
      let dispatched = false;
      let receipt: InterestReceipt | null = null;
      let key: string | null = null;
      try {
        const result = await run("interest", readOptions, async (group): Promise<InterestResult> => {
          if (!isId(projectId)) rejectRead("invalid", "A canonical project UUID is required.", "invalid_id");
          projectId = projectId.toLowerCase();
          if (readOptions.acknowledgeUnknownOutcome !== undefined && typeof readOptions.acknowledgeUnknownOutcome !== "boolean") {
            rejectRead("invalid", "A deliberate uncertainty acknowledgement must be boolean.", "invalid_options");
          }
          const acknowledged = readOptions.acknowledgeUnknownOutcome === true;
          const identity = await before(group, readOptions.scope);
          requireInvestor(identity);
          if (interestQuery === null || !permittedInterestProjects.has(projectId)) {
            rejectRead("denied", "Choose a project in the current permitted portfolio before registering interest.", "project_not_admitted");
          }
          const collection = await read(group, { kind: "portfolio", query: interestQuery }, portfolio);
          if (!collection.records.some((record) => record.projectId === projectId)) {
            rejectRead("denied", "This project is no longer in the current permitted portfolio. Refresh the collection before registering interest.", "project_not_admitted");
          }
          const investorId = identity.investorId;
          if (investorId === null) return malformed();
          key = `${identity.userId}:${investorId}:${projectId}`;
          const entries = await read(group, { kind: "my-engagements" }, (value) => engagements(value, identity));
          await after(group, identity);
          const observedAt = now();
          if (!(observedAt instanceof Date) || !Number.isFinite(observedAt.getTime())) {
            rejectRead("invalid", "The observation clock is invalid.", "invalid_clock");
          }
          const makeReceipt = (sent: boolean): InterestReceipt => ({
            method: "POST", path: `/api/projects/${projectId}/engagements`,
            projectId, investorId, scope: { ...currentScope() }, mode,
            dispatched: sent, observedAt: observedAt.toISOString(),
            contractRevision: WS2_CONTRACT_REVISION, deployedRevision: null,
          });
          receipt = makeReceipt(false);
          const existing = currentProjectInterest(entries, projectId);
          if (existing !== null) {
            unknownInterest.delete(key);
            return { kind: "existing", receipt, engagement: existing };
          }
          const previous = unknownInterest.get(key);
          if (previous && !acknowledged) return {
            kind: "unknown", receipt: previous,
            error: readError("unavailable",
              "The previous outcome is still unknown. Refresh status, or explicitly acknowledge it before a new attempt.",
              "interest_outcome_unknown"),
          };
          if (!previous && unknownInterest.size >= LIVE_READ_LIMITS.maxItems) {
            rejectRead("too-large", "Reconcile unresolved interest requests before starting another one.", "interest_receipt_limit");
          }
          assertGroup(group);
          const response = await transport.postInterest(projectId, group.controller.signal, () => {
            receipt = makeReceipt(true);
            dispatched = true;
          });
          if (response.kind === "refused") return previous
            ? { kind: "unknown", receipt: previous, error: {
                ...response.error,
                message: "The new request was refused; the earlier interest outcome is still unknown. Refresh existing engagements.",
              } }
            : { kind: "refused", receipt, error: response.error };
          const created = response.kind === "created"
            ? engagements([response.payload], identity, projectId)[0] : null;
          if (response.kind === "created" && (object(response.payload).funding_need_id !== null ||
            !created || created.fundingNeedId !== null ||
            created.state !== "interested" || created.isBinding !== false ||
            created.createdAt === null || created.stateChangedAt === null)) malformed();
          await after(group, identity);
          assertGroup(group);
          unknownInterest.delete(key);
          return created
            ? { kind: "created", receipt, engagement: created }
            : { kind: "existing", receipt, engagement: null };
        });
        if (result.ok) {
          if ((result.data.kind === "refused" || result.data.kind === "unknown") &&
            (result.data.error.kind === "unauthenticated" || result.data.error.kind === "denied")) {
            retire(result.data.error);
          }
          return result.data;
        }
        if (dispatched) {
          if (key !== null && receipt !== null && observedActor?.userId === readOptions.scope.userId) {
            unknownInterest.set(key, receipt);
          }
          return {
            kind: "unknown", receipt,
            error: { ...result.error, message: "The interest outcome is unknown. It may have completed; refresh existing engagements without sending it again." },
          };
        }
        return {
          kind: result.error.kind === "unauthenticated" || result.error.kind === "denied" ? "refused" : "not-sent",
          receipt, error: result.error,
        };
      } finally {
        interestPending = false;
      }
    }

    async function readDetail(reference: DetailReference, readOptions: ScopedReadOptions): Promise<ReadResult<LiveDetail>> {
      return run("detail", readOptions, async (group): Promise<LiveDetail> => {
        validateReference(reference);
        reference = { ...reference };
        const identity = await before(group, readOptions.scope);
        if (identity.role === "site-owner" && reference.kind === "owner-site") {
          const siteId = id(reference.siteId);
          const entries = await read(group, { kind: "owner-sites" }, (value) => ownerEntries(value, identity));
          const entry = entries.find((candidate) => id(object(candidate.site).id) === siteId);
          if (entry === undefined) rejectRead("missing", "The caller's site is not available.", "not_found");
          const site = privateSite(entry.site);
          const project = privateProject(entry.project, siteId);
          const result = {
            record: siteRecord(entry, identity), site, project, owner: null,
            contact: person(entry.contact),
            assessments: assessmentHistory(entry, (value) => privateAssessment(value, siteId)),
            documents: privateDocuments(entry.documents, siteId, project?.id ?? null, admitDocuments),
            activity: null,
            outstanding: entry.outstanding == null ? null : outstanding(entry.outstanding, new Set([siteId])),
            acknowledgements: acknowledgements(entry.acknowledgements, project?.id ?? null),
          };
          await after(group, identity);
          remember(result.documents);
          return { ...detailBase(identity, group), ...result, role: "site-owner", kind: "owner-site", completeness: "complete" };
        }
        if (identity.role === "operator" && (reference.kind === "submission" || reference.kind === "project")) {
          const siteId = id(reference.siteId);
          let linked: LiveSnapshot["records"][number] | undefined;
          if (reference.kind === "project") {
            const requestedProjectId = id(reference.projectId);
            const board = await read(group, { kind: "pipeline" }, pipeline);
            linked = board.columns.flatMap((column) => column.records).find((entry) => entry.projectId === requestedProjectId);
            if (linked === undefined) rejectRead("missing", "The project is not present in the current pipeline.", "not_found");
            if (linked.siteId !== siteId) rejectRead("denied", "The project and site do not match the current pipeline.", "scope_mismatch");
          }
          const entry = await read(group, { kind: "submission", siteId }, object);
          const site = privateSite(entry.site);
          if (site.id !== siteId) rejectRead("denied", "The submission response does not match the requested site.", "scope_mismatch");
          const owner = person(entry.owner);
          if (owner !== null && site.ownerUserId !== null && owner.id !== site.ownerUserId) {
            rejectRead("denied", "The submission owner does not match the site.", "scope_mismatch");
          }
          const summary = siteRecord(entry);
          const projectId = linked?.projectId ?? null;
          const project: ReadPrivateProject | null = projectId === null || linked === undefined ? null : {
            id: projectId, siteId, name: linked.name, stage: linked.projectStage,
            estimatedCapacityKw: linked.estimatedCapacityKw, updatedAt: linked.updatedAt,
            assignedOperatorUserId: null, nextAction: null, targetDate: null,
            visibleToInvestors: null, createdAt: null,
          };
          const details = {
            site, project, owner,
            record: linked === undefined ? summary : {
              ...linked,
              estimatedSystemSizeKw: summary.estimatedSystemSizeKw,
              estimatedAnnualGenerationKwh: summary.estimatedAnnualGenerationKwh,
              preliminaryProjectType: summary.preliminaryProjectType,
            },
            assessments: assessmentHistory(entry, (value) => privateAssessment(value, siteId)),
            documents: privateDocuments(entry.documents, siteId, projectId, admitDocuments),
            activity: activity(entry.activity, siteId),
          };
          const projectEngagements = projectId === null ? null : await section(
            group, { kind: "project-engagements", projectId, role: "operator" },
            (value) => engagements(value, identity, projectId),
          );
          const funding = projectId === null ? null : await section(
            group, { kind: "funding", projectId, role: "operator" }, (value) => fundingNeeds(value, projectId),
          );
          await after(group, identity);
          remember(details.documents);
          return {
            ...detailBase(identity, group), ...details, role: "operator", kind: reference.kind,
            engagements: projectEngagements, fundingNeeds: funding,
            completeness: projectEngagements?.ok === false || funding?.ok === false ? "partial" : "complete",
          };
        }
        if (identity.role === "investor" && reference.kind === "deal-room") {
          requireInvestor(identity);
          const projectId = id(reference.projectId);
          const mine = await read(group, { kind: "my-engagements" }, (value) => engagements(value, identity));
          if (!eligibleProjects(mine).has(projectId)) {
            rejectRead("denied", "An existing eligible engagement is required for the deal room.", "forbidden_tier");
          }
          const room = await read(
            group, { kind: "deal-room", projectId, role: "investor" },
            (value) => investorRoom(value, projectId, identity),
          );
          const funding = await section(
            group, { kind: "funding", projectId, role: "investor" }, (value) => fundingNeeds(value, projectId),
          );
          await after(group, identity);
          return {
            ...detailBase(identity, group), ...room, role: "investor", kind: "deal-room",
            disclosureTier: 1, fundingNeeds: funding, completeness: funding.ok ? "complete" : "partial",
          };
        }
        return rejectRead("denied", "This detail reference is not admitted for the observed role.", "forbidden_role");
      });
    }

    async function readDocument(reference: DocumentReference, readOptions: ScopedReadOptions): Promise<ReadResult<ReadDownload>> {
      if (!admitDocuments) return failure(readError(
        "out-of-reach", "Original document bytes have not been separately admitted.", "documents_not_admitted",
        "SUNSUM-CONNECTION:WS2-DOCUMENTS-EXPORT",
      ));
      return run("document", readOptions, async (group) => {
        validateDocument(reference);
        reference = { ...reference };
        currentScope(readOptions.scope);
        const admitted = documents.get(`${id(reference.siteId)}:${id(reference.documentId)}`);
        if (admitted === undefined || reference.fileName !== admitted.fileName ||
          reference.contentType !== admitted.contentType || reference.sizeBytes !== admitted.sizeBytes) {
          rejectRead("denied", "The document must come from current admitted owner or operator metadata.", "document_not_admitted");
        }
        const identity = await before(group, readOptions.scope);
        if (identity.role === "investor") rejectRead("denied", "Original bytes are not admitted for investors.", "forbidden_role");
        const response = await transport.bytes({
          kind: "document", siteId: admitted.siteId, documentId: admitted.documentId,
        }, group.controller.signal, group.operations);
        if (!documentContentTypes.some((type) => type === response.contentType) ||
          response.contentType !== admitted.contentType ||
          (admitted.sizeBytes !== null && admitted.sizeBytes !== response.bytes.byteLength)) malformed();
        await after(group, identity);
        const extension = response.contentType === "application/pdf" ? "pdf" :
          response.contentType === "image/png" ? "png" : "jpg";
        const base = safeFileName(admitted.fileName, "document").replace(/\.[^.]*$/, "");
        const blob = new Blob([response.bytes], { type: response.contentType });
        return {
          blob, fileName: `${base || "document"}.${extension}`, contentType: response.contentType,
          sizeBytes: blob.size, provenance: provenance(group),
        };
      });
    }

    async function readExport(readOptions: ScopedReadOptions): Promise<ReadResult<LiveExportManifest>> {
      if (!admitExports) return failure(readError(
        "out-of-reach", "Manifest export has not been separately admitted.", "exports_not_admitted",
        "SUNSUM-CONNECTION:WS2-DOCUMENTS-EXPORT",
      ));
      return run("export", readOptions, async (group) => {
        const identity = await before(group, readOptions.scope);
        if (identity.role === "investor") requireInvestor(identity);
        const source = await read(group, { kind: "export" }, object);
        if (id(source.user_id) !== identity.userId || role(source.role) !== identity.role) identityChanged(group);
        let projects = exportProjects(source.projects, identity);
        const released = new Map<string, ReadInvestorDocument>();
        if (identity.role === "investor") {
          const visible = await read(group, { kind: "portfolio" }, portfolio);
          const allowed = new Set(visible.records.map((entry) => entry.projectId));
          projects = projects.filter((entry) => allowed.has(entry.projectId));
          const mine = await read(group, { kind: "my-engagements" }, (value) => engagements(value, identity));
          if (list(source.documents).length > 0) {
            for (const projectId of eligibleProjects(mine)) {
              if (!allowed.has(projectId)) continue;
              const room = await read(
                group, { kind: "deal-room", projectId, role: "investor" },
                (value) => investorRoom(value, projectId, identity),
              );
              for (const document of room.documents) released.set(document.id, document);
            }
          }
        }
        const exportedDocuments = exportDocuments(source.documents, identity, admitDocuments, released, projects);
        if (identity.role === "site-owner") {
          const entries = await read(group, { kind: "owner-sites" }, (value) => ownerEntries(value, identity));
          const owned = new Map(entries.map((entry) => {
            const siteId = id(object(entry.site).id);
            return [siteId, privateProject(entry.project, siteId)?.id ?? null];
          }));
          for (const project of projects) {
            if (project.siteId === null || !owned.has(project.siteId) || owned.get(project.siteId) !== project.projectId) {
              rejectRead("denied", "The export contains a site outside the caller's current records.", "scope_mismatch");
            }
          }
          const knownDocuments = new Map(entries.flatMap((entry) => {
            const siteId = id(object(entry.site).id);
            return privateDocuments(entry.documents, siteId, owned.get(siteId) ?? null, admitDocuments)
              .map((document) => [document.id, document] as const);
          }));
          for (const document of exportedDocuments) {
            const known = knownDocuments.get(document.id);
            if (known === undefined || document.siteId !== known.siteId || document.projectId !== known.projectId) {
              rejectRead("denied", "The export contains document metadata outside the caller's current records.", "scope_mismatch");
            }
          }
        }
        const generatedAt = timestamp(source.generated_at);
        const reportedProjectCount = count(source.project_count);
        const reportedDocumentCount = count(source.document_count);
        const scopeLabel = text(source.scope);
        await after(group, identity);
        remember(exportedDocuments);
        return {
          ...detailBase(identity, group), scopeLabel, generatedAt,
          reportedProjectCount, reportedDocumentCount, projects, documents: exportedDocuments,
        };
      });
    }

    return success({ readIdentity, readSnapshot, readDetail, readDocument, readExport, readMyEngagements, expressInterest, invalidate });
  } catch (error) {
    if (error instanceof ReadFault) return failure(error.error);
    throw error;
  }
}

export function createLiveReadClient(
  configuration: LiveReadConfiguration,
  options: LiveReadClientOptions = {},
): ReadResult<LiveReadClient> {
  return createWorkspaceClient({ ...configuration, canAttemptInterest: false }, options);
}
