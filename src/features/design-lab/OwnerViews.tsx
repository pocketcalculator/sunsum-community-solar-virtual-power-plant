"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent, RefObject } from "react";
import {
  VIABILITY_LABELS, defaultProfile, formatNumber, investorVisible, isInterested, latestAssessment,
  makeDraft, missingFields, needsReconfirmation, newId, projectTasks, roleSites, shortDate, stageName, visibleDocuments,
  type DemoDocument, type DemoProfile, type ProjectTask, type Role, type Site, type Viability,
} from "./model";
import { OwnerGoalsField, hasOwnerIntent, ownershipPreferenceLabel } from "./ProfileView";
import { ProjectCollection } from "./ProjectCollection";
import { documentFamilies, timestampLabel } from "./demoPresentation";
import { DocumentHistory } from "./DocumentHistory";
import { useLab } from "./store";
import { Button, Card, Empty, Field, Icon, Modal, Pill } from "./ui";
import s from "./Lab.module.css";
import c from "./OwnerViews.module.css";

type PillTone = "neutral" | "positive" | "warning" | "danger" | "accent";
type DocumentKind = DemoDocument["kind"];
type FileMetadata = Pick<File, "name" | "size">;

const MAX_METADATA_BYTES = 10 * 1024 * 1024;
const FORMAT_HINT = "PDF, JPG, PNG, DOCX, or XLSX; up to 10 MiB (10,485,760 bytes). Live file upload is unavailable.";

const ACCEPTED_TYPES: { ext: string; mime: string }[] = [
  { ext: "pdf", mime: "application/pdf" },
  { ext: "jpg", mime: "image/jpeg" },
  { ext: "jpeg", mime: "image/jpeg" },
  { ext: "png", mime: "image/png" },
  { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
];
const ACCEPT_ATTRIBUTE = [".pdf", ".jpg", ".jpeg", ".png", ".docx", ".xlsx"].join(",");

const DOC_KINDS: [DocumentKind, string][] = [
  ["ownership", "Proof of ownership"],
  ["electricity_bill", "Electricity bill"],
  ["photo", "Site or roof photo"],
  ["technical", "Technical document"],
  ["site_summary", "Site summary"],
];
const DOC_KIND_LABEL: Record<DocumentKind, string> = {
  ownership: "Proof of ownership",
  electricity_bill: "Electricity bill",
  photo: "Site or roof photo",
  technical: "Technical document",
  site_summary: "Site summary",
};

const OWNERSHIP_OPTIONS: [Site["ownership"], string][] = [
  ["confirmed", "I own it or have written authority"],
  ["pending", "Confirmation is in progress"],
  ["unverified", "Not sure yet"],
];

const SCENARIOS: { id: Viability; icon: string; tone: PillTone; note: string }[] = [
  { id: "potentially_viable", icon: "check", tone: "positive", note: "Shows an encouraging result with an example size and production range." },
  { id: "more_information_required", icon: "help", tone: "warning", note: "Shows a result that asks for a little more detail before proceeding." },
  { id: "not_currently_eligible", icon: "close", tone: "danger", note: "Shows a site that falls outside the demo screening criteria." },
];

const STEPS: { title: string; hint: string }[] = [
  { title: "Site & contact", hint: "Where it is and who to reach" },
  { title: "Site details", hint: "Ownership, area, and usage" },
  { title: "Documents", hint: "Requests and optional metadata" },
  { title: "Review & submit", hint: "Screening scenario and consent" },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${formatNumber(size / 1024, 0)} KiB`;
  return `${formatNumber(size / (1024 * 1024), 1)} MiB`;
}

function fileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? (parts.pop() ?? "").toLowerCase() : "";
}

function validateMetadata(file: File): string | null {
  const ext = fileExtension(file.name);
  const known = ACCEPTED_TYPES.find((type) => type.ext === ext);
  if (!known) return `"${file.name}" is not a supported type. Accepted: PDF, JPG, PNG, DOCX, or XLSX.`;
  if (file.type && file.type !== known.mime) {
    return `The browser-reported file type does not match the .${ext} extension. Choose a matching fictional file.`;
  }
  if (file.size === 0) return `"${file.name}" appears to be empty.`;
  if (file.size > MAX_METADATA_BYTES) return `The preview limit is 10 MiB (10,485,760 bytes). "${file.name}" exceeds it.`;
  return null;
}

function toDocument(file: FileMetadata, kind: DocumentKind, disclosure: DemoDocument["disclosure"], context: { taskId?: string; replacement?: DemoDocument } = {}): DemoDocument {
  return {
    id: newId("doc"), name: file.name, kind, size: file.size, disclosure,
    createdAt: new Date().toISOString(), version: (context.replacement?.version ?? (context.replacement ? 1 : 0)) + 1,
    review: "unreviewed",
    ...(context.replacement ? { replacesId: context.replacement.id } : {}),
    ...(context.taskId ? { taskId: context.taskId } : {}),
  };
}

function MetadataPicker({ onPick, inputRef }: { onPick: (file: FileMetadata | null) => void; inputRef?: RefObject<HTMLInputElement | null> }) {
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (!files || !file) return;
    const problem = files.length !== 1 ? "Choose one fictional file at a time." : validateMetadata(file);
    setError(problem);
    if (problem) { onPick(null); return; }
    onPick({ name: file.name, size: file.size });
  };
  return <div className={c.picker} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
    event.preventDefault();
    pick(event.dataTransfer.files);
  }}>
    <Field label="Choose a file" hint={FORMAT_HINT}>
      <input ref={inputRef} className={c.fileInput} type="file" accept={ACCEPT_ATTRIBUTE} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={(event) => {
        pick(event.target.files);
        event.target.value = "";
      }} />
    </Field>
    <p className={c.noteText}>Or drop one fictional file here. Only its name, size, and declared document type are kept; no contents are read.</p>
    {error && <div className={c.errors} role="alert" id={errorId}><p><Icon name="close" size={15} />{error}</p></div>}
  </div>;
}

function matchesTask(doc: DemoDocument, task: ProjectTask) {
  return doc.taskId ? doc.taskId === task.id : task.documentKind !== null && doc.kind === task.documentKind;
}

function TaskStatus({ task }: { task: ProjectTask }) {
  return <Pill tone={task.status === "reviewed" ? "positive" : task.status === "provided" ? "accent" : "warning"}>
    {task.status === "reviewed" ? "Operator-reviewed task (demo)" : task.status === "provided" ? "Provided; review pending" : "Requested"}
  </Pill>;
}

function PublicationBadge({ site }: { site: Site }) {
  return <Pill tone={investorVisible(site) ? "accent" : "neutral"}><Icon name={investorVisible(site) ? "eye" : "lock"} size={12} />{investorVisible(site) ? "Published in demo portfolio" : "Not published"}</Pill>;
}

function EvidenceRequests({ site, selectedTaskId, onAdd }: { site: Site; selectedTaskId?: string; onAdd?: (task: ProjectTask) => void }) {
  const tasks = projectTasks(site).filter((task) => selectedTaskId ? task.id === selectedTaskId : true);
  if (!tasks.length) return <p className={c.noteText}>No evidence has been requested for this site. Optional metadata is not a submission requirement.</p>;
  return <div>
    <p className={c.blockLabel}>Project requests</p>
    <p className={c.noteText}>These are this project&apos;s example tasks, not a universal checklist. Adding or opening metadata never completes a review.</p>
    <div className={c.requestList}>{tasks.map((task) => {
      const matching = site.documents.filter((doc) => matchesTask(doc, task));
      return <article key={task.id} className={`${c.requestItem} ${task.id === selectedTaskId ? c.requestSelected : ""}`} aria-label={`Request: ${task.title}`}>
        <div className={c.requestHead}><h3>{task.title}</h3><TaskStatus task={task} /></div>
        {task.note && <p>{task.note}</p>}
        <p>{task.kind === "review" ? "An operator review, not a file request." : matching.length
          ? `${matching.length} matching metadata version${matching.length === 1 ? "" : "s"} recorded. File contents have not been reviewed.`
          : "No matching metadata recorded yet."}</p>
        {task.requiredForStage && <small>Example prerequisite for {stageName(task.requiredForStage)}.</small>}
        {task.kind === "evidence" && onAdd && <Button variant="secondary" icon="plus" onClick={() => onAdd(task)}>Add metadata for this request</Button>}
      </article>;
    })}</div>
  </div>;
}

function ContextualEvidence({ site, profile }: { site: Site; profile: DemoProfile }) {
  return <details className={c.contextHelp}>
    <summary>Which evidence might help?</summary>
    <ul>
      <li>{site.ownership === "confirmed" ? "Your site-control answer is self-reported, not verified." : "If site control is still being confirmed, a deed, lease, or authority explanation may help a specific operator request."}</li>
      <li>{site.type === "land" ? "A land photo or site plan can add context if requested." : "A roof photo can add context if requested; it cannot establish structural suitability."}</li>
      {site.existingSolar && <li>An existing installation may need a technical record; the operator decides what applies.</li>}
      {profile.participant === "organization" && <li>Your profile describes an organization. Organization authority or financial evidence is only considered for a relevant, explicit request, never required for every owner.</li>}
    </ul>
    <p>Insurance is not mandatory proof. No registry lookup or legal verification is performed. Use fictional metadata, not actual personal or organization records.</p>
  </details>;
}

function UtilityPreview({ onManual }: { onManual: () => void }) {
  return <section className={c.utility} aria-label="Utility data options">
    <div className={c.requestHead}><h3>Utility data: manual for now</h3><Pill>Not connected</Pill></div>
    <p>No utility provider is configured. Add fictional bill metadata if useful; partial history is allowed and there is no universal 12-month minimum.</p>
    <details className={c.contextHelp}>
      <summary>What utility consent would cover</summary>
      <dl className={c.utilityTerms}>
        <div><dt>Purpose</dt><dd>Understand energy use for a site review, not control devices.</dd></div>
        <div><dt>Provider and coverage</dt><dd>Unavailable. No provider or jurisdiction coverage has been established.</dd></div>
        <div><dt>Data scope</dt><dd>A future handoff must specify bills, meters, intervals, and the requested period. This preview retrieves none of them.</dd></div>
        <div><dt>Recipients</dt><dd>No recipient is configured; nothing is sent from this preview.</dd></div>
        <div><dt>Duration and revocation</dt><dd>Provider terms and a revocation route would be required before a live authorization. Nothing has been authorized here.</dd></div>
        <div><dt>Separate agreements</dt><dd>An NDA, a utility release, site-control evidence, and a lease or ownership agreement are different. Submission consent or a typed demo acknowledgement signs none of them.</dd></div>
      </dl>
      <p>This is a non-executing consent explanation, not a legal form. Never enter utility passwords here.</p>
    </details>
    <Button variant="secondary" icon="file" onClick={onManual}>Use manual bill metadata</Button>
  </section>;
}

function usageLabel(site: Site): string {
  if (site.usage === null) return "Not provided";
  return `${formatNumber(site.usage)} kWh / year`;
}

function ownershipLabel(value: Site["ownership"]): string {
  return OWNERSHIP_OPTIONS.find(([id]) => id === value)?.[1] ?? value;
}

function screeningLabel(site: Site) {
  const assessment = latestAssessment(site);
  return assessment ? VIABILITY_LABELS[assessment.result] : "Not screened";
}

function statusPill(site: Site): { tone: PillTone; label: string } {
  if (site.status === "draft") return { tone: "neutral", label: "Draft" };
  if (site.status === "info_requested") return { tone: "warning", label: "Action needed" };
  if (site.status === "accepted") return { tone: "positive", label: site.stage ? stageName(site.stage) : "Accepted; project not started" };
  if (site.status === "rejected") return { tone: "danger", label: "Not accepted" };
  return { tone: "accent", label: "In review" };
}

/* -------------------------------------------------------------------------- */
/* Intake                                                                     */
/* -------------------------------------------------------------------------- */

interface IntakeViewProps {
  initialSite?: Site | undefined;
  onComplete: (id: string) => void;
  onExit: () => void;
}

export function IntakeView({ initialSite, onComplete, onExit }: IntakeViewProps) {
  const { state, ready } = useLab();
  if (!ready) return <p role="status">Restoring your browser draft...</p>;
  const permitted = initialSite ? roleSites(state, "site-owner").find((site) => site.id === initialSite.id) : undefined;
  if (initialSite && !permitted) return <Empty title="Site unavailable in this owner view" action={<Button onClick={onExit}>Return to My sites</Button>}>No site details have been opened or changed.</Empty>;
  if (permitted && !["draft", "info_requested"].includes(permitted.status)) return <Empty title="This intake is no longer editable" action={<Button onClick={onExit}>Return to My sites</Button>}>Open the project to see its current review state. Documents can be added separately without resubmitting.</Empty>;
  return <IntakeForm key={permitted?.id ?? "new"} {...(permitted ? { initialSite: permitted } : {})} profile={state.profile ?? defaultProfile()} onComplete={onComplete} onExit={onExit} />;
}

function intakeErrors(site: Site, index: number): string[] {
  if (index === 0) return [
    site.name.trim() ? "" : "Add a name for this site.",
    site.contactName.trim() ? "" : "Add a fictional contact name.",
    EMAIL_PATTERN.test(site.contactEmail) ? "" : "Enter a valid fictional contact email.",
    site.address.trim() ? "" : "Add the fictional site address.",
  ].filter(Boolean);
  if (index === 1) return [
    site.area !== null && Number.isFinite(site.area) && site.area > 0 ? "" : "Enter a usable area greater than 0 m².",
    site.usage !== null && (!Number.isFinite(site.usage) || site.usage < 0) ? "Annual electricity use must be finite and non-negative." : "",
  ].filter(Boolean);
  return [];
}

function resumeStep(site?: Site) {
  if (!site || intakeErrors(site, 0).length) return 0;
  if (intakeErrors(site, 1).length) return 1;
  return site.status === "info_requested" || !site.consent ? 2 : 3;
}

function IntakeForm({ initialSite, profile, onComplete, onExit }: IntakeViewProps & { profile: DemoProfile }) {
  const { state, dispatch, notify } = useLab();
  const [draft, setDraft] = useState<Site>(() => initialSite ? { ...initialSite } : {
    ...makeDraft(),
    contactName: profile.completed ? profile.name : "",
    ownerGoals: hasOwnerIntent(profile.intents) ? [...profile.ownerGoals] : [],
  });
  const [sourceRevision] = useState(initialSite?.revision ?? 0);
  const [originalDocumentIds] = useState(() => new Set(initialSite?.documents.map((doc) => doc.id) ?? []));
  const [step, setStep] = useState(() => resumeStep(initialSite));
  const [maxStep, setMaxStep] = useState(() => resumeStep(initialSite));
  const [attempted, setAttempted] = useState<Set<number>>(new Set());
  const [scenario, setScenario] = useState<Viability>("potentially_viable");
  const [docKind, setDocKind] = useState<DocumentKind>("ownership");
  const [requestId, setRequestId] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  const tasks = projectTasks(draft).filter((task) => task.kind === "evidence");
  const selectedRequest = tasks.find((task) => task.id === requestId);

  const editing = Boolean(initialSite);
  const resubmitting = initialSite?.status === "info_requested";
  const missing = missingFields(draft);

  useEffect(() => {
    if (previousStep.current !== step) heading.current?.focus();
    previousStep.current = step;
  }, [step]);

  const setField = <K extends keyof Site>(key: K, value: Site[K]) => {
    setSaveError(null);
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const setNumber = (key: "area" | "usage") => (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    if (raw === "") { setField(key, null); return; }
    const parsed = Number(raw);
    setField(key, Number.isNaN(parsed) ? null : parsed);
  };

  const currentErrors = intakeErrors(draft, step);
  const showErrors = attempted.has(step) && currentErrors.length > 0;

  const goTo = (index: number) => { if (index <= maxStep) { setStep(index); } };
  const back = () => setStep((current) => Math.max(0, current - 1));
  const next = () => {
    if (currentErrors.length) { setAttempted((prev) => new Set(prev).add(step)); return; }
    const target = Math.min(STEPS.length - 1, step + 1);
    setStep(target);
    setMaxStep((current) => Math.max(current, target));
  };

  const fillExample = () => setDraft((current) => ({
    ...current,
    name: current.name || "Peachtree porch rooftop",
    contactName: current.contactName || "Robin Example",
    contactEmail: current.contactEmail || "owner@example.invalid",
    address: current.address || "742 Example Ave, Atlanta, GA",
    ownership: current.ownership === "pending" ? "confirmed" : current.ownership,
    area: current.area ?? 1600,
    usage: current.usage ?? 42000,
  }));

  const addFile = (file: FileMetadata | null) => {
    if (!file) return;
    setDraft((current) => ({
      ...current,
      documents: [...current.documents, toDocument(file, docKind, "owner_private", requestId ? { taskId: requestId } : {})],
    }));
  };
  const removeDoc = (id: string) => setDraft((current) => ({ ...current, documents: current.documents.filter((doc) => doc.id !== id) }));

  const saveDraft = () => {
    const current = roleSites(state, "site-owner").find((site) => site.id === draft.id);
    if (initialSite && (!current || (current.revision ?? 0) !== sourceRevision)) {
      const message = "This site changed while you were editing. Return to My sites and reopen it before saving; the newer state has not been overwritten.";
      setSaveError(message);
      notify(message);
      return false;
    }
    const additions = draft.documents.filter((doc) => !current?.documents.some((saved) => saved.id === doc.id)).length;
    const saved = dispatch({ type: "save-site", site: { ...draft, evidenceRevision: (current?.evidenceRevision ?? 0) + additions } },
      "Draft saved in this browser. Resume it from My sites; file contents were not uploaded.");
    if (!saved) setSaveError("This site can no longer be edited here. Return to My sites to see its current state.");
    return saved;
  };
  const saveAndExit = () => {
    if (saveDraft()) onExit();
  };

  const submit = () => {
    if (missing.length) { setStep(3); setAttempted((prev) => new Set(prev).add(3)); return; }
    const saved = saveDraft();
    if (!saved) { notify("This site can no longer be edited here. Open it from My sites to see its current status."); return; }
    const submitted = dispatch(
      { type: "submit", id: draft.id, result: scenario },
      "Your site was submitted for illustrative screening. This is demo data saved in your browser.",
    );
    if (submitted) onComplete(draft.id);
  };

  return <div className={c.intake}>
    <div className={c.intakeHead}>
      <div>
        <p className={s.eyebrow}>{editing ? "Update your site" : "New solar site"}</p>
        <h1>{editing ? draft.name || "Update your site" : "Tell us about your space"}</h1>
        <p>A four-step fictional draft, saved only in this browser. No live screening, sign-in, geocoding, or utility service is connected.</p>
      </div>
      <div className={c.headActions}>
        <Button variant="ghost" icon="spark" onClick={fillExample}>Use example data</Button>
        <Button variant="secondary" icon="file" onClick={saveAndExit}>Save &amp; exit</Button>
      </div>
    </div>

    {resubmitting && projectTasks(draft).some((task) => task.status !== "reviewed") && <div className={c.requested}>
      <Icon name="inbox" size={20} className={c.requestedIcon} />
      <div>
        <h2>The operator asked for a few updates</h2>
        <ul>{projectTasks(draft).filter((task) => task.status !== "reviewed").map((task) => <li key={task.id}><Icon name="arrow" size={14} className={c.requestedIcon} />{task.title}</li>)}</ul>
      </div>
    </div>}

    <ol className={c.stepper} aria-label="Intake progress">
      {STEPS.map((entry, index) => {
        const done = index < step && intakeErrors(draft, index).length === 0;
        const state = index === step ? c.stepCurrent : done ? c.stepDone : "";
        return <li key={entry.title}>
          <button type="button" className={`${c.stepBtn} ${state}`} disabled={index > maxStep} aria-label={`Step ${index + 1}: ${entry.title}`} aria-current={index === step ? "step" : undefined} onClick={() => goTo(index)}>
            <span className={c.stepDot}>{done ? <Icon name="check" size={14} /> : String(index + 1).padStart(2, "0")}</span>
            <span className={c.stepText}><strong>{entry.title}</strong><small>{entry.hint}</small></span>
          </button>
        </li>;
      })}
    </ol>

    <Card>
      <div className={c.panel}>
        <div className={c.stepHeading}>
          <p>Step {step + 1} of {STEPS.length}</p>
          <h2 ref={heading} tabIndex={-1}>{STEPS[step]?.title}</h2>
        </div>

        {step === 0 && <>
          <div className={c.formGrid}>
            <Field label="Site name" className={c.spanFull} hint="A friendly label, e.g. “Sweet Auburn rooftop”.">
              <input value={draft.name} onChange={(event) => setField("name", event.target.value)} placeholder="Name this site" autoComplete="off" />
            </Field>
            <Field label="Contact name">
              <input value={draft.contactName} onChange={(event) => setField("contactName", event.target.value)} placeholder="Fictional contact" autoComplete="off" />
            </Field>
            <Field label="Contact email" hint="Use example.invalid for demos — no email is ever sent.">
              <input type="email" value={draft.contactEmail} onChange={(event) => setField("contactEmail", event.target.value)} placeholder="you@example.invalid" autoComplete="off" />
            </Field>
            <Field label="Site address" className={c.spanFull} hint="Kept as text only. This demo does not geocode or map addresses, so the map position stays empty and the neighborhood shows as pending.">
              <input value={draft.address} onChange={(event) => setField("address", event.target.value)} placeholder="Street, city, state" autoComplete="off" />
            </Field>
          </div>
          <fieldset className={c.radioSet}>
            <legend className={c.legend}>What kind of site is it?</legend>
            <div className={c.radioRow}>
              {([["rooftop", "Rooftop", "A roof on a home or building."], ["land", "Land", "Open ground or a canopy area."]] as const).map(([value, title, hint]) =>
                <label key={value} className={`${c.radioCard} ${draft.type === value ? c.radioCardOn : ""}`}>
                  <input type="radio" name="site-type" checked={draft.type === value} onChange={() => setField("type", value)} />
                  <span><strong>{title}</strong><small>{hint}</small></span>
                </label>)}
            </div>
          </fieldset>
        </>}

        {step === 1 && <>
          <fieldset className={c.radioSet}>
            <legend className={c.legend}>Ownership status</legend>
            <div className={c.radioRow}>
              {OWNERSHIP_OPTIONS.map(([value, label]) =>
                <label key={value} className={`${c.radioCard} ${draft.ownership === value ? c.radioCardOn : ""}`}>
                  <input type="radio" name="ownership" checked={draft.ownership === value} onChange={() => setField("ownership", value)} />
                  <span><strong>{label}</strong></span>
                </label>)}
            </div>
          </fieldset>
          <div className={c.formGrid}>
            <Field label="Usable area (m²)" hint="Approximate roof or land area available for panels.">
              <input inputMode="numeric" type="number" min={0} value={draft.area ?? ""} onChange={setNumber("area")} placeholder="e.g. 1800" />
            </Field>
            <Field label="Annual electricity use (kWh)" hint="Optional. From a recent bill, if you have it.">
              <input inputMode="numeric" type="number" min={0} value={draft.usage ?? ""} onChange={setNumber("usage")} placeholder="e.g. 48000" />
            </Field>
          </div>
          <label className={c.checkRow}>
            <input type="checkbox" checked={draft.existingSolar} onChange={(event) => setField("existingSolar", event.target.checked)} />
            <span><strong>There is already solar on this site</strong><small>Existing panels or a prior installation.</small></span>
          </label>
          <OwnerGoalsField value={draft.ownerGoals ?? []} onChange={(goals) => setField("ownerGoals", goals)} />
          <p className={c.noteText}>New sites carry forward applicable profile goals. Corrections stay with this site for the operator conversation; they do not finalize a project type.</p>
          {hasOwnerIntent(profile.intents) && <p className={c.noteText}>Profile ownership preference: {ownershipPreferenceLabel(profile.coOwnership)}. This is not a signed agreement or verified site-control evidence.</p>}
        </>}

        {step === 2 && <>
          <p className={c.noteText}>Record fictional document metadata, not actual documents. File contents are never read, uploaded, scanned, or stored. Selecting a file only changes this draft until you save.</p>
          <EvidenceRequests site={draft} onAdd={(task) => {
            setRequestId(task.id);
            if (task.documentKind) setDocKind(task.documentKind);
            fileRef.current?.focus();
          }} />
          <ContextualEvidence site={draft} profile={profile} />
          <UtilityPreview onManual={() => {
            setDocKind("electricity_bill");
            setRequestId(tasks.find((task) => task.documentKind === "electricity_bill" && task.status !== "reviewed")?.id ?? "");
            fileRef.current?.focus();
          }} />
          <div className={c.uploadForm}>
            {tasks.length > 0 && <Field label="Link to project request (optional)" className={c.spanFull}>
              <select value={requestId} onChange={(event) => {
                const task = tasks.find((entry) => entry.id === event.target.value);
                if (event.target.value && !task) { notify("That project request is no longer available."); return; }
                setRequestId(task?.id ?? "");
                if (task?.documentKind) setDocKind(task.documentKind);
              }}>
                <option value="">General site metadata</option>
                {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
              </select>
            </Field>}
            <Field label="Document type">
              <select value={docKind} disabled={selectedRequest?.documentKind !== null && selectedRequest?.documentKind !== undefined} onChange={(event) => {
                const chosen = DOC_KINDS.find(([kind]) => kind === event.target.value);
                if (chosen) setDocKind(chosen[0]);
                else notify("Choose an available document type.");
              }}>
                {DOC_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <MetadataPicker inputRef={fileRef} onPick={addFile} />
          </div>
          <p className={c.noteText}>New intake metadata stays private to the owner and operator. A separate, fictional non-sensitive representation can be added from Documents later; no automatic redaction takes place.</p>
          {draft.documents.length > 0
            ? <div className={c.docList}>{draft.documents.map((doc) => <div key={doc.id} className={c.docItem}>
                <span className={c.docIcon}><Icon name="file" size={18} /></span>
                <span className={c.docMeta}><strong>{doc.name}</strong><small>{DOC_KIND_LABEL[doc.kind]} · {formatBytes(doc.size)} · Version {doc.version ?? 1} · {doc.disclosure === "investor_tier_1" ? "Shareable metadata" : "Private metadata"}</small><small>{doc.review === "reviewed" ? "Metadata reviewed (demo), not file contents" : "Unreviewed metadata"}</small>{doc.taskId && <small>Request: {tasks.find((task) => task.id === doc.taskId)?.title ?? "Historical request"}</small>}</span>
                {!originalDocumentIds.has(doc.id) && <span className={c.docActions}><Button variant="ghost" icon="close" aria-label={`Remove ${doc.name}`} onClick={() => removeDoc(doc.id)}>Remove from draft</Button></span>}
              </div>)}</div>
            : <Empty title="No document metadata yet" icon="file">Metadata is optional for initial submission. Specific operator requests stay visible until explicitly reviewed.</Empty>}
        </>}

        {step === 3 && <>
          <dl className={c.review}>
            <div className={c.reviewItem}><dt>Site</dt><dd>{draft.name || "—"}</dd></div>
            <div className={c.reviewItem}><dt>Type</dt><dd>{draft.type === "rooftop" ? "Rooftop" : "Land"}</dd></div>
            <div className={c.reviewItem}><dt>Neighborhood</dt><dd>{draft.locality}</dd></div>
            <div className={c.reviewItem}><dt>Address</dt><dd>{draft.address || "—"}</dd></div>
            <div className={c.reviewItem}><dt>Ownership</dt><dd>{ownershipLabel(draft.ownership)}</dd></div>
            <div className={c.reviewItem}><dt>Usable area</dt><dd>{draft.area !== null && draft.area > 0 ? `${formatNumber(draft.area)} m²` : "—"}</dd></div>
            <div className={c.reviewItem}><dt>Annual use</dt><dd>{usageLabel(draft)}</dd></div>
            <div className={c.reviewItem}><dt>Existing solar</dt><dd>{draft.existingSolar ? "Yes" : "No"}</dd></div>
            <div className={c.reviewItem}><dt>Contact</dt><dd>{draft.contactName || "—"}{draft.contactEmail ? ` · ${draft.contactEmail}` : ""}</dd></div>
            <div className={c.reviewItem}><dt>Owner goals</dt><dd>{draft.ownerGoals?.join("; ") || "Not specified"}</dd></div>
            <div className={c.reviewItem}><dt>Documents</dt><dd>{draft.documents.length} metadata records; no file contents</dd></div>
          </dl>

          <div>
            <p className={c.subLabel}>Choose a screening scenario</p>
            <p className={c.noteText}>These are fixed demonstration outcomes, not a calculation from your inputs. Pick one to preview how each result looks. No screening coefficients are applied.</p>
            <div className={c.scenarioGrid} role="radiogroup" aria-label="Screening scenario">
              {SCENARIOS.map((entry) => <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={scenario === entry.id}
                className={`${c.scenario} ${scenario === entry.id ? c.scenarioOn : ""}`}
                onClick={() => setScenario(entry.id)}
              >
                <span className={c.scenarioHead}><Pill tone={entry.tone}><Icon name={entry.icon} size={12} />{VIABILITY_LABELS[entry.id]}</Pill>{scenario === entry.id && <Icon name="check" size={16} />}</span>
                <p>{entry.note}</p>
              </button>)}
            </div>
          </div>

          {missing.length > 0 && <div className={c.missing}>
            <strong className={c.subLabel}>Still needed before you can submit</strong>
            {missing.map((item) => <span key={item} className={c.missingItem}>
              <Icon name="help" size={15} />{item}
              {item !== "Submission consent" && <button type="button" className={c.missingLink} onClick={() => setStep(item.includes("area") || item.includes("electricity") ? 1 : 0)}>Fix</button>}
            </span>)}
          </div>}

          <label className={c.consent}>
            <input type="checkbox" checked={draft.consent} onChange={(event) => setField("consent", event.target.checked)} />
            <span>
              <strong>I consent to submitting this demo site</strong>
              <small>This records an illustrative submission only. No account is created and no data leaves your browser. This is not utility authorization, an NDA, a lease, or a legal signature.</small>
            </span>
          </label>
          <div className={c.persistNote}>
            <Icon name="lock" size={16} />
            <span>Everything you enter is stored locally in this browser using the demo&apos;s own storage key. Clearing your browser data or resetting the demo removes it. This is never a password field and no credentials are collected.</span>
          </div>
        </>}

        {showErrors && <div className={c.errors} role="alert">{currentErrors.map((error) => <p key={error}><Icon name="close" size={15} />{error}</p>)}</div>}
        {saveError && <div className={c.errors} role="alert"><p>{saveError}</p></div>}

        <div className={c.actions}>
          {step > 0 ? <Button variant="ghost" icon="chevron" onClick={back}>Back</Button> : <Button variant="ghost" onClick={onExit}>Cancel</Button>}
          <div className={c.actionsRight}>
            {step < STEPS.length - 1
              ? <Button variant="primary" icon="arrow" onClick={next}>Continue</Button>
              : <Button variant="primary" icon="check" disabled={missing.length > 0} onClick={submit}>{resubmitting ? "Resubmit site" : "Submit for screening"}</Button>}
          </div>
        </div>
      </div>
    </Card>
  </div>;
}

/* -------------------------------------------------------------------------- */
/* Owner sites gallery                                                        */
/* -------------------------------------------------------------------------- */

interface OwnerSitesViewProps {
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onNew: () => void;
  onDocuments?: (id: string) => void;
  onReports?: (id: string) => void;
}

export function OwnerSitesView({ onOpen, onEdit, onNew, onDocuments, onReports }: OwnerSitesViewProps) {
  const { state } = useLab();
  const sites = roleSites(state, "site-owner");
  const inProgress = sites.filter((site) => site.status === "draft" || site.status === "info_requested");

  return <div>
    <div className={s.pageHeading}>
      <div>
        <p className={s.eyebrow}>Fictional owner workspace</p>
        <h1>My sites</h1>
        <p>{sites.length} owner-visible site{sites.length === 1 ? "" : "s"}. Requests, publication, and project progress are separate.</p>
      </div>
      <Button variant="primary" icon="plus" onClick={onNew}>Add a solar site</Button>
    </div>

    {sites.length === 0 && <Empty title="No sites yet" icon="roof" action={<Button variant="primary" icon="plus" onClick={onNew}>Add your first site</Button>}>
      Add a rooftop or plot of land to start the community solar journey.
    </Empty>}

    {inProgress.length > 0 && <>
      <div className={c.groupLabel}><Icon name="inbox" size={18} /><h2>Pick up where you left off</h2></div>
      <div className={c.taskList}>{inProgress.map((site) => {
        const attention = site.status === "info_requested";
        const missing = missingFields(site).length;
        const requests = projectTasks(site).filter((task) => task.status !== "reviewed");
        return <article key={site.id} className={c.taskCard} aria-label={site.name || "Untitled draft"}>
          <span className={`${c.taskIcon} ${attention ? c.taskIconWarn : ""}`}><Icon name={attention ? "bell" : "file"} size={20} /></span>
          <div className={c.taskBody}>
            <h3>{site.name || "Untitled draft"}</h3>
            <p>{attention ? "The operator requested more information." : missing > 0 ? `${missing} detail${missing === 1 ? "" : "s"} still needed before submitting.` : "Ready to review and submit."}</p>
            {attention && requests.length > 0 && <ul className={c.outstanding}>{requests.map((task) => <li key={task.id}><Icon name="arrow" size={14} />{task.title} <TaskStatus task={task} /></li>)}</ul>}
            <div className={c.metaRow}><PublicationBadge site={site} /></div>
          </div>
          <div className={c.taskActions}>
            {attention && <Button variant="ghost" icon="diagonal" onClick={() => onOpen(site.id)}>View</Button>}
            <Button variant="primary" icon={attention ? "upload" : "arrow"} onClick={() => onEdit(site.id)}>{attention ? "Update & resubmit" : "Continue draft"}</Button>
          </div>
        </article>;
      })}</div>
    </>}

    {sites.length > 0 && <>
      <div className={c.groupLabel}><Icon name="roof" size={18} /><h2>All your fictional sites</h2></div>
      <ProjectCollection sites={sites} role="site-owner" onOpen={onOpen} {...(onDocuments ? { onDocuments } : {})} {...(onReports ? { onReports } : {})} />
    </>}
  </div>;
}

/* -------------------------------------------------------------------------- */
/* Owner action center / inbox                                                */
/* -------------------------------------------------------------------------- */

interface OwnerInboxViewProps {
  onEdit: (id: string) => void;
  onOpen: (id: string) => void;
  onDocuments?: (siteId: string, taskId?: string) => void;
}

export function OwnerInboxView({ onEdit, onOpen, onDocuments }: OwnerInboxViewProps) {
  const { state } = useLab();
  const sites = roleSites(state, "site-owner");
  const pendingTasks = sites.flatMap((site) => projectTasks(site).filter((task) => task.status !== "reviewed").map((task) => ({ site, task })));
  const needsAction = pendingTasks.filter(({ task }) => task.kind === "evidence");
  const operatorTasks = pendingTasks.filter(({ task }) => task.kind === "review");
  const inReview = sites.filter((site) => site.status === "screening" || site.status === "submitted");
  const nextUp = sites.filter((site) => site.status === "accepted");
  const drafts = sites.filter((site) => site.status === "draft");
  const notices = sites.flatMap((site) => site.activity
    .filter((event) => event.kind === "owner_interest" && event.scope === "owner")
    .map((event) => ({ site, event })))
    .sort((a, b) => b.event.at.localeCompare(a.event.at) || a.event.id.localeCompare(b.event.id));

  const nothing = pendingTasks.length === 0 && inReview.length === 0 && nextUp.length === 0 && drafts.length === 0 && notices.length === 0;

  return <div>
    <div className={s.pageHeading}>
      <div>
        <p className={s.eyebrow}>One place for your next steps</p>
        <h1>Action center</h1>
        <p>Your project requests, operator reviews, and minimal in-app interest notices. All activity is fictional.</p>
      </div>
    </div>

    {nothing && <Empty title="You&apos;re all caught up" icon="check">There&apos;s nothing waiting on you right now. New requests will show up here.</Empty>}

    {needsAction.length > 0 && <>
      <div className={c.groupLabel}><Icon name="bell" size={18} /><h2>Needs your attention</h2></div>
      <div className={c.taskList}>{needsAction.map(({ site, task }) => <article key={`${site.id}-${task.id}`} className={c.taskCard} aria-label={`${site.name}: ${task.title}`}>
        <span className={`${c.taskIcon} ${c.taskIconWarn}`}><Icon name="bell" size={20} /></span>
        <div className={c.taskBody}>
          <p>{site.name || "Untitled site"}</p>
          <h3>{task.title}</h3>
          {task.note && <p>{task.note}</p>}
          <div className={c.metaRow}><TaskStatus task={task} /><PublicationBadge site={site} /></div>
          {site.documents.some((doc) => matchesTask(doc, task)) && <p className={c.taskNote}>Matching metadata is recorded. The operator still reviews the request explicitly.</p>}
        </div>
        <div className={c.taskActions}>
          <Button variant="ghost" icon="diagonal" onClick={() => onOpen(site.id)}>View project</Button>
          {onDocuments
            ? <Button variant="primary" icon="file" onClick={() => onDocuments(site.id, task.id)}>Open requested documents</Button>
            : <Button variant="secondary" icon="file" onClick={() => onOpen(site.id)}>View request in project</Button>}
          {["draft", "info_requested"].includes(site.status) && <Button variant="ghost" onClick={() => onEdit(site.id)}>Update intake</Button>}
        </div>
      </article>)}</div>
    </>}

    {(inReview.length > 0 || operatorTasks.length > 0) && <>
      <div className={c.groupLabel}><Icon name="clock" size={18} /><h2>With the operator</h2></div>
      <div className={c.taskList}>
        {operatorTasks.map(({ site, task }) => <article key={task.id} className={c.taskCard} aria-label={`${site.name}: ${task.title}`}>
          <span className={c.taskIcon}><Icon name="clock" size={20} /></span>
          <div className={c.taskBody}><p>{site.name}</p><h3>{task.title}</h3><p>{task.note || "The operator owns this review."}</p><div className={c.metaRow}><TaskStatus task={task} /></div></div>
          <div className={c.taskActions}><Button onClick={() => onOpen(site.id)}>View review</Button></div>
        </article>)}
        {inReview.map((site) => <article key={site.id} className={c.taskCard} aria-label={`Submission review: ${site.name}`}>
        <span className={c.taskIcon}><Icon name="clock" size={20} /></span>
        <div className={c.taskBody}>
          <h3>{site.name || "Untitled site"}</h3>
          <p>{site.nextAction || "An operator will review your submission."}</p>
          <div className={c.metaRow}><span><Icon name="pin" size={13} />{site.locality}</span><span><Icon name="chart" size={13} />{screeningLabel(site)}</span></div>
        </div>
        <div className={c.taskActions}><Button variant="secondary" icon="diagonal" onClick={() => onOpen(site.id)}>View project</Button></div>
      </article>)}</div>
    </>}

    {nextUp.length > 0 && <>
      <div className={c.groupLabel}><Icon name="arrow" size={18} /><h2>What&apos;s next</h2></div>
      <div className={c.taskList}>{nextUp.map((site) => <article key={site.id} className={c.taskCard} aria-label={`Next step: ${site.name}`}>
        <span className={`${c.taskIcon} ${c.taskIconOk}`}><Icon name="check" size={20} /></span>
        <div className={c.taskBody}>
          <h3>{site.name || "Untitled site"}</h3>
          <p>{site.nextAction || "No next action has been recorded."}</p>
          <div className={c.metaRow}><span><Icon name="pipeline" size={13} />{site.stage ? stageName(site.stage) : "Accepted; awaiting project setup"}</span>{site.targetDate && <span><Icon name="clock" size={13} />Example target {shortDate(site.targetDate)}</span>}<span><Icon name="people" size={13} />{site.assignee}</span><PublicationBadge site={site} /></div>
          {needsReconfirmation(site) && <p className={c.taskNote}>Changed evidence or assessment needs an explicit operator reconfirmation.</p>}
        </div>
        <div className={c.taskActions}><Button variant="secondary" icon="diagonal" onClick={() => onOpen(site.id)}>View project</Button></div>
      </article>)}</div>
    </>}

    {drafts.length > 0 && <>
      <div className={c.groupLabel}><Icon name="file" size={18} /><h2>Continue a draft</h2></div>
      <div className={c.taskList}>{drafts.map((site) => <article className={c.taskCard} key={site.id} aria-label={`Draft: ${site.name || "Untitled site"}`}>
        <span className={c.taskIcon}><Icon name="file" /></span><div className={c.taskBody}><h3>{site.name || "Untitled site"}</h3><p>Saved answers and metadata remain in this browser.</p></div>
        <Button onClick={() => onEdit(site.id)}>Continue draft</Button>
      </article>)}</div>
    </>}

    <section aria-label="Owner interest notices">
      <div className={c.groupLabel}><Icon name="bell" size={18} /><h2>Interest notices</h2></div>
      <p className={c.noteText}>Historical, nonbinding notices only. Publication is a separate badge; neither state indicates funding. Investor identity, contact details, and amounts are not shared.</p>
      {notices.length ? <div className={c.taskList}>{notices.map(({ site, event }) => <article key={`${site.id}-${event.id}`} className={c.taskCard}>
        <span className={c.taskIcon}><Icon name="heart" /></span>
        <div className={c.taskBody}><h3>{site.name}</h3><p>An investor expressed nonbinding interest in this fictional project.</p><div className={c.metaRow}><time dateTime={event.at || undefined} title={event.at || undefined}>{timestampLabel(event.at)}</time><span>Historical notice; not current funding or a commitment</span></div></div>
        <Button onClick={() => onOpen(site.id)}>View project</Button>
      </article>)}</div> : <p className={c.noteText}>No owner interest notices have been recorded.</p>}
    </section>
  </div>;
}

/* -------------------------------------------------------------------------- */
/* Documents                                                                  */
/* -------------------------------------------------------------------------- */

interface DocumentsViewProps {
  role: Role;
  onOpen: (id: string) => void;
  siteId?: string;
  taskId?: string;
  onDraft?: (siteId: string) => void;
}

interface DocumentSelection {
  taskId?: string;
  replacesId?: string;
  kind?: DocumentKind;
}

interface UploadTarget extends DocumentSelection {
  siteId: string;
}

export function DocumentsView(props: DocumentsViewProps) {
  return <DocumentsWorkspace key={JSON.stringify([props.role, props.siteId, props.taskId])} {...props} />;
}

function DocumentsWorkspace({ role, onOpen, siteId, taskId, onDraft }: DocumentsViewProps) {
  const { state, ready } = useLab();
  const [uploadFor, setUploadFor] = useState<UploadTarget | null>(null);
  const [query, setQuery] = useState("");
  const permitted = roleSites(state, role);
  const selected = siteId === undefined ? undefined : permitted.find((site) => site.id === siteId);
  const sites = siteId === undefined ? permitted : selected ? [selected] : [];
  const selectedTask = role !== "investor" && selected && taskId !== undefined ? projectTasks(selected).find((task) => task.id === taskId) : undefined;
  const uploadSite = role !== "investor" ? sites.find((site) => site.id === uploadFor?.siteId) : undefined;

  if (!ready) return <p role="status">Restoring permitted document metadata...</p>;
  if (siteId !== undefined && !selected) return <Empty title="Project unavailable in this view" icon="lock">Choose a permitted project from the workspace selector. No documents from another project have been substituted.</Empty>;
  if (taskId !== undefined && !selectedTask) return <Empty title="Document request unavailable" icon="lock" {...(selected ? { action: <Button onClick={() => onOpen(selected.id)}>Open project</Button> } : {})}>
    {role === "investor" ? "Owner and operator requests are not exposed in the investor view." : "Choose the request again from its project's Action center. A task must belong to the selected project."}
  </Empty>;

  const heading: Record<Role, { eyebrow: string; title: string; blurb: string }> = {
    "site-owner": { eyebrow: "Your project evidence", title: "Documents", blurb: "Follow specific requests, record fictional metadata, and see operator review states." },
    operator: { eyebrow: "Origination records", title: "Documents", blurb: "Inspect metadata and version history. Explicit metadata and task reviews live in the project workspace." },
    investor: { eyebrow: "Permitted diligence metadata", title: "Documents", blurb: "Only shareable preview metadata for published projects with active interest is shown. Private originals stay hidden." },
  };
  const copy = heading[role];
  const groups = sites.filter((site) => `${site.name} ${visibleDocuments(state, site, role).map((doc) => doc.name).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));

  return <div>
    <div className={s.pageHeading}>
      <div>
        <p className={s.eyebrow}>{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p>{copy.blurb}</p>
        <p className={c.scopeLabel}>{selected ? `Project: ${selected.name || "Untitled site"}` : `All ${sites.length} permitted fictional projects`}{selectedTask ? ` / Request: ${selectedTask.title}` : ""}</p>
      </div>
    </div>

    <div className={c.persistNote}><Icon name="lock" size={18} /><span>Metadata only. No files are uploaded, scanned, or available for download. A metadata review is not a review of document contents or a legal approval. Older entries without a version are shown as legacy version 1.</span></div>
    <details className={c.retentionBoundary}><summary>Extraction and retention are different decisions</summary>
      <p>A future authorized service might extract only necessary fields. That would not decide whether original files or earlier versions must be retained, minimized or removed. Those require a separate approved policy and authority.</p>
      <p>This demo records selected fictional filenames and metadata only. It does not extract, redact, delete original bytes, or implement a retention policy. Generated briefing/report exports are separate artifacts, never original-file downloads.</p>
    </details>
    <Field label="Search document groups"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Permitted property or filename" /></Field>
    <p className={c.noteText}>{groups.length} of {sites.length} permitted property groups. Expand a group to work with its current metadata; earlier versions remain available separately.</p>
    {!onDraft && <p className={c.noteText}>The separate drafts and reports workspace is unavailable from this view. Document metadata is not a generated report.</p>}

    {sites.length === 0 && <Empty title={role === "investor" ? "No projects to show yet" : "No sites yet"} icon="file">
      {role === "investor" ? "Only projects published to this fictional investor workspace can appear here." : "Add a fictional site to start recording document metadata."}
    </Empty>}

    <div className={c.docGroups}>
      {groups.map((site, index) => <DocumentGroup key={site.id} site={site} role={role} onOpen={onOpen} expanded={!!selected || index === 0}
        {...(selectedTask ? { task: selectedTask } : {})}
        {...(onDraft ? { onDraft } : {})}
        onUpload={(selection) => setUploadFor({ siteId: site.id, ...selection })} />)}
    </div>

    {uploadSite && uploadFor && <UploadModal key={JSON.stringify(uploadFor)} site={uploadSite} role={role} target={uploadFor} onClose={() => setUploadFor(null)} />}
  </div>;
}

function DocumentGroup({ site, role, task, onOpen, onUpload, onDraft, expanded }: {
  site: Site;
  role: Role;
  task?: ProjectTask;
  onOpen: (id: string) => void;
  onUpload: (selection: DocumentSelection) => void;
  onDraft?: (siteId: string) => void;
  expanded: boolean;
}) {
  const { state } = useLab();
  const permittedDocs = visibleDocuments(state, site, role);
  const docs = permittedDocs.filter((doc) => !task || matchesTask(doc, task));
  const superseded = new Set(permittedDocs.flatMap((doc) => doc.replacesId ? [doc.replacesId] : []));
  const canManage = role !== "investor";
  const canUseDrafts = canManage || isInterested(state, site.id);
  const status = statusPill(site);
  const renderDocument = (doc: DemoDocument) => {
    const previous = permittedDocs.find((entry) => entry.id === doc.replacesId);
    const linkedTask = canManage ? projectTasks(site).find((entry) => entry.id === doc.taskId) : undefined;
    return <article key={doc.id} className={c.docItem} aria-label={`Document metadata: ${doc.name}`}>
      <span className={c.docIcon}><Icon name="file" size={18} /></span>
      <div className={c.docMeta}>
        <strong>{doc.name}</strong>
        <small>{DOC_KIND_LABEL[doc.kind]} &middot; {formatBytes(doc.size)} &middot; <time dateTime={doc.createdAt || undefined} title={doc.createdAt || undefined}>{timestampLabel(doc.createdAt)}</time></small>
        <small>Audience: {doc.disclosure === "investor_tier_1" ? "Shared preview metadata after interest" : "Private to owner & operator"}. Sensitivity: {doc.disclosure === "investor_tier_1" ? "declared non-sensitive representation; not inspected" : "uninspected; may contain personal information"}.</small>
        <span className={c.docBadges}><Pill>Version {doc.version ?? 1}{doc.version === undefined ? " (legacy)" : ""}</Pill><Pill tone={doc.review === "reviewed" ? "positive" : "neutral"}>{doc.review === "reviewed" ? "Metadata reviewed (demo)" : "Unreviewed metadata"}</Pill>{superseded.has(doc.id) ? <Pill>Superseded metadata</Pill> : <Pill>Current metadata</Pill>}</span>
        {doc.replacesId && <small>{previous ? `Replaces version ${previous.version ?? 1}: ${previous.name}` : "Earlier version is not available in this view."}</small>}
        {canManage && doc.taskId && <small>Request: {linkedTask?.title ?? "Historical request no longer listed"}</small>}
        {canManage && task && !doc.taskId && <small>Matching document type; no request link was recorded on this legacy entry.</small>}
        <details className={c.metadataDetails}>
          <summary>Inspect metadata</summary>
          <dl className={c.documentFacts}>
            <div><dt>File-name format</dt><dd>{fileExtension(doc.name).toUpperCase() || "Not recorded"}; contents not inspected</dd></div>
            <div><dt>Recorded size</dt><dd>{formatNumber(doc.size)} bytes</dd></div>
            <div><dt>Review state</dt><dd>{doc.review === "reviewed" ? doc.reviewedAt ? `Metadata review recorded ${timestampLabel(doc.reviewedAt)}` : "Metadata review recorded; date unavailable" : "No metadata review recorded"}</dd></div>
            <div><dt>Provenance</dt><dd>Saved fictional browser metadata. No file bytes stored or available for download.</dd></div>
          </dl>
        </details>
        <DocumentHistory document={doc} site={site} role={role} />
      </div>
      {canManage && !superseded.has(doc.id) && <span className={c.docActions}><Button variant="ghost" icon="plus" aria-label={`Add version of ${doc.name}`} onClick={() => onUpload({ replacesId: doc.id, ...(task?.kind === "evidence" ? { taskId: task.id } : {}) })}>Add version</Button></span>}
    </article>;
  };

  return <section aria-label={`Documents for ${site.name || "Untitled site"}`}><details className={c.propertyGroup} open={expanded}>
    <summary><strong>{site.name || "Untitled site"}</strong><span>{docs.length} permitted metadata versions / {documentFamilies(docs).length} file groups</span></summary>
    <Card>
    <div className={c.groupHead}>
      <div className={c.groupTitle}>
        <span className={c.taskIcon}><Icon name={site.type === "rooftop" ? "roof" : "land"} size={20} /></span>
        <div>
          <h3>Project evidence</h3>
          <p className={s.smallMuted}><Icon name="pin" size={13} />{site.locality}{site.region !== "unknown" ? `, ${site.region}` : ""}</p>
        </div>
      </div>
      <div className={s.row}>
        <Pill tone={status.tone}>{status.label}</Pill>
        {role === "site-owner" && <PublicationBadge site={site} />}
        <Button variant="ghost" icon="diagonal" onClick={() => onOpen(site.id)}>Open</Button>
        {canManage && (!task || task.kind === "evidence") && <Button variant="secondary" icon="plus" onClick={() => onUpload(task ? { taskId: task.id } : {})}>Add metadata</Button>}
        {onDraft && canUseDrafts && <Button variant="secondary" icon="file" onClick={() => onDraft(site.id)}>Drafts &amp; reports</Button>}
      </div>
    </div>

    {canManage && <EvidenceRequests site={site} {...(task ? { selectedTaskId: task.id } : {})} onAdd={(request) => onUpload({ taskId: request.id })} />}
    {role === "site-owner" && (!task || task.documentKind === "electricity_bill") && <UtilityPreview onManual={() => {
      const request = projectTasks(site).find((entry) => entry.kind === "evidence" && entry.documentKind === "electricity_bill" && entry.status !== "reviewed");
      onUpload({ kind: "electricity_bill", ...(request ? { taskId: request.id } : {}) });
    }} />}
    {canManage && needsReconfirmation(site) && <p className={c.reviewWarning}>Evidence or assessment changed after acceptance. The operator must explicitly reconfirm the human decision; metadata access does not do that.</p>}

    <p className={c.blockLabel}>{role === "investor" ? "Shared metadata" : task ? "Metadata for this request" : "Document metadata and versions"}</p>
    {docs.length > 0
      ? <div className={c.docList}>{documentFamilies(docs).map((family) => {
        const current = family.versions.filter((doc) => !superseded.has(doc.id));
        const earlier = family.versions.filter((doc) => superseded.has(doc.id));
        return <div className={c.fileGroup} key={family.id}>
          {current.map(renderDocument)}
          {earlier.length > 0 && <details className={c.versionHistory}><summary>Earlier metadata versions ({earlier.length})</summary>{earlier.map(renderDocument)}</details>}
        </div>;
      })}</div>
      : <Empty title={role === "investor" ? isInterested(state, site.id) ? "No shared metadata yet" : "Interest needed for shared metadata" : task ? "No metadata for this request" : "No document metadata yet"} icon="file">
          {role === "investor"
            ? isInterested(state, site.id) ? "This permitted project has no shareable metadata. Private records are not substituted." : "Open the project to consider nonbinding interest. Opening this page never expresses interest for you."
            : task?.kind === "review" ? "This is an operator review task, not a required file upload." : "Add fictional metadata if useful. There is no universal ownership, bill, or photo requirement."}
        </Empty>}

    <p className={c.noteText}>Opening metadata does not mark it reviewed, acknowledge it, or complete a task. Drafts and reports are separate artifacts, not copies of these files.</p>

    {site.status === "accepted" && role !== "investor" && <AcknowledgementBlock site={site} role={role} />}
  </Card></details></section>;
}

function AcknowledgementBlock({ site, role }: { site: Site; role: Role }) {
  const { dispatch, notify } = useLab();
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);

  const acknowledge = () => {
    if (!name.trim()) { notify("Type a fictional name to record the demo acknowledgement."); return; }
    if (!agreed) { notify("Tick the acknowledgement box to continue."); return; }
    const ok = dispatch({ type: "acknowledge", id: site.id, name }, "Demo acknowledgement recorded in this browser. This is a simulation, not a legal signature.");
    if (ok) { setName(""); setAgreed(false); }
  };

  return <>
    <p className={c.blockLabel}>Optional preview acknowledgement</p>
    <div className={c.ackBox}>
      {site.acknowledgement
        ? <div className={c.ackStatus}><Icon name="check" size={18} /><span><strong>Preview acknowledged by {site.acknowledgement.name}</strong> on {shortDate(site.acknowledgement.at)} · simulated, not a document review or legal signature.</span></div>
        : role === "site-owner"
          ? <>
              <p className={c.noteText}>This optional action records that you saw a fictional project preview, not file contents. It does not review a task, authorize a utility, sign an NDA, or execute a lease or ownership agreement.</p>
              <label className={c.consent}>
                <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
                <span><strong>I acknowledge this demo project preview</strong><small>A separate, nonbinding action. Viewing or adding metadata never checks this box.</small></span>
              </label>
              <div className={c.ackForm}>
                <Field label="Type a fictional name">
                  <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Demo participant" autoComplete="off" />
                </Field>
                <Button variant="primary" icon="check" disabled={!name.trim() || !agreed} onClick={acknowledge}>Record acknowledgement</Button>
              </div>
            </>
          : <div className={c.ackStatus}><Icon name="clock" size={18} /><span>No optional owner preview acknowledgement is recorded. It is not a stage prerequisite.</span></div>}
    </div>
  </>;
}

function UploadModal({ site, role, target, onClose }: { site: Site; role: Role; target: UploadTarget; onClose: () => void }) {
  const { dispatch, notify } = useLab();
  const replacement = site.documents.find((doc) => doc.id === target.replacesId);
  const [replacementBasis] = useState(replacement);
  const tasks = projectTasks(site).filter((task) => task.kind === "evidence");
  const initialTaskId = replacement?.taskId ?? target.taskId ?? "";
  const [file, setFile] = useState<FileMetadata | null>(null);
  const [taskId, setTaskId] = useState(initialTaskId);
  const [kind, setKind] = useState<DocumentKind>(replacement?.kind ?? tasks.find((task) => task.id === initialTaskId)?.documentKind ?? target.kind ?? "ownership");
  const [disclosure, setDisclosure] = useState<DemoDocument["disclosure"]>(replacement?.disclosure ?? "owner_private");
  const [nonSensitive, setNonSensitive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedTask = tasks.find((task) => task.id === taskId);
  const historicalTask = Boolean(replacement?.taskId && taskId === replacement.taskId && !selectedTask);

  const save = () => {
    if (role === "investor") { setError("Investors cannot add project document metadata."); return; }
    if (!file) { setError("Choose a fictional file to add its metadata."); return; }
    if (target.replacesId && (!replacement || site.documents.some((doc) => doc.replacesId === replacement.id))) {
      setError("That version changed while this form was open. Close it and choose the latest available version.");
      return;
    }
    if (replacement && replacementBasis && (["kind", "disclosure", "taskId", "version", "replacesId", "name", "size"] as const)
      .some((field) => replacement[field] !== replacementBasis[field])) {
      setError("That metadata version or its audience changed while this form was open. Close it and review the current version before adding another.");
      return;
    }
    if (taskId && !selectedTask && !historicalTask) { setError("That project request is no longer available. Choose a current request or general site metadata."); return; }
    if (selectedTask?.documentKind && selectedTask.documentKind !== kind) { setError("The document type must match this request."); return; }
    if (disclosure === "investor_tier_1" && !nonSensitive) { setError("Confirm that this is a separate fictional, non-sensitive representation before sharing its metadata."); return; }
    const doc = toDocument(file, kind, replacement?.disclosure ?? disclosure, {
      ...(taskId ? { taskId } : {}),
      ...(replacement ? { replacement } : {}),
    });
    const ok = dispatch({ type: "document", id: site.id, document: doc, actor: role },
      "Unreviewed metadata added in this browser. No bytes were uploaded, no task was reviewed, and no acknowledgement was recorded.");
    if (ok) onClose();
    else setError("The metadata could not be added in this project's current state. Close this form and reopen the project.");
  };

  return <Modal title={replacement ? "Add a metadata version" : "Add document metadata"} eyebrow={site.name || "Untitled site"} onClose={onClose}>
    <div className={c.modalForm}>
      <p className={c.noteText}>Only fictional file metadata is saved. Contents are never read, uploaded, scanned, or available for download. A file extension and browser-reported type are not a content inspection.</p>
      {replacement && <p className={c.versionContext}>New version of <strong>{replacement.name}</strong>. The previous metadata, audience, and request link are retained. Review starts again as unreviewed metadata.</p>}
      <MetadataPicker onPick={(chosen) => { setFile(chosen); setError(null); }} />
      <p className={c.noteText} role="status">{file ? `Selected metadata: ${file.name} / ${formatBytes(file.size)}. Not yet added.` : "No file metadata selected."}</p>
      {(tasks.length > 0 || historicalTask) && <Field label="Link to project request (optional)">
        <select value={taskId} disabled={Boolean(replacement)} onChange={(event) => {
          const selected = tasks.find((task) => task.id === event.target.value);
          if (event.target.value && !selected) { notify("Choose a current project request."); return; }
          setTaskId(selected?.id ?? "");
          if (selected?.documentKind) setKind(selected.documentKind);
          setError(null);
        }}>
          <option value="">General site metadata</option>
          {historicalTask && <option value={taskId}>Historical request (link retained)</option>}
          {tasks.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}
        </select>
      </Field>}
      <Field label="Document type">
        <select value={kind} disabled={Boolean(replacement || selectedTask?.documentKind)} onChange={(event) => {
          const selected = DOC_KINDS.find(([value]) => value === event.target.value);
          if (selected) { setKind(selected[0]); setError(null); }
          else notify("Choose an available document type.");
        }}>
          {DOC_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </Field>
      <fieldset className={c.radioSet}>
        <legend className={c.legend}>Preview audience</legend>
        <div className={c.radioRow}>
          <label className={`${c.radioCard} ${disclosure === "owner_private" ? c.radioCardOn : ""}`}>
            <input type="radio" name="disclosure" disabled={Boolean(replacement)} checked={disclosure === "owner_private"} onChange={() => setDisclosure("owner_private")} />
            <span><strong>Private metadata</strong><small>Owner and operator only. The default for originals.</small></span>
          </label>
          <label className={`${c.radioCard} ${disclosure === "investor_tier_1" ? c.radioCardOn : ""}`}>
            <input type="radio" name="disclosure" disabled={Boolean(replacement)} checked={disclosure === "investor_tier_1"} onChange={() => setDisclosure("investor_tier_1")} />
            <span><strong>Shareable representation</strong><small>Fictional non-sensitive metadata for interested investors in a published project.</small></span>
          </label>
        </div>
      </fieldset>
      {replacement && <p className={c.noteText}>An existing version&apos;s audience cannot be broadened here. Add a separate non-sensitive representation instead of relabeling a private original.</p>}
      {disclosure === "investor_tier_1" && <label className={c.consent}>
        <input type="checkbox" checked={nonSensitive} onChange={(event) => setNonSensitive(event.target.checked)} />
        <span><strong>This represents a fictional, non-sensitive copy.</strong><small>Even its filename must be non-sensitive. No automated redaction or live disclosure approval is performed; private originals remain separate.</small></span>
      </label>}
      {error && <div className={c.errors} role="alert"><p><Icon name="close" size={15} />{error}</p></div>}
      <div className={c.actions}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon="plus" disabled={!file || (disclosure === "investor_tier_1" && !nonSensitive)} onClick={save}>Add metadata</Button>
      </div>
    </div>
  </Modal>;
}
