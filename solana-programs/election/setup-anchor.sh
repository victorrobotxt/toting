#!/usr/bin/env bash
set -euo pipefail

# 0) Make sure we’re in this program’s dir
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

KEYPAIR=target/deploy/election_mirror-keypair.json

# 1) (Re)generate program keypair
rm -f "$KEYPAIR"
echo "🗝️  Generating new keypair at $KEYPAIR"
solana-keygen new --no-passphrase --force -o "$KEYPAIR"

# 2) Extract and show the program ID
PROGRAM_ID=$(solana-keygen pubkey "$KEYPAIR")
echo "✔️  Program ID = $PROGRAM_ID"

# 3) Write Anchor.toml pointing at localnet
cat > Anchor.toml <<EOF
[programs.localnet]
election_mirror = "$PROGRAM_ID"

[provider]
cluster = "localnet"
# use whatever your solana config wallet is
wallet = "$(solana config get | sed -n 's/Keypair Path: //')"
EOF
echo "✔️  Anchor.toml written"

# 4) Patch declare_id!() in src/lib.rs
sed -i -E "s|declare_id!\(\"[^\"]+\"\);|declare_id!(\"$PROGRAM_ID\");|g" src/lib.rs
echo "✔️  src/lib.rs updated with new program ID"

# 5) Build & test
echo "📦  Running anchor build…"
anchor build
echo "🧪  Running anchor test…"
anchor test -- --features skip-entrypoint
echo "🎉  All done!"
