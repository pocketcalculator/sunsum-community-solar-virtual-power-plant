import type { ParticipantRoleId } from "@/domain/roles";

/**
 * Participant taxonomy from the Sum Sum Solar "New User / Create Profile" board,
 * extended with the investor profiles named in the MVP charter.
 *
 * Every type records which of the three charter workspaces it will eventually
 * use. `role: null` means the type has no workspace planned yet, which is stated
 * plainly rather than quietly routing the person somewhere that does not fit.
 */

export const USER_TYPE_GROUPS = [
  {
    id: "sites",
    label: "Sites and property",
    summary: "People offering a roof, land or an existing location.",
  },
  {
    id: "delivery",
    label: "Development and delivery",
    summary: "People who design, build or deliver the projects.",
  },
  {
    id: "utility",
    label: "Utility",
    summary: "Representatives of the organisations that run the network.",
  },
  {
    id: "community",
    label: "Community and institutions",
    summary: "Groups, campuses and civic organisations taking part.",
  },
  {
    id: "finance",
    label: "Funding",
    summary: "Philanthropy, funds and mission-aligned capital.",
  },
  {
    id: "interest",
    label: "Interested in learning more",
    summary: "No workspace planned for these yet.",
  },
] as const;

export type UserTypeGroupId = (typeof USER_TYPE_GROUPS)[number]["id"];

const USER_TYPE_DEFINITIONS = [
  {
    id: "property-owner",
    label: "Property owner",
    group: "sites",
    role: "site-owner",
    hint: "You own a roof, building or car park.",
  },
  {
    id: "landowner",
    label: "Landowner",
    group: "sites",
    role: "site-owner",
    hint: "You hold land that could host a ground-mounted array.",
  },
  {
    id: "site-host",
    label: "Site host",
    group: "sites",
    role: "site-owner",
    hint: "You would host a system you do not own yourself.",
  },
  {
    id: "potential-location",
    label: "Potential solar location",
    group: "sites",
    role: "site-owner",
    hint: "You are putting a specific location forward for consideration.",
  },
  {
    id: "project-developer",
    label: "Project developer",
    group: "delivery",
    role: "operator",
    hint: "You take projects from opportunity through to delivery.",
  },
  {
    id: "solar-developer",
    label: "Solar developer",
    group: "delivery",
    role: "operator",
    hint: "You design and develop the solar systems themselves.",
  },
  {
    id: "contractor",
    label: "Contractor or subcontractor",
    group: "delivery",
    role: "operator",
    hint: "You carry out installation or related site work.",
  },
  {
    id: "workforce-participant",
    label: "Workforce development participant",
    group: "delivery",
    role: "operator",
    hint: "You are training or placed through a workforce programme.",
  },
  {
    id: "utility-emc",
    label: "Utility — EMC representative",
    group: "utility",
    role: "operator",
    hint: "Electric membership corporation.",
  },
  {
    id: "utility-municipality",
    label: "Utility — municipality representative",
    group: "utility",
    role: "operator",
    hint: "Municipal utility or city energy office.",
  },
  {
    id: "utility-iou",
    label: "Utility — IOU representative",
    group: "utility",
    role: "operator",
    hint: "Investor-owned utility.",
  },
  {
    id: "purchaser",
    label: "Energy purchaser",
    group: "utility",
    role: "operator",
    hint: "You would buy the energy or environmental attributes produced.",
  },
  {
    id: "community-group",
    label: "Community group representative",
    group: "community",
    role: "site-owner",
    hint: "You represent a neighbourhood or community organisation.",
  },
  {
    id: "hbcu",
    label: "HBCU representative",
    group: "community",
    role: "site-owner",
    hint: "You represent a historically Black college or university.",
  },
  {
    id: "college-facilities",
    label: "College facilities representative",
    group: "community",
    role: "site-owner",
    hint: "You manage campus buildings or estates.",
  },
  {
    id: "philanthropy",
    label: "Philanthropy",
    group: "finance",
    role: "financier",
    hint: "Grant-making or programme-related investment.",
  },
  {
    id: "impact-investor",
    label: "Impact investor",
    group: "finance",
    role: "financier",
    hint: "Capital seeking measurable community outcomes.",
  },
  {
    id: "nmtc",
    label: "New Markets Tax Credit (NMTC)",
    group: "finance",
    role: "financier",
    hint: "NMTC allocatee or investor.",
  },
  {
    id: "cdfi-cde",
    label: "CDFI / CDE",
    group: "finance",
    role: "financier",
    hint: "Community development financial institution or entity.",
  },
  {
    id: "energy-equity-fund",
    label: "Energy equity fund",
    group: "finance",
    role: "financier",
    hint: "Fund investing in equitable energy infrastructure.",
  },
  {
    id: "corporate",
    label: "Corporate representative",
    group: "finance",
    role: "financier",
    hint: "Corporate sustainability, treasury or procurement.",
  },
  {
    id: "special-community-endowment",
    label: "Special Community Endowment",
    group: "finance",
    role: "financier",
    hint: "The endowment profile named in the MVP charter.",
  },
  {
    id: "legal-adviser",
    label: "Legal adviser",
    group: "interest",
    role: null,
    hint: "You advise a participant but do not run a project yourself.",
  },
  {
    id: "student-researcher",
    label: "Student or researcher",
    group: "interest",
    role: null,
    hint: "You are studying community solar rather than taking part.",
  },
  {
    id: "learning-more",
    label: "Just learning more",
    group: "interest",
    role: null,
    hint: "You are not ready to put a site or funding forward.",
  },
] as const;

export type UserTypeId = (typeof USER_TYPE_DEFINITIONS)[number]["id"];

export interface UserType {
  readonly id: UserTypeId;
  readonly label: string;
  readonly group: UserTypeGroupId;
  /** The charter workspace this type maps to, or null when none is planned. */
  readonly role: ParticipantRoleId | null;
  readonly hint: string;
}

export const USER_TYPES: readonly UserType[] = USER_TYPE_DEFINITIONS;

export function isUserTypeId(value: string): value is UserTypeId {
  return USER_TYPE_DEFINITIONS.some((type) => type.id === value);
}

export function getUserType(id: UserTypeId): UserType {
  const type = USER_TYPE_DEFINITIONS.find((candidate) => candidate.id === id);

  if (!type) {
    throw new Error(`Unknown user type: ${id}`);
  }

  return type;
}

export function userTypesInGroup(group: UserTypeGroupId): readonly UserType[] {
  return USER_TYPES.filter((type) => type.group === group);
}
