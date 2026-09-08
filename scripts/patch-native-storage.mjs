import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// One pinned dependency fix: never fall back to plaintext or hide storage loss.
// Remove when upstream supplies and verifies equivalent failure behavior.
const cwd = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../node_modules/capacitor-secure-storage-plugin/package.json', import.meta.url)));
if (pkg.version !== '0.13.0') throw new Error('Review the native storage patch for this dependency version');
const patch = 'patches/capacitor-secure-storage-plugin+0.13.0.patch';
const run = (args) => spawnSync('git', ['apply', '--ignore-whitespace', ...args, patch], { cwd, encoding: 'utf8' });
if (run(['--reverse', '--check']).status !== 0) {
  const result = run([]);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Native storage patch failed: ${result.stderr}`);
}
