import os
import sys
import pytest
from fastapi.testclient import TestClient
from jose import jwt

# set env vars before importing app
os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["USE_REAL_OAUTH"] = "false"

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

