"use client";

import { capacity, formatNumber, latestAssessment, projectTasks, roleSites, stageName, type Role, type Site, type View } from "./model";
import { useLab } from "./store";
import { Button, Card, Icon, MapDiagram, Pill, SiteCard } from "./ui";
import s from "./Lab.module.css";

interface OverviewProps {
  role: Role;
  onNavigate: (view: View) => void;
  onOpen: (id: string) => void;
  siteId?: string;
}

function SolarHalo({ sites }: { sites: Site[] }) {
  const total = sites.reduce((sum, site) => sum + capacity(site), 0);
  const approved = sites.filter((site) => site.status === "accepted").reduce((sum, site) => sum + capacity(site), 0);
  const circumference = 534;
  return <div className={s.halo}>
    <svg viewBox="0 0 240 240" fill="none" aria-hidden="true">
      <circle cx="120" cy="120" r="106" stroke="var(--lab-line)" strokeWidth="1" strokeDasharray="1 6" />
      <circle cx="120" cy="120" r="85" stroke="var(--lab-map-park)" strokeWidth="18" />
      <circle cx="120" cy="120" r="85" stroke="var(--lab-accent-ink)" strokeWidth="18" strokeLinecap="round" strokeDasharray={`${circumference * (total ? approved / total : 0)} ${circumference}`} />
      <circle cx="120" cy="120" r="65" stroke="var(--lab-line)" strokeWidth="1" />
    </svg>
    <div className={s.haloCenter}><div className={s.haloIcon}><Icon name="sun" size={22} /></div><strong>{sites.some((site) => latestAssessment(site)?.capacity) ? formatNumber(total / 1000, 2) : "--"}</strong><span>MW &middot; synthetic potential</span><span>Not actual generation</span></div>
  </div>;
}

function Metrics({ sites, role, interests }: { sites: Site[]; role: Role; interests: number }) {
  const accepted = sites.filter((site) => site.status === "accepted" && site.stage !== null);
  const total = sites.reduce((sum, site) => sum + capacity(site), 0);
  const production = sites.reduce((sum, site) => {
    const range = latestAssessment(site)?.generation;
    return sum + (range ? (range[0] + range[1]) / 2 : 0);
  }, 0);
  const attention = sites.reduce((sum, site) => sum + projectTasks(site).filter((task) => task.kind === "evidence" && task.status !== "reviewed").length, 0);
  const knownCapacity = sites.filter((site) => latestAssessment(site)?.capacity).length;
  const knownGeneration = sites.filter((site) => latestAssessment(site)?.generation).length;
  const values = [
    { label: role === "investor" ? "Projects to discover" : "Sites in your community", value: String(sites.length).padStart(2, "0"), unit: "", icon: "roof", foot: `${accepted.length} in development pipeline`, positive: false },
    { label: "Illustrative solar capacity", value: knownCapacity ? formatNumber(total, 1) : "--", unit: "kW", icon: "bolt", foot: `${knownCapacity}/${sites.length} fixture ranges; unknowns excluded`, positive: false },
    { label: "Annual generation potential", value: knownGeneration ? formatNumber(production / 1000, 0) : "--", unit: "MWh/year", icon: "sun", foot: `${knownGeneration}/${sites.length} synthetic ranges; not actuals`, positive: false },
    { label: role === "site-owner" ? "Needs your attention" : "Expressions of interest", value: String(role === "site-owner" ? attention : interests).padStart(2, "0"), unit: "", icon: role === "site-owner" ? "inbox" : "heart", foot: role === "site-owner" ? "One place for your next steps" : "Non-binding, no capital committed", positive: false },
  ];
  return <div className={s.metrics}>{values.map((metric) => <div className={s.metric} key={metric.label}>
    <div className={s.metricLabel}><span>{metric.label}</span><Icon name={metric.icon} size={16} /></div>
    <div className={s.metricValue}>{metric.value}<small>{metric.unit}</small></div>
    <p className={s.metricFoot}>{metric.foot}</p>
  </div>)}</div>;
}

export function Overview({ role, onNavigate, onOpen, siteId }: OverviewProps) {
  const { state } = useLab();
  const sites = roleSites(state, role).filter((site) => !siteId || site.id === siteId);
  const interests = state.engagements.filter((entry) => entry.state === "interested" && sites.some((site) => site.id === entry.siteId)).length;
  const pending = sites.filter((site) => site.status === "screening" || site.status === "submitted");
  const next = (role === "operator" ? pending[0] : role === "site-owner" ? sites.find((site) => site.outstanding.length) : sites[0]) ?? sites[0];
  const openCollection: View = role === "investor" ? "portfolio" : role === "operator" ? "pipeline" : "sites";
  const actionLabel = role === "site-owner" ? "Add a solar site" : role === "operator" ? "Review submissions" : "Explore projects";
  const primaryAction = () => onNavigate(role === "site-owner" ? "intake" : role === "operator" ? "queue" : "portfolio");
  const title = siteId ? sites[0]?.name ?? "Project overview" : role === "site-owner" ? "Your community, looking brighter." : role === "operator" ? "Every site, moving forward." : "Good projects. Shared progress.";

  return <div>
    <div className={s.pageHeading}><div><p className={s.eyebrow}>{siteId ? "Selected project" : "Your community portfolio"} &middot; synthetic preview</p><h1>{title}</h1><p>Keep the next handoff clear, from first idea to review.</p></div><Button variant="primary" icon={role === "site-owner" ? "plus" : "arrow"} onClick={primaryAction}>{actionLabel}</Button></div>
    {role === "site-owner" && !state.profile?.completed && <div className={`${s.selectionHint} ${s.row}`}><p>Start with a fictional profile. You can revisit every answer.</p><Button onClick={() => onNavigate("profile")}>Review my profile</Button></div>}
    {role === "operator" && <Card title="Action center" action={<Button onClick={() => onNavigate("queue")}>Open all work</Button>}>
      <p className={s.muted}>Begin with the next human handoff. Figures below are context, not approval or automated work.</p>
      <div className={s.stack}>{sites.slice(0, 4).map((site) => <Button key={site.id} data-project-open={site.id} onClick={() => onOpen(site.id)}>{site.name}: {site.nextAction || "Review current project state"}</Button>)}</div>
    </Card>}
    <div className={s.hero}><div className={s.heroCopy}><p className={s.eyebrow}>Small spaces. Collective possibility.</p><h2>{role === "investor" ? <>See the project.<br /><em>Understand the next step.</em></> : role === "operator" ? <>Local projects.<br /><em>A shared way forward.</em></> : <>Your space.<br /><em>Our brighter future.</em></>}</h2><p>Explore connected workflows using fictional projects. Every estimate keeps its assumptions in view.</p><Button icon="arrow" onClick={() => onNavigate(role === "site-owner" ? "compare" : openCollection)}>{role === "site-owner" ? "Explore your solar potential" : "Explore the community portfolio"}</Button></div><SolarHalo sites={sites} /></div>
    <Metrics sites={sites} role={role} interests={interests} />
    <div className={s.overviewGrid}>
      <Card className={s.mapCard} title={sites.length > 6 ? "Six projects in focus" : "Your projects in focus"} action={<Button variant="ghost" onClick={() => onNavigate(openCollection)}>View all {sites.length} <Icon name="diagonal" size={14} /></Button>}><MapDiagram sites={sites.slice(0, 6)} onSelect={onOpen} /></Card>
      <Card className={s.nextStep} title={role === "investor" ? "One project to understand" : "A small step forward"} action={<Pill tone={role === "investor" ? "neutral" : "warning"}>{role === "investor" ? "In focus" : "Up next"}</Pill>}>
        <span className={s.nextStepIcon}><Icon name={role === "investor" ? "heart" : "file"} /></span>
        <h3>{role === "investor" ? next?.name ?? "Explore a published example" : role === "operator" ? "A project needs your review" : "Help your site move forward"}</h3>
        <p>{role === "investor" ? "Discover the project, review its potential, and express non-binding interest." : next?.nextAction ?? "Add your first site to begin the journey."}</p>
        <div className={s.dateRow}><span>{role === "investor" ? "Project stage" : "Project"}</span><strong>{role === "investor" ? stageName(next?.stage ?? null) : next?.locality ?? "Your community"}</strong></div>
        <Button icon="arrow" onClick={() => next ? onOpen(next.id) : primaryAction()}>{role === "investor" ? "Explore this project" : "See what's needed"}</Button>
      </Card>
    </div>
    <div className={s.sectionHeading}><h2>{role === "investor" ? "Meet your next opportunity" : "A little closer to solar"}</h2><Button variant="ghost" onClick={() => onNavigate(openCollection)}>All projects <Icon name="arrow" size={15} /></Button></div>
    <div className={s.siteGrid}>{sites.slice(0, 3).map((site) => <SiteCard key={site.id} site={site} onOpen={onOpen} role={role} />)}</div>
    <p className={s.muted}>Source: design-fixture-v1 synthetic ranges. No verified generation, carbon impact, financial return or eligibility is implied.</p>
  </div>;
}
