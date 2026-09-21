import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { ThemeToggle } from "@/components/ui/theme/ThemeToggle";
import type { ParticipantRoleId } from "@/domain/roles";
import { BrandMark } from "./BrandMark";
import styles from "./PublicShell.module.css";

interface PublicShellProps {
  children: ReactNode;
  headerAction?: ReactNode;
  visibleRoleIds?: readonly ParticipantRoleId[];
}

const PRIMARY_NAV = [
  { href: "/need", label: "Need" },
  { href: "/opportunity", label: "Opportunity" },
  { href: "/impact", label: "Impact" },
  { href: "/#about", label: "About" },
  { href: "/#faq", label: "FAQ" },
  { href: "/app", label: "Workspace" },
] as const;

const ROLE_NAV = [
  {
    id: "site-owner",
    href: "/dashboard/site-owner",
    label: "Site owner view",
  },
  {
    id: "financier",
    href: "/join?start=i-would-fund",
    label: "Investor profile preview",
  },
  { id: "operator", href: "/join", label: "Operator profile preview" },
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
            <Badge tone="neutral">Public introduction</Badge>
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

        {visibleRoleLinks.length > 0 ? (
          <nav className={styles.roleNav} aria-label="Participation contexts">
            <div className={styles.roleNavInner}>
              <ul className={styles.roleNavList}>
                {visibleRoleLinks.map((item) => (
                  <li key={item.id}>
                    <Link className={styles.roleNavLink} href={item.href}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
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
            Stories and diagrams explain a proposal. The public profile preview
            is fictional and unsaved; separate workspace reads depend on an
            authorized connection and permitted access.
          </p>
        </div>
      </footer>
    </div>
  );
}
