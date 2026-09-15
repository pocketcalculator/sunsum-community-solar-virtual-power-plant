import Link from "next/link";
import { ArrowRightIcon } from "@/components/ui/icons";
import { ENTRY_PATHS, entryPathHref } from "../paths";
import { PathGlyph } from "./PathGlyph";
import styles from "./EntryPathGrid.module.css";

/**
 * The three ways to take part. Each card opens the create-profile flow with the
 * matching guided answer already selected.
 */
export function EntryPathGrid() {
  return (
    <ul className={styles.grid} role="list">
      {ENTRY_PATHS.map((path) => (
        <li className={styles.card} key={path.id}>
          <span className={styles.glyph}>
            <PathGlyph path={path.id} />
          </span>
          <h3 className={styles.label}>{path.label}</h3>
          <p className={styles.description}>{path.description}</p>
          <Link className={styles.link} href={entryPathHref(path)}>
            <span>Start with {path.label.toLowerCase()}</span>
            <ArrowRightIcon className={styles.arrow} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
