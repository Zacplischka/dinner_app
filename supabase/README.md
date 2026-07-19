# Supabase schema authority

This directory is the reproducible source of truth for Dinder's persistent
schema. The live project is `hcjuqvicwuszwqkreklc`
(https://hcjuqvicwuszwqkreklc.supabase.co), pinned in `config.toml`.

## Migrations

`migrations/` holds the three migrations recovered from the remote project,
unchanged. Local and remote versions match:

| version | name |
|---------|------|
| 20260620203520 | create_dinder_friend_schema |
| 20260620203550 | add_schema_indexes_and_direct_access_policies |
| 20260713082034 | create_comparison_snapshots |

These were recovered from remote history — they are **not** replayed against
production. Do not rewrite existing migration files; add new ones forward.

## Generated types

`database.types.ts` is generated from the live public schema — **never
hand-edit it**. Regenerate with the one command:

```
npm run gen:types
```

It pipes the CLI output through Prettier so a fresh regeneration produces no
diff. (Requires a logged-in Supabase CLI: `supabase login`.)

## Advisor findings (recorded, out of scope for #110)

Captured at recovery time; none are schema regressions introduced here, and
fixing them is deliberately out of scope:

- **INFO — RLS enabled, no policy** on `public.comparison_snapshots`. Intended:
  RLS is default-deny for `anon`/`authenticated`; only the `service_role`
  backend (which bypasses RLS) touches this table. No client policy is wanted.
- **INFO — unused index** `session_invites_inviter_id_idx`. Kept as authored;
  removing it is a separate performance decision.
- **WARN — leaked-password protection disabled** (Auth, project-level, not
  schema). Enable in dashboard if desired; unrelated to schema history.

All four public tables (`profiles`, `friendships`, `session_invites`,
`comparison_snapshots`) have row-level security enabled.
