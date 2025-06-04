FROM python:3.11-slim
WORKDIR /app
COPY services/orchestrator /app/orchestrator
RUN pip install web3 requests
CMD ["python", "/app/orchestrator/main.py"]
