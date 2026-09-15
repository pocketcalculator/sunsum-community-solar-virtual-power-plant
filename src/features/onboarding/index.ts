/**
 * Public interface of the onboarding feature.
 *
 * Routes import the flow from here; the steps, form wiring and styles stay
 * internal so the flow can be reshaped without breaking callers. Everything
 * exported is browser-safe: this increment has no server-only data access.
 */

export {
  CreateProfileFlow,
  type CreateProfileFlowProps,
} from "./components/CreateProfileFlow";
