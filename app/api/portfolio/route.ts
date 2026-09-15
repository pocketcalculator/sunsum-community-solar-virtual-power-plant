/**
 * `GET /portfolio`.
 *
 * Routes stay this thin on purpose: the backend owns identity, validation,
 * permission and the payload, so there is nothing here to get wrong and no
 * second place to keep in step.
 */

export { getPortfolioRoute as GET } from "@/backend";
