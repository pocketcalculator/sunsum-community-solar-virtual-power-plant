import { CheckboxField } from "@/components/ui/form/CheckboxField";
import { INTENT_PROMPT_LIST, type IntentOptionId } from "@/domain/intents";
import { FIELD_ANCHOR } from "./fieldIssues";
import styles from "./GuidedStartStep.module.css";

interface GuidedStartStepProps {
  selected: readonly IntentOptionId[];
  onToggle: (optionId: IntentOptionId, selected: boolean) => void;
}

/**
 * The guided opening. Every answer is optional and several may be chosen per
 * prompt, so it stays a conversation rather than a gate.
 */
export function GuidedStartStep({ selected, onToggle }: GuidedStartStepProps) {
  return (
    <div className={styles.step}>
      <p className={styles.lead}>
        Nothing here is required. Your answers only suggest participant types
        later on, and you are free to ignore the suggestions.
      </p>
      <div className={styles.prompts} id={FIELD_ANCHOR.intentOptionIds}>
        {INTENT_PROMPT_LIST.map((prompt) => (
          <fieldset className={styles.prompt} key={prompt.id}>
            <legend className={styles.legend}>{prompt.stem}</legend>
            <p className={styles.question}>
              {prompt.question} Choose as many as fit, or none.
            </p>
            <div className={styles.options}>
              {prompt.options.map((option) => (
                <CheckboxField
                  checked={selected.includes(option.id)}
                  id={`${FIELD_ANCHOR.intentOptionIds}-${option.id}`}
                  key={option.id}
                  label={option.label}
                  onCheckedChange={(checked) => onToggle(option.id, checked)}
                />
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}
