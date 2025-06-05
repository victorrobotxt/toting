# Circuit ↔ Backend Integration PBIs

The following product backlog items (PBIs) capture upcoming circuit (“voting engine”) and backend integration work.

## I-01 Unified Circuit Artifact Registry

* Build step that compiles every `.circom` file, generating `.r1cs`, `.wasm`, and `.zkey` artifacts plus a `manifest.json` mapping circuit-hash to artifact paths.
* Copy `manifest.json` into the backend Docker image at `/app/circuits/`.
* AC: `docker compose up backend` exposes `/app/circuits/manifest.json`; CI fails if any committed circuit hash disagrees with the manifest.
* Depends on **C-04**.

## I-02 Proof-as-a-Service API

* Implement REST endpoints under `/api/zk/{circuit}` where `POST` accepts input JSON and returns `{ job_id }`, and `GET /{job_id}` returns `queued|running|done|error` plus `{ proof,pubSignals }` when done.
* Dispatch each job to a Celery worker that runs `snarkjs wtns calculate` then `snarkjs groth16 prove`.
* AC: End-to-end FastAPI test—POST eligibility input, poll until `done`, and verify the returned proof against the on-chain verifier.
* Depends on **I-01** and **B-05**.

## I-03 Input Schema Validation Layer

* Define Pydantic schemas for each circuit’s input JSON; reject unknown fields or out-of-range values before scheduling Celery tasks.
* Ensure invalid inputs return HTTP 422 immediately.
* AC: 100 % unit-test coverage for both valid and invalid inputs; invalid input yields HTTP 422 in < 2 ms.
* Depends on **I-02**.

## I-04 Proof Cache (Redis)

* Compute SHA-256 over `inputJSON || circuitHash` and store `{ proof,pubSignals }` in Redis.
* On `POST`, if cache hit, immediately respond with `status=done` and cached outputs.
* AC: Load test with 100 identical requests: only the first enqueues a Celery job; the other 99 return from cache in < 50 ms.
* Depends on **I-02**.

## I-05 Auth-Aware Proof Quotas

* Add `proof_requests` table tracking each user ID → daily proof count.
* Enforce an environment-var quota (default 25 proofs/day). Exceeding quota returns HTTP 429.
* AC: Unit test submits 26 proofs under one JWT; the 26th is rejected with HTTP 429.
* Depends on **B-02** and **I-02**.

## I-06 Eligibility Proof Generator

* Expose `/api/zk/eligibility` that accepts `{ country, dob, residency }`, constructs the witness, and returns a Groth16 proof + public signals.
* Use `eligibility.circom` (C-01) artifacts behind the scenes.
* AC: Foundry contract test calls verifier with the generated proof and does not revert; FastAPI integration test completes end-to-end.
* Depends on **C-01** and **I-02**.

## I-07 Voice-Credit Proof Generator

* Expose `/api/zk/voice` that accepts `{ credits, nonce }`, builds the witness for `voice_check.circom`, and returns proof + public signals.
* AC: Smoke test calls `/api/zk/voice`, then `QVManager.submitBallot` on a local Anvil chain succeeds without revert.
* Depends on **C-02** and **I-02**.

## I-08 Batch-Tally Proof Generator

* Expose `/api/zk/batch_tally` that pulls up to 128 encrypted ballots from Postgres, constructs the `batch_tally.circom` witness, and returns proof + public signals.
* After proof generation, automatically push calldata to `ElectionManager.tallyVotes` via `web3.py`.
* AC: CI job spins up Anvil, submits 128 ballots, calls the endpoint, and verifies that `tallyVotes` is mined successfully within 60 s.
* Depends on **C-03** and **I-02**.

## I-09 Proof Progress WebSocket

* Implement `/ws/proofs/{job_id}` which streams status updates `{ state:"queued"|"running", progress:number }` by subscribing to Celery progress events every 2 s.
* AC: Frontend proof UI shows a live progress bar from 0 % → 100 % before the HTTP `done` response; reconnecting resumes correctly.
* Depends on **B-04** and **I-02**.

## I-10 Circuit Versioning & Migration

* Create `circuits` table tracking each row’s `circuit_hash`, `ptau_version`, and `zkey_version`.
* Support blue/green deployment: generate new artifacts, bump version, and let new Celery workers use the new hash while the API still serves old proofs until flip.
* AC: Integration test demonstrates generating proofs against both v1 and v2 in parallel with zero failed proof requests during the switchover.
* Depends on **I-01**.

## I-11 Detached Proof Audit Trail

* After a proof is accepted on‐chain, log `{ circuit_hash, input_hash, proof_root, timestamp }` into an append-only `proof_audit` table and feed a SHA-chain into the Audit-Trail logger (B-06).
* AC: CLI `backend-admin audit-proof {tx_hash}` outputs the row and verifies that the stored `proof_root` matches the on‐chain calldata root.
* Depends on **B-06** and **I-02**.

## I-12 gRPC Wrapper for Proof API

* Provide a `ProofService` gRPC with methods `Generate(circuit, inputJSON) → job_id` and `Status(job_id) → { state, proof, pubSignals }`.
* Reuse the same Celery backend and proof-cache logic as REST.
* AC: `grpc-health-probe` passes; a Go client sample can successfully invoke eligibility proof generation.
* Depends on **B-16** and **I-02**.

## I-13 Multicurve Build Matrix

* Extend CI to compile circuits under both BN254 and BLS12-381.
* `manifest.json` includes per-circuit curve info; `ProofService`/REST honor an `x-curve:bls12-381` header to select artifacts.
* AC: Matrix build completes in ≤ 15 min; backend integration tests generate and verify proofs on both curves; corresponding verifier contracts deploy per curve in Foundry tests.
* Depends on **C-11** and **I-01**.

## I-14 Frontend Proof Worker Integration

* Update FE PBI F-07: when the Web-Worker fallback is disabled, call `/api/zk/*` for final proof instead of running pure-WASM proof. Show live WebSocket progress and handle HTTP 429.
* AC: Cypress e2e test creates a voice-credit proof via backend and completes a vote on a local testnet without errors.
* Depends on **I-02** and **F-07**.

## I-15 End-to-End E2E Test Workflow

* GitHub Action that starts the full stack (Anvil, Postgres, backend, frontend), then runs a script to:

  1. Create an election via REST
  2. FE logs in, calls eligibility & voice proofs via backend
  3. Cast a vote
  4. Submit batch-tally proof via `/api/zk/batch_tally`
  5. Verify on-chain tally and Solana bridge event
* AC: Workflow passes on `main`; any failure at an integration point causes failure.
* Depends on **I-06**, **I-07**, **I-08**, and **SC-01**.
