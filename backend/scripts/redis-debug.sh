#!/usr/bin/env bash
# Debug access to Dinder session Redis.
#   ./redis-debug.sh PING                    # localhost, creds from backend/.env
#   ./redis-debug.sh --prod KEYS 'session:*' # prod via Railway proxy, creds fetched at runtime
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" = "--prod" ]; then
  shift
  # ponytail: denylist not allowlist — blocks the destructive stuff, raw redis-cli for deliberate prod writes
  case "$(printf '%s' "${1:-}" | tr '[:lower:]' '[:upper:]')" in
    FLUSHALL|FLUSHDB|DEL|UNLINK|CONFIG|SHUTDOWN|RENAME|RESTORE|MIGRATE)
      echo "refusing destructive '$1' against prod; use raw redis-cli if you really mean it" >&2
      exit 1 ;;
  esac
  URL=$(railway variables --service redis-bbxI --kv 2>/dev/null | grep '^REDIS_PUBLIC_URL=' | cut -d= -f2-)
  [ -n "$URL" ] || { echo "could not fetch REDIS_PUBLIC_URL — run 'railway login' and 'railway link' first" >&2; exit 1; }
  exec redis-cli --no-auth-warning -u "$URL" "$@"
fi

env_val() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2-; }
HOST=$(env_val REDIS_HOST) PORT=$(env_val REDIS_PORT) PASS=$(env_val REDIS_PASSWORD)
exec redis-cli --no-auth-warning -h "${HOST:-localhost}" -p "${PORT:-6379}" ${PASS:+-a "$PASS"} "$@"
