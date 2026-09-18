# SunSum Solar MVP

A runnable local solar-site screening application for preliminary, explainable assessment and mandatory human review. It combines validated site input, structured constraint states, optional geocoding and image observations, an illustrative deterministic solar estimate, versioned screening rules, deterministic breakeven calculations, reviewer feedback, and append-only audit history.

**This application does not make final engineering, financial, permitting, legal, ownership, or interconnection decisions.**

## What works

- Responsive browser submission, assessment, finance, review, searchable history, and provider-status workflow
- Before/after rescreen comparison and downloadable per-assessment HTML report
- FastAPI/OpenAPI API, SQLite persistence, idempotent create/review/feedback actions
- Conservative four-category screening with visible missing information
- Deterministic area-to-capacity and capacity-to-production estimates with visible assumptions
- Deterministic financial recurrence and annual schedule
- Optional Azure Maps geocoding and Azure OpenAI image observations
- Image type, signature, size, and filename controls; audited image-driven rescreening and reviewer corrections
- Explicit operator dispositions: accept, reject, or request information
- Reviewed-record CSV export and append-only audit events
- Docker, VS Code, CI, tests, and Azure Container Apps Bicep starter

Local mode labels unconfigured providers as unavailable. It does not simulate successful cloud evidence.

## Quick start

Python 3.11-3.13 is recommended. Python 3.14 was used successfully in this workspace.

### macOS / Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
cp .env.example .env
uvicorn app.main:app --reload
```

### Windows PowerShell

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

Open <http://127.0.0.1:8000>. OpenAPI is at <http://127.0.0.1:8000/docs>.

In VS Code, open the repository, accept recommended extensions, select `.venv` as interpreter, then run **Tasks: Run Task > SunSum: Run** or launch **SunSum: FastAPI**.

## Test and quality commands

```bash
python -m pytest tests -q
ruff check app scripts tests
python -m scripts.smoke_test
python -m pytest tests --cov=app --cov-report=term-missing
python -m scripts.build_share_package
```

The implemented suite covers source-formula parity, solar estimates, ITC reconciliation, thresholds, structured constraint evidence, missing data, provider failure, persistence, APIs, operator dispositions, image rescreening, human corrections, original-recommendation preservation, audit history, idempotency, export, upload validation, and unsafe input ranges.

`build_share_package` creates the frontend handoff from an allowlist. It intentionally excludes raw and normalized historical records, local databases, uploads, secrets, caches, and editor state.

## Docker

```bash
docker build -t sunsum-solar:local .
docker run --rm -p 8000:8000 --env-file .env -v "$PWD/data:/app/data" sunsum-solar:local
```

PowerShell volume syntax:

```powershell
docker run --rm -p 8000:8000 --env-file .env -v "${PWD}/data:/app/data" sunsum-solar:local
```

## Configuration

All settings use the `SUNSUM_` prefix; see `.env.example`. Without credentials the app remains fully usable for manual inputs, local uploads, screening, finance, review, feedback, export, and audit.

Azure Maps uses `GET https://atlas.microsoft.com/geocode` with REST API `2026-01-01`. Use `SUNSUM_AZURE_MAPS_KEY` locally, or managed identity plus `SUNSUM_AZURE_MAPS_CLIENT_ID` in Azure. Azure OpenAI requires endpoint and deployment; API key is optional when managed identity is available. Multimodal observations are constrained to visible characteristics and remain untrusted until reviewed. An upload triggers a revised screening snapshot and audit event; the initial recommendation remains preserved separately.

## API examples

```bash
curl http://127.0.0.1:8000/api/health
curl -X POST http://127.0.0.1:8000/api/financial/breakeven \
  -H 'Content-Type: application/json' \
  -d '{"project_cost":250000,"annual_production_kwh":122582,"ppa_rate":0.12}'
```

The full API includes health/configuration, create/list/get assessment, image upload/analysis, observation correction, financial calculation, human review, feedback, reviewed export, audit history, and `GET /api/assessments/{assessment_id}/report` for a printable HTML report. OpenAPI contains authoritative schemas.

## Engineering references

See [docs/ENGINEERING.md](docs/ENGINEERING.md) for architecture, data dictionary, policy, security, Responsible AI, future evaluation, and limitations. See [infra/README.md](infra/README.md) for the no-charge Azure pilot path.

Frontend teams should start with [docs/FRONTEND_HANDOFF.md](docs/FRONTEND_HANDOFF.md) for local setup, API contracts, payload examples, state semantics, proxy guidance, error handling, and integration acceptance criteria.

## Five-minute demo

The **Simulated test data** panel references `data/sample/demo_sites.json` and uploadable PNGs in `data/sample/site_images/`. It includes fictional examples for viable, potentially viable, human-confirmed not viable, and insufficient-information outcomes. Every synthetic provider result and field provenance is marked simulated; never use these records for real decisions or model training. See [docs/DEMO_TESTING.md](docs/DEMO_TESTING.md) for expected results and a manual/API walkthrough.

1. Select **Viable rooftop** in the simulated test data panel. The app selects its matching synthetic PNG, persists the recommendation, uploads the image through the normal image endpoint, and renders evidence, a before/after rescreen comparison, simulated provider and image observations, the financial schedule, and audit events.
2. Run the other three scenarios to compare recommendation branches and missing evidence behavior.
3. Record an operator disposition with rationale: accept, reject, or request more information. Show that the original preliminary recommendation remains preserved.
4. Search or filter the assessment history, download the selected assessment report, and show the audit history.
5. Submit a manual site or upload an image to contrast simulated evidence with locally available providers.

The same dataset is available through `GET /api/demo-scenarios`. Create a fresh persisted run with `POST /api/demo-scenarios/{scenario_id}/assessments`; valid IDs are `viable-rooftop`, `potentially-viable-canopy`, `not-viable-prohibited`, and `insufficient-evidence`.

## Acceptance checklist

- [x] App starts and UI loads
- [x] Submission persists and produces preliminary screening
- [x] Missing/provider-unavailable evidence stays visible and cannot auto-reject
- [x] Operator can accept, reject, or request information while the original recommendation is retained
- [x] New and corrected image evidence triggers audited rescreening
- [x] Structured constraint states control screening; narrative text is context only
- [x] Feedback and ordered audit events persist
- [x] Financial calculation matches supplied recurrence
- [x] Duplicate create/review/feedback actions are idempotent
- [x] Upload security and input validation are tested
- [ ] Live Azure providers tested with approved credentials
- [ ] Solar SME approves labels, blockers, thresholds, and financial assumptions
- [ ] Entra RBAC, private networking/storage, retention, monitoring, and threat model completed

## Roadmap

First validate labels and rules with the solar/GIS team. Then choose a pilot territory and licensed parcel/environment/utility datasets; add Entra roles and private Blob/PostgreSQL; complete malware scanning, observability and threat modeling; run geographic/mount-type evaluation with a locked holdout; and only then consider a calibrated model. Do not train on raw worksheet placement or leaked reviewer comments.

## Troubleshooting

- `ModuleNotFoundError: app`: run commands from the repository root after `pip install -e '.[dev]'`.
- Address remains unresolved: supply coordinates or configure Azure Maps; failure is intentionally not rejection.
- Image says not configured: set Azure OpenAI endpoint/deployment or review manually.
- SQLite locked/readonly: stop duplicate dev servers and verify write access to `data/`.
- Port 8000 busy: use `uvicorn app.main:app --reload --port 8001`.
- Azure errors expose no detail by design; inspect protected platform telemetry, never return secrets to users.
