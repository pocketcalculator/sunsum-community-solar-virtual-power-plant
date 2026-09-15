import { AlertIcon } from "../icons";
import { errorId, hintId } from "./fieldIds";
import styles from "./FieldMessages.module.css";

interface FieldMessagesProps {
  /** Id of the field being described. */
  fieldId: string;
  hint?: string | undefined;
  error?: string | undefined;
}

/**
 * Hint and error text carrying the ids that fields point `aria-describedby` at.
 * The error keeps an icon and a hidden word so it never relies on colour alone.
 */
export function FieldMessages({ fieldId, hint, error }: FieldMessagesProps) {
  return (
    <>
      {hint ? (
        <p className={styles.hint} id={hintId(fieldId)}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} id={errorId(fieldId)}>
          <AlertIcon className={styles.icon} />
          <span className={styles.visuallyHidden}>Error:</span>
          <span>{error}</span>
        </p>
      ) : null}
    </>
  );
}
