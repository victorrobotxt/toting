#!/usr/bin/env bash
set -euo pipefail

DEST_DIR="${1:-proofs}"
mkdir -p "$DEST_DIR"

ZKEY="$DEST_DIR/voice_check_final.zkey"
VKEY="$DEST_DIR/voice_verification_key.json"

if [[ -f "$ZKEY" && -f "$VKEY" ]]; then
  ls -lh "$ZKEY" "$VKEY"
  exit 0
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

npx -y circom2 circuits/qv/voice_check.circom --r1cs -o "$TMP_DIR" >/dev/null
npx -y snarkjs powersoftau new bn128 11 "$TMP_DIR/pot.ptau" -v >/dev/null
npx -y snarkjs powersoftau contribute "$TMP_DIR/pot.ptau" "$TMP_DIR/pot1.ptau" --name="first" -v -e="random" >/dev/null
npx -y snarkjs powersoftau prepare phase2 "$TMP_DIR/pot1.ptau" "$TMP_DIR/pot_final.ptau" >/dev/null
npx -y snarkjs groth16 setup "$TMP_DIR/voice_check.r1cs" "$TMP_DIR/pot_final.ptau" "$TMP_DIR/voice_0000.zkey" >/dev/null
npx -y snarkjs zkey contribute "$TMP_DIR/voice_0000.zkey" "$ZKEY" --name="first" -v -e="random" >/dev/null
npx -y snarkjs zkey export verificationkey "$ZKEY" "$VKEY" >/dev/null

ls -lh "$ZKEY" "$VKEY"
