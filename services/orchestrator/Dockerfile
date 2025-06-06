FROM python:3.11-slim
RUN apt-get update && apt-get install -y curl gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . /app/orchestrator
RUN pip install web3 requests && npm install -g snarkjs
CMD ["python", "/app/orchestrator/main.py"]
