import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { ThemeToggle } from "@/components/ui/theme/ThemeToggle";
import type { ParticipantRoleId } from "@/domain/roles";
import { CONTEXT_PAGES } from "../content/contextPages";
import { BrandMark } from "./BrandMark";
import styles from "./PublicShell.module.css";

interface PublicShellProps {
  children: ReactNode;
  headerAction?: ReactNode;
  /**
   * The demo sign-in control, when the server has enabled it.
   *
   * Passed in rather than imported because the module boundary forbids one
   * feature importing another, and because whether demo sign-in exists at all
   * is a server decision this component must not try to make.
   */
  demoControl?: ReactNode;
  visibleRoleIds?: readonly ParticipantRoleId[];
}

/**
 * The primary navigation.
 *
 * Review replaced the previous in-page anchors with the three context pages:
 * "Participation paths" and "Delivery journey" both pointed at sections the
 * landing page already shows as cards, so they navigated to something already
 * on screen. The Need, Opportunity and Impact are the questions a first-time
 * visitor actually arrives with, and they are real pages rather than anchors.
 */
const PRIMARY_NAV = [
  ...CONTEXT_PAGES.map((page) => ({
    href: page.href,
    label: page.navLabel,
  })),
  { href: "/#faq", label: "FAQ" },
] as const satisfies readonly { href: string; label: string }[];

const ROLE_NAV = [
  {
    id: "site-owner",
    href: "/dashboard/site-owner",
    label: "Site Owner",
  },
  {
    id: "financier",
    href: "/dashboard/investor",
    label: "Investor",
  },
  { id: "operator", href: "/dashboard/operator", label: "Platform Operator" },
] as const satisfies readonly {
  id: ParticipantRoleId;
  href: string;
  label: string;
}[];

const ALL_ROLE_IDS = ROLE_NAV.map((item) => item.id);

/**
 * Public site chrome: skip link, header, the theme control, the
 * `#main-content` landmark every page shares, and the footer. Routes only
 * supply the page body.
 */
export function PublicShell({
  children,
  headerAction,
  demoControl,
  visibleRoleIds = ALL_ROLE_IDS,
}: PublicShellProps) {
  const visibleRoleLinks = ROLE_NAV.filter((item) =>
    visibleRoleIds.includes(item.id),
  );

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main-content">
        Skip to main content
      </a>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.identity}>
            <Link className={styles.brand} href="/">
              <BrandMark className={styles.brandMark} />
              <span className={styles.brandName}>Sunsum</span>
            </Link>
            <Badge tone="neutral">Design foundation</Badge>
          </div>

          <nav className={styles.nav} aria-label="Primary">
            <ul className={styles.navList}>
              {PRIMARY_NAV.map((item) => (
                <li key={item.href}>
                  <Link className={styles.navLink} href={item.href}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <ThemeToggle />
          {headerAction ? (
            <div className={styles.headerAction}>{headerAction}</div>
          ) : null}
        </div>

        {visibleRoleLinks.length > 0 || demoControl ? (
          <nav className={styles.roleNav} aria-label="Role workspaces">
            <div className={styles.roleNavInner}>
              {visibleRoleLinks.length > 0 ? (
                <ul className={styles.roleNavList}>
                  {visibleRoleLinks.map((item) => (
                    <li key={item.id}>
                      <Link className={styles.roleNavLink} href={item.href}>
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              {demoControl ? (
                <div className={styles.roleNavAside}>{demoControl}</div>
              ) : null}
            </div>
          </nav>
        ) : null}
      </header>

      {/* tabIndex allows the skip link to move focus here, not just scroll. */}
      <main className={styles.main} id="main-content" tabIndex={-1}>
        {children}
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <p className={styles.footerBrand}>
            <BrandMark className={styles.footerMark} />
            <span>Sunsum</span>
          </p>
          <p className={styles.footerText}>
            Open software for community-owned solar virtual power plants.
          </p>
          <p className={styles.footerNote}>
            Public interface foundation. Diagrams and examples illustrate the
            design only, and nothing here is connected to real project records.
          </p>
        </div>
      </footer>
    </div>
  );
}
