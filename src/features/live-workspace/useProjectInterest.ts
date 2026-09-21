"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  currentProjectInterest,
  type InterestResult, type LiveSnapshot, type ReadEngagements, type ReadError,
  type ReadScope, type WorkspaceClient,
} from "@/features/live-read";

interface InterestState {
  actorKey: string | null;
  pending: string | null;
  results: Readonly<Record<string, InterestResult>>;
  errors: Readonly<Record<string, ReadError>>;
}

export function useProjectInterest({
  client, snapshot, actorKey, onEngagements, onFailure,
}: {
  client: WorkspaceClient | null;
  snapshot: LiveSnapshot | null;
  actorKey: string | null;
  onEngagements: (value: ReadEngagements) => void;
  onFailure: (error: ReadError, scope?: ReadScope) => void;
}) {
  const [state, setState] = useState<InterestState>({
    actorKey, pending: null, results: {}, errors: {},
  });
  if (state.actorKey !== actorKey) setState({ actorKey, pending: null, results: {}, errors: {} });
  if (state.actorKey === actorKey && snapshot?.role === "investor" && snapshot.engagements.ok) {
    let resolved: Record<string, InterestResult> | null = null;
    for (const [projectId, result] of Object.entries(state.results)) {
      if (result.kind !== "unknown" || !result.receipt) continue;
      const existing = currentProjectInterest(snapshot.engagements.data, projectId);
      if (existing) {
        resolved ??= { ...state.results };
        resolved[projectId] = { kind: "existing", receipt: result.receipt, engagement: existing };
      }
    }
    if (resolved) setState({ ...state, results: resolved });
  }
  const request = useRef<AbortController | null>(null);
  const version = useRef(0);
  const busy = useRef(false);

  useEffect(() => () => {
    version.current += 1;
    request.current?.abort();
    request.current = null;
    busy.current = false;
  }, [actorKey, client]);

  const perform = useCallback(async (projectId: string, register: boolean, acknowledgeUnknownOutcome: boolean) => {
    if (busy.current) return;
    if (!client || !snapshot || snapshot.role !== "investor") {
      const error: ReadError = {
        kind: "out-of-reach", code: "current_investor_required", status: null,
        connectionId: "SUNSUM-CONNECTION:WS2-INVESTOR",
        message: "A current admitted investor read is required before checking or registering interest.",
      };
      setState((current) => current.actorKey === actorKey
        ? { ...current, errors: { ...current.errors, [projectId]: error } } : current);
      return;
    }
    busy.current = true;
    const currentVersion = ++version.current;
    const controller = new AbortController();
    request.current = controller;
    const scope = snapshot.scope;
    const active = () => currentVersion === version.current;
    setState((current) => current.actorKey === actorKey
      ? { ...current, pending: projectId, errors: Object.fromEntries(
          Object.entries(current.errors).filter(([id]) => id !== projectId)) } : current);
    try {
      if (register) {
        const result = await client.expressInterest(projectId, {
          scope, signal: controller.signal, acknowledgeUnknownOutcome,
        });
        if (!active()) return;
        setState((current) => current.actorKey === actorKey
          ? { ...current, results: { ...current.results, [projectId]: result } } : current);
        if (result.kind === "not-sent" || result.kind === "refused" || result.kind === "unknown") {
          onFailure(result.error, scope);
          return;
        }
      }
      const result = await client.readMyEngagements({ scope, signal: controller.signal });
      if (!active() || controller.signal.aborted) return;
      if (!result.ok) {
        setState((current) => current.actorKey === actorKey
          ? { ...current, errors: { ...current.errors, [projectId]: result.error } } : current);
        onFailure(result.error, scope);
        return;
      }
      onEngagements(result.data);
      const existing = currentProjectInterest(result.data.engagements, projectId);
      setState((current) => {
        if (current.actorKey !== actorKey) return current;
        const previous = current.results[projectId];
        if (existing && previous?.kind === "unknown" && previous.receipt) return {
          ...current, results: { ...current.results, [projectId]: {
            kind: "existing", receipt: previous.receipt, engagement: existing,
          } },
        };
        return current;
      });
    } finally {
      if (active()) {
        busy.current = false;
        request.current = null;
        setState((current) => current.actorKey === actorKey ? { ...current, pending: null } : current);
      }
    }
  }, [client, snapshot, actorKey, onEngagements, onFailure]);

  const results: Readonly<Record<string, InterestResult>> = state.actorKey === actorKey ? state.results : {};
  const errors: Readonly<Record<string, ReadError>> = state.actorKey === actorKey ? state.errors : {};
  return {
    pending: state.actorKey === actorKey ? state.pending : null,
    results,
    errors,
    register: (projectId: string, acknowledgeUnknownOutcome = false) =>
      perform(projectId, true, acknowledgeUnknownOutcome),
    reconcile: (projectId: string) => perform(projectId, false, false),
  };
}
