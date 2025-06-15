#!/usr/bin/env bash
set -euo pipefail

# Bring up the compose stack
trap 'docker compose down -v' EXIT

echo "Starting docker compose stack..."
docker compose up -d

SERVICES=(anvil redis db relay)

check_health() {
  local service=$1
  local cid
  cid=$(docker compose ps -q "$service")
  if [ -z "$cid" ]; then
    echo "Service $service not found"
    return 1
  fi
  echo "Waiting for $service to be healthy..."
  for i in {1..60}; do
    status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' "$cid" 2>/dev/null || echo "unknown")
    if [ "$status" = "healthy" ]; then
      echo "$service is healthy"
      return 0
    fi
    sleep 2
  done
  echo "$service failed to become healthy" >&2
  return 1
}

for svc in "${SERVICES[@]}"; do
  check_health "$svc"
done

# Verify backend endpoint
for i in {1..30}; do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/elections || true)
  if [ "$code" = "200" ]; then
    echo "Backend responded with 200"
    break
  fi
  echo "Waiting for backend..."
  sleep 2
  if [ "$i" = "30" ]; then
    echo "Backend failed to respond with 200" >&2
    exit 1
  fi
done

# Verify frontend endpoint
for i in {1..30}; do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 || true)
  if [ "$code" = "200" ]; then
    echo "Frontend responded with 200"
    break
  fi
  echo "Waiting for frontend..."
  sleep 2
  if [ "$i" = "30" ]; then
    echo "Frontend failed to respond with 200" >&2
    exit 1
  fi
done

# Check bundler and orchestrator logs for fatal errors
for svc in bundler orchestrator; do
  if docker compose logs "$svc" 2>&1 | grep -iE 'fatal|error'; then
    echo "Errors found in $svc logs" >&2
    exit 1
  fi
  echo "$svc logs look clean"
done

echo "Health check completed successfully"

