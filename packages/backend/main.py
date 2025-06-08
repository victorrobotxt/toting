# packages/backend/main.py

from fastapi import FastAPI, HTTPException, Depends, Header, WebSocket, Request
from datetime import datetime
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from jose import jwt, JWTError
import httpx
import os
import json
from typing import Optional
import asyncio
from web3 import Web3
from eth_account import Account
from web3.middleware import geth_poa_middleware

from .db import SessionLocal, Base, engine, Election as DbElection, ProofRequest, ProofAudit
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
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError


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
CHAIN_ID = int(os.getenv("CHAIN_ID", "31337"))
PRIVATE_KEY = os.getenv("ORCHESTRATOR_KEY")
ELECTION_MANAGER = Web3.to_checksum_address(os.getenv("ELECTION_MANAGER"))


# Instantiate the Web3 object
web3 = Web3(Web3.HTTPProvider(EVM_RPC))
# Add Proof-of-Authority middleware, required for many testnets and good practice for local dev.
web3.middleware_onion.inject(geth_poa_middleware, layer=0)


# Load full ABI from the compiled artifact to ensure event parsing is robust.
# The Dockerfile must copy this file into the image.
ABI_PATH = "/app/out/ElectionManagerV2.sol/ElectionManagerV2.json"
try:
    with open(ABI_PATH) as f:
        EM_ARTIFACT = json.load(f)
        EM_ABI = EM_ARTIFACT["abi"]
except FileNotFoundError:
    raise RuntimeError(f"Could not load contract ABI from {ABI_PATH}")

def get_manager_contract():
    """Helper to create a contract instance."""
    return web3.eth.contract(address=ELECTION_MANAGER, abi=EM_ABI)


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

def increment_quota(db: Session, user: str, day: str) -> bool:
    """Atomically increment daily proof counter."""
    if db.bind.dialect.name == "postgresql":
        # Use native ON CONFLICT for Postgres for atomicity and performance
        stmt = pg_insert(ProofRequest).values(user=user, day=day, count=1)
        update_stmt = stmt.on_conflict_do_update(
            index_elements=['user', 'day'],
            set_=dict(count=ProofRequest.count + 1),
            where=(ProofRequest.count < PROOF_QUOTA)
        )
        result = db.execute(update_stmt)
        db.commit()
        # If the WHERE clause failed (quota exceeded), no row is updated.
        return result.rowcount > 0
    else:
        # Fallback for SQLite (less atomic but sufficient for testing)
        try:
            db.add(ProofRequest(user=user, day=day, count=1))
            db.commit()
            return True
        except IntegrityError:
            db.rollback()
            updated_rows = db.query(ProofRequest).filter(
                ProofRequest.user == user,
                ProofRequest.day == day,
                ProofRequest.count < PROOF_QUOTA
            ).update({"count": ProofRequest.count + 1}, synchronize_session=False)
            db.commit()
            return bool(updated_rows)

if USE_REAL_OAUTH:
    if CLIENT_SEC == "test-client-secret":
        raise RuntimeError("GRAO_CLIENT_SECRET must be set")
    if JWT_SECRET == "dev-jwt-secret":
        raise RuntimeError("JWT_SECRET must be set")
else:
    print("WARNING: mock login has no CSRF protection; do not use in production")

if ELECTION_MANAGER == Web3.to_checksum_address("0x" + "0" * 40):
    print("Warning: ELECTION_MANAGER is not set, defaulting to zero address.")

if not PRIVATE_KEY:
    raise RuntimeError("ORCHESTRATOR_KEY must be configured")


def get_current_user(authorization: str = Header(None)) -> dict:
    """Decodes the JWT and returns the claims payload."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split()[1]
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return claims
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

# --- FIX: New dependency to check for admin role ---
def require_admin_role(user: dict = Depends(get_current_user)):
    """A dependency that ensures the user has the 'admin' role."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Insufficient permissions. Admin role required.")
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
          <p>Use <b>admin@example.com</b> to get an admin role token.</p>
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
    """
    Exchange code for a (dummy) ID token or handle mock logins.
    Generates a token with an 'admin' role if the email is 'admin@example.com'.
    """
    if USE_REAL_OAUTH:
        # For the smoke test we still mint a fake JWT
        # In a real scenario, you'd exchange the code for a real token here.
        claims = {"email": "realuser@example.com", "role": "user"}
        signed_jwt = jwt.encode(claims, JWT_SECRET, algorithm="HS256")
        return {"id_token": signed_jwt, "eligibility": True}

    email = user or "tester@example.com"
    # --- FIX: Assign role based on email for easy testing ---
    role = "admin" if email == "admin@example.com" else "user"
    claims = {"email": email, "role": role}
    
    signed_jwt = jwt.encode(claims, JWT_SECRET, algorithm="HS256")
    return {"id_token": signed_jwt, "eligibility": True}


@app.get("/elections", response_model=list[ElectionSchema])
def list_elections(db: Session = Depends(get_db)):
    return db.query(DbElection).all()

# --- FIX: Protect this endpoint by requiring the admin role ---
@app.post("/elections", response_model=ElectionSchema, status_code=201)
def create_election(
    payload: CreateElectionSchema,
    db: Session = Depends(get_db),
    admin_user: dict = Depends(require_admin_role) # This enforces the protection
):
    print(f"Admin user '{admin_user.get('email')}' is creating an election.")
    # 1) Build & send the on-chain transaction
    account = Account.from_key(PRIVATE_KEY)
    contract = get_manager_contract()
    meta_bytes = Web3.to_bytes(hexstr=payload.meta_hash)

    try:
        # build → sign → send
        tx = contract.functions.createElection(meta_bytes).build_transaction({
            "from": account.address,
            "chainId": CHAIN_ID,
            "gas": 3_000_000,
            "gasPrice": web3.eth.gas_price,
            "nonce": web3.eth.get_transaction_count(account.address),
        })
        signed = account.sign_transaction(tx)
        tx_hash = web3.eth.send_raw_transaction(signed.rawTransaction)
        receipt = web3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

        # ensure it didn’t revert
        if receipt.status != 1:
            raise HTTPException(status_code=500, detail="On-chain transaction reverted")

    except HTTPException:
        # re-raise our own HTTPExceptions
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"On-chain transaction failed: {e}")

    # 2) Parse the ElectionCreated event
    try:
        events = contract.events.ElectionCreated().process_receipt(receipt)
        if not events:
            raise ValueError("ElectionCreated event not found in transaction logs")
        on_chain_id = events[0].args.id
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Event parsing failed: {e}")

    # 3) Read the start/end from the contract
    try:
        election_data = contract.functions.elections(on_chain_id).call()
        start_block, end_block = election_data[0], election_data[1]
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Could not read election state from contract: {e}"
        )

    # 4) Persist in Postgres
    db_election = DbElection(
        id=on_chain_id,
        meta=payload.meta_hash,
        start=start_block,
        end=end_block,
        status="pending",
    )
    db.add(db_election)
    try:
        db.commit()
    except IntegrityError: # Be specific about the exception
        db.rollback()
        # The record might already exist due to a race condition (e.g., from an indexer).
        # In that case, we can just fetch and return it.
        existing = db.query(DbElection).filter_by(id=on_chain_id).first()
        if existing:
            return existing
        # If it doesn't exist after a rollback, something else went wrong.
        raise HTTPException(
            status_code=500,
            detail=f"Database commit failed for election ID {on_chain_id}."
        )

    db.refresh(db_election)
    return db_election

@app.get("/elections/{election_id}", response_model=ElectionSchema)
def get_election(election_id: int, db: Session = Depends(get_db)):
    election = db.query(DbElection).filter(DbElection.id == election_id).first()
    if not election:
        raise HTTPException(404, "election not found")
    return election


@app.patch("/elections/{election_id}", response_model=ElectionSchema)
def update_election(
    election_id: int, payload: UpdateElectionSchema, db: Session = Depends(get_db)
):
    election = db.query(DbElection).filter(DbElection.id == election_id).first()
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
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    x_curve: str | None = Header("bn254", alias="x-curve"),
):
    user_email = user.get("email")
    day = datetime.utcnow().strftime("%Y-%m-%d")
    if not increment_quota(db, user_email, day):
        raise HTTPException(429, "proof quota exceeded")

    curve = x_curve.lower() if x_curve else "bn254"
    
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
        result_data = async_result.result
        if isinstance(result_data, str):
            try:
                result_data = json.loads(result_data)
            except json.JSONDecodeError:
                return {"status": "error", "detail": "Invalid result format from worker"}
        
        return {"status": "done", **result_data}
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
def get_quota(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """Return remaining proof quota for the current user."""
    user_email = user.get("email")
    day = datetime.utcnow().strftime("%Y-%m-%d")
    pr = db.query(ProofRequest).filter_by(user=user_email, day=day).first()
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
