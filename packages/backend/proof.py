import os
import json
import hashlib
from datetime import datetime
from celery import Celery
from celery import signals
from .db import SessionLocal, Circuit, ProofAudit, Base, engine
from prometheus_client import Histogram, Counter, Gauge, start_http_server
import time

# simple in-memory cache (used in tests when Redis unavailable)
PROOF_CACHE: dict[str, dict] = {}

TASK_TIME = Histogram('celery_task_duration_seconds', 'Time spent on Celery tasks', ['name'])
TASK_SUCCESS = Counter('celery_task_success_total', 'Successful Celery tasks', ['name'])
TASK_FAILURE = Counter('celery_task_failure_total', 'Failed Celery tasks', ['name'])
QUEUE_LENGTH = Gauge('celery_queue_length', 'Tasks waiting in queue')

if os.getenv('CELERY_METRICS_PORT'):
    start_http_server(int(os.getenv('CELERY_METRICS_PORT')))

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
celery_app = Celery('proof', broker=BROKER_URL, backend=BACKEND_URL, task_serializer='json', result_serializer='json', accept_content=['json'])
if os.getenv("CELERY_TASK_ALWAYS_EAGER"):
    celery_app.conf.task_always_eager = True
    celery_app.conf.task_store_eager_result = True

@signals.task_prerun.connect
def _start_timer(task_id, task, **kwargs):
    task.__start_time__ = time.time()

@signals.task_postrun.connect
def _record_time(task_id, task, **kwargs):
    duration = time.time() - getattr(task, '__start_time__', time.time())
    TASK_TIME.labels(task.name).observe(duration)
    QUEUE_LENGTH.set(len(celery_app.control.inspect().reserved() or []))

@signals.task_success.connect
def _task_success(sender=None, result=None, **kwargs):
    TASK_SUCCESS.labels(sender.name).inc()

@signals.task_failure.connect
def _task_failure(sender=None, exception=None, **kwargs):
    TASK_FAILURE.labels(sender.name).inc()

@celery_app.task
def generate_proof(circuit: str, inputs: dict, curve: str = "bn254"):
    """
    Dummy proof generator.
    Returns a structured proof for 'eligibility' and a flat hex string for others.
    """
    data = json.dumps(inputs, sort_keys=True).encode()
    h = hashlib.sha256(data).hexdigest()
    proof = None
    
    if circuit == "eligibility":
        # For wallet creation, we need the structured ZkProof object.
        dummy_a = [f"0x{h[0:8]}", f"0x{h[8:16]}"]
        dummy_b = [[f"0x{h[16:24]}", f"0x{h[24:32]}"], [f"0x{h[32:40]}", f"0x{h[40:48]}"]]
        dummy_c = [f"0x{h[48:56]}", f"0x{h[56:64]}"]
        proof = {"a": dummy_a, "b": dummy_b, "c": dummy_c}
    else:
        # For other proofs like 'voice', the contract expects raw bytes.
        proof = f"0x{h[:64]}"

    # Generate 7 public signals to match the contract's ABI.
    # We take 7 chunks of 8 hex characters (4 bytes) each from the hash.
    # 7 * 8 = 56, which is less than the 64 available characters in the hash.
    pub = [int(h[i:i+8], 16) for i in range(0, 56, 8)]
    result = {"proof": proof, "pubSignals": pub}
    
    key = cache_key(circuit, inputs, curve)
    PROOF_CACHE[key] = result

    circuit_hash = get_circuit_hash(circuit, curve)
    input_hash = hashlib.sha256(data).hexdigest()

    proof_to_hash = json.dumps(proof, sort_keys=True) if isinstance(proof, dict) else str(proof)
    proof_root = hashlib.sha256(proof_to_hash.encode()).hexdigest()


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
