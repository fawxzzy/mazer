import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  archivedThemeAliasMap,
  CANONICAL_THEME_ID,
  designTokens,
  legacyThemeAliases,
  phaserMaterialAliases
} from '../../src/theme/tokens';

interface DesignTokenViolation {
  rule: string;
  path: string;
  message: string;
}

interface DesignTokenCheckerModule {
  readDesignTokens: (tokensPath?: string, root?: string) => Record<string, unknown>;
  readDecisionRegistryForTokens: (registryPath?: string, root?: string) => Record<string, unknown>;
  deriveExpectedCssDeclarations: (registry: Record<string, unknown>) => Array<{ cssVar: string; value: string }>;
  collectDesignTokenViolations: (registry: Record<string, unknown>, root?: string) => DesignTokenViolation[];
  collectProtectedPathViolationsForTokens: (
    changedFiles: string[],
    decisionRegistry: Record<string, unknown>,
    options?: { releasedPaths?: Iterable<string>; waveLabel?: string }
  ) => DesignTokenViolation[];
  readGitChangedFilesForTokens: (root?: string, options?: { baseRef?: string }) => string[];
  resolveCurrentGitBranchForTokens: (root?: string, explicitBranch?: string) => string | null;
  resolveReleasedProtectedPathsForTokens: (decisionRegistry: Record<string, unknown>, branchName: string | null) => Set<string>;
  formatViolations: (violations: DesignTokenViolation[]) => string;
  checkDesignTokens: (registry?: Record<string, unknown>, root?: string) => true;
}

const CHECKER_PATH = '../../scripts/check-design-tokens.mjs';

const loadChecker = async (): Promise<DesignTokenCheckerModule> => (
  import(CHECKER_PATH) as Promise<DesignTokenCheckerModule>
);

const cloneRegistry = (registry: Record<string, unknown>): any => JSON.parse(JSON.stringify(registry));

describe('Mazer UI rework design token contract', () => {
  it('passes with zero violations against the real, shipped token registry', async () => {
    const { readDesignTokens, collectDesignTokenViolations } = await loadChecker();
    const registry = readDesignTokens();
    expect(collectDesignTokenViolations(registry)).toEqual([]);
  });

  it('checkDesignTokens() does not throw for the real registry', async () => {
    const { checkDesignTokens } = await loadChecker();
    expect(() => checkDesignTokens()).not.toThrow();
  });

  it('fails when canonicalThemeId no longer matches themeId', async () => {
    const { readDesignTokens, collectDesignTokenViolations } = await loadChecker();
    const registry = cloneRegistry(await readDesignTokens());
    registry.canonicalThemeId = 'noir';

    const violations = collectDesignTokenViolations(registry);
    expect(violations.some((entry) => entry.rule === 'canonical-theme-id-mismatch')).toBe(true);
  });

  it('fails when a legacy theme alias has no archived mapping', async () => {
    const { readDesignTokens, collectDesignTokenViolations } = await loadChecker();
    const registry = cloneRegistry(await readDesignTokens());
    delete registry.archivedThemeAliasMap.noir;

    const violations = collectDesignTokenViolations(registry);
    expect(violations.some((entry) => entry.rule === 'legacy-alias-missing-mapping')).toBe(true);
  });

  it('fails when a legacy theme alias maps to something other than the canonical theme', async () => {
    const { readDesignTokens, collectDesignTokenViolations } = await loadChecker();
    const registry = cloneRegistry(await readDesignTokens());
    registry.archivedThemeAliasMap.noir = 'ember';

    const violations = collectDesignTokenViolations(registry);
    expect(violations.some((entry) => entry.rule === 'legacy-alias-not-canonical')).toBe(true);
  });

  it('fails when archivedThemeAliasMap has an entry not listed in legacyThemeAliases', async () => {
    const { readDesignTokens, collectDesignTokenViolations } = await loadChecker();
    const registry = cloneRegistry(await readDesignTokens());
    registry.archivedThemeAliasMap['not-a-registered-alias'] = registry.canonicalThemeId;

    const violations = collectDesignTokenViolations(registry);
    expect(violations.some((entry) => entry.rule === 'legacy-alias-unregistered')).toBe(true);
  });

  it('fails when decisionRefs references an unknown decision id', async () => {
    const { readDesignTokens, collectDesignTokenViolations } = await loadChecker();
    const registry = cloneRegistry(await readDesignTokens());
    registry.decisionRefs.push('this-decision-id-does-not-exist');

    const violations = collectDesignTokenViolations(registry);
    expect(violations.some((entry) => entry.rule === 'unknown-decision-reference')).toBe(true);
  });

  it('fails when the CSS file is missing an expected declaration', async () => {
    const { readDesignTokens, collectDesignTokenViolations } = await loadChecker();
    const registry = cloneRegistry(await readDesignTokens());
    // Introduce a token with no corresponding CSS declaration.
    registry.tokens.radiusPx.chip = 6;

    const violations = collectDesignTokenViolations(registry);
    expect(violations.some((entry) => entry.rule === 'css-declaration-missing-or-mismatched')).toBe(true);
  });

  it('derives the expected CSS variable names and values from the registry', async () => {
    const { readDesignTokens, deriveExpectedCssDeclarations } = await loadChecker();
    const registry = readDesignTokens();
    const declarations = deriveExpectedCssDeclarations(registry);

    expect(declarations).toContainEqual({ cssVar: '--mazer-token-color-bg-canvas', value: '#03070B' });
    expect(declarations).toContainEqual({ cssVar: '--mazer-token-spacing-16', value: '16px' });
    expect(declarations).toContainEqual({ cssVar: '--mazer-token-radius-panel', value: '12px' });
    expect(declarations).toContainEqual({ cssVar: '--mazer-token-stroke-focus', value: '3px' });
    expect(declarations).toContainEqual({ cssVar: '--mazer-token-motion-emphasis', value: '420ms' });
    expect(declarations).toContainEqual({ cssVar: '--mazer-token-touch-target-min', value: '44px' });
    // fonts.title is not a CSS declaration.
    expect(declarations.some((entry) => entry.cssVar.includes('font-title'))).toBe(false);
  });

  describe('src/theme/tokens.ts cross-check against the JSON registry', () => {
    it('exposes the same canonical theme id as the registry', async () => {
      const { readDesignTokens } = await loadChecker();
      const registry = readDesignTokens() as { canonicalThemeId: string };
      expect(CANONICAL_THEME_ID).toBe(registry.canonicalThemeId);
    });

    it('exposes the same color tokens as the registry', async () => {
      const { readDesignTokens } = await loadChecker();
      const registry = readDesignTokens() as { tokens: { color: Record<string, string> } };
      expect(designTokens.color).toEqual(registry.tokens.color);
    });

    it('derives Phaser numeric aliases that match the CSS hex colors', async () => {
      for (const [key, hex] of Object.entries(designTokens.color)) {
        const expectedNumber = parseInt(hex.replace(/^#/, ''), 16);
        expect(phaserMaterialAliases[key as keyof typeof phaserMaterialAliases]).toBe(expectedNumber);
      }
    });

    it('maps every legacy theme alias to the canonical theme id', async () => {
      const { readDesignTokens } = await loadChecker();
      const registry = readDesignTokens() as { legacyThemeAliases: string[]; canonicalThemeId: string };
      expect([...legacyThemeAliases].sort()).toEqual([...registry.legacyThemeAliases].sort());
      for (const alias of legacyThemeAliases) {
        expect(archivedThemeAliasMap[alias]).toBe(registry.canonicalThemeId);
      }
    });
  });

  describe('PR #83 / PR #82 protected-path self-check (reused from Wave 0A)', () => {
    it('flags a synthetic changed-file list that touches a protected path', async () => {
      const { readDecisionRegistryForTokens, collectProtectedPathViolationsForTokens } = await loadChecker();
      const decisionRegistry = await readDecisionRegistryForTokens();

      const violations = collectProtectedPathViolationsForTokens([
        'docs/contracts/mazer-ui-rework-design-tokens.v1.json',
        'src/scenes/MenuScene.ts'
      ], decisionRegistry);

      expect(violations.some((entry) => entry.rule === 'protected-path-touched' && entry.path === 'src/scenes/MenuScene.ts')).toBe(true);
    });

    it('does not flag Wave 1B\'s own new files', async () => {
      const { readDecisionRegistryForTokens, collectProtectedPathViolationsForTokens } = await loadChecker();
      const decisionRegistry = await readDecisionRegistryForTokens();

      const violations = collectProtectedPathViolationsForTokens([
        'docs/contracts/mazer-ui-rework-design-tokens.v1.json',
        'docs/architecture/MAZER-UI-REWORK-DESIGN-TOKENS.md',
        'scripts/check-design-tokens.mjs',
        'src/theme/tokens.ts',
        'src/theme/tokens.css',
        'tests/architecture/design-tokens-contract.test.ts'
      ], decisionRegistry);

      expect(violations).toEqual([]);
    });

    it('runs the same checker against this working tree\'s real committed-and-uncommitted changed files and finds no protected path touched (honoring any active, branch-scoped Wave 0B release)', async () => {
      const {
        readDecisionRegistryForTokens,
        collectProtectedPathViolationsForTokens,
        readGitChangedFilesForTokens,
        resolveCurrentGitBranchForTokens,
        resolveReleasedProtectedPathsForTokens
      } = await loadChecker();
      const decisionRegistry = await readDecisionRegistryForTokens();

      let changedFiles: string[];
      try {
        changedFiles = readGitChangedFilesForTokens();
      } catch {
        return;
      }

      const branchName = resolveCurrentGitBranchForTokens();
      const releasedPaths = resolveReleasedProtectedPathsForTokens(decisionRegistry, branchName);

      const violations = collectProtectedPathViolationsForTokens(changedFiles, decisionRegistry, { releasedPaths });
      expect(violations).toEqual([]);
    });

    // Confirms readGitChangedFilesForTokens (this module) actually delegates to the fixed,
    // committed-diff-aware readGitChangedFiles in scripts/check-decision-registry.mjs, rather than
    // retaining its own separate git-status-only implementation of the same bug. The thorough
    // fixture-based proof of the underlying fix lives in
    // tests/architecture/decision-registry-contract.test.ts; this just proves the delegation holds.
    it('regression: detects a fully-committed protected-path change even though `git status --short` is clean', async () => {
      const { readGitChangedFilesForTokens, collectProtectedPathViolationsForTokens, readDecisionRegistryForTokens } = await loadChecker();
      const decisionRegistry = await readDecisionRegistryForTokens();

      const root = mkdtempSync(join(tmpdir(), 'mazer-protected-path-fixture-tokens-'));
      const runGit = (...args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
      try {
        runGit('init', '-q', '-b', 'main');
        runGit('config', 'user.email', 'fixture@example.invalid');
        runGit('config', 'user.name', 'Protected Path Fixture');
        writeFileSync(join(root, 'README.md'), 'fixture baseline\n');
        runGit('add', 'README.md');
        runGit('commit', '-q', '-m', 'baseline');

        runGit('checkout', '-q', '-b', 'feature/protected-path-regression');
        mkdirSync(join(root, 'src', 'scenes'), { recursive: true });
        writeFileSync(join(root, 'src', 'scenes', 'MenuScene.ts'), '// disposable fixture edit, not the real file\n');
        runGit('add', 'src/scenes/MenuScene.ts');
        runGit('commit', '-q', '-m', 'touches a protected path, fully committed');

        expect(runGit('status', '--short').trim()).toBe('');

        const changedFiles = readGitChangedFilesForTokens(root, { baseRef: 'main' });
        expect(changedFiles).toContain('src/scenes/MenuScene.ts');

        const violations = collectProtectedPathViolationsForTokens(changedFiles, decisionRegistry);
        expect(violations.some((entry) => (
          entry.rule === 'protected-path-touched' && entry.path === 'src/scenes/MenuScene.ts'
        ))).toBe(true);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
