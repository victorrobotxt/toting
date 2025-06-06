import os
import subprocess
import tempfile
from celery.contrib.testing.worker import start_worker


def test_generate_proof_with_worker():
    db_fd, db_path = tempfile.mkstemp(suffix='.db')
    os.close(db_fd)
    os.environ['DATABASE_URL'] = f'sqlite:///{db_path}'
    os.environ['USE_REAL_OAUTH'] = 'false'
    os.environ['GRAO_CLIENT_SECRET'] = 'test-client-secret'
    os.environ['JWT_SECRET'] = 'test-secret'
    os.environ['ORCHESTRATOR_KEY'] = '0x' + '1' * 64
    os.environ['PROOF_QUOTA'] = '5'
    os.environ['CELERY_BROKER'] = 'redis://localhost:6380/0'
    os.environ['CELERY_BACKEND'] = 'redis://localhost:6380/0'
    os.environ.pop('CELERY_TASK_ALWAYS_EAGER', None)

    redis_proc = subprocess.Popen(['redis-server', '--port', '6380', '--save', '', '--appendonly', 'no'])
    try:
        from backend import proof
        from backend.proof import generate_proof, celery_app
        from backend.db import Base, engine
        Base.metadata.create_all(bind=engine)
        with start_worker(celery_app, perform_ping_check=False):
            job = generate_proof.delay('eligibility', {'country': 'US', 'dob': '1970-01-01', 'residency': 'CA'})
            result = job.get(timeout=10)
            assert 'proof' in result
    finally:
        redis_proc.terminate()
        redis_proc.wait()
        if os.path.exists(db_path):
            os.remove(db_path)
