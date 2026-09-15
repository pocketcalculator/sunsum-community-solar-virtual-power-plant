/**
 * The delivery journey this software is being designed around. Stage names are
 * fixed vocabulary; summaries describe intent, not a deployed workflow.
 */

export const JOURNEY_STAGES = [
  {
    id: "submitted",
    name: "Submitted",
    summary:
      "A site is offered, with the basics about the roof, field or car park.",
  },
  {
    id: "screening",
    name: "Screening",
    summary: "Early checks on suitability, shading and grid context.",
  },
  {
    id: "pre-development",
    name: "Pre-development",
    summary: "Feasibility, agreements and permissions are worked through.",
  },
  {
    id: "development",
    name: "Development",
    summary: "Design, costs and funding are firmed up ready to build.",
  },
  {
    id: "construction",
    name: "Construction",
    summary: "Equipment is installed and progress is tracked against the plan.",
  },
  {
    id: "commissioning",
    name: "Commissioning",
    summary:
      "The system is tested, energised and handed to the operations team.",
  },
  {
    id: "operations",
    name: "Operations",
    summary: "Maintenance, reporting and community updates continue from here.",
  },
] as const;

export type JourneyStage = (typeof JOURNEY_STAGES)[number];
export type JourneyStageId = JourneyStage["id"];
