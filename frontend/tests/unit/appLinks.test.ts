import { describe, expect, it, vi } from 'vitest';
import { appLink } from '../../src/services/appLinks';
import { publicUrl } from '../../src/services/device';

describe('public app links', () => {
  it('keeps only supported HTTPS routes on owned hosts and shares the public origin', () => {
    vi.stubEnv('VITE_PUBLIC_ORIGIN', 'https://www.dinder.it.com');
    expect(publicUrl('/join?code=AB123')).toBe('https://www.dinder.it.com/join?code=AB123');
    for (const path of ['//evil.test', '/\\evil.test', 'https://evil.test', '/\n/evil.test'])
      expect(() => publicUrl(path)).toThrow('Invalid public path');
    expect(appLink('https://dinder.it.com/join?code=AB123')).toBe('/join?code=AB123');
    expect(appLink('https://www.dinder.it.com/session/AB123/results')).toBe(
      '/session/AB123/results'
    );
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
      'javascript:alert(1)',
    ])
      expect(appLink(url)).toBeNull();
    vi.unstubAllEnvs();
  });
});
