import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as mobile from '../frontend/scripts/mobile.mjs';
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

const production = {
  VITE_BACKEND_URL: 'https://api.example.com',
  VITE_API_BASE_URL: 'https://api.example.com/api',
  VITE_PUBLIC_ORIGIN: 'https://www.example.com',
  VITE_SUPABASE_URL: 'https://project.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'sb_publishable_example',
};

function bundle(t, mode = 'production') {
  const root = mkdtempSync(join(tmpdir(), 'mobile-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'public/assets'), { recursive: true });
  writeFileSync(join(root, 'public/index.html'), '<script src="assets/app.js"></script>');
  writeFileSync(join(root, 'public/assets/app.js'), 'console.log("production");');
  writeFileSync(join(root, 'capacitor.config.json'), JSON.stringify({ server: { androidScheme: 'https' } }));
  mobile.recordMobileBundle(root, mode, { ...production, OPERATOR_SECRET: 'never-copy-this' });
  return root;
}

test('production verification reads the copied bundle and records only public settings', (t) => {
  const root = bundle(t);
  assert.doesNotThrow(() => mobile.verifyMobileBundle(root, production));
  const receipt = readFileSync(join(root, 'public/mobile-build.json'), 'utf8');
  assert.equal(receipt.includes('OPERATOR_SECRET'), false);
  assert.equal(receipt.includes('never-copy-this'), false);
  assert.equal(JSON.parse(receipt).configuration.VITE_NATIVE_BUILD, 'true');
});

test('a direct Release verification after development or staging preparation is rejected', (t) => {
  for (const mode of ['development', 'staging']) {
    assert.throws(() => mobile.verifyMobileBundle(bundle(t, mode), production), /production preparation/);
  }
});

test('stale, missing and additional copied bytes cannot pass a production receipt', (t) => {
  for (const file of ['index.html', 'assets/app.js']) {
    const root = bundle(t);
    writeFileSync(join(root, 'public', file), 'stale development bytes');
    assert.throws(() => mobile.verifyMobileBundle(root, production), /copied assets/);
  }
  const missing = bundle(t);
  rmSync(join(missing, 'public/assets/app.js'));
  assert.throws(() => mobile.verifyMobileBundle(missing, production), /copied assets/);
  const extra = bundle(t);
  writeFileSync(join(extra, 'public/assets/stale.js'), 'stale development bytes');
  assert.throws(() => mobile.verifyMobileBundle(extra, production), /copied assets/);
});

test('Release rejects changed intended settings, missing receipts and invalid public configuration', (t) => {
  const root = bundle(t);
  for (const key of Object.keys(production)) {
    const changed = key === 'VITE_SUPABASE_ANON_KEY' ? 'sb_publishable_rotated' : 'https://changed.example.com';
    assert.throws(() => mobile.verifyMobileBundle(root, { ...production, [key]: changed }), /production settings/);
    assert.throws(() => mobile.verifyMobileBundle(root, { ...production, [key]: '' }));
  }
  assert.throws(() => mobile.verifyMobileBundle(root, { ...production, VITE_BACKEND_URL: 'http://localhost:3458' }));
  rmSync(join(root, 'public/mobile-build.json'));
  assert.throws(() => mobile.verifyMobileBundle(root, production));
});

test('Release rejects changed or remote Capacitor configuration', (t) => {
  const root = bundle(t);
  writeFileSync(join(root, 'capacitor.config.json'), JSON.stringify({ server: { androidScheme: 'http' } }));
  assert.throws(() => mobile.verifyMobileBundle(root, production), /Capacitor configuration/);
  writeFileSync(join(root, 'capacitor.config.json'), JSON.stringify({ server: { url: 'https://www.example.com' } }));
  assert.throws(() => mobile.recordMobileBundle(root, 'production', production), /server.url/);
  assert.throws(() => mobile.verifyMobileBundle(root, production), /server.url/);
});

test('a native build using a symlinked checkout cannot silently skip the verifier CLI', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'mobile-entrypoint-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const entrypoint = join(root, 'mobile.mjs');
  symlinkSync(fileURLToPath(new URL('../frontend/scripts/mobile.mjs', import.meta.url)), entrypoint);
  const result = spawnSync(process.execPath, [entrypoint, 'verify-release', 'unsupported-platform'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Mobile release guard: Choose ios or android/);
});
