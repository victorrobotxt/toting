#!/bin/bash
set -eo pipefail

# --- Pre-flight Check: Ensure running inside container ---
if [ ! -d "/app" ]; then
    echo "🛑 Error: This script must be run inside the 'anvil' Docker container." >&2
    echo "Please use the following command from your project root on your host machine:" >&2
    echo "docker-compose exec anvil /app/scripts/setup_env.sh" >&2
    exit 1
fi

# --- Pre-flight Check: Submodules ---
if [ ! -d "/app/lib/openzeppelin-contracts/contracts" ]; then
    echo "🛑 Error: Git submodules not found in /app/lib/. The Docker volume mount seems to be stale or empty." >&2
    echo "This is common on Docker Desktop for Windows/Mac." >&2
    echo "1. Run 'git submodule update --init --recursive' on your host machine." >&2
    echo "2. Run 'docker-compose down -v' to remove the old container and its volume." >&2
    echo "3. Run 'docker-compose up -d anvil' to create a fresh one." >&2
    exit 1
fi

if [ ! -f /app/.env ]; then
    echo "🛑 .env file not found inside the container at /app/.env. Please copy .env.example to .env on your host."
    exit 1
fi

export $(grep -v '^#' /app/.env | xargs)

echo "📦 Deploying contracts..."

MGR_ADDR=$(forge script script/DeployElectionManagerV2.s.sol:DeployElectionManagerV2Script --rpc-url http://localhost:8545 --broadcast --sig "run() returns (address)" | grep "ElectionManagerV2 proxy deployed to:" | awk '{print $NF}')
if [ -z "$MGR_ADDR" ]; then
    echo "🛑 Failed to deploy ElectionManagerV2."
    exit 1
fi
echo "✅ ElectionManagerV2 proxy deployed at: $MGR_ADDR"

FACTORY_ADDR=$(forge script script/DeployFactory.s.sol:DeployFactory --rpc-url http://localhost:8545 --broadcast | grep "Factory deployed at:" | awk '{print $NF}')
if [ -z "$FACTORY_ADDR" ]; then
    echo "🛑 Failed to deploy WalletFactory."
    exit 1
fi
echo "✅ WalletFactory deployed at: $FACTORY_ADDR"

ENV_FILE="/app/.env.deployed"
echo "📝 Generating environment file at $ENV_FILE"

echo "ELECTION_MANAGER=$MGR_ADDR" > $ENV_FILE
echo "NEXT_PUBLIC_ELECTION_MANAGER=$MGR_ADDR" >> $ENV_FILE
echo "NEXT_PUBLIC_WALLET_FACTORY=$FACTORY_ADDR" >> $ENV_FILE
echo "NEXT_PUBLIC_ENTRYPOINT=0x0000000000000000000000000000000000000000" >> $ENV_FILE

echo "🎉 Setup complete. You can now run 'docker-compose up'."
