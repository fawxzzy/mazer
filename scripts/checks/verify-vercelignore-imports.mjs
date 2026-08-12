/**
 * Regression guard for the class of bug fixed alongside this script: three
 * real runtime imports (src/theme/tokens.ts, src/state/uiState.ts,
 * src/geometry/topologyPath.ts -> docs/contracts/*.v1.json) silently broke
 * every `vercel deploy` of `main` for an unknown period, because
 * .vercelignore excluded `docs/` wholesale while every local/CI build
 * (which is never filtered by .vercelignore) stayed green. Nobody noticed
 * until an actual `vercel deploy` was attempted.
 *
 * This script statically resolves every local (relative) import reachable
 * from files under src/, and fails if any of them resolve to a path that
 * .vercelignore would exclude from a Vercel upload -- i.e. it proves "every
 * real runtime import target survives .vercelignore filtering" without
 * needing an actual network deploy to find out.
 *
 * Deliberately does NOT implement full gitignore-style negation matching.
 * .vercelignore in this repo intentionally avoids negation patterns (see
 * the comment above `docs/architecture/` in .vercelignore): a
 * `docs/*` + `!docs/contracts/` negation pair was tried first and, even
 * though it is honored correctly by git's own ignore engine, was confirmed
 * live against a real `vercel deploy` to NOT be honored by Vercel's upload
 * filter (build still failed with the same TS2307 errors, uploaded file
 * count did not change). So every pattern in .vercelignore today is a
 * plain literal/prefix exclusion, and this checker treats a `!`-prefixed
 * pattern or a pattern containing a glob character (`*`, `?`, `[`) as
 * "cannot safely reason about statically" and fails loudly rather than
 * silently assuming it works -- forcing a human to re-verify against a
 * real deploy (as this fix's own commit message documents) before relying
 * on it again.
 *
 * Usage: node ./scripts/checks/verify-vercelignore-imports.mjs
 * Exit code 0 = clean, 1 = violation(s) found or an unsupported pattern
 * shape was encountered.
 *
 * Wired into scripts/build/run-build.mjs so `npm run build` runs it
 * automatically (locally, in CI, and -- harmlessly, as a guaranteed pass --
 * inside Vercel's own remote build). Not exposed as its own top-level
 * package.json script because package.json is a protected path
 * (docs/contracts/mazer-ui-rework-decision-registry.v1.json
 * prProtection.protectedPaths) owned by PR #83/#82's Wave 0B reconciliation,
 * not this lane.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC_ROOT = join(REPO_ROOT, 'src');
const VERCELIGNORE_PATH = join(REPO_ROOT, '.vercelignore');

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const RESOLVE_EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.json', '.mjs', '.cjs'];
const INDEX_BASENAMES = ['index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.mjs', 'index.cjs'];

const toPosix = (p) => p.split('\\').join('/');

function walkSourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walkSourceFiles(full, out);
    } else if (CODE_EXTENSIONS.has(extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

function parseVercelignore() {
  const raw = readFileSync(VERCELIGNORE_PATH, 'utf8');
  const patterns = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    patterns.push(line);
  }
  return patterns;
}

// Converts a single glob pattern (using only `*` and `?`, gitignore-style:
// `*` matches any run of characters except `/`, `?` matches exactly one
// non-`/` character) into a RegExp that must fully match the string it is
// tested against.
function globToRegExp(glob) {
  let out = '';
  for (const ch of glob) {
    if (ch === '*') out += '[^/]*';
    else if (ch === '?') out += '[^/]';
    else out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

// Returns the matching pattern string if relPosixPath is excluded, or
// { unsupported: pattern } if a pattern shape this checker can't safely
// reason about statically (negation, or a glob containing `/`) is present
// -- callers should treat that as a hard failure regardless of whether it
// happened to match the path in question. Basename-only globs (no `/` in
// the pattern, e.g. `*.log`) ARE supported: gitignore matches those against
// the basename at any depth, and none of this repo's basename globs can
// ever match a resolved src/ import target, so real coverage isn't lost by
// handling them precisely instead of refusing to reason about them.
function buildMatcher(patterns) {
  const negations = patterns.filter((p) => p.startsWith('!'));
  const slashedGlobs = patterns.filter((p) => !p.startsWith('!') && /[*?[\]]/.test(p) && p.replace(/\/$/, '').includes('/'));
  const unsupported = [...negations, ...slashedGlobs];

  const literalPatterns = patterns.filter((p) => !unsupported.includes(p) && !/[*?[\]]/.test(p));
  const basenameGlobs = patterns.filter((p) => !unsupported.includes(p) && /[*?[\]]/.test(p));
  const basenameGlobRegexes = basenameGlobs.map((p) => ({ pattern: p, re: globToRegExp(p) }));

  const isExcluded = (relPosixPath) => {
    for (const pattern of literalPatterns) {
      const anchored = pattern.startsWith('/');
      const body = anchored ? pattern.slice(1) : pattern;
      const dirOnly = body.endsWith('/');
      const clean = dirOnly ? body.slice(0, -1) : body;
      if (relPosixPath === clean || relPosixPath.startsWith(`${clean}/`)) {
        return pattern;
      }
    }
    const basename = relPosixPath.split('/').pop();
    for (const { pattern, re } of basenameGlobRegexes) {
      if (re.test(basename)) return pattern;
    }
    return null;
  };

  return { isExcluded, unsupported };
}

function resolveLocalImport(fromFile, specifier) {
  const base = dirname(fromFile);
  const target = resolve(base, specifier);

  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = target + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  if (existsSync(target) && statSync(target).isDirectory()) {
    for (const indexName of INDEX_BASENAMES) {
      const candidate = join(target, indexName);
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
  }
  return null;
}

const IMPORT_SPECIFIER_RE =
  /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](\.[^'"]*)['"]/g;

function extractLocalImportSpecifiers(source) {
  const specs = [];
  IMPORT_SPECIFIER_RE.lastIndex = 0;
  let match;
  while ((match = IMPORT_SPECIFIER_RE.exec(source))) {
    specs.push(match[1]);
  }
  return specs;
}

function main() {
  const patterns = parseVercelignore();
  const { isExcluded, unsupported } = buildMatcher(patterns);

  if (unsupported.length > 0) {
    console.error(
      'verify-vercelignore-imports: .vercelignore contains pattern(s) this checker ' +
        'cannot safely evaluate statically (negation or glob), so it cannot guarantee ' +
        'runtime imports survive them. Re-verify with a real `vercel deploy` and, if the ' +
        'pattern is legitimate, extend this checker to model it explicitly rather than ' +
        'assuming it works:\n'
    );
    for (const pattern of unsupported) {
      console.error(`  ${pattern}`);
    }
    process.exit(1);
  }

  const sourceFiles = walkSourceFiles(SRC_ROOT);
  const violations = [];
  let checkedImportCount = 0;

  for (const file of sourceFiles) {
    const source = readFileSync(file, 'utf8');
    for (const specifier of extractLocalImportSpecifiers(source)) {
      const resolved = resolveLocalImport(file, specifier);
      if (!resolved) continue; // bare specifier, or genuinely missing (tsc already catches that case)
      checkedImportCount += 1;

      const relFromRoot = toPosix(relative(REPO_ROOT, resolved));
      const matchedPattern = isExcluded(relFromRoot);
      if (matchedPattern) {
        violations.push({
          file: toPosix(relative(REPO_ROOT, file)),
          specifier,
          resolvedTo: relFromRoot,
          excludedBy: matchedPattern
        });
      }
    }
  }

  if (violations.length > 0) {
    console.error(
      `verify-vercelignore-imports: ${violations.length} runtime import(s) resolve to a ` +
        'path .vercelignore excludes from Vercel uploads. These will build locally/in CI ' +
        '(unfiltered by .vercelignore) but fail remotely on `vercel deploy` with a ' +
        'TS2307-style module-resolution error:\n'
    );
    for (const v of violations) {
      console.error(
        `  ${v.file} imports '${v.specifier}' -> ${v.resolvedTo} ` +
          `(excluded by .vercelignore pattern "${v.excludedBy}")`
      );
    }
    console.error(
      '\nFix by either relocating the imported file out of the excluded path, or adding an ' +
        'explicit carve-out in .vercelignore for the specific path(s) actually needed ' +
        '(verify any carve-out against a real `vercel deploy`, not just this script or a ' +
        'local build -- see the comment in .vercelignore for why).'
    );
    process.exit(1);
  }

  console.log(
    `verify-vercelignore-imports: OK -- ${checkedImportCount} resolvable relative import(s) ` +
      `under src/ checked across ${sourceFiles.length} source file(s), none excluded by .vercelignore.`
  );
}

main();
