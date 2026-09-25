// #427: Vitest strips types; the root command must check test fixtures too.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('includes the frontend test config (src + tests) in the root typecheck', () => {
  const root = JSON.parse(readFileSync(resolve(process.cwd(), '../package.json'), 'utf8'));
  const projects = [...root.scripts.typecheck.matchAll(/-p\s+(\S+)/g)].map((m) => m[1]);
  expect(projects).toContain('frontend/tsconfig.test.json');
});
