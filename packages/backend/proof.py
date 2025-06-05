import os
import json
import hashlib
from datetime import datetime
from celery import Celery

from .db import SessionLocal, Circuit, ProofAudit

# simple in-memory cache (used in tests when Redis unavailable)
PROOF_CACHE: dict[str, dict] = {}

# circuit hashes for compiled circuits
ELIGIBILITY_HASH_BN254 = "58973d361f4b6fa0c9d9f7d52d8cd6b5d5be54473a7fa80638a44eb2e0975bf2"
VOICE_HASH_BN254 = "250dc836c4654c537cbe8ca1b61a188d0fac62cba52295e31486cf32c6396aa8"
BATCH_TALLY_HASH_BN254 = "0079db54cbac930828c998c637bb910c7a963a60bda797c0fbfd0b9c5d66f6f9"

ELIGIBILITY_HASH_BLS = "487b33a46e5f8f873fea36eb05142f4da0ee9f5e39668273a4c8be047bb360ff"
VOICE_HASH_BLS = "c86ac2fe0421ee20f433ba93b48ef44516046067e4f19fc9bf93d75000268cce"
BATCH_TALLY_HASH_BLS = "60b61e0692334033d3e68078dd495fd388cc0292f93d64119ac44b0ece7863c6"

DEFAULT_HASHES = {
    "eligibility": {"bn254": ELIGIBILITY_HASH_BN254, "bls12-381": ELIGIBILITY_HASH_BLS},
    "voice": {"bn254": VOICE_HASH_BN254, "bls12-381": VOICE_HASH_BLS},
    "batch_tally": {"bn254": BATCH_TALLY_HASH_BN254, "bls12-381": BATCH_TALLY_HASH_BLS},
}


def get_circuit_hash(name: str, curve: str = "bn254") -> str:
    db = SessionLocal()
    row = db.query(Circuit).filter_by(name=name, active=1).first()
    db.close()
    if row:
        return row.circuit_hash
    return DEFAULT_HASHES[name][curve]


def cache_key(circuit: str, inputs: dict, curve: str) -> str:
    data = json.dumps(inputs, sort_keys=True).encode()
    return hashlib.sha256(
        data + get_circuit_hash(circuit, curve).encode()
    ).hexdigest()


def cache_get(circuit: str, inputs: dict, curve: str):
    return PROOF_CACHE.get(cache_key(circuit, inputs, curve))

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
