/**
 * The illustrative portfolio, shown when no live read is possible.
 *
 * Mirrors the site owner dashboard's fallback: a signed-out visitor, an expired
 * session or a store that is down should still see the feature, because this
 * page is also the demo artefact. The view labels the source, so nobody is told
 * these are real projects.
 *
 * Capacity and generation are ranges with explicit units, as the real payload
 * carries them. No financial figure appears anywhere: there is no tariff or
 * market model behind this system, so a return here would be invented.
 */

import type { PortfolioProject, PortfolioView } from "./portfolio";

const PROJECTS: readonly PortfolioProject[] = [
  {
    projectId: "sample-fairview-school",
    name: "Fairview School rooftop",
    locality: "Fairview",
    stage: "pre_development",
    stageLabel: "Pre development",
    siteType: "rooftop",
    siteTypeLabel: "Rooftop",
    projectType: "community_solar",
    viabilityStatus: "potentially_viable",
    viabilityLabel: "Potentially viable",
    capacityKwLow: 180,
    capacityKwHigh: 240,
    generationKwhLow: 216_000,
    generationKwhHigh: 288_000,
    openFundingNeedsCount: 2,
  },
  {
    projectId: "sample-eastgate-carpark",
    name: "Eastgate car park canopy",
    locality: "Eastgate",
    stage: "development",
    stageLabel: "Development",
    siteType: "land",
    siteTypeLabel: "Land",
    projectType: "community_solar",
    viabilityStatus: "potentially_viable",
    viabilityLabel: "Potentially viable",
    capacityKwLow: 420,
    capacityKwHigh: 520,
    generationKwhLow: 504_000,
    generationKwhHigh: 624_000,
    openFundingNeedsCount: 1,
  },
  {
    projectId: "sample-northside-church",
    name: "Northside church hall",
    locality: "Northside",
    stage: "pre_development",
    stageLabel: "Pre development",
    siteType: "rooftop",
    siteTypeLabel: "Rooftop",
    projectType: "rooftop_host",
    viabilityStatus: "more_information_required",
    viabilityLabel: "More information required",
    capacityKwLow: 60,
    capacityKwHigh: 90,
    generationKwhLow: null,
    generationKwhHigh: null,
    openFundingNeedsCount: 1,
  },
  {
    projectId: "sample-riverside-depot",
    name: "Riverside depot roof",
    locality: "Riverside",
    stage: "construction",
    stageLabel: "Construction",
    siteType: "rooftop",
    siteTypeLabel: "Rooftop",
    projectType: "community_solar",
    viabilityStatus: "potentially_viable",
    viabilityLabel: "Potentially viable",
    capacityKwLow: 310,
    capacityKwHigh: 310,
    generationKwhLow: 372_000,
    generationKwhHigh: 372_000,
    openFundingNeedsCount: 3,
  },
];

export const SAMPLE_PORTFOLIO: PortfolioView = {
  projects: PROJECTS,
  projectCount: PROJECTS.length,
  totalEstimatedCapacityKw: 1_160,
  mandateMatch: false,
};
