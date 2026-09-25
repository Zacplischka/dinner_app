# Claude Code Context

**Project**: YupCrew (formerly Dinder)
**Last Updated**: 2026-09-08

### Supported Deployment Platforms

- Railway
- Supabase
- Google Places API
- Cloudflare (DNS, and R2 for Owned Recipe images)

### How you should access these

- **Supabase**: Supabase MCP tools (`mcp__plugin_supabase_supabase__*`) — list_tables, execute_sql, get_logs, get_advisors, apply_migration, etc. against project `hcjuqvicwuszwqkreklc`. It is a free-tier project, so Supabase pauses it after a week without API requests and its hostname stops resolving (only sign-in and Friends notice; the core flow is Redis). `prod-smoke.yml` reads one row daily to keep it awake and goes red if it has paused; restore from the dashboard or `POST https://api.supabase.com/v1/projects/hcjuqvicwuszwqkreklc/restore` with a personal access token.
- **Railway**: `railway` CLI (installed via Homebrew). Requires `railway login` (interactive — ask the user to run it), then `railway link`, `railway logs`, `railway variables`, `railway up`.
- **Google Places**: `gcloud` CLI is installed and authenticated, but the active project is `mypickle-486702` — verify/switch project before touching Places quotas or keys (`gcloud config set project <id>`). Runtime access just uses the API key in `backend/.env`.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (Zacplischka/dinner_app) via the `gh` CLI; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

`needs-triage`, `ready-for-agent`, `blocked`, `wontfix` — plus `wayfinder:map` / `wayfinder:<type>` on wayfinding issues. Skills that name a triage role use these strings verbatim.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
