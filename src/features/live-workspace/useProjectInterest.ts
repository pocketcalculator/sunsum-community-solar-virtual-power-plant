"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  currentProjectInterest,
  type InterestResult, type LiveSnapshot, type ReadEngagements, type ReadError,
  type ReadScope, type WorkspaceClient,
} from "@/features/live-read";

interface InterestState {
  actorKey: string | null;
  ownerKey: string | null;
  client: WorkspaceClient | null;
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
    actorKey, ownerKey: actorKey, client, pending: null, results: {}, errors: {},
  });
  if (state.client !== client || (actorKey !== null && state.ownerKey !== actorKey)) {
    setState({ actorKey, ownerKey: actorKey, client, pending: null, results: {}, errors: {} });
  } else if (state.actorKey !== actorKey) {
    // Temporary retirement hides the actor's data, not whether its dispatched command is unresolved.
    setState({
      ...state, actorKey, pending: null, errors: {},
      results: Object.fromEntries(Object.entries(state.results).filter(([, result]) => result.kind === "unknown")),
    });
  } else if (actorKey !== null && snapshot?.role === "investor" && snapshot.engagements.ok) {
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
    const owned = (current: InterestState) => current.actorKey === actorKey && current.client === client;
    if (!client || !snapshot || snapshot.role !== "investor") {
      const error: ReadError = {
        kind: "out-of-reach", code: "current_investor_required", status: null,
        connectionId: "SUNSUM-CONNECTION:WS2-INVESTOR",
        message: "A current admitted investor read is required before checking or registering interest.",
      };
      setState((current) => owned(current)
        ? { ...current, errors: { ...current.errors, [projectId]: error } } : current);
      return;
    }
    busy.current = true;
    const currentVersion = ++version.current;
    const controller = new AbortController();
    request.current = controller;
    const scope = snapshot.scope;
    const active = () => currentVersion === version.current;
    setState((current) => owned(current)
      ? { ...current, pending: projectId, errors: Object.fromEntries(
          Object.entries(current.errors).filter(([id]) => id !== projectId)) } : current);
    try {
      if (register) {
        const result = await client.expressInterest(projectId, {
          scope, signal: controller.signal, acknowledgeUnknownOutcome,
        });
        if (!active()) return;
        setState((current) => owned(current)
          ? { ...current, results: { ...current.results, [projectId]: result } } : current);
        if (result.kind === "not-sent" || result.kind === "refused" || result.kind === "unknown") {
          onFailure(result.error, scope);
          return;
        }
      }
      const result = await client.readMyEngagements({ scope, signal: controller.signal });
      if (!active() || controller.signal.aborted) return;
      if (!result.ok) {
        setState((current) => owned(current)
          ? { ...current, errors: { ...current.errors, [projectId]: result.error } } : current);
        onFailure(result.error, scope);
        return;
      }
      onEngagements(result.data);
      const existing = currentProjectInterest(result.data.engagements, projectId);
      setState((current) => {
        if (!owned(current)) return current;
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
        setState((current) => owned(current) ? { ...current, pending: null } : current);
      }
    }
  }, [client, snapshot, actorKey, onEngagements, onFailure]);

  const visible = actorKey !== null && state.actorKey === actorKey && state.client === client;
  const results: Readonly<Record<string, InterestResult>> = visible ? state.results : {};
  const errors: Readonly<Record<string, ReadError>> = visible ? state.errors : {};
  return {
    pending: visible ? state.pending : null,
    results,
    errors,
    register: (projectId: string, acknowledgeUnknownOutcome = false) =>
      perform(projectId, true, acknowledgeUnknownOutcome),
    reconcile: (projectId: string) => perform(projectId, false, false),
  };
}
