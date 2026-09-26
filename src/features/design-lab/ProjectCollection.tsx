"use client";

import { useEffect, useState } from "react";
import { CollectionResults } from "@/components/workspace";
import { JOURNEY_STAGES, VIABILITY_LABELS, capacity, latestAssessment, type Role, type Site } from "./model";
import { assessmentScopeLabel, compareLifecycle, projectReadRow } from "./demoPresentation";
import { GuidanceAssistant } from "./Guidance";
import { Button, Empty, Field, MapDiagram, Pill } from "./ui";
import s from "./ProjectCollection.module.css";

interface CollectionSelection { query: string; stage: string; region: string; screening: string; flag: string; size: string; sort: string; page: number; pageSize: number; display: "list" | "cards"; selected: string | null }
const previewSelections = new Map<Role, CollectionSelection>();

export function resetCollectionPreferences() { previewSelections.clear(); }

interface ProjectCollectionProps {
  sites: Site[];
  role: Role;
  onOpen: (id: string) => void;
  onDocuments?: (id: string) => void;
  onReports?: (id: string) => void;
}

export function ProjectCollection({ sites, role, onOpen, onDocuments, onReports }: ProjectCollectionProps) {
  const remembered = typeof window === "undefined" ? undefined : previewSelections.get(role);
  const [query, setQuery] = useState(remembered?.query ?? "");
  const [stage, setStage] = useState(remembered?.stage ?? "");
  const [region, setRegion] = useState(remembered?.region ?? "");
  const [screening, setScreening] = useState(remembered?.screening ?? "");
  const [flag, setFlag] = useState(remembered?.flag ?? "");
  const [size, setSize] = useState(remembered?.size ?? "");
  const [sort, setSort] = useState(remembered?.sort ?? "name");
  const [page, setPage] = useState(remembered?.page ?? 0);
  const [pageSize, setPageSize] = useState(remembered?.pageSize ?? 25);
  const [display, setDisplay] = useState<"list" | "cards">(remembered?.display ?? "list");
  const [selected, setSelected] = useState<string | null>(remembered?.selected ?? null);
  const flags = [...new Set(sites.flatMap((site) => latestAssessment(site)?.flags ?? []))].sort((a, b) => a.localeCompare(b));
  const filtered = sites.filter((site) =>
    `${site.name} ${site.locality}`.toLowerCase().includes(query.trim().toLowerCase()) &&
    (!stage || site.stage === stage || (stage === "unstarted" && !site.stage)) &&
    (!region || site.region === region) &&
    (!screening || (screening === "unscreened" ? !latestAssessment(site) : latestAssessment(site)?.result === screening)) &&
    (!flag || (flag === "unscreened" ? !latestAssessment(site) : flag === "none_recorded"
      ? !!latestAssessment(site) && latestAssessment(site)?.flags.length === 0
      : latestAssessment(site)?.flags.includes(flag.slice(5)))) &&
    (!size || (size === "unknown" ? !latestAssessment(site)?.capacity : latestAssessment(site)?.capacity &&
      (size === "small" ? capacity(site) < 250 : capacity(site) >= 250))),
  ).sort((a, b) => {
    if (sort === "capacity") {
      const aKnown = latestAssessment(a)?.capacity !== null && latestAssessment(a)?.capacity !== undefined;
      const bKnown = latestAssessment(b)?.capacity !== null && latestAssessment(b)?.capacity !== undefined;
      return Number(bKnown) - Number(aKnown) || capacity(b) - capacity(a) || a.id.localeCompare(b.id);
    }
    if (sort === "stage" || sort === "stage-desc") return compareLifecycle(a, b, sort === "stage-desc");
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  if (page !== currentPage) setPage(currentPage);
  if (selected && !filtered.some((site) => site.id === selected)) setSelected(null);
  const shown = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const active = filtered.find((site) => site.id === selected) ?? shown[0];
  useEffect(() => {
    previewSelections.set(role, { query, stage, region, screening, flag, size, sort, page: currentPage, pageSize, display, selected });
  }, [role, query, stage, region, screening, flag, size, sort, currentPage, pageSize, display, selected]);
  const change = (setter: (value: string) => void, value: string) => { setter(value); setPage(0); };
  const clear = () => { setQuery(""); setStage(""); setRegion(""); setScreening(""); setFlag(""); setSize(""); setSort("name"); setPage(0); };
  const open = (siteId: string) => {
    setSelected(siteId);
    previewSelections.set(role, { query, stage, region, screening, flag, size, sort, page: currentPage, pageSize, display, selected: siteId });
    onOpen(siteId);
  };
  const select = (siteId: string) => {
    const index = filtered.findIndex((site) => site.id === siteId);
    if (index < 0) return;
    setSelected(siteId);
    setPage(Math.floor(index / pageSize));
  };

  return <div className={s.collection}>
    <section className={s.filters} aria-label="Project filters">
      <Field label="Search projects"><input type="search" placeholder="Name or example district" value={query} onChange={(event) => change(setQuery, event.target.value)} /></Field>
      <Field label="Project stage"><select value={stage} onChange={(event) => change(setStage, event.target.value)}><option value="">All stages</option><option value="unstarted">Project not started</option>{JOURNEY_STAGES.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Geography"><select value={region} onChange={(event) => change(setRegion, event.target.value)}><option value="">All geographies</option><option value="GA">Georgia examples</option><option value="TN">Tennessee examples</option><option value="unknown">Unknown</option></select></Field>
      <Field label="Screening outcome"><select value={screening} onChange={(event) => change(setScreening, event.target.value)}><option value="">All screening states</option><option value="unscreened">Not screened</option>{Object.entries(VIABILITY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field>
      <Field label="Screening flag"><select value={flag} onChange={(event) => change(setFlag, event.target.value)}><option value="">All flags</option><option value="unscreened">Not screened</option><option value="none_recorded">None recorded (screened only)</option>{flags.map((value) => <option value={`flag:${value}`} key={value}>{value}</option>)}{flag.startsWith("flag:") && !flags.includes(flag.slice(5)) && <option value={flag}>Selected flag no longer available</option>}</select></Field>
      <Field label="Illustrative capacity"><select value={size} onChange={(event) => change(setSize, event.target.value)}><option value="">All capacities</option><option value="small">Under 250 kW</option><option value="large">250 kW and above</option><option value="unknown">Not calculated</option></select></Field>
      <Field label="Sort projects"><select value={sort} onChange={(event) => change(setSort, event.target.value)}><option value="name">Project name</option><option value="capacity">Capacity, highest first</option><option value="stage">Lifecycle, earliest first</option><option value="stage-desc">Lifecycle, latest first</option></select></Field>
    </section>
    <div className={s.results}><p role="status">{filtered.length} of {sites.length} permitted fictional projects in the filtered set{shown.length ? `; showing ${currentPage * pageSize + 1}-${currentPage * pageSize + shown.length}` : "; this page is empty"}.</p><Button variant="ghost" onClick={clear}>Clear filters</Button></div>
    <section className={s.mapPanel} aria-label="Linked illustrative map">
      <div className={s.mapHeader}><div><h2>A shared view of possibility</h2><p>Map covers the entire filtered set: {filtered.filter((site) => site.mapPosition).length} of {filtered.length} have fictional positions. Select a pin to reveal its list page.</p><p>Invented neighborhood diagram, not real geography or geocoding. Projects without positions remain in the list.</p></div><Pill>Fictional map</Pill></div>
      <MapDiagram sites={filtered} {...(active ? { selected: active.id } : {})} onSelect={select} large />
    </section>
    <div className={s.companionLayout}>
      <div className={s.collectionBody}>
        <div className={s.results}>
          <div role="group" aria-label="Project presentation" className={s.presentation}>
            <Button aria-pressed={display === "list"} onClick={() => setDisplay("list")}>List</Button>
            <Button aria-pressed={display === "cards"} onClick={() => setDisplay("cards")}>Cards</Button>
          </div>
          <Field label="Projects per page"><select value={pageSize} onChange={(event) => {
            const next = Number(event.target.value);
            if (![25, 50, 100].includes(next)) return;
            const anchor = selected ? filtered.findIndex((site) => site.id === selected) : currentPage * pageSize;
            setPageSize(next); setPage(Math.floor(Math.max(0, anchor) / next));
          }}>{[25, 50, 100].map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
        </div>
        <p className={s.provenance}>Same fields in cards and list. Capacity is a fictional range midpoint in kW, not installed capacity or energy. Unstarted/unknown stages sort last in either lifecycle direction. {assessmentScopeLabel(filtered)}</p>
        {active && !shown.some((site) => site.id === active.id) && <Button variant="ghost" onClick={() => select(active.id)}>Show selected project: {active.name}</Button>}
        {shown.length ? <CollectionResults rows={shown.map(projectReadRow)} selectedId={active?.id ?? null} onSelect={select} onOpen={open} display={display} label="Project results" /> :
          <Empty title="No matching projects">Broaden the filters above. No records or visibility grants have been changed.</Empty>}
        <div className={s.pagination}><span>Page {currentPage + 1} of {pageCount} &middot; {role === "investor" ? "Published projects only" : "Synthetic workspace"}</span><div><Button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button><Button disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button></div></div>
      </div>
      <GuidanceAssistant key={`${role}-${active?.id ?? "none"}`} role={role} {...(active ? { siteId: active.id } : {})}
        {...(active && onDocuments ? { onNavigate: (_role: Role, view: string) => view === "reports" ? onReports?.(active.id) : onDocuments(active.id) } : {})} />
    </div>
  </div>;
}
