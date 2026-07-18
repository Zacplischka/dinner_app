---
name: codex-verify
description: Spawn the Codex CLI in a Herdr pane to verify a spec (GitHub issue, spec file, or inline requirements) is implemented, using Codex's Chrome browser plugin to drive the running app. Use when the user asks to "spawn codex to verify", "codex-verify <issue|spec>", or wants browser verification of implemented work delegated to Codex.
---

# Codex Verify

Codex verifies in the browser; it never writes code. Input: a spec — issue number, spec file path, or inline requirements.

## Preconditions

- `test "${HERDR_ENV:-}" = 1` — stop if not inside Herdr.
- App reachable: start the dev server first (or include start instructions in the kickoff).

## Spawn Codex (once)

1. `herdr pane layout --pane "$HERDR_PANE_ID"` — split wide panes `right`, tall ones `down`, always `--no-focus`.
2. `herdr pane rename <id> "Codex verifier"`
3. `herdr pane run <id> "codex -a never -s workspace-write"` — no approval prompts, sandboxed enough to run the app. Never `--dangerously-bypass-approvals-and-sandbox`.
4. `herdr wait agent-status <id> --status idle --timeout 30000`.

## Per spec

1. Fetch the spec text yourself (`gh issue view <N> --json title,body -q '.title,.body'`, or read the file) — never make Codex guess what to verify.
2. Kickoff (one message): the spec verbatim + app URL + `Use your Chrome browser plugin to drive the app and check every requirement above is implemented (mobile viewport if the spec is mobile-facing). Do not modify any code. Report per-requirement PASS/FAIL with what you observed.`
3. `herdr wait agent-status <id> --status working --timeout 30000`, then start the watcher **in background** (`run_in_background: true`):
   `sh .claude/skills/k3-implement/scripts/watch-pane.sh <pane_id>` (agent-agnostic debounce — a single idle reading lies).
4. When it fires, read the pane (`--source recent-unwrapped`) and relay the PASS/FAIL report to the user. Blocked on a prompt → answer it (send-text the option digit, send-keys enter). FAILs are findings to report, not yours to fix silently.
5. Another spec → send `/new`, confirm idle, back to step 1.

## Failure modes

- Codex hangs or times out at startup → gateway 10.100.0.20 blackholes OpenAI IPs; run `expressvpnctl connect` first.
- Pane IDs die with the pane; re-read from JSON after any split.
