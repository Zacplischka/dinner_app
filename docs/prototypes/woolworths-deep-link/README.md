# Woolworths deep-link research (wayfinder #238)

Question: ticket #228 routes every retailer link through our backend counting
redirect (302 from our domain to `woolworths.com.au/shop/productdetails/<id>`).
Dinder is a mobile *web* app. If the shopper has the Woolworths *native* app
installed, does our redirect kill the OS's chance of opening it?

Method: curl against Woolworths (their `.well-known` files 403 plain curl but
serve 200 to a mobile-browser User-Agent), plus primary Apple/Google/Chromium
docs. Raw captures in `captures/` (fetched 2026-08-01).

## Q1 — Woolworths declares `/shop/productdetails/*` for app-opening on both platforms

`captures/apple-app-site-association.json`
(`https://www.woolworths.com.au/.well-known/apple-app-site-association`):
appID `7G2EZGEQH4.com.woolworths.supers`, components include
`{"/" : "/shop/productdetails/*"}` (no exclude). Legacy `paths: ["/"]` too.

`captures/assetlinks.json`
(`https://www.woolworths.com.au/.well-known/assetlinks.json`):
package `com.woolworths` with `delegate_permission/common.handle_all_urls`
(covers all URLs on the host, so product-details included).

So the native-app question is live: a correctly-delivered product link is a
valid universal link / app link.

Note: the 403-to-plain-curl on the AASA is Akamai UA filtering. Apple's TN3155
says the AASA must be served to *all* user agents ("your server should accept
all user agent requests") — Woolworths is technically in violation, but Apple's
CDN evidently gets through, since the app-open behaviour exists in the wild.

## Q2 — A direct cross-domain tap in the mobile browser DOES open the native app

- **iOS**: Apple TN3155 (Debugging Universal Links,
  https://developer.apple.com/documentation/technotes/tn3155-debugging-universal-links):
  "When a user clicks on a universal link … The universal link opens directly
  within the app when the app is installed on the user's device." The
  documented exception is **same-domain** navigation: "If a universal link has
  the same domain as the previous navigation, the web browser will expect the
  user wants to continue navigating within the browser." Dinder's domain !=
  woolworths.com.au, so a direct `<a href>` tap in Safari qualifies. (Caveat:
  the per-domain user default — a user who once chose "open in browser" via
  long-press stays in the browser until they flip it back; same technote.)
- **Android**: verified App Links "can immediately open corresponding content
  in your app, without requiring the user to select your app from a
  disambiguation dialog" (https://developer.android.com/training/app-links).
  Chrome itself launches apps for verified app-link navigations — Chromium's
  external-intents doc uses exactly this case: "Clicking a link to
  https://www.youtube.com/ opens the Youtube app"
  (https://chromium.googlesource.com/chromium/src/+/HEAD/components/external_intents/README.md).

## Q3 — The 302 defeats app-opening on iOS; Android likely survives it

- **iOS (defeated)**: the tapped URL is what Safari evaluates. Branch:
  "Universal Links won't open the app when they are 'wrapped' by click
  tracking links … Universal links, including Branch Links, must be
  freestanding" (https://help.branch.io/developer-hub/docs/ios-universal-links).
  Field confirmation: from iOS 17, redirect-wrapped deep links "execute an
  HTTP 301 redirection within the browser itself" instead of opening the app,
  in both Safari and Chrome (https://developer.apple.com/forums/thread/747131).
  Apple's TN3155 permits redirects only for taps that start in *another app*:
  "Redirection is allowed, although not preferred, when opening universal
  links from another app." Our tap starts inside the browser, so that carve-out
  does not apply.
- **Android (probably survives)**: Chrome evaluates the whole redirect chain
  under the original user gesture. Chromium external_intents README: apps are
  blocked "without user activation", and Chrome stays in the browser only
  when "the set of apps supporting the navigation hasn't changed" across the
  chain — our chain goes no-app (dinder domain) → Woolworths-app
  (woolworths.com.au), i.e. the set changes, which is the launch case
  (https://chromium.googlesource.com/chromium/src/+/HEAD/components/external_intents/README.md).
  Same principle for `intent:` URLs: "an immediate HTTP 302 redirect … will
  resolve the intent" after a user click
  (https://paul.kinlan.me/deep-app-linking-on-android-and-chrome/).
  Not device-verified by us; treat as "expected to work" not "guaranteed".

## Q4 — Options if we must count the tap

| Option | Tap counted? | App can open? |
|---|---|---|
| (a) 302 counting redirect (#228 as specced) | Yes, server-side, ad-blocker-proof | Android: probably. iOS: **no** — lands on the web PDP |
| (b) Direct `href` to Woolworths + `navigator.sendBeacon` on click | Yes — sendBeacon is designed to survive page unload/navigation ("intended to be used … send analytics … before the document is unloaded", https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon); lost only if JS is blocked | **Yes, both platforms** — the tapped URL is the freestanding universal/app link |
| (c) Interstitial page on our domain, user taps again | Yes | Yes (second tap is direct) — but costs an extra tap and a page load |

(b) is the only option that preserves both. Its counting is marginally softer
than a 302 (client-side, skippable by content blockers), which is the entire
trade.

## Q5 — The Woolworths web PDP does NOT self-heal into the app (statically)

Fetched `https://www.woolworths.com.au/shop/productdetails/713429` with an
iPhone Safari UA (808 KB HTML, HTTP 200):

- No `apple-itunes-app` meta tag (no Apple Smart App Banner).
- No `woolworths://` scheme, no `intent://` URL, no `app.link` domain, no
  Branch web-SDK snippet in the static HTML.
- But: the site's own header JS reserves space for a **Branch Journeys**
  banner (`.branch-journeys-top`, `monitorBranchJourneyHeight()`), and Tealium
  is referenced — so a runtime-injected Branch app banner exists in some
  configurations. Journeys banners are dismissible marketing banners, not an
  OS-level app handoff.

Captured meta tags: `captures/pdp-713429-meta-tags.txt`.

Net: if our 302 strands an iOS user on the web PDP, nothing reliable pulls
them back into the app; at best a dismissible Branch banner appears.

## Bottom line

Web-only handoff via the counting redirect is acceptable for v1: the web PDP
is fully functional and Android users with the app probably still get the app.
What the 302 sacrifices is precisely the iOS app-open: an iPhone user with the
Woolworths app installed lands on the mobile web PDP instead of the app, with
no smart banner to recover. If that ever matters, the fix is known and cheap:
swap the 302 for a direct link + `sendBeacon` click-count (option b).
