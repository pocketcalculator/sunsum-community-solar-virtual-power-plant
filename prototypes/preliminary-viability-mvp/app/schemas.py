from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Recommendation(StrEnum):
    VIABLE = "viable"
    POTENTIALLY_VIABLE = "potentially_viable"
    NOT_VIABLE = "not_viable"
    INSUFFICIENT_INFORMATION = "insufficient_information"


class EvidenceState(StrEnum):
    KNOWN = "known"
    UNKNOWN = "unknown"
    UNAVAILABLE = "unavailable"
    NOT_APPLICABLE = "not_applicable"


class ConstraintState(StrEnum):
    CLEAR = "clear"
    CONCERN = "concern"
    BLOCKED = "blocked"
    UNKNOWN = "unknown"
    NOT_APPLICABLE = "not_applicable"


class OperatorDisposition(StrEnum):
    ACCEPT = "accept"
    REJECT = "reject"
    REQUEST_INFORMATION = "request_information"


class SiteSubmission(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    site_id: str | None = Field(default=None, max_length=100)
    street_address: str | None = Field(default=None, max_length=250)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, min_length=2, max_length=40)
    zip_code: str | None = Field(default=None, pattern=r"^\d{5}(?:-\d{4})?$")
    parcel_id: str | None = Field(default=None, max_length=100)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    parcel_polygon: dict[str, Any] | None = None
    property_description: str | None = Field(default=None, max_length=2000)
    candidate_mount_type: str | None = Field(default=None, max_length=80)
    usable_roof_area_sqft: float | None = Field(default=None, ge=0)
    usable_land_area_acres: float | None = Field(default=None, ge=0)
    building_footprint_sqft: float | None = Field(default=None, ge=0)
    roof_slope_degrees: float | None = Field(default=None, ge=0, le=90)
    roof_aspect_degrees: float | None = Field(default=None, ge=0, lt=360)
    roof_condition: str | None = Field(default=None, max_length=100)
    remaining_roof_life_years: float | None = Field(default=None, ge=0, le=100)
    tree_cover_percent: float | None = Field(default=None, ge=0, le=100)
    estimated_shading_percent: float | None = Field(default=None, ge=0, le=100)
    ownership_verified: bool | None = None
    site_control_verified: bool | None = None
    utility_territory: str | None = Field(default=None, max_length=150)
    feeder_or_substation: str | None = Field(default=None, max_length=250)
    interconnection_status: str | None = Field(default=None, max_length=250)
    zoning_concerns: str | None = Field(default=None, max_length=1000)
    permitting_concerns: str | None = Field(default=None, max_length=1000)
    hoa_concerns: str | None = Field(default=None, max_length=1000)
    environmental_constraints: str | None = Field(default=None, max_length=1000)
    wetlands_or_flood_zone: str | None = Field(default=None, max_length=500)
    proposed_capacity_kw: float | None = Field(default=None, ge=0, le=1_000_000)
    annual_production_kwh: float | None = Field(default=None, ge=0)
    project_cost: float | None = Field(default=None, ge=0)
    incentives: float | None = Field(default=None, ge=0)
    ppa_rate: float | None = Field(default=None, ge=0, le=10)
    reviewer_notes: str | None = Field(default=None, max_length=4000)
    evidence_status: dict[str, EvidenceState] = Field(default_factory=dict)
    constraint_status: dict[str, ConstraintState] = Field(default_factory=dict)
    provenance: dict[str, str] = Field(default_factory=dict)
    observed_at: datetime | None = None

    @model_validator(mode="after")
    def coordinates_are_a_pair(self) -> "SiteSubmission":
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("latitude and longitude must be provided together")
        return self


class FinancialInput(BaseModel):
    project_cost: float = Field(ge=0)
    annual_production_kwh: float = Field(ge=0)
    ppa_rate: float = Field(ge=0, le=10)
    itc_rate_percent: float = Field(default=30, ge=0, le=100)
    production_loss_percent: float = Field(default=0.5, ge=0, le=100)
    ppa_escalator_percent: float = Field(default=1.5, ge=-100, le=100)
    hurdle_rate_percent: float = Field(default=8, ge=-100, le=100)
    incentives: float = Field(default=0, ge=0)
    donations: float = Field(default=0, ge=0)
    analysis_period_years: int = Field(default=25, ge=1, le=50)


class FinancialYear(BaseModel):
    year: int
    production_kwh: float
    ppa_rate: float
    revenue: float
    recurring_balance: float
    breakeven_status: float
    reached_breakeven: bool


class FinancialResult(BaseModel):
    methodology: Literal["source_workbook_recurrence"] = "source_workbook_recurrence"
    net_project_amount: float
    itc_value: float
    year_1_revenue: float
    breakeven_year: int | None
    schedule: list[FinancialYear]


class SolarEstimate(BaseModel):
    methodology: Literal["illustrative_area_capacity_yield_v1"] = (
        "illustrative_area_capacity_yield_v1"
    )
    estimated_capacity_kw: float | None
    estimated_annual_production_kwh: float | None
    area_based_capacity_kw: float | None
    capacity_source: Literal["user_provided", "illustrative_area_estimate", "unavailable"]
    production_source: Literal[
        "user_provided", "illustrative_specific_yield_estimate", "unavailable"
    ]
    specific_yield_kwh_per_kw: float | None
    assumptions: list[str]
    warnings: list[str]


class ReviewInput(BaseModel):
    idempotency_key: str = Field(min_length=8, max_length=100)
    reviewer_identity: str = Field(min_length=2, max_length=150)
    disposition: OperatorDisposition
    recommendation_override: Recommendation | None = None
    rationale: str = Field(min_length=10, max_length=4000)
    reviewer_notes: str | None = Field(default=None, max_length=4000)
    feedback_category: str | None = Field(default=None, max_length=100)


class FeedbackInput(BaseModel):
    idempotency_key: str = Field(min_length=8, max_length=100)
    reviewer_identity: str = Field(min_length=2, max_length=150)
    recommendation_correct: bool | None = None
    additional_information_required: bool = False
    corrected_label: Recommendation | None = None
    corrected_observation: dict[str, Any] | None = None
    rationale: str = Field(min_length=5, max_length=4000)
    real_world_result: str | None = Field(default=None, max_length=500)
    project_outcome: Literal["proceeded", "rejected", "redesigned"] | None = None
    interconnection_result: str | None = Field(default=None, max_length=500)
    permitting_result: str | None = Field(default=None, max_length=500)
    constructed_capacity_kw: float | None = Field(default=None, ge=0)
    final_cost: float | None = Field(default=None, ge=0)
    final_production_kwh: float | None = Field(default=None, ge=0)


class ObservationCorrection(BaseModel):
    reviewer_identity: str = Field(min_length=2, max_length=150)
    observation_id: str = Field(min_length=1, max_length=100)
    disposition: Literal["confirmed", "corrected", "rejected"]
    corrected_value: Any | None = None
    rationale: str = Field(min_length=5, max_length=1000)


class AssessmentCreate(BaseModel):
    idempotency_key: str = Field(min_length=8, max_length=100)
    submitted_by: str = Field(default="Demo user", min_length=2, max_length=150)
    site: SiteSubmission
    financial: FinancialInput | None = None


class AssessmentSummary(BaseModel):
    id: str
    site_id: str
    original_recommendation: Recommendation
    current_recommendation: Recommendation
    final_human_decision: str | None
    review_status: str
    created_at: datetime
    updated_at: datetime


class AssessmentDetail(BaseModel):
    id: str
    site_id: str
    site: dict[str, Any]
    provider_results: dict[str, Any]
    assessment: dict[str, Any]
    financial: dict[str, Any] | None
    original_recommendation: Recommendation
    final_human_decision: str | None
    review_status: str
    created_at: datetime
    updated_at: datetime


class ImageObservation(BaseModel):
    key: str
    value: str | float | bool | None
    uncertainty: str
    source: Literal[
        "azure_openai", "manual_review_required", "simulated_demo", "human_review"
    ]


class ImageAnalysisResult(BaseModel):
    provider_status: str
    observations: list[ImageObservation]
    warnings: list[str]


class ProviderResult(BaseModel):
    provider: str
    status: Literal["live", "simulated", "unavailable", "not_configured"]
    observations: dict[str, Any] = Field(default_factory=dict)
    provenance: dict[str, Any] = Field(default_factory=dict)
    safe_message: str | None = None


class HealthResponse(BaseModel):
    status: str
    version: str
    environment: str
    providers: dict[str, str]


class ErrorResponse(BaseModel):
    detail: str