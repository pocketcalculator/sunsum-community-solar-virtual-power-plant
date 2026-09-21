/**
 * The illustrative pipeline, shown when no live read is possible.
 *
 * Mirrors the other workspaces' fallbacks: a signed-out visitor or a store
 * that is down should still see the feature, because this page is also the
 * demo artefact. The view labels the source, so nobody is told these are real
 * submissions. Addresses here are invented and obviously so.
 */

import type { PipelineCard, PipelineView } from "./pipeline";

function card(overrides: Partial<PipelineCard> & { id: string }): PipelineCard {
  return {
    siteId: overrides.id,
    projectId: null,
    displayName: "Sample submission",
    addressRaw: null,
    siteType: "rooftop",
    siteTypeLabel: "Rooftop",
    submissionStatus: "submitted",
    submissionStatusLabel: "Submitted",
    projectStage: null,
    journeyStageId: "submitted",
    journeyStageLabel: "Submitted",
    viabilityStatus: null,
    viabilityLabel: null,
    estimatedCapacityKw: null,
    updatedAt: null,
    ...overrides,
  };
}

const CARDS: readonly PipelineCard[] = [
  card({
    id: "sample-1",
    displayName: "18 Example Way",
    addressRaw: "18 Example Way, Fairview",
    journeyStageId: "submitted",
    journeyStageLabel: "Submitted",
  }),
  card({
    id: "sample-2",
    displayName: "Eastgate car park",
    addressRaw: "2 Sample Road, Eastgate",
    siteType: "land",
    siteTypeLabel: "Land",
    submissionStatus: "screening",
    submissionStatusLabel: "Screening",
    journeyStageId: "screening",
    journeyStageLabel: "Screening",
    viabilityStatus: "more_information_required",
    viabilityLabel: "More information required",
  }),
  card({
    id: "sample-3",
    displayName: "Fairview School rooftop",
    addressRaw: "5 Placeholder Street, Fairview",
    submissionStatus: "accepted",
    submissionStatusLabel: "Accepted",
    projectStage: "pre_development",
    journeyStageId: "pre-development",
    journeyStageLabel: "Pre development",
    viabilityStatus: "potentially_viable",
    viabilityLabel: "Potentially viable",
    estimatedCapacityKw: 210,
  }),
  card({
    id: "sample-4",
    displayName: "Riverside depot roof",
    addressRaw: "9 Demo Lane, Riverside",
    submissionStatus: "accepted",
    submissionStatusLabel: "Accepted",
    projectStage: "construction",
    journeyStageId: "construction",
    journeyStageLabel: "Construction",
    viabilityStatus: "potentially_viable",
    viabilityLabel: "Potentially viable",
    estimatedCapacityKw: 310,
  }),
];

const STAGE_ORDER = [
  "submitted",
  "screening",
  "pre-development",
  "development",
  "construction",
  "commissioning",
  "operations",
] as const;

export const SAMPLE_PIPELINE: PipelineView = {
  cards: CARDS,
  stageCounts: STAGE_ORDER.map((stageId) => ({
    journeyStageId: stageId,
    label: stageId.charAt(0).toUpperCase() + stageId.slice(1).replace(/-/g, " "),
    count: CARDS.filter((item) => item.journeyStageId === stageId).length,
  })),
};
