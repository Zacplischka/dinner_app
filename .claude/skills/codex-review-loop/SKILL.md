---
name: codex-review-loop
description: Orchestrate a review loop — spawn fresh-context Codex reviewers via herdr, verify each finding against the code yourself, fix only the legit ones, repeat until clean or diminishing returns.
---

You are the **orchestrator, verifier, and fixer**. Codex is the reviewer. Never fix anything Codex claims without verifying it against the actual code/docs first, and never let Codex apply fixes itself.

ARGUMENTS: what to review (issue numbers, a PR, a diff, a spec) and where fixes land (issue bodies, code, docs).

## Setup

1. Confirm you're inside Herdr: `test "${HERDR_ENV:-}" = 1` — if not, say so and stop.
2. Find the **research tab** (`herdr tab list --workspace "$HERDR_WORKSPACE_ID"`); reviewer panes go there, not tab 1. If your own pane is gone (background job), split from an existing pane in the research tab instead of `--current`.

## Per round (fresh context every time — never send follow-ups into an old pane)

```bash
herdr pane split --pane <research-tab-pane> --direction right --no-focus   # read pane_id from JSON
herdr pane rename <pane> "review-r<N> (codex yolo)"
herdr pane run <pane> "codex --yolo"
herdr wait agent-status <pane> --status idle --timeout 60000
herdr pane run <pane> "<self-contained review prompt>"
herdr wait agent-status <pane> --status working --timeout 30000
herdr wait agent-status <pane> --status done --timeout 590000   # a watched tab reports idle instead of done — treat either as finished
herdr pane read <pane> --source recent-unwrapped --lines 350
herdr pane close <pane>    # after collecting output; the pane is yours
```

Codex rounds run 5–15 minutes; if the done-wait times out, `pane get` + `pane read` before deciding anything.

## The review prompt (self-contained — the reviewer has zero context)

Must include, every round:
- What to fetch and the exact commands (e.g. `gh issue view <n> --repo <repo> --json title,body` — plain `gh issue view` renders nothing in a non-interactive pane).
- One line of domain context per item under review, and what changed since the last round if bodies were revised.
- The standard: "Report ONLY legit gaps or problems: contradictions with the code as it exists, wrong assumptions, ambiguities an implementer would trip on, missed interactions, safety/cost regressions. Do NOT restyle, nitpick wording, or propose scope creep."
- Output contract: per finding — item, severity (blocker/major/minor), what is wrong, what it should say instead; `ISSUE <n>: CLEAN` for clean items; end with the sentinel line `REVIEW COMPLETE`.
- In later rounds, tighten: "near-final; if a point is arguable or cosmetic, leave it out entirely."

## Verify, then fix

For **every** finding, before acting:
- Check the claimed code/doc against the repo. Cited line numbers, constants, and file names must actually exist and say what Codex claims.
- External claims (ToS, API pricing, documented behavior) get verified at the primary source (`crwl <url> -o md-fit`), not taken on faith.
- A finding that survives verification gets fixed (edit the issue body / code / doc). One that doesn't is dropped — say so in your round summary.
- A finding that would **overturn an explicit user decision** (scope, accepted trade-off) is not yours to rule on: present the evidence and options via AskUserQuestion, with a recommendation.

Apply all of a round's fixes before starting the next round.

## Stop when

- A round comes back all-CLEAN, or
- The only findings are trivial and deterministically fixable (fix them, no re-review), or
- Findings stop surviving verification — that's noise, not signal.

Track severity per round; it should trend down (blockers → majors → minors). If it doesn't, your fixes are introducing problems — slow down and re-verify.

## Report

After the loop: final state of each reviewed item, findings per round with what was fixed vs dropped, and any decisions escalated to the user.
