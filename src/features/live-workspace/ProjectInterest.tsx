import { useState } from "react";
import {
  currentProjectInterest,
  type InterestResult, type InvestorSnapshot, type ReadError,
} from "@/features/live-read";
import { ReadFailure } from "./ReadStatus";
import styles from "./Workspace.module.css";

export function ProjectInterest({
  projectId, snapshot, result, error, pending, allowed, onRegister, onReconcile,
}: {
  projectId: string;
  snapshot: InvestorSnapshot;
  result: InterestResult | undefined;
  error: ReadError | undefined;
  pending: boolean;
  allowed: boolean;
  onRegister: (acknowledgeUnknownOutcome: boolean) => void;
  onReconcile: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [observed, setObserved] = useState(result);
  if (observed !== result) {
    setObserved(result);
    setAcknowledged(false);
  }
  const existing = snapshot.engagements.ok
    ? currentProjectInterest(snapshot.engagements.data, projectId) : null;
  const unknown = result?.kind === "unknown";
  return <section className={styles.panel} aria-label="Project interest">
    <h3>Nonbinding project interest</h3>
    <p>This records interest and an activity entry; it does not commit or transfer funds.
      It may permit the existing deal-room read under the service&apos;s current rules.</p>
    {!snapshot.engagements.ok && <ReadFailure error={snapshot.engagements.error} label="Existing engagement status" />}
    {existing && <p role="status">Existing project-level engagement: <strong>{existing.state}</strong>.
      {existing.isBinding === true ? " The service marks this existing state binding; this interface did not create that commitment." :
        existing.isBinding === false ? " The service marks this state nonbinding." : " Binding status was not supplied."}</p>}
    {result?.kind === "created" && <p role="status">The service confirmed that nonbinding interest was registered.</p>}
    {result?.kind === "existing" && <p role="status">An existing engagement was confirmed; no new creation is claimed.</p>}
    {result?.kind === "unknown" && <section className={styles.warning} role="status" aria-label="Interest request status">
      <strong>Interest outcome unknown</strong><p>{result.error.message}</p>
    </section>}
    {result && (result.kind === "not-sent" || result.kind === "refused") && <>
      <p>{result.kind === "not-sent" ? "No interest POST was sent." : "The interest request was refused."}</p>
      <ReadFailure error={result.error} label="Interest request status" />
    </>}
    {error && <ReadFailure error={error} label="Engagement refresh status" />}
    {unknown && <label className={styles.field}>
      <span>The previous request may have completed. An empty or failed status read does not prove it failed.</span>
      <span><input type="checkbox" checked={acknowledged} disabled={pending}
        aria-label="I understand the uncertain outcome and want a new registration attempt."
        onChange={(event) => setAcknowledged(event.target.checked)} />
        I understand the uncertain outcome and want a new registration attempt.</span>
    </label>}
    <div className={styles.actions}>
      <button type="button" className={`${styles.button} ${styles.primary}`}
        disabled={!allowed || pending || existing !== null || (unknown && !acknowledged)}
        onClick={() => onRegister(acknowledged)}>
        {pending ? "Checking interest..." : unknown ? "Make a new registration attempt" : "Register nonbinding interest"}
      </button>
      <button type="button" className={styles.button} disabled={pending}
        onClick={onReconcile}>Refresh interest status</button>
    </div>
    {!allowed && <p className={styles.muted}>Interest is not admitted by this workspace configuration.</p>}
    <p className={styles.muted}>Status refresh is GET-only. No request is replayed automatically; withdrawal and financial commitments remain unavailable here.</p>
  </section>;
}
