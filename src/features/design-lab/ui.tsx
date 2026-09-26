"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { JOURNEY_STAGES, VIABILITY_LABELS, capacity, formatNumber, latestAssessment, stageName, type Role, type Site, type Viability } from "./model";
import s from "./Lab.module.css";

const paths: Record<string, ReactNode> = {
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  overview: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  roof: <><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7" /></>,
  land: <><path d="m3 15 6-9 5 6 3-4 4 7M3 20h18" /><circle cx="18" cy="4" r="2" /></>,
  chart: <><path d="M4 3v17h17M7 15l4-5 4 2 6-7" /></>,
  inbox: <><path d="M4 4h16l2 12v4H2v-4L4 4Z" /><path d="M2 15h6l2 3h4l2-3h6" /></>,
  file: <><path d="M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h6" /></>,
  pipeline: <><rect x="2" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="11" rx="1" /><rect x="18" y="4" width="4" height="14" rx="1" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2" /></>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  sliders: <><path d="M4 7h16M4 17h16" /><circle cx="8" cy="7" r="3" /><circle cx="16" cy="17" r="3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  diagonal: <path d="M6 18 18 6M6 6h12v12" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  down: <path d="m6 9 6 6 6-6" />,
  plus: <path d="M12 4v16M4 12h16" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  check: <path d="m4 12 5 5L20 6" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  bell: <><path d="M5 17h14l-2-4V9a5 5 0 0 0-10 0v4l-2 4ZM10 21h4" /></>,
  map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15" /></>,
  pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  bolt: <path d="m13 2-9 12h7l-1 8L21 9h-8l1-7Z" />,
  leaf: <><path d="M20 3C7 2 2 8 5 15c5 9 16 2 15-12ZM4 21l11-11" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3" /></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" /></>,
  upload: <><path d="M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4" /></>,
  spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4m-2-2h4" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 4h.01" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  reset: <><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" /></>,
  play: <path d="m8 4 13 8-13 8V4Z" />,
  external: <><path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7" /></>,
};

export function Icon({ name, size = 20, className = "" }: { name: string; size?: number; className?: string | undefined }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.grid}</svg>;
}

export function Button({ children, variant = "secondary", icon, className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger"; icon?: string;
}) {
  return <button type={type} className={`${s.button} ${s[variant]} ${className}`} {...props}>{icon && <Icon name={icon} size={17} />}{children}</button>;
}

export function Card({ children, title, eyebrow, action, className = "" }: { children: ReactNode; title?: string; eyebrow?: string; action?: ReactNode; className?: string | undefined }) {
  return <section className={`${s.card} ${className}`}>{(title || eyebrow || action) && <div className={s.cardHeader}><div>{eyebrow && <p className={s.eyebrow}>{eyebrow}</p>}{title && <h2>{title}</h2>}</div>{action}</div>}{children}</section>;
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "positive" | "warning" | "danger" | "accent" }) {
  return <span className={`${s.pill} ${s[`pill_${tone}`]}`}>{children}</span>;
}

export function ViabilityBadge({ result }: { result?: Viability | undefined }) {
  if (!result) return <Pill>Not screened</Pill>;
  return <Pill tone={result === "potentially_viable" ? "positive" : result === "not_currently_eligible" ? "danger" : "warning"}><Icon name={result === "potentially_viable" ? "check" : "help"} size={12} />{VIABILITY_LABELS[result]}</Pill>;
}

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string | undefined; className?: string | undefined }) {
  return <label className={`${s.field} ${className}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Modal({ title, children, onClose, wide = false, eyebrow, drawer = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; eyebrow?: string; drawer?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [closing, setClosing] = useState(false);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);
  const requestClose = () => {
    if (closing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { onClose(); return; }
    setClosing(true);
    closeTimer.current = setTimeout(onClose, 180);
  };
  return <dialog ref={ref} aria-labelledby={titleId} className={`${s.modal} ${wide ? s.modalWide : ""} ${drawer ? s.drawer : ""} ${closing ? s.modalClosing : ""}`} onCancel={(event) => { event.preventDefault(); requestClose(); }} onClick={(event) => {
    if (event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) requestClose();
  }}>
    <div className={s.modalHeader}><div>{eyebrow && <p className={s.eyebrow}>{eyebrow}</p>}<h2 id={titleId}>{title}</h2></div><Button variant="ghost" aria-label={`Close ${title}`} onClick={requestClose}><Icon name="close" /></Button></div>
    <div className={s.modalBody}>{children}</div>
  </dialog>;
}

export function Empty({ title, children, action, icon = "sun" }: { title: string; children?: ReactNode; action?: ReactNode; icon?: string }) {
  return <div className={s.empty}><span className={s.emptyIcon}><Icon name={icon} size={28} /></span><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;
}

export function StageRibbon({ site }: { site: Site }) {
  const active = JOURNEY_STAGES.findIndex((stage) => stage.id === site.stage);
  return <ol className={s.stageRibbon} aria-label="Shared project development stage">{JOURNEY_STAGES.map((stage, index) =>
    <li key={stage.id} className={index <= active ? s.stageDone : ""} aria-current={index === active ? "step" : undefined}>
      <span>{index < active ? <Icon name="check" size={12} /> : String(index + 1).padStart(2, "0")}</span><small>{stage.name}</small>
    </li>)}</ol>;
}

export function SolarArtwork({ type = "rooftop", compact = false }: { type?: Site["type"]; compact?: boolean }) {
  const id = useId().replaceAll(":", "");
  return <div className={`${s.solarArtwork} ${compact ? s.artCompact : ""}`} aria-hidden="true">
    <svg viewBox="0 0 500 240" fill="none">
      <defs><pattern id={`panels-${id}`} width="34" height="30" patternUnits="userSpaceOnUse"><rect x="2" y="2" width="30" height="26" rx="2" fill="var(--lab-panel)" stroke="var(--lab-panel-line)" strokeWidth=".7" /><path d="M17 2v26M2 15h30" stroke="var(--lab-panel-line)" strokeWidth=".5" /></pattern></defs>
      <circle cx="414" cy="58" r="30" fill="var(--lab-art-sun)" />
      <path d="M0 198C110 164 180 224 284 192S431 164 500 188V240H0Z" fill="var(--lab-art-ground)" />
      {type === "rooftop" ? <><path d="m80 161 94-92h175l71 92H80Z" fill="var(--lab-art-roof)" /><path d="M103 160v57h294v-57" fill="var(--lab-art-wall)" /><path d="M116 164h268v6H116z" fill="var(--lab-art-roof)" /><rect x="151" y="102" width="204" height="63" fill={`url(#panels-${id})`} transform="skewX(-16)" /><path d="M135 191h38m30 0h38m30 0h38m30 0h28" stroke="var(--lab-art-window)" strokeWidth="18" /></> :
        <><path d="M100 160v48m134-48v48m140-48v48" stroke="var(--lab-art-roof)" strokeWidth="5" /><path d="m60 155 42-70h303l36 70H60Z" fill="var(--lab-art-roof)" /><rect x="139" y="90" width="272" height="62" fill={`url(#panels-${id})`} transform="skewX(-16)" /></>}
      <path d="M49 187v-52m-14 26 14-26 15 26m-21-10-13 24h39l-13-24M454 190v-38m-12 14 12-24 13 24" stroke="var(--lab-art-tree)" strokeWidth="5" strokeLinecap="round" />
    </svg>
  </div>;
}

export function SiteCard({ site, onOpen, role = "site-owner" }: { site: Site; onOpen: (id: string) => void; role?: Role }) {
  return <button type="button" data-record-id={site.id} data-project-open={site.id} className={s.siteCard} onClick={() => onOpen(site.id)}>
    <div className={s.siteCardVisual}><SolarArtwork type={site.type} compact /><span className={s.siteCardStage}><Pill>{site.status === "rejected" ? "Not accepted" : site.status === "info_requested" ? "Action needed" : site.status === "accepted" && !site.stage ? "Awaiting project setup" : stageName(site.stage)}</Pill></span><span className={s.siteCardArrow}><Icon name="diagonal" size={18} /></span></div>
    <div className={s.siteCardBody}><p className={s.smallMuted}><Icon name="pin" size={13} />{site.locality}{site.region !== "unknown" ? `, ${site.region}` : ""}</p><h3>{site.name}</h3><div className={s.siteCardMetrics}><span><strong>{capacity(site) ? formatNumber(capacity(site), 1) : "--"}</strong> kW potential</span><span>{site.type === "rooftop" ? "Rooftop" : "Land"}</span></div><div className={s.siteCardFooter}><ViabilityBadge result={latestAssessment(site)?.result} />{role === "operator" && <Icon name={site.visible ? "eye" : "lock"} size={15} />}</div></div>
  </button>;
}

export function MapDiagram({ sites, selected, onSelect, large = false }: { sites: Site[]; selected?: string; onSelect: (id: string) => void; large?: boolean }) {
  const patternId = `lab-blocks-${useId().replaceAll(":", "")}`;
  return <div className={`${s.map} ${large ? s.mapLarge : ""}`}>
    <svg viewBox="0 0 800 430" preserveAspectRatio="xMidYMid slice" className={s.mapStreets} aria-hidden="true">
      <defs><pattern id={patternId} width="68" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(-17)"><rect width="68" height="56" fill="var(--lab-map-base)" /><rect x="5" y="5" width="55" height="42" rx="3" fill="var(--lab-map-block)" /><path d="M19 5v42M40 5v42M5 22h55" stroke="var(--lab-map-base)" strokeWidth="3" /></pattern></defs>
      <rect width="800" height="430" fill={`url(#${patternId})`} />
      <path d="M110-20C80 85 178 101 143 192S153 299 90 470" fill="none" stroke="var(--lab-map-park)" strokeWidth="56" />
      <path d="M510-30C471 94 429 142 431 244S390 396 425 490" fill="none" stroke="var(--lab-map-road)" strokeWidth="14" />
      <path d="M-20 231C153 244 213 239 390 216S661 238 834 155" fill="none" stroke="var(--lab-map-road)" strokeWidth="12" />
      <path d="M715-40 745 128 625 247 624 468" fill="none" stroke="var(--lab-map-park)" strokeWidth="20" />
      <path className={s.mapFlow} d="M212 301 426 317 527 169 570 95M527 169 151 128" fill="none" stroke="var(--lab-map-connection)" strokeWidth="2" strokeDasharray="5 8" />
      <g fill="var(--lab-map-label)" fontSize="12" fontFamily="var(--font-sans)" letterSpacing="2"><text x="278" y="185">COMMUNITY LAYOUT</text><text x="72" y="101">EXAMPLE A</text><text x="532" y="137">EXAMPLE B</text><text x="123" y="343">EXAMPLE C</text><text x="452" y="356">EXAMPLE D</text></g>
    </svg>
    <span className={s.mapTag}><Icon name="pin" size={13} />Synthetic project positions</span>
    {sites.filter((site) => site.mapPosition).map((site) => <button key={site.id} type="button" aria-label={`View ${site.name}`} aria-pressed={selected === site.id} className={`${s.mapPin} ${selected === site.id ? s.mapPinSelected : ""}`} onClick={() => onSelect(site.id)} style={{ left: `${site.mapPosition?.[0]}%`, top: `${site.mapPosition?.[1]}%` } as CSSProperties}><Icon name={site.type === "rooftop" ? "roof" : "sun"} size={17} /></button>)}
    <span className={s.mapKey}><span className={s.liveDot} />{sites.filter((site) => site.mapPosition).length} example sites</span>
    <span className={s.mapDisclaimer}>Neighborhood diagram &middot; not to scale</span>
  </div>;
}
