FROM python:3.11-slim AS base
RUN apt-get update && apt-get install -y curl gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
WORKDIR /app
RUN groupadd -r app && useradd -r -g app appuser

# --- STAGE 1: Build a unified environment for Python services ---
FROM base AS python-env
COPY packages/backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY packages/backend /app/packages/backend
COPY artifacts/manifest.json /app/circuits/manifest.json

# --- STAGE 2: Final Backend Image ---
FROM python-env AS backend
USER appuser
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "packages.backend.main:app", "--host", "0.0.0.0", "--port", "8000"]

# --- STAGE 3: Final Worker Image (reuses the same env) ---
FROM python-env AS worker
USER appuser
CMD ["celery", "-A", "packages.backend.proof.celery_app", "worker", "--loglevel=info"]

# --- STAGE 4: Final Orchestrator Image ---
FROM python-env AS orchestrator
# Install orchestrator-specific npm tools
RUN npm install -g snarkjs
# Now copy the orchestrator code
COPY services/orchestrator /app/orchestrator
USER appuser
CMD ["python", "/app/orchestrator/main.py"]
