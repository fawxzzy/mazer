import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
import {
  UI_COMMAND_TYPES,
  UiCommandContractError,
  collectUiCommandViolations,
  createUiCommandBus,
  type UiCommand
} from '../../src/state/uiCommands';
import {
  DEFAULT_UI_STATE_SNAPSHOT,
  UiStateContractError,
  createUiStore,
  freezeUiStateSnapshot
} from '../../src/state/uiStore';
import { PLATFORM_PROFILES } from '../../src/state/uiProfiles';
import { UI_VIEW_MODEL_NAMES, createUiViewModels } from '../../src/state/uiViewModels';
import { projectLegacyUiState } from '../../src/state/uiLegacyProjection';

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

    it('collectUiStateSnapshotViolations rejects an empty object at the exact-shape boundary', () => {
      const violations = collectUiStateSnapshotViolations({} as unknown as UiStateSnapshot);
      expect(violations).toEqual([
        expect.objectContaining({ field: '(snapshot)', message: expect.stringContaining('exactly') })
      ]);
    });
  });

  describe('exhaustive command and sole-dispatch store contract', () => {
    it('mirrors every authoritative command and view-model name', async () => {
      const { readUiStateModel } = await loadChecker();
      const model = readUiStateModel() as Record<string, string[]>;
      expect([...UI_COMMAND_TYPES]).toEqual(model.commands);
      expect([...UI_VIEW_MODEL_NAMES]).toEqual(model.viewModels);
    });

    it('fails closed on unknown, malformed, or over-posted commands', () => {
      expect(collectUiCommandViolations({ type: 'NOT_A_COMMAND' })).toEqual([
        expect.objectContaining({ path: 'type' })
      ]);
      expect(collectUiCommandViolations({ type: 'NAVIGATE', surface: 'home', surprise: true })).toEqual([
        expect.objectContaining({ path: '(command)' })
      ]);
      expect(collectUiCommandViolations({ type: 'OPEN_MODAL', modal: 'none' })).toEqual([
        expect.objectContaining({ path: 'modal' })
      ]);
      expect(collectUiCommandViolations({ type: 'SET_PREFERENCE', key: 'quality', value: Number.NaN })).toEqual([
        expect.objectContaining({ path: 'key' })
      ]);
      const throwingPrototype = new Proxy({}, { getPrototypeOf: () => { throw new Error('trap'); } });
      expect(() => collectUiCommandViolations(throwingPrototype)).not.toThrow();
      expect(collectUiCommandViolations(throwingPrototype)).toEqual([
        expect.objectContaining({ path: '(command)' })
      ]);
    });

    it('implements a fail-closed subscribe/dispatch command bus', () => {
      const bus = createUiCommandBus();
      const commands: UiCommand[] = [];
      const unsubscribe = bus.subscribe((command) => commands.push(command));
      bus.dispatch({ type: 'START_RUN' });
      expect(commands).toEqual([{ type: 'START_RUN' }]);
      unsubscribe();
      bus.dispatch({ type: 'RETURN_HOME' });
      expect(commands).toHaveLength(1);
      expect(() => bus.dispatch({ type: 'UNKNOWN' } as unknown as UiCommand)).toThrow(UiCommandContractError);
    });

    it('advances UI-owned immutable snapshots only through store dispatch and notifies subscribers', () => {
      const bus = createUiCommandBus();
      const emitted: UiCommand[] = [];
      bus.subscribe((command) => emitted.push(command));
      const store = createUiStore(DEFAULT_UI_STATE_SNAPSHOT, bus);
      const initial = store.getSnapshot();
      const calls: Array<{ next: UiStateSnapshot; previous: UiStateSnapshot; command: UiCommand }> = [];
      const unsubscribe = store.subscribe((next, previous, command) => calls.push({ next, previous, command }));

      const next = store.dispatch({ type: 'NAVIGATE', surface: 'settings' });
      expect(next).toEqual(expect.objectContaining({ primarySurface: 'settings', gamePhase: 'idle' }));
      expect(next).not.toBe(initial);
      expect(Object.isFrozen(next)).toBe(true);
      expect(initial).toEqual(DEFAULT_UI_STATE_SNAPSHOT);
      expect(calls).toHaveLength(1);
      expect(calls[0].previous).toBe(initial);
      expect(calls[0].command).toEqual({ type: 'NAVIGATE', surface: 'settings' });

      const afterPreference = store.dispatch({ type: 'SET_PREFERENCE', key: 'motionMode', value: 'reduced' });
      expect(afterPreference.motionMode).toBe('reduced');

      const beforeDomainCommand = store.getSnapshot();
      const afterDomainCommand = store.dispatch({ type: 'START_RUN' });
      expect(afterDomainCommand).toBe(beforeDomainCommand);
      expect(afterDomainCommand.gamePhase).toBe('idle');
      expect(emitted.at(-1)).toEqual({ type: 'START_RUN' });
      unsubscribe();
    });

    it('rejects an invalid runtime command instead of silently transitioning', () => {
      const store = createUiStore(DEFAULT_UI_STATE_SNAPSHOT);
      expect(() => store.dispatch({ type: 'UNKNOWN' } as unknown as UiCommand)).toThrow(UiCommandContractError);
    });

    it('rejects noncanonical snapshot representations without throwing or preserving extra fields', () => {
      const valid = { ...DEFAULT_UI_STATE_SNAPSHOT };
      const arraySnapshot = Object.assign([], valid);
      const customPrototypeSnapshot = Object.assign(Object.create({ inherited: true }), valid);
      const overPostedSnapshot = { ...valid, admin: true };
      const accessorSnapshot = { ...valid } as Record<string, unknown>;
      Object.defineProperty(accessorSnapshot, 'primarySurface', {
        enumerable: true,
        get: () => { throw new Error('trap'); }
      });
      const proxySnapshot = new Proxy({ ...valid }, {
        ownKeys: () => { throw new Error('trap'); }
      });

      for (const candidate of [arraySnapshot, customPrototypeSnapshot, overPostedSnapshot, accessorSnapshot, proxySnapshot]) {
        expect(() => collectUiStateSnapshotViolations(candidate)).not.toThrow();
        expect(collectUiStateSnapshotViolations(candidate)).toEqual([
          expect.objectContaining({ field: '(snapshot)' })
        ]);
        expect(() => freezeUiStateSnapshot(candidate)).toThrow(UiStateContractError);
      }
    });

    it('freezes a canonical descriptor clone without invoking an untrusted get trap', () => {
      let getCalls = 0;
      const candidate = new Proxy({ ...DEFAULT_UI_STATE_SNAPSHOT }, {
        get: (_target, property) => {
          getCalls += 1;
          throw new Error(`get trap:${String(property)}`);
        }
      });

      expect(collectUiStateSnapshotViolations(candidate)).toEqual([]);
      expect(() => freezeUiStateSnapshot(candidate)).not.toThrow();
      expect(freezeUiStateSnapshot(candidate)).toEqual(DEFAULT_UI_STATE_SNAPSHOT);
      expect(Object.isFrozen(freezeUiStateSnapshot(candidate))).toBe(true);
      expect(getCalls).toBe(0);
    });

    it('fans out an immutable normalized command so subscribers cannot rewrite intent', () => {
      const bus = createUiCommandBus();
      const observed: UiCommand[] = [];
      bus.subscribe((command) => {
        try {
          (command as { surface?: string }).surface = 'settings';
          if (command.type === 'SUBMIT_AUTH') {
            (command.payload as Record<string, string>).username = 'mutated';
          }
        } catch {
          // Frozen input is the expected boundary; later listeners must still receive the original.
        }
      });
      bus.subscribe((command) => observed.push(command));

      bus.dispatch({ type: 'NAVIGATE', surface: 'home' });
      bus.dispatch({ type: 'SUBMIT_AUTH', intent: 'sign-in', payload: { username: 'original' } });

      expect(observed[0]).toEqual({ type: 'NAVIGATE', surface: 'home' });
      expect(Object.isFrozen(observed[0])).toBe(true);
      expect(observed[1]).toEqual({
        type: 'SUBMIT_AUTH',
        intent: 'sign-in',
        payload: { username: 'original' }
      });
      expect(Object.isFrozen(observed[1])).toBe(true);
      expect(observed[1].type === 'SUBMIT_AUTH' && Object.isFrozen(observed[1].payload)).toBe(true);
    });
  });

  describe('immutable renderer-independent view models and legacy projection', () => {
    it('builds geometry-free frozen view models for all registered families', () => {
      const snapshot: UiStateSnapshot = Object.freeze({
        ...DEFAULT_UI_STATE_SNAPSHOT,
        primarySurface: 'play',
        gamePhase: 'active',
        authPhase: 'authenticated',
        installPhase: 'available',
        controlMode: 'stick'
      });
      const viewModels = createUiViewModels(snapshot, PLATFORM_PROFILES.mobile);
      expect(viewModels.gameplayHud).toEqual({ visible: true, gamePhase: 'active', paused: false });
      expect(viewModels.controlSurface).toEqual({ visible: true, mode: 'stick', enabled: true });
      expect(Object.isFrozen(viewModels)).toBe(true);
      expect(Object.isFrozen(viewModels.gameplayHud)).toBe(true);
      expect(JSON.stringify(viewModels)).not.toMatch(/\b(?:x|y|width|height|bounds)\b/);
    });

    it('projects explicit legacy facts without mutation and fails closed on malformed facts', () => {
      const input = Object.freeze({
        mode: 'play',
        overlay: 'pause',
        gamePhase: 'active',
        authPhase: 'authenticated',
        connectionPhase: 'online',
        installPhase: 'hidden',
        controlMode: 'keyboard',
        motionMode: 'system',
        effectsQuality: 'balanced'
      });
      const result = projectLegacyUiState(input);
      expect(result).toEqual({
        ok: true,
        snapshot: {
          primarySurface: 'play',
          modalSurface: 'none',
          gamePhase: 'paused',
          authPhase: 'authenticated',
          connectionPhase: 'online',
          installPhase: 'hidden',
          controlMode: 'keyboard',
          motionMode: 'system',
          effectsQuality: 'balanced'
        }
      });
      expect(Object.isFrozen(result)).toBe(true);
      expect(input.gamePhase).toBe('active');

      const malformed = projectLegacyUiState({ ...input, overlay: 'two-overlays' });
      expect(malformed).toEqual({ ok: false, violations: [expect.objectContaining({ field: 'overlay' })] });

      expect(projectLegacyUiState({ ...input, mode: 'menu', overlay: 'auth' })).toEqual({
        ok: true,
        snapshot: expect.objectContaining({ primarySurface: 'account', modalSurface: 'none' })
      });
      expect(projectLegacyUiState({ ...input, mode: 'menu', overlay: 'confirm-progression-reset' })).toEqual({
        ok: true,
        snapshot: expect.objectContaining({ primarySurface: 'home', modalSurface: 'confirm-reset-progress' })
      });
      expect(projectLegacyUiState({ ...input, mode: 'menu', overlay: 'leaderboard' })).toEqual({
        ok: true,
        snapshot: expect.objectContaining({ primarySurface: 'leaderboard', modalSurface: 'none' })
      });
      const throwingPrototype = new Proxy({}, { getPrototypeOf: () => { throw new Error('trap'); } });
      expect(() => projectLegacyUiState(throwingPrototype)).not.toThrow();
      expect(projectLegacyUiState(throwingPrototype)).toEqual({
        ok: false,
        violations: [expect.objectContaining({ field: '(input)' })]
      });
    });

    it('keeps shared state modules renderer-independent', () => {
      for (const path of [
        'src/state/uiCommands.ts',
        'src/state/uiStore.ts',
        'src/state/uiProfiles.ts',
        'src/state/uiViewModels.ts',
        'src/state/uiLegacyProjection.ts'
      ]) {
        const source = readFileSync(path, 'utf8');
        expect(source).not.toMatch(/from\s+['"][^'"]*(?:phaser|MenuScene|\/dom\/)[^'"]*['"]/i);
        expect(source).not.toMatch(/\b(?:document|window|HTMLElement)\b/);
      }
    });
  });

  describe('dependency-ordered integrator-wave ownership', () => {
    it('rejects a synthetic changed-file list that touches another wave\'s assigned path', async () => {
      const { readDecisionRegistryForStateModel, collectProtectedPathViolationsForStateModel } = await loadChecker();
      const decisionRegistry = await readDecisionRegistryForStateModel();

      const violations = collectProtectedPathViolationsForStateModel([
        'docs/contracts/mazer-ui-rework-state-model.v1.json',
        'src/scenes/MenuScene.ts'
      ], decisionRegistry);

      expect(violations.some((entry) => entry.rule === 'integrator-wave-ownership-mismatch' && entry.path === 'src/scenes/MenuScene.ts')).toBe(true);
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

    it('keeps this working tree\'s real changed files within one registered integrator wave', async () => {
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

      const { collectIntegratorWaveMixViolations } = await import('../../scripts/check-decision-registry.mjs') as {
        collectIntegratorWaveMixViolations: (
          changedFiles: string[],
          registry: Record<string, unknown>
        ) => StateModelViolation[];
      };
      const violations = collectIntegratorWaveMixViolations(changedFiles, decisionRegistry);
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
          entry.rule === 'integrator-wave-ownership-mismatch' && entry.path === 'package.json'
        ))).toBe(true);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
