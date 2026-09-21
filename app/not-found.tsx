import Link from "next/link";
import { ActionLink } from "@/components/ui/ActionLink";
import { ArrowRightIcon } from "@/components/ui/icons";
import { ENTRY_PATHS, PublicShell, entryPathHref } from "@/features/participation";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <PublicShell>
    <div className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.code}>404</p>
        <h1 className={styles.title}>That page does not exist</h1>
        <p className={styles.lead}>
          The address may be mistyped, or it may belong to part of Sunsum that
          has not been built yet. You can head back to the start, or begin
          taking part below.
        </p>

        <ActionLink href="/" showArrow>
          Go to the home page
        </ActionLink>

        <ul className={styles.links} role="list">
          {ENTRY_PATHS.map((path) => (
            <li key={path.id}>
              <Link className={styles.link} href={entryPathHref(path)}>
                <span>{path.label}</span>
                <ArrowRightIcon />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
    </PublicShell>
  );
}
