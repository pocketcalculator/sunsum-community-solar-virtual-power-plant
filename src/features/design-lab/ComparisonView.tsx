"use client";

import { useId, useState } from "react";
import { DASHBOARD_LOCATIONS, MAX_SELECTED_LOCATIONS, RETURN_POINTS } from "@/features/site-owner-dashboard/model/mockDashboard";
import { formatNumber, makeDraft, money, roleSites } from "./model";
import { useLab } from "./store";
import { Button, Card, Empty, Field, Icon, Pill } from "./ui";
import s from "./Lab.module.css";
import c from "./ComparisonView.module.css";

const periods = [5, 10, 20] as const;
const originalTotal = 178000;

export function calculateComparison(ids: string[], horizon: number, personalShare: number) {
  const point = RETURN_POINTS.find((entry) => entry.year === horizon);
  const factor = point ? (point.individualDollars + point.communityDollars) / originalTotal : 1;
  return DASHBOARD_LOCATIONS.filter((site) => ids.includes(site.id)).map((site) => {
    // Round each displayed allocation to whole USD before aggregating, retaining integer cents.
    const cents = Math.round(((site.individualReturnDollars ?? 0) + (site.communityReturnDollars ?? 0)) * factor) * 100;
    const personal = Math.round(cents * personalShare / 10000) * 100;
    return { id: site.id, personal, community: cents - personal };
  });
}

function allocationValue(raw: string) {
  const value = Number(raw);
  return /^\d+$/.test(raw) && Number.isInteger(value) && value >= 10 && value <= 90 && value % 5 === 0
    ? value : null;
}

export function ComparisonView() {
  const { state, dispatch, notify } = useLab();
  const [query, setQuery] = useState("");
  const [ids, setIds] = useState(DASHBOARD_LOCATIONS.filter((site) => site.selectedByDefault).map((site) => site.id));
  const [horizon, setHorizon] = useState(20);
  const [share, setShare] = useState(40);
  const [shareInput, setShareInput] = useState("40");
  const [run, setRun] = useState(() => ({ ids, horizon: 20, share: 40, rows: calculateComparison(ids, 20, 40) }));
  const [customAddress, setCustomAddress] = useState("");
  const [showData, setShowData] = useState(false);
  const [hoverYear, setHoverYear] = useState<number | null>(null);
  const gradientId = useId().replaceAll(":", "");
  const validAllocation = allocationValue(shareInput) !== null;
  const dirty = run.ids.join("|") !== ids.join("|") || run.horizon !== horizon || run.share !== share || !validAllocation;
  const personal = run.rows.reduce((sum, row) => sum + row.personal, 0);
  const community = run.rows.reduce((sum, row) => sum + row.community, 0);
  const horizonPoint = RETURN_POINTS.find((point) => point.year === run.horizon);
  const denominator = horizonPoint ? horizonPoint.individualDollars + horizonPoint.communityDollars : originalTotal;
  const points = RETURN_POINTS.filter((point) => point.year <= run.horizon).map((point) => ({
    year: point.year,
    personal: Math.round(personal * (point.individualDollars + point.communityDollars) / denominator),
    community: Math.round(community * (point.individualDollars + point.communityDollars) / denominator),
  }));
  const maximum = Math.max(personal, community, 100);
  const line = (key: "personal" | "community") => points.map((point, index) => `${index ? "L" : "M"}${44 + (point.year / run.horizon) * 592} ${218 - point[key] / maximum * 174}`).join(" ");
  const activePoint = points.find((point) => point.year === hoverYear) ?? points.at(-1);
  const shown = DASHBOARD_LOCATIONS.filter((site) => `${site.address} ${site.locality}`.toLowerCase().includes(query.toLowerCase()));
  const drafts = roleSites(state, "site-owner").filter((site) => site.mapPosition === null && site.status === "draft");
  const updateShare = (raw: string) => {
    setShareInput(raw);
    const value = allocationValue(raw);
    if (value !== null) setShare(value);
  };
  const toggle = (id: string) => {
    if (ids.includes(id)) setIds(ids.filter((item) => item !== id));
    else if (ids.length >= MAX_SELECTED_LOCATIONS) notify("Choose up to five example sites. Remove one before adding another.");
    else setIds([...ids, id]);
  };
  const addAddress = () => {
    if (!customAddress.trim()) { notify("Enter an address to create a local draft."); return; }
    const draft = makeDraft();
    draft.name = customAddress.trim();
    draft.address = customAddress.trim();
    if (dispatch({ type: "save-site", site: draft }, "Address saved as a local draft. It is not geocoded and is excluded from the comparison.")) {
      setCustomAddress("");
    }
  };

  return <div>
    <div className={s.pageHeading}><div><p className={s.eyebrow}>Original comparison / separate example dataset</p><h1>Compare example benefit allocations.</h1><p>Explore ten fixed fixtures, not project forecasts or investor returns.</p></div><Pill tone="warning">Illustrative only</Pill></div>
    <section className={c.scopeNote} aria-label="Comparison scope">
      <strong>Ten read-only examples, not your portfolio.</strong>
      <p>The {DASHBOARD_LOCATIONS.length} original locations are separate from the {state.sites.length} fictional sites in this browser.
        Selecting, accepting or publishing a project never adds it to these calculations. Custom drafts have no calculated return or payback.</p>
    </section>
    <div className={c.layout}>
      <Card title="Start with a few places" eyebrow="01 / Choose your sites" className={c.selector}>
        <div className={c.search}><Icon name="search" size={16} /><input aria-label="Filter example locations" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search address or neighborhood" /></div>
        <p className={c.selectionCount}>{ids.length} of {MAX_SELECTED_LOCATIONS} sites selected <span>{DASHBOARD_LOCATIONS.length} original example locations</span></p>
        <div className={c.locations}>{shown.map((site) => <label className={`${c.location} ${ids.includes(site.id) ? c.selected : ""}`} key={site.id}>
          <input type="checkbox" checked={ids.includes(site.id)} onChange={() => toggle(site.id)} />
          <span><strong>{site.shortLabel}</strong><small>{site.locality} &middot; {site.areaSquareFeet === null ? "Area not supplied" : `${formatNumber(site.areaSquareFeet)} ft\u00b2`}</small></span><Icon name="roof" size={17} />
        </label>)}{shown.length === 0 && <p className={s.muted}>No example locations match your search.</p>}</div>
        <div className={c.custom}><Field label="Have somewhere else in mind?" hint="Use a fictional address. This saves a local draft only, with no geocoding, screening or financial calculation."><input value={customAddress} onChange={(event) => setCustomAddress(event.target.value)} placeholder="Enter a fictional address" /></Field><Button onClick={addAddress} icon="plus">Add address draft</Button></div>
      </Card>
      <div className={c.results}>
        <Card title="The longer view" eyebrow="02 / Explore the scenario" action={<div className={c.periods} role="group" aria-label="Comparison horizon">{periods.map((period) => <button key={period} type="button" className={horizon === period ? c.periodActive : ""} onClick={() => setHorizon(period)} aria-pressed={horizon === period}>{period} yr</button>)}</div>}>
          <p className={c.latestRun}>Latest run: {run.ids.length} selected examples, {run.horizon} years, {run.share}% individual / {100 - run.share}% community.</p>
          <div className={c.chartTotals}><div><span><i />Individual allocation</span><strong>{money(activePoint?.personal ?? personal)}</strong></div><div><span><i />Community allocation</span><strong>{money(activePoint?.community ?? community)}</strong></div><p>Year {activePoint?.year ?? run.horizon}<small>Cumulative illustration, USD</small></p></div>
          <svg className={c.chart} viewBox="0 0 680 255" role="img" aria-label={`Illustrative ${run.horizon}-year cumulative allocations: ${money(personal)} individual and ${money(community)} community, in USD. Not a forecast.`} onMouseMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const year = Math.max(1, Math.min(run.horizon, (event.clientX - box.left) / box.width * run.horizon));
            setHoverYear(points.reduce((a, b) => Math.abs(b.year - year) < Math.abs(a.year - year) ? b : a).year);
          }} onMouseLeave={() => setHoverYear(null)}>
            <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--lab-accent-ink)" stopOpacity=".16" /><stop offset="100%" stopColor="var(--lab-accent-ink)" stopOpacity="0" /></linearGradient></defs>
            {[.0, .33, .66, 1].map((fraction) => <g key={fraction}><line x1="44" x2="640" y1={218 - fraction * 174} y2={218 - fraction * 174} stroke="var(--lab-line)" strokeDasharray="3 5" /><text x="3" y={222 - fraction * 174} fill="var(--lab-muted)" fontSize="10">{formatNumber(maximum * fraction / 100000)}k</text></g>)}
            <path d={`${line("community")} L636 218 L${44 + 592 / run.horizon} 218Z`} fill={`url(#${gradientId})`} />
            <path d={line("community")} stroke="var(--lab-accent-ink)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d={line("personal")} stroke="var(--lab-chart-secondary)" strokeWidth="2" fill="none" strokeDasharray="6 5" strokeLinecap="round" />
            {points.filter((_, index) => index % 2 === 0 || index === points.length - 1).map((point) => <text key={point.year} x={44 + point.year / run.horizon * 592} y="248" textAnchor="middle" fill="var(--lab-muted)" fontSize="11">Year {point.year}</text>)}
            {activePoint && <><line x1={44 + activePoint.year / run.horizon * 592} x2={44 + activePoint.year / run.horizon * 592} y1="30" y2="218" stroke="var(--lab-muted)" strokeDasharray="2 5" /><circle cx={44 + activePoint.year / run.horizon * 592} cy={218 - activePoint.community / maximum * 174} r="5" fill="var(--lab-accent-ink)" stroke="var(--lab-surface)" strokeWidth="2" /></>}
          </svg>
          <div className={c.chartNote}><p>Fixed example benefits, not actual owner payments or investor returns. Axis: USD thousands. Use the data table without hovering.</p><Button variant="ghost" aria-expanded={showData} aria-controls={`comparison-data-${gradientId}`} onClick={() => setShowData(!showData)}>{showData ? "Hide" : "View"} data</Button></div>
          {showData && <div className={c.tableScroll} id={`comparison-data-${gradientId}`}><table className={c.dataTable}><caption>Cumulative illustrative allocations in USD / latest {run.horizon}-year run</caption><thead><tr><th scope="col">Year</th><th scope="col">Individual allocation</th><th scope="col">Community allocation</th></tr></thead><tbody>{points.map((point) => <tr key={point.year}><th scope="row">{point.year}</th><td>{money(point.personal)}</td><td>{money(point.community)}</td></tr>)}</tbody></table></div>}
          <details className={c.assumptions}>
            <summary>Sources and assumptions</summary>
            <dl>
              <div><dt>Source</dt><dd>site-owner-dashboard/model/mockDashboard.ts: DASHBOARD_LOCATIONS and RETURN_POINTS.</dd></div>
              <div><dt>Source version</dt><dd>Retained original repository fixtures; no version or as-of date is recorded in that source.</dd></div>
              <div><dt>Units and period</dt><dd>Source amounts are USD in major units. Results are cumulative over 5, 10 or 20 example years, not annual payments.</dd></div>
              <div><dt>Existing calculation</dt><dd>Each location&apos;s combined fixture benefits follow the original return-point proportions against a USD 178,000 reference total, then split by the selected percentage.</dd></div>
              <div><dt>Rounding</dt><dd>Per-location allocations round to whole USD, represented as integer cents. Displayed rows reconcile to the displayed total.</dd></div>
              <div><dt>Not modeled</dt><dd>No tariffs, PPA revenue, tax credits, financing costs, discount rates, project payback, actual generation or impact methodology. No financial model is applied to the 50-site fresh preview.</dd></div>
            </dl>
          </details>
        </Card>
        <Card title="Make the benefits go further" eyebrow="03 / Explore allocation">
          <div className={c.allocationLabels}><span><Icon name="roof" size={17} />Individual <strong>{share}%</strong></span><span><Icon name="people" size={17} />Community <strong>{100 - share}%</strong></span></div>
          <div className={c.allocationControls}>
            <input className={c.slider} aria-label="Individual allocation percentage" type="range" min="10" max="90" step="5" value={share} onChange={(event) => updateShare(event.target.value)} />
            <Field label="Individual allocation (%)"><input type="number" inputMode="numeric" min="10" max="90" step="5" value={shareInput}
              aria-invalid={!validAllocation} aria-describedby={`allocation-help-${gradientId}`} onChange={(event) => updateShare(event.target.value)} /></Field>
          </div>
          <p id={`allocation-help-${gradientId}`} className={validAllocation ? c.allocationHint : c.allocationError}
            role={validAllocation ? undefined : "alert"}>{validAllocation
              ? "10-90%, in steps of 5. A percentage of a fixed fictional total, not money reserved."
              : "Enter an allocation from 10% to 90% in steps of 5. The slider retains the last valid value; results have not changed."}</p>
          <div className={c.simulateRow}><p aria-live="polite">{dirty ? "Your choices changed. Run again to update the results." : `${run.ids.length} sites in the latest ${run.horizon}-year scenario.`}<small>This changes no investment mandate, purchaser MWh/year or REC limits, interest, agreement or funding.</small></p><Button variant="primary" icon="play" disabled={ids.length === 0 || !validAllocation} onClick={() => {
            setRun({ ids: [...ids], horizon, share, rows: calculateComparison(ids, horizon, share) });
            setHoverYear(null);
            notify("Illustrative comparison updated. Per-site values add up to the totals shown.");
          }}>Run comparison</Button></div>
        </Card>
        <Card title="Different questions, different measures" eyebrow="Site-specific finances remain unknown">
          <dl className={c.financialMeanings}>
            <div><dt>Owner benefit</dt><dd>Not calculated. Owner-directed cash, USD; payment period not defined.</dd></div>
            <div><dt>Project payback</dt><dd>Not calculated. Years to break even; no project cash-flow model.</dd></div>
            <div><dt>Investor return</dt><dd>Not calculated. Investor cash return, USD; horizon not defined. Not the individual allocation above.</dd></div>
            <div><dt>Utility savings</dt><dd>Not calculated. Avoided utility bill cost, USD/year; no tariff baseline.</dd></div>
          </dl>
        </Card>
      </div>
    </div>
    <div className={s.sectionHeading}><h2>The ten original examples</h2><span className={s.muted}>{run.ids.length} in latest comparison &middot; cumulative USD over {run.horizon} years</span></div>
    <div className={c.comparisonStrip} role="list" aria-label="Original comparison fixtures">{DASHBOARD_LOCATIONS.map((site) => {
      const result = run.rows.find((row) => row.id === site.id);
      return <div className={`${c.comparisonCard} ${result ? c.comparisonIncluded : ""}`} role="listitem" key={site.id}><div className={c.comparisonTop}><Icon name="roof" size={18} /><Pill tone={result ? "positive" : "neutral"}>{result ? "In latest run" : "Not in run"}</Pill></div><h3>{site.shortLabel}</h3><p>{site.locality}</p><dl><div><dt>Individual</dt><dd>{result ? money(result.personal) : "Not in run"}</dd></div><div><dt>Community</dt><dd>{result ? money(result.community) : "Not in run"}</dd></div></dl><Button variant="ghost" onClick={() => toggle(site.id)} icon={ids.includes(site.id) ? "check" : "plus"}>{ids.includes(site.id) ? "Selected" : "Select site"}</Button></div>;
    })}</div>
    {drafts.length > 0 && <section aria-label="Local address drafts"><div className={s.sectionHeading}><h2>Address drafts are not modeled</h2></div>
      <div className={c.comparisonStrip}>{drafts.map((draft) => <div className={c.comparisonCard} key={draft.id}><Pill tone="warning">Local draft only</Pill><h3>{draft.name}</h3><p>No map position. Site-specific return and payback: not calculated.</p><p>Excluded from all comparison totals.</p></div>)}</div>
    </section>}
    {ids.length === 0 && <Empty title="Choose a place to begin" icon="map">Select at least one example location to run a comparison.</Empty>}
  </div>;
}
