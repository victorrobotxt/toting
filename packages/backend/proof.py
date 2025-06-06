import os
import json
import hashlib
from datetime import datetime
from celery import Celery
from .db import SessionLocal, Circuit, ProofAudit, Base, engine

# simple in-memory cache (used in tests when Redis unavailable)
PROOF_CACHE: dict[str, dict] = {}

# Load default hashes from the compiled circuit manifest
MANIFEST_PATH = os.getenv("CIRCUIT_MANIFEST", "/app/circuits/manifest.json")
if not os.path.exists(MANIFEST_PATH):
    alt = os.path.join(os.getcwd(), "artifacts", "manifest.json")
    if os.path.exists(alt):
        MANIFEST_PATH = alt
DEFAULT_HASHES = {}

if os.path.exists(MANIFEST_PATH):
    with open(MANIFEST_PATH) as f:
        manifest_data = json.load(f)
        for name, curves in manifest_data.items():
            # Standardize names from manifest (e.g., "voice_check") to API names (e.g., "voice")
            api_name = name.replace("_check", "")
            DEFAULT_HASHES.setdefault(api_name, {})
            for curve, data in curves.items():
                DEFAULT_HASHES[api_name][curve] = data["hash"]
else:
    print(f"Warning: Circuit manifest not found at {MANIFEST_PATH}. Using empty defaults.")

def get_circuit_hash(name: str, curve: str = "bn254") -> str:
    db = SessionLocal()
    row = db.query(Circuit).filter_by(name=name, active=1).first()
    db.close()
    if row:
        return row.circuit_hash
    # Fallback to the loaded manifest defaults
    return DEFAULT_HASHES.get(name, {}).get(curve, "")

def cache_key(circuit: str, inputs: dict, curve: str) -> str:
    data = json.dumps(inputs, sort_keys=True).encode()
    circuit_hash = get_circuit_hash(circuit, curve)
    if not circuit_hash:
        raise ValueError(f"Could not find hash for circuit '{circuit}' on curve '{curve}'")
    return hashlib.sha256(data + circuit_hash.encode()).hexdigest()

def cache_get(circuit: str, inputs: dict, curve: str):
    try:
        key = cache_key(circuit, inputs, curve)
        return PROOF_CACHE.get(key)
    except ValueError:
        return None

BROKER_URL = os.getenv("CELERY_BROKER", "redis://localhost:6379/0")
BACKEND_URL = os.getenv("CELERY_BACKEND", "redis://localhost:6379/0")
celery_app = Celery('proof', broker=BROKER_URL, backend=BACKEND_URL)
if os.getenv("CELERY_TASK_ALWAYS_EAGER"):
    celery_app.conf.task_always_eager = True
    celery_app.conf.task_store_eager_result = True

@celery_app.task
def generate_proof(circuit: str, inputs: dict, curve: str = "bn254"):
    """Dummy proof generator that hashes inputs and stores in cache."""
    data = json.dumps(inputs, sort_keys=True).encode()
    h = hashlib.sha256(data).hexdigest()
    proof = f"proof-{h[:16]}"
    pub = [int(h[i:i+8], 16) for i in range(0, 32, 8)]
    result = {"proof": proof, "pubSignals": pub}
    
    key = cache_key(circuit, inputs, curve)
    PROOF_CACHE[key] = result

    circuit_hash = get_circuit_hash(circuit, curve)
    input_hash = hashlib.sha256(data).hexdigest()
    proof_root = hashlib.sha256(json.dumps(result).encode()).hexdigest()

    db = SessionLocal()
    db.add(
        ProofAudit(
            circuit_hash=circuit_hash,
            input_hash=input_hash,
            proof_root=proof_root,
            timestamp=datetime.utcnow().isoformat(),
        )
    )
    db.commit()
    db.close()

    return result
