> Historical working-name plan retained with the mobile checkpoint. The current public brand is YupCrew; see [the merged rebrand plan](yupcrew-rebrand-plan.md).

# Dinder → Heykeen: rebrand plan

Prepared 8 September 2026. Status: proposed; Heykeen is the working name. This document plans the work; it does not rename the app, buy a domain, change live services or publish marketing.

## Outcome

Present one coherent product for friends, couples and housemates choosing how to spend time together. Eating out, takeaway, cooking and watching are four uses of that same product. Visitors should understand the promise, enter the right branch and invite their people without an account.

The rebrand is complete when the product, sharing experience, public address and launch materials all say Heykeen, existing users have a usable transition, and all four branches pass verification. A new logo alone is not completion.

## 1. Establish the brand

Recommended decisions to take into design:

| Element | Direction |
| --- | --- |
| Product name | **Heykeen**, one word in prose; **heykeen** in the wordmark. Pronounced “hey keen”. |
| Category | An app for choosing what to do together. |
| Promise | Help your people find something they're into. |
| Main headline | **What are we doing tonight?** |
| Supporting copy | Pick somewhere to eat, something to cook, or something to watch—with your people. |
| Proof | Everyone gets a say. Join with a link. No download or account needed. |
| Personality | Warm, sociable, lightly playful, helpful when people are indecisive. |
| Audience | Friends, couples and housemates; current groups of two to four. |
| Scope | Existing Eat Out, Takeaway, Cook and Watch branches. |

Avoid promising universal agreement, instant matches, guaranteed savings, bookings or in-app ordering. A fallback Top Pick is not a unanimous Match. Watch includes movies and series, so use **“Watch something”** on the branch card rather than implying films only. Do not turn this into a general polling, scheduling or event-planning product during the rebrand.

**Name gate, before final artwork and purchases:** screen Heykeen, “Hey Keen” and close phonetic variants in search, app stores, Australian trade marks, domain registration and relevant social handles. Initial searches were encouraging but are not clearance. [IP Australia's search guidance](https://www.ipaustralia.gov.au/trade-marks/search-existing-trade-marks) identifies the appropriate trade mark tools.

Check the actual registration and renewal price for a short address. Candidates to investigate include the exact-name `.com` and `.app`; neither is claimed available. Use one consistent handle where possible. Do not buy a premium domain simply to preserve a tentative name. Record the selected spelling, domain, renewal cost and handle before deployment work. Zac makes the final choice and any purchase decision.

Run a lightweight comprehension test with five prospective users: say the name once, ask them to spell it, show the headline and ask what they think the app does, then ask for the name again later. Specifically check confusion with “hey king”, dating, and finding new friends. Prefer a clear name over a clever explanation.

## 2. Finish a small, usable identity kit

The generated comparison board is a direction, not production artwork. Create an original editable vector wordmark and symbol based on the Heykeen concept: two conversational shapes leaning together, with a small shared spark. Check it at favicon size and in one colour. Avoid making the mark depend on food utensils or dating hearts.

| Colour role | Starting value | Use |
| --- | --- | --- |
| Warm cream | `#FFF4E8` | Main page background |
| Aubergine | `#302331` | Main text and strong surfaces |
| Coral | `#EA7058` | Primary actions and brand accent |
| Neutral surface | Derive and check during design | Cards, inputs and quiet information |

Use aubergine text on coral as the starting button treatment; do not assume the white-on-coral concept image has sufficient contrast. Check body text, focus rings, disabled controls and Like/Pass states against the actual rendered colours. Status needs text/icon meaning as well as colour.

Use a rounded, friendly wordmark and the existing readable app body font initially. Keep the ginger cat as a supporting character; it already has food and cinema variants. Recolour its branded details and surrounding scenes only where needed. Preserve its pause/reduced-motion behaviour. Use real food imagery and licensed movie artwork already available to the product, with existing attribution intact.

Deliver only the launch essentials:

- Editable primary wordmark, compact symbol and monochrome variants.
- Favicon, 192px and 512px app icons, Apple touch icon, and social avatar.
- Open Graph/share image, plus one reusable portrait social template.
- A one-page brand sheet with colours, typography, clear space, voice and examples.

Review a mobile home page, lobby, swipe card, result page and one dense Shopping List before applying the identity everywhere. This tests the identity against the hardest screens early. No second theme, new design-system dependency or elaborate logo animation is required.

## 3. Apply the identity across the actual experience

Preserve the current journey: choose a branch → gather in the lobby → preferences and Ready → swipe → submit → shared outcome → next action. The user's previous collaborative-lobby decision remains in force ([ADR 0015](adr/0015-gather-before-choosing-the-deck.md)).

Suggested home copy:

> **What are we doing tonight?**
>
> Pick somewhere to eat, something to cook, or something to watch—with your people.
>
> **Eat out** — Find somewhere you're into.
>
> **Order in** — Pick takeaway together.
>
> **Cook together** — Choose a recipe. Share the shop.
>
> **Watch something** — Find a movie or series for tonight.
>
> **Join with a code**
>
> No download. No account needed.

Each card starts its existing branch directly. Keep joining prominent, retain Return to session for current participants, and leave delivery comparison accessible as a secondary utility. Do not add a generic CTA that forces people through another category-choice page. Public branch labels can change; stored branch values and domain terms remain stable.

### Verified surface inventory

| Surface | Current locations | Planned change |
| --- | --- | --- |
| Home and primary navigation | `frontend/src/pages/HomePage.tsx`, `frontend/src/components/NavigationHeader.tsx` | Wordmark, heading, branch copy, labels and accessible names |
| Shared visual rules | `frontend/tailwind.config.ts`, `frontend/src/index.css` | Update existing theme tokens and shared components; remove obsolete neon gradients and hardcoded colours where they defeat the new palette |
| Secondary copy | `ConfirmLeaveModal.tsx`, `GroupOrderPage.tsx`, `ResultsPage.tsx` | Replace visible brand references and keep explanations accurate |
| Page titles and screen-reader navigation | `frontend/src/hooks/useRouteAnnouncement.ts` | Heykeen document titles while preserving focus/announcement behaviour |
| Native share sheet | `frontend/src/hooks/useShareLink.ts` | Heykeen share title; inspect invitation/result descriptions as separate cases |
| Search and link previews | `frontend/index.html` | Title, description, social names/images; distinguish homepage promotion from joining an existing Session |
| Installed web app | `frontend/public/manifest.webmanifest` and app icons | Name, description, icons and theme colour; verify real installed shortcuts |
| Mascot scenes | `mascotDrawing.ts` and shared scene components | Adjust brand colours without changing timing or status behaviour |
| Public docs and profiles | `README.md`, current `CONTEXT.md`/`AGENTS.md` project heading, social bios, OAuth display branding if configured | Explain Heykeen's full scope and retain accurate operational details |
| Release checks | `.github/workflows/ci-cd.yml`, `scripts/check-production-edge.mjs`, associated tests | Understand new canonical hosts, old redirects and both-host transition |

Search all four branches, Friends, errors, loading states and share copy after editing. Internal `@dinder/*` package names, the GitHub repository, local storage keys, cache tags and historic evidence can remain. Preserve frozen corpus IDs, licensed attribution, provider project IDs and the `img.dinder.it.com` image host. Renaming them supplies no immediate customer value and increases migration risk. Keep the old domain renewed because both redirects and recipe images may depend on it.

## 4. Move the public address without breaking participation

The implementation review found a material migration issue: browser state is tied to the origin, not the logo. Session identity and rejoin tokens use sessionStorage; cooking progress does too. The remembered shopper name and comparison state use localStorage. A new domain cannot read these automatically. [MDN describes the origin/tab boundaries](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage).

Do not promise seamless sign-in or active-session transfer. Keep people already participating on the old address until their Session completes/expires; let signed-in people sign in again on Heykeen. Persistent Profiles/Friendships remain in the same Supabase project. Do not put authentication or rejoin tokens in redirect URLs.

### Prepare first

1. Attach the purchased frontend domain to the existing deployment, obtain valid TLS and configure DNS/CDN deliberately. Verify the actual Railway/Cloudflare state and token scopes; no live account inventory was performed for this plan.
2. Keep the backend service, API address, Redis, Supabase project and image hostname initially. Add the new exact frontend origin to **both HTTP CORS and Socket.IO**, retaining old origins for coexistence. `backend/src/server.ts` currently owns these origins.
3. Add the new exact auth return URL to Supabase's redirect allowlist before testing it, retain the old URL during transition, and switch its Site URL at cutover. The client uses `window.location.origin` for Google sign-in return. Inspect Google's consent-screen branding/authorised domains and update what is actually configured; do not alter an unchanged Supabase provider callback unnecessarily. [Supabase redirect documentation](https://supabase.com/docs/guides/auth/redirect-urls).
4. Keep the current `FRONTEND_URL` until both frontends work. It controls backend-generated Invite Links through `backend/src/config/index.ts`, in addition to participating in origin configuration. Audit separate frontend API/socket environment settings before rebuilding.
5. Update CI/edge checks to distinguish a serving hostname from a redirecting hostname. The existing checker assumes `dinder.it.com` and `www.dinder.it.com` serve matching document bytes; merely turning on a redirect would break that contract. If the new domain uses another Cloudflare zone, configure its zone-specific purge scope and retain old-zone checks. Existing cache-tag names can stay.

### Release sequence

- **A: Brand deployment on the existing address.** Ship reviewed visuals/copy and the small “Dinder is now Heykeen” explanation. Establish a good version before introducing a domain change. Keep the relevant previous frontend build for recovery.
- **B: Compatibility and new-host verification.** Deploy additive origin support, prepare auth configuration, and verify the same branded build at the new domain. Keep API contracts compatible across independently deployed services ([ADR 0007](adr/0007-contracts-evolve-additively-across-deployments.md)). Avoid indexing the duplicate preview until canonical cutover; ensure preview noindex does not leak into the old live site.
- **C: New sessions move to Heykeen.** Switch generated links to the new canonical domain. On the old site, route new-start actions to the new origin while continuing to serve existing Session and list routes. Do not globally redirect every old request yet. Test an old-origin host with a new-origin invitee before announcing the move.
- **D: Drain and redirect.** Once old-origin Sessions have finished/expired, pending auth returns have been handled, and the last list that could be minted by a legacy Session has had its seven-day lifetime, redirect the legacy frontend routes to equivalent new paths. Use observed state and the last possible legacy mint time; an arbitrary 30-minute sleep is insufficient because activity refreshes Session TTL. Preserve paths and relevant query strings for join/list/campaign links; retain old-origin OAuth handling through the transition instead of forwarding auth payloads to another domain.

Keep the legacy frontend and API origin allowances available longer if the drain cannot be established safely. Scope redirect rules to the old **frontend** hosts; never accidentally redirect the old recipe-image subdomain. No custom cross-origin identity migration is planned.

At final cutover, use permanent path-preserving redirects, update internal links and public-page canonical URLs, verify both Search Console properties if used, and submit the public-page sitemap/address change where applicable. Keep private Session/list capability URLs out of sitemaps and indexing. Google's [site-move guidance](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes) recommends staged changes and long-lived redirects; keep old frontend redirects for at least a year, and retain the domain beyond that while images depend on it.

Existing home-screen installations may retain the old identity or origin. Test on real iOS/Android devices and provide a short re-add instruction if needed; do not promise manifest updates will transfer an installation between origins. Cooking progress on the new origin may begin fresh, even when a list's server data is preserved. The legacy grace period protects the lists currently being used.

### Recovery

Record the old build, domain configuration, auth settings, `FRONTEND_URL` and edge state before release. If new-origin entry/auth fails, pause promotion and keep the old host serving; revert the faulty frontend/configuration while preserving additive origin support for people already on the new host. A bad visual release can be reverted without changing data. Do not rely on instantly reversing permanent redirects after clients have cached them; validate with temporary redirects first, then make them permanent only after the drain/checks pass. Keep the canonical new host operational during any post-redirect recovery.

## 5. Relaunch the marketing around occasions

One brand, distinct messages:

| Occasion | Creative hook | Destination |
| --- | --- | --- |
| Watch | “Still scrolling while the popcorn goes cold?” | A Watch-focused explanation and the existing `/watch` entry |
| Eat Out | “Three suggestions. Three vetoes. Try choosing together.” | An Eat Out explanation and `/create?branch=eatout` |
| Cook | “You're both cooking. You both get a say.” | A Cook explanation and `/cook` |

Start with three simple real product demos and one announcement post. Use screen recordings for the UI, captions and the new end card. Higgsfield is optional for additional acted scenes; a subscription is not a rebrand dependency. Do not imply any generated actor is a real satisfied customer.

Sample announcement:

> Dinder is becoming Heykeen. We started with choosing dinner. Now you can also pick what to cook or watch together. Same simple idea: send a link, everyone gets a say, and find something you're into. Try Heykeen at [verified new URL].

Use “Formerly Dinder” as small transition copy for roughly 30 days, extending it if users still need the explanation. Refresh bios, avatar, demo end cards, link destinations and pinned introduction together. Existing historical posts need not all be edited.

The [marketing plan](marketing-launch-plan.md) now has a broader brand brief. Its budget is still a provisional A$500 learning envelope. Test the three occasion hooks organically, then select one clearly explained branch for the first paid flight; do not split a tiny budget between all branches. Domain/design costs are separately quoted and must not silently consume the advertising envelope.

## 6. Acceptance and execution order

Estimated effort: **6–9 focused working days** after the name/domain decision, plus the legacy-link grace period and any provider-review delays. This is a planning estimate, not a completion promise. Design iteration and deployment access determine elapsed time.

| Package | Dependency | Deliverable / done condition |
| --- | --- | --- |
| 1. Name and brand brief, 0.5–1 day | Name/domain checks | Selected spelling, usable address, handle direction, test observations and approved visual direction |
| 2. Identity kit and key screens, 1–2 days | Package 1 | Editable assets plus home/lobby/swipe/result/list previews that work on small phones |
| 3. Product application, 2–3 days | Package 2 | Consistent branding on all branches, navigation, shares, metadata and installed-app assets; focused tests pass |
| 4. Host/auth/edge preparation, 1–2 days | Domain control; package 3 for final preview | Both origins work with the existing backend; old links and signed-in/guest paths verified |
| 5. Final QA, launch kit and controlled release, about 1 day | Packages 3–4 | Reproducible checks, launch assets, recovery record, named cutover/drain checkpoints |

Owners: Zac chooses the name/domain, supplies or authorises account access and controls purchases/publication. Codex prepares the assets, changes, previews, tests and concrete release evidence once implementation is requested. Work that can be prepared locally does not wait on domain purchase; changing live services is a separate execution step from this planning request.

### Launch checklist

- [ ] A new visitor can explain what Heykeen does after seeing the mobile home page.
- [ ] Every branch works for guests; Google sign-in and Friends work on the new host.
- [ ] Visible copy, document titles, accessible labels, share sheets and previews use Heykeen consistently.
- [ ] No hardcoded old neon styling makes a page unreadable under the new theme; contrast, keyboard focus, 44px actions and reduced motion remain usable.
- [ ] Two independent phones can create, invite, join, Ready, swipe, submit and act on the outcome; include an old/new-host mixed Session.
- [ ] Reconnect, reload, final-choice Undo, all-pass outcome, Restart, Leave and expiry still work.
- [ ] Legacy list URLs and Cook View work through their lifetime, including claimed items and old-origin progress during the grace period.
- [ ] Invalid/expired invite links remain honest errors; redirects do not discard the join code or force everyone to the homepage.
- [ ] Existing browser tests assert behaviour as well as the updated visuals; typecheck, lint and relevant existing suites pass. Add only missing regression coverage for brand metadata and host-transition behaviour.
- [ ] New-domain TLS, API CORS, Socket.IO, auth return, response caching and deployment checks pass against live configuration before promotion.
- [ ] Old-host serving/redirect stages, private-route indexing exclusions, social previews and install behaviour are checked.
- [ ] No credentials, rejoin tokens or private Session/list IDs appear in public marketing assets or migration logs.
- [ ] Recovery instructions and the point for enabling permanent redirects are recorded.

## Immediate next deliverable

Produce the **Heykeen brand sheet and five key-screen previews**, while checking the name/domain. That makes the rebrand concrete enough to select the final direction before applying it across the app. No new feature work is required to begin.

## Evidence and limits

The file inventory and migration concerns come from the current repository. Official references were checked on 8 September 2026; the Supabase changelog scan surfaced no redirect-specific breaking change in the reviewed recent entries. No live DNS, registrar availability, OAuth account settings, traffic totals or current installed-app behaviour was verified. The domain is intentionally unspecified until selected. Internal package/repository names and historical decisions remain valid during this proposed customer-facing rebrand.

## Local implementation — 8 September 2026

The approved visual direction is now implemented in the working tree: cream/aubergine/coral shared styles; a responsive four-card home; editable SVG mark/wordmark; PNG install icons and social image; customer-facing names, route titles and native sharing. Existing cat scenes, session behaviour, routes and storage keys are retained. The swipe Like action now uses the coral check treatment from the preview. Body/link/status colours were adjusted for light surfaces.

This completes the local visual application, not the domain migration or public relaunch. No deployment, domain purchase, auth configuration, API change or provider migration has been made. Name clearance remains pending. Local review uses isolated Redis and placeholder auth configuration; it does not validate Google sign-in.

Validation: frontend production build and all 656 unit tests passed; lint has no errors and one pre-existing SelectionPage effect-cleanup warning. Browser checks covered mobile/desktop home and theme contrast, keyboard navigation, install/share metadata, Cook/Watch entry, a two-person Watch round with reload/rejoin, swipe recovery and shopping-list/cooking progress. After improving claimed-row and completed-step readability, their 65 unit tests and two mobile browser tests passed again. The restaurant header scenario could not finish because the isolated local environment has no Google Places credential. Google sign-in and live provider/deployment behaviour remain unverified. Review screenshots are under ignored `output/playwright/heykeen-*.png`.
