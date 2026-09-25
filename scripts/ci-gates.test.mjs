// #472: core checks must run on every PR and gate a verified production release.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/ci-cd.yml', import.meta.url), 'utf8');

test('core checks always report and production verification waits for all of them', () => {
  assert.doesNotMatch(workflow.split('jobs:')[0], /paths(?:-ignore)?:/);
  const jobs = Object.fromEntries(
    [...workflow.matchAll(/^  ([\w-]+):\n([\s\S]*?)(?=^  [\w-]+:|$(?![\s\S]))/gm)].map((match) => [
      match[1],
      match[2],
    ])
  );
  // The Playwright e2e job is gone: CI stays a ~1-2 min gate, and browser
  // flows are proven per change by a local playwright run instead.
  const required = ['lint', 'contract-tests', 'integration-tests'];
  const needs = jobs['verify-production-deploy']
    .match(/needs: \[([^\]]+)\]/)[1]
    .split(',')
    .map((id) => id.trim());
  for (const id of required) {
    assert.ok(jobs[id], `missing core job ${id}`);
    assert.doesNotMatch(jobs[id], /^    if:/m, `${id} must always report`);
    assert.ok(needs.includes(id), `production verification must wait for ${id}`);
    assert.doesNotMatch(jobs[id], /continue-on-error:\s*true/);
  }
  assert.match(jobs['integration-tests'], /npm run test:integration/);
});
