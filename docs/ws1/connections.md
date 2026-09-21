# SunSum connection index

Use this table to find the integration, not to infer that it is operating.
The source-backed WS2 reads are implemented against the pinned contract;
legitimate participant sign-in, deployed revision and actual authorized
records must still be confirmed. An unavailable connection is
**out of reach right now**, not evidence that its owner has not built it.

The canonical machine-readable registry is
[`src/domain/connections.ts`](../../src/domain/connections.ts); browser-safe
adapters in [`src/features/live-read`](../../src/features/live-read) re-export
it. `app/app` composes the connected entry, while
`static/main.tsx` composes only the synthetic demo. They share permitted
presentation primitives, not workflow state or authority.

## Read families

| Search ID | Owner | Existing read surface | Boundary / next handoff |
| --- | --- | --- | --- |
| `SUNSUM-CONNECTION:WS2-IDENTITY` | WS2/WS3 | `GET /api/me` | Legitimate existing session and user-role mapping; no demo-switch |
| `SUNSUM-CONNECTION:WS2-OWNER` | WS2 | `/api/me/sites`, `/api/me/outstanding` | Owner-scoped records, units, provenance and actual empty/error states |
| `SUNSUM-CONNECTION:WS2-OPERATOR` | WS2 | Submissions/list/detail, pipeline, project engagements | Operator authorization; no generic project GET; no review/stage writes |
| `SUNSUM-CONNECTION:WS2-INVESTOR` | WS2 | Investor profile, portfolio, engagements, funding needs, deal room | Existing onboarding/grants/engagement; lower-tier disclosure, no auto-interest |
| `SUNSUM-CONNECTION:WS2-DOCUMENTS-EXPORT` | WS2/WS3 | Composed metadata, original content, JSON/CSV export | Original bytes owner/operator only; separate export authority; no file bundle |
| `SUNSUM-CONNECTION:WS4-ASSESSMENT-READ` | WS4 with WS2 | Candidate assessment list/detail/audit/report | Out of reach until existing per-record auth, deployed schema and ID linkage are supplied |
| `SUNSUM-CONNECTION:WS2-TO-WS4-SCREENING` | WS2/WS4 | Stored results via authorized reads | New screening persists state and is not implemented in this frontend release |
| `SUNSUM-CONNECTION:MAPS-LOCATION` | WS4/GIS | Stored authorized locations/provenance | Approved source, licensing and role precision; no new geocoding or exposed key |
| `SUNSUM-CONNECTION:AI-IMAGE-EVIDENCE` | WS4 | Stored observations/warnings/human review | No upload, model generation, correction or paid processing |
| `SUNSUM-CONNECTION:FINANCE-GIS-EXTERNAL-DATA` | WS4/data owners | Stored results and approved projections | Assumptions/units/vintage/license; no private ingestion or new calculation |

Activity, notifications, utility status and guidance map only to actual
documented fields inside these families. There is no invented
notifications, utility or generic project endpoint. Unknown counts and
unavailable histories must not appear as empty successful reads.

## Source basis

The integration baseline is upstream
[`73695a052a63`](https://github.com/pocketcalculator/sunsum-community-solar-virtual-power-plant/commit/73695a052a6324434b36bebbdd0c834b455471b7),
with [OpenAPI](../api/openapi.yaml) and the actual WS2 handlers.
Pin schemas and operations rather than relying only on the differing
0.1.0/0.1.1 document labels.

The reader also accounts for these source-contract details:

- Project `target_date` can be a date-only input or the database mapper's ISO
  timestamp. Both retain their supplied precision and timezone; missing values
  do not acquire a midnight timestamp.
- WS2 selects the last engagement in its emitted creation/ID order for a
  project. A later update to an older row does not make it the current
  engagement. The deal-room GET still makes the authorization decision.
- The database requires one document parent. The export may fill `site_id`
  from the surrounding project context; this does not give a project-only
  document a site-content route. The reader preserves that metadata without
  an original-download capability.
- An unavailable pipeline keeps the observed submission count but an unknown
  project count. A successful empty pipeline can report a genuine zero.

The separately referenced WS4 candidate was
[`0c1c6d4bbbc1`](https://github.com/pocketcalculator/sunsum-community-solar-virtual-power-plant/commit/0c1c6d4bbbc15ec91cb8d0a59daa6e5094ff5301),
not a verified production service. Its broad assessment GETs cannot be
exposed through a shared privileged proxy. The old stateless `/assess`
proposal is superseded; the implemented WS2 screening client uses
`{SUNSUM_VIABILITY_URL}/assessments`, and the candidate base includes `/api`.
Neither POST is a read-only UI action.

## Status and annotations

| Token | Meaning |
| --- | --- |
| `LIVE_READ_ONLY` | Existing-service reader entry; service authorization still applies |
| `SYNTHETIC_DEMO_ONLY` | Fictional local data and deliberate demo commands |
| `OUT_OF_REACH_RIGHT_NOW` | An affected handoff, configuration or access is unavailable |
| `WORKFLOW_WRITES_NOT_IMPLEMENTED` | The frontend cannot execute business mutations in connected mode |
| `SUNSUM-DEPLOYMENT:<GATE-ID>` | Find the applicable existing-target/artifact-approval guard |

For a connection handoff, provide source/contract and deployed revisions,
accepted operations, safe configuration **names**, identity/record/disclosure
scope, freshness/pagination, export authority, and last authorized-read
evidence. Do not provide secret values in a ticket, README or client bundle.
Configuration presence is not a successful provider call.

See [the practical connection/deployment guide](connection-and-deployment-guide.md)
for setup order, commands, troubleshooting and package-only delivery.
