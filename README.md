# Toting Example
[![codecov](https://codecov.io/gh/owner/toting/branch/main/graph/badge.svg)](https://codecov.io/gh/owner/toting)
[![Documentation](https://img.shields.io/badge/docs-online-blue)](https://owner.github.io/toting/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

This repository includes example Circom circuits and minimal setup scripts. To build the circuits you need **Circom 2**.

Run compilation with:

```bash
npx -y circom2 circuits/eligibility/eligibility.circom --r1cs --wasm --sym
npx -y circom2 circuits/qv/voice_check.circom --r1cs --wasm --sym
npx -y circom2 circuits/qv/qv_tally.circom --r1cs --wasm --sym
npx -y circom2 circuits/tally/batch_tally.circom --r1cs --wasm --sym
```

Using plain `npx circom` installs the legacy Circom 1 package, which fails on `pragma circom 2.x`. Always invoke Circom 2 via the `circom2` package.

## Getting Started

See [docs/env_vars.md](docs/env_vars.md) for required environment variables and defaults.



## Developer Handbook

See [docs/handbook](docs/handbook/README.md) for instructions on running services and regenerating proofs.

Copy `.env.example` to `.env` and update the values before starting the stack. The backend refuses to run with the placeholder secrets when `USE_REAL_OAUTH=true`.

The backend exposes a simple mock OAuth login for local testing. By default
`docker-compose` starts the API with `USE_REAL_OAUTH=false`. The frontend
intercepts `/auth/initiate` and shows a **Mock Login** modal instead of
navigating to the raw HTML form. Set
`USE_REAL_OAUTH=true` to redirect to the configured `GRAO_BASE_URL` instead. The
`GRAO_REDIRECT_URI` environment variable should match your frontend callback
page (by default `http://localhost:3000/auth/callback`).

### API Endpoints

The backend exposes several REST endpoints used by the frontend:

| Method | Path | Description |
|-------|------|-------------|
| `GET` | `/auth/initiate` | Start OAuth login (returns mock form in local mode; shown via modal). |
| `GET` | `/auth/callback` | Finalize login, returns `{id_token, eligibility}`. |
| `GET` | `/elections` | List elections. |
| `POST` | `/elections` | Create a new election. |
| `PATCH` | `/elections/{id}` | Update an election status/tally. |
| `POST` | `/api/zk/eligibility` | Submit eligibility proof input. Optional `X-Curve` header selects curve. |
| `GET` | `/api/zk/eligibility/{job}` | Poll proof status. |
| `POST` | `/api/zk/voice` | Submit voice-credit proof input. |
| `POST` | `/api/zk/batch_tally` | Submit batch tally proof request. |
| `GET` | `/api/zk/voice/{job}` | Poll voice proof result. |
| `GET` | `/api/zk/batch_tally/{job}` | Poll tally proof result. |
| `WS` | `/ws/proofs/{job}` | WebSocket progress updates. |

All proof endpoints accept an optional `X-Curve: bls12-381` header to use the
BLS12-381 artifact set; BN254 is the default.

## Design Deep-Dive Videos

- [Circuits Overview](https://www.loom.com/share/circuits-demo)
- [Contracts Overview](https://www.loom.com/share/contracts-demo)
- [Backend Overview](https://www.loom.com/share/backend-demo)

## Smart Contract Audit

See [docs/audit](docs/audit/README.md) for the outline of the upcoming formal audit process.

## License

This project is licensed under the [MIT License](LICENSE).
