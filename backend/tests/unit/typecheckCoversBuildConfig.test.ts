// The tests' tsconfig widens rootDir to the backend workspace so tests/ can be
// part of the program. That silences TS6059 — the error that catches a src/
// file importing something outside src/ — and the backend is never built in
// CI, only on Railway from main. So the root typecheck has to run the build
// config as well as the test config; this asserts it still does (#397).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('npm run typecheck', () => {
  const typecheck: string = JSON.parse(read('../../../package.json')).scripts.typecheck;

  it('typechecks the backend build config, not just the test config', () => {
    const projects = [...typecheck.matchAll(/-p\s+(\S+)/g)].map((m) => m[1]);
    expect(projects).toContain('backend');
    expect(projects).toContain('backend/tsconfig.test.json');
  });

  it('leaves the build config the rootDir tripwire to enforce', () => {
    // JSON with comments: strip line comments before parsing.
    const build = JSON.parse(read('../../tsconfig.json').replace(/^\s*\/\/.*$/gm, ''));
    expect(build.compilerOptions.rootDir).toBe('./src');
    expect(build.exclude).toContain('tests');
  });
});
