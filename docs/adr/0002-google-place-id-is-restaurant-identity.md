# Google Place ID is Restaurant identity

Restaurants are identified by their Google Places `placeId` end-to-end — Selections store them, the Match is a set intersection over them, and results map them back to names. We chose to borrow Google's identity rather than mint our own IDs with a mapping table, because Sessions are ephemeral: the IDs live for 30 minutes, so provider lock-in never accumulates in stored data.

## Consequences

- Swapping restaurant providers means changing the identity scheme everywhere at once, but no data migration — nothing outlives a Session.
- If Restaurants ever persist beyond a Session (favourites, history), this decision must be revisited first.
