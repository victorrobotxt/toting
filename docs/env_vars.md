# Environment Variables

This document lists all environment variables needed to run the backend and frontend services.

## Backend

| Name | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `DATABASE_URL` | string | *(none)* | Connection string for Postgres. Required. |
| `CELERY_BROKER` | string | `redis://localhost:6379/0` | URL for Celery task broker. |
| `CELERY_BACKEND` | string | `redis://localhost:6379/0` | URL for Celery result backend. |
| `CELERY_TASK_ALWAYS_EAGER` | bool | `false` | Run Celery tasks synchronously for local testing. |
| `CELERY_METRICS_PORT` | int | *(unset)* | If set, expose Prometheus metrics on this port. |
| `CIRCUIT_MANIFEST` | string | `/app/circuits/manifest.json` | Path to circuit manifest with default hashes. |
| `SENTRY_DSN` | string | *(unset)* | Sentry DSN for error reporting. |
| `NEXT_PUBLIC_API_BASE` | string | `http://localhost:3000` | Allowed frontend origin for CORS. |
| `EVM_RPC` | string | `http://localhost:8545` | JSON‑RPC endpoint for the EVM chain. |
| `CHAIN_ID` | int | `31337` | Chain ID for contract interactions. |
| `ORCHESTRATOR_KEY` | string | *(none)* | Private key used by backend and orchestrator. |
| `ELECTION_MANAGER` | string | `0x0000000000000000000000000000000000000000` | Address of deployed `ElectionManager` contract. |
| `PAYMASTER` | string | `0x0000000000000000000000000000000000000000` | Verifying Paymaster address. |
| `GRAO_BASE_URL` | string | `https://demo-oauth.example` | OAuth provider base URL. |
| `GRAO_CLIENT_ID` | string | `test-client` | OAuth client ID. |
| `GRAO_CLIENT_SECRET` | string | `test-client-secret` | OAuth client secret. |
| `JWT_SECRET` | string | `dev-jwt-secret` | Secret for signing mock ID tokens. |
| `GRAO_REDIRECT_URI` | string | `http://localhost:3000/auth/callback` | OAuth redirect URI. |
| `USE_REAL_OAUTH` | bool | `false` | Use real OAuth provider instead of mock login. |
| `PROOF_QUOTA` | int | `25` | Daily proof generation limit per user. |
| `IPFS_API_URL` | string | `https://ipfs.infura.io:5001/api/v0/add` | Endpoint for pinning JSON to IPFS. |
| `IPFS_GATEWAY` | string | `https://ipfs.io/ipfs/` | Gateway URL used to fetch pinned JSON. |
| `IPFS_API_TOKEN` | string | *(unset)* | Optional bearer token for the IPFS API. |
| `EVM_MAX_RETRIES` | int | `0` | How many times the orchestrator waits for the RPC (0 = forever). |

## Frontend

| Name | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `NEXT_PUBLIC_API_BASE` | string | `http://localhost:8000` | Base URL of the backend API. |
| `NEXT_PUBLIC_BUNDLER_URL` | string | `http://localhost:3001/rpc` | RPC endpoint of the ERC‑4337 bundler. |
| `NEXT_PUBLIC_WALLET_FACTORY` | string | *(none)* | Address of the wallet factory contract. |
| `NEXT_PUBLIC_ENTRYPOINT` | string | *(none)* | EntryPoint contract address. |
| `NEXT_PUBLIC_ELECTION_MANAGER` | string | *(none)* | Address of the ElectionManager contract. |
| `NEXT_PUBLIC_PAYMASTER` | string | *(unset)* | Optional verifying paymaster address. |
| `NEXT_PUBLIC_SEPOLIA_ENTRYPOINT` | string | *(unset)* | Sepolia EntryPoint contract address. |
| `NEXT_PUBLIC_SEPOLIA_WALLET_FACTORY` | string | *(unset)* | Sepolia wallet factory contract. |
| `NEXT_PUBLIC_SEPOLIA_ELECTION_MANAGER` | string | *(unset)* | Sepolia ElectionManager contract. |
| `NEXT_PUBLIC_SEPOLIA_BUNDLER_URL` | string | *(unset)* | Bundler RPC URL for Sepolia. |

