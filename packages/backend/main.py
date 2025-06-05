from fastapi import FastAPI, HTTPException, Depends, Header
from datetime import datetime
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy.orm import Session
from jose import jwt
import httpx
import os
from typing import Optional
from web3 import Web3
from eth_account import Account

from .db import SessionLocal, Base, engine, Election, ProofRequest
from .schemas import (
    ElectionSchema,
    CreateElectionSchema,
    UpdateElectionSchema,
    EligibilityInput,
)
from .proof import celery_app, generate_proof, cache_get

app = FastAPI()

# On-chain ElectionManager config
EVM_RPC = os.getenv("EVM_RPC", "http://127.0.0.1:8545")
ELECTION_MANAGER = Web3.to_checksum_address(os.getenv("ELECTION_MANAGER", "0x" + "0"*40))
PRIVATE_KEY = os.getenv("ORCHESTRATOR_KEY", "0x" + "0"*64)
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
    """Call the ElectionManager contract and return the start block number."""
    w3 = Web3(Web3.HTTPProvider(EVM_RPC))
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
CLIENT_SEC = os.getenv("GRAO_CLIENT_SECRET", "test-secret")
REDIRECT = os.getenv("GRAO_REDIRECT_URI", "http://localhost:3000/callback")
USE_REAL_OAUTH = os.getenv("USE_REAL_OAUTH", "false").lower() in ("1", "true")
PROOF_QUOTA = int(os.getenv("PROOF_QUOTA", "25"))


def get_user_id(authorization: str) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "missing auth")
    token = authorization.split()[1]
    try:
        claims = jwt.decode(token, CLIENT_SEC, algorithms=["HS256"])
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
        return RedirectResponse(url)

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
    return HTMLResponse(html)

@app.get("/auth/callback")
async def callback(code: Optional[str] = None, user: Optional[str] = None):
    """Exchange code for a (dummy) ID token or handle mock logins."""
    if USE_REAL_OAUTH:
        # For the smoke test we still mint a fake JWT
        fake_jwt = "ey.fake.base64"
        return {"id_token": fake_jwt, "eligibility": True}

    email = user or "tester@example.com"
    claims = {"email": email}
    fake_jwt = jwt.encode(claims, CLIENT_SEC, algorithm="HS256")
    return {"id_token": fake_jwt, "eligibility": True}

@app.get("/elections", response_model=list[ElectionSchema])
def list_elections(db: Session = Depends(get_db)):
    return db.query(Election).all()


@app.post("/elections", response_model=ElectionSchema, status_code=201)
def create_election(payload: CreateElectionSchema, db: Session = Depends(get_db)):
    start_block = create_election_onchain(payload.meta_hash)
    election = Election(meta=payload.meta_hash, start=start_block, end=start_block + 7200)
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
    db: Session = Depends(get_db),
):
    user = get_user_id(authorization)
    day = datetime.utcnow().strftime("%Y-%m-%d")
    pr = db.query(ProofRequest).filter_by(user=user, day=day).first()
    if pr:
        if pr.count >= PROOF_QUOTA:
            raise HTTPException(429, "proof quota exceeded")
        pr.count += 1
    else:
        pr = ProofRequest(user=user, day=day, count=1)
        db.add(pr)
    db.commit()

    cached = cache_get("eligibility", payload.dict())
    if cached:
        return {"status": "done", **cached}

    job = generate_proof.delay("eligibility", payload.dict())
    return {"job_id": job.id}


@app.get("/api/zk/eligibility/{job_id}")
def get_eligibility(job_id: str):
    async_result = celery_app.AsyncResult(job_id)
    if async_result.state in {"PENDING", "STARTED"}:
        return {"status": async_result.state.lower()}
    if async_result.state == "SUCCESS":
        return {"status": "done", **async_result.result}
    return {"status": "error"}
