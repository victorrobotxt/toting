#!/usr/bin/env bash
set -euo pipefail

# 1) Start Anvil with a known mnemonic
killall anvil 2>/dev/null || true
anvil --host 0.0.0.0 \
      --port 8545 \
      -m "test test test test test test test test test test test junk" \
      --silent &
ANVIL_PID=$!
sleep 1

# 2) Funded private‑key for account[0]
PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
ADDR=0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
echo "→ Using funded account $ADDR"

# 3) Deploy factory
forge script script/DeployFactory.s.sol:DeployFactory \
  --rpc-url http://127.0.0.1:8545 \
  --private-key $PK \
  --broadcast -q

FACTORY_ADDRESS=$(jq -r '.transactions[-1].contractAddress' \
  broadcast/DeployFactory.s.sol/31337/run-latest.json)
echo "→ Factory deployed at $FACTORY_ADDRESS"

# 4) Run the smoke test
BACKEND=http://127.0.0.1:8000 \
FACTORY_ADDRESS=$FACTORY_ADDRESS \
PRIVATE_KEY=$PK \
python3 scripts/smoke_auth_to_mint.py

# 5) Tear down Anvil
kill $ANVIL_PID
