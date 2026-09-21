import type { ReactNode } from "react";
import { INTENT_PROMPT_LIST, type IntentOptionId } from "@/domain/intents";
import { getParticipantRole } from "@/domain/roles";
import { getUserType } from "@/domain/userTypes";
import type { ProfileSummary } from "../model/profile";
import styles from "./ProfileSummaryList.module.css";

interface ProfileSummaryListProps {
  summary: ProfileSummary;
}

const INTENT_LABELS = new Map<IntentOptionId, string>(
  INTENT_PROMPT_LIST.flatMap((prompt) =>
    prompt.options.map((option): [IntentOptionId, string] => [
      option.id,
      `${prompt.stem} ${option.label}`,
    ]),
  ),
);

/**
 * The fictional answers shown locally, never sent. Shared by the
 * review step and the completion panel so both describe the same thing.
 */
export function ProfileSummaryList({ summary }: ProfileSummaryListProps) {
  const rows: readonly { term: string; detail: ReactNode }[] = [
    { term: "Example name", detail: summary.fullName },
    { term: "Example email address", detail: summary.email },
    {
      term: "Taking part",
      detail:
        summary.organisationName !== null
          ? `On behalf of ${summary.organisationName}`
          : "As an individual",
    },
    { term: "Participant type", detail: getUserType(summary.userTypeId).label },
    {
      term: "Exploration context",
      detail:
        summary.role === null
          ? "Learning and help; no workspace is assigned."
          : `${getParticipantRole(summary.role).label} preview context only; no access is granted.`,
    },
    {
      term: "Answers from the guided start",
      detail:
        summary.intentOptionIds.length === 0 ? (
          "None given"
        ) : (
          <ul className={styles.intents}>
            {summary.intentOptionIds.map((id) => (
              <li key={id}>{INTENT_LABELS.get(id) ?? id}</li>
            ))}
          </ul>
        ),
    },
  ];

  return (
    <dl className={styles.list}>
      {rows.map((row) => (
        <div className={styles.row} key={row.term}>
          <dt className={styles.term}>{row.term}</dt>
          <dd className={styles.detail}>{row.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
