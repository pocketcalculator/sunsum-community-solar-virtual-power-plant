/**
 * Primitives with no domain meaning.
 *
 * Anything here is usable by every domain, which is exactly why the traffic is
 * one-way: `shared` must not import a domain. A rule that reaches back into
 * `investors` or `projects` is not shared, it is misplaced, and the lint
 * boundary rejects it to stop an import cycle forming.
 *
 * Keep this small. A type is shared because more than one domain genuinely
 * needs it, not because there was nowhere obvious to put it.
 */

export {
  failure,
  ok,
  type Failure,
  type FailureCode,
  type Result,
} from "./result";
