#!/usr/bin/env bash
# Smoke test the production session-create path: an Eat Out create, including
# the Google Places restaurant search (catches expired/broken Places API keys —
# see 2026-07-12 outage where an expired key made every create-with-location
# request 500), and a Watch create dealt from the committed movie corpus
# (#369). The sessions it creates are throwaway; Redis TTL expires them in 30
# minutes.
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-https://backend-production-4ce9.up.railway.app}"

# Create one Session from $2 and fail unless its Deck dealt at least one entry.
# The count is `restaurantCount` for every Branch — a Movie Deck too; the wire
# name outlives the kind (ADR 0007).
smoke() {
  local label="$1" body="$2" response count
  response="$(curl --silent --show-error --fail-with-body \
    -X POST "${BACKEND_URL}/api/sessions" \
    -H "Content-Type: application/json" \
    -d "$body")" || {
    echo "FAIL: ${label} session create returned an error:"
    echo "$response"
    exit 1
  }

  count="$(node -e 'console.log(JSON.parse(process.argv[1]).restaurantCount ?? 0)' "$response")"

  if [[ "$count" -lt 1 ]]; then
    echo "FAIL: ${label} session created but restaurantCount=${count} (the deal returned nothing):"
    echo "$response"
    exit 1
  fi

  echo "OK: ${label} session created with ${count} deck entries"
}

smoke "Eat Out" '{"hostName":"smoke-test","location":{"latitude":-37.8136,"longitude":144.9631},"searchRadiusMiles":5}'
smoke "Watch" '{"hostName":"smoke-test","branch":"watch","mood":{"genres":[],"decades":[]}}'
