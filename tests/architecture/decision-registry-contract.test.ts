import { describe, expect, it } from 'vitest';

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
  readGitChangedFiles: (root?: string) => string[];
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

    it('runs the same checker against this working tree\'s real `git status --short` output and finds no protected path touched', async () => {
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
});
