import { ChevronDownIcon } from "@/components/ui/icons";
import type { FaqItem } from "../faq";
import styles from "./FaqList.module.css";

interface FaqListProps {
  items: readonly FaqItem[];
}

/** Native disclosure widgets, so the answers open without any JavaScript. */
export function FaqList({ items }: FaqListProps) {
  return (
    <ul className={styles.list} role="list">
      {items.map((item) => (
        <li key={item.id}>
          <details className={styles.item} id={`faq-${item.id}`}>
            <summary className={styles.summary}>
              <span className={styles.question}>{item.question}</span>
              <ChevronDownIcon className={styles.chevron} />
            </summary>
            <p className={styles.answer}>{item.answer}</p>
          </details>
        </li>
      ))}
    </ul>
  );
}
