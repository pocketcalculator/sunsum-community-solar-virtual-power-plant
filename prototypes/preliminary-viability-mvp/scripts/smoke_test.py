from fastapi.testclient import TestClient

from app.main import app

with TestClient(app) as client:
    health = client.get("/api/health")
    home = client.get("/")
    assert health.status_code == 200 and health.json()["status"] == "ok"
    assert home.status_code == 200 and "SunSum Solar" in home.text
    print("Smoke test passed: UI and API are available.")
