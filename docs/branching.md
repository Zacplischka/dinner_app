# Branching Strategy

Trunk-based. `main` is the only long-lived branch and is always deployable — every push to `main` auto-deploys backend and frontend to Railway (watch-pattern filtered).

## One lane per agent

A **lane** is 1:1:1:1 — one issue, one branch, one worktree, one PR. An agent owns exactly one lane at a time and touches nothing outside it.

**The root checkout (`~/projects/Hobby/dinner_app`) is not a lane.** It stays on `main`, clean. Agents never commit there — parallel sessions share that working tree, so a commit made there lands on whatever branch another session left checked out.

```sh
git -C <root> fetch origin
git -C <root> worktree add ../lanes/<branch> -b <branch> origin/main
```

Tools that make their own worktrees (Claude `.claude/worktrees/`, herdr, codex) are fine — the path doesn't matter, the naming does. If the tool auto-named the branch (`worktree/quiet-stone-4b35`, `codex/worktree-a624-merge`), rename it before the PR: `git branch -m <type>/<issue>-<slug>`.

## Naming

`<type>/<issue>-<slug>` — the issue number is mandatory when one exists; it's the collision-free token that maps a lane back to the tracker.

| type | for | merges? |
|---|---|---|
| `feat/` | new behaviour | yes |
| `fix/` | bug, including hotfix | yes |
| `chore/` `docs/` | deps, tooling, prose | yes |
| `research/` `prototype/` | spikes, throwaway | often not — close the PR, keep the notes |

`feat/179-delivery-fee`, `fix/274-minting-marker`, `research/coles-product-data`.

## Rules

- **Never commit directly to `main`.** PR-only; admin bypass is for emergencies, not habit.
- **Branch from `origin/main`, never from another lane.** Lanes are independent — no lane depends on an unmerged lane. If work genuinely needs a predecessor, wait for it to land.
- **Short-lived**: hours to a few days, one concern. A lane open longer than that is a planning bug.
- **Rebase, never merge `main` in**: `git fetch origin && git rebase origin/main`. Keeps the squash diff honest.
- **Squash-merge** the PR, `Closes #123` in the body, CI green before merge. Review locally with `/code-review`.
- **Delete the lane on merge**: `git worktree remove <path>`. The branch deletes itself (see below).

## Cleanup

Run in the root checkout whenever branches pile up:

```sh
git worktree prune
git fetch --prune
git branch -vv | awk '/: gone]/ {print $1}' | xargs -r git branch -D
```

This only works because GitHub deletes the head branch on merge — keep `deleteBranchOnMerge` on.

## What there isn't

No `develop`, no release branches, no version tags, no environments beyond production. Add a staging environment before introducing release branches — not the other way around.

## Hotfixes

Same flow, no special branch — `fix/<issue>-<slug>` off `main`, PR, squash-merge. Railway redeploys automatically. Roll back with `railway rollback <deployment-id>` if a bad deploy ships.
