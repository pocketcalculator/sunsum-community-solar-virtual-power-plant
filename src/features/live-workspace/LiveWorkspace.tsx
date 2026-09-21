"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { workspaceSourceMode, type LiveReadConfiguration } from "@/domain/live-configuration";
import type { WorkspaceView } from "@/domain/workspace-routes";
import { workspaceQueryString, type WorkspaceQuery } from "@/domain/workspace-filters";
import type { WorkspaceRoleControlRenderer } from "@/components/workspace/sessionControl";
import { eligibleDealRoomProjects, type DocumentReference, type LiveSnapshot, type ReadError } from "@/features/live-read";
import { CollectionView } from "./CollectionView";
import { CollectionHistory } from "./collectionHistory";
import { ConnectionSetup } from "./ConnectionSetup";
import { ConnectionsView } from "./ConnectionsView";
import { ActivityView, DetailView, DocumentsView } from "./DetailView";
import { COMMON_NAVIGATION, contextHref, isCollectionView, permittedView, ROLE_NAVIGATION, workspaceContext, type WorkspaceContext } from "./navigation";
import { projectRow, recordName, type CollectionState } from "./presentation";
import { ReadFacts, ReadFailure, SectionHeading, WriteBoundary } from "./ReadStatus";
import { ProjectInterest } from "./ProjectInterest";
import { ReportsView } from "./ReportsView";
import { CompareView, EngagementsView, LearningView, NextWork, ProfileView, SnapshotSummary } from "./RoleViews";
import { useFileDownloads } from "./useFileDownloads";
import { useWorkspaceReads } from "./useWorkspaceReads";
import { useProjectInterest } from "./useProjectInterest";
import { WorkspaceShell } from "./WorkspaceShell";
import styles from "./Workspace.module.css";

interface LiveWorkspaceProps {
  configuration: LiveReadConfiguration;
  initialHref: string;
  renderRoleControl?: WorkspaceRoleControlRenderer;
}

const TITLES: Partial<Record<WorkspaceView, string>> = {
  overview: "Your sites, in context",
  sites: "Read your sites",
  queue: "Your Action Center",
  pipeline: "Read the project pipeline",
  portfolio: "Explore your permitted portfolio",
  documents: "Documents, with the right context",
  reports: "Read and export deliberately",
  activity: "Understand the stored history",
  engagements: "Your existing engagements",
  profile: "Your stored profile",
  mandate: "Your stored mandate",
  compare: "Compare like with like",
  intake: "Submission needs the existing workflow",
};

export function LiveWorkspace({ configuration, initialHref, renderRoleControl }: LiveWorkspaceProps) {
  const [context, setContext] = useState(() => workspaceContext(initialHref));
  const retireContext = useCallback(() => {
    const next: WorkspaceContext = { view: null, projectId: null, scopeId: null, taskId: null, collectionView: null };
    const state: unknown = window.history.state;
    window.history.replaceState({
      ...(typeof state === "object" && state !== null && !Array.isArray(state) ? state : {}),
      sunsumCollectionView: null, sunsumCollectionState: null,
    }, "", contextHref(next));
    setContext(next);
  }, []);
  const reads = useWorkspaceReads(configuration, retireContext);
  const interest = useProjectInterest({
    client: reads.client, snapshot: reads.loading ? null : reads.snapshot, actorKey: reads.actorKey,
    onEngagements: reads.acceptEngagements, onFailure: reads.handleScopedFailure,
  });
  const memory = useMemo(() => new CollectionHistory(), [reads.actorKey]);
  const collection = useSyncExternalStore(memory.subscribe, memory.getSnapshot, memory.getSnapshot);
  const [historyNotice, setHistoryNotice] = useState(false);
  const unavailableError = reads.error ?? reads.admissionError;
  const changeContext = useCallback((next: WorkspaceContext, replace = false, query: WorkspaceQuery = reads.query) => {
    const key = memory.remember(query, replace ? context.collectionKey : undefined);
    const destination = { ...next, collectionKey: key };
    const state: unknown = window.history.state;
    const nextState = {
      ...(typeof state === "object" && state !== null && !Array.isArray(state) ? state : {}),
      sunsumCollectionView: destination.collectionView, sunsumCollectionState: key,
    };
    if (replace) window.history.replaceState(nextState, "", contextHref(destination));
    else window.history.pushState(nextState, "", contextHref(destination));
    setContext(destination);
    setHistoryNotice(false);
  }, [memory, reads.query, context.collectionKey]);
  const changeCollection = (next: CollectionState) => {
    memory.setCollection(next);
    changeContext(context, true);
  };
  useEffect(() => {
    const back = () => {
      const next = workspaceContext(window.location.href, window.history.state);
      const saved = memory.restore(next.collectionKey);
      setHistoryNotice(next.collectionKey !== undefined && saved === null);
      setContext(next);
      if (saved && workspaceQueryString(saved.query) !== workspaceQueryString(reads.query)) void reads.refresh(saved.query);
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [memory, reads.query, reads.refresh]);
  const sourceMode = workspaceSourceMode(configuration);
  const roleControl = sourceMode === "server-demo" ? renderRoleControl?.({
    role: reads.snapshot?.role ?? null,
    disabled: reads.loading || reads.sessionSwitching || interest.pending !== null,
    onSwitchStart: reads.startSessionSwitch,
    onSwitchSettled: reads.settleSessionSwitch,
  }) : undefined;

  if (reads.snapshot && reads.client) return <ScopedWorkspace
    key={reads.actorKey}
    snapshot={reads.snapshot} reads={reads} configuration={configuration}
    context={context} onContext={changeContext} collection={collection} onCollection={changeCollection}
    roleControl={roleControl} interest={interest} historyNotice={historyNotice} />;

  const view = permittedView(null, context.view);
  return <WorkspaceShell role={null} view={view}
    roleControl={roleControl} sourceMode={sourceMode}
    navigation={[{ view: "overview", label: "Workspace" }, ...COMMON_NAVIGATION]}
    onNavigate={(next) => changeContext({ ...context, view: next, projectId: null })}
    onRefresh={() => void reads.refresh()} refreshing={reads.loading || reads.sessionSwitching}
    canRefresh={configuration.canAttemptReads && !reads.sessionSwitching}>
    {view === "help" ? <LearningView /> : view === "connections" ? <ConnectionsView provenance={null} /> : <>
      <SectionHeading eyebrow="Existing-service workspace" title="Your workspace, honestly connected">
        {sourceMode === "server-demo" ? "Explicit fictional server demo. Choose a seeded demo role; failures never become replacement samples." :
          "No fictional records replace unavailable service reads."}
      </SectionHeading>
      {!configuration.canAttemptReads ? <ConnectionSetup configuration={configuration} /> :
        unavailableError ? <ReadFailure error={unavailableError} sourceMode={sourceMode} /> :
          <section className={styles.panel} role="status"><h2>Reading your permitted workspace</h2>
            <p>The service is confirming your session and returning only the records it permits.</p></section>}
    </>}
  </WorkspaceShell>;
}

function ScopedWorkspace({ snapshot, reads, configuration, context, onContext, collection, onCollection,
  roleControl, interest, historyNotice }: {
  snapshot: LiveSnapshot;
  reads: ReturnType<typeof useWorkspaceReads>;
  configuration: LiveReadConfiguration;
  context: WorkspaceContext;
  onContext: (context: WorkspaceContext, replace?: boolean, query?: WorkspaceQuery) => void;
  collection: CollectionState;
  onCollection: (state: CollectionState) => void;
  roleControl: ReactNode;
  interest: ReturnType<typeof useProjectInterest>;
  historyNotice: boolean;
}) {
  const [comparison, setComparison] = useState<readonly [string, string]>(["", ""]);
  const [downloadState, setDownloadState] = useState<{ key: string; pending: boolean; error: ReadError | null }>({ key: "", pending: false, error: null });
  const returnFocus = useRef<HTMLElement | null>(null);
  const collectionFocus = useRef<HTMLElement | null>(null);
  const collectionRoot = useRef<HTMLDivElement | null>(null);
  const historyDestination = useRef<WorkspaceContext | null>(null);
  const focusFrame = useRef<number | null>(null);
  const downloadController = useRef<AbortController | null>(null);
  const [navigation, setNavigation] = useState(() => ({ generation: 0, controller: new AbortController() }));
  const view = permittedView(snapshot.role, context.view);
  const isCollection = isCollectionView(view);
  const collectionView = isCollection ? view : permittedView(snapshot.role, context.collectionView);
  const findRecord = (id: string | null) => id === null ? undefined :
    snapshot.records.find((record) => record.id === id || record.siteId === id || record.projectId === id);
  const target = findRecord(context.projectId ?? context.scopeId);
  const targetId = target?.id ?? null;
  const detailOpen = context.projectId !== null && isCollection;
  const eligibleRooms = snapshot.role === "investor" && snapshot.engagements.ok
    ? eligibleDealRoomProjects(snapshot.engagements.data) : new Set<string>();
  const [requestedRoom, setRequestedRoom] = useState<string | null>(() =>
    target?.projectId && eligibleRooms.has(target.projectId) ? target.projectId : null);
  const roomAdmitted = snapshot.role !== "investor" ||
    (target?.projectId !== null && target?.projectId !== undefined &&
      eligibleRooms.has(target.projectId) && requestedRoom === target.projectId);
  const needsDetail = !reads.loading && Boolean(target && roomAdmitted &&
    (detailOpen || view === "documents" || view === "activity"));
  const targetKey = target ? JSON.stringify(target.detail) : null;
  const scopedDetail = needsDetail && reads.detailKey === targetKey ? reads.detail : null;
  const scopedDetailError = needsDetail && reads.detailKey === targetKey ? reads.detailError : null;
  const { openDetail, closeDetail } = reads;
  const contextKey = JSON.stringify([snapshot.scope.userId, snapshot.scope.role, snapshot.scope.generation,
    view, context.projectId, targetKey, navigation.generation]);
  const activeDownload = downloadState.key === contextKey ? downloadState : { pending: false, error: null };
  const save = useFileDownloads(contextKey);
  const cancelNavigationReads = useCallback(() => {
    historyDestination.current = null;
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = null;
    closeDetail();
    downloadController.current?.abort();
    downloadController.current = null;
    navigation.controller.abort();
    setDownloadState({ key: "", pending: false, error: null });
    setNavigation((current) => ({ generation: current.generation + 1, controller: new AbortController() }));
  }, [closeDetail, navigation.controller]);

  useEffect(() => {
    if (needsDetail && target) void openDetail(target.detail);
    else closeDetail();
    return closeDetail;
  }, [needsDetail, target, view, context.projectId, navigation.generation, openDetail, closeDetail]);
  useEffect(() => () => { downloadController.current?.abort(); }, [contextKey]);
  useEffect(() => () => { navigation.controller.abort(); }, [navigation.controller]);
  useEffect(() => () => {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
  }, []);
  useEffect(() => {
    const back = () => {
      cancelNavigationReads();
      const destination = workspaceContext(window.location.href, window.history.state);
      historyDestination.current = destination;
      setRequestedRoom(destination.projectId ?? destination.scopeId);
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [cancelNavigationReads]);
  // Native history listeners may commit context and cancellation separately.
  useEffect(() => {
    const destination = historyDestination.current;
    if (!destination || contextHref(destination) !== contextHref(context) ||
      destination.collectionKey !== context.collectionKey || reads.loading) return;
    historyDestination.current = null;
    if (!isCollection || detailOpen) return;
    const root = collectionRoot.current;
    const previous = returnFocus.current;
    const previousId = previous?.closest<HTMLElement>("[data-project-id]")?.dataset.projectId;
    const retained = previous && root?.contains(previous) && !previous.closest("[hidden]") &&
      (previousId === undefined || previousId === targetId) ? previous : null;
    const selected = Array.from(root?.querySelectorAll<HTMLButtonElement>("[data-project-open]") ?? [])
      .find((button) => button.dataset.projectOpen === targetId);
    (retained ?? selected ?? document.getElementById("workspace-content"))?.focus();
  }, [context, detailOpen, isCollection, targetId, navigation.generation, reads.loading]);

  const scheduleFocus = (focus: () => void) => {
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = null;
      focus();
    });
  };
  const navigate = (next: WorkspaceView) => {
    if (next === view && context.projectId === null) return;
    if (isCollection) {
      returnFocus.current = collectionFocus.current;
    }
    cancelNavigationReads();
    if (target?.projectId && eligibleRooms.has(target.projectId) && (next === "documents" || next === "activity")) {
      setRequestedRoom(target.projectId);
    }
    onContext({ ...context, view: next, projectId: null, scopeId: target?.id ?? null, collectionView });
    scheduleFocus(() => document.getElementById("workspace-content")?.focus());
  };
  const openRecord = (id: string) => {
    const record = findRecord(id);
    if (!record) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelNavigationReads();
    setRequestedRoom(record.projectId && eligibleRooms.has(record.projectId) ? record.projectId : null);
    const destination = isCollection ? view : snapshot.role === "operator" ? "pipeline" : snapshot.role === "investor" ? "portfolio" : "sites";
    onContext({ ...context, view: destination, projectId: record.id, scopeId: record.id, collectionView: destination });
    scheduleFocus(() => document.getElementById("live-record-detail")?.focus());
  };
  const backToCollection = () => {
    cancelNavigationReads();
    onContext({ ...context, view: collectionView, projectId: null, scopeId: target?.id ?? null, collectionView });
    scheduleFocus(() => {
      const previous = returnFocus.current;
      const previousId = previous?.closest<HTMLElement>("[data-project-id]")?.dataset.projectId;
      const retained = previous && collectionRoot.current?.contains(previous) && !previous.closest("[hidden]") &&
        (previousId === undefined || previousId === targetId) ? previous : null;
      const selected = Array.from(collectionRoot.current?.querySelectorAll<HTMLButtonElement>("[data-project-open]") ?? [])
        .find((button) => button.dataset.projectOpen === targetId);
      (retained ?? selected ?? document.getElementById("workspace-content"))?.focus();
    });
  };
  const download = async (reference: DocumentReference) => {
    if (!reads.client || !configuration.canAttemptDocumentDownloads) return;
    downloadController.current?.abort();
    const request = new AbortController();
    downloadController.current = request;
    setDownloadState({ key: contextKey, pending: true, error: null });
    const result = await reads.client.readDocument(reference, { scope: snapshot.scope, signal: request.signal });
    if (request.signal.aborted || request !== downloadController.current) return;
    setDownloadState({ key: contextKey, pending: false, error: result.ok ? null : result.error });
    if (result.ok) save(result.data);
    else reads.handleScopedFailure(result.error, snapshot.scope);
  };
  const applyQuery = (query: WorkspaceQuery) => {
    if (interest.pending !== null) return;
    cancelNavigationReads();
    setRequestedRoom(null);
    onCollection({ ...collection, page: 1 });
    onContext({ ...context, projectId: null, scopeId: null }, true, query);
    void reads.refresh(query);
  };
  const interestProjectId = target?.projectId;
  const interestControl = !reads.loading && snapshot.role === "investor" && interestProjectId
    ? <ProjectInterest key={interestProjectId} projectId={interestProjectId} snapshot={snapshot}
        result={interest.results[interestProjectId]} error={interest.errors[interestProjectId]}
        pending={interest.pending !== null} allowed={configuration.canAttemptInterest === true}
        onRegister={(acknowledged) => {
          setRequestedRoom(null);
          void interest.register(interestProjectId, acknowledged);
        }}
        onReconcile={() => void interest.reconcile(interestProjectId)} />
    : null;
  const row = target ? projectRow(target) : null;

  const recordContent = reads.loading ? <div className={styles.panel} role="status">Updating the permitted collection...</div> :
    !target ? <div className={styles.panel}>
    <h2>Choose a permitted record first</h2>
    <p>No selected record was found in this loaded scope. No broader endpoint is used to fill it.</p>
    <button type="button" className={styles.button} onClick={() => navigate(snapshot.role === "operator" ? "pipeline" : snapshot.role === "investor" ? "portfolio" : "sites")}>Return to permitted collection</button>
  </div> : snapshot.role === "investor" && !roomAdmitted ? <section className={styles.panel} aria-label="Tier-zero project context">
    <h2>Portfolio context</h2>
    <ReadFacts items={[
      { label: "Project", value: recordName(target) },
      { label: "Location", value: target.locality ?? "Not supplied" },
      { label: "Stage", value: row?.stage ?? "Not supplied" },
      { label: "Capacity", value: row?.capacity ?? "Not supplied" },
      { label: "Screening", value: row?.screening ?? "Not supplied" },
      { label: "Project type", value: target.preliminaryProjectType ?? "Not supplied" },
    ]} />
    <p>No exact address, owner identity or private evidence is added to this tier-zero view.</p>
    {target.projectId && eligibleRooms.has(target.projectId) ? <button type="button" className={styles.button}
      onClick={() => {
        setRequestedRoom(target.projectId);
        scheduleFocus(() => document.getElementById("live-record-detail")?.focus());
      }}>Open permitted deal room</button> :
      <p>The deal room is locked until a current eligible engagement is confirmed. No interest is expressed automatically.</p>}
  </section> : scopedDetailError ? <ReadFailure error={scopedDetailError} /> : !scopedDetail ?
    <div className={styles.panel} role="status">Reading the selected record within your current access...</div> :
    view === "documents" ? <DocumentsView documents={scopedDetail.documents}
      allowDownloads={configuration.canAttemptDocumentDownloads} downloading={activeDownload.pending}
      onDownload={(reference) => void download(reference)} /> :
      view === "activity" ? <ActivityView detail={scopedDetail} /> :
        <DetailView detail={scopedDetail} allowDownloads={configuration.canAttemptDocumentDownloads}
          downloading={activeDownload.pending} onDownload={(reference) => void download(reference)} />;

  return <WorkspaceShell role={snapshot.role} view={view}
    roleControl={roleControl} sourceMode={workspaceSourceMode(configuration)}
    navigation={[...ROLE_NAVIGATION[snapshot.role], ...COMMON_NAVIGATION]}
    onNavigate={navigate} onRefresh={() => void reads.refresh()}
    refreshing={reads.loading} canRefresh={configuration.canAttemptReads && interest.pending === null}>
    <div className={styles.stack}>
      {view !== "connections" && view !== "help" && <SectionHeading
        eyebrow={`${snapshot.role} / ${workspaceSourceMode(configuration) === "server-demo" ? "fictional server demo" : "connected workspace"}`}
        title={!reads.loading && detailOpen && target ? recordName(target) : TITLES[view] ?? "Your permitted workspace"}>
        Stored information and current access. Investors may explicitly register nonbinding interest; other workflow changes remain unavailable.
      </SectionHeading>}
      {historyNotice && <p className={styles.warning} role="status">The old collection preferences are no longer in memory. The displayed current filters apply; no broader read was substituted.</p>}
      {!reads.loading && snapshot.completeness === "partial" && <p className={styles.warning} role="status">This is a partial snapshot. A secondary read is out of reach right now; missing sections are not empty success.</p>}
      {activeDownload.pending && <p role="status">Reading the permitted original...</p>}
      {activeDownload.error && <ReadFailure error={activeDownload.error} label="Original download status" />}
      {!isCollection && view !== "help" && view !== "connections" && <button type="button"
        className={styles.textButton} onClick={backToCollection}>Back to collection</button>}

      {detailOpen && <section id="live-record-detail" tabIndex={-1} className={styles.stack} aria-label="Stored record detail">
        <button type="button" className={styles.button} onClick={backToCollection}>Back to collection</button>
        {recordContent}
        {interestControl}
      </section>}

      <div ref={collectionRoot} hidden={!isCollection || detailOpen} className={styles.stack}
        onFocusCapture={(event) => { if (event.target instanceof HTMLElement) collectionFocus.current = event.target; }}>
        {!reads.loading && (view === "queue" || view === "overview") && <NextWork snapshot={snapshot} onOpen={openRecord} />}
        {!reads.loading && (view === "overview" || view === "queue" || view === "portfolio" || view === "pipeline") && <SnapshotSummary snapshot={snapshot} />}
        <div className={styles.actions}>
          <button type="button" className={styles.textButton} onClick={() => navigate("compare")}>Compare stored fields</button>
          <button type="button" className={styles.textButton} onClick={() => navigate("reports")}>Open reports</button>
        </div>
        <CollectionView records={reads.loading ? [] : snapshot.records} state={collection} onChange={onCollection}
          role={snapshot.role} query={reads.query} onQuery={applyQuery} projectTypes={reads.projectTypes}
          pending={reads.loading} actionPending={interest.pending !== null}
          selectedId={reads.loading ? null : target?.id ?? null} onSelect={(id) => {
            cancelNavigationReads();
            onContext({ ...context, projectId: null, scopeId: id, collectionView });
          }}
          onOpen={openRecord} />
        {isCollection && !detailOpen && interestControl}
      </div>

      {(view === "documents" || view === "activity") && <div className={styles.stack}>
        <p className={styles.muted}>{target ? `Context: ${recordName(target)}` : "Select a permitted record from the collection to read its information."}</p>
        {recordContent}
        {interestControl}
      </div>}
      {!reads.loading && (view === "profile" || view === "mandate") && <ProfileView snapshot={snapshot} />}
      {!reads.loading && view === "engagements" && <EngagementsView snapshot={snapshot} onOpen={openRecord} />}
      {!reads.loading && view === "reports" && reads.client && <ReportsView key={contextKey} client={reads.client} snapshot={snapshot}
        navigationSignal={navigation.controller.signal}
        allowed={configuration.canAttemptExports} onFailure={(error) => reads.handleScopedFailure(error, snapshot.scope)} />}
      {!reads.loading && view === "compare" && <CompareView records={snapshot.records} ids={comparison} onChange={setComparison} />}
      {view === "help" && <LearningView />}
      {view === "connections" && <ConnectionsView provenance={snapshot.provenance} />}
      {view === "intake" && <section className={styles.panel}><h2>No new site is submitted here</h2>
        <WriteBoundary action="Creating or submitting a site" />
        <button type="button" className={styles.button} onClick={() => navigate("sites")}>Read existing sites</button>
      </section>}
    </div>
  </WorkspaceShell>;
}
