// Railway Hobby's two custom-domain slots are occupied by the legacy hosts.
// ponytail: Workers Free caps at 100k requests/day; remove this proxy once a
// legacy Railway domain can retire, or revisit hosting before reaching that cap.
export default {
  fetch(request) {
    const url = new URL(request.url);
    url.protocol = 'https:';
    url.hostname = 'frontend-production-bdfc.up.railway.app';
    url.port = '';
    const headers = new Headers(request.headers);
    headers.set('Host', url.hostname);
    return fetch(new Request(new Request(url, request), { headers, redirect: 'manual' }));
  },
};
