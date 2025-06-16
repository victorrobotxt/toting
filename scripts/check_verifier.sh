#!/usr/bin/env bash
set -euo pipefail
TMP=$(mktemp)
npx -y snarkjs zkey export solidityverifier proofs/voice_check_final.zkey "$TMP"
sed -e 's/Groth16Verifier/Verifier/' -e 's/) public view returns (bool)/) public view virtual returns (bool)/' "$TMP" > "$TMP.patched"
forge fmt "$TMP.patched" >/dev/null
if ! diff -q "$TMP.patched" contracts/Verifier.sol >/dev/null; then
  echo "Verifier.sol drift detected" >&2
  exit 1
fi
echo "verifier up-to-date"
