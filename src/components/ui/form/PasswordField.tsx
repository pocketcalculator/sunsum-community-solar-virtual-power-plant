import { useState } from "react";
import { cx } from "../cx";
import { FieldMessages } from "./FieldMessages";
import { describedBy } from "./fieldIds";
import styles from "./PasswordField.module.css";

interface PasswordFieldProps {
  /** Also the anchor an error summary links to. */
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  /** Wording for how varied the characters are. Never a strength score. */
  varietyHint: string;
  hint?: string | undefined;
  error?: string | undefined;
}

/**
 * Password entry with a reveal toggle. The value stays with the caller: this
 * field holds nothing but whether the characters are currently shown.
 */
export function PasswordField({
  id,
  label,
  value,
  onValueChange,
  varietyHint,
  hint,
  error,
}: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const varietyId = `${id}-variety`;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <FieldMessages error={error} fieldId={id} hint={hint} />
      <div className={styles.control}>
        <input
          aria-describedby={describedBy(id, {
            hint,
            error,
            extraIds: [varietyId],
          })}
          aria-invalid={error ? true : undefined}
          autoCapitalize="off"
          autoComplete="new-password"
          className={cx(styles.input, error && styles.invalid)}
          id={id}
          onChange={(event) => onValueChange(event.target.value)}
          spellCheck={false}
          type={revealed ? "text" : "password"}
          value={value}
        />
        <button
          className={styles.toggle}
          onClick={() => setRevealed(!revealed)}
          type="button"
        >
          {revealed ? "Hide password" : "Show password"}
        </button>
      </div>
      {/*
        Announced politely: the wording only changes when the mix of characters
        changes, so it does not speak on every keystroke.
      */}
      <p aria-live="polite" className={styles.strength} id={varietyId}>
        {varietyHint}
      </p>
    </div>
  );
}
