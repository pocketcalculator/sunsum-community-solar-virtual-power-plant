import {
  ChoiceGroup,
  type ChoiceOption,
} from "@/components/ui/form/ChoiceGroup";
import { TextField } from "@/components/ui/form/TextField";
import type { FieldIssue, RepresentationKind } from "../model/profile";
import { FIELD_ANCHOR, messageFor } from "./fieldIssues";
import styles from "./RepresentationStep.module.css";

interface RepresentationStepProps {
  representation: RepresentationKind | null;
  organisationName: string;
  issues: readonly FieldIssue[];
  onRepresentationChange: (kind: RepresentationKind) => void;
  onOrganisationNameChange: (value: string) => void;
}

const OPTIONS: readonly ChoiceOption[] = [
  {
    id: "individual",
    label: "As myself",
    description: "You are taking part in your own name.",
  },
  {
    id: "organisation",
    label: "On behalf of an organisation",
    description:
      "A company, campus, community group, fund, utility or public body.",
  },
];

function isRepresentation(value: string): value is RepresentationKind {
  return value === "individual" || value === "organisation";
}

/** Who the person acts for. The organisation name is asked for only if needed. */
export function RepresentationStep({
  representation,
  organisationName,
  issues,
  onRepresentationChange,
  onOrganisationNameChange,
}: RepresentationStepProps) {
  return (
    <div className={styles.step}>
      <ChoiceGroup
        error={messageFor(issues, "representation")}
        id={FIELD_ANCHOR.representation}
        legend="Are you taking part as yourself or for an organisation?"
        name={FIELD_ANCHOR.representation}
        onValueChange={(value) => {
          if (isRepresentation(value)) onRepresentationChange(value);
        }}
        options={OPTIONS}
        value={representation}
      />

      {representation === "organisation" ? (
        <TextField
          autoComplete="organization"
          error={messageFor(issues, "organisationName")}
          hint="The name people would recognise on an agreement."
          id={FIELD_ANCHOR.organisationName}
          label="Organisation name"
          onValueChange={onOrganisationNameChange}
          value={organisationName}
        />
      ) : null}
    </div>
  );
}
