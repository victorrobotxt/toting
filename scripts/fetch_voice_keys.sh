#!/usr/bin/env bash
set -euo pipefail

DEST_DIR="${1:-proofs}"
mkdir -p "$DEST_DIR"

ZKEY_URL="${VOICE_ZKEY_URL:-https://storage.googleapis.com/toting-proving-keys/voice_check_final.zkey}"
VKEY_URL="${VOICE_VKEY_URL:-https://storage.googleapis.com/toting-proving-keys/voice_verification_key.json}"

curl -L "$ZKEY_URL" -o "$DEST_DIR/voice_check_final.zkey"
curl -L "$VKEY_URL" -o "$DEST_DIR/voice_verification_key.json"

ls -lh "$DEST_DIR"/voice_check_final.zkey "$DEST_DIR/voice_verification_key.json"
