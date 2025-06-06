#!/bin/bash
set -eo pipefail

# --- Pre-flight Check ---
if [ ! -d "/app/lib/openzeppelin-contracts/contracts" ]; then
    echo "🛑 Error: OpenZeppelin contracts not found in /app/lib/."
    echo "This usually means the Docker volume mount is incorrect or you forgot a step."
    echo "Please run 'git submodule update --init --recursive' on your host machine from the project root,"
    echo "then restart the 'anvil' container with 'docker-compose down -v && docker-compose up -d --force-recreate anvil'."
    exit 1
fi

if [ ! -f /app/.env ]; then
    echo "🛑 .env file not found inside the container at /app/.env. Please copy .env.example to .env on your host."
    exit 1
fi

export $(grep -v '^#' /app/.env | xargs)

echo "📦 Deploying contracts..."

# FIX: Removed the redundant --root /app flag and use relative paths.
# The working directory is already /app, so forge will find everything correctly.
MGR_ADDR=$(forge script script/DeployElectionManagerV2.s.sol:DeployElectionManagerV2Script --rpc-url http://localhost:8545 --broadcast --sig "run() returns (address)" | grep "proxy deployed to:" | awk '{print $NF}')
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
