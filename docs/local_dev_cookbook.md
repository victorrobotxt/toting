# Local-Dev Cookbook

## Quickstart

```bash
git clone <repo>
cd toting
# Deploy contracts and write a local env file
forge script script/DeployFactory.s.sol:DeployFactory \
  --rpc-url http://localhost:8545 \
  --private-key <key> --broadcast
forge script script/DeployElectionManager.s.sol:DeployElectionManager \
  --rpc-url http://localhost:8545 \
  --private-key <key> --broadcast
python3 scripts/export_frontend_env.py > packages/frontend/.env.local
# Build images and start services
docker-compose up -d
# wait 60 s
open http://localhost:3000
```

Docker builds rely on `.dockerignore` to keep contexts small. If you add large directories make sure they're excluded to avoid build failures.
