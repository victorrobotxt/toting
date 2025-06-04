# Toting Example
[![codecov](https://codecov.io/gh/owner/toting/branch/main/graph/badge.svg)](https://codecov.io/gh/owner/toting)

This repository includes example Circom circuits and minimal setup scripts. To build the circuits you need **Circom 2**.

Run compilation with:

```bash
npx -y circom2 circuits/eligibility/eligibility.circom --r1cs --wasm --sym
npx -y circom2 circuits/qv/voice_check.circom --r1cs --wasm --sym
npx -y circom2 circuits/qv/qv_tally.circom --r1cs --wasm --sym
npx -y circom2 circuits/tally/batch_tally.circom --r1cs --wasm --sym
```

Using plain `npx circom` installs the legacy Circom 1 package, which fails on `pragma circom 2.x`. Always invoke Circom 2 via the `circom2` package.



## Developer Handbook

See [docs/handbook](docs/handbook/README.md) for instructions on running services and regenerating proofs.

The backend exposes a simple mock OAuth login for local testing. By default
`docker-compose` starts the API with `USE_REAL_OAUTH=false`, serving a minimal
form at `/auth/initiate` that lets you enter an email. Set
`USE_REAL_OAUTH=true` to redirect to the configured `GRAO_BASE_URL` instead.

## Design Deep-Dive Videos

- [Circuits Overview](https://www.loom.com/share/circuits-demo)
- [Contracts Overview](https://www.loom.com/share/contracts-demo)
- [Backend Overview](https://www.loom.com/share/backend-demo)
