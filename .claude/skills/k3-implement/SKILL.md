---
name: k3-implement
description: Orchestrate the Kimi Code CLI (K3) in a Herdr pane to implement a range of GitHub issues, with the calling agent acting as verifier (browser check + PR review loop) between issues. Use when the user asks to run K3/Kimi through a set of issues, "spawn kimi to implement", or wants the implement-verify-review pipeline driven from Herdr.
---

# K3 Implement

Kimi implements one issue at a time in its own Herdr pane — typecheck, unit tests, local commit — and stops there; the watcher alerts you, and you then run `/codex-verify` on the issue spec and `/pr-review-loop` before feeding it the next issue. Kimi never pushes, opens PRs, watches CI, or does browser verification/review — everything past the commit is yours and saves its tokens.

## Preconditions

- `test "${HERDR_ENV:-}" = 1` — stop if not inside Herdr.
- `kimi` exists only in interactive zsh (`~/.kimi-code/bin/kimi`); panes get it, your non-interactive shell doesn't.
- Create one task per issue (TaskCreate) before starting.

## Spawn Kimi (once)

1. `herdr pane layout --pane "$HERDR_PANE_ID"` — split wide panes `right`, tall ones `down`, always `--no-focus`.
2. `herdr pane rename <id> "Kimi implementer"`
3. `herdr pane run <id> "kimi --auto"` — **must be `--auto`**: bare `kimi` blocks on a permission prompt for every command shape; `--yolo` is more than needed.
4. `herdr wait agent-status <id> --status idle --timeout 30000` (herdr detects agent `kimi`).

## Per issue

1. **Fresh context**: send `/new` (skip for the first issue after launch). Confirm idle.
2. **Kickoff** (one message):
   `/implement <N> — run typecheck + unit tests, commit to a branch off main. Stopping condition: the local commit is your last action. Do NOT push, open a PR, watch CI, or do browser/e2e/screenshot verification or /code-review — a separate verifier and review loop handle everything past the commit.`
3. `herdr wait agent-status <id> --status working --timeout 30000`, then start the watcher **in background** (`run_in_background: true`):
   `sh <skill-dir>/scripts/watch-pane.sh <pane_id>`
   Never trust a single idle/done reading — kimi's status flickers mid-turn; the script debounces with a viewport hash.
4. When the watcher fires, read the pane (`--source recent-unwrapped`) and branch on what actually happened:
   - **Finished + committed** → verify (below).
   - **Stalled mid-turn** (transcript ends mid-action, context counter frozen, todos incomplete): nudge with `herdr pane run <id> "continue"`, wait 3s, then `herdr pane send-keys <id> ctrl+s` — messages queue behind zombie turns and ctrl+s ("steer immediately") forces delivery. Re-arm the watcher.
   - **Blocked on a prompt** → answer it (send-text the option digit, then send-keys enter).
5. **Verify**: check the branch diff, then run `/codex-verify` with the issue as the spec (Codex drives the browser). Any FAIL → send Kimi the concrete finding and go back to step 3.
6. **Review/ship**: run `/pr-review-loop` for the branch.
7. Mark the task completed, next issue → step 1.

## Failure modes seen in practice

- Silent stream drops kill kimi turns mid-Write; the nudge + ctrl+s recovery above handles it. Frequent drops → suspect the network gateway before blaming the CLI.
- Moonshot **API-key** billing (the old `k3` zsh alias) has a 1.5M tokens/day org cap that 429-stalls long runs — always use subscription-billed `kimi`.
- Herdr pane IDs die with the pane; re-read IDs from JSON after any split, never reuse old ones.
