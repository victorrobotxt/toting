#!/usr/bin/env bash
# scan-trivy.sh – Scan a container image with Trivy and list the exact files that are vulnerable

set -euo pipefail

IMAGE="${1:-toting-orchestrator}"
REPORT="trivy-${IMAGE//[\/:]/_}-$(date +%F).json"

# ---------- dependency checks ----------
command -v trivy >/dev/null 2>&1 || {
  echo "❌ Trivy not found. Install it first: https://trivy.dev/installation" >&2
  exit 1
}

if ! command -v jq >/dev/null 2>&1; then
  echo "🔧 jq not present – installing..."
  sudo apt-get update -qq
  sudo apt-get install -y jq
fi
# --------------------------------------

echo "▶ Scanning $IMAGE …"
trivy image --quiet --format json -o "$REPORT" "$IMAGE"

echo
echo "✦ Vulnerable files (Severity ▸ Package ▸ Path ▸ Installed ▸ CVE)"
jq -r '
  .Results[]
  | select(.Vulnerabilities != null)
  | .Vulnerabilities[]
  | "\(.Severity)\t\(.PkgName)\t\(.PkgPath)\t\(.InstalledVersion)\t\(.VulnerabilityID)"
' "$REPORT" | column -t -s $'\t' || true

# ---------- exit code handling ----------
HIGH_CRIT_COUNT=$(jq '[.Results[].Vulnerabilities[]? | select(.Severity=="CRITICAL" or .Severity=="HIGH")] | length' "$REPORT")
if (( HIGH_CRIT_COUNT > 0 )); then
  echo
  echo "❗ Found $HIGH_CRIT_COUNT CRITICAL/HIGH vulnerabilities – exiting 1"
  exit 1
fi

echo
echo "✅ No CRITICAL/HIGH vulnerabilities found."
exit 0
