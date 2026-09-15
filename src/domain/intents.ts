import { USER_TYPES, type UserTypeId } from "./userTypes";

/**
 * The guided opening from the board's landing dialogue: a person completes one
 * of three sentences — "I am…", "I would like to…", "I have…" — and the answers
 * suggest which participant types probably fit.
 *
 * Suggestions are a shortcut, never a decision. The person always confirms their
 * own type on a later step, and can ignore every suggestion.
 */

export const INTENT_PROMPTS = [
  {
    id: "i-am",
    stem: "I am…",
    question: "Which of these sounds most like you?",
    options: [
      {
        id: "i-am-property-owner",
        label: "someone with a roof, building or land",
        suggests: ["property-owner", "landowner", "site-host"],
      },
      {
        id: "i-am-community",
        label: "representing a community group, campus or institution",
        suggests: ["community-group", "hbcu", "college-facilities"],
      },
      {
        id: "i-am-developer",
        label: "working in solar development or installation",
        suggests: ["project-developer", "solar-developer", "contractor"],
      },
      {
        id: "i-am-utility",
        label: "with a utility or energy buyer",
        suggests: ["utility-emc", "utility-municipality", "utility-iou"],
      },
      {
        id: "i-am-funder",
        label: "a funder, investor or philanthropy",
        suggests: ["philanthropy", "impact-investor", "energy-equity-fund"],
      },
    ],
  },
  {
    id: "i-would",
    stem: "I would like to…",
    question: "What brought you here today?",
    options: [
      {
        id: "i-would-use-solar",
        label: "use solar at a site I control",
        suggests: ["site-host", "property-owner", "purchaser"],
      },
      {
        id: "i-would-install-solar",
        label: "install or build solar for others",
        suggests: ["solar-developer", "contractor", "workforce-participant"],
      },
      {
        id: "i-would-fund",
        label: "fund community solar projects",
        suggests: ["philanthropy", "nmtc", "cdfi-cde"],
      },
      {
        id: "i-would-learn",
        label: "understand how this works before deciding",
        suggests: ["learning-more", "student-researcher"],
      },
    ],
  },
  {
    id: "i-have",
    stem: "I have…",
    question: "Is there something specific you want to put forward?",
    options: [
      {
        id: "i-have-roof",
        label: "a rooftop to offer",
        suggests: ["property-owner", "potential-location"],
      },
      {
        id: "i-have-land",
        label: "land to offer",
        suggests: ["landowner", "potential-location"],
      },
      {
        id: "i-have-project",
        label: "an existing project or opportunity",
        suggests: ["project-developer", "solar-developer"],
      },
      {
        id: "i-have-questions",
        label: "questions rather than a site",
        suggests: ["learning-more", "legal-adviser"],
      },
    ],
  },
] as const;

export type IntentPromptId = (typeof INTENT_PROMPTS)[number]["id"];
export type IntentOptionId =
  (typeof INTENT_PROMPTS)[number]["options"][number]["id"];

export interface IntentOption {
  readonly id: IntentOptionId;
  readonly label: string;
  readonly suggests: readonly UserTypeId[];
}

export interface IntentPrompt {
  readonly id: IntentPromptId;
  readonly stem: string;
  readonly question: string;
  readonly options: readonly IntentOption[];
}

export const INTENT_PROMPT_LIST: readonly IntentPrompt[] = INTENT_PROMPTS;

const ALL_OPTIONS: readonly IntentOption[] = INTENT_PROMPTS.flatMap(
  (prompt) => prompt.options as readonly IntentOption[],
);

export function isIntentOptionId(value: string): value is IntentOptionId {
  return ALL_OPTIONS.some((option) => option.id === value);
}

/**
 * User types suggested by the chosen answers, in taxonomy order and without
 * duplicates.
 *
 * Deliberately unranked. The participant step marks suggested options in place
 * rather than ordering them, so counting how often a type was suggested would
 * imply a preference nothing acts on.
 */
export function suggestedUserTypes(
  selected: readonly IntentOptionId[],
): readonly UserTypeId[] {
  const suggested = new Set<UserTypeId>();

  for (const option of ALL_OPTIONS) {
    if (!selected.includes(option.id)) continue;
    for (const typeId of option.suggests) suggested.add(typeId);
  }

  return USER_TYPES.filter((type) => suggested.has(type.id)).map(
    (type) => type.id,
  );
}
