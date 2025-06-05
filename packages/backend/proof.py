import os
import json
import hashlib
from celery import Celery

# simple in-memory cache (used in tests when Redis unavailable)
PROOF_CACHE: dict[str, dict] = {}

# circuit hashes for compiled circuits
ELIGIBILITY_HASH = "58973d361f4b6fa0c9d9f7d52d8cd6b5d5be54473a7fa80638a44eb2e0975bf2"
VOICE_HASH = "250dc836c4654c537cbe8ca1b61a188d0fac62cba52295e31486cf32c6396aa8"
BATCH_TALLY_HASH = "0079db54cbac930828c998c637bb910c7a963a60bda797c0fbfd0b9c5d66f6f9"

CIRCUIT_HASHES = {
    "eligibility": ELIGIBILITY_HASH,
    "voice": VOICE_HASH,
    "batch_tally": BATCH_TALLY_HASH,
}


def cache_key(circuit: str, inputs: dict) -> str:
    data = json.dumps(inputs, sort_keys=True).encode()
    return hashlib.sha256(data + CIRCUIT_HASHES[circuit].encode()).hexdigest()


def cache_get(circuit: str, inputs: dict):
    return PROOF_CACHE.get(cache_key(circuit, inputs))

BROKER_URL = os.getenv("CELERY_BROKER", "redis://localhost:6379/0")
BACKEND_URL = os.getenv("CELERY_BACKEND", "redis://localhost:6379/0")
celery_app = Celery('proof', broker=BROKER_URL, backend=BACKEND_URL)
if os.getenv("CELERY_TASK_ALWAYS_EAGER"):
    celery_app.conf.task_always_eager = True
    celery_app.conf.task_store_eager_result = True

@celery_app.task
def generate_proof(circuit: str, inputs: dict):
    """Dummy proof generator that hashes inputs and stores in cache."""
    data = json.dumps(inputs, sort_keys=True).encode()
    h = hashlib.sha256(data).hexdigest()
    proof = f"proof-{h[:16]}"
    pub = [int(h[i:i+8], 16) for i in range(0, 32, 8)]
    result = {"proof": proof, "pubSignals": pub}

    PROOF_CACHE[cache_key(circuit, inputs)] = result
    return result
