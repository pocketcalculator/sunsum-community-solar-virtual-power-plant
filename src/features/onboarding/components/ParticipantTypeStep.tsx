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
  if (type.role === null) {
    return (
      <Callout title="No workspace for this one yet" tone="info">
        <p>
          There is no workspace planned for {type.label}. You can still choose
          it, and you will not be dropped into a workspace that does not fit.
          Nothing is stored today, so it does not sign you up for updates.
        </p>
      </Callout>
    );
  }

  return (
    <p className={styles.chosen}>
      {type.label} maps to the {getParticipantRole(type.role).label} workspace,
      which is what you would eventually use.
    </p>
  );
}

/**
 * Participant type, grouped the way the taxonomy groups it. Suggestions from
 * the guided opening are marked on the options themselves rather than applied,
 * so the person always makes the choice.
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
      {suggested.size > 0 ? (
        <p className={styles.lead}>
          Your earlier answers suggest the options marked {SUGGESTION_TAG}. It
          is only a shortcut: choose whatever describes you best, or ignore the
          marks entirely.
        </p>
      ) : null}

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
              hint={group.summary}
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
