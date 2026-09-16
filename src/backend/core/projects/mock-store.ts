/**
 * In-memory stand-in for the projects table.
 *
 * **This is mock data.** It exists so the portfolio endpoint can demonstrate
 * the handler/core pattern before the selected PostgreSQL/Drizzle persistence
 * is wired up. Replacing this file with a real query is meant to be the whole
 * change: core depends on the `ProjectStore` interface in `store.ts`, not on
 * this array.
 *
 * The addresses and owner ids are invented for the demo. Nothing here is real
 * customer data, and nothing here should ever be treated as a real site.
 *
 * Three Atlanta pilot sites are visible to investors, which is the charter's
 * minimum for the investor portfolio. Two further records exist to keep the
 * rules honest: one is not investor-visible, and one is in a different region.
 */

import type { ProjectStore } from "./store";
import type { ProjectRecord } from "./types";

const MOCK_PROJECTS: readonly ProjectRecord[] = [
  {
    id: "3f1b9c64-0f0e-4a1b-9c3e-6b0d5a2e7101",
    siteId: "8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c01",
    name: "Sweet Auburn rooftop array",
    stage: "pre_development",
    visibleToInvestors: true,
    siteAddressRaw: "148 Auburn Ave NE, Atlanta, GA 30303",
    siteLatitude: 33.7554,
    siteLongitude: -84.3766,
    ownerUserId: "u-1001",
    locality: "Sweet Auburn, Atlanta",
    region: "GA",
    siteType: "rooftop",
    preliminaryProjectType: "community_rooftop",
    viabilityStatus: "potentially_viable",
    estimatedSystemSizeKwLow: 180,
    estimatedSystemSizeKwHigh: 240,
    estimatedAnnualGenerationKwhLow: 243000,
    estimatedAnnualGenerationKwhHigh: 324000,
    estimatedCapacityKw: 210,
    openFundingNeedsCount: 2,
  },
  {
    id: "3f1b9c64-0f0e-4a1b-9c3e-6b0d5a2e7102",
    siteId: "8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c02",
    name: "West End community canopy",
    stage: "development",
    visibleToInvestors: true,
    siteAddressRaw: "1075 Ralph David Abernathy Blvd SW, Atlanta, GA 30310",
    siteLatitude: 33.7351,
    siteLongitude: -84.4229,
    ownerUserId: "u-1002",
    locality: "West End, Atlanta",
    region: "GA",
    siteType: "land",
    preliminaryProjectType: "solar_canopy",
    viabilityStatus: "potentially_viable",
    estimatedSystemSizeKwLow: 320,
    estimatedSystemSizeKwHigh: 410,
    estimatedAnnualGenerationKwhLow: 432000,
    estimatedAnnualGenerationKwhHigh: 553500,
    estimatedCapacityKw: 365,
    openFundingNeedsCount: 1,
  },
  {
    id: "3f1b9c64-0f0e-4a1b-9c3e-6b0d5a2e7103",
    siteId: "8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c03",
    name: "Mechanicsville school roof",
    stage: "construction",
    visibleToInvestors: true,
    siteAddressRaw: "1000 McDaniel St SW, Atlanta, GA 30310",
    siteLatitude: 33.7318,
    siteLongitude: -84.4004,
    ownerUserId: "u-1003",
    locality: "Mechanicsville, Atlanta",
    region: "GA",
    siteType: "rooftop",
    preliminaryProjectType: "community_rooftop",
    viabilityStatus: "more_information_required",
    estimatedSystemSizeKwLow: 95,
    estimatedSystemSizeKwHigh: 130,
    estimatedAnnualGenerationKwhLow: 128250,
    estimatedAnnualGenerationKwhHigh: 175500,
    estimatedCapacityKw: 112.5,
    openFundingNeedsCount: 0,
  },
  {
    id: "3f1b9c64-0f0e-4a1b-9c3e-6b0d5a2e7104",
    siteId: "8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c04",
    name: "Grove Park warehouse roof",
    stage: "pre_development",
    /** Operator has not published this one. It must never reach an investor. */
    visibleToInvestors: false,
    siteAddressRaw: "1701 Donald Lee Hollowell Pkwy NW, Atlanta, GA 30318",
    siteLatitude: 33.7712,
    siteLongitude: -84.4643,
    ownerUserId: "u-1004",
    locality: "Grove Park, Atlanta",
    region: "GA",
    siteType: "rooftop",
    preliminaryProjectType: "community_rooftop",
    viabilityStatus: "potentially_viable",
    estimatedSystemSizeKwLow: 500,
    estimatedSystemSizeKwHigh: 640,
    estimatedAnnualGenerationKwhLow: 675000,
    estimatedAnnualGenerationKwhHigh: 864000,
    estimatedCapacityKw: 570,
    openFundingNeedsCount: 3,
  },
  {
    id: "3f1b9c64-0f0e-4a1b-9c3e-6b0d5a2e7105",
    siteId: "8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c05",
    name: "Chattanooga riverfront field",
    stage: "operations",
    visibleToInvestors: true,
    siteAddressRaw: "200 Riverfront Pkwy, Chattanooga, TN 37402",
    siteLatitude: 35.0558,
    siteLongitude: -85.3113,
    ownerUserId: "u-1005",
    locality: "Riverfront, Chattanooga",
    region: "TN",
    siteType: "land",
    preliminaryProjectType: "ground_mount",
    viabilityStatus: "potentially_viable",
    estimatedSystemSizeKwLow: 700,
    estimatedSystemSizeKwHigh: 900,
    estimatedAnnualGenerationKwhLow: 945000,
    estimatedAnnualGenerationKwhHigh: 1215000,
    estimatedCapacityKw: 800,
    openFundingNeedsCount: 1,
  },
];

export const mockProjectStore: ProjectStore = {
  listProjects(): Promise<readonly ProjectRecord[]> {
    return Promise.resolve(MOCK_PROJECTS);
  },
};
