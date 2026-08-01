import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
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
