import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extractComments, extractDocPaths, findDanglingDocPaths } from './check-comment-paths.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

test('extracts doc paths from comments, resolving and dangling alike', () => {
  assert.deepEqual(extractDocPaths('// see docs/branching.md for the convention'), [
    'docs/branching.md',
  ]);
  assert.deepEqual(extractDocPaths('// Based on: specs/001-x/contracts/openapi.yaml'), [
    'specs/001-x/contracts/openapi.yaml',
  ]);
  // A trailing sentence period is punctuation, not part of the path.
  assert.deepEqual(extractDocPaths('/* per docs/adr/0007-contracts.md. */'), [
    'docs/adr/0007-contracts.md',
  ]);
});

test('path-like strings that are not documentation references are ignored', () => {
  assert.deepEqual(extractDocPaths('// GET /api/sessions/:code returns 404'), []);
  assert.deepEqual(extractDocPaths("// import from '../store/sessionStore.js'"), []);
  assert.deepEqual(extractDocPaths('// https://example.com/docs/guide.md hosts it'), [], 'URLs');
  assert.deepEqual(extractDocPaths('// a plain CONTEXT.md mention has no slash'), []);
});

test('only comment text is scanned, never code', () => {
  const code = "const route = 'specs/live/route.md';\n// but specs/cited/here.md is\n";
  const refs = extractComments(code).flatMap(extractDocPaths);
  assert.deepEqual(refs, ['specs/cited/here.md']);
});

// Prove the walker actually fails: a fixture tree with one resolving and one
// dangling citation must report exactly the dangling one. Without this, an
// inverted existsSync would pass every other test.
test('a dangling citation in a source tree is reported, a resolving one is not', () => {
  const root = mkdtempSync(join(tmpdir(), 'comment-paths-'));
  try {
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'docs'));
    writeFileSync(join(root, 'docs', 'real.md'), 'exists');
    writeFileSync(
      join(root, 'src', 'a.ts'),
      '// per docs/real.md, unlike specs/deleted/plan.md\n'
    );
    assert.deepEqual(findDanglingDocPaths(root, ['src']), [
      { file: join(root, 'src', 'a.ts'), ref: 'specs/deleted/plan.md' },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The check itself: the sweep (#295) removed every dangling documentation
// reference from the source tree, and this keeps it that way. A commit that
// deletes a doc file cited by a comment fails here, naming file and path.
test('no comment in backend, frontend or shared sources cites a missing repository path', () => {
  const dangling = findDanglingDocPaths(repoRoot);
  assert.deepEqual(
    dangling,
    [],
    `comments cite repository paths that do not exist:\n${dangling
      .map(({ file, ref }) => `  ${file} -> ${ref}`)
      .join('\n')}`
  );
});
