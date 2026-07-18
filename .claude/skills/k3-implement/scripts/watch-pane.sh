#!/bin/sh
# watch-pane.sh <pane_id> — exits when the pane's agent stops working.
# Requires BOTH agent_status != working AND an unchanged viewport across two
# consecutive polls: kimi's long K3-thinking stretches flicker herdr's status
# to idle/done mid-turn, but a live pane's spinner redraws every frame, so the
# viewport hash only freezes when the turn is genuinely over.
pane="$1"
stable=0; prevhash=""
while true; do
  s=$(herdr pane get "$pane" 2>/dev/null \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["pane"].get("agent_status","gone"))' \
    2>/dev/null || echo gone)
  h=$(herdr pane read "$pane" --source visible --lines 40 2>/dev/null | shasum | cut -d' ' -f1)
  if [ "$s" != "working" ] && [ "$h" = "$prevhash" ]; then stable=$((stable+1)); else stable=0; fi
  if [ "$stable" -ge 2 ]; then echo "agent status: $s (viewport stable)"; exit 0; fi
  prevhash="$h"
  sleep 40
done
