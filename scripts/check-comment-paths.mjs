// Offline comment-path validator (#295). The largest class of comment rot
// found by the sweep was pointers at deleted documentation (16 files citing a
// deleted specs/ tree, 2 citing a deleted docs/specs file). This walks the
// comment text of the backend, frontend and shared sources, extracts anything
// shaped like a repository-relative documentation path, and reports the ones
// that do not resolve on disk. No network, no credentials — pure functions
// here, asserted by check-comment-paths.test.mjs in the lint job, exactly like
// check-production-edge.mjs.
//
// Committed Markdown (`git ls-files '*.md'`) is scanned too, since the repo's
// documentation is mostly cross-links. One resolution rule, by how each cite is
// read: a link target `](path)` resolves from the citing file's directory, the
// way GitHub renders it; a backticked path resolves from the repo root, the
// same convention as a code comment. URLs, same-page anchors and fenced code
// are skipped; a link's `#fragment` is dropped before resolving.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';

const SOURCE_ROOTS = ['backend/src', 'frontend/src', 'shared/types'];

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

/**
 * Repository paths cited by a Markdown text, each with the directory it
 * resolves from (see the header): link targets from the citing file,
 * backticked tokens of extractDocPaths' shape from the repo root.
 */
export function extractMarkdownPaths(text, file) {
  const prose = text.replace(/```[\s\S]*?```/g, '');
  const refs = [];
  for (const [, target] of prose.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^[a-z][\w+.-]*:/i.test(target) || target.startsWith('#')) continue;
    refs.push({ ref: target.replace(/#.*$/, ''), from: dirname(file) });
  }
  for (const [, code] of prose.matchAll(/`([^`\n]+)`/g)) {
    for (const ref of extractDocPaths(code)) refs.push({ ref, from: '.' });
  }
  return refs;
}

// ponytail: .claude/ skipped wholesale - its vendored skill docs use example
// paths (`specs/x.plan.md`) that read as cites. List vendored dirs one by one
// if a repo-authored skill's cite ever rots unnoticed.
export function trackedMarkdown(repoRoot) {
  return execFileSync('git', ['ls-files', '*.md'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && !f.startsWith('.claude/'));
}

/** Every { file, ref } where a Markdown file links or cites a path that does not exist. */
export function findDanglingMarkdownPaths(repoRoot, files = trackedMarkdown(repoRoot)) {
  const dangling = [];
  for (const file of files) {
    const text = readFileSync(join(repoRoot, file), 'utf8');
    for (const { ref, from } of extractMarkdownPaths(text, file)) {
      if (!existsSync(join(repoRoot, from, ref)))
        dangling.push({ file: join(repoRoot, file), ref });
    }
  }
  return dangling;
}
