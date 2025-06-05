import os
import json
import hashlib
from celery import Celery

BROKER_URL = os.getenv("CELERY_BROKER", "redis://localhost:6379/0")
BACKEND_URL = os.getenv("CELERY_BACKEND", "redis://localhost:6379/0")
celery_app = Celery('proof', broker=BROKER_URL, backend=BACKEND_URL)
if os.getenv("CELERY_TASK_ALWAYS_EAGER"):
    celery_app.conf.task_always_eager = True
    celery_app.conf.task_store_eager_result = True

@celery_app.task
def generate_proof(circuit: str, inputs: dict):
    """Dummy proof generator that hashes inputs."""
    data = json.dumps(inputs, sort_keys=True).encode()
    h = hashlib.sha256(data).hexdigest()
    proof = f"proof-{h[:16]}"
    pub = [int(h[i:i+8], 16) for i in range(0, 32, 8)]
    return {"proof": proof, "pubSignals": pub}
