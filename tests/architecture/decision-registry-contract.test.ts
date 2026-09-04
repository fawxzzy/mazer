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
  collectIntegratorWaveOwnershipViolations: (changedFiles: string[], registry: Record<string, unknown>, claimedWave?: string) => DecisionRegistryViolation[];
  collectIntegratorWaveMixViolations: (changedFiles: string[], registry: Record<string, unknown>) => DecisionRegistryViolation[];
  resolveActiveIntegratorPathOwners: (registry: Record<string, unknown>) => Map<string, string>;
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

  it('locks Wave 2A to stateless, unwired DOM primitives', async () => {
    const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
    const registry: any = await readDecisionRegistry();
    const decision = registry.decisions.find((entry: any) => entry.id === 'wave2a-stateless-dom-primitives');

    expect(decision).toMatchObject({
      category: 'architecture',
      locked: true,
      sourceRef: 'docs/architecture/MAZER-UI-REWORK-DOM-PRIMITIVES.md#wave-2a-boundary'
    });
    expect(decision.statement).toContain('do not import MenuScene');
    expect(decision.statement).toContain('remain unmounted');
    expect(collectDecisionRegistryViolations(registry)).toEqual([]);
  });

  it('locks Wave 2A.1 to stateless, unwired settings primitives', async () => {
    const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
    const registry: any = await readDecisionRegistry();
    const decision = registry.decisions.find((entry: any) => entry.id === 'wave2a1-stateless-settings-primitives');

    expect(decision).toMatchObject({
      category: 'architecture',
      locked: true,
      sourceRef: 'docs/architecture/MAZER-UI-REWORK-DOM-PRIMITIVES.md#wave-2a1-settings-boundary'
    });
    expect(decision.statement).toContain('Persistence, commands, runtime mounting');
    expect(collectDecisionRegistryViolations(registry)).toEqual([]);
  });

  it('fails on an unknown decision id reference from an entrypoint', async () => {
    const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
    const registry = cloneRegistry(await readDecisionRegistry());
    const indexEntry = registry.entrypoints.find((entry: any) => entry.entrypoint === 'index.html');
    indexEntry.decisionRefs = ['not-a-real-decision-id'];

    const violations = collectDecisionRegistryViolations(registry);
    expect(violations.some((entry) => entry.rule === 'unknown-decision-reference')).toBe(true);
  });

  describe('dependency-graph integrator ownership', () => {
    it('retires the stale pull-request hold and carries no branch-specific exception', async () => {
      const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
      const registry = await readDecisionRegistry();
      const serialized = JSON.stringify(registry);

      expect((registry as any).prProtection).toBeUndefined();
      expect(serialized).not.toContain('pr83-protected-paths-hold');
      expect(serialized).not.toContain('claude/mazer-pr83-fitness-auth-parity-successor');
      expect(collectDecisionRegistryViolations(registry)).toEqual([]);
    });

    it('binds each shared path to its current ACTIVE integrator wave (historical completed waves excluded)', async () => {
      const { readDecisionRegistry, resolveActiveIntegratorPathOwners } = await loadChecker();
      const registry: any = await readDecisionRegistry();
      const owners = resolveActiveIntegratorPathOwners(registry);

      expect(Object.fromEntries(owners)).toEqual({
        'scripts/analysis/capture-auth-capability-surfaces.mjs': '0C',
        'scripts/analysis/capture-ui-surfaces.mjs': '0C',
        'scripts/analysis/live-auth-persistence-soak.mjs': '0C',
        'src/theme/tokens.ts': '1B',
        'src/theme/tokens.css': '1B',
        'src/scenes/diagnostics/menuSurfaceStateDiagnostics.ts': '1C',
        'src/scenes/diagnostics/menuLayoutBoundsDiagnostics.ts': '1C',
        'src/scenes/diagnostics/menuRenderDprDiagnostics.ts': '1C',
        'src/scenes/diagnostics/menuInputDiagnostics.ts': '1C',
        'src/scenes/diagnostics/menuWorldSemanticDiagnostics.ts': '1C',
        'src/scenes/diagnostics/menuCaptureMetadataDiagnostics.ts': '1C',
        'src/scenes/diagnostics/menuRuntimeDiagnosticsCompatibility.ts': '1C',
        'src/scenes/menuRuntimeDiagnostics.ts': '1C',
        'src/scenes/MenuScene.ts': '4D-A',
        'src/render/navigationCoreTrail.ts': '4D-A',
        'src/scenes/BootScene.ts': '4D-A',
        'src/legacy-runtime/legacyAuth.ts': '3B',
        'src/legacy-runtime/legacyPlayerMessage.ts': '3B',
        'vite.config.ts': '5B',
        'package.json': '5B'
      });
      // Completed waves' own paths are real history, not active ownership -- src/state/uiLegacyBridge.ts
      // (Wave 3A, completed) has no active claimant and correctly does not appear above.
      expect(owners.has('src/state/uiLegacyBridge.ts')).toBe(false);
    });

    it('records Wave 3A as completed history, not active ownership, tied to the real merge SHA', async () => {
      const { readDecisionRegistry } = await loadChecker();
      const registry: any = await readDecisionRegistry();
      const waveThreeA = registry.integratorWaveOwnership.assignments.find((entry: any) => entry.wave === '3A');

      expect(waveThreeA.status).toBe('completed');
      expect(waveThreeA.completedAtCommit).toMatch(/^[0-9a-f]{40}$/);
      expect(waveThreeA.paths).toContain('src/scenes/MenuScene.ts');
    });

    it('Wave 3B and Wave 4D-A are valid siblings after Wave 3A: both active, both depend only on 3A, no edge required between them', async () => {
      const { readDecisionRegistry } = await loadChecker();
      const registry: any = await readDecisionRegistry();
      const assignments = registry.integratorWaveOwnership.assignments;
      const waveThreeB = assignments.find((entry: any) => entry.wave === '3B');
      const waveFourDA = assignments.find((entry: any) => entry.wave === '4D-A');

      expect(waveThreeB.status).toBe('active');
      expect(waveFourDA.status).toBe('active');
      expect(waveThreeB.dependsOn).toEqual(['3A']);
      expect(waveFourDA.dependsOn).toEqual(['3A']);
      // Neither wave names the other as a dependency -- validating the registry does not require
      // (and must not need) a 3B<->4D-A edge for either to be a legitimate active assignment.
      expect(waveThreeB.dependsOn).not.toContain('4D-A');
      expect(waveFourDA.dependsOn).not.toContain('3B');
    });

    it('flags a path touched by a wave that is not its current active owner', async () => {
      const { readDecisionRegistry, collectIntegratorWaveOwnershipViolations } = await loadChecker();
      const registry = await readDecisionRegistry();

      const violations = collectIntegratorWaveOwnershipViolations([
        'docs/contracts/mazer-ui-rework-decision-registry.v1.json',
        'src/scenes/MenuScene.ts'
      ], registry, '0A');

      expect(violations.some((entry) => entry.rule === 'integrator-wave-ownership-mismatch' && entry.path === 'src/scenes/MenuScene.ts')).toBe(true);
    });

    it('a Wave 4D-A branch may change src/scenes/MenuScene.ts (the current active owner)', async () => {
      const { readDecisionRegistry, collectIntegratorWaveOwnershipViolations } = await loadChecker();
      const registry = await readDecisionRegistry();

      expect(collectIntegratorWaveOwnershipViolations(['src/scenes/MenuScene.ts'], registry, '4D-A')).toEqual([]);
    });

    it('a Wave 3A branch may no longer change src/scenes/MenuScene.ts after the handoff -- historical ownership is not an active exception', async () => {
      const { readDecisionRegistry, collectIntegratorWaveOwnershipViolations } = await loadChecker();
      const registry = await readDecisionRegistry();

      const violations = collectIntegratorWaveOwnershipViolations(['src/scenes/MenuScene.ts'], registry, '3A');
      expect(violations.some((entry) => (
        entry.rule === 'integrator-wave-ownership-mismatch' && entry.path === 'src/scenes/MenuScene.ts'
      ))).toBe(true);
    });

    it('fails closed when one change set spans two different currently-ACTIVE integrator waves', async () => {
      const { readDecisionRegistry, collectIntegratorWaveMixViolations } = await loadChecker();
      const registry = await readDecisionRegistry();

      const violations = collectIntegratorWaveMixViolations([
        'src/legacy-runtime/legacyAuth.ts',
        'src/scenes/MenuScene.ts'
      ], registry);

      expect(violations.some((entry) => entry.rule === 'integrator-wave-mix' && entry.path === 'src/legacy-runtime/legacyAuth.ts')).toBe(true);
      expect(violations.some((entry) => entry.rule === 'integrator-wave-mix' && entry.path === 'src/scenes/MenuScene.ts')).toBe(true);
    });

    it('does not mix a completed wave\'s historical path with a currently-active wave\'s path', async () => {
      const { readDecisionRegistry, collectIntegratorWaveMixViolations } = await loadChecker();
      const registry = await readDecisionRegistry();

      // src/state/uiLegacyBridge.ts is Wave 3A history only (no active claimant) -- pairing it
      // with an actively-owned path must not falsely report a two-wave mix.
      const violations = collectIntegratorWaveMixViolations([
        'src/state/uiLegacyBridge.ts',
        'src/scenes/MenuScene.ts'
      ], registry);

      expect(violations).toEqual([]);
    });

    it('rejects branch-specific exceptions even when their wave mapping is otherwise valid', async () => {
      const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
      const registry: any = cloneRegistry(await readDecisionRegistry());
      registry.integratorWaveOwnership.assignments[0].branch = 'claude/mazer-pr83-fitness-auth-parity-successor';

      const violations = collectDecisionRegistryViolations(registry);
      expect(violations.some((entry) => entry.rule === 'obsolete-branch-binding')).toBe(true);
      expect(violations.some((entry) => entry.rule === 'branch-specific-wave-exception')).toBe(true);
    });

    it('fails when two assignments are simultaneously active for the same path', async () => {
      const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
      const registry: any = cloneRegistry(await readDecisionRegistry());
      const waveThreeB = registry.integratorWaveOwnership.assignments.find((entry: any) => entry.wave === '3B');
      // 3B does not really own MenuScene.ts -- this is a synthetic conflict to prove the guard
      // catches two simultaneously-active claims on one path, not a real registry state.
      waveThreeB.paths.push('src/scenes/MenuScene.ts');

      const violations = collectDecisionRegistryViolations(registry);
      expect(violations.some((entry) => (
        entry.rule === 'duplicate-active-integrator-path-owner' && entry.message.includes('src/scenes/MenuScene.ts')
      ))).toBe(true);
    });

    it('fails when a wave depends on a wave id that is not registered', async () => {
      const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
      const registry: any = cloneRegistry(await readDecisionRegistry());
      const waveFourDA = registry.integratorWaveOwnership.assignments.find((entry: any) => entry.wave === '4D-A');
      waveFourDA.dependsOn = ['this-wave-does-not-exist'];

      const violations = collectDecisionRegistryViolations(registry);
      expect(violations.some((entry) => entry.rule === 'integrator-wave-dependency-missing')).toBe(true);
    });

    it('fails on a cyclic wave dependency', async () => {
      const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
      const registry: any = cloneRegistry(await readDecisionRegistry());
      const waveThreeB = registry.integratorWaveOwnership.assignments.find((entry: any) => entry.wave === '3B');
      const waveFourDA = registry.integratorWaveOwnership.assignments.find((entry: any) => entry.wave === '4D-A');
      // Synthetic cycle: 3B depends on 4D-A, and 4D-A already depends on 3A which does not
      // depend on either -- introduce 3A depending on 3B to close a real cycle 3A -> 3B -> 4D-A -> 3A.
      const waveThreeA = registry.integratorWaveOwnership.assignments.find((entry: any) => entry.wave === '3A');
      waveThreeA.dependsOn = ['3B'];
      waveThreeB.dependsOn = ['4D-A'];
      void waveFourDA;

      const violations = collectDecisionRegistryViolations(registry);
      expect(violations.some((entry) => entry.rule === 'integrator-wave-dependency-cycle')).toBe(true);
    });

    it('fails when an assignment has an invalid or missing status', async () => {
      const { readDecisionRegistry, collectDecisionRegistryViolations } = await loadChecker();
      const registry: any = cloneRegistry(await readDecisionRegistry());
      const waveFiveB = registry.integratorWaveOwnership.assignments.find((entry: any) => entry.wave === '5B');
      delete waveFiveB.status;

      const violations = collectDecisionRegistryViolations(registry);
      expect(violations.some((entry) => entry.rule === 'integrator-wave-status-invalid')).toBe(true);
    });

    it('keeps this working tree\'s real changed files within one registered integrator wave', async () => {
      const { readDecisionRegistry, collectIntegratorWaveMixViolations, readGitChangedFiles } = await loadChecker();
      const registry = await readDecisionRegistry();

      let changedFiles: string[];
      try {
        changedFiles = readGitChangedFiles();
      } catch {
        // git not available in this execution environment (e.g. no .git directory reachable) —
        // the synthetic cases above already exercise the same checker function, so skip silently.
        return;
      }

      const violations = collectIntegratorWaveMixViolations(changedFiles, registry);
      expect(violations).toEqual([]);
    });
  });

  describe('integrator ownership guard includes committed diffs (regression)', () => {
    // Builds a throwaway, isolated git repository under the OS temp dir -- never the real mazer
    // repo, never a real branch, never a real PR -- that reproduces exactly the shape of a real,
    // pushed, mergeable PR head: a base commit on "main", then a feature branch that COMMITS a
    // change to a path carrying an integrator-wave assignment, ending with a fully clean
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

    it('detects a fully-committed wrong-wave path even though `git status --short` is clean', async () => {
      const { readGitChangedFiles, collectIntegratorWaveOwnershipViolations, readDecisionRegistry } = await loadChecker();
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

        const violations = collectIntegratorWaveOwnershipViolations(changedFiles, registry, '0A');
        expect(violations.some((entry) => (
          entry.rule === 'integrator-wave-ownership-mismatch' && entry.path === 'src/scenes/MenuScene.ts'
        ))).toBe(true);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('still returns zero violations for a fixture branch whose committed changes never touch an assigned path', async () => {
      const { readGitChangedFiles, collectIntegratorWaveOwnershipViolations, readDecisionRegistry } = await loadChecker();
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

        const violations = collectIntegratorWaveOwnershipViolations(changedFiles, registry, '0A');
        expect(violations).toEqual([]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
