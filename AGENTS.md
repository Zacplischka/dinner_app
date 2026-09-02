# Claude Code Context

**Project**: Dinder
**Last Updated**: 2026-07-19

### Supported Deployment Platforms

- Railway
- Supabase
- Google Places API
- Cloudflare (DNS, and R2 for Owned Recipe images)
- OpenAI (Owned Recipe image generation, and the corpus's first culinary judge)
- Google Gemini (the corpus's second culinary judge)

### How you should access these

- **Supabase**: Supabase MCP tools (`mcp__plugin_supabase_supabase__*`) — list_tables, execute_sql, get_logs, get_advisors, apply_migration, etc. against project `hcjuqvicwuszwqkreklc`.
- **Railway**: `railway` CLI (installed via Homebrew). Requires `railway login` (interactive — ask the user to run it), then `railway link`, `railway logs`, `railway variables`, `railway up`.
- **Google Places**: `gcloud` CLI is installed and authenticated, but the active project is `mypickle-486702` — verify/switch project before touching Places quotas or keys (`gcloud config set project <id>`). Runtime access just uses the API key in `backend/.env`.
- **Cloudflare R2** (Owned Recipe images, #330): bucket `dinder-recipe-images`, served from `https://img.dinder.it.com`. Nothing at runtime reads it — the backend only ever hands out the URL — so the credential is an operator credential, not a deploy variable: an R2 API token scoped Object Read & Write to that bucket, exported as `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` for `node scripts/corpus/images.mjs publish`. Not in any `.env`, not in Railway, not a GitHub secret. Mint it from the Cloudflare dashboard when you need it and let it expire.
- **OpenAI** (Owned Recipe image generation #330, and the corpus's first culinary judge #336): `OPENAI_API_KEY`, same shape — exported for the pipeline run only, never a deploy variable. Note the gateway blackholes OpenAI IPs on this network; connect the VPN before a run.
- **Google Gemini** (the corpus's second culinary judge, #336): `GEMINI_API_KEY`, same shape again — an operator credential exported for a corpus run, not in any `.env`, not in Railway, not a GitHub secret. It exists to be a *second model family*: the author is Claude and the first judge is GPT, so a judge pair that is anything less than three families is not the layer, and `scripts/corpus/gate.mjs` refuses to run rather than report a pass it did not earn. **The key exists** — display name `dinder-corpus-culinary-judge (#336)`, in the AI Studio project `gen-lang-client-0616448802` (not `mypickle-486702`, whose billing is deliberately detached: that is the Places project, and reattaching it to add an API is the runaway the cap exists to stop). It is restricted to `generativelanguage.googleapis.com` and nothing else. Read the string, never commit it:

  ```bash
  export GEMINI_API_KEY=$(gcloud services api-keys get-key-string \
    ac294274-6986-4746-8a87-80dc20e3bcd9 \
    --project=gen-lang-client-0616448802 --format='value(keyString)')
  ```

  That project has billing attached, so a corpus run of ~1,160 Recipes bills at the paid tier rather than riding the free one — watch it, or mint a free-tier key in a project without billing. Both judge model ids were exercised live when the layer landed: `gemini-pro-latest` and `gpt-5.5` each answered `JUDGE_RUBRIC` with strict JSON and each caught the same gluten-free soy-sauce trap. Bump an id in `gate.mjs` and prove it the same way; a stale id fails on the first call of a run rather than grading badly, but nobody wants to find that out 200 Recipes in.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (Zacplischka/dinner_app) via the `gh` CLI; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

`needs-triage`, `ready-for-agent`, `blocked`, `wontfix` — plus `wayfinder:map` / `wayfinder:<type>` on wayfinding issues. Skills that name a triage role use these strings verbatim.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
