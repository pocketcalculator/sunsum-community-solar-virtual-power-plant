/**
 * Resolving who is calling.
 *
 * **This is a placeholder and has no security value.** There is no session, no
 * token and no sign-in behind it: it returns the same demo investor for every
 * request. It exists so the portfolio endpoint can demonstrate the pattern —
 * handlers establish identity, core decides permission — before identity work
 * lands.
 *
 * It deliberately reads nothing from the request. A stub that let a caller name
 * their own role through a header or query parameter would be a privilege
 * escalation waiting to be shipped; every caller being the same investor cannot
 * be abused.
 *
 * Replacing this with a real session lookup is the whole identity change on the
 * read path: the rules in core already take a `Viewer` and do not care where it
 * came from.
 *
 * **It must fail closed before a real database is wired to a write path.**
 * Returning an onboarded investor for every unauthenticated request is
 * survivable while the data is fixtures and the endpoint is read-only. It stops
 * being survivable the moment a request can change a row or read a real
 * owner's documents, and nothing here would announce the difference. Review
 * asked that this warning travel with whichever PR merges second.
 */

import type { Viewer } from "../../core/identity";

const DEMO_INVESTOR_VIEWER: Viewer = {
  role: "investor",
  /** PR #12's `DEMO_INVESTOR_USER_ID` and `DEMO_INVESTOR_ID`, which the seed inserts. */
  userId: "91e3b7c4-2d65-4a08-bf19-7c5e0a6d3b82",
  investor: {
    id: "4d7a2c91-8e56-43bf-9a10-5c6d2f7b8e34",
    organizationName: "Demo Community Endowment",
    /**
     * `permanent` is a funding stage with no project stage of the same name.
     * It could not be written here while this field was typed `ProjectStage[]`,
     * which is the defect review found; it is included now because an endowment
     * funding a built asset is exactly the case that made the mistake matter.
     */
    fundingStageFocus: ["pre_development", "development", "construction", "permanent"],
    geographies: ["GA"],
    onboardingCompletedAt: "2026-09-01T00:00:00.000Z",
  },
};

export function resolveDemoViewer(): Viewer {
  return DEMO_INVESTOR_VIEWER;
}
