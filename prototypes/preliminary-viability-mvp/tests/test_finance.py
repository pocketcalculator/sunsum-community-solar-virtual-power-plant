import pytest

from app.schemas import FinancialInput
from app.services.finance import calculate_breakeven


def test_workbook_default_parity() -> None:
    result = calculate_breakeven(
        FinancialInput(project_cost=250000, annual_production_kwh=122582, ppa_rate=0.12)
    )
    assert result.net_project_amount == 175000
    assert result.itc_value == 75000
    assert result.year_1_revenue == pytest.approx(14709.84)
    assert result.schedule[1].revenue == pytest.approx(14855.835162)
    assert result.schedule[1].recurring_balance == pytest.approx(173113.3728)
    assert result.breakeven_year == 23


def test_html_itc_default_difference() -> None:
    result = calculate_breakeven(
        FinancialInput(
            project_cost=250000,
            annual_production_kwh=122582,
            ppa_rate=0.12,
            itc_rate_percent=40,
        )
    )
    assert result.net_project_amount == 150000
    assert result.breakeven_year == 17


def test_incentives_and_donations_reduce_amount() -> None:
    result = calculate_breakeven(
        FinancialInput(
            project_cost=100000,
            annual_production_kwh=10000,
            ppa_rate=0.1,
            incentives=5000,
            donations=10000,
        )
    )
    assert result.net_project_amount == 55000