"use client";

import { useEffect, useState } from "react";
import {
  JOURNEY_STAGES, ROLE_LABELS, VIABILITY_LABELS, capacity, formatNumber, investorVisible, latestAssessment,
  needsReconfirmation, projectTasks, roleSites, stageBlockers, stageName, visibleActivity,
  type Activity, type Role, type Site,
} from "./model";
import { ProjectCollection } from "./ProjectCollection";
import { GuidanceAssistant } from "./Guidance";
import { SUBMISSION_STATUS_LABELS, actorLabel, assessmentScopeLabel, compareLifecycle, compareRecordedTimes, submissionStatusTone, timestampLabel } from "./demoPresentation";
import { useLab } from "./store";
import { Button, Card, Empty, Field, Icon, MapDiagram, Pill, ViabilityBadge } from "./ui";
import s from "./Lab.module.css";
import o from "./OperatorViews.module.css";

type Tone = "neutral" | "positive" | "warning" | "danger" | "accent";

const KIND_ICON: Record<Activity["kind"], string> = {
  submission: "upload", stage: "pipeline", decision: "check", interest: "heart", note: "file",
  document: "file", acknowledgement: "check", override: "spark", visibility: "eye", assignment: "people",
  owner_interest: "heart", task: "check",
};

const PAGE_SIZE = 25;
interface QueueSelection {
  query: string; work: string; status: string; type: string; location: string; viability: string;
  assignment: string; sort: string; page: number; pageSize: number; moreFilters: boolean;
  display: "list" | "cards"; selected: string | null;
}
const queueSelections = new Map<"operator", QueueSelection>();
export function resetQueuePreferences() { queueSelections.clear(); }

interface OperatorCollectionProps {
  onOpen: (id: string) => void;
  onDocuments?: (id: string) => void;
  onReports?: (id: string) => void;
  siteId?: string;
}

function nextWork(site: Site): { id: string; label: string; tone: Tone; rank: number } {
  if (needsReconfirmation(site)) return { id: "reconfirm", label: "Reconfirm human review", tone: "warning", rank: 0 };
  switch (site.status) {
    case "submitted":
    case "screening": return { id: "review", label: "Review submission", tone: "warning", rank: 1 };
    case "info_requested": return { id: "waiting", label: "Owner follow-up", tone: "neutral", rank: 4 };
    case "accepted":
      if (!site.stage) return { id: "setup", label: "Start project setup", tone: "accent", rank: 2 };
      if (stageBlockers(site).length) return { id: "blocked", label: "Resolve stage blockers", tone: "warning", rank: 3 };
      return { id: "milestone", label: site.stage === "operations" ? "Review operations example" : "Review next milestone", tone: "neutral", rank: 5 };
    case "draft": return { id: "draft", label: "Not submitted", tone: "neutral", rank: 6 };
    case "rejected": return { id: "closed", label: "Closed submission", tone: "neutral", rank: 7 };
  }
}

function lastUpdated(site: Site): string {
  return [...site.activity.map((event) => event.at), latestAssessment(site)?.createdAt ?? ""].sort(compareRecordedTimes)[0] ?? "";
}

function Stat({ icon, label, value, tone, foot }: { icon: string; label: string; value: number | string; tone: Tone; foot: string }) {
  return <div className={o.stat}>
    <div className={o.statTop}><span className={`${o.statIcon} ${o[`tone_${tone}`]}`}><Icon name={icon} size={16} /></span><span>{label}</span></div>
    <strong>{typeof value === "number" ? formatNumber(value) : value}</strong>
    <p>{foot}</p>
  </div>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <Field label={label}>
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
    </select>
  </Field>;
}

export function SubmissionQueueView({ onOpen, onDocuments, onReports, siteId }: OperatorCollectionProps) {
  const { state } = useLab();
  const rememberedQueue = queueSelections.get("operator");
  const sites = roleSites(state, "operator").filter((site) => !siteId || site.id === siteId);
  const [query, setQuery] = useState(rememberedQueue?.query ?? "");
  const [work, setWork] = useState(rememberedQueue?.work ?? "all");
  const [status, setStatus] = useState(rememberedQueue?.status ?? "all");
  const [type, setType] = useState(rememberedQueue?.type ?? "all");
  const [location, setLocation] = useState(rememberedQueue?.location ?? "all");
  const [viability, setViability] = useState(rememberedQueue?.viability ?? "all");
  const [assignment, setAssignment] = useState(rememberedQueue?.assignment ?? "all");
  const [sort, setSort] = useState(rememberedQueue?.sort ?? "action");
  const [page, setPage] = useState(rememberedQueue?.page ?? 0);
  const [pageSize, setPageSize] = useState(rememberedQueue?.pageSize ?? 25);
  const [moreFilters, setMoreFilters] = useState(rememberedQueue?.moreFilters ?? false);
  const [display, setDisplay] = useState<"list" | "cards">(rememberedQueue?.display ?? "list");
  const [selected, setSelected] = useState<string | null>(rememberedQueue?.selected ?? null);
  const locations = Array.from(new Set(sites.map((site) => site.locality))).sort();
  const assignees = Array.from(new Set(sites.map((site) => site.assignee || "Unassigned"))).sort();
  const change = (setter: (value: string) => void, value: string) => { setter(value); setPage(0); };

  const filtered = sites.filter((site) => {
    const text = `${site.name} ${site.locality} ${site.address}`.toLowerCase();
    const result = latestAssessment(site)?.result;
    return (!query.trim() || text.includes(query.trim().toLowerCase())) &&
      (work === "all" || nextWork(site).id === work) &&
      (status === "all" || site.status === status) &&
      (type === "all" || site.type === type) &&
      (location === "all" || site.locality === location) &&
      (assignment === "all" || (site.assignee || "Unassigned") === assignment) &&
      (viability === "all" || (viability === "unscreened" ? !result : result === viability));
  }).sort((a, b) => {
    if (sort === "stage" || sort === "stage-desc") return compareLifecycle(a, b, sort === "stage-desc");
    const order = sort === "name" ? a.name.localeCompare(b.name)
      : sort === "updated" ? compareRecordedTimes(lastUpdated(a), lastUpdated(b))
        : nextWork(a).rank - nextWork(b).rank || compareRecordedTimes(lastUpdated(a), lastUpdated(b));
    return order || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });

  const needsReview = sites.filter((site) => ["submitted", "screening"].includes(site.status)).length;
  const setup = sites.filter((site) => site.status === "accepted" && !site.stage).length;
  const blocked = sites.filter((site) => site.status === "accepted" && (stageBlockers(site).length > 0 || needsReconfirmation(site))).length;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  if (page !== currentPage) setPage(currentPage);
  if (selected && !filtered.some((site) => site.id === selected)) setSelected(null);
  const shown = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const active = filtered.find((site) => site.id === selected) ?? shown[0];
  useEffect(() => {
    queueSelections.set("operator", { query, work, status, type, location, viability, assignment, sort, page: currentPage, pageSize, moreFilters, display, selected });
  }, [query, work, status, type, location, viability, assignment, sort, currentPage, pageSize, moreFilters, display, selected]);
  const open = (id: string) => {
    setSelected(id);
    queueSelections.set("operator", { query, work, status, type, location, viability, assignment, sort, page: currentPage, pageSize, moreFilters, display, selected: id });
    onOpen(id);
  };
  const filtersActive = Boolean(query) || [work, status, type, location, viability, assignment].some((value) => value !== "all") || sort !== "action";
  const reset = () => {
    setQuery(""); setWork("all"); setStatus("all"); setType("all"); setLocation("all");
    setViability("all"); setAssignment("all"); setSort("action"); setPage(0);
  };

  return <div className={o.workspace}>
    <div className={s.pageHeading}>
      <div><p className={s.eyebrow}>Operator Action center / synthetic submissions</p><h1>Move the next piece of work.</h1><p>Work first, pipeline figures below. Open a site to review, assign or resolve its example tasks. Nothing runs automatically.</p></div>
    </div>
    <Card>
      <div className={o.filters} role="search" aria-label="Submission filters">
        <Field label="Search submissions"><input type="search" value={query} onChange={(event) => change(setQuery, event.target.value)} placeholder="Name, district or fictional address" /></Field>
        <Select label="Next work" value={work} onChange={(value) => change(setWork, value)} options={[
          ["all", "All work"], ["review", "Review submission"], ["reconfirm", "Reconfirm human review"],
          ["setup", "Start project setup"], ["blocked", "Resolve stage blockers"], ["waiting", "Owner follow-up"],
          ["milestone", "Review next milestone"], ["draft", "Not submitted"], ["closed", "Closed submission"],
        ]} />
        <Select label="Submission status" value={status} onChange={(value) => change(setStatus, value)} options={[["all", "All statuses"], ...Object.entries(SUBMISSION_STATUS_LABELS)]} />
        <Select label="Sort submissions" value={sort} onChange={(value) => change(setSort, value)} options={[["action", "Next action first"], ["updated", "Recently updated"], ["name", "Site name"], ["stage", "Lifecycle, earliest first"], ["stage-desc", "Lifecycle, latest first"]]} />
      </div>
      <Button variant="ghost" icon="sliders" aria-expanded={moreFilters} onClick={() => setMoreFilters(!moreFilters)}>{moreFilters ? "Fewer filters" : "More filters"}</Button>
      {moreFilters && <div className={o.filters}>
        <Select label="Site type" value={type} onChange={(value) => change(setType, value)} options={[["all", "All types"], ["rooftop", "Rooftop"], ["land", "Land"]]} />
        <Select label="Location" value={location} onChange={(value) => change(setLocation, value)} options={[["all", "All locations"], ...locations.map((value): [string, string] => [value, value])]} />
        <Select label="Screening outcome" value={viability} onChange={(value) => change(setViability, value)} options={[["all", "All outcomes"], ...Object.entries(VIABILITY_LABELS), ["unscreened", "Not screened"]]} />
        <Select label="Assigned reviewer" value={assignment} onChange={(value) => change(setAssignment, value)} options={[["all", "All reviewers"], ...assignees.map((value): [string, string] => [value, value])]} />
      </div>}
      <div className={o.resultCaption}>
        <p role="status">{filtered.length} of {sites.length} fictional sites match{shown.length ? `; showing ${currentPage * pageSize + 1}-${currentPage * pageSize + shown.length}` : "; this page is empty"}. Counts describe the filtered set, not the page.</p>
        {filtersActive && <Button variant="ghost" icon="close" onClick={reset}>Clear filters</Button>}
      </div>
      <section aria-label="Linked illustrative map" className={o.queueMap}>
        <h2>Fictional work, in context</h2><p>Map covers all {filtered.length} filtered sites; {filtered.filter((site) => site.mapPosition).length} have invented positions. No real geography or geocoding. Pin selection changes the list page, not project state.</p>
        <MapDiagram sites={filtered} {...(active ? { selected: active.id } : {})} onSelect={(id) => {
          const index = filtered.findIndex((site) => site.id === id);
          if (index >= 0) { setSelected(id); setPage(Math.floor(index / pageSize)); }
        }} large />
      </section>
      <div className={o.workWithGuidance}><div className={o.workList}>
      <div className={o.resultCaption}>
        <div role="group" aria-label="Work presentation"><Button aria-pressed={display === "list"} onClick={() => setDisplay("list")}>List</Button><Button aria-pressed={display === "cards"} onClick={() => setDisplay("cards")}>Cards</Button></div>
        <Field label="Submissions per page"><select value={pageSize} onChange={(event) => {
          const next = Number(event.target.value);
          const anchor = selected ? filtered.findIndex((site) => site.id === selected) : currentPage * pageSize;
          setPageSize(next); setPage(Math.floor(Math.max(0, anchor) / next));
        }}>{[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></Field>
      </div>
      <p className={s.smallMuted}>Same work fields in both views. Lifecycle uses the canonical sequence; unknown/unstarted stages sort last. {assessmentScopeLabel(filtered)}</p>
      {shown.length ? <ul className={`${o.queue} ${display === "cards" ? o.queueCards : ""}`} aria-label="Submissions awaiting a manual action">
        {shown.map((site) => {
          const workItem = nextWork(site);
          const updated = lastUpdated(site);
          const tasks = projectTasks(site);
          const blockers = stageBlockers(site);
          const capacityKnown = latestAssessment(site)?.capacity != null;
          return <li key={site.id} data-project-id={site.id} data-selected={active?.id === site.id}>
            <button type="button" data-record-id={site.id} data-project-open={site.id} className={o.queueRow} onClick={() => open(site.id)} aria-label={`Review ${site.name}`}>
              <span className={o.queueIcon}><Icon name={site.type === "rooftop" ? "roof" : "land"} size={19} /></span>
              <span className={o.queueMain}>
                <strong>{site.name}</strong>
                <span className={o.queueSub}>{site.locality} &middot; {site.assignee || "Unassigned"} / updated <time dateTime={updated || undefined} title={updated || undefined}>{timestampLabel(updated)}</time></span>
                <span className={o.queueNext}>{site.nextAction || "No next action recorded"}</span>
                <span className={o.queueSub}>{tasks.length ? `${tasks.filter((task) => task.status === "reviewed").length} of ${tasks.length} named example tasks reviewed` : "No named task denominator"}{blockers.length ? ` / ${blockers.length} stage blocker${blockers.length === 1 ? "" : "s"}` : ""}</span>
              </span>
              <span className={o.queueTags}>
                <Pill tone={workItem.tone}>{workItem.label}</Pill>
                <Pill tone={submissionStatusTone(site.status)}>{SUBMISSION_STATUS_LABELS[site.status]}</Pill>
                <span className={o.queueSub}>{site.stage ? stageName(site.stage) : "Project not started"} / {investorVisible(site) ? "Published" : "Not published"}</span>
                <ViabilityBadge result={latestAssessment(site)?.result} />
              </span>
              <span className={o.queueCap}><strong>{capacityKnown ? `${formatNumber(capacity(site), 1)} kW` : "Unknown"}</strong><small>Fixture midpoint</small></span>
              <span className={o.queueGo} aria-hidden="true"><Icon name="chevron" size={16} /></span>
            </button>
          </li>;
        })}
      </ul> : <Empty title="No submissions match these filters" icon="search">Clear a filter to see more sites. Filtering never changes a submission.</Empty>}
      <div className={o.pagination}><span>Page {currentPage + 1} of {pageCount}</span><div>
        <Button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous submissions</Button>
        <Button disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next submissions</Button>
      </div></div>
      </div><GuidanceAssistant key={active?.id ?? "none"} role="operator" {...(active ? { siteId: active.id } : {})}
        {...(active && onDocuments ? { onNavigate: (_role: Role, view: string) => view === "reports" ? onReports?.(active.id) : onDocuments(active.id) } : {})} /></div>
    </Card>
    <section aria-label="Pipeline figures" className={o.pipelineFigures}>
      <h2>This saved scenario, in numbers</h2>
      <div className={o.stats}>
        <Stat icon="inbox" label="Awaiting your review" value={needsReview} tone="warning" foot="All permitted sites; submitted or in screening" />
        <Stat icon="pipeline" label="Awaiting project setup" value={setup} tone="accent" foot="Accepted does not mean started" />
        <Stat icon="lock" label="Blocked next steps" value={blocked} tone="warning" foot="Example tasks or review changes" />
        <Stat icon="bolt" label="Illustrative capacity" value={sites.some((site) => latestAssessment(site)?.capacity != null) ? `${formatNumber(sites.reduce((sum, site) => sum + capacity(site), 0), 1)} kW` : "Not calculated"} tone="neutral" foot={`${sites.filter((site) => latestAssessment(site)?.capacity != null).length} of ${sites.length} permitted sites have fixture ranges; unknowns excluded. Not installed capacity.`} />
      </div>
    </section>
  </div>;
}

export function PipelineView({ onOpen, onDocuments, onReports }: OperatorCollectionProps) {
  const { state } = useLab();
  const sites = roleSites(state, "operator");
  const started = sites.filter((site) => site.status === "accepted" &&
    JOURNEY_STAGES.findIndex((stage) => stage.id === site.stage) >= 2);
  const knownCapacity = started.filter((site) => latestAssessment(site)?.capacity != null);
  const totalCap = knownCapacity.reduce((sum, site) => sum + capacity(site), 0);
  return <div className={o.workspace}>
    <div className={s.pageHeading}>
      <div><p className={s.eyebrow}>Operator / synthetic portfolio</p><h1>Find a project. See its next step.</h1><p>Map above list, one selection. Open project detail for deliberate review and lifecycle actions.</p></div>
    </div>
    <ProjectCollection sites={sites} role="operator" onOpen={onOpen} {...(onDocuments ? { onDocuments } : {})} {...(onReports ? { onReports } : {})} />
    <div className={`${o.stats} ${o.pipelineFigures}`}>
      <Stat icon="pipeline" label="Projects started" value={started.length} tone="accent" foot="Pre-development or a later example stage" />
      <Stat icon="bolt" label="Illustrative capacity" value={knownCapacity.length ? `${formatNumber(totalCap, 1)} kW` : "Not calculated"} tone="neutral" foot={`${knownCapacity.length} of ${started.length} started projects have fixture ranges; not installed capacity`} />
      <Stat icon="inbox" label="Accepted, awaiting setup" value={sites.filter((site) => site.status === "accepted" && !site.stage).length} tone="warning" foot="Setup is a separate manual command" />
      <Stat icon="eye" label="Investor-published" value={sites.filter(investorVisible).length} tone="positive" foot="Listing only; no funding implied" />
    </div>
  </div>;
}

export function ActivityView({ role, onOpen }: { role: Role; onOpen?: (id: string) => void }) {
  const { state } = useLab();
  const sites = roleSites(state, role);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [page, setPage] = useState(0);
  const events = sites
    .flatMap((site) => visibleActivity(site, role)
      .filter((event) => role === "operator" || (event.kind !== "note" && event.kind !== "override" &&
        (role !== "site-owner" || event.kind !== "interest")))
      .map((event) => ({
        ...event, siteId: site.id, siteName: site.name,
        ...(role === "site-owner" && event.kind === "owner_interest" ? {
          title: "New non-binding project interest",
          detail: "An investor expressed interest in this fictional project. No commitment or funding has occurred.",
        } : {}),
      })))
    .filter((event) => (scope === "all" || event.siteId === scope) &&
      `${event.siteName} ${event.title}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => compareRecordedTimes(a.at, b.at) || a.siteId.localeCompare(b.siteId) || a.id.localeCompare(b.id));
  const pageCount = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const shown = events.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const heading = role === "operator" ? "Follow the decisions, not a live feed."
    : role === "investor" ? "Updates on published projects." : "Your project activity.";
  const scopeNote = role === "operator" ? "Includes internal notes and visibility changes."
    : role === "investor" ? "Permitted shared updates and your demo interest events only." : "Shared and owner-facing events; private investor details stay private.";

  return <div className={o.workspace}>
    <div className={s.pageHeading}>
      <div><p className={s.eyebrow}>{ROLE_LABELS[role]} / synthetic activity</p><h1>{heading}</h1><p>{scopeNote} These are browser-preview records, not service confirmations.</p></div>
    </div>
    <Card title="Recorded activity" eyebrow="Most recent known instant first; unknown times last">
      <div className={o.filters}>
        <Field label="Search activity"><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Project or event title" /></Field>
        <Select label="Activity project" value={scope} onChange={(value) => { setScope(value); setPage(0); }} options={[["all", "All permitted projects"], ...sites.map((site): [string, string] => [site.id, site.name])]} />
      </div>
      <div className={o.resultCaption}><p role="status">{events.length} matching preview events</p><Button variant="ghost" onClick={() => { setQuery(""); setScope("all"); setPage(0); }}>Clear activity filters</Button></div>
      {shown.length ? <ol className={o.log}>
        {shown.map((event) => <li key={`${event.siteId}-${event.id}`} className={o.logItem}>
          <span className={o.logIcon}><Icon name={KIND_ICON[event.kind]} size={16} /></span>
          <div className={o.logMain}>
            <strong>{event.title}</strong>
            <p>{event.detail}</p>
            <span className={o.logMeta}>{event.siteName} &middot; {actorLabel(event.actor)} &middot; <time dateTime={event.at || undefined} title={event.at || undefined}>{timestampLabel(event.at)}</time>{role === "operator" ? ` / ${event.scope} scope` : ""}</span>
            {onOpen && <Button variant="ghost" data-project-open={event.siteId} onClick={() => onOpen(event.siteId)}>Open {event.siteName}</Button>}
          </div>
        </li>)}
      </ol> : <Empty title="No activity matches this view" icon="clock">Change the filters or record an allowed preview action.</Empty>}
      <div className={o.pagination}><span>Page {currentPage + 1} of {pageCount}</span><div>
        <Button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous events</Button>
        <Button disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next events</Button>
      </div></div>
    </Card>
  </div>;
}
