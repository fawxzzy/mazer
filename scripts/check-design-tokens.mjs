import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGitChangedFiles } from './check-decision-registry.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS_PATH = 'docs/contracts/mazer-ui-rework-design-tokens.v1.json';
const DECISION_REGISTRY_PATH = 'docs/contracts/mazer-ui-rework-decision-registry.v1.json';
const CSS_PATH = 'src/theme/tokens.css';

export const readDesignTokens = (tokensPath = TOKENS_PATH, root = repoRoot) => (
  JSON.parse(readFileSync(resolve(root, tokensPath), 'utf8'))
);

export const readDecisionRegistryForTokens = (registryPath = DECISION_REGISTRY_PATH, root = repoRoot) => (
  JSON.parse(readFileSync(resolve(root, registryPath), 'utf8'))
);

const violation = (rule, path, message) => ({ rule, path, message });

// Derives the ordered list of {cssVar, value} pairs a spec-compliant tokens.css must declare,
// from the design-tokens registry alone. This is the single place that owns the
// token-path -> CSS-custom-property-name naming convention; scripts/check-design-tokens.mjs and
// tests/architecture/design-tokens-contract.test.ts both call this rather than re-deriving names.
export const deriveExpectedCssDeclarations = (registry) => {
  const prefix = registry?.cssVariablePrefix ?? '--mazer-token-';
  const tokens = registry?.tokens ?? {};
  const declarations = [];

  for (const [key, hex] of Object.entries(tokens.color ?? {})) {
    declarations.push({ cssVar: `${prefix}color-${key.replace(/\./g, '-')}`, value: hex });
  }

  for (const px of tokens.spacingPx ?? []) {
    declarations.push({ cssVar: `${prefix}spacing-${px}`, value: `${px}px` });
  }

  for (const [key, px] of Object.entries(tokens.radiusPx ?? {})) {
    declarations.push({ cssVar: `${prefix}radius-${key}`, value: `${px}px` });
  }

  for (const [key, px] of Object.entries(tokens.strokePx ?? {})) {
    declarations.push({ cssVar: `${prefix}stroke-${key}`, value: `${px}px` });
  }

  for (const [key, ms] of Object.entries(tokens.motionMs ?? {})) {
    declarations.push({ cssVar: `${prefix}motion-${key}`, value: `${ms}ms` });
  }

  if (tokens.touchTargetMinPx !== undefined) {
    declarations.push({ cssVar: `${prefix}touch-target-min`, value: `${tokens.touchTargetMinPx}px` });
  }
  if (tokens.preferredTouchTargetPx !== undefined) {
    declarations.push({ cssVar: `${prefix}touch-target-preferred`, value: `${tokens.preferredTouchTargetPx}px` });
  }

  if (tokens.fonts?.ui) {
    declarations.push({ cssVar: `${prefix}font-ui`, value: tokens.fonts.ui });
  }
  if (tokens.fonts?.metrics) {
    declarations.push({ cssVar: `${prefix}font-metrics`, value: tokens.fonts.metrics });
  }
  // tokens.fonts.title ("topology-rendered") is intentionally excluded: it is not a CSS font
  // stack, it flags that the title is rendered via the topology/path geometry source (Wave 2B/4D),
  // not set with `font-family`.

  return declarations;
};

const checkTokenShape = (registry) => {
  const violations = [];

  if (!registry?.themeId) {
    violations.push(violation('missing-theme-id', 'themeId', 'design token registry must declare a themeId.'));
  }
  if (registry?.canonicalThemeId !== registry?.themeId) {
    violations.push(violation(
      'canonical-theme-id-mismatch',
      'canonicalThemeId',
      `canonicalThemeId ("${registry?.canonicalThemeId}") must equal themeId ("${registry?.themeId}"); exactly one canonical theme is permitted.`
    ));
  }

  const legacyAliases = registry?.legacyThemeAliases ?? [];
  const aliasMap = registry?.archivedThemeAliasMap ?? {};
  for (const alias of legacyAliases) {
    if (!(alias in aliasMap)) {
      violations.push(violation(
        'legacy-alias-missing-mapping',
        `archivedThemeAliasMap.${alias}`,
        `legacy theme alias "${alias}" has no entry in archivedThemeAliasMap.`
      ));
    } else if (aliasMap[alias] !== registry.canonicalThemeId) {
      violations.push(violation(
        'legacy-alias-not-canonical',
        `archivedThemeAliasMap.${alias}`,
        `legacy theme alias "${alias}" maps to "${aliasMap[alias]}", expected canonical theme id "${registry.canonicalThemeId}".`
      ));
    }
  }
  for (const alias of Object.keys(aliasMap)) {
    if (!legacyAliases.includes(alias)) {
      violations.push(violation(
        'legacy-alias-unregistered',
        `archivedThemeAliasMap.${alias}`,
        `archivedThemeAliasMap has an entry for "${alias}" which is not listed in legacyThemeAliases.`
      ));
    }
  }

  return violations;
};

const checkDecisionRefs = (registry, root) => {
  const violations = [];
  let decisionRegistry;
  try {
    decisionRegistry = readDecisionRegistryForTokens(DECISION_REGISTRY_PATH, root);
  } catch {
    violations.push(violation(
      'decision-registry-unreadable',
      DECISION_REGISTRY_PATH,
      'could not read the decision registry to cross-check decisionRefs against.'
    ));
    return violations;
  }

  const knownIds = new Set((decisionRegistry.decisions ?? []).map((entry) => entry.id));
  for (const ref of registry?.decisionRefs ?? []) {
    if (!knownIds.has(ref)) {
      violations.push(violation(
        'unknown-decision-reference',
        'decisionRefs',
        `design token registry references unknown decision id "${ref}".`
      ));
    }
  }
  return violations;
};

const checkCssFile = (registry, root) => {
  const violations = [];
  const cssPath = resolve(root, CSS_PATH);
  if (!existsSync(cssPath)) {
    violations.push(violation('css-file-missing', CSS_PATH, `expected CSS token file at ${CSS_PATH} does not exist.`));
    return violations;
  }

  const css = readFileSync(cssPath, 'utf8');
  const expected = deriveExpectedCssDeclarations(registry);

  for (const { cssVar, value } of expected) {
    // Match `--mazer-token-foo: <value>;` allowing surrounding whitespace and an optional
    // trailing comment; value is matched literally (declarations are simple scalars, not
    // expressions), so this stays a straightforward regex rather than a full CSS parser.
    const escapedVar = cssVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`${escapedVar}\\s*:\\s*${escapedValue}\\s*;`);
    if (!pattern.test(css)) {
      violations.push(violation(
        'css-declaration-missing-or-mismatched',
        cssPath,
        `expected "${cssVar}: ${value};" in ${CSS_PATH}, not found (or value differs).`
      ));
    }
  }

  return violations;
};

export const collectDesignTokenViolations = (registry, root = repoRoot) => ([
  ...checkTokenShape(registry),
  ...checkDecisionRefs(registry, root),
  ...checkCssFile(registry, root)
]);

// Reused from scripts/check-decision-registry.mjs's protected-path convention: this wave must not
// touch any of PR #83/#82's collision files either, so the self-check is applied here too.
export const collectProtectedPathViolationsForTokens = (changedFiles, decisionRegistry) => {
  const protectedPaths = new Set(decisionRegistry?.prProtection?.protectedPaths ?? []);
  const violations = [];
  for (const file of changedFiles) {
    const normalized = file.replace(/\\/g, '/');
    if (protectedPaths.has(normalized)) {
      violations.push(violation(
        'protected-path-touched',
        normalized,
        `"${normalized}" is a PR #83/#82 protected path (prProtection.protectedPaths) and must not be modified by Wave 1B.`
      ));
    }
  }
  return violations;
};

// Delegates to scripts/check-decision-registry.mjs's readGitChangedFiles, which unions committed
// (base...HEAD) changes with uncommitted working-tree changes. Kept as its own exported name
// (rather than re-exporting readGitChangedFiles directly) so existing callers/tests that import
// readGitChangedFilesForTokens from this module keep working unchanged.
export const readGitChangedFilesForTokens = (root = repoRoot, options = {}) => (
  readGitChangedFiles(root, options)
);

export const formatViolations = (violations) => {
  if (violations.length === 0) {
    return 'Design token contract passed.';
  }
  return [
    'Design token contract failed:',
    ...violations.map((entry) => `- [${entry.rule}] ${entry.path}: ${entry.message}`)
  ].join('\n');
};

export const checkDesignTokens = (registry = readDesignTokens(), root = repoRoot) => {
  const violations = collectDesignTokenViolations(registry, root);
  if (violations.length > 0) {
    const error = new Error(formatViolations(violations));
    error.violations = violations;
    throw error;
  }
  return true;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    checkDesignTokens();
    console.log('Design token contract passed.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
