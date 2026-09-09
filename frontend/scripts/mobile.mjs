import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { loadEnv } from 'vite';

const frontend = fileURLToPath(new URL('../', import.meta.url));
const nativeRoots = {
  ios: join(frontend, 'ios/App/App'),
  android: join(frontend, 'android/app/src/main/assets'),
};
const receiptName = 'mobile-build.json';
const publicKeys = [
  'VITE_BACKEND_URL', 'VITE_API_BASE_URL', 'VITE_PUBLIC_ORIGIN',
  'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY',
];

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

function publicConfiguration(env) {
  return { ...Object.fromEntries(publicKeys.map((key) => [key, env[key] ?? ''])), VITE_NATIVE_BUILD: 'true' };
}

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function copiedAssets(root, directory = '') {
  return readdirSync(join(root, directory), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = directory ? `${directory}/${entry.name}` : entry.name;
      if (path === receiptName) return [];
      if (entry.isDirectory()) return copiedAssets(root, path);
      if (!entry.isFile()) throw new Error('Copied assets must be regular files, not symbolic links');
      return [[path, hashFile(join(root, path))]];
    });
}

function capacitorHash(root) {
  const path = join(root, 'capacitor.config.json');
  const config = JSON.parse(readFileSync(path, 'utf8'));
  if (config.server && Object.hasOwn(config.server, 'url')) {
    throw new Error('Capacitor server.url is forbidden: release code must be bundled');
  }
  return hashFile(path);
}

export function recordMobileBundle(root, mode, env) {
  validateMobileEnvironment(mode, env);
  const assets = Object.fromEntries(copiedAssets(join(root, 'public')));
  if (!assets['index.html']) throw new Error('Copied assets are missing index.html');
  const receipt = { version: 1, mode, configuration: publicConfiguration(env), assets, capacitorHash: capacitorHash(root) };
  writeFileSync(join(root, 'public', receiptName), `${JSON.stringify(receipt, null, 2)}\n`);
}

export function verifyMobileBundle(root, env) {
  validateMobileEnvironment('production', env);
  const receipt = JSON.parse(readFileSync(join(root, 'public', receiptName), 'utf8'));
  if (receipt.version !== 1 || receipt.mode !== 'production') {
    throw new Error('Release requires production preparation');
  }
  if (JSON.stringify(receipt.configuration) !== JSON.stringify(publicConfiguration(env))) {
    throw new Error('Intended production settings differ from the copied bundle');
  }
  if (receipt.capacitorHash !== capacitorHash(root)) {
    throw new Error('Copied Capacitor configuration changed after preparation');
  }
  const assets = Object.fromEntries(copiedAssets(join(root, 'public')));
  if (!assets['index.html'] || JSON.stringify(receipt.assets) !== JSON.stringify(assets)) {
    throw new Error('The copied assets changed or are missing after preparation');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  if (process.argv[2] === 'verify-release') {
    try {
      const root = nativeRoots[process.argv[3]];
      if (!root) throw new Error('Choose ios or android');
      verifyMobileBundle(root, loadEnv('production', frontend));
      console.log(`Verified ${process.argv[3]} production bundle`);
    } catch (error) {
      console.error(`Mobile release guard: ${error.message}. Configure production settings and run npm run mobile:sync --workspace=frontend -- production.`);
      process.exit(1);
    }
    process.exit(0);
  }
  const cwd = frontend;
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
  for (const root of Object.values(nativeRoots)) recordMobileBundle(root, mode, env);
}
