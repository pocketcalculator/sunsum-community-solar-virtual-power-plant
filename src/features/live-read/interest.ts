import type { ReadEngagement } from "./types";
import { activeEngagementStates } from "./values";

export function currentProjectInterest(
  entries: readonly ReadEngagement[],
  projectId: string,
): ReadEngagement | null {
  const current = entries.findLast((entry) => entry.projectId === projectId && entry.fundingNeedId === null);
  return current?.state !== null && current?.state !== undefined &&
    activeEngagementStates.includes(current.state) ? current : null;
}

export { eligibleProjects as eligibleDealRoomProjects } from "./projections";
