import { TextField } from "@/components/ui/form/TextField";
import type { FieldIssue } from "../model/profile";
import { FIELD_ANCHOR, messageFor } from "./fieldIssues";
import styles from "./ProfileDetailsStep.module.css";

interface ProfileDetailsStepProps {
  fullName: string;
  email: string;
  issues: readonly FieldIssue[];
  onFullNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
}

export function ProfileDetailsStep({
  fullName,
  email,
  issues,
  onFullNameChange,
  onEmailChange,
}: ProfileDetailsStepProps) {
  return (
    <div className={styles.step}>
      <p className={styles.note}>
        Fictional examples only. Nothing is saved or sent, no account is created,
        and no sign-in or verification code is requested.
      </p>
      <div className={styles.details}>
        <TextField
          autoComplete="off"
          error={messageFor(issues, "fullName")}
          hint="Use an invented name, such as Alex Example."
          id={FIELD_ANCHOR.fullName}
          label="Example name"
          onValueChange={onFullNameChange}
          value={fullName}
        />
        <TextField
          autoComplete="off"
          error={messageFor(issues, "email")}
          hint="Use a fictional address such as alex@example.org. No message will be sent."
          id={FIELD_ANCHOR.email}
          label="Example email address"
          onValueChange={onEmailChange}
          type="email"
          value={email}
        />
      </div>
    </div>
  );
}
