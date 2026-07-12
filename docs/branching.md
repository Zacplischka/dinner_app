# Branching Strategy

Trunk-based. `main` is the only long-lived branch and is always deployable — every push to `main` auto-deploys backend and frontend to Railway (watch-pattern filtered).

## Rules

- **Never commit directly to `main`.** The repo enforces PR-only merges; admin bypass is for emergencies, not habit.
- **Branch from `main`, merge back via PR.** Short-lived branches: hours to a few days, one concern per branch.
- **Naming**: `<type>/<short-slug>`, optionally with issue number — `feat/session-invites`, `fix/123-redis-ttl`, `docs/branching`, `chore/deps`.
- **Squash-merge** PRs; the squash commit message describes the change. Delete the branch after merge.
- **Link the GitHub issue** in the PR body (`Closes #123`) when one exists.



## Hotfixes

Same flow, no special branch — `fix/<slug>` off `main`, PR, squash-merge. Railway redeploys automatically. Roll back with `railway rollback <deployment-id>` if a bad deploy ships.

## What there isn't

No `develop`, no release branches, no version tags, no environments beyond production. Add a staging environment before introducing release branches — not the other way around.
