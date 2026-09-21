"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/ui/BrandMark";
import { ThemeToggle } from "@/components/ui/theme/ThemeToggle";
import { RoleControl } from "@/components/workspace";
import { NAVIGATION, ROLE_LABELS, defaultProfile, projectTasks, roleSites, type Role, type View } from "./model";
import { useLab } from "./store";
import { Button, Empty, Icon, Modal } from "./ui";
import { Overview } from "./Overview";
import { IntakeView, OwnerInboxView, OwnerSitesView, DocumentsView } from "./OwnerViews";
import { PortfolioView, MandateView, EngagementsView, UnderwritingPreview, RoadmapView, resetPortfolioPreferences } from "./InvestorViews";
import { SubmissionQueueView, PipelineView, ActivityView, resetQueuePreferences } from "./OperatorViews";
import { resetCollectionPreferences } from "./ProjectCollection";
import { DemoNotifications } from "./DemoNotifications";
import { ProjectDetail } from "./ProjectDetail";
import { ComparisonView } from "./ComparisonView";
import { WelcomeView, GuidanceAssistant } from "./Guidance";
import { ProfileView, profileIsLearningOnly, type ProfileSessionDraft } from "./ProfileView";
import { ReportView } from "./ReportView";
import { BACKEND_REVISION, PREVIEW_CONFIGURATION, SERVICE_CAPABILITIES, type PublicConfiguration } from "./configuration";
import { DESIGN_LINEAGE, DESIGN_REFERENCES, FEATURE_COVERAGE } from "./references";
import { currentRouteSearch, pushAppRoute, sunroomHref, SUNROOM_PATH } from "./routing";
import s from "./Lab.module.css";

export function isRole(value: string): value is Role {
  return value === "site-owner" || value === "operator" || value === "investor";
}

export function allowedView(role: Role, value: string): View {
  if (value === "welcome" || value === "roadmap" || value === "profile") return value;
  if (role === "site-owner" && value === "intake") return value;
  return NAVIGATION[role].find((item) => item.id === value)?.id ?? "overview";
}

interface DesignLabProps {
  initialRole: Role; initialView: View;
  initialProject?: string | undefined; initialScope?: string | undefined;
  initialTask?: string | undefined; configuration?: PublicConfiguration;
}

function ServiceStatus() {
  return <div className={s.stack}>
    <p className={s.callout}>You are using fictional browser-local data. No operational backend connection or real participant authentication is configured for this release.</p>
    <div className={s.serviceList}>{SERVICE_CAPABILITIES.map((service) => <section key={service.id} className={s.serviceRow}><div><strong>{service.label}</strong><p>{service.reason}</p><p>Source status: {service.source}.</p></div><span>Unavailable live</span></section>)}</div>
    <p className={s.muted}>Backend source reviewed at <a href={`https://github.com/pocketcalculator/sunsum-community-solar-virtual-power-plant/commit/${BACKEND_REVISION}`} target="_blank" rel="noreferrer">{BACKEND_REVISION.slice(0, 12)}</a>. Source implementation is not proof of a configured or operating service.</p>
  </div>;
}

export function DesignLab(props: DesignLabProps) {
  const configuration = props.configuration ?? PREVIEW_CONFIGURATION;
  const [explicitPreview, setExplicitPreview] = useState(false);
  if (configuration.mode !== "preview" && !explicitPreview) return <div data-concept="sunroom" className={s.lab}>
    <main className={s.main}><div className={s.pageHeading}><div><p className={s.eyebrow}>Connection unavailable</p><h1>No service actions were started.</h1></div><ThemeToggle compact /></div>
      <p className={s.callout}>{configuration.issue ?? "A service URL alone does not establish a compatible authenticated session. This release has no accepted live connection."}</p>
      <ServiceStatus />
      <div className={s.row}><Button variant="primary" onClick={() => setExplicitPreview(true)}>Open the fictional preview instead</Button><Link href="/">About SunSum</Link></div>
    </main>
  </div>;
  return <PreviewWorkspace {...props} />;
}

function PreviewWorkspace({ initialRole, initialView, initialProject, initialScope, initialTask }: DesignLabProps) {
  const { state, notice, dismissNotice, dispatch, ready, notify } = useLab();
  const [role, setRole] = useState<Role>(initialRole);
  const [view, setView] = useState<View>(initialRole === "operator" && initialView === "overview" && !initialScope ? "queue" : allowedView(initialRole, initialView));
  const [selected, setSelected] = useState<string | null>(initialView === "intake" ? null : initialProject ?? null);
  const [editing, setEditing] = useState<string | null>(initialView === "intake" ? initialProject ?? null : null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [assistant, setAssistant] = useState(false);
  const [palette, setPalette] = useState(false);
  const [query, setQuery] = useState("");
  const [research, setResearch] = useState(false);
  const [reset, setReset] = useState(false);
  const [underwriting, setUnderwriting] = useState<string | null>(null);
  const [scopeId, setScopeId] = useState<string | null>(initialScope ?? null);
  const [taskId, setTaskId] = useState<string | null>(initialTask ?? null);
  const [serviceStatus, setServiceStatus] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [returnContext, setReturnContext] = useState<{ view: View; project: string | null; scope: string | null; task: string | null; detail: boolean } | null>(null);
  const [opener, setOpener] = useState<{ element: HTMLElement | null; project: string | null; scroll: number }>({ element: null, project: null, scroll: 0 });
  const [profileDraft, setProfileDraft] = useState<ProfileSessionDraft | null>(null);
  const [assistantTrigger, setAssistantTrigger] = useState<HTMLElement | null>(null);
  const available = roleSites(state, role);
  const scopeSite = available.find((site) => site.id === scopeId);
  const profile = state.profile ?? defaultProfile();
  const effectiveView = view === "intake" && !profile.completed ? "profile" : view;
  const navigation = NAVIGATION[role];
  const viewName = navigation.find((item) => item.id === effectiveView)?.label ?? (effectiveView === "profile" ? "My profile" : view === "intake" ? "New solar site" : view === "welcome" ? "Your starting point" : "Beyond the pilot");

  const url = (nextRole: Role, nextView: View, project?: string | null, scope: string | null = scopeId, task?: string | null) => {
    const params = new URLSearchParams({ role: nextRole, view: nextView });
    if (project) params.set("project", project);
    if (scope) params.set("scope", scope);
    if (task) params.set("task", task);
    pushAppRoute(`${SUNROOM_PATH}?${params}`);
  };
  const navigate = (next: View) => {
    const valid = allowedView(role, next);
    const related = valid === "documents" || valid === "reports";
    const nextScope = ["overview", "queue", "documents", "reports"].includes(valid) ? scopeId : null;
    if (related && ["queue", "pipeline", "portfolio", "sites", "inbox"].includes(view)) {
      setReturnContext({ view, project: selected, scope: scopeId, task: taskId, detail: !!selected });
      if (!selected) setOpener({ element: document.activeElement instanceof HTMLElement ? document.activeElement : null, project: null, scroll: window.scrollY });
    } else if (!related) setReturnContext(null);
    setView(valid); setSelected(null); setEditing(null); setMobileMenu(false);
    setTaskId(null); setScopeId(nextScope); setAssistant(false);
    url(role, valid, null, nextScope); window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() => document.getElementById("lab-content")?.focus({ preventScroll: true }));
  };
  const chooseRole = (next: Role, requested?: View) => {
    const valid = allowedView(next, requested ?? (next === "operator" ? "queue" : "overview"));
    setRole(next); setView(valid); setSelected(null); setEditing(null); setUnderwriting(null); setMobileMenu(false);
    setScopeId(null); setTaskId(null); setReturnContext(null); setAssistant(false); setPalette(false);
    url(next, valid, null, null); window.scrollTo({ top: 0, behavior: "instant" });
  };
  const openProject = (id: string) => {
    const site = available.find((item) => item.id === id);
    const task = site && projectTasks(site).some((item) => item.id === taskId) ? taskId : null;
    setOpener({ element: document.activeElement instanceof HTMLElement ? document.activeElement : null, project: id, scroll: window.scrollY });
    setSelected(id); setTaskId(task); url(role, view, id, scopeId, task);
  };
  const restoreFocus = () => requestAnimationFrame(() => {
    const previous = opener;
    const availableTarget = (element: HTMLElement | null): element is HTMLElement =>
      element !== null && element.isConnected && !element.closest('[hidden], [inert], [aria-hidden="true"]');
    const fallback = previous.project ? Array.from(document.querySelectorAll<HTMLElement>("button[data-record-id], [data-project-open]"))
      .find((element) => (element.dataset.recordId ?? element.dataset.projectOpen) === previous.project && availableTarget(element)) : null;
    const target = availableTarget(previous.element) ? previous.element : fallback ?? document.getElementById("lab-content");
    target?.focus({ preventScroll: true });
    window.scrollTo({ top: previous.scroll, behavior: "instant" });
  });
  const closeProject = () => {
    const task = view === "documents" ? taskId : null;
    setSelected(null); setTaskId(task); url(role, view, null, scopeId, task);
    restoreFocus();
  };
  const editProject = (id: string) => {
    if (!roleSites(state, "site-owner").some((site) => site.id === id)) { notify("This project is not available in the owner preview."); return; }
    const task = scopeId === id || selected === id || editing === id ? taskId : null;
    setRole("site-owner"); setView("intake"); setEditing(id); setSelected(null); setScopeId(id);
    setTaskId(task); setReturnContext(null);
    url("site-owner", "intake", id, id, task);
  };
  const openRelated = (next: "documents" | "reports", id: string, task?: string) => {
    const relatedTask = task ?? (selected === id || scopeId === id ? taskId : null);
    if (!selected && !returnContext) setOpener({ element: document.activeElement instanceof HTMLElement ? document.activeElement : null, project: id, scroll: window.scrollY });
    setReturnContext((current) => current ?? { view, project: id, scope: scopeId, task: relatedTask, detail: !!selected || !!relatedTask });
    setScopeId(id); setTaskId(next === "documents" ? relatedTask : null); setView(next); setSelected(null); setUnderwriting(null);
    url(role, next, null, id, next === "documents" ? relatedTask : null);
  };
  const returnToProject = () => {
    if (!returnContext) return;
    const project = returnContext.detail ? returnContext.project : null;
    setView(returnContext.view); setSelected(project); setScopeId(returnContext.scope); setTaskId(returnContext.task);
    url(role, returnContext.view, project, returnContext.scope, returnContext.task);
    setReturnContext(null);
    if (!project) restoreFocus();
  };
  const openAssistant = () => {
    const existing = document.querySelector<HTMLTextAreaElement>("#workspace-guidance textarea");
    if (existing) { existing.focus(); existing.scrollIntoView({ block: "nearest" }); }
    else {
      setAssistantTrigger(document.activeElement instanceof HTMLElement ? document.activeElement : null);
      setAssistant(true);
    }
  };
  const closeAssistant = () => {
    setAssistant(false);
    requestAnimationFrame(() => { if (assistantTrigger?.isConnected) assistantTrigger.focus(); });
  };

  useEffect(() => {
    const pop = () => {
      const params = currentRouteSearch();
      const maybeRole = params.get("role") ?? "site-owner";
      const nextRole: Role = isRole(maybeRole) ? maybeRole : "site-owner";
      const nextView = allowedView(nextRole, params.get("view") ?? (nextRole === "operator" ? "queue" : "overview"));
      setRole(nextRole); setView(nextView);
      setSelected(nextView === "intake" ? null : params.get("project"));
      setEditing(nextView === "intake" ? params.get("project") : null);
      setUnderwriting(null); setMobileMenu(false);
      setScopeId(params.get("scope")); setTaskId(params.get("task")); setReturnContext(null); setAssistant(false);
    };
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setPalette((open) => !open);
      }
    };
    window.addEventListener("popstate", pop);
    window.addEventListener("hashchange", pop);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("popstate", pop); window.removeEventListener("hashchange", pop); window.removeEventListener("keydown", key); };
  }, []);

  const renderView = () => {
    switch (effectiveView) {
      case "overview": return <Overview role={role} onNavigate={navigate} onOpen={openProject} {...(scopeSite ? { siteId: scopeSite.id } : {})} />;
      case "profile": return <ProfileView initialSessionDraft={profileDraft} onSessionDraftChange={setProfileDraft} onDone={(completed) => {
        if (profileIsLearningOnly(completed.intents)) {
          notify("Fictional profile complete. Continue with learning and human-support guidance; no workspace or role was granted.");
          navigate("welcome");
          return;
        }
        if (view === "intake" && editing) editProject(editing);
        else navigate(view === "intake" ? "intake" : role === "site-owner" ? "sites" : "overview");
      }} />;
      case "reports": return <ReportView role={role} {...(scopeSite ? { siteId: scopeSite.id } : {})} onOpen={openProject} />;
      case "sites": return <OwnerSitesView onOpen={openProject} onEdit={editProject} onNew={() => navigate("intake")} onDocuments={(id) => openRelated("documents", id)} onReports={(id) => openRelated("reports", id)} />;
      case "intake": {
        const initialSite = state.sites.find((site) => site.id === editing);
        if (editing && !initialSite) return <Empty title="Draft unavailable" icon="lock" action={<Button onClick={() => navigate("sites")}>Return to My sites</Button>}>
          This saved intake is no longer available. No new site has been created in its place.
        </Empty>;
        return <IntakeView key={editing ?? "new"} initialSite={initialSite} onExit={() => navigate("sites")} onComplete={(id: string) => { setView("sites"); setSelected(id); setEditing(null); url("site-owner", "sites", id); }} />;
      }
      case "inbox": return <OwnerInboxView onEdit={editProject} onOpen={openProject} onDocuments={(id, task) => openRelated("documents", id, task)} />;
      case "documents": return <DocumentsView role={role} onOpen={openProject} {...(scopeSite ? { siteId: scopeSite.id } : {})} {...(taskId ? { taskId } : {})} onDraft={(id) => openRelated("reports", id)} />;
      case "compare": return <ComparisonView />;
      case "queue": return <SubmissionQueueView onOpen={openProject} {...(scopeSite ? { siteId: scopeSite.id } : {})} onDocuments={(id) => openRelated("documents", id)} onReports={(id) => openRelated("reports", id)} />;
      case "pipeline": return <PipelineView onOpen={openProject} onDocuments={(id) => openRelated("documents", id)} onReports={(id) => openRelated("reports", id)} />;
      case "portfolio": return <PortfolioView onOpen={openProject} onMandate={() => navigate("mandate")} onDocuments={(id) => openRelated("documents", id)} onReports={(id) => openRelated("reports", id)} />;
      case "mandate": return <MandateView onDone={() => navigate("portfolio")} />;
      case "engagements": return <EngagementsView role={role} onOpen={openProject} />;
      case "activity": return <ActivityView role={role} onOpen={openProject} />;
      case "welcome": return <WelcomeView onRole={chooseRole} onEdit={editProject} />;
      case "roadmap": return <RoadmapView />;
    }
  };
  const searchItems = [
    ...navigation.map((item) => ({ id: item.id, label: item.label, icon: item.icon, kind: "Workspace", run: () => navigate(item.id) })),
    ...available.map((site) => ({ id: site.id, label: site.name, icon: site.type === "rooftop" ? "roof" : "land", kind: site.locality, run: () => openProject(site.id) })),
    { id: "welcome", label: "Guided welcome", icon: "sun", kind: "Getting started", run: () => navigate("welcome") },
    { id: "assistant", label: "Ask Sunsum", icon: "spark", kind: "Local guidance", run: openAssistant },
    { id: "roadmap", label: "Beyond the pilot", icon: "map", kind: "Design roadmap", run: () => navigate("roadmap") },
  ].filter((item) => `${item.label} ${item.kind}`.toLowerCase().includes(query.toLowerCase()));
  const reviewSite = available.find((site) => site.id === underwriting);

  return <div data-concept="sunroom" className={s.lab}>
    <a href="#lab-content" className={s.skipLink}>Skip to content</a>
    <aside className={s.sidebar}>
      <Link href={sunroomHref({ role, view: role === "operator" ? "queue" : "overview", scope: scopeId ?? undefined })} className={s.brand} aria-label="Sunroom home" onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); navigate(role === "operator" ? "queue" : "overview");
      }}><span className={s.brandSymbol}><BrandMark /></span><span>sunsum</span></Link>
      <p className={s.brandNote}>Shared sun. Shared possibility.</p>
      <p className={s.workspaceName}>Your workspace</p>
      <nav className={s.navigation} aria-label={`${ROLE_LABELS[role]} workspace`}>
        {navigation.map((item) => <button type="button" key={item.id} title={item.label} aria-label={item.label} aria-current={item.id === view ? "page" : undefined} className={`${s.navButton} ${item.id === view ? s.navActive : ""}`} onClick={() => navigate(item.id)}>
          <Icon name={item.icon} size={19} /><span className={s.navLabel}>{item.label}</span>
          {item.id === "inbox" && available.some((site) => projectTasks(site).some((task) => task.kind === "evidence" && task.status !== "reviewed")) && <span className={s.navCount}>{available.reduce((sum, site) => sum + projectTasks(site).filter((task) => task.kind === "evidence" && task.status !== "reviewed").length, 0)}</span>}
        </button>)}
      </nav>
      <div className={s.sidebarBottom}>
        <div className={s.communityCard}><Icon name="sun" size={25} /><h3>Big change starts<br />in our own backyard.</h3><p>Find your place in the community solar journey.</p><button type="button" onClick={() => navigate("welcome")}>Explore the journey<Icon name="diagonal" size={16} /></button></div>
        <button type="button" className={s.navButton} title="Ask Sunsum" onClick={openAssistant}><Icon name="spark" size={19} /><span className={s.navLabel}>Ask Sunsum</span></button>
        <button type="button" className={s.navButton} title="Design notes and references" onClick={() => setResearch(true)}><Icon name="help" size={17} /><span className={s.navLabel}>About this prototype</span></button>
      </div>
    </aside>
    <div className={s.appBody}>
      <header className={s.topbar}>
        <button type="button" className={`${s.iconButton} ${s.mobileMenu}`} aria-label="Open navigation" aria-expanded={mobileMenu} onClick={() => setMobileMenu(!mobileMenu)}><Icon name="menu" /></button>
        <div className={s.breadcrumb}><span>My community</span><Icon name="chevron" size={11} /><strong>{viewName}</strong></div>
        <div className={s.topActions}>
          <button type="button" className={s.searchKey} onClick={() => { setQuery(""); setPalette(true); }} aria-label="Search commands and projects"><Icon name="search" size={17} /><span>Quick find</span><kbd>Ctrl K</kbd></button>
          <div className={s.perspectiveTools} data-header-appearance-row>
            <RoleControl value={role} allowedRoles={["site-owner", "operator", "investor"]} mode="demo" onChange={(next) => chooseRole(next)} />
            <ThemeToggle compact />
          </div>
          <button type="button" className={s.iconButton} aria-label="Open notifications" title="Historical demo notices; unread count not supplied" onClick={() => setNotifications(true)}><Icon name="bell" size={19} /></button>
          <span className={s.avatar} title="Fictional demo profile">{role === "site-owner" ? "AM" : role === "operator" ? "JL" : "CF"}</span>
        </div>
      </header>
      <div className={s.contextBar}>
        <label className={s.contextSelect}><span>Project context</span><select aria-label="Project context" value={scopeId ?? ""} onChange={(event) => {
          const next = event.target.value || null;
          const nextView = view === "documents" || view === "reports" ? view : role === "operator" ? "queue" : "overview";
          setScopeId(next); setSelected(null); setTaskId(null); setReturnContext(null); setAssistant(false);
          setView(nextView); setEditing(null); url(role, nextView, null, next);
        }}><option value="">All permitted projects</option>{scopeId && !scopeSite && <option value={scopeId}>Unavailable project</option>}{available.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
        <button className={s.modeButton} type="button" onClick={() => setServiceStatus(true)}><Icon name="help" size={16} />Synthetic preview &middot; service status</button>
      </div>
      <main className={s.main} id="lab-content" tabIndex={-1}>
        {returnContext && <Button variant="ghost" onClick={returnToProject}>{returnContext.detail ? "Back to the selected project" : `Back to ${navigation.find((item) => item.id === returnContext.view)?.label ?? "your collection"}`} <Icon name="arrow" size={15} /></Button>}
        <div className={assistant ? s.helpLayout : undefined}>
        <div className={s.viewEntrance} key={`${role}-${effectiveView}`}>{ready ? scopeId && !scopeSite
          ? <Empty title="Project context unavailable" action={<Button onClick={() => { setScopeId(null); url(role, view, null, null); }}>Show permitted projects</Button>}>Choose a project available to this demo role. Restricted details are not shown.</Empty>
          : renderView() : <div className={s.empty} role="status"><Icon name="sun" size={32} /><p>Opening your community workspace...</p></div>}</div>
        {assistant && <GuidanceAssistant key={`${role}-${scopeId ?? "all"}`} role={role} {...(scopeSite ? { siteId: scopeSite.id } : {})} onClose={closeAssistant} onNavigate={(nextRole, nextView) => {
          setAssistant(false);
          if (scopeSite && (nextView === "documents" || nextView === "reports")) openRelated(nextView, scopeSite.id);
          else if (nextRole === role) navigate(nextView); else chooseRole(nextRole, nextView);
        }} />}
        </div>
      </main>
      <footer className={s.demoFooter}><p><span className={s.liveDot} />Interactive prototype &middot; fictional data &middot; local preview, no backend</p><div className={s.row}><button type="button" onClick={() => setReset(true)}>Reset demo</button><span>/</span><button type="button" onClick={() => setResearch(true)}>Design notes</button><span>/</span><Link href="/">About SunSum</Link></div></footer>
    </div>
    {selected && <ProjectDetail siteId={selected} role={role} onClose={closeProject} onEdit={editProject} onDocuments={(id) => openRelated("documents", id)} onReport={(id) => openRelated("reports", id)} {...(taskId ? { initialTaskId: taskId } : {})} onUnderwriting={(id: string) => { setSelected(null); setUnderwriting(id); }} />}
    {reviewSite && <UnderwritingPreview site={reviewSite} onClose={() => setUnderwriting(null)} />}
    {notifications && <DemoNotifications role={role} onClose={() => setNotifications(false)} onOpen={openProject} />}
    {mobileMenu && <Modal title="Workspace navigation" onClose={() => setMobileMenu(false)}><nav className={s.navigation} aria-label={`${ROLE_LABELS[role]} workspace`}>
      {navigation.map((item) => <button key={item.id} type="button" className={`${s.navButton} ${item.id === view ? s.navActive : ""}`} onClick={() => navigate(item.id)}><Icon name={item.icon} size={19} />{item.label}</button>)}
      <Button onClick={() => { setMobileMenu(false); openAssistant(); }}>Ask Sunsum</Button>
      <Button variant="ghost" onClick={() => navigate("welcome")}>Explore the journey</Button>
    </nav></Modal>}
    {serviceStatus && <Modal title="Service status" wide onClose={() => setServiceStatus(false)}><ServiceStatus /></Modal>}
    {palette && <Modal title="Find your next move" eyebrow="Search projects, pages and actions" onClose={() => setPalette(false)}>
      <input className={s.paletteInput} aria-label="Search commands" autoFocus placeholder="Try a neighborhood, documents, or mandate..." value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className={s.paletteList}>{searchItems.map((item) => <button key={item.id} className={s.paletteItem} type="button" onClick={() => { setPalette(false); item.run(); }}><Icon name={item.icon} size={18} />{item.label}<small>{item.kind}</small></button>)}</div>
      {!searchItems.length && <Empty title="No matching projects or actions">Try a shorter search or a different neighborhood.</Empty>}
    </Modal>}
    {reset && <Modal title="Start the demo over?" onClose={() => setReset(false)}><div className={s.stack}><p>This replaces this preview&apos;s current browser save with 50 fictional portfolio records and six owner examples. Local drafts, decisions, interests and selected file names in the current scenario will be removed.</p><p className={s.muted}>The original v1 recovery save and theme preference are retained. No real records, accounts or server data are affected.</p><div className={s.row}><Button onClick={() => setReset(false)}>Keep my progress</Button><Button variant="danger" icon="reset" onClick={() => { dispatch({ type: "reset" }, "The fictional demo has been reset."); resetCollectionPreferences(); resetQueuePreferences(); resetPortfolioPreferences(); setProfileDraft(null); setReset(false); setSelected(null); setEditing(null); setUnderwriting(null); setScopeId(null); setTaskId(null); setReturnContext(null); setAssistant(false); const next = role === "operator" ? "queue" : "overview"; setView(next); url(role, next, null, null); }}>Reset fictional demo</Button></div></div></Modal>}
    {research && <Modal title="Made for the whole journey" eyebrow="Sunsum / Sunroom preview" wide onClose={() => setResearch(false)}>
      <div className={s.stack}><p>Sunroom combines the original Sunsum navy, gold and community-green themes with a clear community solar project journey.</p>
        <p className={s.callout}>This is an isolated mockup. The role switch is not authentication. Screening, money, maps, documents and AI drafts are explicitly illustrative; no backend, utility, geocoder, AI model or payment service is called.</p>
        <h3>The complete feature surface</h3>{FEATURE_COVERAGE.map((item) => <div key={item.feature}><strong>{item.feature}</strong><p className={s.muted}>{item.views} &mdash; {item.scope}</p></div>)}
        <h3>Patterns from the prior CLI design archive</h3>
        <p className={s.muted}>The archive search identified eight website families and five browser tools or experiments. Representative source was reviewed for twelve of those thirteen families, plus three archived screenshots. This was a broad indexed review, not a claim to have inspected every historical conversation or current live site.</p>
        {DESIGN_LINEAGE.map((reference) => <div key={reference.family}><strong>{reference.family}</strong><p className={s.muted}>{reference.pattern} {reference.translation}</p></div>)}
        <h3>Mobbin patterns, translated into something original</h3>{DESIGN_REFERENCES.map((reference) => <div key={reference.name}><a href={reference.url} target="_blank" rel="noreferrer">{reference.name} <Icon name="external" size={12} /></a><p className={s.muted}>{reference.pattern} {reference.translation}</p></div>)}
        <p className={s.muted}>Motion: responsive card lift, map-pin focus, chart exploration, staged page entrances and focus-managed drawers. Reduced-motion settings are respected throughout.</p>
        <p className={s.muted}>Scope source: <a href="https://github.com/pocketcalculator/sunsum-community-solar-virtual-power-plant/blob/main/docs/sunsum_technical_design_doc.md" target="_blank" rel="noreferrer">SunSum technical design, sections 6&ndash;8</a>. Seed estimates and comparison values are adapted from the repository&apos;s explicit demo fixtures.</p>
      </div>
    </Modal>}
    {notice && <div className={s.toast} role="status"><Icon name="help" size={17} /><span>{notice}</span><button type="button" aria-label="Dismiss notification" onClick={dismissNotice}><Icon name="close" size={16} /></button></div>}
  </div>;
}
