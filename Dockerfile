# --- STAGE 0: Custom Setup Image with Foundry + JQ ---
# We need jq to parse config files in the setup_env.sh script.
# The base foundry image is minimal and does not include it.
FROM ghcr.io/foundry-rs/foundry:latest AS setup-env

# --- FIX: Switch to the root user to install packages ---
USER root

# The base image is Debian/Ubuntu, so we must use apt-get.
RUN apt-get update && \
    apt-get install -y --no-install-recommends jq && \
    rm -rf /var/lib/apt/lists/*
FROM python:3.11.13-slim AS base
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y curl gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
WORKDIR /app
RUN groupadd -r app && useradd -r -g app appuser

# --- STAGE 1: Build a unified environment for Python services ---
FROM base AS python-env
COPY packages/backend/requirements.txt ./requirements.txt
# --- FIX: Only copy and install requirements. Source will be mounted via volume. ---
RUN pip install --no-cache-dir -r requirements.txt

# --- STAGE 2: Final Backend Image ---
FROM python-env AS backend
USER appuser
EXPOSE 8000
# The CMD is overridden in docker-compose.yml, but this is a good fallback.
CMD ["sh", "-c", "echo 'Waiting for artifact...' && until [ -f /app/out/ElectionManagerV2.sol/ElectionManagerV2.json ]; do sleep 1; done && python -m uvicorn packages.backend.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir /app/packages/backend"]

# --- STAGE 3: Final Worker Image (reuses the same env) ---
FROM python-env AS worker
RUN npm install -g snarkjs
USER appuser
# The CMD is overridden in docker-compose.yml for startup dependencies, but this is a good fallback.
# The Celery -A argument should point to the module and the app instance.
CMD ["sh", "-c", "echo 'Waiting for artifact...' && until [ -f /app/out/ElectionManagerV2.sol/ElectionManagerV2.json ]; do sleep 1; done && celery -A packages.backend.proof:celery_app worker --loglevel=info"]

# --- STAGE 4: Final Orchestrator Image ---
FROM python-env AS orchestrator
# Install orchestrator-specific npm tools
RUN npm install -g snarkjs
# Now copy the orchestrator code
COPY services/orchestrator /app/orchestrator
USER appuser
# The CMD is overridden in docker-compose.yml, but this is a good fallback.
CMD ["sh", "-c", "echo 'Waiting for artifact...' && until [ -f /app/out/ElectionManagerV2.sol/ElectionManagerV2.json ]; do sleep 1; done && python /app/orchestrator/main.py"]
