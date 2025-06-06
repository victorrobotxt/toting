#!/bin/bash
set -eo pipefail

# Ensure .env file exists
if [ ! -f .env ]; then
    echo "🛑 .env file not found. Please copy .env.example to .env"
    exit 1
fi

# Load .env variables into the shell
export $(grep -v '^#' .env | xargs)

echo "📦 Deploying contracts..."

# Deploy V2 Manager and capture its address
MGR_ADDR=$(forge script script/DeployElectionManagerV2.s.sol:DeployElectionManagerV2 --rpc-url http://localhost:8545 --broadcast --sig "run() returns (address)" | grep "proxy deployed to:" | awk '{print $NF}')
if [ -z "$MGR_ADDR" ]; then
    echo "🛑 Failed to deploy ElectionManagerV2."
    exit 1
fi
echo "✅ ElectionManagerV2 proxy deployed at: $MGR_ADDR"

# Deploy Factory and capture its address
FACTORY_ADDR=$(forge script script/DeployFactory.s.sol:DeployFactory --rpc-url http://localhost:8545 --broadcast | grep "Factory deployed at:" | awk '{print $NF}')
if [ -z "$FACTORY_ADDR" ]; then
    echo "🛑 Failed to deploy WalletFactory."
    exit 1
fi
echo "✅ WalletFactory deployed at: $FACTORY_ADDR"

# Create a unified environment file for Docker Compose
ENV_FILE=".env.deployed"
echo "📝 Generating environment file at $ENV_FILE"

# These will be used by docker-compose
echo "ELECTION_MANAGER=$MGR_ADDR" > $ENV_FILE
echo "NEXT_PUBLIC_ELECTION_MANAGER=$MGR_ADDR" >> $ENV_FILE
echo "NEXT_PUBLIC_WALLET_FACTORY=$FACTORY_ADDR" >> $ENV_FILE
# Keep a zero-address for entrypoint as per your original script
echo "NEXT_PUBLIC_ENTRYPOINT=0x0000000000000000000000000000000000000000" >> $ENV_FILE

echo "🎉 Setup complete. You can now run 'docker-compose up'."