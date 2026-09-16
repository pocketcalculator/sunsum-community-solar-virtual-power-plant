/**
 * Public interface for the browser-only guidance assistant feature.
 * Application routes import from this barrel so the drawer implementation can
 * evolve without exposing its internal component and response-model files.
 */

export { Assistant, type AssistantOption } from "./components/Assistant";