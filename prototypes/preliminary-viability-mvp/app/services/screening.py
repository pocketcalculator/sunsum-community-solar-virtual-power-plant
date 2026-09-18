import json
import math
import re
from pathlib import Path
from typing import Any

from app.schemas import (
    ConstraintState,
    FinancialResult,
    ImageObservation,
    ProviderResult,
    Recommendation,
    SiteSubmission,
    SolarEstimate,
)

POLICY_PATH = Path("config/screening_policy.v1.json")
HISTORY_PATH = Path("data/normalized/historical_sites.json")


def load_policy() -> dict[str, Any]:
    return json.loads(POLICY_PATH.read_text())


def _has_location(site: SiteSubmission, geocode: ProviderResult) -> bool:
    return bool(
        (site.latitude is not None and site.longitude is not None)
        or geocode.status == "live" and geocode.observations.get("resolved")
    )


def _has_surface(site: SiteSubmission) -> bool:
    return any(
        value is not None and value > 0
        for value in (site.usable_roof_area_sqft, site.usable_land_area_acres)
    )


def _tokens(value: str | None) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", (value or "").lower()))


def find_similar_sites(site: SiteSubmission, limit: int = 3) -> list[dict[str, Any]]:
    if not HISTORY_PATH.exists():
        return []
    candidates = json.loads(HISTORY_PATH.read_text())
    query = _tokens(" ".join(filter(None, [site.city, site.state, site.candidate_mount_type])))
    ranked = []
    for candidate in candidates:
        candidate_tokens = _tokens(
            " ".join(
                str(candidate.get(field) or "")
                for field in ("address", "mount_type", "historical_label")
            )
        )
        overlap = len(query & candidate_tokens) / math.sqrt(max(1, len(query) * len(candidate_tokens)))
        if site.proposed_capacity_kw and candidate.get("capacity_kw"):
            ratio = min(site.proposed_capacity_kw, candidate["capacity_kw"]) / max(
                site.proposed_capacity_kw, candidate["capacity_kw"]
            )
            overlap += ratio * 0.3
        ranked.append((overlap, candidate))
    return [item for score, item in sorted(ranked, key=lambda row: row[0], reverse=True)[:limit]]


def screen_site(
    site: SiteSubmission,
    provider_results: dict[str, ProviderResult],
    trusted_hard_blockers: list[str] | None = None,
    solar_estimate: SolarEstimate | None = None,
    financial_result: FinancialResult | None = None,
    image_observations: list[ImageObservation] | None = None,
) -> dict[str, Any]:
    policy = load_policy()
    thresholds = policy["thresholds"]
    geocode = provider_results["geocoding"]
    supporting: list[str] = []
    risks: list[str] = []
    missing: list[str] = []
    actions: list[str] = []

    location_resolved = _has_location(site, geocode)
    surface_known = _has_surface(site)
    control_known = site.ownership_verified is not None or site.site_control_verified is not None

    if location_resolved:
        supporting.append("Location is resolved to coordinates.")
    else:
        missing.append("A validated address or latitude/longitude is required.")
        actions.append("Correct the address or provide verified coordinates.")
    if surface_known:
        supporting.append("A candidate roof or land surface area was provided.")
        if (
            site.usable_roof_area_sqft is not None
            and 0 < site.usable_roof_area_sqft < thresholds["minimum_roof_area_sqft"]
        ):
            risks.append("Usable roof area is below the illustrative screening threshold.")
            actions.append("Review a larger, alternate, or combined candidate surface.")
        if (
            site.usable_land_area_acres is not None
            and 0 < site.usable_land_area_acres < thresholds["minimum_land_area_acres"]
        ):
            risks.append("Usable land area is below the illustrative screening threshold.")
            actions.append("Review a larger, alternate, or combined candidate surface.")
    else:
        missing.append("Usable roof or land area is unknown.")
        actions.append("Measure or estimate the candidate surface.")
    if not control_known:
        missing.append("Ownership or site control has not been verified.")
        actions.append("Verify ownership or obtain evidence of site control.")
    elif site.ownership_verified or site.site_control_verified:
        supporting.append("Ownership or site control is reported as verified.")
    else:
        risks.append("Site control is reported as not verified; human confirmation is required.")

    shading = site.estimated_shading_percent
    if shading is None:
        missing.append("Shading has not been assessed.")
    elif shading >= thresholds["shading_high_risk_percent"]:
        risks.append("High observable shading requires alternative-layout or mitigation review.")
    elif shading >= thresholds["shading_review_percent"]:
        risks.append("Moderate shading requires production and layout review.")
    else:
        supporting.append("Reported shading is below the illustrative review threshold.")

    if (
        site.remaining_roof_life_years is not None
        and site.remaining_roof_life_years < thresholds["minimum_roof_life_years"]
    ):
        risks.append("Remaining roof life is below the illustrative screening threshold.")
        actions.append("Coordinate roof replacement or structural review before solar design.")

    if solar_estimate and solar_estimate.estimated_capacity_kw:
        supporting.append(
            f"Solar capacity available to screening: {solar_estimate.estimated_capacity_kw:,.1f} kW "
            f"({solar_estimate.capacity_source.replace('_', ' ')})."
        )
        if (
            solar_estimate.area_based_capacity_kw
            and solar_estimate.estimated_capacity_kw
            > solar_estimate.area_based_capacity_kw * thresholds["maximum_area_capacity_ratio"]
        ):
            risks.append(
                "Proposed capacity exceeds the illustrative area-based capacity by more than 20%."
            )
            actions.append("Validate capacity against a qualified layout and equipment design.")
    else:
        missing.append("A proposed or area-derived capacity estimate is unavailable.")
        actions.append("Provide candidate area or a preliminary system capacity.")

    if solar_estimate and solar_estimate.estimated_annual_production_kwh:
        supporting.append(
            "Annual solar production available to screening: "
            f"{solar_estimate.estimated_annual_production_kwh:,.0f} kWh "
            f"({solar_estimate.production_source.replace('_', ' ')})."
        )
        if solar_estimate.estimated_capacity_kw:
            specific_yield = (
                solar_estimate.estimated_annual_production_kwh
                / solar_estimate.estimated_capacity_kw
            )
            if not (
                thresholds["minimum_specific_yield_kwh_per_kw"]
                <= specific_yield
                <= thresholds["maximum_specific_yield_kwh_per_kw"]
            ):
                risks.append(
                    "Production-to-capacity ratio is outside the illustrative screening range."
                )
                actions.append("Validate annual production with a location-specific solar model.")
    else:
        missing.append("Annual solar production is unavailable.")
        actions.append("Estimate production using location-specific irradiance and system losses.")

    if financial_result:
        if (
            financial_result.breakeven_year is not None
            and financial_result.breakeven_year
            <= thresholds["financial_review_breakeven_year"]
        ):
            supporting.append(
                f"Financial recurrence reaches breakeven in year {financial_result.breakeven_year}."
            )
        else:
            risks.append(
                "Financial recurrence does not reach breakeven within the illustrative review threshold."
            )
            actions.append("Review project cost, incentives, production, and PPA assumptions.")
    else:
        missing.append("Financial screening inputs are unavailable.")
        actions.append("Complete the preliminary financial calculation.")

    for observation in image_observations or []:
        value = str(observation.value or "").strip().lower()
        qualifier = f"{observation.uncertainty} uncertainty, {observation.source}"
        if observation.key == "visible_surface" and value not in {"", "indeterminate", "unknown"}:
            supporting.append(
                f"Image observation identifies {observation.value} ({qualifier}); human verification required."
            )
        elif observation.key == "potential_shading":
            if value in {"high", "heavy", "severe"}:
                risks.append(f"Image observation indicates high potential shading ({qualifier}).")
                actions.append("Validate shading with a production-grade solar access study.")
            elif value in {"moderate", "medium"}:
                risks.append(f"Image observation indicates moderate potential shading ({qualifier}).")
                actions.append("Validate shading and candidate layout in technical review.")
            elif value == "low":
                supporting.append(
                    f"Image observation indicates low potential shading ({qualifier}); human verification required."
                )
            else:
                missing.append("Uploaded imagery did not resolve potential shading.")
        elif observation.key == "image_quality" and any(
            marker in value for marker in ("low", "poor", "obscured", "unusable")
        ):
            missing.append("Uploaded image quality limits automated observation.")
            actions.append("Provide clearer site imagery or complete a manual image review.")

    constraint_labels = {
        "interconnection": "Interconnection",
        "permitting": "Permitting",
        "zoning": "Zoning",
        "environmental": "Environmental and flood/wetland",
    }
    for key, label in constraint_labels.items():
        evidence_state = site.constraint_status.get(key, ConstraintState.UNKNOWN)
        if evidence_state in {ConstraintState.CLEAR, ConstraintState.NOT_APPLICABLE}:
            supporting.append(f"{label} screening is reported as {evidence_state.value}.")
        elif evidence_state == ConstraintState.CONCERN:
            risks.append(f"{label} screening identified a concern requiring human review.")
            actions.append(f"Resolve the reported {label.lower()} concern.")
        elif evidence_state == ConstraintState.BLOCKED:
            risks.append(f"{label} screening is reported as blocked and requires human confirmation.")
            actions.append(f"Obtain qualified confirmation of the {label.lower()} blocker.")
        else:
            missing.append(f"{label} screening status is unknown.")
            actions.append(f"Complete {label.lower()} screening.")

    unavailable = [
        result.provider for result in provider_results.values() if result.status in {"unavailable", "not_configured"}
    ]
    if unavailable:
        missing.append("Unavailable provider evidence: " + ", ".join(unavailable) + ".")

    blocker_labels = {
        "human_confirmed_no_legal_site_control": "Human-confirmed absence of legal site control.",
        "human_confirmed_prohibition": "Human-confirmed legal or permitting prohibition.",
        "human_confirmed_no_usable_surface": "Human-confirmed absence of usable surface.",
    }
    approved_blockers = set(policy["approved_hard_blockers"])
    hard_blockers = [
        blocker_labels[key]
        for key in trusted_hard_blockers or []
        if key in approved_blockers and key in blocker_labels
    ]

    completeness_checks = [
        location_resolved,
        surface_known,
        control_known,
        shading is not None,
        site.constraint_status.get("interconnection")
        not in {None, ConstraintState.UNKNOWN},
        bool(site.candidate_mount_type),
        bool(solar_estimate and solar_estimate.estimated_capacity_kw),
        bool(solar_estimate and solar_estimate.estimated_annual_production_kwh),
        financial_result is not None,
    ]
    completeness = round(100 * sum(completeness_checks) / len(completeness_checks))

    if not location_resolved:
        recommendation = Recommendation.INSUFFICIENT_INFORMATION
    elif hard_blockers:
        recommendation = Recommendation.NOT_VIABLE
        risks.extend(hard_blockers)
    elif not surface_known or not control_known:
        recommendation = Recommendation.INSUFFICIENT_INFORMATION
    elif risks or missing:
        recommendation = Recommendation.POTENTIALLY_VIABLE
    else:
        recommendation = Recommendation.VIABLE

    mount = site.candidate_mount_type or (
        "rooftop" if site.usable_roof_area_sqft else "ground mount" if site.usable_land_area_acres else None
    )
    alternatives = [option for option in ("rooftop", "canopy", "ground mount") if option != mount]
    confidence = (
        "High evidence completeness; this is not a probability of project success."
        if completeness >= 80
        else "Moderate evidence completeness; important questions remain."
        if completeness >= 50
        else "Low evidence completeness; the recommendation is primarily a request for evidence."
    )
    return {
        "recommendation": recommendation.value,
        "explanation": " ".join(supporting + risks) or "Available evidence is too limited to screen the site.",
        "supporting_evidence": supporting,
        "constraints_and_risks": risks,
        "missing_information": missing,
        "recommended_mount_type": mount,
        "alternative_mount_options": alternatives,
        "required_next_actions": list(dict.fromkeys(actions + ["Complete human technical review."])),
        "similar_historical_sites": find_similar_sites(site),
        "source_provenance": {
            "user_fields": site.provenance,
            "providers": {
                key: result.model_dump(mode="json") for key, result in provider_results.items()
            },
            "image_observations": [
                observation.model_dump(mode="json") for observation in image_observations or []
            ],
        },
        "solar_estimate": solar_estimate.model_dump(mode="json") if solar_estimate else None,
        "financial_screening": {
            "methodology": financial_result.methodology,
            "breakeven_year": financial_result.breakeven_year,
        }
        if financial_result
        else None,
        "trusted_hard_blockers": list(trusted_hard_blockers or []),
        "policy_version": policy["version"],
        "policy_status": policy["status"],
        "evidence_completeness_score": completeness,
        "confidence_description": confidence,
        "human_review_status": "awaiting_review",
        "final_human_decision": None,
    }