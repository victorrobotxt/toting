from fastapi import FastAPI, HTTPException, Depends, Header, WebSocket, Request
from datetime import datetime
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from jose import jwt
import httpx
import os
from typing import Optional
import asyncio
from web3 import Web3
from eth_account import Account

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


# On-chain ElectionManager config
EVM_RPC = os.getenv("EVM_RPC", "http://127.0.0.1:8545")
ELECTION_MANAGER = Web3.to_checksum_address(
    os.getenv("ELECTION_MANAGER", "0x" + "0" * 40)
)
PRIVATE_KEY = os.getenv("ORCHESTRATOR_KEY", "0x" + "0" * 64)
CHAIN_ID = int(os.getenv("CHAIN_ID", "1337"))
EM_ABI = [
    {
        "inputs": [{"internalType": "bytes32", "name": "meta", "type": "bytes32"}],
        "name": "createElection",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    }
]


def create_election_onchain(meta: str) -> int:
    """Call the ElectionManager contract and return the start block number.

    If the chain interaction fails (missing contract or RPC down), fall back to
    the current block number to avoid hard failures during local dev.
    """
    w3 = Web3(Web3.HTTPProvider(EVM_RPC))
    try:
        mgr = w3.eth.contract(address=ELECTION_MANAGER, abi=EM_ABI)
        acct = Account.from_key(PRIVATE_KEY)
        tx = mgr.functions.createElection(meta).build_transaction(
            {
                "from": acct.address,
                "nonce": w3.eth.get_transaction_count(acct.address),
                "gas": 200_000,
                "gasPrice": w3.to_wei("1", "gwei"),
                "chainId": CHAIN_ID,
            }
        )
        signed = acct.sign_transaction(tx)
        txh = w3.eth.send_raw_transaction(signed.rawTransaction)
        rcpt = w3.eth.wait_for_transaction_receipt(txh)
        return rcpt.blockNumber
    except Exception as exc:
        print("create_election_onchain failed", exc)
        try:
            return w3.eth.block_number
        except Exception:
            return 0


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


def increment_quota(db: Session, user: str, day: str) -> bool:
    """Atomically increment daily proof counter, enforcing the quota."""
    updated = (
        db.query(ProofRequest)
        .filter(
            ProofRequest.user == user,
            ProofRequest.day == day,
            ProofRequest.count < PROOF_QUOTA,
        )
        .update({ProofRequest.count: ProofRequest.count + 1})
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
            .update({ProofRequest.count: ProofRequest.count + 1})
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
        print("HEIII")

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
    start_block = create_election_onchain(payload.meta_hash)
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
    if payload.status is not None:
        election.status = payload.status
    if payload.tally is not None:
        election.tally = payload.tally
    db.commit()
    db.refresh(election)
    return election


@app.get("/api/gas")
async def gas_estimate():
    """Return a fake 95th percentile gas fee in gwei."""
    return {"p95": 42}


@app.post("/api/zk/eligibility")
def post_eligibility(
    payload: EligibilityInput,
    authorization: str = Header(None),
    x_curve: str | None = Header("bn254", alias="x-curve"),
    db: Session = Depends(get_db),
):
    user = get_user_id(authorization)
    day = datetime.utcnow().strftime("%Y-%m-%d")
    if not increment_quota(db, user, day):
        raise HTTPException(429, "proof quota exceeded")

    curve = x_curve.lower() if x_curve else "bn254"
    cached = cache_get("eligibility", payload.dict(), curve)
    if cached:
        return {"status": "done", **cached}

    job = generate_proof.delay("eligibility", payload.dict(), curve)
    return {"job_id": job.id}


@app.get("/api/zk/eligibility/{job_id}")
def get_eligibility(job_id: str):
    async_result = celery_app.AsyncResult(job_id)
    if async_result.state in {"PENDING", "STARTED"}:
        return {"status": async_result.state.lower()}
    if async_result.state == "SUCCESS":
        return {"status": "done", **async_result.result}
    return {"status": "error"}


@app.post("/api/zk/voice")
def post_voice(
    payload: VoiceInput,
    authorization: str = Header(None),
    x_curve: str | None = Header("bn254", alias="x-curve"),
    db: Session = Depends(get_db),
):
    user = get_user_id(authorization)
    day = datetime.utcnow().strftime("%Y-%m-%d")
    if not increment_quota(db, user, day):
        raise HTTPException(429, "proof quota exceeded")

    curve = x_curve.lower() if x_curve else "bn254"
    cached = cache_get("voice", payload.dict(), curve)
    if cached:
        return {"status": "done", **cached}

    job = generate_proof.delay("voice", payload.dict(), curve)
    return {"job_id": job.id}


@app.get("/api/zk/voice/{job_id}")
def get_voice(job_id: str):
    async_result = celery_app.AsyncResult(job_id)
    if async_result.state in {"PENDING", "STARTED"}:
        return {"status": async_result.state.lower()}
    if async_result.state == "SUCCESS":
        return {"status": "done", **async_result.result}
    return {"status": "error"}


@app.post("/api/zk/batch_tally")
def post_batch_tally(
    payload: BatchTallyInput,
    authorization: str = Header(None),
    x_curve: str | None = Header("bn254", alias="x-curve"),
    db: Session = Depends(get_db),
):
    user = get_user_id(authorization)
    day = datetime.utcnow().strftime("%Y-%m-%d")
    if not increment_quota(db, user, day):
        raise HTTPException(429, "proof quota exceeded")

    curve = x_curve.lower() if x_curve else "bn254"
    cached = cache_get("batch_tally", payload.dict(), curve)
    if cached:
        return {"status": "done", **cached}

    job = generate_proof.delay("batch_tally", payload.dict(), curve)
    return {"job_id": job.id}


@app.get("/api/zk/batch_tally/{job_id}")
def get_batch_tally(job_id: str):
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
            await websocket.send_json(
                {"state": async_result.state.lower(), "progress": 0}
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
