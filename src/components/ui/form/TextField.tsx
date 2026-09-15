import { cx } from "../cx";
import { FieldMessages } from "./FieldMessages";
import { describedBy } from "./fieldIds";
import styles from "./TextField.module.css";

export type TextFieldType = "text" | "email";

interface TextFieldProps {
  /** Also the anchor an error summary links to. */
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  type?: TextFieldType | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  autoComplete?: string | undefined;
}

/** Single-line text entry with its label, hint and error wired together. */
export function TextField({
  id,
  label,
  value,
  onValueChange,
  type = "text",
  hint,
  error,
  autoComplete,
}: TextFieldProps) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <FieldMessages error={error} fieldId={id} hint={hint} />
      <input
        aria-describedby={describedBy(id, { hint, error })}
        aria-invalid={error ? true : undefined}
        autoComplete={autoComplete}
        className={cx(styles.input, error && styles.invalid)}
        id={id}
        onChange={(event) => onValueChange(event.target.value)}
        spellCheck={type === "email" ? false : undefined}
        type={type}
        value={value}
      />
    </div>
  );
}
