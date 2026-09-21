import { useState } from "react";
import { VppEducation } from "@/features/community-context";
import type { LiveSnapshot, ReadRecord } from "@/features/live-read";
import { numberText, projectRow, recordName } from "./presentation";
import { ReadFacts, ReadFailure, StoredTime, WriteBoundary } from "./ReadStatus";
import styles from "./Workspace.module.css";

export function NextWork({ snapshot, onOpen }: { snapshot: LiveSnapshot; onOpen: (id: string) => void }) {
  const [visible, setVisible] = useState(5);
  if (snapshot.role === "investor") return null;
  if (snapshot.role === "site-owner") return <section className={styles.panel} aria-label="Owner next work">
    <h2>Outstanding requests</h2>
    {!snapshot.outstanding.ok ? <ReadFailure error={snapshot.outstanding.error} /> :
      snapshot.outstanding.data.length === 0 ? <p>No outstanding requests were returned by this read.</p> :
        <><p className={styles.muted}>Showing {Math.min(visible, snapshot.outstanding.data.length)} of {snapshot.outstanding.data.length} returned requests.</p>
        <ul className={styles.list}>{snapshot.outstanding.data.slice(0, visible).map((item) => {
          const record = snapshot.records.find((row) => row.siteId === item.siteId);
          return <li key={item.id}><strong>{item.message ?? "Request message not supplied"}</strong>
            <p><StoredTime value={item.createdAt} /></p>
            {record && <button type="button" className={styles.textButton} onClick={() => onOpen(record.id)}>
              Read {recordName(record)}
            </button>}
          </li>;
        })}</ul>
        {visible < snapshot.outstanding.data.length && <button type="button" className={styles.textButton}
          onClick={() => setVisible(visible + 25)}>Show more returned requests</button>}</>}
    <WriteBoundary action="Submitting requested information or completing work" />
  </section>;

  const work = snapshot.submissions.filter((record) =>
    record.submissionStatus === "submitted" || record.submissionStatus === "screening" || record.submissionStatus === "info_requested");
  return <section className={styles.panel} aria-label="Operator next work">
    <h2>Read the work ahead</h2>
    <p>Submitted, screening and information-requested records from the current authorized read. This is not an unread inbox or an assignment engine.</p>
    {work.length === 0 ? <p>No loaded submissions have one of these work states.</p> :
      <><p className={styles.muted}>Showing {Math.min(visible, work.length)} of {work.length} loaded work-state records.</p>
      <ul className={styles.list}>{work.slice(0, visible).map((record) => <li key={record.id}>
        <strong>{recordName(record)}</strong><p>Submission status: {record.submissionStatus}</p>
        <button type="button" className={styles.textButton} onClick={() => onOpen(record.id)}>Read stored record</button>
      </li>)}</ul>
      {visible < work.length && <button type="button" className={styles.textButton}
        onClick={() => setVisible(visible + 25)}>Show more work-state records</button>}</>}
    <WriteBoundary action="Reviewing, assigning, accepting or requesting changes" />
  </section>;
}

export function SnapshotSummary({ snapshot }: { snapshot: LiveSnapshot }) {
  return <section className={styles.stack} aria-label="Read snapshot summary">
    <div className={styles.cards}>
      <div className={styles.panel}><p className={styles.cardLabel}>Records in this loaded projection</p>
        <strong className={styles.metric}>{snapshot.summary.recordCount}</strong></div>
      <div className={styles.panel}><p className={styles.cardLabel}>Projects reported by the service</p>
        <strong className={styles.metric}>{snapshot.summary.projectCount ?? "Not supplied"}</strong></div>
      <div className={styles.panel}><p className={styles.cardLabel}>Reported estimated capacity</p>
        <strong className={styles.metric}>{numberText(snapshot.summary.totalEstimatedCapacityKw, "kW")}</strong></div>
    </div>
    {snapshot.role === "operator" && <div className={styles.panel}>
      <h2>Pipeline facts</h2>
      {!snapshot.pipeline.ok ? <ReadFailure error={snapshot.pipeline.error} label="Pipeline status" /> :
        <ReadFacts items={snapshot.pipeline.data.columns.map((column) => ({
          label: column.journeyStageId,
          value: column.reportedCount === null ? "Count not supplied" : `${column.reportedCount} reported`,
        }))} />}
    </div>}
    <p className={styles.muted}>Retrieved <StoredTime value={snapshot.provenance.retrievedAt} />.
      Record vintage remains separate. Loaded counts are not a certified whole-system total.</p>
  </section>;
}

export function ProfileView({ snapshot }: { snapshot: LiveSnapshot }) {
  const identity = snapshot.identity;
  return <div className={styles.stack}>
    <section className={styles.panel}>
      <h2>Service-confirmed perspective</h2>
      <ReadFacts items={[
        { label: "Role", value: identity.role },
        { label: "Participant ID", value: identity.userId },
        { label: "Organization", value: identity.organizationName ?? "Not specified" },
        { label: "Investor onboarding", value: identity.onboarded === null ? "Not supplied" : identity.onboarded ? "Recorded complete" : "Not recorded complete" },
      ]} />
      <p className={styles.muted}>A public participation answer or demo role is not this identity.</p>
    </section>
    {snapshot.role === "investor" && (!snapshot.profile.ok ? <ReadFailure error={snapshot.profile.error} /> :
      <section className={styles.panel}>
        <h2>Stored investor mandate</h2>
        <ReadFacts items={[
          { label: "Organization", value: snapshot.profile.data.organizationName ?? "Not specified" },
          { label: "Investor type", value: snapshot.profile.data.investorType ?? "Not specified" },
          { label: "Capital type", value: snapshot.profile.data.capitalType ?? "Not specified" },
          { label: "Funding stages", value: snapshot.profile.data.fundingStageFocus?.join(", ") || "Not specified" },
          { label: "Minimum ticket", value: snapshot.profile.data.ticketSizeMin === null ? "Not specified" : `${numberText(snapshot.profile.data.ticketSizeMin, "")} (currency not supplied)` },
          { label: "Maximum ticket", value: snapshot.profile.data.ticketSizeMax === null ? "Not specified" : `${numberText(snapshot.profile.data.ticketSizeMax, "")} (currency not supplied)` },
          { label: "Geographies", value: snapshot.profile.data.geographies?.join(", ") || "Not specified" },
          { label: "Objectives", value: snapshot.profile.data.investmentObjectives?.join(", ") || "Not specified" },
          { label: "Impact priorities", value: snapshot.profile.data.impactPriorities?.join(", ") || "Not specified" },
          { label: "Decision criteria", value: snapshot.profile.data.decisionCriteria?.join(", ") || "Not specified" },
          { label: "Updated", value: <StoredTime value={snapshot.profile.data.updatedAt} /> },
        ]} />
        <p className={styles.muted}>These are stored values, not suggested defaults. Demo priorities and broaden-matches do not change this mandate or your access.</p>
      </section>)}
    <WriteBoundary action="Saving a profile or mandate" />
  </div>;
}

export function EngagementsView({ snapshot, onOpen }: { snapshot: LiveSnapshot; onOpen: (id: string) => void }) {
  if (snapshot.role !== "investor") return null;
  return <section className={styles.panel}>
    <h2>Existing service engagements</h2>
    {!snapshot.engagements.ok ? <ReadFailure error={snapshot.engagements.error} /> :
      snapshot.engagements.data.length === 0 ? <p>No engagements were returned by this read.</p> :
        <ul className={styles.list}>{snapshot.engagements.data.map((engagement) => {
          const record = snapshot.records.find((row) => row.projectId === engagement.projectId);
          return <li key={engagement.id}>
            <strong>{engagement.projectName ?? "Project name not supplied"}</strong>
            <p>Recorded state: {engagement.state ?? "Not supplied"}</p>
            <p>{engagement.isBinding === null ? "Binding status not supplied." :
              engagement.isBinding ? "The service marks this state binding; this interface did not create it." : "The service marks this state nonbinding."}</p>
            <p><StoredTime value={engagement.stateChangedAt} /></p>
            {record && <button type="button" className={styles.textButton} onClick={() => onOpen(record.id)}>Read permitted project</button>}
          </li>;
        })}</ul>}
    <p>Open a permitted portfolio project to explicitly register nonbinding interest or request its eligible deal-room read.</p>
    <WriteBoundary action="Withdrawing interest or committing funding" />
  </section>;
}

export function LearningView() {
  return <div className={styles.stack}>
    <section className={styles.panel}>
      <h2>A short workspace orientation</h2>
      <ol className={styles.steps}>
        <li><strong>Check your perspective</strong><p>The service supplies your role. Only its permitted records can load.</p></li>
        <li><strong>Read a record in context</strong><p>Compare source fields, evidence and timestamps before interpreting a status.</p></li>
        <li><strong>Keep action and access separate</strong><p>Nonbinding project interest requires an explicit investor action. Other workflow writes remain unavailable, and a download needs its own disclosure admission.</p></li>
      </ol>
      <p>Learning is optional and can be revisited. It does not complete a profile or task.</p>
    </section>
    <VppEducation />
    <section className={styles.panel}>
      <h2>Scripted help and human support</h2>
      <p>On-screen guidance is deterministic. It does not contact a project manager, generate an AI answer or start work.</p>
      <p>For human adoption support, use the team&apos;s established contact channel. No contact or response commitment has been invented here.</p>
    </section>
  </div>;
}

export function CompareView({ records, ids, onChange }: {
  records: readonly ReadRecord[];
  ids: readonly [string, string];
  onChange: (ids: readonly [string, string]) => void;
}) {
  return <section className={styles.panel}>
    <h2>Compare stored read fields</h2>
    <p>No new financial model, assessment or eligibility calculation is performed.</p>
    <div className={styles.comparison}>
      {([0, 1] as const).map((position) => {
        const record = records.find((row) => row.id === ids[position]);
        const projection = record ? projectRow(record) : null;
        return <div key={position}>
          <label className={styles.field}>Comparison record {position + 1}
            <select value={record?.id ?? ""} onChange={(event) =>
              onChange(position === 0 ? [event.target.value, ids[1]] : [ids[0], event.target.value])}>
              <option value="">Choose a permitted record</option>
              {records.map((row) => <option key={row.id} value={row.id}>{recordName(row)}</option>)}
            </select>
          </label>
          {projection && <ReadFacts items={[
            { label: "Stage", value: projection.stage },
            { label: "Capacity", value: projection.capacity },
            { label: "Screening", value: projection.screening },
          ]} />}
        </div>;
      })}
    </div>
  </section>;
}
