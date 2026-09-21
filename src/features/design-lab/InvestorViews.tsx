"use client";

/**
 * SYNTHETIC_DEMO_ONLY investor screens. No live transport or matching service.
 *
 * Browser-only presentation. Publication governs project disclosure; a retained
 * interest record never grants access to an unpublished project's details.
 */

import { useEffect, useRef, useState } from "react";
import {
  CAPITAL_TYPES,
  INVESTOR_TYPES,
  JOURNEY_STAGES,
  VIABILITY_LABELS,
  formatNumber,
  investorVisible,
  isInterested,
  latestAssessment,
  money,
  roleSites,
  shortDate,
  sourceRevision,
  stageName,
  type Mandate,
  type Role,
  type Site,
} from "./model";
import { ProjectCollection } from "./ProjectCollection";
import { useLab } from "./store";
import { Button, Card, Empty, Field, Icon, Modal, Pill } from "./ui";
import s from "./Lab.module.css";
import iv from "./InvestorViews.module.css";

const MANDATE_STAGES = JOURNEY_STAGES.filter((stage) =>
  ["pre-development", "development", "construction", "commissioning", "operations"].includes(stage.id),
);

const GEOGRAPHIES: [string, string][] = [
  ["GA", "Georgia"],
  ["TN", "Tennessee"],
];

const OBJECTIVES = [
  "Community ownership",
  "Local wealth building",
  "Energy bill relief",
  "Grid resilience",
  "Climate impact",
  "Workforce development",
];

const IMPACT_PRIORITIES = [
  "Energy access",
  "Local opportunity",
  "Emissions avoided",
  "Health co-benefits",
  "Housing affordability",
  "Environmental justice",
];

const DECISION_CRITERIA = [
  "Transparent viability",
  "Community governance",
  "Measurable outcomes",
  "Site readiness",
  "Experienced operator",
  "Additionality",
];

function capacityRangeLabel(site: Site): string {
  const range = latestAssessment(site)?.capacity;
  return range ? `${formatNumber(range[0], 1)}\u2013${formatNumber(range[1], 1)} kW` : "Not calculated";
}

function generationRangeLabel(site: Site): string {
  const range = latestAssessment(site)?.generation;
  return range
    ? `${formatNumber(range[0] / 1000, 2)}\u2013${formatNumber(range[1] / 1000, 2)} MWh/year`
    : "Not calculated";
}

function mandateFit(mandate: Mandate, site: Site): "aligned" | "unknown" | "outside" {
  if (mandate.geographies.length && site.region !== "unknown" && !mandate.geographies.includes(site.region)) return "outside";
  if (mandate.stages.length && site.stage !== null && !mandate.stages.includes(site.stage)) return "outside";
  const openNeeds = site.fundingNeeds.filter((need) => need.status === "open");
  const budgetSpecified = mandate.minimum !== null || mandate.maximum !== null;
  const knownBudgetMatch = openNeeds.some((need) => need.amount !== null &&
    (mandate.minimum === null || need.amount >= mandate.minimum) &&
    (mandate.maximum === null || need.amount <= mandate.maximum),
  );
  if (budgetSpecified && openNeeds.length && !knownBudgetMatch && openNeeds.every((need) => need.amount !== null)) return "outside";
  if ((mandate.geographies.length && site.region === "unknown") ||
    (mandate.stages.length && site.stage === null) || !openNeeds.length ||
    openNeeds.every((need) => need.amount === null) ||
    (budgetSpecified && !knownBudgetMatch)) return "unknown";
  return "aligned";
}

function geographyLabel(region: string): string {
  return GEOGRAPHIES.find(([id]) => id === region)?.[1] ?? "Unknown geography";
}

function TierNote() {
  return (
    <p className={iv.tierNote}>
      <Icon name="lock" size={14} />
      Published summaries show coarse localities and illustrative screening only. Nonbinding interest can open
      permitted document metadata, not actual files. Exact addresses, owner contacts and private documents stay hidden.
    </p>
  );
}

export function investorInformationPriorities(investorType: string, sites: readonly Site[]) {
  const needs = sites.filter((site) => site.fundingNeeds.some((need) => need.status === "open")).length;
  const capacityKnown = sites.filter((site) => latestAssessment(site)?.capacity != null).length;
  const evidence = {
    purpose: { label: "Community purpose", detail: "Goals are preferences, not verified outcomes. Community governance and achieved benefit are not established by these records." },
    needs: { label: "Funding needs", detail: `${needs} permitted published projects list an open example need. Amounts may be unknown; no allocation or commitment is implied.` },
    readiness: { label: "Project readiness", detail: "Read lifecycle stage, screening and the next human-review boundary separately. Published does not mean investment-ready." },
    production: { label: "Production assumptions", detail: `${capacityKnown} of ${sites.length} permitted projects have synthetic capacity ranges. kW is capacity, not actual energy or investor return.` },
    eligibility: { label: "Program eligibility", detail: "No tax-credit, tract, lender, or program eligibility has been verified. A selected investor type is not a qualification." },
    offtake: { label: "Energy and REC terms", detail: "Energy delivery, REC ownership and capital are separate. No offtake agreement, REC allocation or sale is created here." },
  };
  if (investorType === "philanthropy" || investorType === "special_community_endowment") return [evidence.purpose, evidence.needs, evidence.readiness];
  if (investorType === "energy_equity_fund") return [evidence.readiness, evidence.production, evidence.needs];
  if (investorType === "nmtc" || investorType === "cdfi_cde") return [evidence.eligibility, evidence.purpose, evidence.needs];
  if (investorType === "corporate") return [evidence.offtake, evidence.production, evidence.readiness];
  if (investorType === "impact_investor") return [evidence.purpose, evidence.readiness, evidence.production];
  return [evidence.readiness, evidence.needs, evidence.production];
}

let broadenedMatches = false;
export function resetPortfolioPreferences() { broadenedMatches = false; }

export function PortfolioView({ onOpen, onMandate, onDocuments, onReports }: {
  onOpen: (id: string) => void; onMandate: () => void;
  onDocuments?: (id: string) => void; onReports?: (id: string) => void;
}) {
  const { state } = useLab();
  const [broaden, setBroaden] = useState(broadenedMatches);
  const visible = roleSites(state, "investor");
  const matches = visible.map((site) => mandateFit(state.mandate, site));
  const matchCount = matches.filter((fit) => fit === "aligned").length;
  const unknownCount = matches.filter((fit) => fit === "unknown").length;
  const outsideCount = matches.filter((fit) => fit === "outside").length;
  const focused = !state.mandate.completed || broaden ? visible : visible.filter((site) => mandateFit(state.mandate, site) !== "outside");
  const priorities = investorInformationPriorities(state.mandate.investorType, visible);
  const investorTypeLabel = INVESTOR_TYPES.find(([id]) => id === state.mandate.investorType)?.[1] ?? "Not specified";
  const regions = new Set(visible.map((site) => site.region).filter((region) => region !== "unknown"));
  const unknownRegions = visible.filter((site) => site.region === "unknown").length;
  const mandateStages =
    state.mandate.stages.length === 0
      ? "any stage"
      : state.mandate.stages.map((id) => JOURNEY_STAGES.find((stage) => stage.id === id)?.name ?? "Unknown stage").join(", ");
  const mandateGeographies =
    state.mandate.geographies.length === 0
      ? "any region"
      : state.mandate.geographies.map(geographyLabel).join(", ");

  const summary: { label: string; value: string; unit: string; icon: string; foot: string }[] = [
    {
      label: "Published opportunities",
      value: String(visible.length),
      unit: "",
      icon: "grid",
      foot: `Of ${state.sites.length} fictional sites in this browser; not funded holdings`,
    },
    {
      label: "Example geographies",
      value: String(regions.size),
      unit: "",
      icon: "map",
      foot: `Published scope only; ${unknownRegions} with unknown geography`,
    },
    {
      label: "Within stated preferences",
      value: state.mandate.completed ? String(matchCount) : "Not set",
      unit: "",
      icon: "sliders",
      foot: state.mandate.completed ? `${unknownCount} need more information; not an eligibility decision` : "Set a mandate without hiding other opportunities",
    },
  ];

  return (
    <div>
      <div className={s.pageHeading}>
        <div>
          <p className={s.eyebrow}>Published opportunity portfolio / synthetic preview</p>
          <h1 className={iv.editorialTitle}>Find a project to understand.</h1>
          <p>Explore published fictional projects. Publication and screening are not investment approval.</p>
        </div>
        <Button variant="secondary" icon="sliders" onClick={onMandate}>
          Adjust mandate
        </Button>
      </div>

      {!state.mandate.completed && (
        <div className={iv.banner} role="note">
          <Icon name="help" size={17} />
          <p>Set your mandate before recording interest. All published opportunities remain available to browse.</p>
          <Button variant="ghost" icon="arrow" onClick={onMandate}>
            Set mandate
          </Button>
        </div>
      )}

      <div className={iv.summary}>
        {summary.map((metric) => (
          <div className={s.metric} key={metric.label}>
            <div className={s.metricLabel}>
              <span>{metric.label}</span>
              <Icon name={metric.icon} size={16} />
            </div>
            <div className={s.metricValue}>
              {metric.value}
              {metric.unit && <small>{metric.unit}</small>}
            </div>
            <p className={s.metricFoot}>{metric.foot}</p>
          </div>
        ))}
      </div>

      <section className={iv.informationPriorities} aria-label="Investor information priorities">
        <h2>What to examine first</h2>
        <p>Investor type: {investorTypeLabel}. These transparent demo priorities change the order of information, not eligibility, access or a project score.</p>
        <ol>{priorities.map((priority) => <li key={priority.label}><h3>{priority.label}</h3><p>{priority.detail}</p></li>)}</ol>
        <p>Source: your saved fictional type and the permitted published records. This is not a production matching model.</p>
      </section>
      {state.mandate.completed && <details className={iv.matchExplanation} open>
        <summary>How your mandate relates to this portfolio</summary>
        <p>{matchCount} within stated preferences; {unknownCount} need more information; {outsideCount} outside preferences.</p>
        <p>Compared with {mandateGeographies} and {mandateStages}, plus an open example funding need and any USD ticket limits.</p>
        <p>Unknown regions or amounts are not confirmed matches. Investor type, impact preferences and capital type are not eligibility rules.
          Preference focus includes aligned and incomplete records; it excludes only known outside-preference records until you deliberately broaden.</p>
      </details>}
      {state.mandate.completed && <div className={iv.broadenControl}>
        <label><input type="checkbox" checked={broaden} onChange={(event) => {
          broadenedMatches = event.target.checked; setBroaden(event.target.checked);
        }} />Broaden matches to all permitted projects</label>
        <p>{broaden ? `All ${visible.length} published projects remain inside the same visibility boundary.` : `${focused.length} aligned or incomplete projects in preference focus; ${outsideCount} outside preferences can be included.`} Unknown information is not a confirmed match. No private projects or documents are unlocked.</p>
      </div>}
      <TierNote />
      <ProjectCollection sites={focused} role="investor" onOpen={onOpen} {...(onDocuments ? { onDocuments } : {})} {...(onReports ? { onReports } : {})} />
      <p className={iv.provenance}>Source: current synthetic browser records. Counts describe this portfolio, not operating traction.
        Screening ranges are fixed examples; actual generation, carbon avoidance and households served are unmeasured.</p>
    </div>
  );
}

interface MandateDraft {
  organization: string;
  investorType: string;
  capitalType: string;
  stages: string[];
  geographies: string[];
  minimum: string;
  maximum: string;
  objectives: string[];
  impact: string[];
  criteria: string[];
}

function centsToInput(value: number | null): string {
  if (value === null) return "";
  const cents = BigInt(value);
  const absolute = cents < 0n ? -cents : cents;
  return `${cents < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

function parseDollars(raw: string): { cents: number | null; valid: boolean } {
  const trimmed = raw.trim();
  if (trimmed === "") return { cents: null, valid: true };
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return { cents: null, valid: false };
  const [dollars = "0", fraction = ""] = trimmed.split(".");
  const cents = BigInt(dollars) * 100n + BigInt(fraction.padEnd(2, "0"));
  return cents <= BigInt(Number.MAX_SAFE_INTEGER)
    ? { cents: Number(cents), valid: true }
    : { cents: null, valid: false };
}

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function MandateView({ onDone }: { onDone: () => void }) {
  const { state, dispatch } = useLab();
  const [form, setForm] = useState<MandateDraft>(() => ({
    organization: state.mandate.organization,
    investorType: state.mandate.investorType,
    capitalType: state.mandate.capitalType,
    stages: [...state.mandate.stages],
    geographies: [...state.mandate.geographies],
    minimum: centsToInput(state.mandate.minimum),
    maximum: centsToInput(state.mandate.maximum),
    objectives: [...state.mandate.objectives],
    impact: [...state.mandate.impact],
    criteria: [...state.mandate.criteria],
  }));
  const [errors, setErrors] = useState<string[]>([]);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (errors.length) errorRef.current?.focus(); }, [errors]);

  const update = <K extends keyof MandateDraft>(key: K, value: MandateDraft[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = () => {
    const min = parseDollars(form.minimum);
    const max = parseDollars(form.maximum);
    const found: string[] = [];
    if (!min.valid) found.push("Enter a minimum ticket in USD from 0 to 90,071,992,547,409.91, using no more than two decimal places.");
    if (!max.valid) found.push("Enter a maximum ticket in USD from 0 to 90,071,992,547,409.91, using no more than two decimal places.");
    if (min.valid && max.valid && min.cents !== null && max.cents !== null && min.cents > max.cents) {
      found.push("The minimum ticket must be less than or equal to the maximum.");
    }
    if (form.stages.length === 0) found.push("Choose at least one funding stage.");
    if (form.geographies.length === 0) found.push("Choose at least one geography.");
    if (found.length) {
      setErrors(found);
      return;
    }
    setErrors([]);
    const mandate: Mandate = {
      organization: form.organization.trim(),
      investorType: form.investorType,
      capitalType: form.capitalType,
      stages: form.stages,
      geographies: form.geographies,
      minimum: min.cents,
      maximum: max.cents,
      objectives: form.objectives,
      impact: form.impact,
      criteria: form.criteria,
      completed: true,
    };
    if (dispatch({ type: "mandate", mandate }, "Investment mandate saved in this browser.")) {
      onDone();
    }
  };

  const chips = (
    label: string,
    hint: string,
    options: [string, string][],
    selected: string[],
    key: "stages" | "geographies" | "objectives" | "impact" | "criteria",
  ) => (
    <fieldset className={iv.fieldset}>
      <legend>{label}</legend>
      <p className={iv.legendHint}>{hint}</p>
      <div className={iv.chipRow}>
        {options.map(([value, text]) => {
          const active = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              className={`${iv.chip} ${active ? iv.chipActive : ""}`}
              aria-pressed={active}
              onClick={() => update(key, toggleValue(selected, value))}
            >
              {active && <Icon name="check" size={13} />}
              {text}
            </button>
          );
        })}
      </div>
    </fieldset>
  );

  return (
    <form noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <div className={s.pageHeading}>
        <div>
          <p className={s.eyebrow}>Investment mandate</p>
          <h1 className={iv.editorialTitle}>Tell us what you fund.</h1>
          <p>Describe your preferences without reserving capital or hiding opportunities. Use fictional details in this preview.</p>
        </div>
      </div>

      {errors.length > 0 && (
        <div ref={errorRef} className={iv.errors} role="alert" tabIndex={-1}>
          <strong>
            <Icon name="help" size={16} />
            Please review your mandate
          </strong>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={iv.mandateLayout}>
        <div className={iv.mandateColumn}>
          <Card title="Organisation and capital" eyebrow="01 / Who is investing">
            <div className={iv.formGrid}>
              <Field label="Organisation">
                <input
                  value={form.organization}
                  onChange={(event) => update("organization", event.target.value)}
                  placeholder="Organisation name"
                />
              </Field>
              <Field label="Investor type">
                <select
                  value={form.investorType}
                  onChange={(event) => update("investorType", event.target.value)}
                >
                  <option value="">Not specified</option>
                  {form.investorType && !INVESTOR_TYPES.some(([id]) => id === form.investorType) && <option value={form.investorType}>Unavailable saved choice: {form.investorType}</option>}
                  {INVESTOR_TYPES.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Capital type">
                <select
                  value={form.capitalType}
                  onChange={(event) => update("capitalType", event.target.value)}
                >
                  <option value="">Not specified</option>
                  {form.capitalType && !CAPITAL_TYPES.some(([id]) => id === form.capitalType) && <option value={form.capitalType}>Unavailable saved choice: {form.capitalType}</option>}
                  {CAPITAL_TYPES.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>

          <Card title="Where and when you invest" eyebrow="02 / Focus">
            {chips(
              "Funding stage focus",
              "Only projects at these stages will match. At least one is required.",
              MANDATE_STAGES.map((option): [string, string] => [option.id, option.name]),
              form.stages,
              "stages",
            )}
            {chips(
              "Geographies",
              "Unknown regions stay available but are marked as needing information, not confirmed matches. At least one is required.",
              GEOGRAPHIES,
              form.geographies,
              "geographies",
            )}
            <div className={iv.formGrid}>
              <Field label="Minimum ticket (USD)" hint="Up to two decimal places, stored exactly as integer cents. Blank means no minimum.">
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.minimum}
                  onChange={(event) => update("minimum", event.target.value)}
                  placeholder="No minimum"
                />
              </Field>
              <Field label="Maximum ticket (USD)" hint="An investment amount, not a percentage or energy quantity. Blank means no ceiling.">
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.maximum}
                  onChange={(event) => update("maximum", event.target.value)}
                  placeholder="No maximum"
                />
              </Field>
            </div>
          </Card>
        </div>

        <div className={iv.mandateColumn}>
          <Card title="What matters to you" eyebrow="03 / Priorities">
            {chips(
              "Investment objectives",
              "Optional preferences, not automatic matching or eligibility rules.",
              OBJECTIVES.map((option): [string, string] => [option, option]),
              form.objectives,
              "objectives",
            )}
            {chips(
              "Impact priorities",
              "Optional priorities, not measured outcomes or program eligibility.",
              IMPACT_PRIORITIES.map((option): [string, string] => [option, option]),
              form.impact,
              "impact",
            )}
            {chips(
              "Decision criteria",
              "Optional.",
              DECISION_CRITERIA.map((option): [string, string] => [option, option]),
              form.criteria,
              "criteria",
            )}
          </Card>

          <Card title="Keep the units separate" eyebrow="Investment is not energy procurement">
            <dl className={iv.dataList}>
              <div><dt>Investment limits</dt><dd>USD per example ticket</dd></div>
              <div><dt>Comparison allocation</dt><dd>Percentage of fixed example benefits</dd></div>
              <div><dt>Purchaser profile preference</dt><dd>{state.profile?.purchaseMwhPerYear === null || state.profile?.purchaseMwhPerYear === undefined
                ? "Not specified (MWh/year)"
                : `${formatNumber(state.profile.purchaseMwhPerYear, 2)} MWh/year (self-declared)`}</dd></div>
              <div><dt>REC quantity / price constraints</dt><dd>Not configured</dd></div>
            </dl>
            <p className={iv.provenance}>Purchaser energy preferences belong to the separate profile; this form does not edit them.
              No conversion from MWh, REC quantities or allocation percentages into an investment ticket is made.
              No procurement, certificate transfer or offtake agreement is available.</p>
          </Card>

          <Card>
            <p className={iv.disclosure}>
              <Icon name="lock" size={15} />
              <span>
                <strong>Self-declared and unverified.</strong> This mandate is illustrative and only drives demo
                matching in your browser. No eligibility, accreditation or identity is checked, and no capital is
                committed.
              </span>
            </p>
            <div className={iv.actions}>
              <Button variant="ghost" onClick={onDone}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" icon="check">
                Save mandate
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </form>
  );
}

function fundingTargetLabel(site: Site | undefined, needId: string | null): string {
  if (!needId) return "Whole project";
  const need = site?.fundingNeeds.find((entry) => entry.id === needId);
  return need
    ? `${need.title} \u00b7 ${need.amount === null ? "USD amount not scoped" : `${money(need.amount)} USD example amount`}`
    : "Previously selected scope is no longer available";
}

export function EngagementsView({ role, onOpen }: { role: Role; onOpen: (id: string) => void }) {
  const { state, dispatch } = useLab();
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const permitted = new Map(roleSites(state, role).map((site) => [site.id, site]));
  const existing = new Set(state.sites.map((site) => site.id));
  const rows = state.engagements
    .map((engagement) => ({
      engagement,
      site: permitted.get(engagement.siteId),
    }))
    .sort((a, b) => b.engagement.at.localeCompare(a.engagement.at) || a.engagement.id.localeCompare(b.engagement.id));
  const interested = rows.filter((row) => row.engagement.state === "interested");
  const withdrawn = rows.filter((row) => row.engagement.state === "withdrawn");
  const pending = interested.find((row) => row.engagement.siteId === withdrawing);
  if (role === "site-owner") return <Empty title="Interest management is role-specific" icon="lock">
    Owners receive separate minimal notices in their action center. Private investor history is not available here.
  </Empty>;

  const renderRow = ({ engagement, site }: (typeof rows)[number]) => {
    const active = engagement.state === "interested";
    const events = site?.activity.filter((event) => event.actor === "investor" &&
      ((event.kind === "interest" && event.scope === "investor") ||
        (role === "operator" && event.kind === "owner_interest" && event.scope === "owner"))) ?? [];
    return <article key={engagement.id} className={`${iv.engagementCard} ${active ? "" : iv.engagementMuted}`}
      aria-label={site ? `${site.name} interest` : "Unavailable project interest"}>
      <div className={iv.engagementMain}>
        {site ? <>
          <p className={iv.listLocality}><Icon name="pin" size={12} />{site.locality}
            {site.region !== "unknown" ? `, ${site.region}` : " / geography unknown"}</p>
          <button type="button" className={iv.linkTitle} onClick={() => onOpen(site.id)}>
            {site.name}<Icon name="diagonal" size={15} />
          </button>
          {active && <p className={iv.targetLine}>Interest scope: {fundingTargetLabel(site, engagement.fundingNeedId)}</p>}
        </> : <>
          <h3>Project no longer available</h3>
          <p className={s.muted}>Project details and evidence are hidden. {role === "operator" ? "The investor record" : "Your interest record"} remains available.</p>
        </>}
        <p className={iv.targetLine}>{role === "operator" ? "Investor record updated" : "Your record updated"}{" "}
          <time dateTime={engagement.at} title={engagement.at}>{shortDate(engagement.at)} (ET)</time>
        </p>
      </div>
      <div className={iv.engagementColumns}>
        <div className={iv.axisColumn}><small>Development stage</small><Pill>{site ? stageName(site.stage) : "Unavailable"}</Pill></div>
        <div className={iv.axisColumn}><small>{role === "operator" ? "Investor engagement" : "Your engagement"}</small>
          <Pill tone={active ? "accent" : "warning"}>{active ? "Interested" : "Withdrawn"}</Pill></div>
      </div>
      {role === "investor" && active && <div className={iv.engagementAction}>
        <Button variant="ghost" icon="close" disabled={!existing.has(engagement.siteId)}
          onClick={() => setWithdrawing(engagement.siteId)}>Withdraw</Button>
      </div>}
      <p className={iv.accessNote}>{role === "operator"
        ? "Operator preview access is independent of investor interest or publication."
        : !site ? "Project access unavailable. Withdrawal is still local; it does not restore publication."
          : active ? "Permitted metadata only. Actual files are unavailable; no funding is recorded."
            : "Summary only. Interest-gated metadata access is revoked; history is retained."}
        {!existing.has(engagement.siteId) && " The source record is missing, so a withdrawal cannot be saved in this preview."}</p>
      {events.length > 0 && <details className={iv.history}>
        <summary>{role === "operator" ? "Investor and owner event history" : "Your interest history"}</summary>
        <ol>{[...events].reverse().map((event) => <li key={event.id}>
          <div><Pill>{event.kind === "owner_interest" ? "Owner notice / minimal disclosure" : "Investor activity / private"}</Pill>
            <time dateTime={event.at} title={event.at}>{shortDate(event.at)} (ET)</time></div>
          <strong>{event.title}</strong><p>{event.detail}</p>
        </li>)}</ol>
      </details>}
    </article>;
  };

  return <div>
      <div className={s.pageHeading}><div>
        <p className={s.eyebrow}>{role === "operator" ? "Pipeline-wide investor interest / synthetic" : "My interests / synthetic"}</p>
        <h1 className={iv.editorialTitle}>{role === "operator" ? "Understand investor interest." : "Keep track of your interests."}</h1>
        <p>{role === "operator"
          ? "A read-only view of preview interest, including unpublished projects. No capital or funding is tracked."
          : "Nonbinding interest stays in this browser. Withdrawal revokes preview access without erasing history."}</p>
      </div></div>
      <p className={iv.axisNote}>
        <Icon name="pipeline" size={14} />
        <span>
          <strong>Development stage</strong> is the operator-managed project lifecycle.{" "}
          <strong>Engagement</strong> is {role === "operator" ? "the investor's nonbinding interest" : "your nonbinding interest"}.
          Interest never advances a stage or funds a project. A separate minimal owner notice reveals no investor identity or amount.
        </span>
      </p>
      {interested.length === 0 && withdrawn.length === 0 ? (
        <Empty
          title={role === "operator" ? "No investor interest yet" : "You have not expressed interest yet"}
          icon="heart"
        >
          {role === "operator"
            ? "A new preview interest creates private investor activity and a separate minimal owner notice."
            : "Open Discover projects to review a published summary and express nonbinding interest."}
        </Empty>
      ) : (
        <>
          {interested.length > 0 && (
            <>
              <div className={s.sectionHeading}>
                <h2>{role === "operator" ? "Active interest" : "Active interests"}</h2>
                <span className={s.muted}>{interested.length} active in this preview</span>
              </div>
              <div className={iv.engagementList}>{interested.map(renderRow)}</div>
            </>
          )}

          {withdrawn.length > 0 && (
            <>
              <div className={s.sectionHeading}>
                <h2>Withdrawn</h2>
                <span className={s.muted}>Investor preview access revoked</span>
              </div>
              <div className={iv.engagementList}>{withdrawn.map(renderRow)}</div>
            </>
          )}
        </>
      )}

      {role === "investor" && pending && (
        <Modal title="Withdraw your interest?" eyebrow="Local preview action" onClose={() => setWithdrawing(null)}>
          <div className={s.stack}>
            <p>
              Withdrawing your interest in <strong>{pending.site?.name ?? "this unavailable project"}</strong> removes your
              interest-gated preview access immediately. The interest history and earlier minimal owner notice remain.
            </p>
            <p className={s.muted}>This is not a live withdrawal, payment cancellation or external notification.
              No capital was committed. An unpublished project stays unavailable.</p>
            <div className={iv.actions}>
              <Button variant="ghost" onClick={() => setWithdrawing(null)}>
                Keep my interest
              </Button>
              <Button variant="danger" icon="close" onClick={() => {
                if (dispatch({ type: "withdraw", id: pending.engagement.siteId },
                  "Preview interest withdrawn. Interest-gated access is revoked; history and earlier owner notices are retained.")) setWithdrawing(null);
              }}>
                Withdraw interest
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>;
}

function reviewGuidance(site: Site): string {
  const result = latestAssessment(site)?.result;
  if (!result) return "No screening result is available. Gather evidence for a human review.";
  if (result === "potentially_viable") return "Consider a human-led feasibility review; the screen is only illustrative.";
  if (result === "more_information_required") return "Clarify the missing information before a human review.";
  return "Review why this example falls outside the illustrative screening criteria.";
}

function composeDraft(site: Site): string {
  const assessment = latestAssessment(site);
  const openNeeds = site.fundingNeeds.filter((need) => need.status === "open");
  return [
    "Example community solar diligence note / guidance-template-v1",
    "",
    `Project: ${site.name} \u2014 ${site.locality}`,
    `Stage: ${stageName(site.stage)}`,
    `Type: ${site.type === "rooftop" ? "Rooftop" : "Land"}`,
    `Illustrative screening: ${assessment ? VIABILITY_LABELS[assessment.result] : "Not screened"}`,
    `Fixture capacity range: ${capacityRangeLabel(site)}`,
    `Fixture annual generation range: ${generationRangeLabel(site)}`,
    `Open example scopes: ${openNeeds.length ? openNeeds.map((need) => need.title).join(", ") : "None recorded"}`,
    `Screening source: ${assessment?.version ?? "Not available"}; snapshot: ${assessment?.createdAt ?? "Not available"}`,
    "",
    `Example follow-up: ${reviewGuidance(site)}`,
    "",
    "Owner benefit, project payback, investor return and utility savings: not calculated.",
    "Assembled deterministically from a synthetic project record. Not AI output, a credit decision, legal advice or an approval.",
  ].join("\n");
}

export function UnderwritingPreview({ site, onClose }: { site: Site; onClose: () => void }) {
  const { state } = useLab();
  const current = state.sites.find((entry) => entry.id === site.id);
  if (!current || !investorVisible(current) || !isInterested(state, current.id) ||
    !state.mandate.completed || state.mandate.investorType !== "special_community_endowment") {
    return <Modal title="Example guidance unavailable" onClose={onClose}>
      <Empty title="This example is not available" icon="lock">
        A published project, active preview interest and the Special Community Endowment preview profile are required.
        No project details or draft are retained in this view when access changes.
      </Empty>
    </Modal>;
  }
  return <UnderwritingDraft key={sourceRevision(current)} site={current} onClose={onClose} />;
}

function UnderwritingDraft({ site, onClose }: { site: Site; onClose: () => void }) {
  const assessment = latestAssessment(site);
  const result = assessment?.result;
  const [draft, setDraft] = useState(() => composeDraft(site));
  const [status, setStatus] = useState<"draft" | "reviewed" | "revision" | "discarded">("draft");

  const reviewQuestions = [
    ...(assessment?.flags ?? []),
    "Screening values are fixed fixtures, not provider estimates or calibrated probabilities.",
    "This preview does not verify ownership, structural suitability, utility access or program eligibility.",
  ];

  const dataUsed: [string, string][] = [
    ["Coarse locality", `${site.locality}${site.region !== "unknown" ? `, ${site.region}` : ""}`],
    ["Project type", site.type === "rooftop" ? "Rooftop" : "Land"],
    ["Development stage", stageName(site.stage)],
    ["Preliminary viability", result ? VIABILITY_LABELS[result] : "Not screened"],
    ["Illustrative capacity", capacityRangeLabel(site)],
    ["Illustrative annual generation", generationRangeLabel(site)],
    ["Screening fixture version", assessment?.version ?? "Not available"],
    ["Screening snapshot (UTC)", assessment?.createdAt ?? "Not available"],
  ];

  const statusMeta: Record<typeof status, { label: string; tone: "neutral" | "positive" | "warning" | "danger"; icon: string }> = {
    draft: { label: "Draft \u2014 awaiting your review", tone: "neutral", icon: "spark" },
    reviewed: { label: "Example marked reviewed (local only)", tone: "positive", icon: "check" },
    revision: { label: "Example marked for revision", tone: "warning", icon: "reset" },
    discarded: { label: "Example marked discarded", tone: "neutral", icon: "close" },
  };
  const current = statusMeta[status];

  const editDraft = (value: string) => {
    setDraft(value);
    if (status !== "draft") setStatus("draft");
  };

  return (
    <Modal
      title="Example diligence guidance"
      eyebrow={"Deterministic sample \u00b7 no AI model connected"}
      wide
      onClose={onClose}
    >
      <div className={s.stack}>
        <p className={iv.aiBanner}>
          <Icon name="spark" size={17} />
          <span>
            <strong>Example guidance, not underwriting.</strong> This text is assembled deterministically from a synthetic record.
            No AI model, credit engine or scoring service is connected. It is not a credit decision, legal action or funding approval.
          </span>
        </p>
        {site.assessmentError && <p className={iv.conditionNote} role="status">
          The example rerun failed. This note uses the last retained screening fixture, not a new result.
        </p>}
        <p className={iv.conditionNote}>
          <Icon name="lock" size={14} />
          Special Community Endowment preview &middot; self-declared profile, not verified authority or accreditation.
        </p>

        <div className={iv.underwritingGrid}>
          <Card title="Data used" eyebrow="From the demo project record">
            <dl className={iv.dataList}>
              {dataUsed.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className={s.muted}>No exact address, coordinates or owner identity are included.</p>
          </Card>
          <Card title="Example follow-up" eyebrow="Deterministic guidance">
            <p className={iv.recommendation}>
              <Icon name="arrow" size={16} />
              {reviewGuidance(site)}
            </p>
            <h3 className={iv.subhead}>Screening questions, not risk probabilities</h3>
            <ul className={iv.flagList}>
              {reviewQuestions.map((flag, index) => (
                <li key={`${index}-${flag}`}>
                  <Icon name="help" size={13} />
                  {flag}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Field
          label="Editable example diligence note"
          hint="Temporary local text. Closing discards edits; changing the source resets this example. No decision is saved."
        >
          <textarea
            rows={10}
            className={iv.draftArea}
            value={draft}
            onChange={(event) => editDraft(event.target.value)}
          />
        </Field>

        <div className={iv.decisionBar}>
          <Pill tone={current.tone}>
            <Icon name={current.icon} size={12} />
            {current.label}
          </Pill>
          <div className={iv.actions}>
            <Button variant="ghost" icon="close" onClick={() => setStatus("discarded")}>
              Discard example
            </Button>
            <Button variant="secondary" icon="reset" onClick={() => setStatus("revision")}>
              Mark for revision
            </Button>
            <Button variant="primary" icon="check" onClick={() => setStatus("reviewed")}>
              Mark example reviewed
            </Button>
          </div>
        </div>
        <p className={s.muted}>
          These controls only annotate this temporary example. They do not save a document review, change a project,
          contact anyone, create a legal agreement or record a credit decision.
        </p>
      </div>
    </Modal>
  );
}

interface LifecycleStage {
  id: string;
  name: string;
  summary: string;
  status: "Local preview" | "Deferred design";
  tone: "positive" | "neutral" | "warning";
}

const LIFECYCLE: LifecycleStage[] = [
  {
    id: "interested",
    name: "Interested",
    summary: "Local nonbinding interest and withdrawal. Published projects can expose permitted metadata, not real files.",
    status: "Local preview",
    tone: "positive",
  },
  {
    id: "committed",
    name: "Committed",
    summary: "Deferred. Legal meaning, responsible actors and disclosure policy need approval. No capital is reserved.",
    status: "Deferred design",
    tone: "neutral",
  },
  {
    id: "underwriting",
    name: "Underwriting",
    summary: "Deferred. A deterministic text example does not perform financial, technical or credit underwriting.",
    status: "Deferred design",
    tone: "neutral",
  },
  {
    id: "approved",
    name: "Approved",
    summary: "Deferred financing decisions are separate from operator acceptance of a site. No approval service is connected.",
    status: "Deferred design",
    tone: "neutral",
  },
  {
    id: "funded",
    name: "Funded",
    summary: "Deferred. Requires verified close and funding evidence; this preview records no funding or transfers.",
    status: "Deferred design",
    tone: "neutral",
  },
];

const DILIGENCE_LOOP = [
  { actor: "Investor", step: "Raises an information request while underwriting." },
  { actor: "Operator", step: "Triages the request and decides how to route it." },
  { actor: "Operator", step: "Optionally forwards a non-sensitive ask to the site owner." },
  { actor: "Site owner", step: "Uploads what is needed into their own single inbox." },
  { actor: "Operator", step: "Resolves the request; the investor never contacts the owner directly." },
];

export function RoadmapView() {
  return (
    <div>
      <div className={s.pageHeading}>
        <div>
          <p className={s.eyebrow}>Deferred design / not transactions</p>
          <h1 className={iv.editorialTitle}>The engagement lifecycle, storyboarded.</h1>
          <p>
            A read-only storyboard of possible later stages. Their policies and services are not available in this preview.
          </p>
        </div>
      </div>

      <p className={iv.roadmapCallout}>
        <Icon name="help" size={17} />
        <span>
          Only local interest and withdrawal are available. Later stages and the request-routing loop below are deferred.
          Nothing here moves funding, sends requests, executes signatures or transfers renewable energy certificates.
        </span>
      </p>

      <div className={s.sectionHeading}>
        <h2>Engagement states</h2>
        <span className={s.muted}>Separate from the project&rsquo;s development stage</span>
      </div>
      <ol className={iv.lifecycle}>
        {LIFECYCLE.map((stage, index) => (
          <li key={stage.id} className={iv.lifecycleStage}>
            <div className={iv.lifecycleTop}>
              <span className={iv.lifecycleIndex}>{String(index + 1).padStart(2, "0")}</span>
              <Pill tone={stage.tone}>{stage.status}</Pill>
            </div>
            <h3>{stage.name}</h3>
            <p>{stage.summary}</p>
          </li>
        ))}
      </ol>

      <div className={s.sectionHeading}>
        <h2>Diligence loop</h2>
        <span className={s.muted}>Design only &middot; routes through the operator</span>
      </div>
      <ol className={iv.diligence}>
        {DILIGENCE_LOOP.map((entry, index) => (
          <li key={`${entry.actor}-${index}`} className={iv.diligenceStep}>
            <span className={iv.diligenceIndex}>{index + 1}</span>
            <div>
              <strong>{entry.actor}</strong>
              <p>{entry.step}</p>
            </div>
          </li>
        ))}
      </ol>

      <Card>
        <h3 className={iv.subhead}>What stays true throughout</h3>
        <ul className={iv.ruleList}>
          <li>
            <Icon name="check" size={14} />
            Engagement state never changes a project&rsquo;s development stage.
          </li>
          <li>
            <Icon name="check" size={14} />
            Nonbinding interest is not a commitment. Later financial and legal terms remain undecided.
          </li>
          <li>
            <Icon name="check" size={14} />
            Future request routing must protect owner contacts and private documents.
          </li>
          <li>
            <Icon name="check" size={14} />
            Preview withdrawal revokes interest-gated access without erasing truthful history.
          </li>
        </ul>
        <p className={s.muted}>
          This storyboard does not unlock a new role, real files, a payment service or a signing service.
        </p>
      </Card>
    </div>
  );
}
