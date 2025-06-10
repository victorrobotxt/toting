# Developer Handbook

This guide covers running services, debugging contracts and regenerating ZK proofs.

## Table of Contents
- [Running Services](#running-services)
- [Running the Orchestrator](#running-the-orchestrator)
- [Debugging Contracts](#debugging-contracts)
- [Regenerating Proofs](#regenerating-proofs)

## Running Services

Use Docker Compose to launch the full stack (frontend, backend,
proof orchestrator and relay):

```bash
docker-compose up -d
```

The orchestrator service connects to an EVM JSON‑RPC endpoint. When using
`docker-compose` an instance of **anvil** starts automatically and the
orchestrator will retry connecting for up to 20 attempts. Set `EVM_RPC` to a
custom URL or use `EVM_MAX_RETRIES=0` to wait indefinitely.

The backend uses Celery with Redis for proof generation. The Compose
configuration sets `EVM_RPC` along with `CELERY_BROKER` and
`CELERY_BACKEND` so it can talk to the `anvil` and `redis` services. Both the
API and worker processes also require a `DATABASE_URL` pointing to Postgres.
Compose sets this automatically; when running the backend on its own, provide
these variables manually.

When running the frontend container, set `NEXT_PUBLIC_API_BASE` to
`http://backend:8000` so the web UI can reach the API service within the
Compose network.

The frontend will be available on `http://localhost:3000`, the API on
`http://localhost:8000` and Postgres on `localhost:5432`.
## Configuration

See [../env_vars.md](../env_vars.md) for a list of required environment variables.


## Database Migrations

The backend uses [Alembic](https://alembic.sqlalchemy.org/) for managing
schema changes. Migration scripts live under `packages/backend/migrations`.
Ensure `DATABASE_URL` is set to your Postgres instance and run:

```bash
alembic revision -m "<message>"
```

Apply all pending migrations with:

```bash
alembic upgrade head
```

## Running the Orchestrator

The orchestrator watches the `ElectionManager` contract and submits a tally once
voting ends. Export the following variables before running it:

```bash
export ELECTION_MANAGER=<deployed address>
export ORCHESTRATOR_KEY=<private key>
export EVM_RPC=http://127.0.0.1:8545  # or your node
```

Ensure `out/ElectionManagerV2.sol/ElectionManagerV2.json` and
`artifacts/manifest.json` exist, then execute:

```bash
python services/orchestrator/main.py
```

The script waits for `ElectionCreated(id=0)`, blocks until the election ends and
generates a Groth16 proof for `qv_tally`. On success it calls `tallyVotes` with
the resulting calldata.

### Common Errors

- **ABI file not found** – compile contracts so the JSON artifact exists in
  `out/`.
- **Manifest file not found** – run the build to create `artifacts/manifest.json`.
- **EVM RPC not reachable** – check the `EVM_RPC` URL or network connectivity.

### Generating Tally Proofs Manually

To run the proof steps yourself:

```bash
snarkjs wtns calculate <qv_tally.wasm> tally_input.json tally.wtns
snarkjs groth16 prove <qv_tally.zkey> tally.wtns proof.json public.json
```

Use the resulting calldata with `tallyVotes` if submitting manually.

## Debugging Contracts

Contracts are written using Foundry. Deploy scripts live in `script/`.
To debug a contract:

```bash
forge test -vvv
```

Individual scripts can be run with:

```bash
forge script script/DeployFactory.s.sol --fork-url $RPC_URL --broadcast
```

## Regenerating Proofs

Circuits are stored under `circuits/`. Run the following to rebuild proofs:

```bash
npx -y circom2 circuits/eligibility/eligibility.circom --r1cs --wasm --sym
npx -y circom2 circuits/qv/voice_check.circom --r1cs --wasm --sym
npx -y circom2 circuits/qv/qv_tally.circom --r1cs --wasm --sym
npx -y circom2 circuits/tally/batch_tally.circom --r1cs --wasm --sym
```

Generated artifacts are written to the `out/` directory.

## Database Migrations

The backend uses Alembic for schema migrations. Create a new migration
automatically from the current models with:

```bash
alembic revision --autogenerate -m "message"
```

Apply migrations to the database with:

```bash
alembic upgrade head
```
