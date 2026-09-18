# Frontend Integration Handoff

## Deliverables

Share the private repository or `SunSum-Solar-MVP.zip`. The archive excludes private source and normalized records, local databases, uploads, virtual environments, caches, editor state, and `.env` secrets. Rebuild it with `python -m scripts.build_share_package`.

Authoritative references after starting the API:

- Application: `http://127.0.0.1:8000`
- OpenAPI UI: `http://127.0.0.1:8000/docs`
- OpenAPI JSON: `http://127.0.0.1:8000/openapi.json`
- Health check: `http://127.0.0.1:8000/api/health`

## Local Setup

Python 3.11 or newer is required.

```bash
unzip SunSum-Solar-MVP.zip
cd RemixHack2026
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
cp .env.example .env
uvicorn app.main:app --reload
```

Azure configuration is optional. Without it, the deterministic screening workflow runs locally and unavailable providers are reported explicitly.

## Integration Boundary

The backend is the source of truth for:

- recommendation labels and policy rules
- evidence completeness and explanation
- solar and financial calculations
- image-derived observations and rescreening
- review state, dispositions, and audit history

The frontend must not recreate recommendation rules or infer a recommendation from individual fields. Render the latest API response and preserve the distinction between:

- `original_recommendation`: immutable recommendation at submission
- `assessment.recommendation`: current recommendation after rescreening
- `final_human_decision`: operator disposition, separate from the recommendation

## Development Origin

The current backend does not enable cross-origin requests. Use one of these approaches:

1. Recommended: proxy `/api` from the frontend development server to `http://127.0.0.1:8000`.
2. Serve the frontend from FastAPI under the same origin.
3. Coordinate an explicit backend CORS allowlist before using a separate browser origin.

Do not use wildcard CORS with credentials in a deployed environment.

## Core Workflow

1. `POST /api/assessments` with structured site and optional financial evidence.
2. Render the returned `AssessmentDetail`.
3. Optionally `POST /api/assessments/{id}/images` as multipart form data.
4. Replace the displayed assessment with `revised_assessment` or refetch the detail.
5. Read `GET /api/assessments/{id}/audit` to show what changed.
6. Record `accept`, `reject`, or `request_information` through the review endpoint.
7. Refetch assessment detail and history after every mutation.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | API and optional-provider status |
| `GET` | `/api/assessments` | History summaries, newest first |
| `POST` | `/api/assessments` | Create and screen an assessment |
| `GET` | `/api/assessments/{id}` | Current full assessment |
| `POST` | `/api/assessments/{id}/images` | Upload image, analyze, and rescreen |
| `PATCH` | `/api/assessments/{id}/images/{image_id}/observations` | Confirm, correct, or reject an observation |
| `GET` | `/api/assessments/{id}/audit` | Ordered immutable event history |
| `POST` | `/api/assessments/{id}/reviews` | Record operator disposition |
| `POST` | `/api/assessments/{id}/feedback` | Capture quality and outcome feedback |
| `GET` | `/api/assessments/{id}/report` | Download printable HTML report |
| `GET` | `/api/exports/reviewed.csv` | Download reviewed records |
| `GET` | `/api/demo-scenarios` | List deterministic demo fixtures |
| `POST` | `/api/demo-scenarios/{scenario_id}/assessments` | Create a fresh demo assessment |

## Create Assessment

```http
POST /api/assessments
Content-Type: application/json
```

```json
{
  "idempotency_key": "web-550e8400-e29b-41d4-a716",
  "submitted_by": "Frontend user",
  "site": {
    "site_id": "SITE-1001",
    "street_address": "100 Solar Way",
    "city": "Memphis",
    "state": "TN",
    "zip_code": "38103",
    "candidate_mount_type": "Rooftop",
    "usable_roof_area_sqft": 1800,
    "estimated_shading_percent": 20,
    "ownership_verified": true,
    "site_control_verified": true,
    "constraint_status": {
      "interconnection": "unknown",
      "permitting": "clear",
      "zoning": "clear",
      "environmental": "clear"
    },
    "provenance": {
      "usable_roof_area_sqft": "user_submission"
    }
  },
  "financial": {
    "project_cost": 250000,
    "annual_production_kwh": 122582,
    "ppa_rate": 0.12,
    "itc_rate_percent": 30,
    "production_loss_percent": 0.5,
    "ppa_escalator_percent": 1.5,
    "hurdle_rate_percent": 8,
    "incentives": 0,
    "donations": 0,
    "analysis_period_years": 25
  }
}
```

Generate a new stable idempotency key for each user action. Reusing a key intentionally returns the previously created record.

Important enums:

```text
recommendation: viable | potentially_viable | not_viable | insufficient_information
constraint status: clear | concern | blocked | unknown | not_applicable
evidence status: known | unknown | unavailable | not_applicable
review status: awaiting_review | needs_information | human_determined
operator disposition: accept | reject | request_information
```

Latitude and longitude must be supplied together. Use JSON numbers for all numeric fields and JSON booleans for verification fields.

## Assessment Response

The essential `AssessmentDetail` shape is:

```json
{
  "id": "assessment-uuid",
  "site_id": "SITE-1001",
  "site": {},
  "provider_results": {},
  "assessment": {
    "recommendation": "potentially_viable",
    "explanation": "...",
    "supporting_evidence": [],
    "constraints_and_risks": [],
    "missing_information": [],
    "required_next_actions": [],
    "solar_estimate": {},
    "financial_screening": {},
    "source_provenance": {},
    "policy_version": "...",
    "evidence_completeness_score": 78,
    "confidence_description": "..."
  },
  "financial": {},
  "original_recommendation": "potentially_viable",
  "final_human_decision": null,
  "review_status": "awaiting_review",
  "created_at": "ISO-8601 timestamp",
  "updated_at": "ISO-8601 timestamp"
}
```

Render unknown, unavailable, and not configured states explicitly. Do not silently convert them to clear or successful states. Solar and financial values are preliminary estimates, not final designs or guarantees.

## History

`GET /api/assessments` returns:

```json
[
  {
    "id": "assessment-uuid",
    "site_id": "SITE-1001",
    "original_recommendation": "potentially_viable",
    "current_recommendation": "viable",
    "final_human_decision": "accept",
    "review_status": "human_determined",
    "created_at": "ISO-8601 timestamp",
    "updated_at": "ISO-8601 timestamp"
  }
]
```

Use `current_recommendation` in the list. Show the original value when explaining changes.

## Image Upload

```javascript
const body = new FormData();
body.append("file", selectedFile);

const response = await fetch(`/api/assessments/${assessmentId}/images`, {
  method: "POST",
  body
});
```

Accepted media types are JPEG, PNG, and WebP. The default limit is 10 MB. Do not manually set the multipart `Content-Type`; the browser must add the boundary.

The response contains:

- `image_id`
- `provider_status`
- `observations`
- `warnings`
- `revised_assessment`

Image observations are evidence, not final decisions. Clearly label their source and uncertainty.

## Rescreen Comparison

The latest `assessment_rescreened` audit event includes:

```json
{
  "previous_recommendation": "potentially_viable",
  "revised_recommendation": "viable",
  "image_observation_count": 3,
  "policy_version": "...",
  "changes": {
    "recommendation": {
      "previous": "potentially_viable",
      "current": "viable"
    },
    "evidence_completeness_score": {
      "previous": 78,
      "current": 89
    },
    "supporting_evidence": { "added": [], "removed": [] },
    "constraints_and_risks": { "added": [], "removed": [] },
    "missing_information": { "added": [], "removed": [] }
  }
}
```

A rescreen may produce no material change. Display that the evidence was re-evaluated instead of implying an update occurred.

## Human Review

```http
POST /api/assessments/{id}/reviews
Content-Type: application/json
```

```json
{
  "idempotency_key": "review-550e8400-e29b-41d4-a716",
  "reviewer_identity": "Qualified reviewer",
  "disposition": "request_information",
  "rationale": "A clearer roof image is required before project intake.",
  "reviewer_notes": "Optional internal notes"
}
```

`rationale` requires at least 10 characters. A request for information sets `review_status` to `needs_information`. New image evidence reopens it to `awaiting_review`. Accept or reject sets it to `human_determined`.

`recommendation_override` is optional and represents a correction by a qualified reviewer. It does not replace the preserved original recommendation.

## Error Handling

Expected responses include:

- `400`: malformed image content
- `404`: assessment, image, observation, or demo not found
- `413`: upload exceeds configured limit
- `415`: unsupported image media type
- `422`: request validation failure
- `5xx`: unexpected server/provider failure

For `422`, FastAPI returns a `detail` array. Display field-level messages where possible. Disable duplicate submission while a request is pending, but still use idempotency keys for retry safety.

Always provide loading, empty, validation, unavailable-provider, and retry states. Never calculate a fallback recommendation in the browser when the API fails.

## Frontend Acceptance Checklist

- Structured site and financial data can be submitted.
- Recommendation, explanation, evidence, risks, missing information, and next actions render from the API.
- Provider status and evidence provenance remain visible.
- Images upload as multipart data and the revised assessment replaces the current view.
- Original and current recommendations remain distinguishable.
- Latest rescreen changes show added and removed evidence.
- Assessment history supports current recommendation, review status, disposition, and timestamps.
- Accept, reject, and request-information actions persist with rationale.
- Report download works for the selected assessment.
- No recommendation logic is duplicated in frontend code.
- Mobile and desktop layouts do not overflow.
- API errors do not erase a previously loaded assessment.

## Validation

Backend verification commands:

```bash
python -m pytest tests -q
ruff check app scripts tests
python -m scripts.smoke_test
```

The included deterministic demos cover all four recommendation branches:

```text
viable-rooftop
potentially-viable-canopy
not-viable-prohibited
insufficient-evidence
```

Use these fixtures for integration and screenshot testing. They are simulated test data and must not be presented as real sites or used for model training.

## Team Message

> The SunSum decision-support API is ready for frontend integration. Please use the OpenAPI contract at `/docs` or `/openapi.json` and treat the backend response as the source of truth. The UI should collect structured site and financial evidence, create assessments, upload images, render current and original recommendations, display evidence changes after rescreening, and record Accept, Reject, or Request Information dispositions. Do not duplicate screening rules in frontend code. During local development, proxy `/api` to `http://127.0.0.1:8000` because CORS is not currently enabled. The repository includes deterministic demos for all four recommendation outcomes and a working reference UI.
