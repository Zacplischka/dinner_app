// Offline comment-path validator (#295). The largest class of comment rot
// found by the sweep was pointers at deleted documentation (16 files citing a
// deleted specs/ tree, 2 citing a deleted docs/specs file). This walks the
// comment text of the backend, frontend and shared sources, extracts anything
// shaped like a repository-relative documentation path, and reports the ones
// that do not resolve on disk. No network, no credentials — pure functions
// here, asserted by check-comment-paths.test.mjs in the lint job, exactly like
// check-production-edge.mjs.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const SOURCE_ROOTS = ['backend/src', 'frontend/src', 'shared/types'];

/** Every line and block comment segment of a source text. */
export function extractComments(text) {
  return [...text.matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g)].map((m) => m[0]);
}

/**
 * Repository-relative documentation paths cited in a comment: anything under
 * docs/ or specs/, and any multi-segment .md/.yaml path. Route paths, URLs and
 * import specifiers don't fit either shape and are ignored.
 */
export function extractDocPaths(comment) {
  const paths = [];
  for (const [token] of comment.matchAll(/[\w./-]+/g)) {
    const cleaned = token.replace(/^\.\//, '').replace(/[.,;:]+$/, '');
    if (/^(docs|specs)\//.test(cleaned) || /^[\w-]+(\/[\w.-]+)+\.(md|ya?ml)$/.test(cleaned)) {
      paths.push(cleaned);
    }
  }
  return paths;
}

/** Every { file, ref } where a comment cites a path that does not exist. */
export function findDanglingDocPaths(repoRoot, roots = SOURCE_ROOTS) {
  const dangling = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) {
        const text = readFileSync(full, 'utf8');
        for (const comment of extractComments(text)) {
          for (const ref of extractDocPaths(comment)) {
            if (!existsSync(join(repoRoot, ref))) dangling.push({ file: full, ref });
          }
        }
      }
    }
  };
  for (const root of roots) walk(join(repoRoot, root));
  return dangling;
}
