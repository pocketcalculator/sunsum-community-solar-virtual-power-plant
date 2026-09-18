import pytest

from app.schemas import (
    ConstraintState,
    FinancialInput,
    ProviderResult,
    Recommendation,
    SiteSubmission,
)
from app.services.finance import calculate_breakeven
from app.services.screening import screen_site
from app.services.solar import estimate_solar


def providers(geocode_status: str = "live") -> dict[str, ProviderResult]:
    return {
        "geocoding": ProviderResult(
            provider="test",
            status=geocode_status,
            observations={"resolved": geocode_status == "live"},
        )
    }


def test_provider_failure_is_not_negative() -> None:
    result = screen_site(SiteSubmission(street_address="1 Main St"), providers("unavailable"))
    assert result["recommendation"] == Recommendation.INSUFFICIENT_INFORMATION
    assert "Unavailable provider evidence" in " ".join(result["missing_information"])


@pytest.mark.parametrize("area", [None, 0, 499, 500])
def test_missing_or_small_area_never_auto_rejects(area: float | None) -> None:
    site = SiteSubmission(
        latitude=33,
        longitude=-84,
        usable_roof_area_sqft=area,
        ownership_verified=True,
    )
    assert screen_site(site, providers())["recommendation"] != Recommendation.NOT_VIABLE


@pytest.mark.parametrize(
    ("shading", "risk_expected"), [(29.9, False), (30, True), (59.9, True), (60, True)]
)
def test_shading_boundaries_trigger_review(shading: float, risk_expected: bool) -> None:
    site = SiteSubmission(
        latitude=33,
        longitude=-84,
        usable_roof_area_sqft=1000,
        ownership_verified=True,
        estimated_shading_percent=shading,
    )
    risks = screen_site(site, providers())["constraints_and_risks"]
    assert bool(risks) is risk_expected


def test_only_human_confirmed_blocker_can_recommend_not_viable() -> None:
    site = SiteSubmission(
        latitude=33,
        longitude=-84,
        usable_land_area_acres=1,
        ownership_verified=False,
        evidence_status={"human_confirmed_no_legal_site_control": "known"},
    )
    result = screen_site(
        site,
        providers(),
        trusted_hard_blockers=["human_confirmed_no_legal_site_control"],
    )
    assert result["recommendation"] == Recommendation.NOT_VIABLE
    assert result["human_review_status"] == "awaiting_review"


def test_structured_constraint_status_controls_decision_not_free_text() -> None:
    site = SiteSubmission(
        latitude=33,
        longitude=-84,
        usable_land_area_acres=1,
        ownership_verified=True,
        estimated_shading_percent=10,
        candidate_mount_type="Ground mount",
        proposed_capacity_kw=100,
        annual_production_kwh=140000,
        interconnection_status="Utility denied all interconnection",
        permitting_concerns="Permit legally prohibited",
        zoning_concerns="Zoning prohibits solar",
        wetlands_or_flood_zone="Entire site is protected wetland",
        constraint_status={
            "interconnection": ConstraintState.BLOCKED,
            "permitting": ConstraintState.BLOCKED,
            "zoning": ConstraintState.BLOCKED,
            "environmental": ConstraintState.BLOCKED,
        },
        evidence_status={"human_confirmed_prohibition": "known"},
    )

    result = screen_site(site, providers())

    assert result["recommendation"] == Recommendation.POTENTIALLY_VIABLE
    assert len(result["constraints_and_risks"]) >= 4
    assert "blocked" in " ".join(result["constraints_and_risks"]).lower()


def test_solar_and_financial_results_are_part_of_recommendation_evidence() -> None:
    site = SiteSubmission(
        latitude=33,
        longitude=-84,
        usable_roof_area_sqft=10000,
        ownership_verified=True,
        estimated_shading_percent=10,
        candidate_mount_type="Rooftop",
        constraint_status={
            "interconnection": "clear",
            "permitting": "clear",
            "zoning": "clear",
            "environmental": "clear",
        },
    )
    solar = estimate_solar(site)
    financial = calculate_breakeven(
        FinancialInput(project_cost=100000, annual_production_kwh=252000, ppa_rate=0.12)
    )

    result = screen_site(
        site,
        providers(),
        solar_estimate=solar,
        financial_result=financial,
    )

    evidence = " ".join(result["supporting_evidence"])
    assert solar.estimated_capacity_kw == 180
    assert solar.estimated_annual_production_kwh == 252000
    assert "Solar capacity" in evidence
    assert "Annual solar production" in evidence
    assert result["solar_estimate"]["methodology"] == "illustrative_area_capacity_yield_v1"


def test_area_and_roof_life_thresholds_trigger_review_not_rejection() -> None:
    site = SiteSubmission(
        latitude=33,
        longitude=-84,
        usable_roof_area_sqft=499,
        remaining_roof_life_years=9,
        ownership_verified=True,
        estimated_shading_percent=10,
        candidate_mount_type="Rooftop",
        constraint_status={
            "interconnection": "clear",
            "permitting": "clear",
            "zoning": "clear",
            "environmental": "clear",
        },
    )
    result = screen_site(site, providers(), solar_estimate=estimate_solar(site))

    risks = " ".join(result["constraints_and_risks"]).lower()
    assert result["recommendation"] == Recommendation.POTENTIALLY_VIABLE
    assert "roof area" in risks
    assert "roof life" in risks