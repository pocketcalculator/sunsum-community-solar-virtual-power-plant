"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveReadConfiguration } from "@/domain/live-configuration";
import type { WorkspaceView } from "@/domain/workspace-routes";
import type { DocumentReference, LiveSnapshot, ReadError } from "@/features/live-read";
import { CollectionView } from "./CollectionView";
import { ConnectionSetup } from "./ConnectionSetup";
import { ConnectionsView } from "./ConnectionsView";
import { ActivityView, DetailView, DocumentsView } from "./DetailView";
import { COMMON_NAVIGATION, contextHref, isCollectionView, permittedView, ROLE_NAVIGATION, workspaceContext, type WorkspaceContext } from "./navigation";
import { INITIAL_COLLECTION, recordName } from "./presentation";
import { ReadFailure, SectionHeading, WriteBoundary } from "./ReadStatus";
import { ReportsView } from "./ReportsView";
import { CompareView, EngagementsView, LearningView, NextWork, ProfileView, SnapshotSummary } from "./RoleViews";
import { useFileDownloads } from "./useFileDownloads";
import { useWorkspaceReads } from "./useWorkspaceReads";
import { WorkspaceShell } from "./WorkspaceShell";
import styles from "./Workspace.module.css";

interface LiveWorkspaceProps {
  configuration: LiveReadConfiguration;
  initialHref: string;
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

export function LiveWorkspace({ configuration, initialHref }: LiveWorkspaceProps) {
  const reads = useWorkspaceReads(configuration);
  const unavailableError = reads.error ?? reads.admissionError;
  const [context, setContext] = useState(() => workspaceContext(initialHref));
  const changeContext = useCallback((next: WorkspaceContext) => {
    setContext(next);
    const state: unknown = window.history.state;
    window.history.pushState({
      ...(typeof state === "object" && state !== null && !Array.isArray(state) ? state : {}),
      sunsumCollectionView: next.collectionView,
    }, "", contextHref(next));
  }, []);
  useEffect(() => {
    const back = () => setContext(workspaceContext(window.location.href, window.history.state));
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);

  if (reads.snapshot && reads.client) return <ScopedWorkspace
    key={`${reads.snapshot.identity.userId}:${reads.snapshot.identity.role}`}
    snapshot={reads.snapshot} reads={reads} configuration={configuration}
    context={context} onContext={changeContext} />;

  const view = permittedView(null, context.view);
  return <WorkspaceShell role={null} view={view}
    navigation={[{ view: "overview", label: "Workspace" }, ...COMMON_NAVIGATION]}
    onNavigate={(next) => changeContext({ ...context, view: next, projectId: null })}
    onRefresh={() => void reads.refresh()} refreshing={reads.loading} canRefresh={configuration.canAttemptReads}>
    {view === "help" ? <LearningView /> : view === "connections" ? <ConnectionsView provenance={null} /> : <>
      <SectionHeading eyebrow="Existing-service workspace" title="Your workspace, honestly connected">
        No fictional records replace unavailable service reads.
      </SectionHeading>
      {!configuration.canAttemptReads ? <ConnectionSetup configuration={configuration} /> :
        unavailableError ? <ReadFailure error={unavailableError} /> :
          <section className={styles.panel} role="status"><h2>Reading your permitted workspace</h2>
            <p>The service is confirming your session and returning only the records it permits.</p></section>}
    </>}
  </WorkspaceShell>;
}

function ScopedWorkspace({ snapshot, reads, configuration, context, onContext }: {
  snapshot: LiveSnapshot;
  reads: ReturnType<typeof useWorkspaceReads>;
  configuration: LiveReadConfiguration;
  context: WorkspaceContext;
  onContext: (context: WorkspaceContext) => void;
}) {
  const [collection, setCollection] = useState(INITIAL_COLLECTION);
  const [comparison, setComparison] = useState<readonly [string, string]>(["", ""]);
  const [downloadState, setDownloadState] = useState<{ key: string; pending: boolean; error: ReadError | null }>({ key: "", pending: false, error: null });
  const returnFocus = useRef<HTMLElement | null>(null);
  const collectionFocus = useRef<HTMLElement | null>(null);
  const downloadController = useRef<AbortController | null>(null);
  const [navigation, setNavigation] = useState(() => ({ generation: 0, controller: new AbortController() }));
  const view = permittedView(snapshot.role, context.view);
  const isCollection = isCollectionView(view);
  const collectionView = isCollection ? view : permittedView(snapshot.role, context.collectionView);
  const findRecord = (id: string | null) => id === null ? undefined :
    snapshot.records.find((record) => record.id === id || record.siteId === id || record.projectId === id);
  const target = findRecord(context.projectId ?? context.scopeId);
  const detailOpen = context.projectId !== null && isCollection;
  const needsDetail = Boolean(target && (detailOpen || view === "documents" || view === "activity"));
  const targetKey = target ? JSON.stringify(target.detail) : null;
  const scopedDetail = needsDetail && reads.detailKey === targetKey ? reads.detail : null;
  const scopedDetailError = needsDetail && reads.detailKey === targetKey ? reads.detailError : null;
  const { openDetail, closeDetail } = reads;
  const contextKey = JSON.stringify([snapshot.scope.userId, snapshot.scope.role, snapshot.scope.generation,
    view, context.projectId, targetKey, navigation.generation]);
  const activeDownload = downloadState.key === contextKey ? downloadState : { pending: false, error: null };
  const save = useFileDownloads(contextKey);
  const cancelNavigationReads = useCallback(() => {
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
  useEffect(() => {
    window.addEventListener("popstate", cancelNavigationReads);
    return () => window.removeEventListener("popstate", cancelNavigationReads);
  }, [cancelNavigationReads]);

  const navigate = (next: WorkspaceView) => {
    if (next === view && context.projectId === null) return;
    if (isCollection) {
      returnFocus.current = collectionFocus.current;
    }
    cancelNavigationReads();
    onContext({ ...context, view: next, projectId: null, scopeId: target?.id ?? null, collectionView });
    requestAnimationFrame(() => document.getElementById("workspace-content")?.focus());
  };
  const openRecord = (id: string) => {
    const record = findRecord(id);
    if (!record) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelNavigationReads();
    const destination = isCollection ? view : snapshot.role === "operator" ? "pipeline" : snapshot.role === "investor" ? "portfolio" : "sites";
    onContext({ ...context, view: destination, projectId: record.id, scopeId: record.id, collectionView: destination });
    requestAnimationFrame(() => document.getElementById("live-record-detail")?.focus());
  };
  const backToCollection = () => {
    cancelNavigationReads();
    onContext({ ...context, view: collectionView, projectId: null, scopeId: target?.id ?? null, collectionView });
    requestAnimationFrame(() => {
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
      else document.getElementById("workspace-content")?.focus();
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
    else reads.handleScopedFailure(result.error);
  };

  const recordContent = !target ? <div className={styles.panel}>
    <h2>Choose a permitted record first</h2>
    <p>No selected record was found in this loaded scope. No broader endpoint is used to fill it.</p>
    <button type="button" className={styles.button} onClick={() => navigate(snapshot.role === "operator" ? "pipeline" : snapshot.role === "investor" ? "portfolio" : "sites")}>Return to permitted collection</button>
  </div> : scopedDetailError ? <ReadFailure error={scopedDetailError} /> : !scopedDetail ?
    <div className={styles.panel} role="status">Reading the selected record within your current access...</div> :
    view === "documents" ? <DocumentsView documents={scopedDetail.documents}
      allowDownloads={configuration.canAttemptDocumentDownloads} downloading={activeDownload.pending}
      onDownload={(reference) => void download(reference)} /> :
      view === "activity" ? <ActivityView detail={scopedDetail} /> :
        <DetailView detail={scopedDetail} allowDownloads={configuration.canAttemptDocumentDownloads}
          downloading={activeDownload.pending} onDownload={(reference) => void download(reference)} />;

  return <WorkspaceShell role={snapshot.role} view={view}
    navigation={[...ROLE_NAVIGATION[snapshot.role], ...COMMON_NAVIGATION]}
    onNavigate={navigate} onRefresh={() => void reads.refresh()}
    refreshing={reads.loading} canRefresh={configuration.canAttemptReads}>
    <div className={styles.stack}>
      {view !== "connections" && view !== "help" && <SectionHeading
        eyebrow={snapshot.role === "site-owner" ? "Site owner / live reads" : `${snapshot.role} / live reads`}
        title={detailOpen && target ? recordName(target) : TITLES[view] ?? "Your permitted workspace"}>
        Stored information, current access and clear next context. No workflow changes are performed.
      </SectionHeading>}
      {snapshot.completeness === "partial" && <p className={styles.warning} role="status">This is a partial snapshot. A secondary read is out of reach right now; missing sections are not empty success.</p>}
      {activeDownload.pending && <p role="status">Reading the permitted original...</p>}
      {activeDownload.error && <ReadFailure error={activeDownload.error} label="Original download status" />}
      {!isCollection && view !== "help" && view !== "connections" && <button type="button"
        className={styles.textButton} onClick={backToCollection}>Back to collection</button>}

      {detailOpen && <section id="live-record-detail" tabIndex={-1} className={styles.stack} aria-label="Stored record detail">
        <button type="button" className={styles.button} onClick={backToCollection}>Back to collection</button>
        {recordContent}
      </section>}

      <div hidden={!isCollection || detailOpen} className={styles.stack}
        onFocusCapture={(event) => { if (event.target instanceof HTMLElement) collectionFocus.current = event.target; }}>
        {(view === "queue" || view === "overview") && <NextWork snapshot={snapshot} onOpen={openRecord} />}
        {(view === "overview" || view === "queue" || view === "portfolio" || view === "pipeline") && <SnapshotSummary snapshot={snapshot} />}
        <div className={styles.actions}>
          <button type="button" className={styles.textButton} onClick={() => navigate("compare")}>Compare stored fields</button>
          <button type="button" className={styles.textButton} onClick={() => navigate("reports")}>Open reports</button>
        </div>
        <CollectionView records={snapshot.records} state={collection} onChange={setCollection}
          selectedId={target?.id ?? null} onSelect={(id) => {
            cancelNavigationReads();
            onContext({ ...context, projectId: null, scopeId: id, collectionView });
          }}
          onOpen={openRecord} />
      </div>

      {(view === "documents" || view === "activity") && <div className={styles.stack}>
        <p className={styles.muted}>{target ? `Context: ${recordName(target)}` : "Select a permitted record from the collection to read its information."}</p>
        {recordContent}
      </div>}
      {(view === "profile" || view === "mandate") && <ProfileView snapshot={snapshot} />}
      {view === "engagements" && <EngagementsView snapshot={snapshot} onOpen={openRecord} />}
      {view === "reports" && reads.client && <ReportsView key={contextKey} client={reads.client} snapshot={snapshot}
        navigationSignal={navigation.controller.signal}
        allowed={configuration.canAttemptExports} onFailure={reads.handleScopedFailure} />}
      {view === "compare" && <CompareView records={snapshot.records} ids={comparison} onChange={setComparison} />}
      {view === "help" && <LearningView />}
      {view === "connections" && <ConnectionsView provenance={snapshot.provenance} />}
      {view === "intake" && <section className={styles.panel}><h2>No new site is submitted here</h2>
        <WriteBoundary action="Creating or submitting a site" />
        <button type="button" className={styles.button} onClick={() => navigate("sites")}>Read existing sites</button>
      </section>}
    </div>
  </WorkspaceShell>;
}
