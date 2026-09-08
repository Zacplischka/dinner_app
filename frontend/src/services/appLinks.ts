import { SESSION_CODE_PATTERN } from '@dinder/shared/types';
import { publicUrl } from './device';

// Only routes with a defined recipient flow may enter the bundled app.
export function appLink(raw: string): string | null {
  try {
    const url = new URL(raw);
    const hosts = new Set([
      new URL(publicUrl('/')).hostname,
      'yupcrew.com',
      'www.yupcrew.com',
      'dinder.it.com',
      'www.dinder.it.com',
    ]);
    if (
      url.protocol !== 'https:' ||
      url.port ||
      url.username ||
      url.password ||
      !hosts.has(url.hostname) ||
      url.hash
    )
      return null;
    if (url.pathname === '/join') {
      const code = url.searchParams.get('code') ?? '';
      return SESSION_CODE_PATTERN.test(code) ? `/join?code=${code}` : null;
    }
    const session = url.pathname.match(/^\/session\/([^/]+)(?:\/(select|results|order))?$/);
    if (session && SESSION_CODE_PATTERN.test(session[1])) return url.pathname;
    if (
      /^\/list\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:\/cook)?$/i.test(
        url.pathname
      )
    ) {
      return url.pathname;
    }
    if (
      url.pathname === '/auth/callback' &&
      url.search.length <= 4096 &&
      (url.searchParams.has('code') || url.searchParams.has('error'))
    ) {
      return url.pathname + url.search;
    }
    return null;
  } catch {
    return null;
  }
}
