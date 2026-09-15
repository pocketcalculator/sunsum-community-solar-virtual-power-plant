import { Badge } from "../Badge";
import { cx } from "../cx";
import { FieldMessages } from "./FieldMessages";
import { describedBy } from "./fieldIds";
import styles from "./ChoiceGroup.module.css";

export interface ChoiceOption {
  readonly id: string;
  readonly label: string;
  readonly description?: string | undefined;
  /** Short marker shown beside the label, such as a suggestion. */
  readonly tag?: string | undefined;
  readonly disabled?: boolean | undefined;
}

interface ChoiceGroupProps {
  /**
   * Fieldset id. Option ids derive from it and error summaries link to it, so
   * focus lands on the group and its legend is announced.
   */
  id: string;
  /** Radio name. Groups that make up one single answer share one name. */
  name: string;
  legend: string;
  options: readonly ChoiceOption[];
  value: string | null;
  onValueChange: (value: string) => void;
  hint?: string | undefined;
  error?: string | undefined;
}

/**
 * Accessible radio group drawn as selectable cards. The controls are native
 * radios that stay visible, so keyboard behaviour, checked state and forced
 * colours all come from the browser rather than from styling.
 */
export function ChoiceGroup({
  id,
  name,
  legend,
  options,
  value,
  onValueChange,
  hint,
  error,
}: ChoiceGroupProps) {
  return (
    <fieldset
      aria-describedby={describedBy(id, { hint, error })}
      aria-invalid={error ? true : undefined}
      className={styles.group}
      id={id}
      tabIndex={-1}
    >
      <legend className={styles.legend}>{legend}</legend>
      <FieldMessages error={error} fieldId={id} hint={hint} />
      <div className={styles.options}>
        {options.map((option) => {
          const optionId = `${id}-${option.id}`;
          const tagId = `${optionId}-tag`;
          const descriptionId = `${optionId}-description`;
          const describedIds = [
            option.tag ? tagId : null,
            option.description ? descriptionId : null,
          ].filter((candidate): candidate is string => candidate !== null);

          return (
            <div
              className={cx(
                styles.option,
                value === option.id && styles.selected,
                option.disabled && styles.unavailable,
              )}
              key={option.id}
            >
              <input
                aria-describedby={
                  describedIds.length > 0 ? describedIds.join(" ") : undefined
                }
                checked={value === option.id}
                className={styles.input}
                disabled={option.disabled ?? false}
                id={optionId}
                name={name}
                onChange={() => onValueChange(option.id)}
                type="radio"
                value={option.id}
              />
              <label className={styles.optionLabel} htmlFor={optionId}>
                {option.label}
              </label>
              {option.tag ? (
                <span className={styles.tag} id={tagId}>
                  <Badge tone="accent">{option.tag}</Badge>
                </span>
              ) : null}
              {option.description ? (
                <p className={styles.description} id={descriptionId}>
                  {option.description}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
