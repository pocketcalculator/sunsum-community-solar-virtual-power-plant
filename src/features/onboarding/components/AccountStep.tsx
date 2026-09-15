import { useEffect, useState } from "react";
import {
  ChoiceGroup,
  type ChoiceOption,
} from "@/components/ui/form/ChoiceGroup";
import { PasswordField } from "@/components/ui/form/PasswordField";
import { TextField } from "@/components/ui/form/TextField";
import {
  ACCOUNT_METHOD_LIST,
  isAccountMethodId,
  type AccountMethodId,
  type FieldIssue,
} from "../model/profile";
import {
  PASSWORD_CLASS_COUNT,
  PASSWORD_MIN,
  assessPassword,
} from "../model/validation";
import { FIELD_ANCHOR, messageFor } from "./fieldIssues";
import styles from "./AccountStep.module.css";

interface AccountStepProps {
  accountMethodId: AccountMethodId | null;
  fullName: string;
  email: string;
  issues: readonly FieldIssue[];
  onAccountMethodChange: (id: AccountMethodId) => void;
  onFullNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  /** Reports the message only — never the password itself. */
  onPasswordIssueChange: (issue: FieldIssue | null) => void;
}

const UNAVAILABLE_NOTE =
  "Unavailable: no identity provider is connected yet, so this sign-in would not work.";

const EMAIL_NOTE =
  "The only method that works today. You choose a password on this step.";

/**
 * Describes the mix of characters and nothing else.
 *
 * Deliberately not a strength meter: variety says nothing about length or how
 * guessable a password is, so a short password with four kinds of character
 * must not be announced as strong while the rule below is still rejecting it.
 */
function varietyHint(variety: number): string {
  if (variety === 0) {
    return "Character mix: nothing entered yet.";
  }

  return `Character mix: ${variety} of ${PASSWORD_CLASS_COUNT} kinds of character used. This counts variety only, not how hard the password is to guess.`;
}

function methodOptions(): readonly ChoiceOption[] {
  return ACCOUNT_METHOD_LIST.map((method) =>
    method.kind === "federated"
      ? {
          id: method.id,
          label: method.label,
          description: UNAVAILABLE_NOTE,
          disabled: true,
        }
      : { id: method.id, label: method.label, description: EMAIL_NOTE },
  );
}

/**
 * Sign-in details. The password is held here and nowhere else: it never reaches
 * the profile draft, the review summary or anything derived from them. Only the
 * resulting message travels upwards, so the flow can refuse to continue.
 */
export function AccountStep({
  accountMethodId,
  fullName,
  email,
  issues,
  onAccountMethodChange,
  onFullNameChange,
  onEmailChange,
  onPasswordIssueChange,
}: AccountStepProps) {
  const [password, setPassword] = useState("");

  const usesPassword = accountMethodId === "email";
  const assessment = assessPassword(password, { fullName, email });
  const passwordMessage = usesPassword
    ? (assessment.issue?.message ?? null)
    : null;

  useEffect(() => {
    onPasswordIssueChange(
      passwordMessage === null
        ? null
        : { field: "password", message: passwordMessage },
    );
  }, [passwordMessage, onPasswordIssueChange]);

  return (
    <div className={styles.step}>
      <ChoiceGroup
        error={messageFor(issues, "accountMethodId")}
        hint="The sign-in services are not connected yet, so only the email option can be used in this preview."
        id={FIELD_ANCHOR.accountMethodId}
        legend="How do you want to sign in?"
        name={FIELD_ANCHOR.accountMethodId}
        onValueChange={(value) => {
          if (isAccountMethodId(value)) onAccountMethodChange(value);
        }}
        options={methodOptions()}
        value={accountMethodId}
      />

      <div className={styles.details}>
        <TextField
          autoComplete="name"
          error={messageFor(issues, "fullName")}
          hint="However you want to be addressed on the platform."
          id={FIELD_ANCHOR.fullName}
          label="Full name"
          onValueChange={onFullNameChange}
          value={fullName}
        />
        <TextField
          autoComplete="email"
          error={messageFor(issues, "email")}
          hint="Used to identify your account once sign-in exists."
          id={FIELD_ANCHOR.email}
          label="Email address"
          onValueChange={onEmailChange}
          type="email"
          value={email}
        />

        {usesPassword ? (
          <>
            <PasswordField
              error={messageFor(issues, "password")}
              hint={`At least ${PASSWORD_MIN} characters, mixing at least three of: lower case, upper case, numbers, symbols.`}
              id={FIELD_ANCHOR.password}
              label="Password"
              onValueChange={setPassword}
              varietyHint={varietyHint(assessment.variety)}
              value={password}
            />
            <p className={styles.note}>
              Your password stays on this step. It is not added to your profile,
              not shown on the review, and never sent to Sunsum. Your browser or
              password manager may still offer to remember it, as it would on
              any sign-up form.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
