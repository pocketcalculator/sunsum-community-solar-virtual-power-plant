"use client";

import { useEffect, useRef, useState } from "react";
import {
  ROLE_LABELS, newId, roleSites, sourceRevision, visibleDrafts,
  type DemoDraft, type LabState, type Role, type Site,
} from "./model";
import {
  DRAFT_TEMPLATES, REPORT_SCHEMA_VERSION, ReportExportError, SYNTHETIC_BASIS,
  createDemoDraft, createPortfolioSnapshot, createRefreshedDraft, draftReviewLabel,
  draftSnapshotAt, exportDraft, exportPortfolio, initiateReportDownload,
  isCorrectableDraftField, portfolioSnapshotIssue,
  type LocalReportFile, type PortfolioSnapshot, type ReportScope,
} from "./reportExport";
import { useLab } from "./store";
import { Button, Card, Empty, Field, Pill } from "./ui";
import s from "./ReportView.module.css";

interface ReportViewProps {
  role: Role;
  siteId?: string;
  onOpen?: (id: string) => void;
}

type WorkspaceMode = DemoDraft["kind"] | "portfolio";
interface DraftSession {
  draft: DemoDraft;
  dirty: boolean;
  persisted: boolean;
  baseSaved: DemoDraft | null;
}

const modes: { id: WorkspaceMode; label: string; description: string }[] = [
  { id: "project_brief", label: "Project briefing", description: "Correct and edit a generated demo draft." },
  { id: "assessment_report", label: "Assessment report", description: "Review original, current and human records." },
  { id: "portfolio", label: "Portfolio summary", description: "Export an explicitly permitted project scope." },
];

export function ReportView({ role, siteId, onOpen }: ReportViewProps) {
  const { state, ready, dispatch, notice } = useLab();
  return <div className={s.reportView}>
    <header className={s.heading}>
      <div><p className={s.eyebrow}>Drafts / reports / exports</p><h1>Make the next review clear.</h1>
        <p>Keep source facts, your corrections and human review separate.</p></div>
      <Pill>Local synthetic preview</Pill>
    </header>
    {!ready ? <p role="status">Restoring the shared browser preview...</p> :
      <ReportWorkspace key={`${role}:${siteId ?? "portfolio"}`} state={state} role={role} siteId={siteId} onOpen={onOpen} dispatch={dispatch} />}
    {notice && /memory only|storage|could not be restored|could not be written/i.test(notice) &&
      <p className={s.warning} role="alert">{notice}</p>}
  </div>;
}

function ReportWorkspace({ state, role, siteId, onOpen, dispatch }: {
  state: LabState;
  role: Role;
  siteId: string | undefined;
  onOpen: ((id: string) => void) | undefined;
  dispatch: ReturnType<typeof useLab>["dispatch"];
}) {
  const [mode, setMode] = useState<WorkspaceMode>(role === "investor" || !siteId ? "portfolio" : "project_brief");
  const [session, setSession] = useState<DraftSession | null>(null);
  const [refresh, setRefresh] = useState<DemoDraft | null>(null);
  const [refreshBase, setRefreshBase] = useState<DemoDraft | null>(null);
  const [reviewConfirmation, setReviewConfirmation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const releaseDownload = useRef<(() => void) | null>(null);
  useEffect(() => () => { releaseDownload.current?.(); }, []);

  const site = roleSites(state, role).find((entry) => entry.id === siteId);
  const drafts = site && role !== "investor" ? visibleDrafts(state, role, site.id) : [];
  const stored = session ? drafts.find((entry) => entry.id === session.draft.id) : undefined;
  const reviewConfirmed = !!stored && reviewConfirmation === JSON.stringify(stored);
  const draft = session && site && session.draft.siteId === site.id && (!session.persisted || stored)
    ? (!session.dirty && stored ? stored : session.draft) : null;
  const dirty = !!session?.dirty;
  const stale = !!draft && !!site && draft.sourceRevision !== sourceRevision(site);
  const conflict = session !== null && dirty && session.persisted && JSON.stringify(stored ?? null) !== JSON.stringify(session.baseSaved);
  const refreshChanged = !!refresh && JSON.stringify(stored ?? null) !== JSON.stringify(refreshBase);
  const templateAvailable = !!draft && draft.templateVersion === DRAFT_TEMPLATES[draft.kind].version;

  const attempt = (action: () => void) => {
    setError(null);
    setFeedback(null);
    try { action(); } catch (cause) {
      if (!(cause instanceof ReportExportError)) throw cause;
      setError(cause.message);
    }
  };
  const download = (makeFile: () => LocalReportFile) => attempt(() => {
    const artifact = makeFile();
    const release = initiateReportDownload(artifact);
    releaseDownload.current?.();
    releaseDownload.current = release;
    setFeedback(`Generated ${artifact.filename}. Download started in this browser; nothing was delivered to a recipient.`);
  });
  const open = (saved: DemoDraft) => {
    setSession({ draft: saved, dirty: false, persisted: true, baseSaved: saved });
    setRefresh(null);
    setReviewConfirmation(null);
    setError(null);
    setFeedback(null);
  };
  const create = (kind: DemoDraft["kind"]) => attempt(() => {
    if (!site) throw new ReportExportError("Select a permitted project in the workspace before creating a draft.");
    const created = createDemoDraft(state, role, site.id, kind, newId("draft"), new Date().toISOString());
    setSession({ draft: created, dirty: true, persisted: false, baseSaved: null });
    setRefresh(null);
    setReviewConfirmation(null);
    setFeedback("Prefill prepared locally. Check the fields and save your draft; no AI service was called.");
  });
  const edit = (change: (current: DemoDraft) => DemoDraft) => {
    if (!draft || !session) {
      setError("This draft is no longer available. Reopen a permitted draft before editing.");
      return;
    }
    setSession({
      ...session, dirty: true, baseSaved: session.dirty ? session.baseSaved : stored ?? null,
      draft: { ...change(draft), review: "draft", reviewedAt: null, reviewerRole: null },
    });
    setReviewConfirmation(null);
    setRefresh(null);
    setError(null);
    setFeedback(null);
  };
  const save = () => attempt(() => {
    if (!draft || conflict) throw new ReportExportError("The saved draft changed elsewhere. Copy your edits, then reopen it before saving.");
    if (!draft.title.trim() || !draft.content.trim()) throw new ReportExportError("Add a draft title and body before saving. Your edits are still here.");
    if (!dispatch({ type: "save-draft", draft }, "Draft updated in the shared browser preview. Any previous review was cleared.")) {
      throw new ReportExportError("The draft could not be saved in this scope. Your edits are still here; check the selected project and role.");
    }
    setSession({ draft, dirty: false, persisted: true, baseSaved: null });
    setReviewConfirmation(null);
    setFeedback("Draft updated in the shared preview. It needs an explicit human review.");
  });
  const review = () => attempt(() => {
    if (!stored || dirty || stale || conflict || !reviewConfirmed) {
      throw new ReportExportError("Save a current draft and confirm that you have reviewed it before recording human review.");
    }
    if (!dispatch({ type: "review-draft", draftId: stored.id, role }, "Human review recorded for this saved demo snapshot only.")) {
      throw new ReportExportError("Review was not recorded. The source or draft changed; reopen it and check the snapshot.");
    }
    setReviewConfirmation(null);
    setFeedback(`Human review recorded as ${ROLE_LABELS[role]} (demo role). No project was accepted, published or signed.`);
  });
  const prepareRefresh = () => attempt(() => {
    if (!stored || dirty || conflict) throw new ReportExportError("Save your edits before preparing a refreshed copy.");
    setRefresh(createRefreshedDraft(state, role, stored.id, newId("draft"), new Date().toISOString()));
    setRefreshBase(stored);
    setReviewConfirmation(null);
  });
  const confirmRefresh = () => attempt(() => {
    if (!refresh || !site || refresh.sourceRevision !== sourceRevision(site) || dirty || conflict || refreshChanged) {
      throw new ReportExportError("The source or saved draft changed again. Prepare the refreshed prefill again before creating a copy.");
    }
    if (!dispatch({ type: "save-draft", draft: refresh }, "Refreshed draft copy saved; the earlier source snapshot is preserved.")) {
      throw new ReportExportError("The refreshed copy could not be saved. The previous draft is unchanged.");
    }
    setSession({ draft: refresh, dirty: false, persisted: true, baseSaved: null });
    setRefresh(null);
    setReviewConfirmation(null);
    setFeedback("Refreshed copy saved. Your title, narrative and corrected fields were kept; the earlier draft remains available.");
  });

  return <>
    <div className={s.context}>
      <div><span className={s.eyebrow}>{ROLE_LABELS[role]} / demo role</span>
        <strong>{site ? site.name : siteId ? "Selected project unavailable" : "No selected project"}</strong></div>
      {site && onOpen && <Button onClick={() => onOpen(site.id)} disabled={dirty} icon="arrow">Open project</Button>}
    </div>
    <nav className={s.modes} aria-label="Report workspace">
      {modes.filter((entry) => role !== "investor" || entry.id === "portfolio").map((entry) =>
        <button key={entry.id} type="button" aria-pressed={mode === entry.id} disabled={dirty && mode !== entry.id}
          onClick={() => {
            if (entry.id !== mode) {
              setMode(entry.id); setSession(null); setRefresh(null); setReviewConfirmation(null); setError(null); setFeedback(null);
            }
          }}><span>{entry.label}</span><small>{entry.description}</small></button>)}
    </nav>
    {error && <p className={s.error} role="alert">{error}</p>}
    {feedback && <p className={s.feedback} role="status" aria-label="Report action status">{feedback}</p>}
    {mode === "portfolio" ? <PortfolioPanel state={state} role={role} siteId={siteId} site={site}
      onOpen={onOpen} attempt={attempt} download={download} /> : <>
      {!site ? <Card><Empty title={siteId ? "Project unavailable" : "Choose a project first"} icon="file">
        {siteId ? "This project is not permitted for the current demo role. Choose a different project in the workspace." :
          "Choose a project in the workspace to prefill a briefing or assessment report. Portfolio summary is a separate scope."}
      </Empty></Card> : <div className={s.draftLayout}>
        <aside className={s.library}>
          <Card title={DRAFT_TEMPLATES[mode].title} eyebrow="Original demo template">
            <p className={s.muted}>{mode === "project_brief"
              ? "Prefilled project and owner fields, with an editable non-executing narrative."
              : "A separate report for reading assessment provenance and recording human review."}</p>
            <p className={s.version}>{DRAFT_TEMPLATES[mode].version}</p>
            <Button variant="primary" icon="plus" disabled={dirty} onClick={() => create(mode)}>
              {mode === "project_brief" ? "Create briefing draft" : "Create assessment report"}
            </Button>
          </Card>
          <Card title="Saved drafts" eyebrow="Selected project only">
            <p className={s.muted}>Opening a draft does not mark it reviewed.</p>
            {drafts.filter((entry) => entry.kind === mode).length ? <ul className={s.savedDrafts}>
              {drafts.filter((entry) => entry.kind === mode).map((entry) => <li key={entry.id}>
                <button type="button" disabled={dirty} aria-label={`Open ${entry.title}`}
                  aria-current={entry.id === draft?.id ? "true" : undefined} onClick={() => open(entry)}>
                  <strong>{entry.title}</strong><small>Saved {entry.updatedAt}</small>
                  <span>{draftReviewLabel(entry, entry.sourceRevision !== sourceRevision(site))}</span>
                </button>
              </li>)}
            </ul> : <p className={s.muted}>No saved {mode === "project_brief" ? "briefings" : "assessment reports"} for this project and role.</p>}
          </Card>
        </aside>
        <div className={s.editorColumn}>
          {!draft ? <Card><Empty title={session?.persisted ? "Saved draft unavailable" : "Start with the source"} icon="file"
            action={session?.persisted ? <Button onClick={() => { setSession(null); setRefresh(null); setReviewConfirmation(null); }}>Close unavailable draft</Button> : undefined}>
            {session?.persisted ? "The saved draft is no longer available in this scope. Choose an available draft." :
              "Create a draft to capture the selected project's synthetic source snapshot. Nothing is generated or sent in the background."}
          </Empty></Card> : <>
            <Card title={draft.kind === "project_brief" ? "Correct the briefing" : "Review the assessment report"} eyebrow="Saved source / editable draft"
              action={<Pill tone={stale || dirty || draft.review !== "reviewed" ? "warning" : "positive"}>{draftReviewLabel(draft, stale)}</Pill>}>
              <ol className={s.steps} aria-label="Draft workflow">
                <li><span>1</span>Source captured</li><li aria-current={dirty ? "step" : undefined}><span>2</span>{dirty ? "Edit and save" : "Draft saved"}</li>
                <li aria-current={!dirty && draft.review !== "reviewed" ? "step" : undefined}><span>3</span>Human review</li>
              </ol>
              <dl className={s.metadata}>
                <dt>Template</dt><dd>{draft.templateVersion} / original demo content</dd>
                <dt>Source</dt><dd>{draft.siteId} / {draft.sourceRevision}</dd>
                <dt>Source snapshot (UTC)</dt><dd>{draftSnapshotAt(draft)}</dd>
                <dt>Author</dt><dd>{ROLE_LABELS[draft.authorRole]} (demo role, not a verified identity)</dd>
              </dl>
              <p className={s.note}>{SYNTHETIC_BASIS} No connected AI service. Use fictional details only.</p>
              {stale && <div className={s.warning}>
                <h3>Source changed since this draft</h3>
                <p>Current source: <code>{sourceRevision(site)}</code>. Your stored snapshot and edits have not been overwritten.
                  {draft.reviewedAt ? " Any previous review applies only to the older snapshot." : ""}</p>
                <Button onClick={prepareRefresh} disabled={!stored || dirty || conflict || !templateAvailable}>Review refreshed prefill</Button>
                {dirty && <p>Save your edits first. A refreshed copy keeps the earlier saved draft.</p>}
              </div>}
              {!templateAvailable && <p className={s.warning}>This saved template version is unavailable. Its existing content is preserved; automatic refreshed prefill is disabled.</p>}
              {conflict && <p className={s.warning}>This draft changed in another view or tab. Your edits are retained here. Copy them before discarding and reopening; saving over the other version is blocked.</p>}
              {mode === "assessment_report" && <div className={s.provenance} aria-label="Stored assessment provenance">
                {[
                  ["source_original_assessment", "Original assessment"],
                  ["source_current_assessment", "Current assessment"],
                  ["source_human_decision", "Recorded human decision"],
                ].map(([key, label]) => <section key={key}><h3>{label}</h3>
                  <p>{draft.sourceFields.find((field) => field.key === key)?.sourceValue ?? "Unknown - not present in the stored snapshot."}</p></section>)}
              </div>}
              <form className={s.form} onSubmit={(event) => { event.preventDefault(); save(); }}>
                <Field label="Draft title"><input aria-label="Draft title" value={draft.title}
                  onChange={(event) => edit((current) => ({ ...current, title: event.target.value }))} /></Field>
                <fieldset className={s.fields}>
                  <legend>Correctable prefilled fields</legend>
                  <p className={s.fieldExplanation}>Corrections change this draft only, not the project. The original source value is retained separately.</p>
                  <div className={s.fieldGrid}>{draft.sourceFields.filter((field) => isCorrectableDraftField(field.key)).map((field) =>
                    <Field key={field.key} label={field.label} hint={`Stored source: ${field.sourceValue ?? "Unknown - not recorded"}`}>
                      <input aria-label={field.label} value={field.value} onChange={(event) => edit((current) => ({
                        ...current, sourceFields: current.sourceFields.map((entry) => entry.key === field.key ? { ...entry, value: event.target.value } : entry),
                      }))} />
                    </Field>)}</div>
                </fieldset>
                <Field label="Draft body" hint="Original editable narrative. This is not a lease, consent, financial model or executed agreement.">
                  <textarea aria-label="Draft body" rows={12} value={draft.content}
                    onChange={(event) => edit((current) => ({ ...current, content: event.target.value }))} />
                </Field>
                <details className={s.details}>
                  <summary>Stored source and provenance</summary>
                  <dl className={s.metadata}>{draft.sourceFields.filter((field) => !isCorrectableDraftField(field.key)).map((field) =>
                    <div className={s.definition} key={field.key}><dt>{field.label}</dt><dd>{field.sourceValue ?? "Unknown - original source not recorded"}</dd></div>)}</dl>
                </details>
                <div className={s.actions}>
                  <Button type="submit" variant="primary" disabled={!dirty || conflict}>Save draft</Button>
                  {dirty && <Button onClick={() => {
                    if (stored) open(stored);
                    else { setSession(null); setRefresh(null); setReviewConfirmation(null); setError(null); setFeedback(null); }
                  }}>Discard unsaved changes</Button>}
                  <span className={s.muted}>{dirty ? "Unsaved edits. Save before leaving this view or changing project or role." : "Saved in the shared preview."}</span>
                </div>
              </form>
            </Card>
            {refresh && <Card title="Review refreshed prefill" eyebrow="Deliberate new copy">
              <p className={s.muted}>Unchanged fields take the current source. Your corrections, title and narrative are kept.
                The earlier saved draft and source snapshot remain available; human review starts again.</p>
              <dl className={s.metadata}><dt>New snapshot (UTC)</dt><dd>{draftSnapshotAt(refresh)}</dd>
                <dt>New source</dt><dd>{refresh.sourceRevision}</dd></dl>
              <div className={s.tableScroll} tabIndex={0} role="region" aria-label="Refreshed field comparison">
                <table><caption>Compare stored source, current source and the next draft</caption>
                  <thead><tr><th scope="col">Field</th><th scope="col">Earlier source</th><th scope="col">Current source</th><th scope="col">Next draft value</th></tr></thead>
                  <tbody>{refresh.sourceFields.filter((field) => field.key !== "source_previous_draft").map((field) => <tr key={field.key}>
                    <th scope="row">{field.label}</th><td>{refreshBase?.sourceFields.find((entry) => entry.key === field.key)?.sourceValue ?? "Unknown"}</td>
                    <td>{field.sourceValue ?? "Unknown"}</td><td>{field.value}</td>
                  </tr>)}</tbody>
                </table>
              </div>
              {(refresh.sourceRevision !== sourceRevision(site) || refreshChanged) && <p className={s.warning}>The source or saved draft changed again. Cancel and prepare a fresh comparison.</p>}
              <div className={s.actions}><Button variant="primary" disabled={refresh.sourceRevision !== sourceRevision(site) || conflict || refreshChanged} onClick={confirmRefresh}>Create refreshed copy</Button>
                <Button onClick={() => setRefresh(null)}>Keep existing draft</Button></div>
            </Card>}
            <Card title="Human review and local copies" eyebrow={mode === "project_brief" ? "Briefing draft" : "Assessment report review"}>
              <p className={s.muted}>Review records a human reading of the saved snapshot as a demo role. It does not accept a project, review document bytes, resolve unknowns or authorize delivery.</p>
              {draft.reviewedAt && <p className={s.reviewReceipt}>
                {stale || dirty ? "Historical review" : "Recorded review"}: {draft.reviewedAt} / {draft.reviewerRole ? ROLE_LABELS[draft.reviewerRole] : "Unknown reviewer role"} (demo).
              </p>}
              <label className={s.confirm}>
                <input type="checkbox" checked={reviewConfirmed} disabled={!stored || dirty || stale || conflict || draft.review === "reviewed"}
                  onChange={(event) => setReviewConfirmation(event.target.checked && stored ? JSON.stringify(stored) : null)} />
                <span>I reviewed this saved synthetic draft</span>
              </label>
              <Button onClick={review} disabled={!reviewConfirmed || !stored || dirty || stale || conflict || draft.review === "reviewed"}>Record human review</Button>
              <div className={s.downloads}>
                <div><h3>Download this saved snapshot</h3><p className={s.muted}>Unreviewed or stale copies are labeled as such. Save any edits first. No recipient delivery occurs.</p></div>
                <div className={s.actions}>
                  <Button icon="download" disabled={!stored || dirty || conflict} onClick={() => download(() => exportDraft(state, role, draft.id, "html"))}>
                    {mode === "project_brief" ? "Briefing HTML" : "Assessment report HTML"}
                  </Button>
                  <Button icon="download" disabled={!stored || dirty || conflict} onClick={() => download(() => exportDraft(state, role, draft.id, "csv"))}>
                    {mode === "project_brief" ? "Briefing fields CSV" : "Assessment report CSV"}
                  </Button>
                </div>
              </div>
            </Card>
          </>}
        </div>
      </div>}
    </>}
    <div className={s.boundaries}>
      <section><h2>Legal templates unavailable</h2><p>No approved lease, co-ownership, consent or financial-agreement template is configured.
        These original demo briefings cannot execute an agreement.</p></section>
      <section><h2>Files are separate artifacts</h2><p>Uploaded and selected documents remain metadata only. Generated drafts, assessment reports and portfolio summaries are different outputs.
        Word, editable PDF, recipient delivery and signing are unavailable.</p></section>
    </div>
  </>;
}

function PortfolioPanel({ state, role, siteId, site, onOpen, attempt, download }: {
  state: LabState;
  role: Role;
  siteId: string | undefined;
  site: Site | undefined;
  onOpen: ((id: string) => void) | undefined;
  attempt: (action: () => void) => void;
  download: (makeFile: () => LocalReportFile) => void;
}) {
  const [scopeKind, setScopeKind] = useState<ReportScope["kind"]>(siteId ? "selected" : "all_permitted");
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const permitted = roleSites(state, role);
  const scope: ReportScope = scopeKind === "selected" ? { kind: "selected", siteId: siteId ?? "" } : { kind: "all_permitted" };
  const count = scopeKind === "selected" ? (site ? 1 : 0) : permitted.length;
  const issue = snapshot ? portfolioSnapshotIssue(state, role, snapshot) : null;
  const prepare = () => attempt(() => setSnapshot(createPortfolioSnapshot(state, role, scope, new Date().toISOString())));

  return <Card title="A summary with an explicit scope" eyebrow="Portfolio export">
    <div className={s.summaryControls}>
      <Field label="Summary scope"><select aria-label="Summary scope" value={scopeKind}
        onChange={(event) => {
          setScopeKind(event.target.value === "selected" ? "selected" : "all_permitted");
          setSnapshot(null);
        }}>
        <option value="selected" disabled={!siteId}>Selected project{!siteId ? " - choose a project first" : ""}</option>
        <option value="all_permitted">All permitted projects</option>
      </select></Field>
      <div className={s.scopeSummary}><strong>{count} permitted {count === 1 ? "project" : "projects"}</strong>
        <p>No filters from another screen are applied.</p></div>
      <Button variant="primary" disabled={!count} onClick={prepare}>{snapshot ? "Refresh summary snapshot" : "Prepare summary"}</Button>
    </div>
    <p className={s.note}>{SYNTHETIC_BASIS} Schema: {REPORT_SCHEMA_VERSION}. Power is kW; annual energy is kWh/year.
      Missing values stay unknown. No financial outputs are calculated.</p>
    <p className={s.redaction}><strong>Redaction:</strong> Owner contact details, exact addresses, private notes and all draft fields are excluded.
      {role === "investor" ? " Investor document metadata is included only where the existing diligence projection permits it; nonbinding interest is not a file download." :
        " Document metadata follows this demo role's project access. Owner scope is smaller than operator scope."}</p>
    {!count && <Empty title={scopeKind === "selected" ? "Selected project unavailable" : "No permitted projects"} icon="file">
      {scopeKind === "selected" ? "Choose a permitted project in the workspace, or deliberately switch to all permitted projects." :
        "There are no project rows to export for this demo role."}
    </Empty>}
    {issue && <p className={s.warning}>{issue.message}</p>}
    {snapshot && !issue?.hidePreview && <>
      <div className={s.previewHeading}><div><h3>Snapshot preview</h3><p>{snapshot.scopeLabel} / {snapshot.projects.length} projects / {ROLE_LABELS[role]} (demo)</p>
        <p>Snapshot (UTC): <time dateTime={snapshot.snapshotAt}>{snapshot.snapshotAt}</time></p></div>
        <div className={s.actions}>
          <Button icon="download" disabled={!!issue} onClick={() => download(() => exportPortfolio(state, role, snapshot, "html"))}>Summary HTML</Button>
          <Button icon="download" disabled={!!issue} onClick={() => download(() => exportPortfolio(state, role, snapshot, "csv"))}>Summary CSV</Button>
        </div>
      </div>
      <div className={s.tableScroll} tabIndex={0} role="region" aria-label="Portfolio summary preview">
        <table><caption>All rows in this snapshot, not another screen&apos;s filtered collection</caption>
          <thead><tr><th scope="col">Project / source</th><th scope="col">Stage / screening</th><th scope="col">Capacity (kW)</th><th scope="col">Annual generation (kWh/year)</th><th scope="col">Permitted document metadata</th></tr></thead>
          <tbody>{snapshot.projects.map((project) => <tr key={project.id}>
            <th scope="row">{onOpen ? <Button variant="ghost" onClick={() => onOpen(project.id)}>{project.name}</Button> : project.name}
              <small>{project.locality} / {project.region}</small><small>{project.sourceRevision}</small>
              <small>Assessment: {project.assessmentVersion ?? "Unknown"} / {project.assessmentAt ?? "Unknown"}</small></th>
            <td>{project.stage}<small>{project.screening}</small></td>
            <td>{project.capacityMinKw ?? "Unknown"} to {project.capacityMaxKw ?? "Unknown"}</td>
            <td>{project.generationMinKwhPerYear ?? "Unknown"} to {project.generationMaxKwhPerYear ?? "Unknown"}</td>
            <td>{project.documents.length ? <details className={s.details}><summary>{project.documents.length} metadata records</summary>
              <ul className={s.documents}>{project.documents.map((document) => <li key={document.id}>
                <strong>{document.name}</strong><span>Version {document.version ?? "unknown"} / {document.review}</span>
                <span>{document.sizeBytes} bytes (metadata size only)</span><span>Audience: {document.audience}</span><span>Recorded at: {document.recordedAt}</span>
              </li>)}</ul></details> : "No metadata available in this scope"}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className={s.muted}>Original document bytes are unavailable and are not included. Metadata review does not attest to file contents.
        HTML and CSV are generated locally; download initiation is not recipient delivery.</p>
    </>}
  </Card>;
}
