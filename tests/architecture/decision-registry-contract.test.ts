import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface DecisionRegistryViolation {
  rule: string;
  path: string;
  message: string;
}

interface DecisionRegistryCheckerModule {
  readDecisionRegistry: (registryPath?: string) => Record<string, unknown>;
  collectDecisionRegistryViolations: (registry: Record<string, unknown>) => DecisionRegistryViolation[];
  collectEntrypointExistenceViolations: (registry: Record<string, unknown>, root?: string) => DecisionRegistryViolation[];
  collectProtectedPathViolations: (changedFiles: string[], registry: Record<string, unknown>) => DecisionRegistryViolation[];
  readGitChangedFiles: (root?: string, options?: { baseRef?: string }) => string[];
  formatViolations: (violations: DecisionRegistryViolation[]) => string;
  checkDecisionRegistry: (registry?: Record<string, unknown>, root?: string) => true;
}

const CHECKER_PATH = '../../scripts/check-decision-registry.mjs';

const loadChecker = async (): Promise<DecisionRegistryCheckerModule> => (
  import(CHECKER_PATH) as Promise<DecisionRegistryCheckerModule>
);

// Deep-clones the real registry so each test can mutate its own private copy without
// affecting the on-disk source of truth or other tests.
const cloneRegistry = (registry: Record<string, unknown>): any => JSON.parse(JSON.stringify(registry));

describe('Mazer UI rework decision registry contract', () => {
  it('passes with zero violations against the real, shipped registry', async () => {
    const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
    const registry = readDecisionRegistry();
    expect(collectDecisionRegistryViolations(registry)).toEqual([]);
  });

  it('cross-checks every registered entrypoint against the live repository and finds them all present', async () => {
    const { readDecisionRegistry, collectEntrypointExistenceViolations } = await loadChecker();
    const registry = readDecisionRegistry();
    expect(collectEntrypointExistenceViolations(registry)).toEqual([]);
  });

  it('checkDecisionRegistry() does not throw for the real registry', async () => {
    const { checkDecisionRegistry } = await loadChecker();
    expect(() => checkDecisionRegistry()).not.toThrow();
  });

  it('fails when a second theme is registered as canonical/public', async () => {
    const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
    const registry = cloneRegistry(await readDecisionRegistry());
    // Promote the already-archived "noir" entry to canonical/public, so we now have two
    // canonical/public themes without also introducing a duplicate theme id (a distinct
    // failure mode covered by its own test).
    const noirEntry = registry.themes.registry.find((entry: any) => entry.id === 'noir');
    noirEntry.role = 'canonical';
    noirEntry.public = true;

    const violations = collectDecisionRegistryViolations(registry);
    expect(violations.some((entry) => entry.rule === 'multiple-canonical-themes')).toBe(true);
  });

  it('fails when zero themes are registered as canonical/public', async () => {
    const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
    const registry = cloneRegistry(await readDecisionRegistry());
    registry.themes.registry = registry.themes.registry.map((entry: any) => (
      entry.role === 'canonical' ? { ...entry, role: 'archived', public: false } : entry
    ));

    const violations = collectDecisionRegistryViolations(registry);
    expect(violations.some((entry) => entry.rule === 'no-canonical-theme')).toBe(true);
  });

  it('fails when an output profile is mislabeled as a theme (kind)', async () => {
    const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
    const registry = cloneRegistry(await readDecisionRegistry());
    const mobileProfile = registry.profiles.registry.find((entry: any) => entry.id === 'mobile');
    mobileProfile.kind = 'theme';

    const violations = collectDecisionRegistryViolations(registry);
    expect(violations.some((entry) => entry.rule === 'profile-mislabeled-as-theme')).toBe(true);
  });

  it('fails when an output profile id is also registered as a canonical theme', async () => {
    const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
    const registry = cloneRegistry(await readDecisionRegistry());
    registry.themes.registry.push({
      id: 'arcade',
      kind: 'theme',
      role: 'canonical',
      public: true,
      decisionRef: 'single-canonical-theme'
    });

    const violations = collectDecisionRegistryViolations(registry);
    expect(violations.some((entry) => entry.rule === 'profile-mislabeled-as-theme')).toBe(true);
  });

  it('fails when Watch Pass claims production billing/entitlement', async () => {
    const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
    const registry = cloneRegistry(await readDecisionRegistry());
    registry.watchPass.productionBillingClaim = true;

    const violations = collectDecisionRegistryViolations(registry);
    expect(violations.some((entry) => entry.rule === 'watch-pass-billing-claim')).toBe(true);
  });

  it('fails when Planet 3D is marked included in core-v1', async () => {
    const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
    const registry = cloneRegistry(await readDecisionRegistry());
    registry.planet3d.includedInCoreV1 = true;

    const violations = collectDecisionRegistryViolations(registry);
    expect(violations.some((entry) => entry.rule === 'planet3d-in-core-release-set')).toBe(true);
  });

  it('fails when Planet 3D is added to the core release acceptance set', async () => {
    const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
    const registry = cloneRegistry(await readDecisionRegistry());
    registry.coreReleaseAcceptanceSet.push('planet3d.html');

    const violations = collectDecisionRegistryViolations(registry);
    expect(violations.some((entry) => entry.rule === 'planet3d-in-core-release-set')).toBe(true);
  });

  it('fails when visible tile-square rendering is marked the shipping default', async () => {
    const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
    const registry = cloneRegistry(await readDecisionRegistry());
    registry.shippingPresentation.default = 'tile-square';
    registry.shippingPresentation.tileSquareIsDefault = true;

    const violations = collectDecisionRegistryViolations(registry);
    expect(violations.some((entry) => entry.rule === 'tile-square-shipping-default')).toBe(true);
  });

  it('fails when a proof/lab entrypoint is reclassified to a release-gated surface without justification', async () => {
    const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
    const registry = cloneRegistry(await readDecisionRegistry());
    const proofSurfaces = registry.entrypoints.find((entry: any) => entry.entrypoint === 'proof-surfaces.html');
    proofSurfaces.classification = 'product';
    proofSurfaces.releaseGate = true;
    proofSurfaces.decisionRefs = [];

    const violations = collectDecisionRegistryViolations(registry);
    expect(violations.some((entry) => entry.rule === 'entrypoint-reclassified-without-justification')).toBe(true);
  });

  it('allows a release-gated reclassification when it carries an explicit justifying decision reference', async () => {
    const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
    const registry = cloneRegistry(await readDecisionRegistry());
    const proofSurfaces = registry.entrypoints.find((entry: any) => entry.entrypoint === 'proof-surfaces.html');
    proofSurfaces.releaseGate = true;
    proofSurfaces.decisionRefs = ['proof-surfaces-internal-only'];

    const violations = collectDecisionRegistryViolations(registry);
    expect(violations.some((entry) => entry.rule === 'entrypoint-reclassified-without-justification')).toBe(false);
  });

  it('fails when a "redesign complete" claim appears without acceptance evidence', async () => {
    const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
    const registry = cloneRegistry(await readDecisionRegistry());
    registry.redesignComplete.claimed = true;
    registry.redesignComplete.acceptanceEvidenceRef = null;

    const violations = collectDecisionRegistryViolations(registry);
    expect(violations.some((entry) => entry.rule === 'redesign-complete-without-evidence')).toBe(true);
  });

  it('allows a "redesign complete" claim when acceptance evidence is referenced', async () => {
    const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
    const registry = cloneRegistry(await readDecisionRegistry());
    registry.redesignComplete.claimed = true;
    registry.redesignComplete.acceptanceEvidenceRef = 'spec/verification-contract.json#coreSurfaces';

    const violations = collectDecisionRegistryViolations(registry);
    expect(violations.some((entry) => entry.rule === 'redesign-complete-without-evidence')).toBe(false);
  });

  it('fails on a duplicate decision id', async () => {
    const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
    const registry = cloneRegistry(await readDecisionRegistry());
    registry.decisions.push({ ...registry.decisions[0] });

    const violations = collectDecisionRegistryViolations(registry);
    expect(violations.some((entry) => entry.rule === 'duplicate-decision-id')).toBe(true);
  });

  it('fails on a reference to an unknown/undefined decision id', async () => {
    const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
    const registry = cloneRegistry(await readDecisionRegistry());
    registry.watchPass.decisionRef = 'this-decision-id-does-not-exist';

    const violations = collectDecisionRegistryViolations(registry);
    expect(violations.some((entry) => entry.rule === 'unknown-decision-reference')).toBe(true);
  });

  it('fails on an unknown decision id reference from an entrypoint', async () => {
    const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
    const registry = cloneRegistry(await readDecisionRegistry());
    const indexEntry = registry.entrypoints.find((entry: any) => entry.entrypoint === 'index.html');
    indexEntry.decisionRefs = ['not-a-real-decision-id'];

    const violations = collectDecisionRegistryViolations(registry);
    expect(violations.some((entry) => entry.rule === 'unknown-decision-reference')).toBe(true);
  });

  describe('PR #83 / PR #82 protected-path self-check', () => {
    it('flags a synthetic changed-file list that touches a protected path', async () => {
      const { readDecisionRegistry, collectProtectedPathViolations } = await loadChecker();
      const registry = await readDecisionRegistry();

      const violations = collectProtectedPathViolations([
        'docs/contracts/mazer-ui-rework-decision-registry.v1.json',
        'src/scenes/MenuScene.ts'
      ], registry);

      expect(violations.some((entry) => entry.rule === 'protected-path-touched' && entry.path === 'src/scenes/MenuScene.ts')).toBe(true);
    });

    it('flags package.json specifically if it were ever touched', async () => {
      const { readDecisionRegistry, collectProtectedPathViolations } = await loadChecker();
      const registry = await readDecisionRegistry();

      const violations = collectProtectedPathViolations(['package.json'], registry);
      expect(violations.some((entry) => entry.rule === 'protected-path-touched' && entry.path === 'package.json')).toBe(true);
    });

    it('does not flag Wave 0A\'s own new files', async () => {
      const { readDecisionRegistry, collectProtectedPathViolations } = await loadChecker();
      const registry = await readDecisionRegistry();

      const violations = collectProtectedPathViolations([
        'docs/contracts/mazer-ui-rework-decision-registry.v1.json',
        'docs/architecture/MAZER-UI-REWORK-DECISION-REGISTRY.md',
        'scripts/check-decision-registry.mjs',
        'tests/architecture/decision-registry-contract.test.ts',
        'docs/PLAYBOOK_NOTES.md'
      ], registry);

      expect(violations).toEqual([]);
    });

    it('runs the same checker against this working tree\'s real committed-and-uncommitted changed files and finds no protected path touched', async () => {
      const { readDecisionRegistry, collectProtectedPathViolations, readGitChangedFiles } = await loadChecker();
      const registry = await readDecisionRegistry();

      let changedFiles: string[];
      try {
        changedFiles = readGitChangedFiles();
      } catch {
        // git not available in this execution environment (e.g. no .git directory reachable) —
        // the synthetic cases above already exercise the same checker function, so skip silently.
        return;
      }

      const violations = collectProtectedPathViolations(changedFiles, registry);
      expect(violations).toEqual([]);
    });
  });

  describe('protected-path guard closes the committed-diff gap (regression)', () => {
    // Builds a throwaway, isolated git repository under the OS temp dir -- never the real mazer
    // repo, never a real branch, never a real PR -- that reproduces exactly the shape of a real,
    // pushed, mergeable PR head: a base commit on "main", then a feature branch that COMMITS a
    // change to a path matching the registry's protectedPaths list, ending with a fully clean
    // working tree (`git status --short` empty). Before this fix, readGitChangedFiles ignored
    // committed history entirely and read only `git status --short`, so this exact scenario would
    // have produced an empty changed-file list and a false "zero violations" pass -- exactly the
    // gap the reported defect described. This proves the fixed guard actually closes it.
    const runGit = (root: string, ...args: string[]): string => (
      execFileSync('git', args, { cwd: root, encoding: 'utf8' })
    );

    const initFixtureRepo = (root: string): void => {
      runGit(root, 'init', '-q', '-b', 'main');
      runGit(root, 'config', 'user.email', 'fixture@example.invalid');
      runGit(root, 'config', 'user.name', 'Protected Path Fixture');
      writeFileSync(join(root, 'README.md'), 'fixture baseline\n');
      runGit(root, 'add', 'README.md');
      runGit(root, 'commit', '-q', '-m', 'baseline');
    };

    it('detects a fully-committed protected-path change even though `git status --short` is clean', async () => {
      const { readGitChangedFiles, collectProtectedPathViolations, readDecisionRegistry } = await loadChecker();
      const registry = readDecisionRegistry();

      const root = mkdtempSync(join(tmpdir(), 'mazer-protected-path-fixture-'));
      try {
        initFixtureRepo(root);

        runGit(root, 'checkout', '-q', '-b', 'feature/protected-path-regression');
        mkdirSync(join(root, 'src', 'scenes'), { recursive: true });
        writeFileSync(join(root, 'src', 'scenes', 'MenuScene.ts'), '// disposable fixture edit, not the real file\n');
        runGit(root, 'add', 'src/scenes/MenuScene.ts');
        runGit(root, 'commit', '-q', '-m', 'touches a protected path, fully committed');

        // Sanity precondition: the fixture's working tree is clean, exactly like a real pushed PR
        // head. This is precisely the state that made the old git-status-only implementation blind.
        expect(runGit(root, 'status', '--short').trim()).toBe('');

        const changedFiles = readGitChangedFiles(root, { baseRef: 'main' });
        expect(changedFiles).toContain('src/scenes/MenuScene.ts');

        const violations = collectProtectedPathViolations(changedFiles, registry);
        expect(violations.some((entry) => (
          entry.rule === 'protected-path-touched' && entry.path === 'src/scenes/MenuScene.ts'
        ))).toBe(true);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('still returns zero violations for a fixture branch whose committed changes never touch a protected path', async () => {
      const { readGitChangedFiles, collectProtectedPathViolations, readDecisionRegistry } = await loadChecker();
      const registry = readDecisionRegistry();

      const root = mkdtempSync(join(tmpdir(), 'mazer-protected-path-fixture-clean-'));
      try {
        initFixtureRepo(root);

        runGit(root, 'checkout', '-q', '-b', 'feature/unrelated-change');
        writeFileSync(join(root, 'unrelated.txt'), 'not a protected path\n');
        runGit(root, 'add', 'unrelated.txt');
        runGit(root, 'commit', '-q', '-m', 'unrelated committed change');

        expect(runGit(root, 'status', '--short').trim()).toBe('');

        const changedFiles = readGitChangedFiles(root, { baseRef: 'main' });
        expect(changedFiles).toContain('unrelated.txt');

        const violations = collectProtectedPathViolations(changedFiles, registry);
        expect(violations).toEqual([]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
