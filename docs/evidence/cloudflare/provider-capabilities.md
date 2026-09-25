# Cloudflare settings the code does not carry

**HTML cache headers.** `Caddyfile` emits three layers on HTML: `Cloudflare-CDN-Cache-Control: public, max-age=60, must-revalidate` sets the Cloudflare lifetime (Cloudflare consumes it and gives it precedence); `CDN-Cache-Control: no-store` makes a missing Cloudflare-specific header fail closed to `BYPASS`; browser-facing `Cache-Control: max-age=0, must-revalidate` stays separate. ([CDN-Cache-Control](https://developers.cloudflare.com/cache/concepts/cdn-cache-control/))

**Dashboard-only settings.**

- HTML Cache Rule: eligible for cache, Edge TTL "use origin, bypass by default", ignore query string, cache deception armor on, serve-stale-while-updating off, no Browser TTL override. Match expression, with the zone's hosts:

  ```text
  (http.host in {...} and http.request.method in {"GET" "HEAD"}
   and any(lower(http.request.headers["accept"][*])[*] contains "text/html"))
  ```

- Always Online: off (it would serve stale or Internet Archive copies).
- Tiered Cache: off.
- SSL/TLS: Full (strict), even though Railway's guidance says Full; both custom domains present hostname-matching Railway certificates.

**Purge token.** A custom API token scoped to one zone with only the zone-level Cache Purge permission. The zone ID is ordinary config; the token is a secret.
