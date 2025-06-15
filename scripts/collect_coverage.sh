#!/usr/bin/env bash
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
COV_DIR="$ROOT/coverage"
rm -rf "$COV_DIR"
mkdir -p "$COV_DIR/node" "$COV_DIR/python"

# Forge coverage
echo "Running solidity coverage..."
# Source environment variables if .env file exists, so forge tests can find them.
# --- FIX: Create .env from example if it does not exist ---
if [ ! -f .env ]; then
    echo "Warning: .env file not found. Creating from .env.example for coverage run."
    cp .env.example .env
fi
source .env

# Use a dedicated Foundry profile with optimizations disabled to reduce
# memory usage during coverage runs.
export FOUNDRY_PROFILE=coverage

# The Forge coverage command can consume a significant amount of memory on
# larger projects. To keep the memory footprint manageable we run coverage
# separately for each test file and concatenate the resulting LCOV reports.
:> "$COV_DIR/forge.lcov"
for test_file in $(find test -name '*.t.sol'); do
    echo "\n--- Running coverage for $test_file ---"
    forge coverage --ir-minimum \
        --match-path "$test_file" \
        --report lcov --report-file "$COV_DIR/tmp.lcov" -vv
    cat "$COV_DIR/tmp.lcov" >> "$COV_DIR/forge.lcov"
    forge clean >/dev/null
done

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
