# packages/backend/main.py

from fastapi import FastAPI, HTTPException, Depends, Header, WebSocket, Request
from datetime import datetime
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from jose import jwt, JWTError, jwk
from jose.utils import base64url_decode
import httpx
import os
import json
from typing import Optional, Any
import asyncio
from web3 import Web3
from eth_account import Account
from eth_account.messages import encode_defunct
from eth_abi import encode as abi_encode
from web3.middleware import geth_poa_middleware
import hashlib
import sentry_sdk
from sentry_sdk.integrations.asgi import SentryAsgiMiddleware

from .utils.ipfs import pin_json, cid_from_meta_hash, fetch_json
from prometheus_fastapi_instrumentator import Instrumentator
import logging
from pythonjsonlogger import jsonlogger

handler = logging.StreamHandler()
handler.setFormatter(jsonlogger.JsonFormatter())
logging.basicConfig(level=logging.INFO, handlers=[handler])

sentry_sdk.init(dsn=os.getenv("SENTRY_DSN"))

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
app.add_middleware(SentryAsgiMiddleware)

Instrumentator().instrument(app).expose(app)

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
PAYMASTER = Web3.to_checksum_address(os.getenv("PAYMASTER", "0x" + "0" * 40))

# Push Protocol configuration
PUSH_API_URL = os.getenv("PUSH_API_URL", "https://backend.epns.io/apis/v1/payloads")
PUSH_CHANNEL = os.getenv("PUSH_CHANNEL")
PUSH_ENV = os.getenv("PUSH_ENV", "staging")

def send_push_notification(title: str, body: str, recipients: list[str] | None = None) -> None:
    """Send a notification via Push Protocol if configured."""
    if not PUSH_CHANNEL:
        logging.info("Push Protocol not configured; skipping notification")
        return
    payload = {
        "senderType": 0,
        "type": 4 if recipients else 1,
        "identityType": 2,
        "notification": {"title": title, "body": body},
        "payload": {"title": title, "body": body, "cta": "", "img": ""},
        "recipients": [f"eip155:{CHAIN_ID}:{r}" for r in recipients] if recipients else None,
        "channel": f"eip155:{CHAIN_ID}:{PUSH_CHANNEL}",
        "env": PUSH_ENV,
    }
    try:
        httpx.post(PUSH_API_URL, json=payload, timeout=10)
    except Exception as exc:
        logging.error(f"Push notification failed: {exc}")


# Instantiate the Web3 object
web3 = Web3(Web3.HTTPProvider(EVM_RPC))
# Add Proof-of-Authority middleware, required for many testnets and good practice for local dev.
web3.middleware_onion.inject(geth_poa_middleware, layer=0)


# --- FIX: Lazily load the contract ABI to prevent startup race conditions ---
EM_ABI = None
PM_ABI = None

def get_manager_contract():
    """Helper to create a contract instance. Lazily loads the ABI."""
    global EM_ABI
    if EM_ABI is None:
        ABI_PATH = "/app/out/ElectionManagerV2.sol/ElectionManagerV2.json"
        if not os.path.exists(ABI_PATH):
            # This should not be hit due to the wait-loop in docker-compose,
            # but it's a robust guard against reloader race conditions.
            raise RuntimeError(f"Could not load contract ABI from {ABI_PATH}")
        
        with open(ABI_PATH) as f:
            EM_ARTIFACT = json.load(f)
            EM_ABI = EM_ARTIFACT["abi"]
    
    return web3.eth.contract(address=ELECTION_MANAGER, abi=EM_ABI)

def get_paymaster_contract():
    """Helper to create the Paymaster contract instance."""
    global PM_ABI
    if PM_ABI is None:
        ABI_PATH = "/app/out/VerifyingPaymaster.sol/VerifyingPaymaster.json"
        if not os.path.exists(ABI_PATH):
            raise RuntimeError(f"Could not load contract ABI from {ABI_PATH}")
        with open(ABI_PATH) as f:
            PM_ARTIFACT = json.load(f)
            PM_ABI = PM_ARTIFACT["abi"]
    return web3.eth.contract(address=PAYMASTER, abi=PM_ABI)


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
# The URL the identity provider will redirect back to after authentication
REDIRECT = os.getenv("GRAO_REDIRECT_URI", "http://localhost:3000/auth/callback")
USE_REAL_OAUTH = os.getenv("USE_REAL_OAUTH", "false").lower() in ("1", "true")
PROOF_QUOTA = int(os.getenv("PROOF_QUOTA", "25"))

# Caches for OIDC discovery and signing keys
OIDC_CONFIG: dict | None = None
OIDC_JWKS: dict | None = None

def fetch_oidc_config() -> dict:
    """Retrieve and cache the OIDC discovery document."""
    global OIDC_CONFIG
    if OIDC_CONFIG is None:
        url = f"{IDP_BASE}/.well-known/openid-configuration"
        resp = httpx.get(url, timeout=5)
        resp.raise_for_status()
        OIDC_CONFIG = resp.json()
    return OIDC_CONFIG

def fetch_jwks() -> dict:
    """Retrieve and cache the JWKS used to verify ID tokens."""
    global OIDC_JWKS
    if OIDC_JWKS is None:
        conf = fetch_oidc_config()
        jwks_uri = conf.get("jwks_uri", f"{IDP_BASE}/.well-known/jwks.json")
        resp = httpx.get(jwks_uri, timeout=5)
        resp.raise_for_status()
        OIDC_JWKS = resp.json()
    return OIDC_JWKS

def decode_oidc_token(token: str) -> dict:
    """Validate a JWT using the provider's JWKS."""
    jwks = fetch_jwks()
    header = jwt.get_unverified_header(token)
    kid = header.get("kid")
    if not kid:
        raise JWTError("Token missing 'kid' header")
    key_data = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
    if not key_data:
        raise JWTError("Signing key not found")
    key = jwk.construct(key_data)
    message, sig = token.rsplit(".", 1)
    if not key.verify(message.encode(), base64url_decode(sig.encode())):
        raise JWTError("Signature verification failed")
    claims = jwt.get_unverified_claims(token)
    if "exp" in claims and datetime.utcnow().timestamp() > float(claims["exp"]):
        raise JWTError("Token expired")
    aud = claims.get("aud")
    if aud and CLIENT_ID not in (aud if isinstance(aud, list) else [aud]):
        raise JWTError("Invalid audience")
    return claims

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
        if USE_REAL_OAUTH:
            claims = decode_oidc_token(token)
        else:
            claims = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return claims
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

# --- FIX: New dependency to check for admin role ---
def require_admin_role(user: dict = Depends(get_current_user)):
    """A dependency that ensures the user has the 'admin' role."""
    roles = user.get("roles")
    role = user.get("role")
    has_admin = False
    if isinstance(roles, list):
        has_admin = "admin" in roles
    elif isinstance(role, str):
        has_admin = role == "admin"
    if not has_admin:
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
        if not code:
            raise HTTPException(400, "missing authorization code")
        conf = fetch_oidc_config()
        token_url = conf.get("token_endpoint", f"{IDP_BASE}/token")
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                token_url,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": REDIRECT,
                    "client_id": CLIENT_ID,
                    "client_secret": CLIENT_SEC,
                },
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()

        id_token = data.get("id_token")
        if not id_token:
            raise HTTPException(400, "id_token missing in response")
        # Validate the token before returning it
        decode_oidc_token(id_token)
        return {"id_token": id_token, "access_token": data.get("access_token")}

    email = user or "tester@example.com"
    # --- FIX: Assign role based on email for easy testing ---
    role = "admin" if email == "admin@example.com" else "user"
    claims = {"email": email, "role": role}
    
    signed_jwt = jwt.encode(claims, JWT_SECRET, algorithm="HS256")
    return {"id_token": signed_jwt, "eligibility": True}


@app.get("/elections", response_model=list[ElectionSchema])
def list_elections(db: Session = Depends(get_db)):
    return db.query(DbElection).all()


# packages/backend/main.py

@app.post("/elections", response_model=ElectionSchema, status_code=201)
def create_election(
    payload: CreateElectionSchema,
    db: Session = Depends(get_db),
    admin_user: dict = Depends(require_admin_role)
):
    print(f"Admin user '{admin_user.get('email')}' is creating an election.")
    
    # 1. Pin the metadata to IPFS and derive the on-chain hash (sha256 digest)
    cid = pin_json(payload.metadata)
    digest = hashlib.sha256(payload.metadata.encode()).digest()
    meta_hash = digest
    
    # 2. Build & send the on-chain transaction
    account = Account.from_key(PRIVATE_KEY)
    contract = get_manager_contract()
    
    try:
        # --- THIS IS THE FIX ---
        # Instead of a high-level function call which can be ambiguous with proxies,
        # we manually encode the calldata. This is the Python equivalent of the
        # `abi.encodeCall` fix already present in your `FullFlow.t.sol` test.
        # This ensures the proxy receives the exact, intended function call.
        encoded_calldata = contract.encodeABI(
            fn_name='createElection',
            args=[meta_hash, '0x0000000000000000000000000000000000000000']
        )

        tx = {
            "to": ELECTION_MANAGER, # The address of the proxy contract
            "from": account.address,
            "data": encoded_calldata,
            "chainId": CHAIN_ID,
            "gas": 3_000_000,
            "gasPrice": web3.eth.gas_price,
            "nonce": web3.eth.get_transaction_count(account.address),
        }
        # --- END OF FIX ---

        signed = account.sign_transaction(tx)
        tx_hash = web3.eth.send_raw_transaction(signed.rawTransaction)
        receipt = web3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

        if receipt.status != 1:
            # This will now give a more direct error if the transaction reverts
            raise HTTPException(status_code=500, detail=f"On-chain transaction reverted. Tx hash: {tx_hash.hex()}")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"On-chain transaction failed: {e}")

    # 3. Parse the ElectionCreated event
    try:
        # This part should now succeed because the transaction no longer reverts
        events = contract.events.ElectionCreated().process_receipt(receipt)
        if not events:
            # This is the error you were seeing
            raise ValueError("ElectionCreated event not found in transaction logs")
        on_chain_id = events[0].args.id
        event_meta_bytes = events[0].args.meta
        meta_hex_string = Web3.to_hex(event_meta_bytes)
        
        if meta_hex_string != Web3.to_hex(meta_hash):
            raise HTTPException(status_code=500, detail="On-chain meta hash does not match calculated hash.")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Event parsing failed: {e}")

    # 4. Read the start/end from the contract
    try:
        election_data = contract.functions.elections(on_chain_id).call()
        start_block, end_block = election_data[0], election_data[1]
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Could not read election state from contract: {e}"
        )

    # 5. Persist in Postgres
    db_election = DbElection(
        id=on_chain_id,
        meta=meta_hex_string,
        start=start_block,
        end=end_block,
        status="pending",
    )
    db.add(db_election)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(DbElection).filter_by(id=on_chain_id).first()
        if existing:
            return existing
        raise HTTPException(
            status_code=500,
            detail=f"Database commit failed for election ID {on_chain_id}."
        )

    db.refresh(db_election)
    send_push_notification(
        "New Election Created",
        f"Election {on_chain_id} is now open"
    )
    return db_election

@app.get("/elections/{election_id}", response_model=ElectionSchema)
def get_election(election_id: int, db: Session = Depends(get_db)):
    election = db.query(DbElection).filter(DbElection.id == election_id).first()
    if not election:
        raise HTTPException(404, "election not found")
    return election

# --- NEW ENDPOINT TO SERVE METADATA ---
@app.get("/elections/{election_id}/meta", response_model=Any)
def get_election_metadata(election_id: int, db: Session = Depends(get_db)):
    election = db.query(DbElection).filter(DbElection.id == election_id).first()
    if not election:
        raise HTTPException(404, "metadata for election not found")
    try:
        cid = cid_from_meta_hash(election.meta)
        return fetch_json(cid)
    except Exception as e:
        raise HTTPException(500, f"failed to fetch metadata: {e}")

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


@app.post("/api/paymaster")
async def paymaster_data(user_op: dict):
    """Sign a UserOperation for the VerifyingPaymaster."""
    if PAYMASTER == Web3.to_checksum_address("0x" + "0" * 40):
        raise HTTPException(500, "Paymaster not configured")

    target = Web3.to_checksum_address(user_op.get("target", ELECTION_MANAGER))
    if target != ELECTION_MANAGER:
        raise HTTPException(400, "unsupported target")

    call_data = user_op.get("callData", "0x")
    if not call_data.startswith("0x7cb85bf8"):
        raise HTTPException(400, "invalid callData")

    op_tuple = (
        Web3.to_checksum_address(user_op["sender"]),
        int(user_op["nonce"], 16),
        user_op.get("initCode", "0x"),
        call_data,
        int(user_op["callGasLimit"], 16),
        int(user_op["verificationGasLimit"], 16),
        int(user_op["preVerificationGas"], 16),
        int(user_op["maxFeePerGas"], 16),
        int(user_op["maxPriorityFeePerGas"], 16),
        b"",
        b"",
    )

    paymaster = get_paymaster_contract()
    valid_until = (1 << 48) - 1
    valid_after = 0
    h = paymaster.functions.getHash(op_tuple, valid_until, valid_after).call()
    msg = encode_defunct(hexstr=Web3.to_hex(h))
    sig = Account.sign_message(msg, private_key=PRIVATE_KEY).signature.hex()
    timestamp_bytes = abi_encode(["uint48", "uint48"], [valid_until, valid_after]).hex()
    paymaster_and_data = "0x" + PAYMASTER[2:] + timestamp_bytes + sig[2:]
    return {"paymaster": PAYMASTER, "paymasterAndData": paymaster_and_data}


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
