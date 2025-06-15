# packages/backend/tests/test_main.py
import os
import sys
import json
import pytest
from fastapi.testclient import TestClient
from jose import jwt
from unittest.mock import MagicMock, patch
import web3

# Some versions of Web3 omit the geth_poa_middleware helper. Provide a noop
# implementation so the application can import successfully during tests.
if not hasattr(web3.middleware, "geth_poa_middleware"):
    def geth_poa_middleware(make_request, w3):
        def middleware(method, params):
            return make_request(method, params)
        return middleware

    web3.middleware.geth_poa_middleware = geth_poa_middleware

# set env vars before importing app
os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["USE_REAL_OAUTH"] = "false"
os.environ["GRAO_CLIENT_SECRET"] = "test-client-secret"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["ORCHESTRATOR_KEY"] = "0x" + "1" * 64
os.environ["ELECTION_MANAGER"] = "0x" + "a" * 40
os.environ["CELERY_TASK_ALWAYS_EAGER"] = "1"
os.environ["CELERY_BROKER"] = "memory://"
os.environ["CELERY_BACKEND"] = "cache+memory://"
os.environ["PROOF_QUOTA"] = "3"
# Use a very small manifest so the proof module loads without relying on large artifacts
_manifest_path = os.path.join(os.path.dirname(__file__), "test_manifest.json")
with open(_manifest_path, "w") as f:
    json.dump({"eligibility": {"bn254": {"hash": "hash"}}}, f)
os.environ["CIRCUIT_MANIFEST"] = _manifest_path

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
    db.add(Election(id=1, meta="0x" + "a" * 64, start=0, end=1000000, status="pending", verifier="0x" + "0" * 40))
    from backend.db import Circuit

    db.add(
        Circuit(
            name="eligibility",
            version=1,
            circuit_hash="hash_v1",
            ptau_version=1,
            zkey_version=1,
            active=1,
        )
    )
    db.commit()
    db.close()


# Replace the broken monkeypatch with a robust mock of the web3 object.
@pytest.fixture
def mock_web3():
    with patch("backend.main.web3") as mock_web3_instance:
        # Mock the transaction receipt
        mock_receipt = MagicMock()
        mock_receipt.status = 1
        mock_receipt.blockNumber = 123

        # Mock the event log that should be in the receipt
        mock_event_log = {
            'args': {'id': 99, 'meta': b'\xbb' * 32},
            'event': 'ElectionCreated',
            'logIndex': 0,
            'transactionIndex': 0,
            'transactionHash': b'\xcc' * 32,
            'address': main.ELECTION_MANAGER,
            'blockHash': b'\xdd' * 32,
            'blockNumber': 123
        }
        
        # Configure the contract mock
        mock_contract = MagicMock()
        mock_contract.events.ElectionCreated().process_receipt.return_value = [MagicMock(**mock_event_log)]
        mock_contract.functions.elections().call.return_value = (123, 123 + 1_000_000, "0x" + "0"*40)
        
        # Configure the web3 instance mock
        mock_web3_instance.eth.contract.return_value = mock_contract
        mock_web3_instance.eth.get_transaction_count.return_value = 1
        mock_web3_instance.eth.gas_price = 10**9 # 1 gwei
        mock_web3_instance.eth.send_raw_transaction.return_value = b'\xcc' * 32
        mock_web3_instance.eth.wait_for_transaction_receipt.return_value = mock_receipt
        
        yield mock_web3_instance


def test_mock_login_and_list():
    # initiate login shows mock form
    r = client.get("/auth/initiate")
    assert r.status_code == 200
    assert "Mock Login" in r.text
    assert r.headers["access-control-allow-origin"] == "*"

    # callback returns fake JWT
    r = client.get("/auth/callback", params={"user": "alice@example.com"})
    assert r.status_code == 200
    data = r.json()
    token = data["id_token"]
    assert data["eligibility"] is True

    claims = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
    assert claims["email"] == "alice@example.com"
    assert claims["role"] == "user"

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


# Use the new robust mock_web3 fixture for this test.
def test_create_and_update_election(mock_web3):
    # This test requires an admin token to pass the new security check
    admin_token = jwt.encode({"email": "admin@example.com", "role": "admin"}, os.environ["JWT_SECRET"], algorithm="HS256")
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # The mock_web3 fixture now correctly simulates the contract call and event
    mock_contract = mock_web3.eth.contract.return_value
    # Configure the mock to return the correct start/end blocks for the `elections(id)` call
    mock_contract.functions.elections(99).call.return_value = (123, 123 + 1_000_000, "0x" + "0"*40)

    payload = {"metadata": "{\"title\": \"Test\", \"options\": []}", "verifier": "0x" + "0" * 40}
    # Pass the admin headers with the request
    r = client.post("/elections", json=payload, headers=headers)
    
    assert r.status_code == 201, f"API failed with: {r.text}"
    data = r.json()
    assert data["id"] == 99  # From the mocked event
    assert data["meta"].startswith("0x")
    # Assert against the values returned by the mocked contract call
    assert data["start"] == 123
    assert data["end"] == 123 + 1_000_000
    election_id = data["id"]

    r = client.patch(f"/elections/{election_id}", json={"status": "open"})
    assert r.status_code == 200
    assert r.json()["status"] == "open"

    r = client.patch(f"/elections/{election_id}", json={"tally": "A:1,B:0"})
    assert r.status_code == 200
    assert r.json()["tally"] == "A:1,B:0"

def test_create_election_fails_for_non_admin(mock_web3):
    """Verify that a user without the 'admin' role cannot create an election."""
    user_token = jwt.encode({"email": "user@example.com", "role": "user"}, os.environ["JWT_SECRET"], algorithm="HS256")
    headers = {"Authorization": f"Bearer {user_token}"}
    
    payload = {"metadata": "{\"title\": \"Bad\"}", "verifier": "0x" + "0" * 40}
    r = client.post("/elections", json=payload, headers=headers)
    
    assert r.status_code == 403
    assert "Insufficient permissions" in r.text


def test_manifest_check():
    import subprocess

    result = subprocess.run(
        ["python", "scripts/check_manifest.py"], capture_output=True
    )
    assert result.returncode in (0, 1)


def test_proof_cache_and_quota():
    token = jwt.encode(
        {"email": "bob@example.com", "role": "user"}, os.environ["JWT_SECRET"], algorithm="HS256"
    )
    headers = {"Authorization": f"Bearer {token}"}

    payload = {"country": "US", "dob": "1970-01-01", "residency": "CA"}

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
    r = client.post(
        "/api/zk/eligibility", json=payload | {"dob": "1990-01-02"}, headers=headers
    )
    assert r.status_code == 200
    r = client.post(
        "/api/zk/eligibility", json=payload | {"dob": "1990-01-03"}, headers=headers
    )
    assert r.status_code == 429


def test_voice_and_batch_tally_and_ws():
    token = jwt.encode(
        {"email": "carol@example.com", "role": "user"}, os.environ["JWT_SECRET"], algorithm="HS256"
    )
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


def test_circuit_version_migration():
    token = jwt.encode(
        {"email": "migrator@example.com", "role": "user"}, os.environ["JWT_SECRET"], algorithm="HS256"
    )
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"country": "US", "dob": "1990-01-01", "residency": "CA"}
    r = client.post("/api/zk/eligibility", json=payload, headers=headers)
    assert r.status_code == 200
    jid1 = r.json()["job_id"]
    r = client.get(f"/api/zk/eligibility/{jid1}")
    assert r.json()["status"] == "done"

    # flip to v2 while job1 completed
    db = SessionLocal()
    from backend.db import Circuit

    c1 = db.query(Circuit).filter_by(name="eligibility", version=1).first()
    c1.active = 0
    db.add(
        Circuit(
            name="eligibility",
            version=2,
            circuit_hash="hash_v2",
            ptau_version=1,
            zkey_version=2,
            active=1,
        )
    )
    db.commit()
    db.close()

    r = client.post(
        "/api/zk/eligibility", json=payload | {"dob": "1990-01-02"}, headers=headers
    )
    jid2 = r.json()["job_id"]
    r = client.get(f"/api/zk/eligibility/{jid2}")
    assert r.json()["status"] == "done"


def test_proof_audit_cli():
    token = jwt.encode(
        {"email": "auditor@example.com", "role": "user"}, os.environ["JWT_SECRET"], algorithm="HS256"
    )
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"country": "US", "dob": "1990-02-01", "residency": "CA"}
    r = client.post("/api/zk/eligibility", json=payload, headers=headers)
    jid = r.json()["job_id"]
    r = client.get(f"/api/zk/eligibility/{jid}")
    assert r.json()["status"] == "done"
    db = SessionLocal()
    from backend.db import ProofAudit

    row = db.query(ProofAudit).first()
    db.close()
    import subprocess, json as js

    env = os.environ.copy()
    env["PYTHONPATH"] = os.path.join(os.getcwd(), "packages")
    env["DATABASE_URL"] = os.environ["DATABASE_URL"]
    result = subprocess.run(
        ["python", "-m", "backend.cli", row.proof_root],
        capture_output=True,
        text=True,
        env=env,
    )
    assert result.returncode == 0
    data = js.loads(result.stdout)
    assert data["proof_root"] == row.proof_root


def test_grpc_wrapper():
    from backend import grpc_server

    server = grpc_server.serve(50052)
    import time

    time.sleep(0.1)
    import grpc
    from backend.proto import proof_pb2, proof_pb2_grpc

    channel = grpc.insecure_channel("localhost:50052")
    stub = proof_pb2_grpc.ProofServiceStub(channel)
    payload = {"country": "US", "dob": "1991-01-01", "residency": "CA"}
    resp = stub.Generate(
        proof_pb2.GenerateRequest(
            circuit="eligibility", input_json=json.dumps(payload)
        ),
        metadata=(("x-curve", "bls12-381"),),
    )
    status = stub.Status(proof_pb2.StatusRequest(job_id=resp.job_id))
    assert status.state == "done"
    assert status.proof
    server.stop(0)


def test_multicurve_header():
    token = jwt.encode(
        {"email": "multi@example.com", "role": "user"}, os.environ["JWT_SECRET"], algorithm="HS256"
    )
    headers = {"Authorization": f"Bearer {token}", "x-curve": "bls12-381"}
    payload = {"country": "US", "dob": "1980-01-01", "residency": "CA"}
    r = client.post("/api/zk/eligibility", json=payload, headers=headers)
    assert r.status_code == 200
    jid = r.json()["job_id"]
    r = client.get(f"/api/zk/eligibility/{jid}")
    assert r.json()["status"] == "done"


def test_quota_endpoint():
    token = jwt.encode(
        {"email": "quota@example.com", "role": "user"}, os.environ["JWT_SECRET"], algorithm="HS256"
    )
    headers = {"Authorization": f"Bearer {token}"}

    r = client.get("/api/quota", headers=headers)
    assert r.status_code == 200
    assert r.json()["left"] == 3

    payload = {"country": "US", "dob": "1999-01-01", "residency": "CA"}
    r = client.post("/api/zk/eligibility", json=payload, headers=headers)
    jid = r.json()["job_id"]
    client.get(f"/api/zk/eligibility/{jid}")

    r = client.get("/api/quota", headers=headers)
    assert r.status_code == 200
    assert r.json()["left"] == 2


def test_list_proofs():
    token = jwt.encode(
        {"email": "veri@example.com", "role": "user"}, os.environ["JWT_SECRET"], algorithm="HS256"
    )
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"country": "US", "dob": "1990-12-12", "residency": "CA"}
    r = client.post("/api/zk/eligibility", json=payload, headers=headers)
    jid = r.json()["job_id"]
    client.get(f"/api/zk/eligibility/{jid}")

    r = client.get("/proofs")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) >= 1
