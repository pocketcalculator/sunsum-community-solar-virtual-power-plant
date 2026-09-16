/**
 * S-INV — Investor and Portfolio (design document section 9.2).
 *
 * Owns investor profiles, mandate capture, portfolio summaries and mandate
 * matching. The design document makes it the **sole owner of the
 * investor-visibility rule**, so any code deciding whether a project may be
 * shown to an investor belongs in this directory and nowhere else.
 *
 * Endpoints that will land here: `GET /portfolio`,
 * `POST /investors/me/profile`, `GET /investors/me/profile`.
 */

export {
  DEFAULT_PORTFOLIO_QUERY,
  getPortfolio,
  type PortfolioItem,
  type PortfolioQuery,
  type PortfolioResponse,
  type PortfolioStore,
} from "./portfolio";
export {
  CAPITAL_TYPES,
  FUNDING_STAGES,
  INVESTOR_TYPES,
  getMyInvestorProfile,
  isCapitalType,
  isFundingStage,
  isInvestorType,
  toInvestorProfilePayload,
  upsertMyInvestorProfile,
  type CapitalType,
  type FundingStage,
  type InvestorProfileInput,
  type InvestorProfilePayload,
  type InvestorType,
} from "./profile";
