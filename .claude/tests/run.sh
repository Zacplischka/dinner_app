#!/usr/bin/env bash
# Live tests for backend/scripts/redis-debug.sh: production refusals, then optional live PINGs.
# Run from anywhere: bash .claude/tests/run.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ok   - $1"; }
fail() { FAIL=$((FAIL+1)); echo "  FAIL - $1"; }

echo "redis-debug.sh:"
RD=backend/scripts/redis-debug.sh
OUT=$("$RD" --prod DEL foo 2>&1) && fail "prod DEL was not refused" || { echo "$OUT" | grep -q refusing && ok "prod DEL refused" || fail "prod DEL failed for wrong reason: $OUT"; }
OUT=$("$RD" --prod flushall 2>&1) && fail "prod flushall was not refused" || { echo "$OUT" | grep -q refusing && ok "prod flushall (lowercase) refused" || fail "prod flushall failed for wrong reason: $OUT"; }
OUT=$("$RD" --prod EVAL "return redis.call('flushall')" 0 2>&1) && fail "prod EVAL was not refused" || { echo "$OUT" | grep -q refusing && ok "prod EVAL refused" || fail "prod EVAL failed for wrong reason: $OUT"; }
OUT=$("$RD" --prod 2>&1) && fail "bare --prod interactive session was not refused" || { echo "$OUT" | grep -q interactive && ok "bare --prod (interactive) refused" || fail "bare --prod failed for wrong reason: $OUT"; }

if redis-cli -h localhost -p 6379 PING >/dev/null 2>&1; then
  [ "$("$RD" PING)" = "PONG" ] && ok "localhost PING via .env creds" || fail "localhost PING failed"
else
  echo "  skip - localhost redis not running (docker run -d -p 6379:6379 redis:7-alpine)"
fi

OUT=$("$RD" --prod PING 2>/dev/null)
if [ "$OUT" = "PONG" ]; then ok "prod PING via Railway proxy"
else echo "  skip - prod PING unavailable (railway login/link?)"; fi

echo
echo "$PASS passed, $FAIL failed"
exit $((FAIL > 0))
