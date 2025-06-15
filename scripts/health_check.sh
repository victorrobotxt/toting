#!/usr/bin/env bash
set -euo pipefail

SERVICES=(anvil redis db relay)

cleanup() {
  echo "Stopping docker compose stack..."
  docker compose down -v
}
trap cleanup EXIT

echo "Starting docker compose stack..."
docker compose up -d

# Wait for health of required services
for svc in "${SERVICES[@]}"; do
  echo "Waiting for $svc to be healthy..."
  cid=$(docker compose ps -q "$svc")
  if [ -z "$cid" ]; then
    echo "Service $svc not found" >&2
    exit 1
  fi
  for i in {1..30}; do
    status=$(docker inspect --format='{{.State.Health.Status}}' "$cid" 2>/dev/null || echo unknown)
    if [ "$status" = "healthy" ]; then
      echo "$svc is healthy"
      break
    fi
    sleep 5
  done
  if [ "$status" != "healthy" ]; then
    echo "Service $svc failed to become healthy" >&2
    docker compose ps
    exit 1
  fi
done

# Check backend endpoint
echo "Checking backend /elections endpoint..."
for i in {1..30}; do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/elections || true)
  if [ "$code" = "200" ]; then
    echo "Backend responded with 200"
    break
  fi
  sleep 5
done
if [ "$code" != "200" ]; then
  echo "Backend health check failed with status $code" >&2
  exit 1
fi

# Check frontend root page
echo "Checking frontend at http://localhost:3000..."
for i in {1..30}; do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 || true)
  if [ "$code" = "200" ]; then
    echo "Frontend responded with 200"
    break
  fi
  sleep 5
done
if [ "$code" != "200" ]; then
  echo "Frontend health check failed with status $code" >&2
  exit 1
fi

check_logs() {
  svc=$1
  echo "Checking logs for $svc..."
  if docker compose logs "$svc" | grep -iE 'fatal|error|traceback'; then
    echo "Errors detected in $svc logs" >&2
    return 1
  fi
}

check_logs bundler
check_logs orchestrator

echo "All services healthy."
