#!/bin/bash
# Exit immediately if a command exits with a non-zero status.
# Treat unset variables as an error.
# The `pipefail` option ensures that a pipeline's return status is the value
# of the last command to exit with a non-zero status.
set -euo pipefail

# allow overriding the root directory (defaults to /app)
APP_ROOT="${APP_ROOT:-/app}"

# Determine network from first argument or default to "anvil"
NETWORK_NAME="${1:-anvil}"
CONFIG_FILE="${APP_ROOT}/config/${NETWORK_NAME}.json"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "🛑 Unknown network config: $NETWORK_NAME" >&2
    exit 1
fi

RPC_URL=$(jq -r '.rpcUrl' "$CONFIG_FILE")
CHAIN_ID=$(jq -r '.chainId' "$CONFIG_FILE")
ENTRYPOINT_PRE=$(jq -r '.entryPoint // empty' "$CONFIG_FILE")
MGR_PRE=$(jq -r '.electionManager // empty' "$CONFIG_FILE")
FACTORY_PRE=$(jq -r '.walletFactory // empty' "$CONFIG_FILE")
BUNDLER_URL=$(jq -r '.bundlerUrl // "http://localhost:3001/rpc"' "$CONFIG_FILE")

# --- Pre-flight Check: Ensure running inside container ---
if [ ! -d "${APP_ROOT}" ] || [ ! -f "${APP_ROOT}/foundry.toml" ]; then
    echo "🛑 Error: This script must be run from a Docker container with the project root mounted at ${APP_ROOT}." >&2
    exit 1
fi

# --- THIS IS THE FIX: Clean up previous builds to prevent using stale artifacts ---
echo "🧹 Cleaning up previous Foundry build artifacts and cache..."
forge clean

# --- Pre-flight Check: Submodules ---
if [ ! -f "${APP_ROOT}/lib/account-abstraction/contracts/core/EntryPoint.sol" ]; then
    echo "🛑 Error: Git submodules not found in ${APP_ROOT}/lib/." >&2
    # ... (rest of error message)
    exit 1
fi

if [ ! -f ${APP_ROOT}/.env ]; then
    echo "🛑 .env file not found. Please copy .env.example to .env on your host."
    exit 1
fi

# Load environment variables from .env file
export $(grep -v '^#' ${APP_ROOT}/.env | xargs)

# --- Generate Solana Bridge Key if not present ---
if [ "${SOLANA_BRIDGE_SK}" == "[]" ]; then
    echo "🔑 Solana bridge key not found, generating a new one..."

    # figure out where npm put globals
    GLOBAL_NODE_MODULES=$(npm root -g)

    # use that for require()
    NEW_SK=$(
    NODE_PATH="$GLOBAL_NODE_MODULES" \
    node -e "console.log(JSON.stringify(Array.from(require('@solana/web3.js').Keypair.generate().secretKey)))"
    )
    
    # Use sed to update the .env file in-place. The `|` is used as a separator to avoid issues with `/` in paths.
    sed -i "s|^SOLANA_BRIDGE_SK=\\[\\]|SOLANA_BRIDGE_SK=${NEW_SK}|" ${APP_ROOT}/.env
    echo "✅ New Solana bridge key generated and saved to .env"
    # Re-export the new value for the current script session
    export SOLANA_BRIDGE_SK="$NEW_SK"
fi

# RPC_URL was loaded from the network config above

# --- Wait for Anvil to be ready ---
echo "⏳ Waiting for RPC at $RPC_URL..."
retries=0
max_retries=60
until cast block-number --rpc-url "$RPC_URL" > /dev/null 2>&1; do
    retries=$((retries+1))
    if [ "$retries" -ge "$max_retries" ]; then
        echo "🛑 RPC not ready after $max_retries seconds. Exiting."
        exit 1
    fi
    sleep 1
done
echo "✅ RPC is ready for $NETWORK_NAME."

# --- Patch the incorrect import path in the account-abstraction submodule ---
echo "🩹 Patching import path in ${APP_ROOT}/lib/account-abstraction/contracts/core/EntryPoint.sol..."
ENTRYPOINT_SOL="${APP_ROOT}/lib/account-abstraction/contracts/core/EntryPoint.sol"
if [ -f "$ENTRYPOINT_SOL" ]; then
    sed -i 's|@openzeppelin/contracts/utils/ReentrancyGuard.sol|@openzeppelin/contracts/security/ReentrancyGuard.sol|g' "$ENTRYPOINT_SOL"
    echo "✅ Import path patched."
else
    echo "⚠️  Warning: $ENTRYPOINT_SOL not found, skipping patch."
fi


echo "📦 Deploying contracts..."

# If a previous deployment file exists, check whether those contracts still
# exist on chain. If they do, reuse them instead of deploying again. This keeps
# the addresses stable across repeated runs and prevents the frontend from using
# stale values.
DEPLOYED_ENV_FILE="${APP_ROOT}/.env.deployed"
if [ -n "$ENTRYPOINT_PRE" ]; then ENTRYPOINT_ADDR="$ENTRYPOINT_PRE"; fi
if [ -n "$MGR_PRE" ]; then MGR_ADDR="$MGR_PRE"; fi
if [ -n "$FACTORY_PRE" ]; then FACTORY_ADDR="$FACTORY_PRE"; fi
if [ -f "$DEPLOYED_ENV_FILE" ]; then
    # shellcheck disable=SC1090
    source "$DEPLOYED_ENV_FILE"
    EXISTING_ENTRYPOINT_ADDR="$NEXT_PUBLIC_ENTRYPOINT"
    EXISTING_MGR_ADDR="$NEXT_PUBLIC_ELECTION_MANAGER"
    EXISTING_FACTORY_ADDR="$NEXT_PUBLIC_WALLET_FACTORY"
    EXISTING_PAYMASTER_ADDR="${PAYMASTER:-0x0}" 

    CODE_ENTRY=$(cast code --rpc-url "$RPC_URL" "$EXISTING_ENTRYPOINT_ADDR" 2>/dev/null || echo "0x")
    CODE_MGR=$(cast code --rpc-url "$RPC_URL" "$EXISTING_MGR_ADDR" 2>/dev/null || echo "0x")
    CODE_FACTORY=$(cast code --rpc-url "$RPC_URL" "$EXISTING_FACTORY_ADDR" 2>/dev/null || echo "0x")
    CODE_PAYMASTER=$(cast code --rpc-url "$RPC_URL" "$EXISTING_PAYMASTER_ADDR" 2>/dev/null || echo "0x")

    if [ "$CODE_ENTRY" != "0x" ] && [ "$CODE_MGR" != "0x" ] && [ "$CODE_FACTORY" != "0x" ] && [ "$CODE_PAYMASTER" != "0x" ]; then
        echo "♻️  Reusing existing deployed contracts from $DEPLOYED_ENV_FILE"
        ENTRYPOINT_ADDR="$EXISTING_ENTRYPOINT_ADDR"
        MGR_ADDR="$EXISTING_MGR_ADDR"
        FACTORY_ADDR="$EXISTING_FACTORY_ADDR"
        PAYMASTER_ADDR="$EXISTING_PAYMASTER_ADDR"
    fi
fi

if [ -z "${ENTRYPOINT_ADDR:-}" ]; then
    # --- Deploy EntryPoint contract ---
    echo "Deploying EntryPoint..."
    ENTRYPOINT_ADDR=$(forge script script/DeployEntryPoint.s.sol:DeployEntryPoint --rpc-url "$RPC_URL" --broadcast --sig "run() returns (address)" | grep "EntryPoint deployed at:" | awk '{print $NF}')
    if [ -z "$ENTRYPOINT_ADDR" ]; then
        echo "🛑 Failed to deploy EntryPoint."
        exit 1
    fi
    echo "Verifying EntryPoint deployment..."
    CODE=$(cast code --rpc-url "$RPC_URL" "$ENTRYPOINT_ADDR")
    if [ "$CODE" == "0x" ]; then
        echo "🛑 Verification failed: No code at EntryPoint address $ENTRYPOINT_ADDR"
        exit 1
    fi
    echo "✅ EntryPoint code verified."
    echo "✅ EntryPoint deployed at: $ENTRYPOINT_ADDR"

    # --- Deploy ElectionManagerV2 proxy ---
    MGR_ADDR=$(forge script script/DeployElectionManagerV2.s.sol:DeployElectionManagerV2Script --rpc-url "$RPC_URL" --broadcast --sig "run() returns (address)" | grep "ElectionManagerV2 proxy deployed to:" | awk '{print $NF}')
    if [ -z "$MGR_ADDR" ]; then
        echo "🛑 Failed to deploy ElectionManagerV2."
        exit 1
    fi
    echo "Verifying ElectionManager deployment..."
    CODE=$(cast code --rpc-url "$RPC_URL" "$MGR_ADDR")
    if [ "$CODE" == "0x" ]; then
        echo "🛑 Verification failed: No code at ElectionManager address $MGR_ADDR"
        exit 1
    fi
    echo "✅ ElectionManager code verified."
    echo "✅ ElectionManagerV2 proxy deployed at: $MGR_ADDR"

    # --- Deploy WalletFactory ---
    echo "Deploying WalletFactory..."
    FACTORY_ADDR=$(ENTRYPOINT_ADDRESS=$ENTRYPOINT_ADDR forge script script/DeployFactory.s.sol:DeployFactory --rpc-url "$RPC_URL" --broadcast | grep "Factory deployed at:" | awk '{print $NF}')
    if [ -z "$FACTORY_ADDR" ]; then
        echo "🛑 Failed to deploy WalletFactory."
        exit 1
    fi
    echo "Verifying WalletFactory deployment..."
    CODE=$(cast code --rpc-url "$RPC_URL" "$FACTORY_ADDR")
    if [ "$CODE" == "0x" ]; then
        echo "🛑 Verification failed: No code at WalletFactory address $FACTORY_ADDR"
        exit 1
    fi
    echo "✅ WalletFactory code verified."
    echo "✅ WalletFactory deployed at: $FACTORY_ADDR"

    # --- Deploy VerifyingPaymaster ---
    echo "Deploying VerifyingPaymaster..."
    PAYMASTER_ADDR=$(ENTRYPOINT_ADDRESS=$ENTRYPOINT_ADDR forge script script/DeployPaymaster.s.sol:DeployPaymaster --rpc-url "$RPC_URL" --broadcast | grep "VerifyingPaymaster deployed at:" | awk '{print $NF}')
    if [ -z "$PAYMASTER_ADDR" ]; then
        echo "🛑 Failed to deploy VerifyingPaymaster."
        exit 1
    fi
    echo "Verifying Paymaster deployment..."
    CODE=$(cast code --rpc-url "$RPC_URL" "$PAYMASTER_ADDR")
    if [ "$CODE" == "0x" ]; then
        echo "🛑 Verification failed: No code at Paymaster address $PAYMASTER_ADDR"
        exit 1
    fi
    echo "✅ Paymaster code verified."
    echo "✅ VerifyingPaymaster deployed at: $PAYMASTER_ADDR"

    # Fund the Paymaster with stake and deposit
    cast send --private-key $ORCHESTRATOR_KEY --rpc-url "$RPC_URL" "$PAYMASTER_ADDR" "addStake(uint32)" 1 --value 2ether >/dev/null
    cast send --private-key $ORCHESTRATOR_KEY --rpc-url "$RPC_URL" "$ENTRYPOINT_ADDR" "depositTo(address)" "$PAYMASTER_ADDR" --value 1ether >/dev/null
else
    echo "✅ All contracts already deployed. Skipping deployment."
    PAYMASTER_ADDR="${PAYMASTER:-}"
fi

# --- Generate .env.deployed file ---
DEPLOYED_ENV_FILE="${APP_ROOT}/.env.deployed"
echo "📝 Generating environment file at $DEPLOYED_ENV_FILE"

{ 
    echo "ELECTION_MANAGER=$MGR_ADDR"
    echo "NEXT_PUBLIC_ELECTION_MANAGER=$MGR_ADDR"
    echo "NEXT_PUBLIC_WALLET_FACTORY=$FACTORY_ADDR"
    echo "NEXT_PUBLIC_ENTRYPOINT=$ENTRYPOINT_ADDR"
    echo "PAYMASTER=$PAYMASTER_ADDR"
    echo "NEXT_PUBLIC_PAYMASTER=$PAYMASTER_ADDR"
    echo "SOLANA_BRIDGE_SK=${SOLANA_BRIDGE_SK}"
} > "$DEPLOYED_ENV_FILE"
echo "✅ .env.deployed created."

# --- Append to main .env file (for manual forge/foundry commands) ---
MAIN_ENV_FILE="${APP_ROOT}/.env"
echo "📝 Appending deployed addresses to $MAIN_ENV_FILE for forge commands..."
# First, remove old deployed addresses from .env to prevent duplicates on restart
sed -i '/^ELECTION_MANAGER=/d' "$MAIN_ENV_FILE"
sed -i '/^NEXT_PUBLIC_ELECTION_MANAGER=/d' "$MAIN_ENV_FILE"
sed -i '/^NEXT_PUBLIC_WALLET_FACTORY=/d' "$MAIN_ENV_FILE"
sed -i '/^NEXT_PUBLIC_ENTRYPOINT=/d' "$MAIN_ENV_FILE"
sed -i '/^PAYMASTER=/d' "$MAIN_ENV_FILE"
sed -i '/^NEXT_PUBLIC_PAYMASTER=/d' "$MAIN_ENV_FILE"
sed -i '/^SOLANA_BRIDGE_SK=/d' "$MAIN_ENV_FILE"
cat "$DEPLOYED_ENV_FILE" >> "$MAIN_ENV_FILE"

# --- Generate bundler.config.json file ---
BUNDLER_CONFIG_FILE="${APP_ROOT}/bundler.config.json"
echo "📝 Generating bundler config file at $BUNDLER_CONFIG_FILE"
BENEFICIARY_ADDR=$(cast wallet address --private-key $ORCHESTRATOR_KEY)


cat > "$BUNDLER_CONFIG_FILE" << EOL
{
  "port": "3001",
  "entryPoint": "$ENTRYPOINT_ADDR",
  "network": "$RPC_URL",
  "beneficiary": "$BENEFICIARY_ADDR",
  "mnemonic": "/mnt/mnemonic.txt",
  "gasFactor": "1.5",
  "minBalance": "0",
  "maxBundleGas": 15000000,
  "minStake": "0",
  "minUnstakeDelay": 0,
  "autoBundleInterval": 5000,
  "autoBundleMempoolSize": 100
}
EOL
echo "✅ Bundler config created."

# --- Generate frontend's local environment file ---
FRONTEND_LOCAL_ENV_FILE="${APP_ROOT}/packages/frontend/.env.local"
echo "📝 Generating/updating frontend local environment file at $FRONTEND_LOCAL_ENV_FILE for hot-reloading..."

{
    echo "# This file is auto-generated by setup_env.sh for local development."
    echo "# Do not commit this file to version control."
    echo "NEXT_PUBLIC_API_BASE=http://localhost:8000"
    echo "NEXT_PUBLIC_BUNDLER_URL=$BUNDLER_URL"
    echo "NEXT_PUBLIC_ELECTION_MANAGER=$MGR_ADDR"
    echo "NEXT_PUBLIC_WALLET_FACTORY=$FACTORY_ADDR"
    echo "NEXT_PUBLIC_ENTRYPOINT=$ENTRYPOINT_ADDR"
    echo "NEXT_PUBLIC_PAYMASTER=$PAYMASTER_ADDR"
} > "$FRONTEND_LOCAL_ENV_FILE"
echo "✅ Frontend .env.local created."


# --- Install frontend dependencies ---
echo "📦 Installing frontend dependencies..."
cd ${APP_ROOT}/packages/frontend
yarn install
cd - >/dev/null

echo "🎉 Setup complete. You can now run other services."
