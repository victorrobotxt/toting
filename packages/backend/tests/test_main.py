import os
import sys
import pytest
from fastapi.testclient import TestClient
from jose import jwt

# set env vars before importing app
os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["USE_REAL_OAUTH"] = "false"
os.environ["CELERY_TASK_ALWAYS_EAGER"] = "1"
os.environ["CELERY_BROKER"] = "memory://"
os.environ["CELERY_BACKEND"] = "cache+memory://"
os.environ["PROOF_QUOTA"] = "3"

# allow "packages" imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend import main
from backend.main import app, get_db
from backend.db import Base, engine, SessionLocal, Election

# create tables
Base.metadata.create_all(bind=engine)

# override get_db dependency to use same session

def override_get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    db.add(Election(id=1, meta="0x" + "a" * 64, start=0, end=10))
    db.commit()
    db.close()


@pytest.fixture(autouse=True)
def patch_chain(monkeypatch):
    monkeypatch.setattr(main, "create_election_onchain", lambda meta: 100)


def test_mock_login_and_list():
    # initiate login shows mock form
    r = client.get("/auth/initiate")
    assert r.status_code == 200
    assert "Mock Login" in r.text

    # callback returns fake JWT
    r = client.get("/auth/callback", params={"user": "alice@example.com"})
    assert r.status_code == 200
    data = r.json()
    token = data["id_token"]
    assert data["eligibility"] is True

    claims = jwt.decode(token, "test-secret", algorithms=["HS256"])
    assert claims["email"] == "alice@example.com"

    # list elections
    r = client.get("/elections")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["meta"].startswith("0x")

    # get single election
    r = client.get("/elections/1")
    assert r.status_code == 200
    assert r.json()["id"] == 1


def test_create_and_update_election():
    payload = {"meta_hash": "0x" + "b" * 64}
    r = client.post("/elections", json=payload)
    assert r.status_code == 201
    data = r.json()
    assert data["meta"] == payload["meta_hash"]
    assert data["start"] == 100
    assert data["end"] == 7300
    election_id = data["id"]

    r = client.patch(f"/elections/{election_id}", json={"status": "open"})
    assert r.status_code == 200
    assert r.json()["status"] == "open"

    r = client.patch(f"/elections/{election_id}", json={"tally": "A:1,B:0"})
    assert r.status_code == 200
    assert r.json()["tally"] == "A:1,B:0"


def test_manifest_check():
    import subprocess
    result = subprocess.run(["python", "scripts/check_manifest.py"], capture_output=True)
    assert result.returncode == 0


def test_proof_cache_and_quota(monkeypatch):
    token = jwt.encode({"email": "bob@example.com"}, "test-secret", algorithm="HS256")
    headers = {"Authorization": f"Bearer {token}"}

    payload = {"country": "US", "dob": "1990-01-01", "residency": "CA"}

    r = client.post("/api/zk/eligibility", json=payload, headers=headers)
    assert r.status_code == 200
    jid = r.json()["job_id"]
    r = client.get(f"/api/zk/eligibility/{jid}")
    assert r.status_code == 200
    assert r.json()["status"] == "done"

    # cache hit on identical request
    r = client.post("/api/zk/eligibility", json=payload, headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "done"

    # quota enforcement
    r = client.post("/api/zk/eligibility", json=payload | {"dob": "1990-01-02"}, headers=headers)
    assert r.status_code == 200
    r = client.post("/api/zk/eligibility", json=payload | {"dob": "1990-01-03"}, headers=headers)
    assert r.status_code == 429

    # invalid input
    bad = {"country": "USA", "dob": "19900101", "residency": "CA"}
    r = client.post("/api/zk/eligibility", json=bad, headers=headers)
    assert r.status_code == 422


def test_voice_and_batch_tally_and_ws():
    token = jwt.encode({"email": "carol@example.com"}, "test-secret", algorithm="HS256")
    headers = {"Authorization": f"Bearer {token}"}

    voice_payload = {"credits": [1, 4, 9], "nonce": 1}
    r = client.post("/api/zk/voice", json=voice_payload, headers=headers)
    assert r.status_code == 200
    jid = r.json()["job_id"]
    with client.websocket_connect(f"/ws/proofs/{jid}") as ws:
        msg = ws.receive_json()
        assert msg["state"] in {"queued", "running", "done"}
        if msg["state"] != "done":
            msg = ws.receive_json()
        assert msg["state"] == "done"
        assert msg["progress"] == 100

    r = client.get(f"/api/zk/voice/{jid}")
    assert r.status_code == 200
    assert r.json()["status"] == "done"

    tally_payload = {"election_id": 1}
    r = client.post("/api/zk/batch_tally", json=tally_payload, headers=headers)
    assert r.status_code == 200
    jid = r.json()["job_id"]
    r = client.get(f"/api/zk/batch_tally/{jid}")
    assert r.status_code == 200
    assert r.json()["status"] == "done"
