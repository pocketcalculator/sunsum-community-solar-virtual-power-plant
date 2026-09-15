import type { IntentOptionId } from "@/domain/intents";

/**
 * The three entry paths the charter's landing page requires: rooftop, land and
 * financier/investor.
 *
 * Each path carries the guided answer it corresponds to, so choosing one on the
 * landing page opens the create-profile flow with that answer already selected
 * rather than starting the person from nothing. A path deliberately does not
 * carry a role: the role follows from the participant type the person chooses
 * for themselves, and naming it here would be a second, conflicting answer.
 */

const ENTRY_PATH_DEFINITIONS = [
  {
    id: "rooftop",
    label: "I have a rooftop",
    description:
      "A roof on a home, business, church, school or community building that could host panels.",
    intentOptionId: "i-have-roof",
  },
  {
    id: "land",
    label: "I have land",
    description:
      "A field, yard or car park that could host a ground-mounted or canopy array.",
    intentOptionId: "i-have-land",
  },
  {
    id: "funding",
    label: "I want to fund projects",
    description:
      "Philanthropy, impact capital, tax-credit or fund investment in community solar.",
    intentOptionId: "i-would-fund",
  },
] as const;

export type EntryPathId = (typeof ENTRY_PATH_DEFINITIONS)[number]["id"];

export interface EntryPath {
  readonly id: EntryPathId;
  readonly label: string;
  readonly description: string;
  readonly intentOptionId: IntentOptionId;
}

export const ENTRY_PATHS: readonly EntryPath[] = ENTRY_PATH_DEFINITIONS;

/** Deep link into the create-profile flow with this path's answer pre-selected. */
export function entryPathHref(path: EntryPath): string {
  return `/join?start=${encodeURIComponent(path.intentOptionId)}`;
}
