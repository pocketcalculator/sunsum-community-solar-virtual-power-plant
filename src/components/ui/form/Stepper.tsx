import { cx } from "../cx";
import styles from "./Stepper.module.css";

export type StepperStatus = "completed" | "current" | "upcoming" | "blocked";

export interface StepperStep {
  readonly id: string;
  readonly label: string;
  readonly status: StepperStatus;
  /** Whether the person may jump straight to this step. */
  readonly selectable: boolean;
}

interface StepperProps {
  /** Names the navigation landmark, for example "Create profile steps". */
  label: string;
  steps: readonly StepperStep[];
  onSelect: (id: string) => void;
}

const STATUS_TEXT = {
  completed: "Completed",
  current: "Current step",
  upcoming: "Not done yet",
  blocked: "Finish an earlier step first",
} satisfies Record<StepperStatus, string>;

const STATUS_CLASS = {
  completed: styles.completed,
  current: styles.current,
  upcoming: styles.upcoming,
  blocked: styles.blocked,
} satisfies Record<StepperStatus, string | undefined>;

interface StepperEntryProps {
  step: StepperStep;
  position: number;
  onSelect: (id: string) => void;
}

function StepperEntry({ step, position, onSelect }: StepperEntryProps) {
  const body = (
    <>
      <span aria-hidden="true" className={styles.marker}>
        {position}
      </span>
      <span className={styles.text}>
        <span className={styles.label}>{step.label}</span>
        <span className={styles.status}>{STATUS_TEXT[step.status]}</span>
      </span>
    </>
  );

  if (step.status === "current") {
    return (
      <span aria-current="step" className={styles.entry}>
        {body}
      </span>
    );
  }

  if (step.selectable) {
    return (
      <button
        className={cx(styles.entry, styles.trigger)}
        onClick={() => onSelect(step.id)}
        type="button"
      >
        {body}
      </button>
    );
  }

  return <span className={styles.entry}>{body}</span>;
}

/**
 * Ordered progress through a flow. Every state is spelled out in text as well
 * as colour. It is a shortcut back to work already done, never the only way to
 * move: the flow keeps its own back and continue controls.
 */
export function Stepper({ label, steps, onSelect }: StepperProps) {
  return (
    <nav aria-label={label} className={styles.stepper}>
      <ol className={styles.list}>
        {steps.map((step, index) => (
          <li
            className={cx(styles.item, STATUS_CLASS[step.status])}
            key={step.id}
          >
            <StepperEntry
              onSelect={onSelect}
              position={index + 1}
              step={step}
            />
          </li>
        ))}
      </ol>
    </nav>
  );
}
