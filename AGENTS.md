# Claude Code Context

**Project**: Dinder
**Last Updated**: 2026-07-19

# ⚠️ CRITICAL DEVELOPMENT GUIDELINES

## 1. Primary Environment
- **/herdr** is the main development workspace.
    - All team and agent interactions must take place within herdr panes.
    - If you are the **Orchestrator** and spawning agents, create their panes in your current tab.

**Role Assignment:**  
Each participant is either an *Orchestrator*, *Implementer*, or *Researcher*. Your role will be given in the prompt.

## 2. Claude Model Usage
- Use **Claude Opus 4.8** for orchestration and implementation.
    - If Fable 5 usage limits are reached, switch to Claude Opus 4.8 to maintain workflow.

## 3. Web Development Requirements
- For all web dev tasks:
    - Always use the `k3-implement` skill.
    - All front-end work must utilize **kimi code**.

- For lighter tasks:
    - Use Claude Code with Opus 4.8 xhigh as kimi usage is limited

> 🚩 *Not following the above rules causes workflow issues and delays. Treat these as default standards.* 🚩

---

### Orchestrator Responsibilities
- Review `docs/branching.md`
- Assign a ROLE to each agent created
- Manage implementation of issues

---

### Supported Deployment Platforms

- Railway
- Supabase
- Google Places API
- Cloudflare

### How you should access these

- **Supabase**: Supabase MCP tools (`mcp__plugin_supabase_supabase__*`) — list_tables, execute_sql, get_logs, get_advisors, apply_migration, etc. against project `hcjuqvicwuszwqkreklc`.
- **Railway**: `railway` CLI (installed via Homebrew). Requires `railway login` (interactive — ask the user to run it), then `railway link`, `railway logs`, `railway variables`, `railway up`.
- **Google Places**: `gcloud` CLI is installed and authenticated, but the active project is `mypickle-486702` — verify/switch project before touching Places quotas or keys (`gcloud config set project <id>`). Runtime access just uses the API key in `backend/.env`.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (Zacplischka/dinner_app) via the `gh` CLI; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary — each triage role uses its canonical name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
