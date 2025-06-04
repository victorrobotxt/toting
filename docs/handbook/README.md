# Developer Handbook

This guide covers running services, debugging contracts and regenerating ZK proofs.

## Running Services

Use Docker Compose to launch all backend services:

```bash
docker-compose up -d
```

The API will be available on `http://localhost:3000` and Postgres on `localhost:5432`.

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
```

Generated artifacts are written to the `out/` directory.
