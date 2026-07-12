# Auth is optional; guests are first-class

Anyone can host or join a Session with just a display name — no account, no login wall. Authentication (Supabase) gates only the social layer: Friendships and Session Invites. We chose this because the product's core promise is zero-friction group deciding ("send a code, everyone's in"), and a signup wall would kill adoption within a friend group where only one person has the app.

## Consequences

- A Participant is identified by socket, not account; the same person is a stranger across Sessions.
- Any feature that remembers a person across Sessions (history, preferences, stats) is a Profile feature and must degrade gracefully for guests.
