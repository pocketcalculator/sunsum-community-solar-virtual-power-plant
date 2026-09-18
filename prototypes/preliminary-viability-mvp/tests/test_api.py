import os

os.environ["SUNSUM_DATABASE_URL"] = "sqlite:///./data/pytest.db"

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app


@pytest.fixture(autouse=True)
def reset_database():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


def payload(key: str = "assessment-test-001") -> dict:
    return {
        "idempotency_key": key,
        "submitted_by": "QA reviewer",
        "site": {
            "site_id": "TEST-1",
            "latitude": 34.68,
            "longitude": -90.38,
            "candidate_mount_type": "Rooftop",
            "usable_roof_area_sqft": 1800,
            "estimated_shading_percent": 20,
            "ownership_verified": True,
        },
        "financial": {
            "project_cost": 250000,
            "annual_production_kwh": 122582,
            "ppa_rate": 0.12,
        },
    }


def test_complete_review_feedback_audit_and_idempotency() -> None:
    with TestClient(app) as client:
        assert client.get("/").status_code == 200
        assert client.get("/api/health").json()["status"] == "ok"
        created = client.post("/api/assessments", json=payload())
        assert created.status_code == 201
        row = created.json()
        assessment_id = row["id"]
        original = row["original_recommendation"]
        assert client.post("/api/assessments", json=payload()).json()["id"] == assessment_id

        review = {
            "idempotency_key": "review-test-001",
            "reviewer_identity": "QA reviewer",
            "disposition": "accept",
            "rationale": "Qualified reviewer confirmed the missing site evidence.",
        }
        assert not client.post(f"/api/assessments/{assessment_id}/reviews", json=review).json()[
            "duplicate"
        ]
        assert client.post(f"/api/assessments/{assessment_id}/reviews", json=review).json()[
            "duplicate"
        ]
        current = client.get(f"/api/assessments/{assessment_id}").json()
        assert current["original_recommendation"] == original
        assert current["final_human_decision"] == "accept"
        summary = client.get("/api/assessments").json()[0]
        assert summary["original_recommendation"] == original
        assert summary["current_recommendation"] == current["assessment"]["recommendation"]
        assert summary["final_human_decision"] == "accept"

        report = client.get(f"/api/assessments/{assessment_id}/report")
        assert report.status_code == 200
        assert report.headers["content-disposition"].endswith('-report.html"')
        assert "TEST-1" in report.text
        assert "Preliminary decision support only" in report.text

        feedback = {
            "idempotency_key": "feedback-test-001",
            "reviewer_identity": "QA reviewer",
            "recommendation_correct": False,
            "corrected_label": "viable",
            "rationale": "Verified evidence changed the determination.",
        }
        assert not client.post(
            f"/api/assessments/{assessment_id}/feedback", json=feedback
        ).json()["duplicate"]
        assert client.post(f"/api/assessments/{assessment_id}/feedback", json=feedback).json()[
            "duplicate"
        ]
        events = client.get(f"/api/assessments/{assessment_id}/audit").json()
        assert [event["event_type"] for event in events] == [
            "assessment_created",
            "human_review_recorded",
            "feedback_recorded",
        ]
        assert "TEST-1" in client.get("/api/exports/reviewed.csv").text


def test_upload_security_and_input_validation() -> None:
    with TestClient(app) as client:
        assessment_id = client.post(
            "/api/assessments", json=payload("assessment-test-002")
        ).json()["id"]
        fake = client.post(
            f"/api/assessments/{assessment_id}/images",
            files={"file": ("fake.png", b"not a png", "image/png")},
        )
        assert fake.status_code == 400
        script = client.post(
            f"/api/assessments/{assessment_id}/images",
            files={"file": ("payload.html", b"<script>x</script>", "text/html")},
        )
        assert script.status_code == 415
        invalid = payload("assessment-test-003")
        invalid["site"]["estimated_shading_percent"] = 101
        assert client.post("/api/assessments", json=invalid).status_code == 422


@pytest.mark.parametrize(
    ("scenario_id", "expected"),
    [
        ("viable-rooftop", "viable"),
        ("potentially-viable-canopy", "potentially_viable"),
        ("not-viable-prohibited", "not_viable"),
        ("insufficient-evidence", "insufficient_information"),
    ],
)
def test_demo_scenarios_run_end_to_end(scenario_id: str, expected: str) -> None:
    with TestClient(app) as client:
        dataset = client.get("/api/demo-scenarios")
        assert dataset.status_code == 200
        assert dataset.json()["dataset"]["classification"] == "simulated_test_data"

        created = client.post(f"/api/demo-scenarios/{scenario_id}/assessments")
        assert created.status_code == 201
        row = created.json()
        assert row["original_recommendation"] == expected
        assert row["site"]["site_id"].startswith("DEMO-")
        assert all(
            provider["provenance"]["classification"] == "simulated"
            for provider in row["provider_results"].values()
        )
        events = client.get(f"/api/assessments/{row['id']}/audit").json()
        assert [event["event_type"] for event in events] == ["assessment_created"]


def test_demo_image_download_upload_analysis_and_audit() -> None:
    with TestClient(app) as client:
        created = client.post("/api/demo-scenarios/viable-rooftop/assessments")
        assert created.status_code == 201
        assessment_id = created.json()["id"]

        image = client.get("/api/demo-images/viable-rooftop")
        assert image.status_code == 200
        assert image.content.startswith(b"\x89PNG\r\n\x1a\n")

        analyzed = client.post(
            f"/api/assessments/{assessment_id}/images",
            files={"file": ("01_viable_rooftop.png", image.content, "image/png")},
        )
        assert analyzed.status_code == 200
        result = analyzed.json()
        assert result["provider_status"] == "simulated"
        assert result["revised_assessment"]["recommendation"] == "viable"
        assert result["revised_assessment"]["source_provenance"]["image_observations"]
        assert {item["key"] for item in result["observations"]} >= {
            "visible_surface",
            "potential_shading",
            "possible_mount_type",
        }
        assert all(item["source"] == "simulated_demo" for item in result["observations"])

        events = client.get(f"/api/assessments/{assessment_id}/audit").json()
        assert [event["event_type"] for event in events] == [
            "assessment_created",
            "image_uploaded_and_analyzed",
            "assessment_rescreened",
        ]
        assert events[-2]["payload"]["provider_status"] == "simulated"
        assert events[-1]["payload"]["revised_recommendation"] == "viable"
        changes = events[-1]["payload"]["changes"]
        assert changes["recommendation"] == {"previous": "viable", "current": "viable"}
        assert set(changes["supporting_evidence"]) == {"added", "removed"}


def test_human_image_correction_changes_effective_screening_evidence() -> None:
    with TestClient(app) as client:
        created = client.post("/api/demo-scenarios/viable-rooftop/assessments").json()
        assessment_id = created["id"]
        image = client.get("/api/demo-images/viable-rooftop")
        uploaded = client.post(
            f"/api/assessments/{assessment_id}/images",
            files={"file": ("01_viable_rooftop.png", image.content, "image/png")},
        ).json()

        corrected = client.patch(
            f"/api/assessments/{assessment_id}/images/{uploaded['image_id']}/observations",
            json={
                "reviewer_identity": "Solar reviewer",
                "observation_id": "potential_shading",
                "disposition": "corrected",
                "corrected_value": "high",
                "rationale": "Qualified reviewer identified heavy tree shading.",
            },
        )

        assert corrected.status_code == 200
        revised = corrected.json()["revised_assessment"]
        assert revised["recommendation"] == "potentially_viable"
        assert "high potential shading" in " ".join(
            revised["constraints_and_risks"]
        ).lower()
        assert any(
            item["source"] == "human_review"
            for item in revised["source_provenance"]["image_observations"]
        )


def test_requested_information_reopens_review_when_image_arrives() -> None:
    with TestClient(app) as client:
        created = client.post("/api/demo-scenarios/viable-rooftop/assessments").json()
        assessment_id = created["id"]
        review = client.post(
            f"/api/assessments/{assessment_id}/reviews",
            json={
                "idempotency_key": "request-info-review-001",
                "reviewer_identity": "Solar reviewer",
                "disposition": "request_information",
                "rationale": "Provide a clearer image before operator determination.",
            },
        )
        assert review.status_code == 200
        assert client.get(f"/api/assessments/{assessment_id}").json()[
            "review_status"
        ] == "needs_information"

        image = client.get("/api/demo-images/viable-rooftop")
        uploaded = client.post(
            f"/api/assessments/{assessment_id}/images",
            files={"file": ("01_viable_rooftop.png", image.content, "image/png")},
        )

        assert uploaded.status_code == 200
        current = client.get(f"/api/assessments/{assessment_id}").json()
        assert current["review_status"] == "awaiting_review"
        assert current["final_human_decision"] is None