# Supabase Schema Is Owned by Repository Migrations

Committed Supabase migrations are the authority for the persistent schema. Generated TypeScript database types are committed for deterministic offline builds, regenerated only by an explicit script, never hand-edited, and remain disposable derivatives of those migrations. Every schema change is reviewed with the backend code that uses it; production state is never its only record.

## Consequences

- Backend stores trust constrained Postgres columns but runtime-validate flexible `jsonb` values, such as comparison Snapshot payloads, before converting them into domain objects.
- The browser uses Supabase Auth only; all application-table access belongs to backend stores and reaches the frontend through backend contracts.
