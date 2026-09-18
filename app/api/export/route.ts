/**
 * `GET /export`.
 *
 * Routes stay this thin on purpose: the backend owns identity, validation,
 * permission and the payload, so there is nothing here to get wrong and no
 * second place to keep in step.
 */

export { getExportRoute as GET } from "@/backend";
