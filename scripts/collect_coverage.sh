#!/usr/bin/env bash
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
COV_DIR="$ROOT/coverage"
rm -rf "$COV_DIR"
mkdir -p "$COV_DIR/node" "$COV_DIR/python"

# Forge coverage
echo "Running solidity coverage..."
# Source environment variables if .env file exists, so forge tests can find them.
if [ -f .env ]; then
    echo "Sourcing .env file for forge coverage..."
    source .env
else
    echo "Warning: .env file not found. Coverage may fail if tests require env vars."
fi
forge coverage --report lcov --report-file "$COV_DIR/forge.lcov" -vv

# Python coverage
echo "Running backend tests with coverage..."
pip install --quiet coverage pytest pytest-cov
pytest packages/backend/tests \
  --cov=packages/backend \
  --cov-report=lcov:"$COV_DIR/python/lcov.info"

# Node tests and E2E verifier
echo "Running node tests with coverage..."
# npm test already runs various JS tests. We also run the QV verifier e2e script.
npx -y c8 --reporter=lcov --report-dir="$COV_DIR/node" bash -c "npm test && node scripts/qv_verifier_e2e.js"

# Combine coverage
cat "$COV_DIR/forge.lcov" "$COV_DIR/python/lcov.info" "$COV_DIR/node/lcov.info" > "$COV_DIR/coverage.lcov"

echo "Combined coverage written to $COV_DIR/coverage.lcov"
