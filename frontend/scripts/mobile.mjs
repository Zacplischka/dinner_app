import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';

export function validateMobileEnvironment(mode, env) {
  if (!['development', 'staging', 'production'].includes(mode)) {
    throw new Error('Choose development, staging or production');
  }
  for (const key of ['VITE_BACKEND_URL', 'VITE_API_BASE_URL', 'VITE_PUBLIC_ORIGIN', 'VITE_SUPABASE_URL']) {
    if (!env[key] && mode === 'development' && key === 'VITE_SUPABASE_URL') continue;
    if (!env[key]) throw new Error(`${key} is required for a bundled app`);
    const url = new URL(env[key]);
    if (url.username || url.password || url.search || url.hash) {
      throw new Error(`${key} must not contain credentials, query parameters or a fragment`);
    }
    if (mode !== 'development' && (url.protocol !== 'https:' ||
      /^(localhost$|[0-9.]+$|\[)/.test(url.hostname) ||
      /\.(localhost|local|test|invalid)$/.test(url.hostname))) {
      throw new Error(`${key} must be a public HTTPS endpoint for ${mode}`);
    }
    if (key === 'VITE_PUBLIC_ORIGIN' && url.pathname !== '/') {
      throw new Error('VITE_PUBLIC_ORIGIN must be an origin without a path');
    }
  }
  const key = env.VITE_SUPABASE_ANON_KEY ?? '';
  let role;
  try { role = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString()).role; }
  catch { /* Publishable keys are not JWTs. */ }
  if (key.startsWith('sb_secret_') || role === 'service_role') {
    throw new Error('Never distribute a Supabase secret or service-role key');
  }
  if (mode !== 'development' && !key) throw new Error('Configure a public Supabase key before a release build');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  const mode = process.argv[2] ?? 'development';
  const env = { ...process.env, ...loadEnv(mode, cwd), VITE_NATIVE_BUILD: 'true' };
  validateMobileEnvironment(mode, env);
  for (const [command, ...args] of [
    [process.execPath, fileURLToPath(new URL('../../scripts/patch-native-storage.mjs', import.meta.url))],
    ['npx', 'tsc', '--noEmit'], ['npx', 'vite', 'build', '--mode', mode], ['npx', 'cap', 'sync'],
  ]) {
    const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
