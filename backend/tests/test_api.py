import os

import bcrypt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

os.environ.setdefault("JWT_SECRET", "test-import-secret-at-least-32-bytes")

from app.database import build_engine, build_session_factory
from app.main import create_app
from app.main import _active_status
from app.models import Baseline, Device, User
from app.security import hash_password


@pytest.fixture
def client(tmp_path):
    app = create_app(secret_key="test-only-secret-key-at-least-32-bytes", database_url=f"sqlite:///{tmp_path / 'showcheck-test.db'}")
    with TestClient(app) as test_client:
        with app.state.session_factory() as db:
            db.add_all([
                User(name="Admin", email="admin@example.test", role="ADMIN", password_hash=hash_password("admin-password")),
                User(name="Viewer", email="viewer@example.test", role="VIEWER", password_hash=hash_password("viewer-password")),
            ])
            db.commit()
        yield test_client


def sign_in(client, email="admin@example.test", password="admin-password"):
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response


def test_authentication_permissions_and_modern_password_hash(client):
    assert client.get("/api/devices").status_code == 401
    login = sign_in(client)
    assert login.json()["role"] == "ADMIN"
    assert "httponly" in login.headers["set-cookie"].lower()
    assert client.get("/api/auth/me").json()["email"] == "admin@example.test"

    with client.app.state.session_factory() as db:
        stored = db.scalar(select(User).where(User.email == "admin@example.test")).password_hash
    assert stored.startswith("$argon2id$")

    client.post("/api/auth/logout")
    sign_in(client, "viewer@example.test", "viewer-password")
    assert client.get("/api/users").status_code == 403
    assert client.post("/api/devices", json={"name": "No", "type": "OTHER"}).status_code == 403


def test_legacy_bcrypt_hash_upgrades_to_argon2id_on_login(client):
    legacy_hash = bcrypt.hashpw(b"legacy-password", bcrypt.gensalt()).decode()
    with client.app.state.session_factory() as db:
        db.add(User(name="Legacy", email="legacy@example.test", role="OPERATOR", password_hash=legacy_hash))
        db.commit()

    response = sign_in(client, "legacy@example.test", "legacy-password")
    assert response.status_code == 200
    with client.app.state.session_factory() as db:
        stored = db.scalar(select(User).where(User.email == "legacy@example.test")).password_hash
    assert stored.startswith("$argon2id$")


def test_devices_baselines_checks_and_incident_lifecycle(client):
    sign_in(client)
    device = client.post("/api/devices", json={
        "name": "Main projector", "type": "PROJECTOR", "source": "DISCOVERED",
        "identifier": "PROJECTOR-1", "params": {"input": "HDMI 2"},
    }).json()
    assert device["ipAddress"] is None
    baseline = client.post("/api/baselines", json={"name": "Evening show", "eventDate": "2026-11-12"}).json()
    assert baseline["eventDate"].startswith("2026-11-12T")
    item = client.post(f"/api/baselines/{baseline['id']}/items", json={
        "label": "Main screen", "type": "PROJECTOR", "critical": True,
        "expectedParams": {"input": "HDMI 1"}, "deviceId": device["id"],
    })
    assert item.status_code == 200
    assert client.patch(f"/api/baselines/{baseline['id']}", json={"active": True}).status_code == 200

    dashboard = client.get("/api/dashboard").json()
    assert dashboard["counts"]["FAIL"] == 1
    check = client.post("/api/checks")
    assert check.status_code == 200
    assert check.json()["fail"] == 1
    assert check.json()["results"][0]["status"] == "FAIL"
    client.post("/api/checks")
    incidents = client.get("/api/incidents").json()
    failures = [incident for incident in incidents if incident["title"] == "Check failed: Main screen"]
    assert len(failures) == 1

    incident_id = failures[0]["id"]
    resolved = client.patch(f"/api/incidents/{incident_id}", json={"resolved": True})
    assert resolved.status_code == 200
    assert resolved.json()["resolved"] is True
    assert client.get(f"/api/checks/{check.json()['id']}").json()["results"][0]["item"]["label"] == "Main screen"

    assert client.delete(f"/api/devices/{device['id']}").json() == {"ok": True}
    baseline_after_delete = client.get("/api/baselines").json()[0]
    assert baseline_after_delete["items"][0]["deviceId"] is None


def test_users_devices_connections_and_baseline_mapping(client):
    sign_in(client)
    new_user = client.post("/api/users", json={
        "name": "Stage operator", "email": "operator@example.test", "password": "long-password", "role": "OPERATOR",
    })
    assert new_user.status_code == 200
    assert new_user.json()["email"] == "operator@example.test"
    assert client.post("/api/users", json={
        "name": "Duplicate", "email": "operator@example.test", "password": "long-password", "role": "OPERATOR",
    }).status_code == 409
    assert client.patch("/api/users/1", json={"role": "VIEWER"}).status_code == 400

    first = client.post("/api/devices", json={"name": "Projector", "type": "PROJECTOR", "identifier": "P-1"}).json()
    second = client.post("/api/devices", json={"name": "Mixer", "type": "MIXER", "identifier": "M-1"}).json()
    connection = client.post("/api/connections", json={"fromDeviceId": first["id"], "toDeviceId": second["id"], "label": "HDMI"})
    assert connection.status_code == 200
    assert client.post("/api/connections", json={"fromDeviceId": first["id"], "toDeviceId": second["id"]}).status_code == 409
    assert client.post("/api/connections", json={"fromDeviceId": first["id"], "toDeviceId": first["id"]}).status_code == 400
    assert client.delete(f"/api/connections/{connection.json()['id']}").json() == {"ok": True}


def test_discovery_ports_are_saved_and_used_by_local_scan(client, monkeypatch):
    sign_in(client)
    response = client.get("/api/discovery/ports")
    assert response.status_code == 200
    assert {row["key"]: row["port"] for row in response.json()["ports"]} == {"pjlink": 4352, "shure": 2202, "rtsp": 554}

    updated = client.patch("/api/discovery/ports", json={"ports": {"pjlink": 4353}})
    assert updated.status_code == 200
    assert {row["key"]: row["port"] for row in updated.json()["ports"]}["pjlink"] == 4353
    assert client.patch("/api/discovery/ports", json={"ports": {"unknown": 1234}}).status_code == 400
    assert client.patch("/api/discovery/ports", json={"ports": {"pjlink": 70000}}).status_code == 400

    calls = {}
    monkeypatch.setattr("app.main.scan_network", lambda ports: calls.update(ports=ports) or {"subnet": "192.168.1.0/24", "hosts": []})
    monkeypatch.setattr("app.main.scan_bluetooth", lambda: {"available": False, "error": "not installed", "hosts": []})
    result = client.post("/api/discovery/scan")
    assert result.status_code == 200
    assert calls["ports"]["pjlink"] == 4353
    assert result.json()["bluetooth"]["available"] is False


def test_demo_seed_keeps_existing_show_states(monkeypatch, tmp_path):
    database_url = f"sqlite:///{tmp_path / 'seed.db'}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    from app.seed import seed

    seed()
    engine = build_engine(database_url)
    with build_session_factory(engine)() as db:
        assert db.scalar(select(User.id).where(User.email == "admin@showcheck.test")) is not None
        assert db.scalar(select(Device.id).where(Device.identifier == "DMX-BAR-2")) is not None
        assert db.scalar(select(Baseline.id).where(Baseline.active.is_(True))) is not None
        status = _active_status(db)
        assert status["counts"]["WARNING"] == 1
        assert status["counts"]["FAIL"] == 1
        assert status["counts"]["UNKNOWN"] == 1
    engine.dispose()