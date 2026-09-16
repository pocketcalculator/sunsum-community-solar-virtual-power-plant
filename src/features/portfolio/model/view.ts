/**
 * What the portfolio page renders, and how its values are worded.
 *
 * These types deliberately repeat the shape of the `GET /portfolio` payload
 * rather than importing it. Presentation is not allowed to depend on the
 * backend — the lint boundary enforces that — and the repetition buys
 * something real: the route maps one into the other explicitly, so a field
 * that is renamed or withdrawn from the wire contract fails to compile at that
 * single point instead of rendering as `undefined` somewhere inside a card.
 *
 * Everything here is tier 0. There is no address, coordinate, document or
 * owner field, because the API never sends one and this page must not become
 * the reason someone adds it.
 */

export interface PortfolioProjectView {
  readonly id: string;
  readonly name: string;
  /** Neighbourhood, never a street address. */
  readonly locality: string;
  readonly stage: string;
  readonly siteType: string;
  readonly projectType: string | null;
  readonly viability: string;
  readonly systemSizeKwLow: number | null;
  readonly systemSizeKwHigh: number | null;
  readonly annualGenerationKwhLow: number | null;
  readonly annualGenerationKwhHigh: number | null;
  readonly openFundingNeeds: number;
}

export interface PortfolioView {
  readonly projects: readonly PortfolioProjectView[];
  readonly totalEstimatedCapacityKw: number;
  /** True when the investor's own mandate narrowed the list. */
  readonly mandateMatch: boolean;
}

/**
 * Wordings that sentence-casing gets wrong on its own.
 *
 * Only the exceptions are listed. `more_information_required` already reads
 * correctly once the underscores become spaces, and repeating it here would be
 * a second place to maintain for no gain.
 */
const LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  pre_development: "Pre-development",
};

/**
 * Turn a snake_case API value into something readable.
 *
 * An unrecognised value is humanised rather than rejected. When the backend
 * gains a project stage, this page should show it imperfectly and keep
 * working — an interface is not the right place to discover that the service
 * is newer than the build rendering it.
 */
export function formatVocabulary(value: string): string {
  const override = LABEL_OVERRIDES[value];

  if (override !== undefined) {
    return override;
  }

  const spaced = value.replaceAll("_", " ");

  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * A fixed locale, not the reader's.
 *
 * These numbers are rendered on the server and hydrated on the client. Letting
 * the format follow an ambient locale is the classic way to make the two
 * disagree and produce a hydration warning.
 */
const NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

/**
 * An estimate that may be a range, a single bound, or absent.
 *
 * A missing estimate reads as "Not yet estimated" rather than as `0`, because
 * a project nobody has sized and a project sized at zero are different facts
 * and only one of them is true here.
 */
export function formatRange(
  low: number | null,
  high: number | null,
  unit: string,
): string {
  if (low === null && high === null) {
    return "Not yet estimated";
  }

  if (low !== null && high !== null && low !== high) {
    /* An en dash, the correct character for a numeric range. */
    return `${NUMBER_FORMAT.format(low)}\u2013${NUMBER_FORMAT.format(high)} ${unit}`;
  }

  const single = low ?? high ?? 0;

  return `${NUMBER_FORMAT.format(single)} ${unit}`;
}

export function formatCapacity(kilowatts: number): string {
  return `${NUMBER_FORMAT.format(kilowatts)} kW`;
}

/** "No open funding needs" / "1 open funding need" / "3 open funding needs". */
export function formatFundingNeeds(count: number): string {
  if (count === 0) {
    return "No open funding needs";
  }

  return count === 1 ? "1 open funding need" : `${count} open funding needs`;
}
