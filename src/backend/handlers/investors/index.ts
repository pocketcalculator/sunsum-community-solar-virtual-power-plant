/**
 * S-INV at the transport edge.
 *
 * Request parsing and status mapping for the investor endpoints. The matching
 * and visibility rules are in `core/investors`; this directory only deals in
 * query strings, bodies and status codes.
 */

export {
  getPortfolioRoute,
  handleGetPortfolio,
  parsePortfolioQuery,
} from "./portfolio";
