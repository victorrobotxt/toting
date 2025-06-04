# Backend PBIs

The following product backlog items (PBIs) capture upcoming backend work.

## B-01 Robust OAuth2 / eID Flow
- Implement real OAuth2 code→token exchange and refresh token handling.
- Validate ID token signature and claims using `python-jose`.
- Store tokens in a secure database table with rotation.
- 30‑minute ID token TTL with automatic silent refresh.
- Invalid or expired tokens return HTTP 401.

## B-02 API Key & Rate-Limiting Layer
- CRUD endpoints for API keys under `/admin/api-keys` (Basic Auth protected).
- Rate limit requests to 60 per minute per key/IP using a Redis token bucket.
- Log API key usage and respond with HTTP 429 when limits are exceeded.

## B-03 Election Metadata REST API
- Persist election objects including id, meta, start/end, status and tally.
- Endpoints:
  - `GET /elections` → list elections.
  - `GET /elections/{id}` → full JSON including tally.
- Auto-generate Swagger docs.
- Models with SQLAlchemy and background task to sync EVM events.
- Use Pydantic schemas with versioning.

## B-04 WebSocket Push: Live Block Height & Countdown
- WebSocket endpoint `/ws/chain` pushing `{block, remaining}` every 3 s.
- Support graceful reconnects and heartbeat messages.
- Implement with `FastAPI` WebSocket routes using shared web3 listener.

## B-05 Celery Job Queue for Heavy Tasks
- `POST /jobs/{type}` creates a job row and returns its id.
- Worker updates status and progress metadata.
- `GET /jobs/{id}` shows `queued` or `running` states and results when done.

## B-06 Audit-Trail Logger (WORM)
- Hash-chain every state-changing call and background action.
- Store logs in append-only storage with daily root export.
- Provide a CLI to verify the log chain and detect tampering.

## B-07 Prometheus & Grafana Metrics
- Expose `/metrics` in Prometheus format for latency, errors and queue length.
- Commit a Grafana dashboard JSON to the repository.
- Extend `docker-compose` with `prom/prometheus` and `grafana/grafana` services.

## B-08 Load-Test Harness (Locust)
- CI job fails if 95th percentile latency > 300 ms for `/elections` and WS lag > 1 s.
- Produce a load test report artifact using Locust.

