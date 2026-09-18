from app.schemas import SiteSubmission, SolarEstimate


def estimate_solar(site: SiteSubmission) -> SolarEstimate:
    roof_capacity_kw = (site.usable_roof_area_sqft or 0) * 0.018
    land_capacity_kw = (site.usable_land_area_acres or 0) * 250
    area_based_capacity_kw = roof_capacity_kw + land_capacity_kw or None

    if site.proposed_capacity_kw is not None and site.proposed_capacity_kw > 0:
        capacity_kw = site.proposed_capacity_kw
        capacity_source = "user_provided"
    else:
        capacity_kw = area_based_capacity_kw
        capacity_source = "illustrative_area_estimate" if capacity_kw else "unavailable"

    if site.annual_production_kwh is not None and site.annual_production_kwh > 0:
        annual_production_kwh = site.annual_production_kwh
        production_source = "user_provided"
    elif capacity_kw:
        annual_production_kwh = capacity_kw * 1400
        production_source = "illustrative_specific_yield_estimate"
    else:
        annual_production_kwh = None
        production_source = "unavailable"

    assumptions = [
        "Rooftop capacity uses an illustrative 18 W/sq ft density.",
        "Ground capacity uses an illustrative 250 kW/acre density.",
        "Estimated production uses an illustrative 1,400 kWh/kW-year specific yield.",
    ]
    warnings = [
        "Illustrative desktop estimate only; replace assumptions with location-specific solar engineering data."
    ]
    return SolarEstimate(
        estimated_capacity_kw=capacity_kw,
        estimated_annual_production_kwh=annual_production_kwh,
        area_based_capacity_kw=area_based_capacity_kw,
        capacity_source=capacity_source,
        production_source=production_source,
        specific_yield_kwh_per_kw=1400 if production_source.endswith("estimate") else None,
        assumptions=assumptions,
        warnings=warnings,
    )
