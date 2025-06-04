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

## B-09 Admin Dashboard & Role-Based Access
- Secure admin-only HTTP interface under `/admin/*`.
- Users table stores email and role.
- Middleware checks the `admin` claim in JWTs; non-admins receive HTTP 403.
- Endpoints to manage users and read system metrics:
  - `GET /admin/users` lists users and roles.
  - `POST /admin/users` creates a user with role `admin` or `viewer`.
  - `PUT /admin/users/{id}` changes a user role.
  - `DELETE /admin/users/{id}` removes a user.
  - `GET /admin/metrics` shows request rate and queue stats.
- Swagger groups these routes under an "Admin operations" tag.
- Unit tests cover authorization and error cases.

## B-10 Email & SMS Notification Service
- Event hooks publish notifications for new elections, closing windows and final tallies.
- Celery worker sends templated email via SendGrid and optional SMS via Twilio.
- `GET /notifications/status/{job_id}` reports `{queued|sent|failed}` with up to three retries.
- Notifications table tracks payloads, attempts and errors.
- Integration tests mock the mail and SMS providers.

## B-11 GraphQL Proxy Layer
- `/graphql` endpoint wraps existing REST APIs.
- Supports queries for elections, users and metrics plus mutations to create or delete users.
- Schema validation rejects unknown fields; playground disabled in production.
- Implement with Ariadne or Strawberry and generate type definitions.
- Unit tests target resolver functions with 90% coverage.

## B-12 Backend CLI for Admins (Typer)
- Command `backend-admin` provides subcommands:
  - `healthcheck` to ping Postgres, Redis and RabbitMQ.
  - `list-users --role=admin` to print users with a given role.
  - `migrate` runs Alembic migrations.
  - `seed-demo` inserts demo data.
- Returns exit code 0 on success and includes README examples.
- Implement using Typer and SQLAlchemy Core with unit tests for each command.

## B-13 Zero-Knowledge Proof API
- `/api/zk/{circuit}` `POST` accepts JSON, returns proof + pubSignals.
- Runs in Celery worker with concurrency = 2 × CPU.
- Proofs cached in Redis keyed by input SHA-256.

## B-14 EVM Event Indexer
- Async task reading ElectionManager logs, upserts Postgres, broadcasts WebSocket.

## B-15 Rate-Limit Bypass for Internal IPs
- CIDR whitelist via env var.

## B-16 gRPC Proof Service
- gRPC wrapper around `/api/zk/*` for micro-service internal calls.
- Proto definitions and Python server implementation.
- Depends on **C-06**.

## B-17 Streaming Blocks Listener
- Async generator that yields new block and remaining time.
- Replaces current polling; lag on Anvil must be ≤ 1 s.
- Depends on **SC-04**.

## B-18 OAuth2 Token Cache Revocation
- Store JTI → revoked boolean respecting `exp` and `nbf` claims.
- Flush revoked entries via nightly cron.
- 100 % unit test coverage.
- Depends on **B-01**.

## B-19 REST→GraphQL Deprecation Layer
- Add deprecation headers and metrics to REST endpoints.
- REST calls must log a warning after hitting `/elections`.
- Depends on **B-11**.

## B-20 Vault-Based Secrets
- Swap environment secrets for HashiCorp Vault.
- GitHub Actions inject the token.
- Ensure zero secrets appear in logs.
- No dependencies.

## B-21 OpenID → Verifiable Credentials
- Replace dummy JWT with EU eIDAS Verifiable Credential.
- `python-jose` verifies the JWS signature.
- Option for a mock credential without connecting to eIDAS.
- AC: smoke test signs and verifies a real VC.
- Depends on **B-01**.

## B-22 OAuth PKCE & mTLS
- Add S256 code challenge parameter to the OAuth flow.
- Optional mTLS on the token endpoint.
- Integration test using mitm-proxy.
- Depends on **B-01**.

## B-23 Hierarchical RBAC
- Roles: viewer → editor → admin.
- Implement using FastAPI dependency injection.
- Unit tests cover 100% of RBAC code.
- Depends on **B-09**.

## B-24 Off-chain Voting Simulation
- `/simulate` returns gas+fee and expected tally.
- Runs as a Celery job.
- Result must be within ≤ 2% diff vs on-chain test.
- Depends on **C-03**.

## B-25 Live Metrics WebSocket
- `/ws/metrics` pushes Prometheus counters for FE devtools overlay.
- Depends on **B-07**.

## B-26 REST Deprecation Proxy
- Returns HTTP 299 Deprecated header with link to GraphQL.
- Middleware test verifies the header.
- Depends on **B-19**.

## B-27 Pydantic v2 Migration
- Drop v1 compatibility.
- Benchmark shows ≥ 10% performance gain.
- No dependencies.
