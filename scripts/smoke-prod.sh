#!/usr/bin/env bash
# Smoke test the production session-create path, including the Google Places
# restaurant search (catches expired/broken Places API keys — see 2026-07-12
# outage where an expired key made every create-with-location request 500).
# The session it creates is throwaway; Redis TTL expires it in 30 minutes.
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-https://backend-production-4ce9.up.railway.app}"

body='{"hostName":"smoke-test","location":{"latitude":-37.8136,"longitude":144.9631},"searchRadiusMiles":5}'

response="$(curl --silent --show-error --fail-with-body \
  -X POST "${BACKEND_URL}/api/sessions" \
  -H "Content-Type: application/json" \
  -d "$body")" || {
  echo "FAIL: session create with location returned an error:"
  echo "$response"
  exit 1
}

count="$(node -e 'console.log(JSON.parse(process.argv[1]).restaurantCount ?? 0)' "$response")"

if [[ "$count" -lt 1 ]]; then
  echo "FAIL: session created but restaurantCount=${count} (Places search returned nothing):"
  echo "$response"
  exit 1
fi

echo "OK: session created with ${count} restaurants"
