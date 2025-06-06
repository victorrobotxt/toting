FROM python:3.11-slim AS base
RUN apt-get update && apt-get install -y curl gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN groupadd -r app && useradd -r -g app appuser

FROM base AS backend
COPY packages/backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir celery
COPY packages/backend /app/packages/backend
COPY artifacts/manifest.json /app/circuits/manifest.json
RUN chown -R appuser /app
USER appuser
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "packages.backend.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM base AS orchestrator
COPY services/orchestrator /app/orchestrator
RUN pip install --no-cache-dir web3 requests && npm install -g snarkjs
RUN chown -R appuser /app
USER appuser
CMD ["python", "/app/orchestrator/main.py"]
