import { CONNECTION_REGISTRY, WS2_CONTRACT_REVISION } from "@/domain/connections";
import type { ReadProvenance } from "@/features/live-read";
import { ReadFacts, SectionHeading, StoredTime } from "./ReadStatus";
import styles from "./Workspace.module.css";

export function ConnectionsView({ provenance }: { provenance: ReadProvenance | null }) {
  return <div className={styles.stack}>
    <SectionHeading eyebrow="Clear seams, honest status" title="Your connections">
      Source implementation, admission and actual permitted reads are different facts.
    </SectionHeading>
    <section className={styles.panel} aria-label="Current read evidence">
      <ReadFacts items={[
        { label: "Source contract", value: <code>{WS2_CONTRACT_REVISION}</code> },
        { label: "Deployed revision", value: "Not confirmed by this frontend" },
        { label: "Snapshot retrieved", value: provenance ? <StoredTime value={provenance.retrievedAt} /> : "No authorized snapshot observed" },
        { label: "Source experience", value: provenance?.mode === "server-demo" ? "Fictional server demo / mock store" :
          provenance?.mode === "connected" ? "Connected / database-configured; real session evidence is separate" : "No source mode observed" },
        { label: "Business workflows", value: "Explicit nonbinding project interest only. Other workflow writes are not implemented." },
      ]} />
    </section>
    <div className={styles.stack}>
      {CONNECTION_REGISTRY.map((connection) => <details className={styles.disclosure} key={connection.id}>
        <summary>{connection.label}</summary>
        <div className={styles.connection}>
          <code>{connection.id}</code>
          <span className={styles.badge}>{connection.status === "OUT_OF_REACH_RIGHT_NOW" ? "Out of reach right now" : "Existing read contract; admission required"}</span>
          <p>{connection.statusReason}</p>
          <ReadFacts items={[
            { label: "Owner", value: connection.owner },
            { label: "Admitted operations", value: connection.acceptedOperations.length ? connection.acceptedOperations.join("\n") : "No independent network operation admitted" },
            { label: "Identity", value: connection.auth },
            { label: "Disclosure", value: connection.disclosure },
            { label: "Freshness", value: connection.freshness },
            { label: "Collection limits", value: connection.pagination },
            { label: "Configuration names", value: connection.configNames.join(", ") || "Separate handoff required" },
            { label: "Next handoff", value: connection.nextHandoff },
          ]} />
        </div>
      </details>)}
    </div>
    <p className={styles.muted}>
      A successful homepage or configured value does not certify the session, deployed source,
      real records or provider access. No credentials belong in this view.
    </p>
  </div>;
}
