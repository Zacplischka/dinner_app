# Profile photos

Issue #490 adds `/profile`, reached through the signed-in Profile link on Home. Add/change opens the native browser photo picker; Save uploads the selected file. The server result is the preview. Failed saves leave the previous photo intact and preserve the selection for retry. Remove persists a null photo; it is not refilled from OAuth metadata on later sign-in. Guests keep initials and need no Profile.

## Boundaries and storage

- `PUT /api/users/me/photo`: verified bearer identity, raw JPEG/PNG/WebP body, at most 5 MiB; six upload attempts per Profile per minute per backend instance. Content signature and declared MIME must agree. Inputs must be still raster images, at most 4096 pixels per dimension and 16,777,216 pixels total. Sharp re-orients, centres/crops, strips metadata and encodes a 256 × 256 JPEG, at most 64 KiB, with a three-second processing timeout. SVG, GIF, animated and malformed files are rejected.
- `DELETE /api/users/me/photo`: verified bearer identity; clears only that Profile's saved photo. Neither mutation accepts a target Profile ID or image URL.
- `GET /api/users/me` and social DTOs expose the canonical saved photo URL. App-owned bytes stay inside `profiles.avatar_url` as a bounded data URL; outward mapping happens only in FriendsStore. This reuses the existing table's denial of direct anonymous/authenticated Data API access. There is no browser service-role credential and no Storage bucket/policy to configure.
- `GET /api/profile-photos/:userId/:sha256.jpg`: returns only the current matching JPEG, with `nosniff` and `Cache-Control: private, max-age=60`. This public, shareable image URL reveals no email or wider Profile record. Stale, missing and removed versions return 404. Existing HTTPS OAuth photos are never fetched or deleted by the server.
- The join payload optionally includes the current access token; the backend verifies it with Supabase Auth, resolves the Profile, and discards the token. No supplied Profile ID/avatar URL can select another Profile's photo. The Session snapshot holds only the resulting URL. Verification/Profile failure or a two-second total lookup budget yields initials. Guests bypass the lookup. Ready, choices, Selections and Submission are untouched.
- The shared avatar renderer resolves API image URLs against the API origin on split-host web and Capacitor, uses a fixed circle/centre crop, and falls back to initials when an image fails. An active Session may keep its old snapshot until rejoin. An old image already in browser memory/cache can remain visible; this is not instant revocation.

## Retention and account deletion

There are no original uploads, orphaned objects or per-Session image copies to clean up. An atomic Profile-row update removes the superseded live image. Deleting the Auth user through the existing verified operator/email account-deletion process cascades to the Profile and its image, Friendships and Invites. Operators should verify those existing cascades, and check a saved photo URL no longer returns bytes after deletion. Do not delete external Google images. This change does not add the separately planned self-service account-deletion feature.

Backups/logs/browser copies retain their existing separate policies; the privacy page makes no universal deletion deadline. Expiring Sessions may still hold an obsolete image URL, which fails gracefully after its live image is removed.

## Deployment and verification

No schema migration, bucket creation or new environment variable is required. Deploy backend and frontend together through the usual reviewed release; the pinned Sharp dependency needs its platform package during `npm ci` (supported by the existing Node 22 builds). Older clients ignore the additive roster field; guests work throughout a rollout. Rollback must preserve saved photo bytes. Older backends return the stored data URL directly in Profile DTOs and do not serve the versioned image route; older frontends also lack the editor and Session avatar rendering. Retain or backport the outward URL mapping and image route when rolling back other backend changes, and plan compatible frontend/backend versions rather than clearing users’ photos.

Automated tests use non-customer fixtures. The contract suite runs the actual router, auth verification boundary, FriendsStore and image codec with mocked Supabase responses. The service suite covers all four Branches with four Participants, rejoin/new socket, removal, Ready/Start, complete Submissions and Restart. `profile-photos.spec.ts` starts a disposable backend using actual production handlers and a fake local Supabase HTTP service; four isolated browsers save different fixture images and exercise the real Session transport. This is local verification, not live Google sign-in, Supabase Postgres RLS execution, production deployment or marketing footage.

Run the tests with an isolated Redis and unoccupied frontend/backend ports. For example, start Redis on 6409, then from the repo root:

```sh
BASE_URL=http://localhost:3915 BACKEND_URL=http://localhost:3916 PORT=3916 \
FRONTEND_URL=http://localhost:3915 REDIS_HOST=127.0.0.1 REDIS_PORT=6409 \
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=test-service-role \
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=test-anon-key \
npm run test:e2e:mobile --workspace=@dinder/frontend -- profile-photos.spec.ts --workers=1
```

After merge/deploy, verify using designated ordinary test accounts: add/change/remove, sign out/in, second device, four-person Watch round and guest fallback. Production changes and recording remain separate follow-ups.
