/** Joins conditional class names without pulling in a runtime dependency. */
export function cx(
  ...parts: readonly (string | false | null | undefined)[]
): string {
  return parts.filter((part): part is string => Boolean(part)).join(" ");
}
