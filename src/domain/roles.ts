/**
 * Charter role vocabulary.
 *
 * These are the three role-based experiences the platform is being built around.
 * Pure data with no React, styling or routing, so any feature can depend on it
 * without depending on another feature.
 */

const ROLE_DEFINITIONS = [
  {
    id: "site-owner",
    label: "Site owner",
    summary:
      "Offers a roof, field or car park and follows what happens to it in plain language.",
  },
  {
    id: "operator",
    label: "Platform operator",
    summary:
      "Coordinates intake, screening, build and day-to-day running across community projects.",
  },
  {
    id: "financier",
    label: "Financier / investor",
    summary:
      "Reviews readiness and milestones for projects described on one consistent record.",
  },
] as const;

export type ParticipantRoleId = (typeof ROLE_DEFINITIONS)[number]["id"];

export interface ParticipantRole {
  readonly id: ParticipantRoleId;
  readonly label: string;
  readonly summary: string;
}

export const PARTICIPANT_ROLES: readonly ParticipantRole[] = ROLE_DEFINITIONS;

export function isParticipantRoleId(value: string): value is ParticipantRoleId {
  return ROLE_DEFINITIONS.some((role) => role.id === value);
}

/**
 * Throws rather than returning a generic placeholder: an unknown id here means
 * the caller skipped validation, and a silent fallback would hide that.
 */
export function getParticipantRole(id: ParticipantRoleId): ParticipantRole {
  const role = ROLE_DEFINITIONS.find((candidate) => candidate.id === id);

  if (!role) {
    throw new Error(`Unknown participant role: ${id}`);
  }

  return role;
}
