# YupCrew rebrand and migration

## Approved direction

Zac selected **YupCrew** (two syllables, “yup crew”) and **yupcrew.com**, with an A$50 domain budget. The earlier Keen direction was dropped because https://keen.social/ markets a similar friends-planning app. Exact-name YupCrew searches found no obvious competing app; this is not trademark clearance.

Promise: help friends, couples and housemates choose somewhere to eat, takeaway, a recipe to cook, or a movie or series to watch. Main headline: **What are we doing tonight?** Keep the four existing Branches, guest participation and the current Session flow.

The approved identity uses warm cream `#FFF4E8`, aubergine `#302331` and coral `#EA7058`, the existing cat artwork and an editable two-conversation-shape symbol. Customer-facing names, route titles, native sharing, install icons and share artwork use YupCrew. Internal package names, storage keys, corpus identifiers and the recipe image host stay unchanged.

## Purchased domain

On 8 September 2026, Cloudflare confirmed purchase of `yupcrew.com` for **US$10.46**, one year, expiring 8 September 2027. Automatic renewal is **off**; its quoted renewal price is US$10.46. Renew manually before expiry or explicitly enable renewal later. Registration and ownership contact details are stored in Cloudflare, not this repository.

## Hosting

Railway Hobby's two custom-domain slots are occupied by `dinder.it.com` and `www.dinder.it.com`. Preserve both so active participants retain their browser state.

The Cloudflare Worker **yupcrew-frontend**, configured in `wrangler.jsonc`, serves `yupcrew.com` and `www.yupcrew.com` by forwarding requests to the existing frontend Railway origin. It keeps paths, query strings and response headers; it does not migrate data or change backend routing. Deploy changes with `npx wrangler deploy`; validate with `node --test scripts/yupcrew-proxy.test.mjs` and `npx wrangler deploy --dry-run` first.

This uses Workers Free, with a **100,000 requests/day account limit**, including asset requests. No plan upgrade was purchased. Remove the proxy once a legacy Railway domain can safely retire, or revisit hosting before traffic approaches this ceiling. The existing Railway frontend remains the sole build/deployment source. Future frontend releases automatically flow through the proxy.

## Cutover

- Backend HTTP and Socket.IO accept old and new frontend origins. Canonical Invite Links use `FRONTEND_URL=https://yupcrew.com`.
- Supabase retains the four existing Dinder redirect entries and adds exact `https://yupcrew.com/` and `https://www.yupcrew.com/` returns. Change Site URL to `https://yupcrew.com` once the new host works. The Supabase project and Google provider callback stay the same.
- New Session actions on the legacy home page navigate to YupCrew. Return to session, Join and existing Session/Shopping List routes stay on their current origin.
- Do not globally redirect old URLs yet. Rejoin tokens and cooking progress are origin-bound; no private tokens are copied into redirects. Users may need to sign in again on the new domain.
- Keep `img.dinder.it.com` serving the committed recipe images. Do not rename buckets, databases, provider keys or the GitHub repository.

The legacy sites can remain serving indefinitely. Before retiring them, establish that old Sessions have finished and allow the last legacy-minted Shopping List its full seven-day life; ongoing activity refreshes Session expiry. Keep the old domain registered while image URLs depend on it. Any later frontend redirects should preserve paths and remain for at least a year.

## Verification and rollback

Before merging: frontend build, unit tests, typecheck, lint, proxy test and relevant browser checks. CI also checks the new hosts show the YupCrew title and continues validating the legacy frontend cache contract. The Worker intentionally uses ordinary proxy caching; it does not claim the old zone's configured HTML-cache HIT policy.

After deployment: verify both new HTTPS hosts, install/share assets, HTTP CORS and Socket.IO, new Invite Links, a mixed old/new-origin Session, and Google sign-in/Friends. Record any remaining provider verification separately.

If the new hostname fails, the legacy sites and original Railway frontend remain available. Restore the backend `FRONTEND_URL` and Supabase Site URL to `https://www.dinder.it.com`, and revert only the new-start navigation if needed. Keep additive origin/redirect allowances for people already on the new host. Do not remove the Worker while new Invite Links depend on it.
