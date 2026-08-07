import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AUTH_PHASES,
  CONNECTION_PHASES,
  CONTROL_MODES,
  EFFECTS_QUALITY,
  GAME_PHASES,
  INSTALL_PHASES,
  MODAL_SURFACES,
  MOTION_MODES,
  PRIMARY_SURFACES,
  collectUiStateSnapshotViolations,
  type UiStateSnapshot
} from '../../src/state/uiState';

interface StateModelViolation {
  rule: string;
  path: string;
  message: string;
}

interface StateModelCheckerModule {
  readUiStateModel: (stateModelPath?: string, root?: string) => Record<string, unknown>;
  readDecisionRegistryForStateModel: (registryPath?: string, root?: string) => Record<string, unknown>;
  collectUiStateModelViolations: (model: Record<string, unknown>, root?: string) => StateModelViolation[];
  collectProtectedPathViolationsForStateModel: (
    changedFiles: string[],
    decisionRegistry: Record<string, unknown>
  ) => StateModelViolation[];
  readGitChangedFilesForStateModel: (root?: string, options?: { baseRef?: string }) => string[];
  formatViolations: (violations: StateModelViolation[]) => string;
  checkUiStateModel: (model?: Record<string, unknown>, root?: string) => true;
}

const CHECKER_PATH = '../../scripts/check-ui-state-model.mjs';

const loadChecker = async (): Promise<StateModelCheckerModule> => (
  import(CHECKER_PATH) as Promise<StateModelCheckerModule>
);

const cloneModel = (model: Record<string, unknown>): any => JSON.parse(JSON.stringify(model));

describe('Mazer UI rework state model contract', () => {
  it('passes with zero violations against the real, shipped state model registry', async () => {
    const { readUiStateModel, collectUiStateModelViolations } = await loadChecker();
    const model = readUiStateModel();
    expect(collectUiStateModelViolations(model)).toEqual([]);
  });

  it('checkUiStateModel() does not throw for the real registry', async () => {
    const { checkUiStateModel } = await loadChecker();
    expect(() => checkUiStateModel()).not.toThrow();
  });

  it.each([
    'primarySurfaces',
    'modalSurfaces',
    'gamePhases',
    'authPhases',
    'connectionPhases',
    'installPhases',
    'controlModes',
    'motionModes',
    'effectsQuality'
  ])('fails when "%s" is empty', async (key) => {
    const { readUiStateModel, collectUiStateModelViolations } = await loadChecker();
    const model = cloneModel(await readUiStateModel());
    model[key] = [];

    const violations = collectUiStateModelViolations(model);
    expect(violations.some((entry) => entry.rule === 'category-empty-or-missing' && entry.path === key)).toBe(true);
  });

  it('fails on a duplicate value within a category', async () => {
    const { readUiStateModel, collectUiStateModelViolations } = await loadChecker();
    const model = cloneModel(await readUiStateModel());
    model.gamePhases.push(model.gamePhases[0]);

    const violations = collectUiStateModelViolations(model);
    expect(violations.some((entry) => entry.rule === 'category-duplicate-value' && entry.path === 'gamePhases')).toBe(true);
  });

  it('fails on a non-string entry within a category', async () => {
    const { readUiStateModel, collectUiStateModelViolations } = await loadChecker();
    const model = cloneModel(await readUiStateModel());
    model.controlModes.push(42);

    const violations = collectUiStateModelViolations(model);
    expect(violations.some((entry) => entry.rule === 'category-value-not-a-string' && entry.path === 'controlModes')).toBe(true);
  });

  it('fails when modalSurfaces no longer includes "none"', async () => {
    const { readUiStateModel, collectUiStateModelViolations } = await loadChecker();
    const model = cloneModel(await readUiStateModel());
    model.modalSurfaces = model.modalSurfaces.filter((entry: string) => entry !== 'none');

    const violations = collectUiStateModelViolations(model);
    expect(violations.some((entry) => entry.rule === 'modal-surfaces-missing-none')).toBe(true);
  });

  it('fails when a structurally-checkable invariant is removed from the invariants list', async () => {
    const { readUiStateModel, collectUiStateModelViolations } = await loadChecker();
    const model = cloneModel(await readUiStateModel());
    model.invariants = model.invariants.filter((entry: string) => entry !== 'zero-or-one-modal');

    const violations = collectUiStateModelViolations(model);
    expect(violations.some((entry) => entry.rule === 'structural-invariant-not-listed')).toBe(true);
  });

  it('fails when structurallyCheckableInvariants drops a required entry', async () => {
    const { readUiStateModel, collectUiStateModelViolations } = await loadChecker();
    const model = cloneModel(await readUiStateModel());
    model.structurallyCheckableInvariants = model.structurallyCheckableInvariants.filter(
      (entry: string) => entry !== 'exactly-one-primary-surface'
    );

    const violations = collectUiStateModelViolations(model);
    expect(violations.some((entry) => entry.rule === 'required-structural-invariant-missing')).toBe(true);
  });

  it('fails on an unknown decision id reference', async () => {
    const { readUiStateModel, collectUiStateModelViolations } = await loadChecker();
    const model = cloneModel(await readUiStateModel());
    model.decisionRefs.push('this-decision-id-does-not-exist');

    const violations = collectUiStateModelViolations(model);
    expect(violations.some((entry) => entry.rule === 'unknown-decision-reference')).toBe(true);
  });

  describe('src/state/uiState.ts cross-check against the JSON registry', () => {
    it('exposes the same category values as the registry, in the same order', async () => {
      const { readUiStateModel } = await loadChecker();
      const model = readUiStateModel() as Record<string, string[]>;

      expect([...PRIMARY_SURFACES]).toEqual(model.primarySurfaces);
      expect([...MODAL_SURFACES]).toEqual(model.modalSurfaces);
      expect([...GAME_PHASES]).toEqual(model.gamePhases);
      expect([...AUTH_PHASES]).toEqual(model.authPhases);
      expect([...CONNECTION_PHASES]).toEqual(model.connectionPhases);
      expect([...INSTALL_PHASES]).toEqual(model.installPhases);
      expect([...CONTROL_MODES]).toEqual(model.controlModes);
      expect([...MOTION_MODES]).toEqual(model.motionModes);
      expect([...EFFECTS_QUALITY]).toEqual(model.effectsQuality);
    });

    it('collectUiStateSnapshotViolations accepts a snapshot built entirely from registered enum values', () => {
      const snapshot: UiStateSnapshot = {
        primarySurface: 'home',
        modalSurface: 'none',
        gamePhase: 'idle',
        authPhase: 'guest',
        connectionPhase: 'online',
        installPhase: 'hidden',
        controlMode: 'keyboard',
        motionMode: 'system',
        effectsQuality: 'balanced'
      };
      expect(collectUiStateSnapshotViolations(snapshot)).toEqual([]);
    });

    it('collectUiStateSnapshotViolations flags a field value outside its registered enum', () => {
      const snapshot = {
        primarySurface: 'home',
        modalSurface: 'none',
        gamePhase: 'idle',
        authPhase: 'guest',
        connectionPhase: 'online',
        installPhase: 'hidden',
        controlMode: 'keyboard',
        motionMode: 'system',
        effectsQuality: 'ultra-not-a-real-tier'
      } as unknown as UiStateSnapshot;

      const violations = collectUiStateSnapshotViolations(snapshot);
      expect(violations.some((entry) => entry.field === 'effectsQuality')).toBe(true);
    });

    // Regression coverage for the fail-closed top-level validation gap: a malformed/non-object
    // top-level value (as an untrusted caller might genuinely pass -- e.g. a failed JSON.parse
    // result, a missing field from a deserialized payload, or simply `undefined`) must be handled
    // as a clean violation, not throw an uncaught TypeError from property access on `null`/
    // `undefined`. Before the fix, `null` and `undefined` specifically threw
    // ("Cannot read properties of null/undefined (reading 'primarySurface')") instead of returning
    // a violation array, even though other non-object values (strings, numbers, arrays, `{}`)
    // already failed closed correctly by construction.
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a string', 'not-a-snapshot'],
      ['a number', 42],
      ['a boolean', true],
      ['an array', ['not', 'a', 'snapshot']],
      ['an empty object', {}]
    ])('collectUiStateSnapshotViolations does not throw and returns a violation for %s', (_label, malformed) => {
      let violations: ReturnType<typeof collectUiStateSnapshotViolations> | undefined;
      expect(() => {
        violations = collectUiStateSnapshotViolations(malformed as unknown as UiStateSnapshot);
      }).not.toThrow();

      expect(violations).toBeDefined();
      expect(violations!.length).toBeGreaterThan(0);
    });

    it('collectUiStateSnapshotViolations reports a single sentinel-field violation for a malformed top-level value', () => {
      const violations = collectUiStateSnapshotViolations(null as unknown as UiStateSnapshot);
      expect(violations).toEqual([
        {
          field: '(snapshot)',
          value: null,
          message: 'snapshot must be a non-null object, received null.'
        }
      ]);
    });

    it('collectUiStateSnapshotViolations reports one violation per field for a well-formed-but-empty object', () => {
      const violations = collectUiStateSnapshotViolations({} as unknown as UiStateSnapshot);
      expect(violations).toHaveLength(9);
      expect(violations.every((entry) => entry.value === undefined)).toBe(true);
    });
  });

  describe('PR #83 / PR #82 protected-path self-check (reused from Wave 0A/1B)', () => {
    it('flags a synthetic changed-file list that touches a protected path', async () => {
      const { readDecisionRegistryForStateModel, collectProtectedPathViolationsForStateModel } = await loadChecker();
      const decisionRegistry = await readDecisionRegistryForStateModel();

      const violations = collectProtectedPathViolationsForStateModel([
        'docs/contracts/mazer-ui-rework-state-model.v1.json',
        'src/scenes/MenuScene.ts'
      ], decisionRegistry);

      expect(violations.some((entry) => entry.rule === 'protected-path-touched' && entry.path === 'src/scenes/MenuScene.ts')).toBe(true);
    });

    it('does not flag Wave 1A\'s own new files', async () => {
      const { readDecisionRegistryForStateModel, collectProtectedPathViolationsForStateModel } = await loadChecker();
      const decisionRegistry = await readDecisionRegistryForStateModel();

      const violations = collectProtectedPathViolationsForStateModel([
        'docs/contracts/mazer-ui-rework-state-model.v1.json',
        'docs/architecture/MAZER-UI-REWORK-STATE-MODEL.md',
        'scripts/check-ui-state-model.mjs',
        'src/state/uiState.ts',
        'tests/architecture/ui-state-model-contract.test.ts'
      ], decisionRegistry);

      expect(violations).toEqual([]);
    });

    it('runs the same checker against this working tree\'s real committed-and-uncommitted changed files and finds no protected path touched', async () => {
      const {
        readDecisionRegistryForStateModel,
        collectProtectedPathViolationsForStateModel,
        readGitChangedFilesForStateModel
      } = await loadChecker();
      const decisionRegistry = await readDecisionRegistryForStateModel();

      let changedFiles: string[];
      try {
        changedFiles = readGitChangedFilesForStateModel();
      } catch {
        return;
      }

      const violations = collectProtectedPathViolationsForStateModel(changedFiles, decisionRegistry);
      expect(violations).toEqual([]);
    });

    // Regression coverage for the fixed committed-diff gap (see
    // scripts/check-decision-registry.mjs's readGitChangedFiles and
    // tests/architecture/decision-registry-contract.test.ts's thorough fixture-based proof).
    // This confirms readGitChangedFilesForStateModel actually delegates to the fixed
    // implementation, rather than reintroducing a third, separate git-status-only copy of the same
    // bug this wave's own tooling (check-ui-state-model.mjs) was written after the fix landed.
    it('regression: detects a fully-committed protected-path change even though `git status --short` is clean', async () => {
      const {
        readDecisionRegistryForStateModel,
        collectProtectedPathViolationsForStateModel,
        readGitChangedFilesForStateModel
      } = await loadChecker();
      const decisionRegistry = await readDecisionRegistryForStateModel();

      const root = mkdtempSync(join(tmpdir(), 'mazer-protected-path-fixture-state-model-'));
      const runGit = (...args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
      try {
        runGit('init', '-q', '-b', 'main');
        runGit('config', 'user.email', 'fixture@example.invalid');
        runGit('config', 'user.name', 'Protected Path Fixture');
        writeFileSync(join(root, 'README.md'), 'fixture baseline\n');
        runGit('add', 'README.md');
        runGit('commit', '-q', '-m', 'baseline');

        runGit('checkout', '-q', '-b', 'feature/protected-path-regression');
        writeFileSync(join(root, 'package.json'), '{ "disposable": "fixture edit, not the real file" }\n');
        runGit('add', 'package.json');
        runGit('commit', '-q', '-m', 'touches a protected path, fully committed');

        expect(runGit('status', '--short').trim()).toBe('');

        const changedFiles = readGitChangedFilesForStateModel(root, { baseRef: 'main' });
        expect(changedFiles).toContain('package.json');

        const violations = collectProtectedPathViolationsForStateModel(changedFiles, decisionRegistry);
        expect(violations.some((entry) => (
          entry.rule === 'protected-path-touched' && entry.path === 'package.json'
        ))).toBe(true);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
