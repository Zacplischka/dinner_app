import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMobileEnvironment } from '../frontend/scripts/mobile.mjs';

test('release configuration refuses development services and privileged keys before bundling', () => {
  const env = {
    VITE_BACKEND_URL: 'https://api.dinder.it.com',
    VITE_API_BASE_URL: 'https://api.dinder.it.com/api',
    VITE_PUBLIC_ORIGIN: 'https://www.dinder.it.com',
    VITE_SUPABASE_URL: 'https://project.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'sb_publishable_example',
  };
  assert.doesNotThrow(() => validateMobileEnvironment('production', env));
  for (const bad of [
    'http://api.dinder.it.com',
    'https://localhost',
    'https://127.0.0.1',
    'https://[::1]',
    'https://dev.local',
    'https://name:secret@api.dinder.it.com',
  ]) {
    assert.throws(() =>
      validateMobileEnvironment('production', { ...env, VITE_SUPABASE_URL: bad })
    );
  }
  assert.throws(() => validateMobileEnvironment('production', { ...env, VITE_PUBLIC_ORIGIN: '' }));
  for (const key of [
    'sb_secret_example',
    `header.${Buffer.from('{"role":"service_role"}').toString('base64url')}.signature`,
  ]) {
    assert.throws(() =>
      validateMobileEnvironment('production', { ...env, VITE_SUPABASE_ANON_KEY: key })
    );
  }
  assert.doesNotThrow(() =>
    validateMobileEnvironment('development', {
      ...env,
      VITE_BACKEND_URL: 'http://localhost:3458',
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    })
  );
});
