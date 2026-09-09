# Ephemeral Sessions in Redis, social graph in Supabase

Session state (Participants, Selections, Submissions, the Match) lives only in Redis with a 30-minute TTL and deliberately leaves no trace after expiry — a Session is a moment of group decision, not a record. The social layer (Profiles, Friendships, Session Invites) is the opposite: durable by nature, so it lives in Supabase/Postgres. The boundary is strict: session state never touches Supabase, and the social graph never touches Redis; the only crossings are a Session Code inside a Session Invite and the narrowly scoped, verified Profile-photo reference described below.

## Consequences

- There is no session history and no "past matches" feature without revisiting this decision.
- Docs that say "no persistent database" predate the social layer; the claim now applies to session state only.
- Redis representation is a private `SessionStore` detail with typed round-trip tests, not a versioned cross-layer contract. Add runtime validation or versioning only if another writer appears or session data begins surviving deployments.

## Optional Profile photos (issue #490)

A verified Profile-photo URL may now cross from the social layer into a Participant's ephemeral Session record. The backend verifies the optional bearer token on each join/rejoin, reads the authoritative Profile, and snapshots only its photo URL. Tokens, email addresses, additional Profile fields and the social graph never enter Redis or roster events. Participant authority still comes from the existing Session capability and unique display name, not the Profile. Photo failure or a two-second lookup timeout falls back to initials; guests perform no remote photo/auth lookup.

The Profile's existing `avatar_url` column is the sole durable source. Legacy HTTPS Google URLs remain external. An uploaded image is decoded and re-encoded to a metadata-free, centred 256 × 256 JPEG, at most 64 KiB, stored as a data URL in that row. FriendsStore maps these bytes to a versioned `/api/profile-photos/<profile>/<sha256>.jpg` URL before any Profile DTO leaves the store. Original uploads are discarded. This deliberately small database representation avoids a second store and non-atomic object cleanup; revisit object storage if Profile volume or read bandwidth makes bounded row payloads costly.

Replacing/removing the photo overwrites that column atomically. The existing `auth.users → profiles` deletion cascade removes the app-owned image too; no external Google image is deleted. An old version URL returns 404 after replacement/removal. Image responses permit private browser caching for 60 seconds. Open pages can keep an already decoded image visible until refresh; cache expiry does not revoke it from the page. Photo URLs are shareable image capabilities, not private account endpoints. Already-connected Sessions need not receive edits until rejoin; no cross-session update channel is introduced.
