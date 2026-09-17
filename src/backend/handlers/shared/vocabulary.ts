import type { ParticipantRoleId } from "@/domain/roles";

import type { Role } from "../../core/identity";

const WIRE_ROLE_BY_DOMAIN = {
  "site-owner": "site_owner",
  operator: "operator",
  financier: "investor",
} as const satisfies Record<ParticipantRoleId, Role>;

const DOMAIN_ROLE_BY_WIRE = {
  site_owner: "site-owner",
  operator: "operator",
  investor: "financier",
} as const satisfies Record<Role, ParticipantRoleId>;

export function toWireRole(id: ParticipantRoleId): Role {
  return WIRE_ROLE_BY_DOMAIN[id];
}

export function toDomainRole(role: Role): ParticipantRoleId {
  return DOMAIN_ROLE_BY_WIRE[role];
}
