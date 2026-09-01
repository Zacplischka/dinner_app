# Claude Code Context

**Project**: Dinder
**Last Updated**: 2026-07-19

### Supported Deployment Platforms

- Railway
- Supabase
- Google Places API
- Cloudflare (DNS, and R2 for Owned Recipe images)
- OpenAI (Owned Recipe image generation)

### How you should access these

- **Supabase**: Supabase MCP tools (`mcp__plugin_supabase_supabase__*`) — list_tables, execute_sql, get_logs, get_advisors, apply_migration, etc. against project `hcjuqvicwuszwqkreklc`.
- **Railway**: `railway` CLI (installed via Homebrew). Requires `railway login` (interactive — ask the user to run it), then `railway link`, `railway logs`, `railway variables`, `railway up`.
- **Google Places**: `gcloud` CLI is installed and authenticated, but the active project is `mypickle-486702` — verify/switch project before touching Places quotas or keys (`gcloud config set project <id>`). Runtime access just uses the API key in `backend/.env`.
- **Cloudflare R2** (Owned Recipe images, #330): bucket `dinder-recipe-images`, served from `https://img.dinder.it.com`. Nothing at runtime reads it — the backend only ever hands out the URL — so the credential is an operator credential, not a deploy variable: an R2 API token scoped Object Read & Write to that bucket, exported as `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` for `node scripts/corpus/images.mjs publish`. Not in any `.env`, not in Railway, not a GitHub secret. Mint it from the Cloudflare dashboard when you need it and let it expire.
- **OpenAI** (Owned Recipe image generation, #330): `OPENAI_API_KEY`, same shape — exported for the pipeline run only, never a deploy variable. Note the gateway blackholes OpenAI IPs on this network; connect the VPN before a run.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (Zacplischka/dinner_app) via the `gh` CLI; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

`needs-triage`, `ready-for-agent`, `blocked`, `wontfix` — plus `wayfinder:map` / `wayfinder:<type>` on wayfinding issues. Skills that name a triage role use these strings verbatim.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
