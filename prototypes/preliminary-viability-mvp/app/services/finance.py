from app.schemas import FinancialInput, FinancialResult, FinancialYear


def calculate_breakeven(inputs: FinancialInput) -> FinancialResult:
    """Reproduce the supplied workbook recurrence without substituting standard DCF."""
    itc_rate = inputs.itc_rate_percent / 100
    production_loss = inputs.production_loss_percent / 100
    ppa_escalator = inputs.ppa_escalator_percent / 100
    hurdle_rate = inputs.hurdle_rate_percent / 100

    itc_value = inputs.project_cost * itc_rate
    net_amount = (
        inputs.project_cost * (1 - itc_rate) - inputs.incentives - inputs.donations
    )
    schedule: list[FinancialYear] = []
    previous_revenue = 0.0
    previous_status: float | None = None
    breakeven_year: int | None = None

    for year in range(1, inputs.analysis_period_years + 1):
        production = inputs.annual_production_kwh * (1 - production_loss) ** (year - 1)
        ppa_rate = inputs.ppa_rate * (1 + ppa_escalator) ** (year - 1)
        if year == 1:
            revenue = inputs.annual_production_kwh * inputs.ppa_rate
            balance = net_amount
        else:
            revenue = previous_revenue * (1 - production_loss) * (1 + ppa_escalator)
            balance = previous_status * (1 + hurdle_rate)  # type: ignore[operator]
        status = balance - revenue
        reached = status <= 0
        if reached and breakeven_year is None:
            breakeven_year = year
        schedule.append(
            FinancialYear(
                year=year,
                production_kwh=production,
                ppa_rate=ppa_rate,
                revenue=revenue,
                recurring_balance=balance,
                breakeven_status=status,
                reached_breakeven=reached,
            )
        )
        previous_revenue = revenue
        previous_status = status

    return FinancialResult(
        net_project_amount=net_amount,
        itc_value=itc_value,
        year_1_revenue=schedule[0].revenue,
        breakeven_year=breakeven_year,
        schedule=schedule,
    )