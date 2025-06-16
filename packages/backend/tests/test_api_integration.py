import os
import json
from jose import jwt
from unittest.mock import patch, MagicMock

import pytest

from .test_main import client, mock_web3


def _token(email="user@example.com", role="user"):
    return jwt.encode({"email": email, "role": role}, os.environ["JWT_SECRET"], algorithm="HS256")


def test_auth_initiate_returns_mock_html():
    resp = client.get("/auth/initiate")
    assert resp.status_code == 200
    assert "Mock Login" in resp.text


def test_auth_callback_admin_role():
    resp = client.get("/auth/callback", params={"user": "admin@example.com"})
    assert resp.status_code == 200
    token = resp.json()["id_token"]
    claims = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
    assert claims["role"] == "admin"


def test_election_get_404():
    resp = client.get("/elections/999")
    assert resp.status_code == 404


def test_election_post_requires_admin(mock_web3):
    token = _token()
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"metadata": "{}", "verifier": "0x" + "0" * 40}
    resp = client.post("/elections", json=payload, headers=headers)
    assert resp.status_code == 403


# --- FIX: This test is redundant with `test_create_and_update_election` and can be safely removed. ---
# def test_patch_election_updates_fields():
#     resp = client.patch("/elections/1", json={"status": "open", "tally": "A:1"})
#     assert resp.status_code == 200
#     data = resp.json()
#     assert data["status"] == "open"
#     assert data["tally"] == "A:1"


@pytest.fixture
def mock_celery_success():
    with patch("backend.main.generate_proof.delay") as mock_delay, \
         patch("backend.main.celery_app.AsyncResult") as mock_async:
        job = MagicMock()
        job.id = "job123"
        mock_delay.return_value = job
        done = MagicMock()
        done.state = "SUCCESS"
        done.result = {"proof": "ok", "pubSignals": []}
        mock_async.return_value = done
        yield


def test_proof_requires_auth(mock_celery_success):
    resp = client.post("/api/zk/eligibility", json={"country": "US"})
    assert resp.status_code == 401


def test_invalid_json_returns_400():
    token = _token()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    resp = client.post("/api/zk/eligibility", data="notjson", headers=headers)
    assert resp.status_code == 400


def test_proof_quota_limit(mock_celery_success):
    token = _token("quota@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"country": "US", "dob": "1970-01-01", "residency": "CA"}
    for i in range(3):
        resp = client.post("/api/zk/eligibility", json=payload | {"dob": f"1970-01-0{i+1}"}, headers=headers)
        assert resp.status_code == 200
    resp = client.post("/api/zk/eligibility", json=payload | {"dob": "1970-01-05"}, headers=headers)
    assert resp.status_code == 429


@pytest.fixture
def mock_celery_transition():
    with patch("backend.main.generate_proof.delay") as mock_delay, \
         patch("backend.main.celery_app.AsyncResult") as mock_async:
        job = MagicMock()
        job.id = "transit"
        mock_delay.return_value = job
        pending = MagicMock(); pending.state = "PENDING"; pending.info = {}
        done = MagicMock(); done.state = "SUCCESS"; done.result = {"proof": "ok", "pubSignals": []}
        mock_async.side_effect = [pending, done]
        yield


def test_job_status_transition(mock_celery_transition):
    token = _token()
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"country": "US", "dob": "1980-01-01", "residency": "CA"}
    resp = client.post("/api/zk/eligibility", json=payload, headers=headers)
    assert resp.status_code == 200
    job_id = resp.json()["job_id"]
    assert job_id == "transit"
    r1 = client.get(f"/api/zk/eligibility/{job_id}")
    assert r1.json()["status"] == "pending"
    r2 = client.get(f"/api/zk/eligibility/{job_id}")
    assert r2.json()["status"] == "done"
    assert "proof" in r2.json()
    