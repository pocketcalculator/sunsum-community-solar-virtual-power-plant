"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useSyncExternalStore } from "react";
import type { LiveReadConfiguration } from "@/domain/live-configuration";
import {
  createLiveReadClient,
  type DetailReference,
  type LiveDetail,
  type LiveReadClient,
  type LiveSnapshot,
  type ReadError,
  type ReadResult,
} from "@/features/live-read";

interface ReadState {
  sourceClient: LiveReadClient | null;
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
  snapshot: null, error: null, loading: false,
  detail: null, detailError: null, detailLoading: false, detailKey: null,
};

type ReadAction =
  | { type: "clear" }
  | { type: "loading"; client: LiveReadClient }
  | { type: "snapshot"; client: LiveReadClient; result: ReadResult<LiveSnapshot> }
  | { type: "detail-loading"; key: string }
  | { type: "detail"; result: ReadResult<LiveDetail> }
  | { type: "close-detail" }
  | { type: "access-lost"; client: LiveReadClient; error: ReadError };

function reducer(state: ReadState, action: ReadAction): ReadState {
  switch (action.type) {
    case "clear": return initialState;
    case "loading": return { ...initialState, sourceClient: action.client, loading: true };
    case "snapshot": return action.result.ok
      ? { ...initialState, sourceClient: action.client, snapshot: action.result.data }
      : { ...initialState, sourceClient: action.client, error: action.result.error };
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

export function useWorkspaceReads(configuration: LiveReadConfiguration) {
  const ready = useSyncExternalStore(subscribeReadiness, browserReady, serverReady);
  const clientResult = useMemo(() => ready && configuration.canAttemptReads
    ? createLiveReadClient(configuration) : null, [configuration, ready]);
  const client = clientResult?.ok ? clientResult.data : null;
  const [state, dispatch] = useReducer(reducer, initialState);
  const snapshotRef = useRef<LiveSnapshot | null>(null);
  const version = useRef(0);
  const detailVersion = useRef(0);
  const snapshotAbort = useRef<AbortController | null>(null);
  const detailAbort = useRef<AbortController | null>(null);
  const lastAttempt = useRef(0);

  const clear = useCallback(() => {
    version.current += 1;
    detailVersion.current += 1;
    snapshotAbort.current?.abort();
    detailAbort.current?.abort();
    snapshotRef.current = null;
    client?.invalidate();
    dispatch({ type: "clear" });
  }, [client]);

  const refresh = useCallback(async () => {
    if (!client) return;
    clear();
    const current = version.current;
    const controller = new AbortController();
    snapshotAbort.current = controller;
    lastAttempt.current = Date.now();
    dispatch({ type: "loading", client });
    const result = await client.readSnapshot({ signal: controller.signal });
    if (controller.signal.aborted || current !== version.current) return;
    snapshotRef.current = result.ok ? result.data : null;
    dispatch({ type: "snapshot", client, result });
  }, [client, clear]);

  const handleScopedFailure = useCallback((error: ReadError) => {
    if (client && accessLost(error)) {
      clear();
      dispatch({ type: "access-lost", client, error });
    }
  }, [client, clear]);

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
    void refresh();
    const visibility = () => {
      if (document.visibilityState === "hidden") clear();
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
  };
}
