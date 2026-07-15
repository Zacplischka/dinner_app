#!/usr/bin/env bash
# Live tests for the .claude/ automations: prettier PostToolUse hook + redis-debug.sh.
# Run from anywhere: bash .claude/tests/run.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export CLAUDE_PROJECT_DIR="$ROOT"   # hooks reference it; Claude Code sets it at runtime
TMP="$ROOT/.claude/tests/tmp"
rm -rf "$TMP" && mkdir -p "$TMP/dist"
trap 'rm -rf "$TMP"' EXIT

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ok   - $1"; }
fail() { FAIL=$((FAIL+1)); echo "  FAIL - $1"; }

# The deployed hook command, straight from settings.json — test what ships, not a copy.
HOOK_CMD=$(python3 -c "
import json
h = json.load(open('$ROOT/.claude/settings.json'))['hooks']['PostToolUse'][0]
assert h['matcher'] == 'Edit|Write'
print(h['hooks'][0]['command'])")
run_hook() { echo "{\"tool_input\":{\"file_path\":\"$1\"}}" | bash -c "$HOOK_CMD"; }

echo "prettier hook:"
echo 'const x = "double";' > "$TMP/a.ts"
run_hook "$TMP/a.ts"
grep -q "const x = 'double';" "$TMP/a.ts" && ok "formats edited .ts (root config applied)" || fail "did not format .ts"

echo 'const y = "double";' > "$TMP/dist/b.ts"
run_hook "$TMP/dist/b.ts"
grep -q 'const y = "double";' "$TMP/dist/b.ts" && ok "skips paths under dist/" || fail "formatted a dist/ file"

printf 'hello    world\n' > "$TMP/c.md"
run_hook "$TMP/c.md"
grep -q 'hello    world' "$TMP/c.md" && ok "ignores non-TS files" || fail "touched a non-TS file"

run_hook "" && ok "empty file_path is a no-op" || fail "errored on empty file_path"

[ "$(npx --no-install prettier --find-config-path backend/src/server.ts)" = ".prettierrc" ] \
  && ok "backend resolves root .prettierrc" || fail "backend resolves wrong prettier config"

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
