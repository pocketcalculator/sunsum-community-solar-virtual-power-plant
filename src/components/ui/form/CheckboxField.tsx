import { cx } from "../cx";
import { FieldMessages } from "./FieldMessages";
import { describedBy } from "./fieldIds";
import styles from "./CheckboxField.module.css";

interface CheckboxFieldProps {
  /** Also the anchor an error summary links to. */
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  hint?: string | undefined;
  error?: string | undefined;
}

/** Single native checkbox with its label, hint and error wired together. */
export function CheckboxField({
  id,
  label,
  checked,
  onCheckedChange,
  hint,
  error,
}: CheckboxFieldProps) {
  return (
    <div className={cx(styles.field, error && styles.invalid)}>
      <div className={styles.control}>
        <input
          aria-describedby={describedBy(id, { hint, error })}
          aria-invalid={error ? true : undefined}
          checked={checked}
          className={styles.input}
          id={id}
          onChange={(event) => onCheckedChange(event.target.checked)}
          type="checkbox"
        />
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
      </div>
      <FieldMessages error={error} fieldId={id} hint={hint} />
    </div>
  );
}
