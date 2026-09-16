import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { ThemeToggle } from "@/components/ui/theme/ThemeToggle";
import { BrandMark } from "./BrandMark";
import styles from "./PublicShell.module.css";

interface PublicShellProps {
  children: ReactNode;
  headerAction?: ReactNode;
}

const PRIMARY_NAV = [
  { href: "/#participate", label: "Participation paths" },
  { href: "/#journey", label: "Delivery journey" },
  { href: "/portfolio", label: "Investor portfolio" },
  { href: "/#faq", label: "FAQ" },
] as const;

/**
 * Public site chrome: skip link, header, the theme control, the
 * `#main-content` landmark every page shares, and the footer. Routes only
 * supply the page body.
 */
export function PublicShell({ children, headerAction }: PublicShellProps) {
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
