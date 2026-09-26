"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { BrandMark } from "@/components/ui/BrandMark";
import { ThemeToggle } from "@/components/ui/theme/ThemeToggle";
import { RoleControl } from "@/components/workspace";
import type { WorkspaceRole } from "@/components/workspace/types";
import type { WorkspaceView } from "@/domain/workspace-routes";
import styles from "./Workspace.module.css";

export interface WorkspaceNavigation {
  view: WorkspaceView;
  label: string;
}

interface WorkspaceShellProps {
  role: WorkspaceRole | null;
  view: WorkspaceView;
  navigation: readonly WorkspaceNavigation[];
  onNavigate: (view: WorkspaceView) => void;
  onRefresh: () => void;
  refreshing: boolean;
  canRefresh: boolean;
  children: ReactNode;
}

export function WorkspaceShell({
  role, view, navigation, onNavigate, onRefresh, refreshing, canRefresh, children,
}: WorkspaceShellProps) {
  const [notices, setNotices] = useState(false);
  const [menu, setMenu] = useState(false);
  return (
    <div className={styles.workspace} data-mode="live-read-only">
      <a href="#workspace-content" className={styles.skip}>Skip to workspace</a>
      <aside className={`${styles.sidebar} ${menu ? styles.sidebarOpen : ""}`}>
        <Link href="/" className={styles.brand}><BrandMark /><span>sunsum</span></Link>
        <p className={styles.brandNote}>Shared sun. Shared possibility.</p>
        <p className={styles.eyebrow}>Your workspace</p>
        <nav aria-label="Connected workspace">
          {navigation.map((item) => (
            <button
              key={item.view}
              type="button"
              aria-current={view === item.view ? "page" : undefined}
              onClick={() => { onNavigate(item.view); setMenu(false); }}
            >
              <span>{item.label}</span><span aria-hidden="true">&rsaquo;</span>
            </button>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <p>One clear view of the work ahead.</p>
          <Link href="/#about">About SunSum</Link>
          <Link href="/need">Why community solar</Link>
          <a href="https://nicolassalazar-pro.github.io/sunsum-ui-demo/" target="_blank" rel="noreferrer">
            Open the separate fictional demo
          </a>
        </div>
      </aside>

      <div className={styles.body}>
        <header className={styles.topbar}>
          <button type="button" className={styles.menuButton} aria-expanded={menu}
            aria-label="Toggle workspace navigation" onClick={() => setMenu(!menu)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.7" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className={styles.mode}><span className={styles.modeDot} /><strong>Live reads only</strong></div>
          <div className={styles.topActions}>
            <RoleControl value={role} allowedRoles={role ? [role] : []} mode="live"
              onChange={() => { /* The current read contract supplies one authorized role. */ }} />
            <ThemeToggle compact />
            <button type="button" className={styles.iconButton} aria-label="Notifications"
              aria-expanded={notices} aria-controls="workspace-notices" onClick={() => setNotices(!notices)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 17h14l-2-4V9a5 5 0 0 0-10 0v4l-2 4ZM10 21h4" />
              </svg>
            </button>
          </div>
        </header>
        {notices && (
          <section id="workspace-notices" className={styles.noticePanel} aria-label="Notifications">
            <div><strong>Notifications are out of reach right now</strong>
              <p>No notification feed or unread count has been confirmed. Your permitted next-work items remain separate. Opening this panel marks nothing read.</p></div>
            <button type="button" className={styles.textButton} onClick={() => setNotices(false)}>Close notifications</button>
          </section>
        )}
        <div className={styles.connectionBar}>
          <p>Existing-service reads, within your current access. Workflow writes are not implemented.</p>
          <button type="button" className={styles.textButton} disabled={!canRefresh || refreshing} onClick={onRefresh}>
            {refreshing ? "Refreshing permitted reads..." : "Refresh permitted reads"}
          </button>
        </div>
        <main id="workspace-content" className={styles.main} tabIndex={-1} aria-busy={refreshing}>
          {children}
        </main>
        <footer className={styles.footer}>Read, understand, decide. No submission, review, funding or publication is performed here.</footer>
      </div>
    </div>
  );
}
