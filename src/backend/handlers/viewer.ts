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
 */

import type { Viewer } from "../core/viewer";

const DEMO_INVESTOR_VIEWER: Viewer = {
  role: "investor",
  userId: "demo-investor",
  investor: {
    id: "demo-investor",
    organizationName: "Demo Community Endowment",
    fundingStageFocus: ["pre_development", "development", "construction"],
    geographies: ["GA"],
    onboardingCompletedAt: "2026-09-01T00:00:00.000Z",
  },
};

export function resolveDemoViewer(): Viewer {
  return DEMO_INVESTOR_VIEWER;
}
