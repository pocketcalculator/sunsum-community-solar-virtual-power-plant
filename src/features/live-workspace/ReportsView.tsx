"use client";

import { useEffect, useRef, useState } from "react";
import {
  formatReadExport, type LiveExportManifest, type LiveReadClient,
  type LiveSnapshot, type ReadError,
} from "@/features/live-read";
import { ReadFacts, ReadFailure, StoredTime } from "./ReadStatus";
import { useFileDownloads } from "./useFileDownloads";
import styles from "./Workspace.module.css";

export function ReportsView({ client, snapshot, allowed, navigationSignal, onFailure }: {
  client: LiveReadClient;
  snapshot: LiveSnapshot;
  allowed: boolean;
  navigationSignal: AbortSignal;
  onFailure: (error: ReadError) => void;
}) {
  const [manifest, setManifest] = useState<LiveExportManifest | null>(null);
  const [error, setError] = useState<ReadError | null>(null);
  const [pending, setPending] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const save = useFileDownloads(`${snapshot.scope.userId}:${snapshot.scope.role}:${snapshot.scope.generation}`);
  useEffect(() => {
    const cancel = () => controller.current?.abort();
    navigationSignal.addEventListener("abort", cancel);
    return () => {
      cancel();
      navigationSignal.removeEventListener("abort", cancel);
    };
  }, [client, snapshot.scope, navigationSignal]);

  const load = async (format?: "json" | "csv") => {
    if (!allowed || navigationSignal.aborted) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setPending(true);
    setError(null);
    setManifest(null);
    const result = await client.readExport({ scope: snapshot.scope, signal: request.signal });
    if (request.signal.aborted || navigationSignal.aborted || request !== controller.current) return;
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      onFailure(result.error);
      return;
    }
    setManifest(result.data);
    if (format) save(formatReadExport(result.data, format));
  };

  return <section className={styles.panel} aria-label="Permitted export" aria-busy={pending}>
    <h2>One clearly scoped manifest</h2>
    <p>The service export covers its permitted role projection, not just this screen&apos;s filters
      or selected record. It describes document metadata; it is not an original-file bundle.</p>
    {!allowed && <p className={styles.warning}>Export is out of reach right now. The owner has not separately admitted this disclosure.
      Reading the workspace is not export permission.</p>}
    <div className={styles.actions}>
      <button type="button" className={styles.button} disabled={!allowed || pending} onClick={() => void load()}>
        {pending ? "Reading permitted export..." : "Load permitted export preview"}
      </button>
      <button type="button" className={styles.button} disabled={!allowed || pending || !manifest} onClick={() => void load("json")}>
        Refresh and download JSON
      </button>
      <button type="button" className={styles.button} disabled={!allowed || pending || !manifest} onClick={() => void load("csv")}>
        Refresh and download CSV
      </button>
    </div>
    {error && <ReadFailure error={error} label="Export status" />}
    {manifest && <div className={styles.stack}>
      <ReadFacts items={[
        { label: "Service export scope", value: manifest.scopeLabel ?? "Label not supplied" },
        { label: "Source generated time", value: <StoredTime value={manifest.generatedAt} /> },
        { label: "Read retrieved", value: <StoredTime value={manifest.provenance.retrievedAt} /> },
        { label: "Reported projects", value: manifest.reportedProjectCount ?? "Not supplied" },
        { label: "Reported document metadata", value: manifest.reportedDocumentCount ?? "Not supplied" },
        { label: "Loaded projection", value: `${manifest.projects.length} project rows / ${manifest.documents.length} document metadata rows` },
      ]} />
      <ul className={styles.list}>{manifest.projects.slice(0, 25).map((project, index) => <li key={`${project.projectId ?? project.siteId ?? "row"}-${index}`}>
        <strong>{project.name ?? "Name not supplied"}</strong>
        <p>{project.locality ?? "Locality not supplied"} / {project.journeyStageId ?? "Stage not supplied"}</p>
      </li>)}</ul>
      <p className={styles.muted}>Previewing up to 25 project rows. Downloads contain the entire admitted manifest and recheck the service,
        so a newer permitted snapshot may replace this preview. CSV is a formula-safe local encoding of the same admitted JSON projection.</p>
    </div>}
    <p className={styles.muted}>No report HTML is executed. No recipient is contacted, document is signed or background generation job is created.</p>
  </section>;
}
