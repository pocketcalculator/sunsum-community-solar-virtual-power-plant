import { JOURNEY_STAGES, type JourneyStageId } from "@/domain/journey";

export { JOURNEY_STAGES };
export type Stage = JourneyStageId;
export type Role = "site-owner" | "operator" | "investor";
export type View = "overview" | "profile" | "reports" | "sites" | "intake" | "compare" | "inbox" | "documents" | "queue" | "pipeline" | "portfolio" | "engagements" | "mandate" | "activity" | "welcome" | "roadmap";
export type Viability = "potentially_viable" | "more_information_required" | "not_currently_eligible";
export type SubmissionStatus = "draft" | "submitted" | "screening" | "info_requested" | "accepted" | "rejected";

export interface Assessment {
  id: string;
  result: Viability;
  capacity: [number, number] | null;
  generation: [number, number] | null;
  version: string;
  factors: string[];
  flags: string[];
  createdAt: string;
  overrideReason?: string;
}

export interface DemoDocument {
  id: string;
  name: string;
  kind: "site_summary" | "ownership" | "electricity_bill" | "photo" | "technical";
  size: number;
  disclosure: "owner_private" | "investor_tier_1";
  createdAt: string;
  version?: number;
  review?: "unreviewed" | "reviewed";
  reviewedAt?: string;
  replacesId?: string;
  taskId?: string;
}

export interface ProjectTask {
  id: string;
  title: string;
  kind: "evidence" | "review";
  status: "requested" | "provided" | "reviewed";
  requiredForStage: Stage | null;
  documentKind: DemoDocument["kind"] | null;
  note: string;
}

export interface HumanDecision {
  decision: "accept" | "reject" | "request_info";
  note: string;
  at: string;
  assessmentId: string | null;
  evidenceRevision: number;
}

export interface ExpertNote {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  previous: { text: string; at: string }[];
}

export interface DemoProfile {
  name: string;
  participant: "individual" | "organization";
  organization: string;
  intents: string[];
  ownerGoals: string[];
  coOwnership: "single" | "co_owned" | "cooperative" | "undecided";
  purchaseMwhPerYear: number | null;
  completed: boolean;
}

export interface DemoDraft {
  id: string;
  siteId: string;
  kind: "project_brief" | "assessment_report";
  title: string;
  content: string;
  templateVersion: string;
  sourceFields: { key: string; label: string; value: string; sourceValue?: string }[];
  sourceRevision: string;
  authorRole: Role;
  createdAt: string;
  updatedAt: string;
  review: "draft" | "reviewed";
  reviewedAt: string | null;
  reviewerRole?: Role | null;
}

export interface Activity {
  id: string;
  at: string;
  actor: Role;
  kind: "submission" | "stage" | "decision" | "interest" | "owner_interest" | "task" | "note" | "document" | "acknowledgement" | "override" | "visibility" | "assignment";
  title: string;
  detail: string;
  scope: "shared" | "owner" | "operator" | "investor";
  documentId?: string;
}

export interface Site {
  id: string;
  name: string;
  locality: string;
  region: "GA" | "TN" | "unknown";
  address: string;
  contactName: string;
  contactEmail: string;
  type: "rooftop" | "land";
  ownership: "confirmed" | "pending" | "unverified";
  area: number | null;
  usage: number | null;
  existingSolar: boolean;
  consent: boolean;
  status: SubmissionStatus;
  stage: Stage | null;
  visible: boolean;
  assignee: string;
  nextAction: string;
  targetDate: string;
  assessments: Assessment[];
  documents: DemoDocument[];
  activity: Activity[];
  outstanding: string[];
  acknowledgement: { name: string; at: string } | null;
  fundingNeeds: { id: string; title: string; amount: number | null; status: "open" | "delivered" }[];
  mapPosition: [number, number] | null;
  ownerVisible?: boolean;
  ownerGoals?: string[];
  tasks?: ProjectTask[];
  decisions?: HumanDecision[];
  reviewRequired?: boolean;
  notes?: ExpertNote[];
  evidenceRevision?: number;
  revision?: number;
  assessmentError?: string | null;
}

export interface Mandate {
  organization: string;
  investorType: string;
  capitalType: string;
  stages: string[];
  geographies: string[];
  minimum: number | null;
  maximum: number | null;
  objectives: string[];
  impact: string[];
  criteria: string[];
  completed: boolean;
}

export interface Engagement {
  id: string;
  siteId: string;
  state: "interested" | "withdrawn";
  at: string;
  fundingNeedId: string | null;
}

export interface LabState {
  version: 1;
  sites: Site[];
  engagements: Engagement[];
  mandate: Mandate;
  profile?: DemoProfile;
  drafts?: DemoDraft[];
}

export type Action =
  | { type: "save-site"; site: Site }
  | { type: "submit"; id: string; result: Viability }
  | { type: "review"; id: string; decision: "accept" | "reject" | "request_info"; note: string }
  | { type: "advance"; id: string }
  | { type: "visibility"; id: string; visible: boolean }
  | { type: "assign"; id: string; assignee: string; nextAction: string; targetDate: string }
  | { type: "override"; id: string; result: Viability; reason: string }
  | { type: "document"; id: string; document: DemoDocument; actor: Role }
  | { type: "acknowledge"; id: string; name: string }
  | { type: "note"; id: string; note: string }
  | { type: "interest"; id: string; fundingNeedId?: string }
  | { type: "withdraw"; id: string }
  | { type: "mandate"; mandate: Mandate }
  | { type: "profile"; profile: DemoProfile }
  | { type: "start-project"; id: string }
  | { type: "confirm-review"; id: string; note: string }
  | { type: "task-review"; id: string; taskId: string; note: string }
  | { type: "document-review"; id: string; documentId: string }
  | { type: "save-note"; id: string; noteId?: string; text: string }
  | { type: "rerun"; id: string; result: Viability; reason: string }
  | { type: "screen-failure"; id: string }
  | { type: "save-draft"; draft: DemoDraft }
  | { type: "review-draft"; draftId: string; role: Role }
  | { type: "reset" };

export const VIABILITY_LABELS: Record<Viability, string> = {
  potentially_viable: "Potentially viable",
  more_information_required: "More information needed",
  not_currently_eligible: "Not currently eligible",
};

export const ROLE_LABELS: Record<Role, string> = {
  "site-owner": "Site owner", operator: "Platform operator", investor: "Investor",
};

export const NAVIGATION: Record<Role, { id: View; label: string; icon: string }[]> = {
  "site-owner": [
    { id: "overview", label: "Overview", icon: "overview" },
    { id: "profile", label: "My profile", icon: "people" },
    { id: "sites", label: "My sites", icon: "roof" },
    { id: "compare", label: "Solar potential", icon: "chart" },
    { id: "inbox", label: "Action center", icon: "inbox" },
    { id: "documents", label: "Documents", icon: "file" },
    { id: "reports", label: "Drafts & reports", icon: "download" },
    { id: "activity", label: "Activity log", icon: "clock" },
  ],
  operator: [
    { id: "queue", label: "Action center", icon: "inbox" },
    { id: "overview", label: "Overview", icon: "overview" },
    { id: "pipeline", label: "Project pipeline", icon: "pipeline" },
    { id: "engagements", label: "Investor interest", icon: "people" },
    { id: "documents", label: "Documents", icon: "file" },
    { id: "reports", label: "Drafts & reports", icon: "download" },
    { id: "activity", label: "Activity log", icon: "clock" },
  ],
  investor: [
    { id: "overview", label: "Overview", icon: "overview" },
    { id: "portfolio", label: "Discover projects", icon: "grid" },
    { id: "engagements", label: "My interests", icon: "heart" },
    { id: "mandate", label: "Investment mandate", icon: "sliders" },
    { id: "documents", label: "Deal documents", icon: "file" },
    { id: "reports", label: "Reports & exports", icon: "download" },
    { id: "activity", label: "Activity log", icon: "clock" },
  ],
};

export const INVESTOR_TYPES = [
  ["philanthropy", "Philanthropy"],
  ["impact_investor", "Impact investor"],
  ["nmtc", "New Markets Tax Credit"],
  ["cdfi_cde", "CDFI / CDE"],
  ["energy_equity_fund", "Energy equity fund"],
  ["corporate", "Corporate"],
  ["special_community_endowment", "Special Community Endowment"],
] as const;

export const CAPITAL_TYPES = [
  ["grant", "Grant"], ["recoverable_grant", "Recoverable grant"],
  ["concessionary_debt", "Concessionary debt"], ["senior_debt", "Senior debt"],
  ["tax_equity", "Tax equity"], ["sponsor_equity", "Sponsor equity"],
  ["corporate_offtake", "Corporate offtake"],
] as const;

export function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function stageName(stage: Stage | null) {
  return JOURNEY_STAGES.find((item) => item.id === stage)?.name ?? "Draft";
}

export function latestAssessment(site: Site) {
  return site.assessments.at(-1);
}

export function capacity(site: Site) {
  const range = latestAssessment(site)?.capacity;
  return range ? (range[0] + range[1]) / 2 : 0;
}

export function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

export function money(cents: number | null) {
  return cents === null ? "To be scoped" : new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", timeZone: "America/New_York",
  }).format(new Date(value.length === 10 ? `${value}T16:00:00Z` : value));
}

export function makeDraft(): Site {
  return {
    id: newId("site"), name: "", locality: "Location pending validation", region: "unknown",
    address: "", contactName: "", contactEmail: "", type: "rooftop", ownership: "pending",
    area: null, usage: null, existingSolar: false, consent: false, status: "draft", stage: null,
    visible: false, assignee: "Unassigned", nextAction: "Complete your site details", targetDate: "",
    assessments: [], documents: [], activity: [], outstanding: [], acknowledgement: null,
    fundingNeeds: [], mapPosition: null, ownerVisible: true,
    tasks: [], decisions: [], notes: [], evidenceRevision: 0, revision: 0,
  };
}

export function defaultProfile(): DemoProfile {
  return {
    name: "Alex Morgan (demo)", participant: "individual", organization: "",
    intents: ["i-am-property-owner"], ownerGoals: ["Explore solar potential"],
    coOwnership: "undecided", purchaseMwhPerYear: null, completed: false,
  };
}

export function projectTasks(site: Site): ProjectTask[] {
  return site.tasks ?? site.outstanding.map((title, index) => ({
    id: `task-${site.id}-${index}`, title, kind: "evidence", status: "requested",
    requiredForStage: null, documentKind: null, note: "",
  }));
}

export function needsReconfirmation(site: Site) {
  const decision = site.decisions?.at(-1);
  return site.status === "accepted" && (site.reviewRequired === true || (!!decision && (
    decision.assessmentId !== (latestAssessment(site)?.id ?? null) ||
    decision.evidenceRevision !== (site.evidenceRevision ?? 0)
  )));
}

export function stageBlockers(site: Site): string[] {
  const next = JOURNEY_STAGES[JOURNEY_STAGES.findIndex((stage) => stage.id === site.stage) + 1];
  if (!next || !site.stage) return [];
  return [
    ...projectTasks(site).filter((task) => task.requiredForStage === next.id && task.status !== "reviewed").map((task) => task.title),
    ...(needsReconfirmation(site) ? ["Reconfirm the human decision after evidence or assessment changes"] : []),
  ];
}

export function sourceRevision(site: Site) {
  return `${site.id}:r${site.revision ?? 0}:${latestAssessment(site)?.id ?? "unscreened"}`;
}

export function visibleDrafts(state: LabState, role: Role, siteId?: string) {
  const permitted = new Set(roleSites(state, role).map((site) => site.id));
  return (state.drafts ?? []).filter((draft) => permitted.has(draft.siteId) &&
    (!siteId || draft.siteId === siteId) && (role === "operator" || draft.authorRole === role) &&
    (role !== "investor" || isInterested(state, draft.siteId)));
}

export function missingFields(site: Site): string[] {
  return [
    !site.name.trim() ? "Site name" : "",
    !site.contactName.trim() ? "Contact name" : "",
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(site.contactEmail) ? "Valid contact email" : "",
    !site.address.trim() ? "Site address" : "",
    site.area === null || !Number.isFinite(site.area) || site.area <= 0 ? "Usable area greater than 0 m²" : "",
    site.usage !== null && (!Number.isFinite(site.usage) || site.usage < 0) ? "Non-negative annual electricity use" : "",
    !site.consent ? "Submission consent" : "",
  ].filter(Boolean);
}

export function demoAssessment(result: Viability, at: string, id: string): Assessment {
  return {
    id, result, capacity: result === "potentially_viable" ? [180, 240] : null,
    generation: result === "potentially_viable" ? [243000, 324000] : null,
    version: "design-fixture-v1", createdAt: at,
    factors: [
      "Illustrative screening scenario selected for this demo.",
      "Address and roof geometry have not been geocoded or verified.",
      "Capacity and production are fixed UI fixtures, not calculated from your inputs.",
      "Ownership, roof structure, shading and utility review require a human assessment.",
    ],
    flags: result === "potentially_viable" ? ["Structural review still required"] :
      result === "more_information_required" ? ["Confirm usable area and provide ownership evidence"] :
        ["This example represents a site outside the screening criteria"],
  };
}

const SEED_DATE = "2026-09-17T13:00:00.000Z";

export function createSeed(): LabState {
  const specifications: {
    id: string; name: string; locality: string; type: Site["type"]; stage: Stage;
    range: [number, number]; generation: [number, number]; position: [number, number];
    visible: boolean; result: Viability; status?: SubmissionStatus; area: number;
  }[] = [
    { id: "sweet-auburn", name: "Sweet Auburn rooftop", locality: "Sweet Auburn", type: "rooftop",
      stage: "pre-development", range: [180, 240], generation: [243000, 324000], position: [65, 39], visible: true, result: "potentially_viable", area: 1800 },
    { id: "west-end", name: "West End community canopy", locality: "West End", type: "land",
      stage: "development", range: [320, 410], generation: [432000, 553500], position: [27, 70], visible: true, result: "potentially_viable", area: 3600 },
    { id: "mechanicsville", name: "Mechanicsville school roof", locality: "Mechanicsville", type: "rooftop",
      stage: "construction", range: [95, 130], generation: [128250, 175500], position: [53, 75], visible: true, result: "more_information_required", area: 1200 },
    { id: "grove-park", name: "Grove Park warehouse", locality: "Grove Park", type: "rooftop",
      stage: "pre-development", range: [500, 640], generation: [675000, 864000], position: [19, 30], visible: false, result: "potentially_viable", area: 5200 },
    { id: "old-fourth", name: "Old Fourth Ward studios", locality: "Old Fourth Ward", type: "rooftop",
      stage: "screening", range: [120, 165], generation: [162000, 222750], position: [71, 23], visible: false, result: "potentially_viable", status: "screening", area: 1400 },
    { id: "east-point", name: "East Point neighborhood lot", locality: "East Point", type: "land",
      stage: "submitted", range: [85, 115], generation: [114750, 155250], position: [30, 89], visible: false, result: "more_information_required", status: "info_requested", area: 950 },
  ];
  const sites: Site[] = specifications.map((seed, index) => {
    const assessment = demoAssessment(seed.result, SEED_DATE, `assessment-${seed.id}`);
    assessment.capacity = seed.range;
    assessment.generation = seed.generation;
    const activity: Activity[] = [
      { id: `activity-${seed.id}-1`, at: "2026-09-14T14:00:00.000Z", actor: "site-owner", kind: "submission", title: "Site submitted", detail: "A synthetic Atlanta pilot site was added.", scope: "shared" },
      { id: `activity-${seed.id}-2`, at: "2026-09-15T16:30:00.000Z", actor: "operator", kind: "stage", title: stageName(seed.stage), detail: "Current project stage in the design scenario.", scope: "shared" },
    ];
    return {
      id: seed.id, name: seed.name, locality: seed.locality, region: "GA",
      address: `${100 + index * 20} Example ${seed.type === "land" ? "Lane" : "Street"}, Atlanta, GA`,
      contactName: "Alex Morgan (demo)", contactEmail: "owner@example.invalid",
      type: seed.type, ownership: seed.id === "east-point" ? "pending" : "confirmed",
      area: seed.area, usage: 48000 + index * 4000, existingSolar: false, consent: true,
      status: seed.status ?? "accepted", stage: seed.status === "info_requested" ? null : seed.stage, visible: seed.visible,
      assignee: "Jordan Lee", nextAction: seed.id === "sweet-auburn" ? "Schedule the structural site assessment" :
        seed.id === "east-point" ? "Provide proof of site ownership" : "Review the next project milestone",
      targetDate: "2026-09-24", assessments: [assessment],
      documents: [
        { id: `summary-${seed.id}`, name: "Preliminary site summary.pdf", kind: "site_summary", size: 248000, disclosure: "investor_tier_1", createdAt: SEED_DATE },
        { id: `bill-${seed.id}`, name: "Example electricity bill.pdf", kind: "electricity_bill", size: 192000, disclosure: "owner_private", createdAt: SEED_DATE },
      ],
      activity, outstanding: seed.id === "east-point" ? ["Provide proof of site ownership"] : [],
      acknowledgement: null,
      fundingNeeds: seed.status ? [] : [
        { id: `need-${seed.id}`, title: "Feasibility study", amount: null, status: "open" },
      ],
      mapPosition: seed.position,
    };
  });
  for (const site of sites) {
    site.ownerVisible = true;
    site.revision = 0;
    site.evidenceRevision = 0;
    site.notes = [];
    site.tasks = site.outstanding.map((title, index) => ({
      id: `task-${site.id}-${index}`, title, kind: "evidence", status: "requested",
      requiredForStage: null, documentKind: "ownership", note: "An example request for this site, not a universal requirement.",
    }));
    if (site.stage === "pre-development") site.tasks.push({
      id: `task-${site.id}-milestone`, title: "Review the example feasibility scope",
      kind: "review", status: "requested", requiredForStage: "development",
      documentKind: null, note: "Illustrative stage prerequisite. A human must explicitly review it.",
    });
    site.decisions = site.status === "accepted" ? [{
      decision: "accept", note: "Existing fictional project state; not a real approval.",
      at: SEED_DATE, assessmentId: site.assessments[0]?.id ?? null, evidenceRevision: 0,
    }] : [];
  }
  for (let index = 6; index < 50; index += 1) {
    const sample = sites[index % 3]!;
    const id = `preview-${String(index + 1).padStart(2, "0")}`;
    const assessment = { ...sample.assessments[0]!, id: `assessment-${id}`, factors: [...sample.assessments[0]!.factors], flags: [...sample.assessments[0]!.flags] };
    sites.push({
      ...sample, id, name: `Community ${index % 2 ? "canopy" : "rooftop"} ${String(index + 1).padStart(2, "0")}`,
      locality: `Example district ${index % 8 + 1}`, region: index % 5 === 0 ? "TN" : "GA",
      address: `${index + 1} Fictional Way`, contactName: "Fictional site steward",
      contactEmail: "steward@example.invalid", ownerVisible: false,
      type: index % 2 ? "land" : "rooftop", assessments: [assessment],
      mapPosition: [12 + (index * 17) % 76, 18 + (index * 13) % 63],
      documents: sample.documents.map((doc) => ({ ...doc, id: `${doc.kind}-${id}` })),
      tasks: [], outstanding: [], activity: [], notes: [],
      decisions: [{ decision: "accept", note: "Synthetic portfolio fixture.", at: SEED_DATE, assessmentId: assessment.id, evidenceRevision: 0 }],
      fundingNeeds: [{ id: `need-${id}`, title: "Example feasibility scope", amount: null, status: "open" }],
    });
  }
  return {
    version: 1, sites, engagements: [], profile: defaultProfile(), drafts: [],
    mandate: {
      organization: "Community Futures (demo)", investorType: "special_community_endowment",
      capitalType: "grant", stages: ["pre-development", "development", "construction"],
      geographies: ["GA"], minimum: null, maximum: null, objectives: ["Community ownership"],
      impact: ["Energy access", "Local opportunity"], criteria: ["Transparent viability"],
      completed: true,
    },
  };
}

export function investorVisible(site: Site) {
  return site.visible && site.status === "accepted" && site.stage !== null &&
    JOURNEY_STAGES.findIndex((stage) => stage.id === site.stage) >= 2;
}

export function isInterested(state: LabState, id: string) {
  return state.engagements.some((entry) => entry.siteId === id && entry.state === "interested");
}

export function roleSites(state: LabState, role: Role) {
  return role === "investor" ? state.sites.filter(investorVisible) :
    role === "site-owner" ? state.sites.filter((site) => site.ownerVisible !== false) : state.sites;
}

export function visibleActivity(site: Site, role: Role): Activity[] {
  return site.activity.filter((event) => role === "operator" || event.scope === "shared" ||
    event.scope === (role === "site-owner" ? "owner" : "investor"));
}

export function visibleDocuments(state: LabState, site: Site, role: Role) {
  if (role !== "investor") return site.documents;
  return investorVisible(site) && isInterested(state, site.id)
    ? site.documents.filter((doc) => doc.disclosure === "investor_tier_1") : [];
}

export function reduceLab(state: LabState, action: Action, at = new Date().toISOString()): LabState {
  if (action.type === "reset") return createSeed();
  if (action.type === "mandate") return { ...state, mandate: action.mandate };
  if (action.type === "profile") {
    if (action.profile.completed && (!action.profile.name.trim() || !action.profile.intents.length ||
      (action.profile.participant === "organization" && !action.profile.organization.trim()))) return state;
    if (action.profile.purchaseMwhPerYear !== null && (!Number.isFinite(action.profile.purchaseMwhPerYear) || action.profile.purchaseMwhPerYear < 0)) return state;
    return { ...state, profile: action.profile };
  }
  if (action.type === "save-draft") {
    const draft = action.draft;
    const site = roleSites(state, draft.authorRole).find((item) => item.id === draft.siteId);
    const previous = state.drafts?.find((item) => item.id === draft.id);
    if (!site || !draft.title.trim() || !draft.content.trim() ||
      (draft.authorRole === "investor" && !isInterested(state, site.id)) ||
      (previous && (previous.siteId !== draft.siteId || previous.authorRole !== draft.authorRole))) return state;
    const saved: DemoDraft = { ...draft, review: "draft", reviewedAt: null, reviewerRole: null, updatedAt: at, createdAt: previous?.createdAt ?? at };
    return { ...state, drafts: [...(state.drafts ?? []).filter((item) => item.id !== draft.id), saved] };
  }
  if (action.type === "review-draft") {
    const draft = visibleDrafts(state, action.role).find((item) => item.id === action.draftId);
    const site = state.sites.find((item) => item.id === draft?.siteId);
    if (!draft || !site || draft.sourceRevision !== sourceRevision(site) || draft.review === "reviewed") return state;
    return { ...state, drafts: (state.drafts ?? []).map((item) => item.id === draft.id ? { ...item, review: "reviewed", reviewedAt: at, reviewerRole: action.role } : item) };
  }
  if (action.type === "save-site") {
    const existing = state.sites.find((site) => site.id === action.site.id);
    if (existing && !["draft", "info_requested"].includes(existing.status)) return state;
    const saved = { ...action.site, revision: (existing?.revision ?? 0) + 1 };
    return { ...state, sites: existing ? state.sites.map((site) => site.id === action.site.id ? saved : site) : [...state.sites, saved] };
  }
  const source = state.sites.find((site) => site.id === action.id);
  if (!source) return state;
  const site: Site = { ...source, activity: [...source.activity], assessments: [...source.assessments], documents: [...source.documents] };
  const event = (actor: Role, kind: Activity["kind"], title: string, detail: string, scope: Activity["scope"] = "shared", documentId?: string) => {
    site.activity.push({ id: `event-${site.id}-${site.activity.length}-${at}`, at, actor, kind, title, detail, scope, ...(documentId ? { documentId } : {}) });
  };
  let engagements = state.engagements;
  switch (action.type) {
    case "submit":
      if (!["draft", "info_requested"].includes(site.status) || missingFields(site).length) return state;
      site.status = "screening"; site.stage = "screening"; site.outstanding = [];
      site.assessments.push(demoAssessment(action.result, at, `assessment-${site.id}-${site.assessments.length}`));
      site.assessmentError = null;
      site.nextAction = "An operator will review your submission";
      event("site-owner", "submission", "Site submitted for screening", "Illustrative screening is complete. Operator review is next.");
      break;
    case "review":
      if (!["submitted", "screening"].includes(site.status) || !action.note.trim()) return state;
      site.status = action.decision === "accept" ? "accepted" : action.decision === "reject" ? "rejected" : "info_requested";
      site.reviewRequired = false;
      site.stage = null;
      site.visible = false;
      site.nextAction = action.decision === "accept" ? "Schedule a feasibility review" : action.note;
      site.outstanding = action.decision === "request_info" ? [action.note] : [];
      site.tasks = action.decision === "request_info" ? [{
        id: `task-${site.id}-${at}`, title: action.note, kind: "evidence", status: "requested",
        requiredForStage: null, documentKind: null, note: "Site-specific human request.",
      }] : projectTasks(site);
      site.decisions = [...(site.decisions ?? []), { decision: action.decision, note: action.note.trim(), at, assessmentId: latestAssessment(site)?.id ?? null, evidenceRevision: site.evidenceRevision ?? 0 }];
      event("operator", "decision", action.decision === "accept" ? "Site accepted for project setup" : action.decision === "reject" ? "Site not accepted" : "More information requested", action.note, "owner");
      break;
    case "start-project":
      if (site.status !== "accepted" || site.stage !== null || needsReconfirmation(site)) return state;
      site.stage = "pre-development";
      site.fundingNeeds = [{ id: `need-${site.id}`, title: "Feasibility study", amount: null, status: "open" }];
      site.tasks = [...projectTasks(site), {
        id: `task-${site.id}-milestone`, title: "Review the example feasibility scope",
        kind: "review", status: "requested", requiredForStage: "development",
        documentKind: null, note: "Illustrative prerequisite, not an approved stage policy.",
      }];
      event("operator", "stage", "Pre-development started", "Explicit project setup in the synthetic scenario; no funding or publication.");
      break;
    case "confirm-review":
      if (site.status !== "accepted" || !action.note.trim()) return state;
      site.reviewRequired = false;
      site.decisions = [...(site.decisions ?? []), { decision: "accept", note: action.note.trim(), at, assessmentId: latestAssessment(site)?.id ?? null, evidenceRevision: site.evidenceRevision ?? 0 }];
      event("operator", "decision", "Human decision reconfirmed", action.note.trim(), "owner");
      break;
    case "advance": {
      if (site.status !== "accepted") return state;
      const index = JOURNEY_STAGES.findIndex((stage) => stage.id === site.stage);
      const next = JOURNEY_STAGES[index + 1];
      if (index < 2 || !next || stageBlockers(site).length) return state;
      site.stage = next.id;
      event("operator", "stage", `Moved to ${next.name.toLowerCase()}`, next.summary);
      break;
    }
    case "visibility":
      if (site.status !== "accepted" || !site.stage || (action.visible && needsReconfirmation(site)) || site.visible === action.visible) return state;
      site.visible = action.visible;
      event("operator", "visibility", action.visible ? "Published to investor portfolio" : "Investor visibility removed", "Demo portfolio visibility was changed.", "operator");
      break;
    case "assign":
      site.assignee = action.assignee.trim() || "Unassigned";
      site.nextAction = action.nextAction;
      site.targetDate = action.targetDate;
      event("operator", "assignment", "Project next steps updated", action.nextAction, "owner");
      break;
    case "rerun":
    case "override": {
      if (!action.reason.trim() || !site.assessments.length) return state;
      const assessment = demoAssessment(action.result, at, `assessment-${site.id}-${site.assessments.length}`);
      assessment.overrideReason = action.reason.trim();
      site.assessments.push(assessment);
      site.assessmentError = null;
      site.reviewRequired = site.status === "accepted";
      event("operator", "override", "Manual example assessment recorded", action.reason, "operator");
      break;
    }
    case "screen-failure":
      if (!site.assessments.length) return state;
      site.assessmentError = "Simulated screening failure. The last successful assessment is retained; no provider was called.";
      event("operator", "override", "Example rerun failed", site.assessmentError, "operator");
      break;
    case "document":
      if (action.actor === "investor") return state;
      if (site.documents.some((doc) => doc.id === action.document.id)) return state;
      site.documents.push(action.document);
      site.evidenceRevision = (site.evidenceRevision ?? 0) + 1;
      site.reviewRequired = site.status === "accepted";
      event(action.actor, "document", "Document placeholder added", action.document.name, "owner", action.document.id);
      break;
    case "document-review": {
      const document = site.documents.find((item) => item.id === action.documentId);
      if (!document || document.review === "reviewed") return state;
      site.documents = site.documents.map((item) => item.id === document.id ? { ...item, review: "reviewed", reviewedAt: at } : item);
      event("operator", "document", "Metadata review recorded", document.name, "owner", document.id);
      break;
    }
    case "task-review": {
      const task = projectTasks(site).find((item) => item.id === action.taskId);
      if (!task || task.status === "reviewed" || !action.note.trim()) return state;
      if (task.kind === "evidence" && !site.documents.some((doc) => doc.review === "reviewed" &&
        (doc.taskId === task.id || (task.documentKind !== null && doc.kind === task.documentKind)))) return state;
      site.tasks = projectTasks(site).map((item) => item.id === task.id ? { ...item, status: "reviewed", note: action.note.trim() } : item);
      site.outstanding = site.outstanding.filter((item) => item !== task.title);
      event("operator", "task", "Example task reviewed", `${task.title}: ${action.note.trim()}`, "owner");
      break;
    }
    case "acknowledge":
      if (!action.name.trim() || site.status !== "accepted") return state;
      site.acknowledgement = { name: action.name.trim(), at };
      event("site-owner", "acknowledgement", "Demo acknowledgement recorded", "Typed-name simulation only; not a legal signature.", "owner");
      break;
    case "note":
      if (!action.note.trim()) return state;
      event("operator", "note", "Internal note", action.note, "operator");
      break;
    case "save-note": {
      if (!action.text.trim()) return state;
      const previous = site.notes?.find((item) => item.id === action.noteId);
      if (action.noteId && !previous) return state;
      const note: ExpertNote = {
        id: previous?.id ?? `note-${site.id}-${site.notes?.length ?? 0}-${at}`,
        text: action.text.trim(), createdAt: previous?.createdAt ?? at, updatedAt: at,
        previous: previous ? [...previous.previous, { text: previous.text, at: previous.updatedAt }] : [],
      };
      site.notes = [...(site.notes ?? []).filter((item) => item.id !== note.id), note];
      event("operator", "note", previous ? "Internal note edited" : "Internal note saved", note.text, "operator");
      break;
    }
    case "interest":
      if (!state.mandate.completed || !investorVisible(site) || isInterested(state, site.id)) return state;
      if (action.fundingNeedId && !site.fundingNeeds.some((need) => need.id === action.fundingNeedId && need.status === "open")) return state;
      engagements = [...state.engagements.filter((entry) => entry.siteId !== site.id), {
        id: `engagement-${site.id}`, siteId: site.id, state: "interested", at, fundingNeedId: action.fundingNeedId ?? null,
      }];
      event("investor", "interest", "Interest expressed", "Non-binding interest recorded in this browser. No capital is committed.", "investor");
      event("investor", "owner_interest", "New non-binding project interest", "An investor expressed interest in this fictional project. No commitment or funding has occurred.", "owner");
      break;
    case "withdraw":
      if (!isInterested(state, site.id)) return state;
      engagements = state.engagements.map((entry) => entry.siteId === site.id ? { ...entry, state: "withdrawn", at } : entry);
      event("investor", "interest", "Interest withdrawn", "Deal-room access returns to the project summary.", "investor");
      break;
  }
  site.revision = (site.revision ?? 0) + 1;
  return { ...state, engagements, sites: state.sites.map((item) => item.id === site.id ? site : item) };
}
