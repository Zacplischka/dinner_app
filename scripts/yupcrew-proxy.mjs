// Railway Hobby's two custom-domain slots are occupied by the legacy hosts.
// ponytail: Workers Free caps at 100k requests/day; remove this proxy once a
// legacy Railway domain can retire, or revisit hosting before reaching that cap.

// The Caddyfile's document policy, restated because a Worker subrequest never treats
// HTML as cacheable on its own: 60 s at the edge, successes only, under the tag the
// deploy purges. The shell is one static file for everyone, so cookies never split it.
const DOCUMENT_EDGE_CACHE = {
  cacheEverything: true,
  cacheTtlByStatus: { '200-299': 60, '300-599': -1 },
  cacheTags: ['dinder-route-html'],
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.protocol = 'https:';
    url.hostname = 'frontend-production-bdfc.up.railway.app';
    url.port = '';
    const isDocument =
      ['GET', 'HEAD'].includes(request.method) &&
      Boolean(request.headers.get('Accept')?.includes('text/html'));
    if (isDocument) {
      // Caddy serves the shell by path alone and the app reads ?code= in the browser,
      // so every invite link and sign-in callback shares one cached copy.
      url.search = '';
    }
    const headers = new Headers(request.headers);
    headers.set('Host', url.hostname);
    const upstream = new Request(new Request(url, request), { headers, redirect: 'manual' });
    if (!isDocument) {
      return fetch(upstream);
    }
    const cached = await fetch(upstream, { cf: DOCUMENT_EDGE_CACHE });
    // Edge caching can raise the browser TTL; every visit must still revalidate the shell.
    const response = new Response(cached.body, cached);
    response.headers.set('Cache-Control', 'max-age=0, must-revalidate');
    return response;
  },
};
