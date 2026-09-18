import json
from pathlib import Path
from typing import Any

from app.schemas import AssessmentCreate, ProviderResult

DEMO_DATA_PATH = Path("data/sample/demo_sites.json")


def load_demo_data() -> dict[str, Any]:
    data = json.loads(DEMO_DATA_PATH.read_text())
    for scenario in data["scenarios"]:
        AssessmentCreate.model_validate(scenario["payload"])
        scenario["provider_results"] = {
            key: ProviderResult.model_validate(value).model_dump(mode="json")
            for key, value in scenario["provider_results"].items()
        }
    return data


def find_demo_scenario(scenario_id: str) -> dict[str, Any] | None:
    return next(
        (
            scenario
            for scenario in load_demo_data()["scenarios"]
            if scenario["id"] == scenario_id
        ),
        None,
    )