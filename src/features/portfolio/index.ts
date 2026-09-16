/**
 * Public interface of the portfolio feature.
 *
 * Routes import from here only. Both components take already-resolved data:
 * this feature does no fetching and holds no entitlement rule, because the
 * service decides what an investor may see and presentation must not be able
 * to reach a second, differing answer.
 *
 * The view model is exported because the route is what maps the API payload
 * into it, and that mapping has to be type-checked.
 */

export { PortfolioUnavailable } from "./components/PortfolioUnavailable";
export { PortfolioView } from "./components/PortfolioView";
export {
  formatCapacity,
  formatFundingNeeds,
  formatRange,
  formatVocabulary,
  type PortfolioProjectView,
  type PortfolioView as PortfolioViewModel,
} from "./model/view";
