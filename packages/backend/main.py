from fastapi import FastAPI, HTTPException, Depends, Header, WebSocket, Request
from datetime import datetime
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from jose import jwt
import httpx
import os
import json
from typing import Optional
import asyncio
from web3 import Web3
from eth_account import Account
from web3.middleware import geth_poa_middleware

from .db import SessionLocal, Base, engine, Election, ProofRequest, ProofAudit
from .schemas import (
    ElectionSchema,
    CreateElectionSchema,
    UpdateElectionSchema,
    EligibilityInput,
    VoiceInput,
    BatchTallyInput,
    ProofAuditSchema,
)
from .proof import celery_app, generate_proof, cache_get

app = FastAPI()

FRONTEND_ORIGIN = os.getenv("NEXT_PUBLIC_API_BASE", "http://localhost:3000")
LOCAL_MODE = "localhost" in FRONTEND_ORIGIN

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_origin_regex=".*" if LOCAL_MODE else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Always expose CORS header even without Origin
@app.middleware("http")
async def add_cors_header(request: Request, call_next):
    try:
        response = await call_next(request)
    except Exception as exc:
        # fall back to generic 500 response so CORS headers still apply
        print("handler error", exc)
        response = JSONResponse({"detail": "Internal Server Error"}, status_code=500)
    if LOCAL_MODE:
        response.headers.setdefault("access-control-allow-origin", "*")
    else:
        response.headers.setdefault("access-control-allow-origin", FRONTEND_ORIGIN)
    return response

# -----------------------------------------------------------------------------
# Initialize Web3 provider (pointing at your Anvil / local RPC).
# -----------------------------------------------------------------------------
EVM_RPC = os.getenv("EVM_RPC", "http://localhost:8545")
web3 = Web3(Web3.HTTPProvider(EVM_RPC))
# If you're on a Proof‐of‐Authority chain (like Anvil/Hardhat), inject this:
web3.middleware_onion.inject(geth_poa_middleware, layer=0)

ELECTION_MANAGER = Web3.to_checksum_address(
    os.getenv("ELECTION_MANAGER", "0x" + "0" * 40)
)
PRIVATE_KEY = os.getenv("ORCHESTRATOR_KEY", "0x" + "0" * 64)
CHAIN_ID = int(os.getenv("CHAIN_ID", "31337"))

# Minimal ABI for createElection function
EM_ABI = json.loads("""
[
    {
        "inputs": [{"internalType":"bytes32", "name": "meta", "type": "bytes32"}],
        "name": "createElection",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
]
""")


def create_election_onchain(account, contract, meta_hash: bytes) -> str:
    """
    Signs and broadcasts a `createElection(meta)` transaction.
    Returns the hex‐encoded transaction hash on success.
    """
    # 1) Build transaction payload
    txn = contract.functions.createElection(meta_hash).build_transaction({
        "from": account.address,
        "chainId": CHAIN_ID,
        "gas": 3_000_000,
        "gasPrice": web3.to_wei("1", "gwei"),
        "nonce": web3.eth.get_transaction_count(account.address),
    })

    # 2) Sign the transaction with the account's private key
    signed_tx = account.sign_transaction(txn)

    # 3) Send using the new `.raw_transaction` field (Web3.py v6+)
    tx_hash_bytes = web3.eth.send_raw_transaction(signed_tx.rawTransaction)

    # 4) Return the hex string of the tx hash
    return tx_hash_bytes.hex()


# Create tables on startup
Base.metadata.create_all(bind=engine)

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# OAuth2 config (real GRAO or fallback to a mock login form)
IDP_BASE = os.getenv("GRAO_BASE_URL", "https://demo-oauth.example")
CLIENT_ID = os.getenv("GRAO_CLIENT_ID", "test-client")
CLIENT_SEC = os.getenv("GRAO_CLIENT_SECRET", "test-client-secret")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-jwt-secret")
REDIRECT = os.getenv("GRAO_REDIRECT_URI", "http://localhost:3000/callback")
USE_REAL_OAUTH = os.getenv("USE_REAL_OAUTH", "false").lower() in ("1", "true")
PROOF_QUOTA = int(os.getenv("PROOF_QUOTA", "25"))
from sqlalchemy.exc import IntegrityError
from sqlalchemy import insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.dialects.postgresql import insert as pg_insert


def increment_quota(db: Session, user: str, day: str) -> bool:
    """Atomically increment daily proof counter using ``INSERT ... ON CONFLICT``."""
    if db.bind.dialect.name == "postgresql":
        ins = pg_insert(ProofRequest)
    elif db.bind.dialect.name == "sqlite":
        ins = sqlite_insert(ProofRequest)
    else:
        ins = insert(ProofRequest)

    stmt = (
        ins.values(user=user, day=day, count=1)
        .on_conflict_do_update(
            index_elements=[ProofRequest.user, ProofRequest.day],
            set_={ProofRequest.count: ProofRequest.count + 1},
            where=ProofRequest.count < PROOF_QUOTA,
        )
        .update({ProofRequest.count: ProofRequest.count + 1}, synchronize_session=False)
    )
    if updated:
        db.commit()
        return True
    try:
        db.add(ProofRequest(user=user, day=day, count=1))
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        updated = (
            db.query(ProofRequest)
            .filter(
                ProofRequest.user == user,
                ProofRequest.day == day,
                ProofRequest.count < PROOF_QUOTA,
            )
            .update({ProofRequest.count: ProofRequest.count + 1}, synchronize_session=False)
        )
        db.commit()
        return bool(updated)

if USE_REAL_OAUTH:
    if CLIENT_SEC == "test-client-secret":
        raise RuntimeError("GRAO_CLIENT_SECRET must be set")
    if JWT_SECRET == "dev-jwt-secret":
        raise RuntimeError("JWT_SECRET must be set")
else:
    print("WARNING: mock login has no CSRF protection; do not use in production")

if PRIVATE_KEY == "0x" + "0" * 64:
    raise RuntimeError("ORCHESTRATOR_KEY must be configured")


def get_user_id(authorization: str) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "missing auth")
    token = authorization.split()[1]
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except Exception:
        raise HTTPException(401, "invalid token")
    user = claims.get("email")
    if not user:
        raise HTTPException(401, "invalid token")
    return user


@app.get("/auth/initiate")
def initiate():
    if USE_REAL_OAUTH:
        url = (
            f"{IDP_BASE}/authorize?"
            f"response_type=code&client_id={CLIENT_ID}"
            f"&redirect_uri={REDIRECT}&scope=openid email"
        )
        response = RedirectResponse(url)
    else:
        html = """
    <html>
      <body>
        <h1>Mock Login</h1>
        <form action='/auth/callback' method='get'>
          <label>Email: <input type='text' name='user' value='tester@example.com'></label>
          <button type='submit'>Login</button>
        </form>
      </body>
    </html>
    """
        response = HTMLResponse(html)

    return response


@app.get("/auth/callback")
async def callback(code: Optional[str] = None, user: Optional[str] = None):
    """Exchange code for a (dummy) ID token or handle mock logins."""
    if USE_REAL_OAUTH:
        # For the smoke test we still mint a fake JWT
        fake_jwt = "ey.fake.base64"
        return {"id_token": fake_jwt, "eligibility": True}

    email = user or "tester@example.com"
    claims = {"email": email}
    fake_jwt = jwt.encode(claims, JWT_SECRET, algorithm="HS256")
    return {"id_token": fake_jwt, "eligibility": True}


@app.get("/elections", response_model=list[ElectionSchema])
def list_elections(db: Session = Depends(get_db)):
    return db.query(Election).all()


@app.post("/elections", response_model=ElectionSchema, status_code=201)
def create_election(payload: CreateElectionSchema, db: Session = Depends(get_db)):
    account = Account.from_key(PRIVATE_KEY)
    contract = web3.eth.contract(address=ELECTION_MANAGER, abi=EM_ABI)
    
    # The contract expects bytes32, so we convert the hex string from the payload
    meta_bytes = Web3.to_bytes(hexstr=payload.meta_hash)
    
    tx_hash = create_election_onchain(account, contract, meta_bytes)
    
    # Wait for the transaction receipt to get the block number
    receipt = web3.eth.wait_for_transaction_receipt(tx_hash)
    start_block = receipt.blockNumber
    
    election = Election(
        meta=payload.meta_hash, start=start_block, end=start_block + 7200
    )
    db.add(election)
    db.commit()
    db.refresh(election)
    return election


@app.get("/elections/{election_id}", response_model=ElectionSchema)
def get_election(election_id: int, db: Session = Depends(get_db)):
    election = db.query(Election).filter(Election.id == election_id).first()
    if not election:
        raise HTTPException(404, "election not found")
    return election


@app.patch("/elections/{election_id}", response_model=ElectionSchema)
def update_election(
    election_id: int, payload: UpdateElectionSchema, db: Session = Depends(get_db)
):
    election = db.query(Election).filter(Election.id == election_id).first()
    if not election:
        raise HTTPException(404, "election not found")
    data_to_update = payload.model_dump(exclude_unset=True)
    for key, value in data_to_update.items():
        setattr(election, key, value)
    db.commit()
    db.refresh(election)
    return election


@app.get("/api/gas")
async def gas_estimate():
    """Return a fake 95th percentile gas fee in gwei."""
    return {"p95": 42}


@app.post("/api/zk/{circuit}")
def post_proof_generic(
    circuit: str,
    request: Request,
    authorization: str = Header(None),
    x_curve: str | None = Header("bn254", alias="x-curve"),
    db: Session = Depends(get_db),
):
    # This is a generic handler, you might need more specific validation
    # based on the circuit name. For now, it's a catch-all.
    user = get_user_id(authorization)
    day = datetime.utcnow().strftime("%Y-%m-%d")
    if not increment_quota(db, user, day):
        raise HTTPException(429, "proof quota exceeded")

    curve = x_curve.lower() if x_curve else "bn254"
    
    # We need to parse the JSON body manually for the generic endpoint
    try:
        payload = asyncio.run(request.json())
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    cached = cache_get(circuit, payload, curve)
    if cached:
        return {"status": "done", **cached}

    job = generate_proof.delay(circuit, payload, curve)
    return {"job_id": job.id}


@app.get("/api/zk/{circuit}/{job_id}")
def get_proof_generic(circuit: str, job_id: str):
    async_result = celery_app.AsyncResult(job_id)
    if async_result.state in {"PENDING", "STARTED"}:
        return {"status": async_result.state.lower()}
    if async_result.state == "SUCCESS":
        return {"status": "done", **async_result.result}
    return {"status": "error"}


@app.websocket("/ws/proofs/{job_id}")
async def ws_proofs(websocket: WebSocket, job_id: str):
    await websocket.accept()
    while True:
        async_result = celery_app.AsyncResult(job_id)
        if async_result.state in {"PENDING", "STARTED"}:
            progress = async_result.info.get("progress", 0) if isinstance(async_result.info, dict) else 0
            await websocket.send_json(
                {"state": async_result.state.lower(), "progress": progress}
            )
        elif async_result.state == "SUCCESS":
            await websocket.send_json({"state": "done", "progress": 100})
            break
        else:
            await websocket.send_json({"state": "error", "progress": 0})
            break
        await asyncio.sleep(2)
    await websocket.close()


@app.get("/api/quota")
def get_quota(authorization: str = Header(None), db: Session = Depends(get_db)):
    """Return remaining proof quota for the current user."""
    user = get_user_id(authorization)
    day = datetime.utcnow().strftime("%Y-%m-%d")
    pr = db.query(ProofRequest).filter_by(user=user, day=day).first()
    used = pr.count if pr else 0
    return {"left": PROOF_QUOTA - used}


@app.get("/proofs", response_model=list[ProofAuditSchema])
def list_proofs(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    """Return recent proof audit entries."""
    return (
        db.query(ProofAudit)
        .order_by(ProofAudit.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
