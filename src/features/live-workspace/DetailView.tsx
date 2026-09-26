import type {
  DocumentReference, LiveDetail, ReadDocumentMetadata, ReadFundingNeed,
  ReadInvestorAssessment, ReadResult,
} from "@/features/live-read";
import { compareSourceTimes, numberText, rangeText, recordName, stageLabel, VIABILITY_LABELS } from "./presentation";
import { ReadFacts, ReadFailure, StoredTime, WriteBoundary } from "./ReadStatus";
import styles from "./Workspace.module.css";

interface DetailViewProps {
  detail: LiveDetail;
  allowDownloads: boolean;
  downloading: boolean;
  onDownload: (reference: DocumentReference) => void;
}

export function DetailView({ detail, allowDownloads, downloading, onDownload }: DetailViewProps) {
  const funding = detail.role === "site-owner" ? null : detail.fundingNeeds;
  return <div className={styles.stack}>
    <section className={styles.panel} aria-label="Stored lifecycle and source">
      <ReadFacts items={[
        { label: "Record", value: recordName(detail.record) },
        { label: "Journey stage", value: stageLabel(detail.record) },
        { label: "Submission status", value: detail.record.submissionStatus ?? "Not supplied" },
        { label: "Project stage", value: detail.record.projectStage ?? "Not supplied" },
        { label: "Record updated", value: <StoredTime value={detail.record.updatedAt} /> },
        { label: "Read retrieved", value: <StoredTime value={detail.provenance.retrievedAt} /> },
      ]} />
      <p className={styles.muted}>Submission disposition, project development and the journey label are separate source fields.</p>
      <WriteBoundary action="Review, assignment, notes, stage changes and publication" />
    </section>

    <section className={styles.panel} aria-label="Permitted site information">
      <h2>Site information</h2>
      <ReadFacts items={[
        { label: "Site type", value: detail.site.siteType },
        { label: "Ownership status", value: detail.site.ownershipStatus },
        { label: "Reported area", value: numberText(detail.site.approximateAreaSqm, "sq m") },
        { label: "Annual consumption", value: numberText(detail.site.electricityUsageKwhAnnual, "kWh/year") },
        { label: "Existing solar", value: detail.site.hasExistingSolar === null ? "Not supplied" : detail.site.hasExistingSolar ? "Reported present" : "Reported absent" },
        ...(detail.role === "investor"
          ? [{ label: "Permitted locality", value: detail.site.locality }]
          : [
            { label: "Permitted address", value: detail.site.address },
            { label: "Latitude", value: numberText(detail.site.latitude, "degrees") },
            { label: "Longitude", value: numberText(detail.site.longitude, "degrees") },
            { label: "Geocode confidence", value: numberText(detail.site.geocodeConfidence, "(source value)") },
            { label: "Owner", value: detail.owner?.name ?? "Not supplied" },
            { label: "Consent recorded", value: <StoredTime value={detail.site.consentGivenAt} /> },
          ]),
      ]} />
      <p className={styles.muted}>Stored fields do not establish title, verified geocoding, final suitability or authorization to perform work.</p>
      {detail.role !== "investor" && detail.project && <ReadFacts items={[
        { label: "Stored next action", value: detail.project.nextAction },
        { label: "Stored target date", value: <StoredTime value={detail.project.targetDate} /> },
      ]} />}
    </section>

    <section className={styles.panel} aria-label="Assessment evidence">
      <h2>Assessment evidence, kept distinct</h2>
      <p>These are existing stored results, not a new assessment, approval or prediction.</p>
      <div className={styles.cards}>
        <Assessment label="Original recommendation" assessment={detail.assessments.original} />
        <Assessment label="Current stored result" assessment={detail.assessments.current} />
        <Assessment label="Stored human override" assessment={detail.assessments.human} />
      </div>
      {detail.assessments.completeness !== "complete" && <p className={styles.muted}>
        The service supplies {detail.assessments.completeness === "current-only" ? "the current result only" : "no complete assessment history"}.
        No earlier recommendation or human decision has been invented.
      </p>}
      {detail.role !== "investor" && detail.assessments.human && <ReadFacts items={[
        { label: "Supplied override reason", value: detail.assessments.human.overrideReason },
        { label: "Recorded reviewer ID", value: detail.assessments.human.overriddenByUserId },
      ]} />}
      <WriteBoundary action="Generating, rerunning or overriding an assessment" />
    </section>

    <DocumentsView documents={detail.documents} allowDownloads={allowDownloads}
      downloading={downloading} onDownload={onDownload} />
    <ActivityView detail={detail} />

    {detail.role === "site-owner" && <section className={styles.panel}>
      <h2>Outstanding requests</h2>
      {detail.outstanding === null ? <p>Outstanding-request detail was not supplied by this read.</p>
        : detail.outstanding.length === 0 ? <p>No outstanding request was returned for this site.</p>
          : <ul className={styles.list}>{detail.outstanding.map((item) => <li key={item.id}>
            <strong>{item.message ?? "Request text not supplied"}</strong><p><StoredTime value={item.createdAt} /></p>
          </li>)}</ul>}
      <WriteBoundary action="Responding, submitting information or acknowledging an agreement" />
    </section>}

    {funding && <FundingView result={funding} />}
    {detail.role === "operator" && detail.engagements && <section className={styles.panel}>
      <h2>Existing engagement states</h2>
      {detail.engagements.ok
        ? <ul className={styles.list}>{detail.engagements.data.map((engagement) => <li key={engagement.id}>
          <strong>{engagement.state ?? "State not supplied"}</strong>
          <p>Engagement record {engagement.id}</p><p><StoredTime value={engagement.stateChangedAt} /></p>
        </li>)}</ul>
        : <ReadFailure error={detail.engagements.error} label="Engagement read status" />}
      <WriteBoundary action="Changing an engagement or executing funding" />
    </section>}
  </div>;
}

function Assessment({ label, assessment }: { label: string; assessment: ReadInvestorAssessment | null }) {
  return <div className={styles.disclosure}>
    <h3>{label}</h3>
    {!assessment ? <p>Not supplied</p> : <>
      <strong>{assessment.viabilityStatus ? VIABILITY_LABELS[assessment.viabilityStatus] : "Screening status not supplied"}</strong>
      <p>{rangeText(assessment.estimatedSystemSizeKw)}</p>
      <p>{rangeText(assessment.estimatedAnnualGenerationKwh)}</p>
      <p className={styles.muted}>Ruleset: {assessment.rulesetVersion ?? "Not supplied"}</p>
      <p className={styles.muted}><StoredTime value={assessment.createdAt} /></p>
      <p className={styles.muted}>Flags: {assessment.flags === null ? "Not supplied" : assessment.flags.join("; ") || "None returned"}</p>
      <p className={styles.muted}>Missing evidence: {assessment.missingInformation === null ? "Not supplied" : assessment.missingInformation.join("; ") || "None returned"}</p>
    </>}
  </div>;
}

export function DocumentsView({ documents, allowDownloads, downloading, onDownload }: {
  documents: readonly ReadDocumentMetadata[];
  allowDownloads: boolean;
  downloading: boolean;
  onDownload: (reference: DocumentReference) => void;
}) {
  const sorted = [...documents].sort((a, b) =>
    compareSourceTimes(a.createdAt, b.createdAt) || a.id.localeCompare(b.id));
  return <section className={styles.panel} aria-label="Permitted document metadata">
    <h2>Documents</h2>
    <p>Newest supplied timestamp first; dates without a time or timezone sort last.
      A filename or upload date does not establish the current revision.</p>
    {sorted.length === 0 ? <p>No document metadata was returned for this permitted record.</p> :
      <ul className={styles.list}>{sorted.map((document) => <li key={document.id}>
        <strong>{document.fileName ?? "Filename not supplied"}</strong>
        <p>{document.docType ?? "Type not supplied"} / {document.disclosure === "owner-operator" ? "Owner/operator audience" : "Released investor tier-1 metadata"}</p>
        <p><StoredTime value={document.createdAt} /> / {numberText(document.sizeBytes, "bytes")}</p>
        {document.disclosure === "owner-operator" && <p className={styles.muted}>
          Sensitivity: {document.disclosureClass ?? "Not supplied"} / Actor ID: {document.uploadedByUserId ?? "Not supplied"}
        </p>}
        <details>
          <summary>File history and original</summary>
          <p className={styles.muted}>This contract supplies metadata, not per-file version or review history. Opening this entry marks nothing read or reviewed.</p>
          {document.download && allowDownloads
            ? <button type="button" className={styles.button} disabled={downloading}
              onClick={() => { if (document.download) onDownload(document.download); }}>
              Download original: {document.fileName ?? document.id}
            </button>
            : <p className={styles.muted}>Original download is out of reach right now for this admission or disclosure scope.</p>}
          <p className={styles.muted}>Even permitted metadata may have no original bytes. No placeholder file or fabricated link is provided.</p>
        </details>
      </li>)}</ul>}
    <WriteBoundary action="Uploading, replacing or reviewing a document" />
  </section>;
}

export function ActivityView({ detail }: { detail: LiveDetail }) {
  const items = detail.role === "investor"
    ? detail.timeline.map((item) => ({ ...item, actor: null, note: null }))
    : detail.activity?.map((item) => ({ ...item, actor: item.actorUserId, note: item.note })) ?? null;
  return <section className={styles.panel} aria-label="Permitted record activity">
    <h2>Stored activity</h2>
    {items === null ? <p>Activity history was not supplied.</p> : items.length === 0
      ? <p>No activity items were returned by this read.</p>
      : <ul className={styles.list}>{items.map((item) => <li key={item.id}>
        <strong>{item.action ?? "Action not supplied"}</strong>
        <p>{item.fromValue ?? "Previous value not supplied"} to {item.toValue ?? "Next value not supplied"}</p>
        <p><StoredTime value={item.createdAt} /></p>
        <p className={styles.muted}>Actor: {detail.role === "investor" ? "Not included in this projection" : item.actor ?? "Not supplied"}</p>
        {item.note && <p>{item.note}</p>}
      </li>)}</ul>}
    <p className={styles.muted}>Record history is not an unread notification feed. Opening it makes no acknowledgement.</p>
  </section>;
}

function FundingView({ result }: { result: ReadResult<readonly ReadFundingNeed[]> }) {
  return <section className={styles.panel}>
    <h2>Stored funding needs</h2>
    {!result.ok ? <ReadFailure error={result.error} label="Funding read status" /> :
      result.data.length === 0 ? <p>No funding needs were returned for this scope.</p> :
        <ul className={styles.list}>{result.data.map((need) => <li key={need.id}>
          <strong>{need.needType ?? "Need type not supplied"} / {need.stage ?? "Funding stage not supplied"}</strong>
          <p>{need.description ?? "Description not supplied"}</p>
          <p>Requested: {numberText(need.amountRequested, "")}; committed: {numberText(need.amountCommitted, "")}. Currency not supplied.</p>
          <p>Status: {need.status ?? "Not supplied"} / <StoredTime value={need.createdAt} /></p>
        </li>)}</ul>}
    <p className={styles.muted}>These records are not an investment offer, a transaction or a modeled return.</p>
    <WriteBoundary action="Committing capital, underwriting, funding or signing" />
  </section>;
}
