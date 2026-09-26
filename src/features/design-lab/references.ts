export const DESIGN_LINEAGE = [
  { family: "Prior editorial web prototypes", pattern: "Product-accurate previews, consistent chrome and tactile interaction.", translation: "Sunroom keeps the original Sunsum styling and adds direct, responsive project exploration." },
  { family: "Prior analytical workspaces", pattern: "Layered surfaces, consistent controls, clear units and provenance.", translation: "Portfolio scope, project context and operator actions remain spatially stable." },
  { family: "Prior guided experiences", pattern: "An expressive introduction with calm reading and working surfaces.", translation: "Overview pages stay separate from focused intake, review and diligence tasks." },
  { family: "Prior browser-tool experiments", pattern: "Working navigation, aligned controls, native scrolling and explicit next actions.", translation: "Shared role state, keyboard search, reversible local interactions and reduced-motion alternatives take priority over decorative effects." },
] as const;

export const DESIGN_REFERENCES = [
  {
    name: "Copy.ai context",
    url: "https://mobbin.com/screens/7841e3ad-4c4d-42f3-903e-b0bcf3750ae4",
    pattern: "A visible active workspace with a separate task layer.",
    translation: "One demo-role control and one project selector, without duplicate workspace hierarchies.",
  },
  {
    name: "Airbnb map and list",
    url: "https://mobbin.com/screens/4b9d614f-7f68-47bb-83e6-7fd35efca097",
    pattern: "Reciprocal selection between spatial overview and a complete list.",
    translation: "A full-width synthetic map above the list, not a copy of the side-by-side reference.",
  },
  {
    name: "Toggl Track report flow",
    url: "https://mobbin.com/flows/512dcde4-0372-4f50-8038-fee1fbb69f86",
    pattern: "Export choices remain beside the report and show genuine pending state.",
    translation: "Actual local HTML/CSV output, without invented progress, recipient delivery or native Word/PDF claims.",
  },
  {
    name: "Zoho CRM export scope",
    url: "https://mobbin.com/flows/8b49bb83-cb99-42b0-8caa-cf579b7fad2a",
    pattern: "Formatted versus detailed scope is explicit; accepted is distinct from complete.",
    translation: "Project drafts, assessment reports and all-permitted-project summaries name their different scopes.",
  },
  {
    name: "Copilot Money",
    url: "https://mobbin.com/screens/297c00fb-2d25-42d0-a6c2-335c34111c3c",
    pattern: "A quiet portfolio overview, with detail revealed beside the selected investment.",
    translation: "Coarse project cards open a staged-disclosure deal room; investments become community solar sites.",
  },
  {
    name: "Monarch",
    url: "https://mobbin.com/screens/37b0330a-a415-4b48-a6ac-e6a5029a94e7",
    pattern: "A focused chart above the underlying holdings, with time controls kept close.",
    translation: "The solar comparison keeps scenario controls, the visual result and per-site breakdown together.",
  },
  {
    name: "Wrike",
    url: "https://mobbin.com/screens/181d88aa-08d1-480f-838e-f01fafdbf60b",
    pattern: "Named status columns and compact cards with assignees and dates.",
    translation: "Seven fixed development stages, explicit operator actions, and a separate investor interest state.",
  },
  {
    name: "Airbnb listing flow",
    url: "https://mobbin.com/flows/390e0140-7492-495a-8669-6cbdb8f73655",
    pattern: "One small question group at a time; visible progress and a persistent save-and-exit path.",
    translation: "Four-step rooftop or land intake, resumable local drafts, and a distinct consent review.",
  },
  {
    name: "Rivian",
    url: "https://mobbin.com/screens/4df8142b-b9da-44bf-8ad1-e3571ef960ed",
    pattern: "A legible circular total with units and the contributing categories nearby.",
    translation: "The solar halo shows estimated capacity and accepted-project share, never live energy telemetry.",
  },
  {
    name: "Octopus Energy",
    url: "https://mobbin.com/screens/c2ed3983-9a5c-4c5d-a782-ac0be81b4b5d",
    pattern: "High-contrast chart reading and compact period selection on a phone.",
    translation: "A dark operator direction, explicit kW/MWh units and accessible scenario-horizon controls.",
  },
] as const;

export const FEATURE_COVERAGE = [
  { feature: "Guided participation", views: "Welcome / role switch", scope: "Rooftop, land, funding and help choosing a path" },
  { feature: "Site intake", views: "Add a solar site", scope: "Contact, address, site type, ownership, area, usage, files, consent, drafts" },
  { feature: "Preliminary screening", views: "Site detail", scope: "Three outcomes, ranges, factors, flags, version and append-only overrides" },
  { feature: "Owner workspace", views: "My sites / action center", scope: "Shared status, next steps, information requests and resubmission" },
  { feature: "Operator workspace", views: "Submissions / project pipeline", scope: "Accept, reject, request information; assignment, notes, seven stages and visibility" },
  { feature: "Documents", views: "Documents / project detail", scope: "Metadata-only file selection, conditional tasks, explicit metadata review and version history; no live file bytes or signing" },
  { feature: "Investor experience", views: "Mandate / discover / interests", scope: "Seven investor types, mandate matching, interest and staged-access deal rooms" },
  { feature: "Solar comparison", views: "Solar potential", scope: "Ten example locations, five-site selection, illustrative return breakdown and allocation" },
  { feature: "Guidance assistant", views: "Ask Sunsum", scope: "Typed, project-scoped deterministic guidance; no microphone, model or hidden actions" },
  { feature: "Revisitable profiles", views: "My profile", scope: "Conditional individual/organization and intent fields, not sign-in or role grants" },
  { feature: "Editable generated drafts", views: "Drafts & reports", scope: "Correctable source-prefills, editable non-executing drafts, version and human review" },
  { feature: "Scoped output", views: "Reports & exports", scope: "Actual local HTML/CSV files; project assessment and portfolio summaries are separate" },
  { feature: "Owner notices", views: "Action center / project detail", scope: "Minimal non-binding interest notice, with separate publication status and private investor activity" },
  { feature: "Existing service status", views: "Workspace status", scope: "Source-reviewed backend candidates; no operational service configuration, authentication or silent fallback" },
  { feature: "AI-assisted underwriting", views: "Deal room / draft preview", scope: "Named stretch; deterministic recommendation, human edit/accept/reject, no credit decision" },
  { feature: "Later engagement stages", views: "Beyond the pilot", scope: "Read-only design storyboard for commitment, diligence, approval and funding" },
] as const;
