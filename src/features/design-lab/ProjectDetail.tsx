"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import {
  JOURNEY_STAGES, VIABILITY_LABELS, formatNumber, investorVisible, isInterested,
  latestAssessment, money, needsReconfirmation, projectTasks, roleSites, shortDate, stageBlockers,
  stageName, visibleActivity, visibleDocuments,
  type Action, type Activity, type Assessment, type DemoDocument, type LabState,
  type ProjectTask, type Role, type Site, type Viability,
} from "./model";
import { useLab } from "./store";
import { FinancialSummary } from "./FinancialSummary";
import { SUBMISSION_STATUS_LABELS, actorLabel, compareRecordedTimes, currentFirstDocuments, submissionStatusTone, timestampLabel } from "./demoPresentation";
import { DocumentHistory } from "./DocumentHistory";
import { Button, Empty, Field, Icon, Modal, Pill, StageRibbon, ViabilityBadge } from "./ui";
import d from "./ProjectDetail.module.css";

type Dispatch = (action: Action, message?: string) => boolean;
type DetailTab = "overview" | "assessment" | "tasks" | "financial" | "notes" | "history";

interface DetailSlots {
  onDocuments?: (siteId: string) => void;
  onReport?: (siteId: string) => void;
  initialTaskId?: string;
}

interface ProjectDetailProps extends DetailSlots {
  siteId: string;
  role: Role;
  onClose: () => void;
  onEdit: (id: string) => void;
  onUnderwriting: (id: string) => void;
}

const DOC_LABELS: Record<DemoDocument["kind"], string> = {
  site_summary: "Site summary", ownership: "Ownership evidence", electricity_bill: "Electricity bill",
  photo: "Site photo", technical: "Technical document",
};

const DECISION_LABELS = { accept: "Accepted for project setup", reject: "Not accepted", request_info: "Information requested" };
const OUTCOMES = ["potentially_viable", "more_information_required", "not_currently_eligible"] as const;

function Timestamp({ value }: { value: string }) {
  return <time dateTime={value || undefined} title={value || undefined}>{timestampLabel(value)}</time>;
}

function Section({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  const id = useId();
  return <section className={d.section} aria-labelledby={id}><header><p className={d.microLabel}>{eyebrow}</p><h3 id={id}>{title}</h3></header>{children}</section>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className={d.meta}><span className={d.microLabel}>{label}</span><strong>{value}</strong></div>;
}

function StatusStage({ site }: { site: Site }) {
  return <div className={d.statusStage}>
    <div className={d.statusRow}>
      <div><span className={d.microLabel}>Submission status</span><Pill tone={submissionStatusTone(site.status)}>{SUBMISSION_STATUS_LABELS[site.status]}</Pill></div>
      <div><span className={d.microLabel}>Project stage</span><Pill>{site.stage ? stageName(site.stage) : site.status === "accepted" ? "Awaiting project setup" : "Project not started"}</Pill></div>
      <div><span className={d.microLabel}>Investor publication</span><Pill tone={investorVisible(site) ? "accent" : "neutral"}>{investorVisible(site) ? "Published to demo investors" : "Not published"}</Pill></div>
    </div>
    {site.stage && <StageRibbon site={site} />}
  </div>;
}

function rangeLabel(range: [number, number] | null | undefined, unit: string, divisor = 1) {
  return range ? `${formatNumber(range[0] / divisor, 2)}-${formatNumber(range[1] / divisor, 2)} ${unit}` : "Not calculated";
}

function Ranges({ assessment }: { assessment: Assessment | undefined }) {
  return <div className={d.ranges}>
    <div className={d.range}><span>Illustrative system capacity</span><strong>{rangeLabel(assessment?.capacity, "kW")}</strong></div>
    <div className={d.range}><span>Illustrative annual generation</span><strong>{rangeLabel(assessment?.generation, "MWh/year", 1000)}</strong></div>
  </div>;
}

function AssessmentRecord({ assessment, title }: { assessment: Assessment; title: string }) {
  return <article className={d.assessmentRecord} aria-label={title}>
    <h4>{title}</h4><ViabilityBadge result={assessment.result} />
    <dl className={d.provenance}>
      <div><dt>Source</dt><dd>Synthetic browser scenario; selected fixture, not an inference</dd></div>
      <div><dt>Provider</dt><dd>Unavailable: no approved endpoint or identity configuration</dd></div>
      <div><dt>Fixture version</dt><dd>{assessment.version}</dd></div>
      <div><dt>Recorded at</dt><dd><Timestamp value={assessment.createdAt} /></dd></div>
      <div><dt>Record</dt><dd>{assessment.id}</dd></div>
    </dl>
    <Ranges assessment={assessment} />
  </article>;
}

function assessmentChanges(before: Assessment, after: Assessment) {
  const sameRange = (left: Assessment["capacity"], right: Assessment["capacity"]) =>
    left === null || right === null ? left === right : left[0] === right[0] && left[1] === right[1];
  const fields = [
    { label: "Outcome", before: VIABILITY_LABELS[before.result], after: VIABILITY_LABELS[after.result], changed: before.result !== after.result },
    { label: "Capacity", before: rangeLabel(before.capacity, "kW"), after: rangeLabel(after.capacity, "kW"), changed: !sameRange(before.capacity, after.capacity) },
    { label: "Annual generation", before: rangeLabel(before.generation, "MWh/year", 1000), after: rangeLabel(after.generation, "MWh/year", 1000), changed: !sameRange(before.generation, after.generation) },
    { label: "Fixture version", before: before.version, after: after.version, changed: before.version !== after.version },
    { label: "Factors", before: before.factors.join("; ") || "Not recorded", after: after.factors.join("; ") || "Not recorded", changed: JSON.stringify(before.factors) !== JSON.stringify(after.factors) },
    { label: "Flags", before: before.flags.join("; ") || "Not recorded", after: after.flags.join("; ") || "Not recorded", changed: JSON.stringify(before.flags) !== JSON.stringify(after.flags) },
  ];
  return fields.filter((field) => field.changed);
}

function DecisionHistory({ site, role }: { site: Site; role: Role }) {
  const decisions = site.decisions ?? [];
  const current = decisions.at(-1);
  return <Section title="Human decision" eyebrow="Separate from the assessment">
    <p className={d.muted}>A fixture outcome is not a human decision, solar approval or a probability of completion.</p>
    {current ? <>
      <div className={d.historyTop}><Pill>{DECISION_LABELS[current.decision]}</Pill><Timestamp value={current.at} /></div>
      {role !== "investor" && <p className={d.savedText}>{current.note}</p>}
      {needsReconfirmation(site) && <p className={d.warning}>The assessment or evidence has changed since this decision. Its history is preserved; a fresh confirmation is required for setup, advancement or new publication.</p>}
    </> : <p className={d.muted}>{site.decisions === undefined ? "This legacy save has no human decision history. Its status is retained, not reconstructed as an approval." : "No human decision has been recorded."}</p>}
    {role !== "investor" && decisions.length > 0 && <details className={d.disclosure}>
      <summary>Human decision history ({decisions.length})</summary>
      <ol className={d.historyList}>{[...decisions].reverse().map((decision, index) => <li key={`${decision.at}-${index}`}>
        <strong>{DECISION_LABELS[decision.decision]}</strong><Timestamp value={decision.at} />
        <p className={d.savedText}>{decision.note}</p>
        <small>Assessment: {decision.assessmentId ?? "Not recorded"} / evidence revision {decision.evidenceRevision}</small>
      </li>)}</ol>
    </details>}
    {role === "investor" && <p className={d.muted}>Decision rationale and owner-only evidence are not disclosed in this investor preview.</p>}
  </Section>;
}

function AssessmentPanel({ site, role, dispatch, slots, onReview }: {
  site: Site; role: Role; dispatch: Dispatch; slots: DetailSlots; onReview: () => void;
}) {
  const original = site.assessments[0];
  const current = latestAssessment(site);
  const previous = site.assessments.at(-2);
  const changes = previous && current ? assessmentChanges(previous, current) : [];
  return <div className={d.stack}>
    <Section title="Assessment, with its limits" eyebrow="Illustrative policy; not solar-expert approved">
      {site.assessmentError && <p className={d.warning} role="alert">{site.assessmentError}</p>}
      {original && current ? <>
        <div className={d.assessmentGrid}>
          <AssessmentRecord assessment={original} title="Immutable original fixture" />
          <AssessmentRecord assessment={current} title="Current selected-fixture outcome" />
        </div>
        {previous && <div className={d.comparison} role="group" aria-label="Latest assessment comparison">
          <h4>{changes.length ? "Changed since the previous assessment" : "No material fixture change"}</h4>
          {changes.length ? <dl className={d.provenance}>{changes.map((change) => <div key={change.label}>
            <dt>{change.label}</dt><dd><span>Before: {change.before}</span><span>After: {change.after}</span></dd>
          </div>)}</dl> : <p>Outcome, ranges, factors, flags and version match the previous record. A new dated record is still retained.</p>}
        </div>}
        <h4 className={d.subhead}>Supporting fixture factors</h4>
        {current.factors.length ? <ul className={d.factorList}>{current.factors.map((factor, index) => <li key={index}>{factor}</li>)}</ul> : <p className={d.muted}>No supporting factors were recorded.</p>}
        <h4 className={d.subhead}>Open screening flags</h4>
        {current.flags.length ? <ul className={d.flagList}>{current.flags.map((flag, index) => <li key={index}><Icon name="help" size={14} />{flag}</li>)}</ul> : <p className={d.muted}>No flags recorded. That does not establish a clear or verified site.</p>}
        <details className={d.disclosure}>
          <summary>Assessment record history ({site.assessments.length})</summary>
          <ol className={d.historyList}>{[...site.assessments].reverse().map((assessment) => <li key={assessment.id}>
            <div className={d.historyTop}><ViabilityBadge result={assessment.result} /><Timestamp value={assessment.createdAt} /></div>
            <small>{assessment.version} / {assessment.id}</small>
            {role === "operator" && assessment.overrideReason && <p className={d.savedText}>Operator rerun rationale: {assessment.overrideReason}</p>}
          </li>)}</ol>
        </details>
      </> : <p className={d.muted}>No assessment is recorded. This is unknown, not a negative screening result. Return to the owner intake for an initial illustrative scenario.</p>}
      <div className={d.fixture}><Icon name="help" size={16} /><p>Source values are fixed UI fixtures, not calculated from the site inputs. No provider, automatic image rescreen or live project conversion is connected.</p></div>
      <details className={d.disclosure}>
        <summary>Unknowns and evidence boundaries</summary>
        <ul className={d.factorList}>
          <li>Grid interconnection and solar offtake: not verified.</li>
          <li>Site control, roof structure and exact address: not verified.</li>
          <li>Environmental constraints, imagery and geospatial layers: unavailable.</li>
          <li>Task completeness is a checklist count, never a calibrated success probability.</li>
        </ul>
      </details>
    </Section>
    <DecisionHistory site={site} role={role} />
    {role === "operator" && <>
      {needsReconfirmation(site) && <Button icon="arrow" onClick={onReview}>Go to review confirmation</Button>}
      <RerunPanel site={site} dispatch={dispatch} />
    </>}
    <Section title="Reviewed drafts and reports" eyebrow="A separate artifact">
      <p className={d.muted}>Draft editing, report review and scoped HTML/CSV exports live in the report workspace. Opening it does not review an assessment or deliver a document.</p>
      {slots.onReport ? <Button icon="file" onClick={() => slots.onReport?.(site.id)}>Open project reports</Button> : <p className={d.muted}>The report destination is not available from this entry.</p>}
    </Section>
  </div>;
}

function ReviewPanel({ site, dispatch }: { site: Site; dispatch: Dispatch }) {
  const [decision, setDecision] = useState<"accept" | "reject" | "request_info">("accept");
  const [note, setNote] = useState("");
  const id = useId();
  const submit = () => {
    const messages: Record<typeof decision, string> = {
      accept: "Demo submission accepted. Project setup and publication have not started.",
      reject: "Demo submission not accepted. The rationale is visible to its demo owner.",
      request_info: "Example owner request recorded. No external message was sent.",
    };
    if (dispatch({ type: "review", id: site.id, decision, note }, messages[decision])) setNote("");
  };
  return <Section title="Review this submission" eyebrow="A deliberate human decision">
    <form className={d.form} onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <fieldset className={d.choiceGroup}><legend>Decision</legend><div className={d.choices}>
        {([["accept", "Accept"], ["request_info", "Request info"], ["reject", "Decline"]] as const).map(([value, label]) =>
          <label key={value} className={`${d.choice} ${decision === value ? d.choiceOn : ""}`}>
            <input type="radio" name={id} value={value} checked={decision === value} onChange={() => setDecision(value)} />{label}
          </label>)}
      </div></fieldset>
      <Field label="Decision note (required)" hint="Shared with the demo site owner. Do not enter private operator notes here.">
        <textarea required value={note} onChange={(event) => setNote(event.target.value)} placeholder="State the evidence considered and your rationale" />
      </Field>
      <p className={d.muted}>{decision === "accept" ? "Acceptance records a disposition only. Start pre-development separately, then decide whether to publish." :
        decision === "request_info" ? "This creates a project-scoped request for the owner. It does not send a message or trigger screening." :
          "This records a declined submission and its rationale. It is not a determination about a real property."}</p>
      <Button type="submit" variant="primary" icon="check" disabled={!note.trim()}>Record decision</Button>
      {!note.trim() && <p className={d.hint}>A rationale is required for every decision.</p>}
    </form>
  </Section>;
}

function ReviewConfirmation({ site, dispatch }: { site: Site; dispatch: Dispatch }) {
  const [note, setNote] = useState("");
  const required = needsReconfirmation(site);
  return <Section title="Confirm the current review" eyebrow={required ? "Changes require a new human confirmation" : "Decision history unavailable"}>
    <p className={d.muted}>{required ? "Review the latest fixture and evidence metadata. This appends a decision linked to the current revisions; earlier human decisions stay unchanged." :
      "The saved acceptance has no decision record. You can record a current, explicitly illustrative review without inventing historical approval."}</p>
    <form className={d.form} onSubmit={(event) => {
      event.preventDefault();
      if (dispatch({ type: "confirm-review", id: site.id, note }, "Human review confirmed for the current demo revisions. Stage and publication are unchanged.")) setNote("");
    }}>
      <Field label="Review confirmation rationale" hint="Shared with the demo owner, not an internal note."><textarea required value={note} onChange={(event) => setNote(event.target.value)} /></Field>
      <Button type="submit" variant="primary" disabled={!note.trim()}>Confirm current review</Button>
    </form>
  </Section>;
}

function LifecyclePanel({ site, dispatch, onTasks }: { site: Site; dispatch: Dispatch; onTasks: () => void }) {
  const accepted = site.status === "accepted";
  const stageIndex = JOURNEY_STAGES.findIndex((stage) => stage.id === site.stage);
  const nextStage = site.stage ? JOURNEY_STAGES[stageIndex + 1] : undefined;
  const blockers = stageBlockers(site);
  const reconfirm = needsReconfirmation(site);
  const canPublish = accepted && stageIndex >= 2;
  const blockerId = useId();
  return <>
    <Section title="Project lifecycle" eyebrow="Illustrative project-specific gates">
      <p className={d.muted}>Tasks below are demo policy, not universal legal or solar requirements. No action here creates a live service project, moves funds or proves completed physical work.</p>
      {!accepted ? <p className={d.muted}>An accepted human review is needed before project setup. Assessment outcome alone does not start a project.</p> :
        !site.stage ? <>
          <p>Accepted; project setup has not started.</p>
          <Button variant="primary" icon="plus" disabled={reconfirm} aria-describedby={blockerId}
            onClick={() => dispatch({ type: "start-project", id: site.id }, "Pre-development started in the synthetic scenario. Investor publication remains separate.")}>Start pre-development</Button>
          <p id={blockerId} className={reconfirm ? d.hint : d.muted}>{reconfirm ? "Reconfirm the changed assessment or evidence before starting." : "This explicitly starts pre-development and adds its named example task. It does not publish the project."}</p>
        </> : stageIndex >= 2 && nextStage ? <>
          <div className={d.controlRow}><div><span className={d.microLabel}>Next stage</span><strong>{nextStage.name}</strong></div>
            <Button variant="primary" icon="arrow" disabled={blockers.length > 0} aria-describedby={blockerId}
              onClick={() => dispatch({ type: "advance", id: site.id }, `Demo project moved to ${nextStage.name.toLowerCase()}. Publication is unchanged.`)}>Move to {nextStage.name.toLowerCase()}</Button>
          </div>
          <div id={blockerId}>{blockers.length ? <>
            <h4 className={d.subhead}>Before this stage can move</h4>
            <ul className={d.flagList}>{blockers.map((blocker) => <li key={blocker}><Icon name="lock" size={14} />{blocker}</li>)}</ul>
            <Button variant="ghost" onClick={onTasks}>Review project tasks</Button>
          </> : <p className={d.muted}>No recorded example prerequisite blocks the next stage. Advancement still requires this explicit command.</p>}</div>
        </> : site.stage === "operations" ? <p className={d.muted}>Operations is the final example stage. No device-control or live operating data is available.</p> :
          <p className={d.warning}>This saved stage is not eligible for project advancement. The existing stage is retained; no automatic conversion is available.</p>}
    </Section>
    <Section title="Investor publication" eyebrow="Independent of review and lifecycle">
      <p className={d.muted}>Publication controls the fictional investor listing only. It does not resolve tasks, approve evidence, create interest or commit funding.</p>
      {canPublish || (accepted && site.stage && site.visible) ? <>
        <Button variant={site.visible ? "secondary" : "primary"} icon={site.visible ? "lock" : "eye"}
          disabled={!site.visible && reconfirm}
          onClick={() => dispatch({ type: "visibility", id: site.id, visible: !site.visible }, site.visible ? "Demo investor listing hidden." : "Published to the synthetic investor listing. No funding or external delivery occurred.")}>
          {site.visible ? "Hide from investors" : "Publish to investors"}
        </Button>
        {!site.visible && reconfirm && <p className={d.hint}>Reconfirm the current review before publishing. Hiding an existing listing remains available.</p>}
      </> : <p className={d.muted}>Accept the submission and explicitly start pre-development before publication is available.</p>}
      {site.visible && !investorVisible(site) && <p className={d.warning}>The saved visibility flag is on, but this status or stage does not permit an investor listing.</p>}
    </Section>
  </>;
}

function AssignPanel({ site, dispatch }: { site: Site; dispatch: Dispatch }) {
  const initialAssignee = site.assignee === "Unassigned" ? "" : site.assignee;
  const [assignee, setAssignee] = useState(initialAssignee);
  const [nextAction, setNextAction] = useState(site.nextAction);
  const [targetDate, setTargetDate] = useState(site.targetDate);
  const dirty = assignee !== initialAssignee || nextAction !== site.nextAction || targetDate !== site.targetDate;
  return <Section title="Assignment and next step" eyebrow="Fictional coordination">
    <form className={d.form} onSubmit={(event) => {
      event.preventDefault();
      dispatch({ type: "assign", id: site.id, assignee, nextAction, targetDate }, "Demo assignment and next action updated. No notification was sent.");
    }}>
      <div className={d.formGrid}>
        <Field label="Assigned to" hint="A fictional label, not an authenticated team lookup."><input value={assignee} onChange={(event) => setAssignee(event.target.value)} placeholder="Example reviewer" /></Field>
        <Field label="Target date" hint="Planning date only; no event is scheduled."><input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></Field>
      </div>
      <Field label="Next action" hint="Visible to the demo owner. Use Private notes for internal context."><input value={nextAction} onChange={(event) => setNextAction(event.target.value)} /></Field>
      <Button type="submit" icon="check" disabled={!dirty}>Save assignment</Button>
      <p className={d.muted}>Assignment does not review a task or change the decision, stage or publication.</p>
    </form>
  </Section>;
}

function RerunPanel({ site, dispatch }: { site: Site; dispatch: Dispatch }) {
  const [result, setResult] = useState<Viability>(latestAssessment(site)?.result ?? "more_information_required");
  const [reason, setReason] = useState("");
  const id = useId();
  return <Section title="Choose a manual rerun" eyebrow="Local fixture, not a provider request">
    <p className={d.muted}>Consider the evidence first, select an illustrative outcome and explain why another record is useful. Uploading evidence never runs this action.</p>
    <form className={d.form} onSubmit={(event) => {
      event.preventDefault();
      if (dispatch({ type: "rerun", id: site.id, result, reason }, "Manual fixture record appended. Original assessment and human decisions were preserved.")) setReason("");
    }}>
      <fieldset className={d.choiceGroup}><legend>Selected fixture outcome</legend><div className={d.choices}>
        {OUTCOMES.map((value) => <label key={value} className={`${d.choice} ${result === value ? d.choiceOn : ""}`}>
          <input type="radio" name={id} checked={result === value} onChange={() => setResult(value)} />{VIABILITY_LABELS[value]}
        </label>)}
      </div></fieldset>
      <Field label="Rerun reason (required)" hint="Retained as operator-only assessment context."><textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="What new or duplicate evidence did you consider?" /></Field>
      <Button type="submit" icon="reset" disabled={!site.assessments.length || !reason.trim()}>Record manual rerun</Button>
      <p className={d.muted}>No inference, paid request or automatic improvement occurs. Even an unchanged fixture creates a new assessment revision; accepted projects require explicit human reconfirmation.</p>
    </form>
    <details className={d.disclosure}>
      <summary>Try the failure state</summary>
      <p className={d.muted}>This records a simulated error without adding an assessment. The last successful result and all decisions remain intact. No provider is called.</p>
      <Button disabled={!site.assessments.length} onClick={() => dispatch({ type: "screen-failure", id: site.id }, "Simulated rerun failure recorded; the last successful assessment is still shown.")}>Simulate rerun failure</Button>
    </details>
    {!site.assessments.length && <p className={d.hint}>An initial saved assessment is required before a rerun or failure example.</p>}
  </Section>;
}

function NotesPanel({ site, dispatch }: { site: Site; dispatch: Dispatch }) {
  const [text, setText] = useState("");
  const [noteId, setNoteId] = useState<string | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const notes = site.notes ?? [];
  const editing = notes.find((note) => note.id === noteId);
  const discard = () => { setText(""); setNoteId(null); };
  const changed = text.trim() !== (editing?.text ?? "");
  return <Section title="Private typed notes" eyebrow="Operator-only preview records">
    <p className={d.muted}>Write, correct or discard text before saving. This does not decide, rerun, advance or publish a project. Microphone capture and transcription are unavailable.</p>
    <form className={d.form} onSubmit={(event) => {
      event.preventDefault();
      if (dispatch({ type: "save-note", id: site.id, text, ...(noteId ? { noteId } : {}) }, noteId ? "Private demo note corrected. Its earlier text remains in revision history." : "Private typed note recorded in this demo.")) discard();
    }}>
      <Field label={noteId ? "Correct private note" : "New private note"} hint="Visible only in the operator preview, not in owner or investor views.">
        <textarea ref={editor} required value={text} onChange={(event) => setText(event.target.value)} />
      </Field>
      <div className={d.engage}>
        <Button type="submit" icon="check" disabled={!text.trim() || !changed || Boolean(noteId && !editing)}>{noteId ? "Save note correction" : "Save private note"}</Button>
        {(text || noteId) && <Button variant="ghost" onClick={discard}>{noteId ? "Cancel correction" : "Discard note draft"}</Button>}
      </div>
      {noteId && !editing && <p className={d.warning}>The note is no longer in this project. Cancel this correction and select an existing note.</p>}
    </form>
    {notes.length ? <ul className={d.noteList}>{[...notes].reverse().map((note, index) => <li key={note.id}>
      <div className={d.controlRow}><strong>Private note {notes.length - index}</strong><Button variant="ghost" onClick={() => { setNoteId(note.id); setText(note.text); editor.current?.focus(); }} aria-label={`Edit private note ${notes.length - index}`}>Edit note</Button></div>
      <p className={d.savedText}>{note.text}</p>
      <small>Created <Timestamp value={note.createdAt} /> / updated <Timestamp value={note.updatedAt} /></small>
      {note.previous.length > 0 && <details className={d.disclosure}>
        <summary>Prior revisions ({note.previous.length})</summary>
        <ol className={d.historyList}>{[...note.previous].reverse().map((revision, revisionIndex) => <li key={`${revision.at}-${revisionIndex}`}>
          <Timestamp value={revision.at} /><p className={d.savedText}>{revision.text}</p>
        </li>)}</ol>
      </details>}
    </li>)}</ul> : <p className={d.muted}>{site.notes === undefined ? "This legacy save has no typed-note records. Older note events, if any, remain in operator-only activity." : "No private typed notes yet."}</p>}
  </Section>;
}

function TaskCard({ task, site, role, dispatch, selected, active }: {
  task: ProjectTask; site: Site; role: Role; dispatch: Dispatch; selected: boolean; active: boolean;
}) {
  const [note, setNote] = useState("");
  const ref = useRef<HTMLElement>(null);
  const id = useId();
  const matching = site.documents.filter((doc) => doc.taskId === task.id || (task.documentKind !== null && doc.kind === task.documentKind));
  const evidenceReady = task.kind !== "evidence" || matching.some((doc) => doc.review === "reviewed");
  const reviewed = task.status === "reviewed";
  useEffect(() => {
    if (!active || !selected) return;
    let current = true;
    // The ancestor dialog opens in its effect; defer focus until it is open.
    queueMicrotask(() => { if (current) ref.current?.focus(); });
    return () => { current = false; };
  }, [active, selected]);
  return <article ref={ref} tabIndex={-1} aria-labelledby={id} className={`${d.task} ${selected ? d.selectedTask : ""}`}>
    {selected && <span className={d.microLabel}>Linked action-center task</span>}
    <div className={d.controlRow}><h4 id={id}>{task.title}</h4><Pill tone={reviewed ? "positive" : "warning"}>{reviewed ? "Example task reviewed" : task.status === "provided" ? "Provided; review pending" : "Requested"}</Pill></div>
    <p className={d.muted}>{task.kind === "evidence" ? "Evidence task" : "Human review task"} / {task.requiredForStage ? `Example prerequisite for ${stageName(task.requiredForStage).toLowerCase()}` : "Site-specific request; no stage gate recorded"}</p>
    {task.note && <p className={d.savedText}>{task.note}</p>}
    {task.kind === "evidence" && !reviewed && <p className={evidenceReady ? d.muted : d.hint}>
      {evidenceReady ? "Matching metadata has an explicit review. The task still needs its own reasoned review." :
        matching.length ? "Matching metadata is present but has not been reviewed. Review it separately below before reviewing this task." :
          "No matching reviewed metadata. Add metadata in project documents, linked to this request or its requested document kind."}
    </p>}
    {task.kind === "review" && !reviewed && <p className={d.muted}>This example requires a deliberate review, not an upload or signature.</p>}
    {role === "operator" && !reviewed && <form className={d.form} onSubmit={(event) => {
      event.preventDefault();
      if (dispatch({ type: "task-review", id: site.id, taskId: task.id, note }, "Example task review recorded. Stage, assessment and publication are unchanged.")) setNote("");
    }}>
      <Field label={`Review rationale for ${task.title}`} hint="Required; visible to the demo owner."><textarea required value={note} onChange={(event) => setNote(event.target.value)} /></Field>
      <Button type="submit" icon="check" disabled={!note.trim() || !evidenceReady}>Record task review</Button>
    </form>}
    {role === "site-owner" && !reviewed && <p className={d.muted}>The operator records this review. Opening the request or adding metadata does not complete it.</p>}
  </article>;
}

function EvidencePanel({ site, state, role, dispatch, slots, active }: {
  site: Site; state: LabState; role: Role; dispatch: Dispatch; slots: DetailSlots; active: boolean;
}) {
  const tasks = role === "investor" ? [] : projectTasks(site);
  const docs = currentFirstDocuments(visibleDocuments(state, site, role));
  return <div className={d.stack}>
    {role !== "investor" && <Section title="Project tasks" eyebrow="Canonical action center / illustrative policy">
      <p className={d.muted}>{tasks.length ? `${tasks.filter((task) => task.status === "reviewed").length} of ${tasks.length} named example tasks reviewed.` : "No named tasks are recorded; a completion denominator is unavailable."} This is not a project-success probability.</p>
      {slots.initialTaskId && !tasks.some((task) => task.id === slots.initialTaskId) && <p className={d.warning}>The linked task is no longer available in this project. Its other tasks are shown without changing any state.</p>}
      {tasks.map((task) => <TaskCard key={task.id} task={task} site={site} role={role} dispatch={dispatch} selected={task.id === slots.initialTaskId} active={active} />)}
    </Section>}
    <Section title={role === "investor" ? "Permitted evidence metadata" : "Document metadata"} eyebrow="No file bytes available">
      <p className={d.muted}>A metadata review checks the displayed record only. It does not open, scan, validate or read a file, review a task, or rerun screening.</p>
      {docs.length ? <ul className={d.docList}>{docs.map((doc) => {
        const replacement = docs.find((candidate) => candidate.replacesId === doc.id);
        const previous = docs.find((candidate) => candidate.id === doc.replacesId);
        return <li key={doc.id} className={d.docRow}>
          <span className={d.docIcon}><Icon name="file" size={16} /></span>
          <div className={d.docMain}>
            <strong>{doc.name}</strong>
            <small>{DOC_LABELS[doc.kind]} / declared size {formatNumber(doc.size)} bytes / {doc.version ? `version ${doc.version}` : "Version not recorded"}</small>
            <small>Added <Timestamp value={doc.createdAt} /></small>
            <span>{doc.review === "reviewed" ? "Metadata reviewed only" : "Metadata review not recorded"}</span>
            {doc.reviewedAt && <small>Reviewed <Timestamp value={doc.reviewedAt} /></small>}
            {doc.replacesId && <small>{previous ? `Replaces metadata for ${previous.name}` : role === "investor" ? "Earlier representation is not available in this view" : `Replaces metadata record ${doc.replacesId}`}</small>}
            {replacement && <small>Superseded by {replacement.name}{replacement.version ? `, version ${replacement.version}` : ""}</small>}
            {role !== "investor" && <small>{doc.disclosure === "owner_private" ? "Owner-private metadata" : "Investor-shareable metadata after demo interest"}</small>}
            <DocumentHistory document={doc} site={site} role={role} />
          </div>
          {role === "operator" && doc.review !== "reviewed" && <Button aria-label={`Review metadata for ${doc.name}`}
            onClick={() => dispatch({ type: "document-review", id: site.id, documentId: doc.id }, "Metadata review recorded only. No file contents were read and no task was completed.")}>Review metadata</Button>}
        </li>;
      })}</ul> : <p className={d.muted}>{role === "investor" ? "No evidence metadata is permitted in this view." : "No document metadata has been recorded for this project."}</p>}
      {slots.onDocuments ? <Button icon="file" onClick={() => slots.onDocuments?.(site.id)}>Open project documents</Button> : <p className={d.muted}>The project documents destination is not available from this entry.</p>}
      <p className={d.muted}>File selection, replacement and draft creation belong to the project documents workspace. There is no original-file download here.</p>
    </Section>
  </div>;
}

function FinancialContext({ onOpen }: { onOpen: () => void }) {
  return <Section title="Financial context" eyebrow="Not calculated for this project">
    <p className={d.muted}>Owner benefit, project payback and investor return are not calculated. Actual outcomes remain unmeasured.
      Review their distinct units and missing inputs without treating a comparison fixture as this project&apos;s forecast.</p>
    <Button icon="chart" onClick={onOpen}>View financial context</Button>
  </Section>;
}

function TaskSummary({ site, onTasks }: { site: Site; onTasks: () => void }) {
  const tasks = projectTasks(site);
  return <div className={d.nextAction}>
    <span className={d.microLabel}>Project-scoped action center</span>
    <p>{tasks.length ? `${tasks.filter((task) => task.status === "reviewed").length} of ${tasks.length} named example tasks reviewed` : "No named tasks; completion is unknown"}</p>
    <Button icon="arrow" onClick={onTasks}>Open project tasks</Button>
  </div>;
}

function OwnerOverview({ site, onEdit, onTasks, onFinance }: { site: Site; onEdit: (id: string) => void; onTasks: () => void; onFinance: () => void }) {
  const canResume = ["draft", "info_requested"].includes(site.status);
  const notices = visibleActivity(site, "site-owner").filter((event) => event.kind === "owner_interest" && event.scope === "owner");
  return <div className={d.stack}>
    <Section title="Where things stand" eyebrow="Your selected fictional project">
      <StatusStage site={site} />
      <div className={d.nextAction}><span className={d.microLabel}>Next expected step</span><p>{site.nextAction || "No next action has been recorded."}</p></div>
      {canResume && <Button variant="primary" icon="arrow" onClick={() => onEdit(site.id)}>{site.status === "draft" ? "Resume this draft" : "Update and resubmit"}</Button>}
      <TaskSummary site={site} onTasks={onTasks} />
      <Meta label="Your recorded goals" value={site.ownerGoals?.length ? site.ownerGoals.join("; ") : "Not recorded"} />
      <p className={d.muted}>The publication badge is separate from interest, funding and agreement status.</p>
    </Section>
    <Section title="Owner interest notices" eyebrow="Minimal in-app history">
      {notices.length ? <ul className={d.noteList}>{[...notices].reverse().map((event) => <li key={event.id}>
        <strong>New non-binding project interest</strong><Timestamp value={event.at} />
        <p>An investor expressed interest in this fictional project. No commitment or funding has occurred.</p>
      </li>)}</ul> : <p className={d.muted}>No owner interest notice has been recorded.</p>}
      <p className={d.muted}>No investor identity, contact or amount is disclosed. Notices are historical; withdrawal does not erase them. Nothing is sent outside this preview.</p>
    </Section>
    <FinancialContext onOpen={onFinance} />
    {site.acknowledgement && <p className={d.fixture}>A typed-name simulation was recorded on {shortDate(site.acknowledgement.at)}. It is not a signature, utility authorization or executed agreement.</p>}
  </div>;
}

function OperatorOverview({ site, dispatch, onTasks, onFinance }: { site: Site; dispatch: Dispatch; onTasks: () => void; onFinance: () => void }) {
  return <div className={d.stack}>
    <Section title="Work and decisions" eyebrow="Selected fictional site">
      <StatusStage site={site} />
      <div className={d.metaGrid}>
        <Meta label="Assigned to" value={site.assignee || "Unassigned"} />
        <Meta label="Next action" value={site.nextAction || "Not recorded"} />
        <Meta label="Target date" value={site.targetDate ? shortDate(site.targetDate) : "Not set"} />
        <Meta label="Owner goals" value={site.ownerGoals?.length ? site.ownerGoals.join("; ") : "Not recorded; follow-up needed"} />
      </div>
      <TaskSummary site={site} onTasks={onTasks} />
    </Section>
    {["submitted", "screening"].includes(site.status) && <ReviewPanel site={site} dispatch={dispatch} />}
    {site.status === "info_requested" && <p className={d.muted}>An owner response and deliberate resubmission are needed before another submission decision. Metadata review remains a separate action.</p>}
    {site.status === "accepted" && (needsReconfirmation(site) || !site.decisions?.length) && <ReviewConfirmation site={site} dispatch={dispatch} />}
    <LifecyclePanel site={site} dispatch={dispatch} onTasks={onTasks} />
    <AssignPanel key={`${site.assignee}:${site.nextAction}:${site.targetDate}`} site={site} dispatch={dispatch} />
    <FinancialContext onOpen={onFinance} />
  </div>;
}

function InterestForm({ site, dispatch }: { site: Site; dispatch: Dispatch }) {
  const open = site.fundingNeeds.filter((need) => need.status === "open");
  const [target, setTarget] = useState("project");
  const validTarget = target === "project" || open.some((need) => need.id === target);
  const express = () => {
    dispatch(target === "project" ? { type: "interest", id: site.id } : { type: "interest", id: site.id, fundingNeedId: target },
      "Non-binding demo interest recorded with a separate minimal owner notice. No capital was reserved.");
  };
  return <Section title="Express interest" eyebrow="Non-binding browser preview">
    {(open.length > 0 || target !== "project") && <Field label="Direct your interest to">
      <select value={target} onChange={(event) => setTarget(event.target.value)}>
        <option value="project">The overall project</option>
        {open.map((need) => <option key={need.id} value={need.id}>{need.title}</option>)}
      </select>
    </Field>}
    {!validTarget && <p className={d.warning}>That example funding need is no longer open. Choose an available target before recording interest.</p>}
    <Button variant="primary" icon="heart" disabled={!validTarget} onClick={express}>Express non-binding interest</Button>
    <p className={d.muted}>This reveals only permitted fixture details and shareable document metadata, never private owner records or file bytes. The demo owner sees a separate notice without your identity, contact or amount. You can withdraw; nothing is signed, funded or sent externally.</p>
  </Section>;
}

function InvestorOverview({ site, state, dispatch, onUnderwriting, onFinance }: { site: Site; state: LabState; dispatch: Dispatch; onUnderwriting: (id: string) => void; onFinance: () => void }) {
  const interested = isInterested(state, site.id);
  const endowment = state.mandate.investorType === "special_community_endowment";
  const open = site.fundingNeeds.filter((need) => need.status === "open");
  const assessment = latestAssessment(site);

  return <div className={d.stack}>
    <div className={d.tierBar}>
      <Pill tone={interested ? "positive" : "neutral"}>{interested ? "Permitted detail / demo interest" : "Published summary / before interest"}</Pill>
    </div>
    <Section title="Project at a glance" eyebrow="Non-sensitive summary">
      <StatusStage site={site} />
      <div className={d.metaGrid}>
        <Meta label="Coarse example locality" value={`${site.locality}${site.region !== "unknown" ? `, ${site.region}` : " / region unknown"}`} />
        <Meta label="Type" value={site.type === "rooftop" ? "Rooftop" : "Land"} />
        <Meta label="Screening outcome" value={assessment ? VIABILITY_LABELS[assessment.result] : "Not screened; unknown"} />
      </div>
      <Ranges assessment={assessment} />
      <p className={d.muted}>Fixed synthetic values, not an input-derived forecast. Exact address, owner identity, usage and private inputs are withheld.</p>
    </Section>
    {interested ? <>
      <Section title="Illustrative funding needs" eyebrow="Not an offer or commitment">
        {open.length ? <ul className={d.needs}>{open.map((need) => <li key={need.id}><strong>{need.title}</strong><span>{need.amount === null ? "Amount not scoped" : `${money(need.amount)} / illustrative USD`}</span></li>)}</ul> : <p className={d.muted}>No open example funding need is recorded.</p>}
        <p className={d.muted}>An unknown amount is not zero. No funds are received, committed, reserved or released by this preview.</p>
      </Section>
      <Section title="Your engagement" eyebrow="Non-binding and reversible">
        <p className={d.muted}>Your demo interest is recorded. Withdrawal removes the permitted-detail access but preserves truthful owner-notice history.</p>
        <div className={d.engage}>
          {endowment && <Button icon="chart" onClick={() => onUnderwriting(site.id)}>Open illustrative scenario</Button>}
          <Button variant="ghost" icon="close" onClick={() => dispatch({ type: "withdraw", id: site.id }, "Demo interest withdrawn. Permitted-detail access closed; historical owner notices are retained.")}>Withdraw interest</Button>
        </div>
        {endowment && <p className={d.muted}>The scenario destination is an illustration, not underwriting approval or a connected model.</p>}
      </Section>
    </> : <InterestForm site={site} dispatch={dispatch} />}
    <FinancialContext onOpen={onFinance} />
    <Section title="Your impact preferences" eyebrow="Not measured project outcomes">
      <p>{state.mandate.impact.length ? state.mandate.impact.join("; ") : "No impact preferences recorded."}</p>
      <p className={d.muted}>Preferences do not establish project eligibility, carbon savings, verified community benefit or actual returns.</p>
    </Section>
  </div>;
}

function HistoryPanel({ site, role }: { site: Site; role: Role }) {
  const events = visibleActivity(site, role).filter((event) => {
    if (role === "operator") return true;
    if (role === "investor") return event.kind === "submission" || event.kind === "stage" || event.kind === "interest";
    return !["note", "override", "interest", "owner_interest", "visibility"].includes(event.kind);
  }).sort((a, b) => compareRecordedTimes(a.at, b.at) || b.id.localeCompare(a.id));
  return <Section title={role === "operator" ? "Project activity, including private events" : "Permitted project updates"} eyebrow="Recorded synthetic history">
    {events.length ? <ol className={d.timeline}>{events.map((event: Activity) => <li key={event.id}>
      <span className={d.timeDot} />
      <div>
        <strong>{event.kind === "acknowledgement" ? "Typed-name simulation recorded" : event.title}</strong>
        <small>{actorLabel(event.actor)} / <Timestamp value={event.at} />{role === "operator" ? ` / ${event.scope} scope` : ""}</small>
        <p className={d.savedText}>{event.kind === "acknowledgement" ? "A demo acknowledgement only; not a legal signature, utility authorization or executed agreement." : event.detail}</p>
      </div>
    </li>)}</ol> : <p className={d.muted}>No permitted events are recorded for this project.</p>}
  </Section>;
}

function ProjectWorkspace({ site, state, role, dispatch, onEdit, onUnderwriting, slots }: {
  site: Site; state: LabState; role: Role; dispatch: Dispatch;
  onEdit: (id: string) => void; onUnderwriting: (id: string) => void; slots: DetailSlots;
}) {
  const id = useId();
  const [tab, setTab] = useState<DetailTab>(slots.initialTaskId && role !== "investor" ? "tasks" : "overview");
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const interested = role === "investor" && isInterested(state, site.id);
  const extended = role !== "investor" || interested;
  const tabs: { id: DetailTab; label: string }[] = [
    { id: "overview", label: role === "operator" ? "Work & decisions" : "Overview" },
    ...(extended ? [
      { id: "assessment" as const, label: "Assessment" },
      { id: "tasks" as const, label: role === "investor" ? "Evidence" : "Tasks & evidence" },
    ] : []),
    { id: "financial", label: "Financial context" },
    ...(extended ? [
      ...(role === "operator" ? [{ id: "notes" as const, label: "Private notes" }] : []),
      { id: "history" as const, label: "Activity" },
    ] : []),
  ];
  const active = tabs.some((item) => item.id === tab) ? tab : "overview";
  const command: Dispatch = (action, message) => {
    const applied = dispatch(action, message);
    setFeedback(applied ? { error: false, text: message ?? "Applied to this synthetic browser session." } :
      { error: true, text: "The action was not applied. Review the current project state and blockers before trying again. Your draft input has been kept." });
    return applied;
  };
  const activateTab = (next: DetailTab) => {
    setTab(next);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  };
  const keyboardTab = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 :
      (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    if (next) activateTab(next.id);
  };
  const panel = (panelId: DetailTab) => {
    switch (panelId) {
      case "overview":
        return role === "operator" ? <OperatorOverview site={site} dispatch={command} onTasks={() => activateTab("tasks")} onFinance={() => activateTab("financial")} /> :
          role === "site-owner" ? <OwnerOverview site={site} onEdit={onEdit} onTasks={() => activateTab("tasks")} onFinance={() => activateTab("financial")} /> :
            <InvestorOverview site={site} state={state} dispatch={command} onUnderwriting={onUnderwriting} onFinance={() => activateTab("financial")} />;
      case "assessment": return <AssessmentPanel site={site} role={role} dispatch={command} slots={slots} onReview={() => activateTab("overview")} />;
      case "tasks": return <EvidencePanel site={site} state={state} role={role} dispatch={command} slots={slots} active={active === "tasks"} />;
      case "financial": return <FinancialSummary site={site} role={role} />;
      case "notes": return role === "operator" ? <NotesPanel site={site} dispatch={command} /> : null;
      case "history": return <HistoryPanel site={site} role={role} />;
    }
  };
  return <div className={d.workspace}>
    <p className={d.preview}>Synthetic browser preview. No connected authentication, assessment provider or operational service is available.</p>
    <div className={d.tabs} role="tablist" aria-label="Project detail sections">
      {tabs.map((item, index) => <button type="button" role="tab" key={item.id}
        id={`${id}-tab-${item.id}`} aria-controls={`${id}-panel-${item.id}`} aria-selected={active === item.id}
        tabIndex={active === item.id ? 0 : -1} className={active === item.id ? d.activeTab : ""}
        onClick={() => activateTab(item.id)} onKeyDown={(event) => keyboardTab(event, index)}>{item.label}</button>)}
    </div>
    {feedback && <p className={feedback.error ? d.warning : d.feedback} role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}
    {tabs.map((item) => <div key={item.id} role="tabpanel" tabIndex={0} className={d.panel}
      id={`${id}-panel-${item.id}`} aria-labelledby={`${id}-tab-${item.id}`} hidden={active !== item.id}>{panel(item.id)}</div>)}
  </div>;
}

export function ProjectDetail({ siteId, role, onClose, onEdit, onUnderwriting, ...slots }: ProjectDetailProps) {
  const { state, dispatch } = useLab();
  const site = roleSites(state, role).find((item) => item.id === siteId);
  if (!site) return <Modal key={`${role}-${siteId}-denied`} title="Project unavailable" onClose={onClose} drawer>
    <Empty title="This project is not available in your preview" icon="lock">
      {role === "site-owner" ? "Only the owner-scoped examples are available. Close this panel and choose a site from My sites." :
        role === "investor" ? "Only currently published projects are available. Unpublishing ends investor access, including after interest." :
          "The project may have been reset. Close this panel and select another project."}
    </Empty>
  </Modal>;
  if (role === "investor" && !state.mandate.completed) return <Modal key={`${siteId}-mandate`} title="Investment mandate required" onClose={onClose} drawer>
    <Empty title="Complete your mandate first" icon="sliders">Finish the fictional investment mandate before viewing detail or expressing interest. This does not establish a real investor identity.</Empty>
  </Modal>;

  const eyebrow = `${site.locality}${site.region !== "unknown" ? `, ${site.region}` : " / region unknown"} / ${site.type === "rooftop" ? "Rooftop" : "Land"} example`;
  const wide = role === "operator";
  return <Modal key={`${role}-${site.id}-${slots.initialTaskId ?? ""}`} title={site.name} eyebrow={eyebrow} onClose={onClose} wide={wide} drawer={!wide}>
    <ProjectWorkspace site={site} state={state} role={role} dispatch={dispatch} onEdit={onEdit} onUnderwriting={onUnderwriting} slots={slots} />
  </Modal>;
}
