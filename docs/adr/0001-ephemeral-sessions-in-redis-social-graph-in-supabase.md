# Ephemeral Sessions in Redis, social graph in Supabase

Session state (Participants, Selections, Submissions, the Match) lives only in Redis with a 30-minute TTL and deliberately leaves no trace after expiry — a Session is a moment of group decision, not a record. The social layer (Profiles, Friendships, Session Invites) is the opposite: durable by nature, so it lives in Supabase/Postgres. The boundary is strict: session state never touches Supabase, and the social graph never touches Redis; the only thing that crosses it is a Session Code inside a Session Invite.

## Consequences

- There is no session history and no "past matches" feature without revisiting this decision.
- Docs that say "no persistent database" predate the social layer; the claim now applies to session state only.
