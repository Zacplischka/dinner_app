---
name: pr-review-loop
description: Submit a PR for this repo, monitor the Claude Code Review workflow and CI on GitHub, fix any issues the review raises, and repeat until clean before merging. Use when the user says "raise a PR", "submit a PR and wait for review", "monitor the claude review", or wants changes shipped through the full PR + automated-review cycle.
---

# PR Review Loop

Ship a branch through this repo's PR pipeline: push → PR → wait for the
claude-review workflow → fix findings → repeat → merge.


## 0. Preflight
```bash
npm run analyze:pr
```

## 1. Submit

```bash
git checkout -b <type>/<short-slug>
git add <files>            # never add .env
git commit                 # end message with Co-Authored-By: Claude <model> <noreply@anthropic.com>
git push -u origin <branch>
gh pr create --title "..." --body "..."   # reference the issue: "Closes #N"; end body with the Claude Code attribution line
```

## 2. Wait for review + CI

Two workflows trigger on every push to the PR branch: **Claude Code Review**
(~2-4 min) and **CI/CD Pipeline** (contract, e2e smoke, lint/typecheck;
"Verify Production Deploy" is skipped on PRs).

```bash
sleep 15   # runs need a moment to register after push
gh run list --branch <branch> --limit 4 --json databaseId,status,workflowName
```

Watch each run **by explicit ID, one `gh run watch` per ID** — don't loop over
a multiline shell variable (quoting breaks and watches a mangled ID):

```bash
gh run watch <review-run-id> --interval 20 > /dev/null 2>&1; gh run watch <ci-run-id> --interval 20 > /dev/null 2>&1; gh pr checks <PR>
```

Run this in the background (`run_in_background: true`) so you're re-invoked
when it finishes.

## 3. Read the review

The review posts as an **issue comment from `claude[bot]`**, NOT a PR review —
`gh api .../pulls/<PR>/reviews` comes back empty. Read it with:

```bash
gh api repos/Zacplischka/dinner_app/issues/<PR>/comments --jq 'last | .body'
```

Also check for inline comments: `gh api repos/Zacplischka/dinner_app/pulls/<PR>/comments --jq '.[].body'`

## 4. Triage and fix

- **Bugs / blocking findings**: fix, verify locally (run the affected test
  suite), commit with a message referencing the review, push. The push
  re-triggers both workflows → go back to step 2.
- **"Minor, non-blocking" observations**: fix only if cheap and in-scope
  (e.g. an inaccurate comment). Pre-existing behavior the review itself says
  is "not a regression" stays out of scope — say so in the summary instead.
- Repeat until a review pass reports no findings needing changes.

## 5. Merge

Recent history uses squash merges:

```bash
gh pr merge <PR> --squash --delete-branch
```

A repo ruleset requires an approving review (`reviewDecision:
REVIEW_REQUIRED`), and the claude[bot] comment does not count — the plain
merge will fail with "base branch policy prohibits the merge". Only when the
user has asked for the merge, bypass with `--admin`. Then:

```bash
git checkout main && git pull --ff-only && git branch -D <branch>
```

Merging to main auto-deploys via Railway (watch-pattern filtered); CI verifies
the backend health endpoint afterwards.
