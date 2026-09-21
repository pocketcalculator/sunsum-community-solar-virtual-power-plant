"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import type { LiveReadConfiguration } from "@/domain/live-configuration";
import { copyWorkspaceQuery, defaultWorkspaceQuery } from "@/domain/workspace-filters";
import {
  createWorkspaceClient,
  workspaceActorKey,
  type DetailReference,
  type LiveDetail,
  type LiveSnapshot,
  type ReadEngagements,
  type ReadError,
  type ReadResult,
  type ReadScope,
  type SnapshotQuery,
  type WorkspaceClient,
} from "@/features/live-read";

interface ReadState {
  sourceClient: WorkspaceClient | null;
  actorKey: string | null;
  query: SnapshotQuery;
  queryLoading: boolean;
  projectTypes: readonly string[];
  snapshot: LiveSnapshot | null;
  error: ReadError | null;
  loading: boolean;
  detail: LiveDetail | null;
  detailError: ReadError | null;
  detailLoading: boolean;
  detailKey: string | null;
}

const initialState: ReadState = {
  sourceClient: null,
  actorKey: null, query: {}, queryLoading: false, projectTypes: [],
  snapshot: null, error: null, loading: false,
  detail: null, detailError: null, detailLoading: false, detailKey: null,
};

type ReadAction =
  | { type: "clear"; keepActor: boolean }
  | { type: "loading"; client: WorkspaceClient; preserve: boolean; query: SnapshotQuery }
  | { type: "identified"; actorKey: string; query: SnapshotQuery }
  | { type: "snapshot"; client: WorkspaceClient; result: ReadResult<LiveSnapshot> }
  | { type: "engagements"; result: ReadEngagements }
  | { type: "detail-loading"; key: string }
  | { type: "detail"; result: ReadResult<LiveDetail> }
  | { type: "close-detail" }
  | { type: "access-lost"; client: WorkspaceClient; error: ReadError };

function reducer(state: ReadState, action: ReadAction): ReadState {
  switch (action.type) {
    case "clear": return { ...initialState,
      sourceClient: action.keepActor ? state.sourceClient : null,
      actorKey: action.keepActor ? state.actorKey : null, query: action.keepActor ? state.query : {},
      projectTypes: action.keepActor ? state.projectTypes : [] };
    case "loading": return { ...initialState, sourceClient: action.client, loading: true,
      actorKey: state.actorKey, query: action.query, projectTypes: state.projectTypes,
      snapshot: action.preserve ? state.snapshot : null, queryLoading: action.preserve };
    case "identified": return {
      ...state, actorKey: action.actorKey, query: action.query,
      snapshot: action.actorKey === state.actorKey ? state.snapshot : null,
      queryLoading: action.actorKey === state.actorKey && state.queryLoading,
      projectTypes: action.actorKey === state.actorKey ? state.projectTypes : [],
    };
    case "snapshot": return action.result.ok
      ? { ...initialState, sourceClient: action.client, snapshot: action.result.data,
          actorKey: workspaceActorKey(action.result.data.identity), query: state.query,
          projectTypes: [...new Set([...state.projectTypes, ...action.result.data.records.flatMap((record) =>
            record.preliminaryProjectType === null ? [] : [record.preliminaryProjectType])])].sort() }
      : { ...initialState, sourceClient: action.client, error: action.result.error,
          actorKey: accessLost(action.result.error) ? null : state.actorKey, query: state.query,
          projectTypes: accessLost(action.result.error) ? [] : state.projectTypes };
    case "engagements": {
      const snapshot = state.snapshot;
      if (!snapshot || snapshot.role !== "investor" || state.loading ||
        snapshot.scope.generation !== action.result.scope.generation ||
        workspaceActorKey(snapshot.identity) !== workspaceActorKey(action.result.identity)) return state;
      return { ...state, snapshot: {
        ...snapshot, engagements: { ok: true, data: action.result.engagements },
        completeness: snapshot.profile.ok ? "complete" : "partial",
      } };
    }
    case "detail-loading": return { ...state, detail: null, detailError: null, detailLoading: true, detailKey: action.key };
    case "detail": return action.result.ok
      ? { ...state, detail: action.result.data, detailError: null, detailLoading: false }
      : { ...state, detail: null, detailError: action.result.error, detailLoading: false };
    case "close-detail": return { ...state, detail: null, detailError: null, detailLoading: false, detailKey: null };
    case "access-lost": return { ...initialState, sourceClient: action.client, error: action.error };
  }
}

function accessLost(error: ReadError) {
  return error.kind === "unauthenticated" || error.kind === "stale" || error.kind === "denied";
}

const subscribeReadiness = () => () => {};
const browserReady = () => true;
const serverReady = () => false;

const noRetirement = () => {};

export function useWorkspaceReads(configuration: LiveReadConfiguration, onRetireActor = noRetirement) {
  const ready = useSyncExternalStore(subscribeReadiness, browserReady, serverReady);
  const clientResult = useMemo(() => ready && configuration.canAttemptReads
    ? createWorkspaceClient(configuration) : null, [configuration, ready]);
  const client = clientResult?.ok ? clientResult.data : null;
  const [state, dispatch] = useReducer(reducer, initialState);
  const snapshotRef = useRef<LiveSnapshot | null>(null);
  const version = useRef(0);
  const detailVersion = useRef(0);
  const snapshotAbort = useRef<AbortController | null>(null);
  const detailAbort = useRef<AbortController | null>(null);
  const lastAttempt = useRef(0);
  const actor = useRef<string | null>(null);
  const query = useRef<SnapshotQuery>({});
  const switching = useRef(false);
  const [sessionSwitching, setSessionSwitching] = useState(false);

  const clear = useCallback((keepActor = false) => {
    version.current += 1;
    detailVersion.current += 1;
    snapshotAbort.current?.abort();
    detailAbort.current?.abort();
    snapshotRef.current = null;
    client?.invalidate();
    if (!keepActor) {
      if (actor.current !== null) onRetireActor();
      actor.current = null;
      query.current = {};
    }
    dispatch({ type: "clear", keepActor });
  }, [client, onRetireActor]);

  const refresh = useCallback(async (requestedQuery?: SnapshotQuery) => {
    if (!client || switching.current) return;
    const requested = requestedQuery === undefined ? copyWorkspaceQuery(query.current) : copyWorkspaceQuery(requestedQuery);
    version.current += 1;
    detailVersion.current += 1;
    snapshotAbort.current?.abort();
    detailAbort.current?.abort();
    snapshotRef.current = null;
    client.invalidate();
    const current = version.current;
    const controller = new AbortController();
    snapshotAbort.current = controller;
    lastAttempt.current = Date.now();
    query.current = requested;
    dispatch({ type: "loading", client, preserve: requestedQuery !== undefined, query: requested });
    const identity = await client.readIdentity({ signal: controller.signal });
    if (controller.signal.aborted || current !== version.current) return;
    if (!identity.ok) {
      if (accessLost(identity.error)) {
        if (actor.current !== null) onRetireActor();
        actor.current = null;
      }
      dispatch({ type: "snapshot", client, result: identity });
      return;
    }
    const nextActor = workspaceActorKey(identity.data);
    const sameActor = actor.current === nextActor;
    if (actor.current !== null && !sameActor) onRetireActor();
    const nextQuery = sameActor ? requested : defaultWorkspaceQuery(identity.data.role);
    actor.current = nextActor;
    query.current = nextQuery;
    dispatch({ type: "identified", actorKey: nextActor, query: nextQuery });
    const result = await client.readSnapshot({
      signal: controller.signal, query: nextQuery, scope: identity.data.scope,
    });
    if (controller.signal.aborted || current !== version.current) return;
    snapshotRef.current = result.ok ? result.data : null;
    if (!result.ok && accessLost(result.error)) {
      onRetireActor();
      actor.current = null;
    }
    dispatch({ type: "snapshot", client, result });
  }, [client, onRetireActor]);

  const handleScopedFailure = useCallback((error: ReadError, expectedScope?: ReadScope) => {
    const current = snapshotRef.current?.scope;
    if (expectedScope && (!current || current.userId !== expectedScope.userId ||
      current.role !== expectedScope.role || current.generation !== expectedScope.generation)) return;
    if (client && accessLost(error)) {
      clear();
      dispatch({ type: "access-lost", client, error });
    }
  }, [client, clear]);

  const acceptEngagements = useCallback((result: ReadEngagements) => {
    const snapshot = snapshotRef.current;
    if (!snapshot || snapshot.role !== "investor" ||
      snapshot.scope.generation !== result.scope.generation ||
      workspaceActorKey(snapshot.identity) !== workspaceActorKey(result.identity)) return;
    snapshotRef.current = {
      ...snapshot, engagements: { ok: true, data: result.engagements },
      completeness: snapshot.profile.ok ? "complete" : "partial",
    };
    dispatch({ type: "engagements", result });
  }, []);

  const startSessionSwitch = useCallback(() => {
    switching.current = true;
    setSessionSwitching(true);
    clear();
  }, [clear]);

  const settleSessionSwitch = useCallback(() => {
    switching.current = false;
    setSessionSwitching(false);
    void refresh();
  }, [refresh]);

  const closeDetail = useCallback(() => {
    detailVersion.current += 1;
    detailAbort.current?.abort();
    dispatch({ type: "close-detail" });
  }, []);

  const openDetail = useCallback(async (reference: DetailReference) => {
    const snapshot = snapshotRef.current;
    if (!client || !snapshot) return;
    closeDetail();
    const current = version.current;
    const detailRequest = detailVersion.current;
    const controller = new AbortController();
    detailAbort.current = controller;
    dispatch({ type: "detail-loading", key: JSON.stringify(reference) });
    const result = await client.readDetail(reference, { scope: snapshot.scope, signal: controller.signal });
    if (controller.signal.aborted || current !== version.current || detailRequest !== detailVersion.current) return;
    if (!result.ok && accessLost(result.error)) {
      handleScopedFailure(result.error);
      return;
    }
    dispatch({ type: "detail", result });
  }, [client, closeDetail, handleScopedFailure]);

  useEffect(() => {
    if (!client) return;
    clear();
    void refresh();
    const visibility = () => {
      if (document.visibilityState === "hidden") clear(true);
      else void refresh();
    };
    const focus = () => {
      if (document.visibilityState === "visible" && Date.now() - lastAttempt.current >= 15_000) void refresh();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", focus);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", focus);
      version.current += 1;
      detailVersion.current += 1;
      snapshotAbort.current?.abort();
      detailAbort.current?.abort();
      snapshotRef.current = null;
      client.invalidate();
    };
  }, [client, refresh, clear]);

  return {
    ...(client && state.sourceClient === client ? state : initialState),
    client,
    admissionError: clientResult && !clientResult.ok ? clientResult.error : null,
    refresh,
    openDetail,
    closeDetail,
    handleScopedFailure,
    acceptEngagements,
    startSessionSwitch,
    settleSessionSwitch,
    sessionSwitching,
  };
}
