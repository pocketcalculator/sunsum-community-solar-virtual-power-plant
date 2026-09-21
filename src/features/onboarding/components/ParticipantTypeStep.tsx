import { Callout } from "@/components/ui/Callout";
import {
  ChoiceGroup,
  type ChoiceOption,
} from "@/components/ui/form/ChoiceGroup";
import { getParticipantRole } from "@/domain/roles";
import {
  USER_TYPE_GROUPS,
  getUserType,
  isUserTypeId,
  userTypesInGroup,
  type UserType,
  type UserTypeId,
} from "@/domain/userTypes";
import { FIELD_ANCHOR } from "./fieldIssues";
import { previewRoleFor } from "../model/profile";
import styles from "./ParticipantTypeStep.module.css";

interface ParticipantTypeStepProps {
  userTypeId: UserTypeId | null;
  /** From the guided opening. Marked as a suggestion, never applied for them. */
  suggestedTypeIds: readonly UserTypeId[];
  error?: string | undefined;
  onUserTypeChange: (id: UserTypeId) => void;
}

const SUGGESTION_TAG = "Suggested for you";

function ChosenTypeNote({ type }: { type: UserType }) {
  const previewRole = previewRoleFor(type);
  if (previewRole === null) {
    return (
      <Callout title="Continue with learning and help" tone="info">
        <p>
          For {type.label}, this preview leads to learning and help, not a
          separate workspace or an operator role. Nothing is saved, and choosing
          this type does not sign you up for updates or a programme.
        </p>
      </Callout>
    );
  }

  return (
    <p className={styles.chosen}>
      {type.label} gives you a {getParticipantRole(previewRole).label} context to
      explore. It does not grant workspace access or choose your real role.
    </p>
  );
}

/**
 * Participant type, grouped the way the taxonomy groups it. Suggestions from
 * the guided opening are marked on the options themselves rather than applied,
 * so the person always makes the choice.
 *
 * The groups share one radio name because they are one answer. Native radios
 * already behave that way — a single tab stop, arrow keys crossing group
 * boundaries — but a screen reader announces six groups, so each group's
 * description says outright that only one answer is kept. Collapsing the
 * taxonomy into a single fieldset would be worse: a fieldset takes only one
 * legend, so every option would lose the category it belongs to.
 */
export function ParticipantTypeStep({
  userTypeId,
  suggestedTypeIds,
  error,
  onUserTypeChange,
}: ParticipantTypeStepProps) {
  const suggested = new Set(suggestedTypeIds);
  const chosen = userTypeId === null ? null : getUserType(userTypeId);

  const handleChange = (value: string) => {
    if (isUserTypeId(value)) onUserTypeChange(value);
  };

  return (
    <div className={styles.step}>
      <p className={styles.lead}>
        Pick the one description that fits you best. It is a single answer
        across all {USER_TYPE_GROUPS.length} groups below, so choosing a type in
        one group replaces any earlier choice.
        {suggested.size > 0
          ? ` Your earlier answers suggest the options marked ${SUGGESTION_TAG}, but you can ignore the marks entirely.`
          : ""}
      </p>

      <div className={styles.groups}>
        {USER_TYPE_GROUPS.map((group, index) => {
          const options: readonly ChoiceOption[] = userTypesInGroup(
            group.id,
          ).map((type) => ({
            id: type.id,
            label: type.label,
            description: type.hint,
            tag: suggested.has(type.id) ? SUGGESTION_TAG : undefined,
          }));

          return (
            <ChoiceGroup
              /*
               * One answer spans every group, so they share a radio name. The
               * message belongs to that single answer: it is shown once, on the
               * first group, which is also where the error summary links.
               */
              error={index === 0 ? error : undefined}
              // Each group is announced separately, so the single-answer rule
              // is repeated in every group's description rather than stated
              // once in a lead paragraph a screen reader may never reach.
              hint={`${group.id === "interest" ? "Learning and help without a workspace assignment." : group.summary} One answer across all ${USER_TYPE_GROUPS.length} groups.`}
              id={
                index === 0
                  ? FIELD_ANCHOR.userTypeId
                  : `${FIELD_ANCHOR.userTypeId}-${group.id}`
              }
              key={group.id}
              legend={group.label}
              name={FIELD_ANCHOR.userTypeId}
              onValueChange={handleChange}
              options={options}
              value={userTypeId}
            />
          );
        })}
      </div>

      {chosen ? <ChosenTypeNote type={chosen} /> : null}
    </div>
  );
}
