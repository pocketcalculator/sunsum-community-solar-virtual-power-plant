import csv
import hashlib
import html
import io
import json
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import __version__
from app.database import get_db
from app.models import Assessment, AuditEvent, Feedback, ImageRecord, Review
from app.providers.geocoding import get_geocoder
from app.providers.imagery import get_imagery_provider
from app.schemas import (
    AssessmentCreate,
    AssessmentDetail,
    AssessmentSummary,
    FeedbackInput,
    FinancialInput,
    FinancialResult,
    HealthResponse,
    ImageObservation,
    ObservationCorrection,
    ProviderResult,
    ReviewInput,
    SiteSubmission,
)
from app.services.demo_data import find_demo_scenario, load_demo_data
from app.services.finance import calculate_breakeven
from app.services.screening import screen_site
from app.services.solar import estimate_solar
from app.settings import Settings, get_settings

router = APIRouter(prefix="/api")
Db = Annotated[Session, Depends(get_db)]
DEMO_IMAGE_MANIFEST = Path("data/sample/site_images/manifest.json")


def detail(row: Assessment) -> AssessmentDetail:
    return AssessmentDetail(
        id=row.id,
        site_id=row.site_id,
        site=row.site_snapshot,
        provider_results=row.provider_snapshot,
        assessment=row.assessment_snapshot,
        financial=row.financial_snapshot,
        original_recommendation=row.original_recommendation,
        final_human_decision=row.final_human_decision,
        review_status=row.review_status,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def find_assessment(db: Session, assessment_id: str) -> Assessment:
    row = db.get(Assessment, assessment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return row


def add_audit(db: Session, row: Assessment, event_type: str, actor: str, payload: dict) -> None:
    db.add(AuditEvent(assessment_id=row.id, event_type=event_type, actor=actor, payload=payload))


def assessment_changes(previous: dict, revised: dict) -> dict:
    changes: dict = {
        "recommendation": {
            "previous": previous["recommendation"],
            "current": revised["recommendation"],
        },
        "evidence_completeness_score": {
            "previous": previous["evidence_completeness_score"],
            "current": revised["evidence_completeness_score"],
        },
    }
    for key in ("supporting_evidence", "constraints_and_risks", "missing_information"):
        before = set(previous.get(key, []))
        after = set(revised.get(key, []))
        changes[key] = {
            "added": sorted(after - before),
            "removed": sorted(before - after),
        }
    return changes


def effective_image_observations(image_rows: list[ImageRecord]) -> list[ImageObservation]:
    effective: list[ImageObservation] = []
    for image in image_rows:
        observations = {
            observation["key"]: ImageObservation.model_validate(observation)
            for observation in image.observations
        }
        for correction in image.corrections:
            key = correction["observation_id"]
            if correction["disposition"] == "rejected":
                observations.pop(key, None)
            elif key in observations:
                current = observations[key]
                observations[key] = ImageObservation(
                    key=key,
                    value=(
                        correction.get("corrected_value")
                        if correction["disposition"] == "corrected"
                        else current.value
                    ),
                    uncertainty="reviewed",
                    source="human_review",
                )
        effective.extend(observations.values())
    return effective


def rescreen_assessment(row: Assessment, db: Session, actor: str) -> dict:
    site = SiteSubmission.model_validate(row.site_snapshot)
    providers = {
        key: ProviderResult.model_validate(value)
        for key, value in row.provider_snapshot.items()
    }
    financial_result = (
        FinancialResult.model_validate(row.financial_snapshot)
        if row.financial_snapshot
        else None
    )
    image_rows = db.scalars(
        select(ImageRecord)
        .where(ImageRecord.assessment_id == row.id)
        .order_by(ImageRecord.created_at)
    ).all()
    image_observations = effective_image_observations(list(image_rows))
    previous = row.assessment_snapshot
    revised = screen_site(
        site=site,
        provider_results=providers,
        trusted_hard_blockers=previous.get("trusted_hard_blockers", []),
        solar_estimate=estimate_solar(site),
        financial_result=financial_result,
        image_observations=image_observations,
    )
    row.assessment_snapshot = revised
    if row.review_status == "needs_information":
        row.review_status = "awaiting_review"
    add_audit(
        db,
        row,
        "assessment_rescreened",
        actor,
        {
            "previous_recommendation": previous["recommendation"],
            "revised_recommendation": revised["recommendation"],
            "image_observation_count": len(image_observations),
            "policy_version": revised["policy_version"],
            "changes": assessment_changes(previous, revised),
        },
    )
    return revised


@router.get("/health", response_model=HealthResponse)
def health(settings: Annotated[Settings, Depends(get_settings)]) -> HealthResponse:
    return HealthResponse(
        status="ok",
        version=__version__,
        environment=settings.environment,
        providers={
            "geocoding": "configured"
            if settings.azure_maps_key or settings.use_azure_identity
            else "not_configured",
            "image_analysis": "configured"
            if settings.azure_openai_endpoint and settings.azure_openai_deployment
            else "not_configured",
            "parcel_gis": "not_configured",
            "flood_wetlands_zoning": "not_configured",
            "utility_hosting_capacity": "not_configured",
        },
    )


@router.post("/financial/breakeven", response_model=FinancialResult)
def breakeven(inputs: FinancialInput) -> FinancialResult:
    return calculate_breakeven(inputs)


def persist_assessment(
    payload: AssessmentCreate,
    providers: dict[str, ProviderResult],
    db: Session,
    trusted_hard_blockers: list[str] | None = None,
) -> AssessmentDetail:
    existing = db.scalar(
        select(Assessment).where(Assessment.create_idempotency_key == payload.idempotency_key)
    )
    if existing:
        return detail(existing)

    solar_estimate = estimate_solar(payload.site)
    financial_result = calculate_breakeven(payload.financial) if payload.financial else None
    screening = screen_site(
        payload.site,
        providers,
        trusted_hard_blockers=trusted_hard_blockers,
        solar_estimate=solar_estimate,
        financial_result=financial_result,
    )
    financial = financial_result.model_dump(mode="json") if financial_result else None
    row = Assessment(
        site_id=payload.site.site_id or f"SITE-{uuid.uuid4().hex[:8].upper()}",
        create_idempotency_key=payload.idempotency_key,
        submitted_by=payload.submitted_by,
        site_snapshot=payload.site.model_dump(mode="json"),
        provider_snapshot={key: value.model_dump(mode="json") for key, value in providers.items()},
        assessment_snapshot=screening,
        financial_snapshot=financial,
        original_recommendation=screening["recommendation"],
    )
    db.add(row)
    db.flush()
    add_audit(
        db,
        row,
        "assessment_created",
        payload.submitted_by,
        {
            "idempotency_key": payload.idempotency_key,
            "input_snapshot": row.site_snapshot,
            "provider_snapshot": row.provider_snapshot,
            "recommendation": row.original_recommendation,
            "policy_version": screening["policy_version"],
        },
    )
    db.commit()
    db.refresh(row)
    return detail(row)


@router.get("/demo-scenarios")
def list_demo_scenarios() -> dict:
    return load_demo_data()


@router.get("/demo-images")
def list_demo_images() -> dict:
    return json.loads(DEMO_IMAGE_MANIFEST.read_text())


@router.get("/demo-images/{scenario_id}", response_class=FileResponse)
def download_demo_image(scenario_id: str) -> FileResponse:
    manifest = list_demo_images()
    image = next(
        (item for item in manifest["images"] if item["id"] == scenario_id), None
    )
    if not image:
        raise HTTPException(status_code=404, detail="Demo image not found")
    path = DEMO_IMAGE_MANIFEST.parent / image["filename"]
    return FileResponse(path, media_type=image["media_type"], filename=image["filename"])


@router.post(
    "/demo-scenarios/{scenario_id}/assessments",
    response_model=AssessmentDetail,
    status_code=status.HTTP_201_CREATED,
)
def create_demo_assessment(scenario_id: str, db: Db) -> AssessmentDetail:
    scenario = find_demo_scenario(scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Demo scenario not found")
    payload = AssessmentCreate.model_validate(scenario["payload"])
    payload.idempotency_key = f"demo-{scenario_id}-{uuid.uuid4()}"
    providers = {
        key: ProviderResult.model_validate(value)
        for key, value in scenario["provider_results"].items()
    }
    return persist_assessment(
        payload,
        providers,
        db,
        trusted_hard_blockers=scenario.get("trusted_hard_blockers", []),
    )


@router.post("/assessments", response_model=AssessmentDetail, status_code=status.HTTP_201_CREATED)
def create_assessment(payload: AssessmentCreate, db: Db) -> AssessmentDetail:
    geocode = get_geocoder(get_settings()).geocode(payload.site)
    providers = {
        "geocoding": geocode,
        "parcel_gis": ProviderResult(provider="parcel_gis", status="not_configured"),
        "flood_wetlands_zoning": ProviderResult(
            provider="flood_wetlands_zoning", status="not_configured"
        ),
        "utility_hosting_capacity": ProviderResult(
            provider="utility_hosting_capacity", status="not_configured"
        ),
    }
    return persist_assessment(payload, providers, db)


@router.get("/assessments", response_model=list[AssessmentSummary])
def list_assessments(db: Db) -> list[AssessmentSummary]:
    rows = db.scalars(select(Assessment).order_by(Assessment.created_at.desc())).all()
    return [
        AssessmentSummary(
            id=row.id,
            site_id=row.site_id,
            original_recommendation=row.original_recommendation,
            current_recommendation=row.assessment_snapshot["recommendation"],
            final_human_decision=row.final_human_decision,
            review_status=row.review_status,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in rows
    ]


@router.get("/assessments/{assessment_id}", response_model=AssessmentDetail)
def get_assessment(assessment_id: str, db: Db) -> AssessmentDetail:
    return detail(find_assessment(db, assessment_id))


@router.post("/assessments/{assessment_id}/reviews")
def record_review(assessment_id: str, payload: ReviewInput, db: Db) -> dict:
    existing = db.scalar(select(Review).where(Review.idempotency_key == payload.idempotency_key))
    if existing:
        return {"id": existing.id, "disposition": existing.decision, "duplicate": True}
    row = find_assessment(db, assessment_id)
    review = Review(
        assessment_id=row.id,
        idempotency_key=payload.idempotency_key,
        reviewer_identity=payload.reviewer_identity,
        original_recommendation=row.original_recommendation,
        decision=payload.disposition,
        rationale=payload.rationale,
        reviewer_notes=payload.reviewer_notes,
        feedback_category=payload.feedback_category,
        policy_version=row.assessment_snapshot["policy_version"],
        input_snapshot=row.site_snapshot,
        provider_snapshot=row.provider_snapshot,
    )
    db.add(review)
    row.final_human_decision = (
        None if payload.disposition == "request_information" else str(payload.disposition)
    )
    row.review_status = (
        "needs_information"
        if payload.disposition == "request_information"
        else "human_determined"
    )
    add_audit(
        db,
        row,
        "human_review_recorded",
        payload.reviewer_identity,
        {
            "original_recommendation": row.original_recommendation,
            "operator_disposition": payload.disposition,
            "recommendation_override": payload.recommendation_override,
            "final_human_decision": row.final_human_decision,
            "rationale": payload.rationale,
            "policy_version": review.policy_version,
        },
    )
    db.commit()
    return {"id": review.id, "disposition": review.decision, "duplicate": False}


@router.post("/assessments/{assessment_id}/feedback")
def record_feedback(assessment_id: str, payload: FeedbackInput, db: Db) -> dict:
    existing = db.scalar(select(Feedback).where(Feedback.idempotency_key == payload.idempotency_key))
    if existing:
        return {"id": existing.id, "duplicate": True}
    row = find_assessment(db, assessment_id)
    feedback = Feedback(
        assessment_id=row.id,
        idempotency_key=payload.idempotency_key,
        reviewer_identity=payload.reviewer_identity,
        payload=payload.model_dump(mode="json"),
    )
    db.add(feedback)
    add_audit(db, row, "feedback_recorded", payload.reviewer_identity, feedback.payload)
    db.commit()
    return {"id": feedback.id, "duplicate": False}


ALLOWED_IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
SIGNATURES = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),
}


@router.post("/assessments/{assessment_id}/images")
async def upload_image(
    assessment_id: str,
    db: Db,
    file: Annotated[UploadFile, File(description="JPEG, PNG, or WebP site image")],
) -> dict:
    row = find_assessment(db, assessment_id)
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG, and WebP images are allowed")
    settings = get_settings()
    content = await file.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="Image exceeds the configured upload limit")
    if not content.startswith(SIGNATURES[file.content_type]):
        raise HTTPException(status_code=400, detail="Image content does not match its media type")
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    safe_stem = re.sub(r"[^A-Za-z0-9._-]", "_", Path(file.filename or "image").stem)[:80]
    stored_name = f"{uuid.uuid4().hex}-{safe_stem}{ALLOWED_IMAGE_TYPES[file.content_type]}"
    (settings.upload_dir / stored_name).write_bytes(content)
    result = get_imagery_provider(settings).analyze(content, file.content_type)
    image = ImageRecord(
        assessment_id=row.id,
        stored_filename=stored_name,
        original_filename=Path(file.filename or "image").name[:255],
        media_type=file.content_type,
        sha256=hashlib.sha256(content).hexdigest(),
        provider_status=result.provider_status,
        observations=[item.model_dump(mode="json") for item in result.observations],
    )
    db.add(image)
    db.flush()
    add_audit(
        db,
        row,
        "image_uploaded_and_analyzed",
        row.submitted_by,
        {"image_id": image.id, "provider_status": result.provider_status, "sha256": image.sha256},
    )
    revised_assessment = rescreen_assessment(row, db, row.submitted_by)
    db.commit()
    return {
        "image_id": image.id,
        **result.model_dump(mode="json"),
        "revised_assessment": revised_assessment,
    }


@router.patch("/assessments/{assessment_id}/images/{image_id}/observations")
def correct_observation(
    assessment_id: str, image_id: str, payload: ObservationCorrection, db: Db
) -> dict:
    row = find_assessment(db, assessment_id)
    image = db.get(ImageRecord, image_id)
    if not image or image.assessment_id != row.id:
        raise HTTPException(status_code=404, detail="Image not found")
    if payload.observation_id not in {
        observation["key"] for observation in image.observations
    }:
        raise HTTPException(status_code=404, detail="Image observation not found")
    correction = {**payload.model_dump(mode="json"), "timestamp": datetime.now(UTC).isoformat()}
    image.corrections = [*image.corrections, correction]
    add_audit(db, row, "image_observation_corrected", payload.reviewer_identity, correction)
    db.flush()
    revised_assessment = rescreen_assessment(row, db, payload.reviewer_identity)
    db.commit()
    return {
        "image_id": image.id,
        "correction": correction,
        "revised_assessment": revised_assessment,
    }


@router.get("/assessments/{assessment_id}/audit")
def audit_history(assessment_id: str, db: Db) -> list[dict]:
    find_assessment(db, assessment_id)
    events = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.assessment_id == assessment_id)
        .order_by(AuditEvent.created_at)
    ).all()
    return [
        {
            "id": event.id,
            "event_type": event.event_type,
            "actor": event.actor,
            "payload": event.payload,
            "created_at": event.created_at,
        }
        for event in events
    ]


def report_list(items: list[str], fallback: str) -> str:
    values = items or [fallback]
    return "".join(f"<li>{html.escape(str(item))}</li>" for item in values)


@router.get("/assessments/{assessment_id}/report", response_class=HTMLResponse)
def assessment_report(assessment_id: str, db: Db) -> HTMLResponse:
    row = find_assessment(db, assessment_id)
    result = row.assessment_snapshot
    solar = result.get("solar_estimate") or {}
    financial = row.financial_snapshot or {}
    site = row.site_snapshot
    location = ", ".join(
        str(value)
        for value in (site.get("street_address"), site.get("city"), site.get("state"))
        if value
    ) or "Location not provided"
    capacity = solar.get("estimated_capacity_kw")
    production = solar.get("estimated_annual_production_kwh")
    breakeven = financial.get("breakeven_year")
    generated_at = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
    document = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>{html.escape(row.site_id)} assessment report</title>
<style>body{{font:14px/1.5 Arial,sans-serif;color:#17211b;max-width:850px;margin:32px auto;padding:0 24px}}header{{border-bottom:3px solid #287052;margin-bottom:24px}}h1{{margin-bottom:4px}}h2{{font-size:16px;margin-top:24px}}.meta,.metrics{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}}.box{{border:1px solid #ccd5cf;padding:12px}}.label{{color:#5a675f;font-size:11px;text-transform:uppercase}}strong{{display:block;font-size:17px}}footer{{border-top:1px solid #ccd5cf;margin-top:28px;padding-top:12px;color:#5a675f}}@media print{{body{{margin:0}}}}</style></head><body>
<header><p class="label">SunSum Solar preliminary site review</p><h1>{html.escape(row.site_id)}</h1><p>{html.escape(location)}</p></header>
<div class="meta"><div class="box"><span class="label">Current recommendation</span><strong>{html.escape(result['recommendation'].replace('_', ' ').title())}</strong></div><div class="box"><span class="label">Review status</span><strong>{html.escape(row.review_status.replace('_', ' ').title())}</strong></div><div class="box"><span class="label">Evidence completeness</span><strong>{result['evidence_completeness_score']}%</strong></div></div>
<h2>Assessment</h2><p>{html.escape(result['explanation'])}</p>
<div class="metrics"><div class="box"><span class="label">Estimated capacity</span><strong>{f'{capacity:,.1f} kW' if capacity is not None else 'Unavailable'}</strong></div><div class="box"><span class="label">Estimated annual production</span><strong>{f'{production:,.0f} kWh' if production is not None else 'Unavailable'}</strong></div><div class="box"><span class="label">Illustrative breakeven</span><strong>{f'Year {breakeven}' if breakeven is not None else 'Beyond term / unavailable'}</strong></div></div>
<h2>Supporting evidence</h2><ul>{report_list(result.get('supporting_evidence', []), 'No supporting evidence recorded.')}</ul>
<h2>Constraints and risks</h2><ul>{report_list(result.get('constraints_and_risks', []), 'No confirmed constraints recorded.')}</ul>
<h2>Missing information</h2><ul>{report_list(result.get('missing_information', []), 'No missing information recorded.')}</ul>
<h2>Required next actions</h2><ol>{report_list(result.get('required_next_actions', []), 'Complete human technical review.')}</ol>
<footer>Generated {generated_at}. Policy {html.escape(result['policy_version'])}. Preliminary decision support only; qualified human review is required. Estimates are illustrative and are not engineering, legal, or financial advice.</footer>
</body></html>"""
    return HTMLResponse(
        document,
        headers={
            "Content-Disposition": f'attachment; filename="sunsum-{row.site_id}-report.html"'
        },
    )


@router.get("/exports/reviewed.csv")
def export_reviewed(db: Db) -> StreamingResponse:
    rows = db.scalars(
        select(Assessment).where(Assessment.review_status == "human_determined")
    ).all()
    output = io.StringIO()
    fields = [
        "assessment_id",
        "site_id",
        "original_recommendation",
        "final_human_decision",
        "policy_version",
        "site_json",
        "provider_json",
        "created_at",
    ]
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    for row in rows:
        writer.writerow(
            {
                "assessment_id": row.id,
                "site_id": row.site_id,
                "original_recommendation": row.original_recommendation,
                "final_human_decision": row.final_human_decision,
                "policy_version": row.assessment_snapshot["policy_version"],
                "site_json": json.dumps(row.site_snapshot, separators=(",", ":")),
                "provider_json": json.dumps(row.provider_snapshot, separators=(",", ":")),
                "created_at": row.created_at.isoformat(),
            }
        )
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sunsum-reviewed-records.csv"},
    )
