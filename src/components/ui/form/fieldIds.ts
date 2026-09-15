/**
 * Id conventions shared by the form primitives.
 *
 * The caller owns a field's id because error summaries and page anchors link to
 * it. Hint, error and extra description ids are derived from it here, so every
 * field wires `aria-describedby` the same way.
 */

export function hintId(fieldId: string): string {
  return `${fieldId}-hint`;
}

export function errorId(fieldId: string): string {
  return `${fieldId}-error`;
}

interface DescriptionParts {
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  /** Ids of further descriptions, such as a password strength hint. */
  readonly extraIds?: readonly string[] | undefined;
}

export function describedBy(
  fieldId: string,
  parts: DescriptionParts,
): string | undefined {
  const ids = [
    parts.hint ? hintId(fieldId) : null,
    ...(parts.extraIds ?? []),
    parts.error ? errorId(fieldId) : null,
  ].filter((id): id is string => id !== null);

  return ids.length > 0 ? ids.join(" ") : undefined;
}
