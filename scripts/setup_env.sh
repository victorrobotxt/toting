#!/usr/bin/env bash
set -euo pipefail

OUTPUT=".env.deployed"
: > "$OUTPUT"

KEY="${ORCHESTRATOR_KEY:-${PRIVATE_KEY:-}}"
if [[ -z "$KEY" ]]; then
  echo "Missing ORCHESTRATOR_KEY/PRIVATE_KEY" >&2
  exit 1
fi

# Mask the secret in GitHub Actions logs if present
printf "::add-mask::%s\n" "$KEY" || true

echo "ORCHESTRATOR_KEY=$KEY" >> "$OUTPUT"
echo "written $OUTPUT"
