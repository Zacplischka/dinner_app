import { afterEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { appLink } from '../../src/services/appLinks';
import { publicUrl } from '../../src/services/device';

describe('public app links', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('keeps only supported HTTPS routes on owned hosts and shares the public origin', () => {
    vi.stubEnv('VITE_PUBLIC_ORIGIN', 'https://www.dinder.it.com');
    expect(publicUrl('/join?code=AB123')).toBe('https://www.dinder.it.com/join?code=AB123');
    for (const path of ['//evil.test', '/\\evil.test', 'https://evil.test', '/\n/evil.test'])
      expect(() => publicUrl(path)).toThrow('Invalid public path');
    for (const host of ['yupcrew.com', 'www.yupcrew.com', 'dinder.it.com', 'www.dinder.it.com']) {
      expect(appLink(`https://${host}/join?code=AB123`)).toBe('/join?code=AB123');
      expect(appLink(`https://${host}/session/AB123/results`)).toBe('/session/AB123/results');
      expect(appLink(`https://${host}/auth/callback?code=valid`)).toBe('/auth/callback?code=valid');
    }
    expect(appLink('https://dinder.it.com/list/8b428fa9-c59e-4c30-9667-57454db08704/cook')).toBe(
      '/list/8b428fa9-c59e-4c30-9667-57454db08704/cook'
    );
    for (const url of [
      'https://evil.test/join?code=AB123',
      'http://dinder.it.com/join?code=AB123',
      'https://dinder.it.com.evil.test/join?code=AB123',
      'https://u@dinder.it.com/join?code=AB123',
      'https://dinder.it.com:8000/join?code=AB123',
      'https://dinder.it.com/join?code=AB1234',
      'https://dinder.it.com/join?code=AB123#access_token=secret',
      'capacitor://localhost/join?code=AB123',
      'https://dinder.it.com/list/not-a-capability',
      'http://yupcrew.com/join?code=AB123',
      'https://yupcrew.com.evil.test/join?code=AB123',
      'https://u@yupcrew.com/join?code=AB123',
      'https://yupcrew.com:8000/join?code=AB123',
      'https://yupcrew.com/join?code=AB123#access_token=secret',
      'javascript:alert(1)',
    ])
      expect(appLink(url)).toBeNull();
  });

  it('uses YupCrew for native public links when no origin is configured', () => {
    vi.stubEnv('VITE_PUBLIC_ORIGIN', '');
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    expect(publicUrl('/join?code=AB123')).toBe('https://yupcrew.com/join?code=AB123');
  });
});
