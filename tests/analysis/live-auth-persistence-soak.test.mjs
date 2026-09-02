import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  AUTHENTICATED_FIXTURE_SETTINGS_STORAGE_KEY,
  RETIRED_GUEST_ENTRY_BUTTON,
  SIGNED_OUT_AUTH_GATE_BUTTONS,
  buildAuthPersistenceRoute,
  createFixtureSettingsRestorePlan,
  evaluateTrailShineChangedStatePersistence,
  isExternalMutationRequest,
  persistAuthPersistenceFailureEvidence,
  resolveAuthPersistenceArtifactPath,
  sanitizeAuthPersistenceDiagnosticText,
  sanitizeAuthPersistenceDiagnosticUrl,
  settleAuthPersistenceResources,
  summarizeAuthPersistenceSoak,
  resolveTrailShineUiState,
  surfaceMatchesAuthPersistenceExpectation
} from '../../scripts/analysis/live-auth-persistence-soak.mjs';

const passingSteps = [
  'signed-out-account-gate',
  'signed-out-empty-submit-stays-gated',
  'diagnostics-fixture-entry',
  'diagnostics-fixture-options',
  'diagnostics-fixture-trail-shine-changed',
  'authenticated-reload',
  'authenticated-options-reload',
  'diagnostics-fixture-play',
  'authenticated-pause-reentry',
  'diagnostics-fixture-account',
  'fixture-reentry'
].map((id) => ({ id, pass: true }));

const signedOutExpectation = {
  authenticated: false,
  buttons: SIGNED_OUT_AUTH_GATE_BUTTONS,
  exactButtons: true,
  forbiddenButtons: [RETIRED_GUEST_ENTRY_BUTTON],
  mode: 'menu',
  overlay: 'auth'
};

const currentSignedOutSurface = {
  authStatus: 'anonymous',
  buttons: [...SIGNED_OUT_AUTH_GATE_BUTTONS],
  mode: 'menu',
  overlay: 'auth',
  userIdPresent: false
};

describe('live auth persistence soak contract', () => {
  test('recognizes the current signed-out account gate and rejects the retired guest expectation', () => {
    expect(surfaceMatchesAuthPersistenceExpectation(currentSignedOutSurface, signedOutExpectation)).toBe(true);
    expect(surfaceMatchesAuthPersistenceExpectation(currentSignedOutSurface, {
      authenticated: false,
      buttons: [RETIRED_GUEST_ENTRY_BUTTON, 'Sign In'],
      mode: 'menu',
      overlay: 'auth'
    })).toBe(false);
    expect(surfaceMatchesAuthPersistenceExpectation({
      ...currentSignedOutSurface,
      buttons: [...SIGNED_OUT_AUTH_GATE_BUTTONS, RETIRED_GUEST_ENTRY_BUTTON]
    }, signedOutExpectation)).toBe(false);
    expect(surfaceMatchesAuthPersistenceExpectation({
      ...currentSignedOutSurface,
      buttons: [...SIGNED_OUT_AUTH_GATE_BUTTONS, 'Continue offline']
    }, signedOutExpectation)).toBe(false);
  });

  test('uses only the authenticated diagnostics fixture for gameplay continuation', () => {
    expect(buildAuthPersistenceRoute(true)).toContain('runtimeDiagnostics=1&authFixture=authenticated');
    expect(buildAuthPersistenceRoute(false)).toContain('runtimeDiagnostics=1');
    expect(buildAuthPersistenceRoute(false)).not.toContain('authFixture=authenticated');

    const source = readFileSync(resolve(process.cwd(), 'scripts/analysis/live-auth-persistence-soak.mjs'), 'utf8');
    expect(source).toContain("id: 'diagnostics-fixture-play'");
    expect(source).toContain("buttons: ['Back', 'Guide', 'Trail Shine', 'Main Menu']");
    expect(source).toContain("id: 'diagnostics-fixture-account'");
    expect(source).toContain("findVisualButtonCenter((await readDiagnostics(page)).visual, 'Trail Shine'");
    expect(source).toContain('evaluateTrailShineChangedStatePersistence({');
    expect(source).toContain('fixture_settings_restore');
    expect(source).not.toContain('const logoutPoint =');
    expect(source.match(/Play as guest/gu)).toHaveLength(1);
    expect(source).toContain('forbiddenButtons: [RETIRED_GUEST_ENTRY_BUTTON]');
  });

  test('requires an opposite Trail Shine state in runtime and visible UI before and after reload', () => {
    const passing = evaluateTrailShineChangedStatePersistence({
      initialRuntime: true,
      initialUi: true,
      changedRuntime: false,
      changedUi: false,
      reloadedRuntime: false,
      reloadedUi: false
    });
    expect(passing).toMatchObject({
      pass: true,
      expectedChanged: false,
      changed: { runtime: false, ui: false },
      reloaded: { runtime: false, ui: false }
    });
  });

  test('rejects no-op persistence and same-default-before-and-after evidence', () => {
    const sameDefault = {
      initialRuntime: true,
      initialUi: true,
      changedRuntime: true,
      changedUi: true,
      reloadedRuntime: true,
      reloadedUi: true
    };
    expect(evaluateTrailShineChangedStatePersistence(sameDefault).pass).toBe(false);
    expect(evaluateTrailShineChangedStatePersistence({
      ...sameDefault,
      changedRuntime: false,
      changedUi: false,
      reloadedRuntime: true,
      reloadedUi: true
    }).pass).toBe(false);
  });

  test('derives the visible Trail Shine state from labels inside the actual control bounds', () => {
    const createVisual = (text) => ({
      buttons: [{ text: 'Trail Shine', bounds: { left: 10, right: 210, top: 20, bottom: 80 } }],
      textLabels: [{ text, bounds: { centerX: 180, centerY: 50 } }]
    });
    expect(resolveTrailShineUiState(createVisual('On'))).toBe(true);
    expect(resolveTrailShineUiState(createVisual('Trail Shine: Off'))).toBe(false);
    expect(resolveTrailShineUiState({
      ...createVisual('On'),
      textLabels: [{ text: 'On', bounds: { centerX: 300, centerY: 50 } }]
    })).toBe(null);
  });

  test('restores only the authenticated fixture settings key', () => {
    expect(createFixtureSettingsRestorePlan({ present: false, value: null })).toEqual({
      action: 'remove',
      key: AUTHENTICATED_FIXTURE_SETTINGS_STORAGE_KEY,
      value: null
    });
    expect(createFixtureSettingsRestorePlan({ present: true, value: '{"toggleTrailPulse":false}' })).toEqual({
      action: 'set',
      key: AUTHENTICATED_FIXTURE_SETTINGS_STORAGE_KEY,
      value: '{"toggleTrailPulse":false}'
    });
  });

  test('blocks external mutation methods while allowing local fixture traffic and read-only requests', () => {
    const allowedOrigin = 'http://127.0.0.1:4173';
    expect(isExternalMutationRequest({ method: 'POST', url: 'https://project.supabase.co/rest/v1/profiles' }, allowedOrigin)).toBe(true);
    expect(isExternalMutationRequest({ method: 'PATCH', url: 'https://project.supabase.co/rest/v1/profiles' }, allowedOrigin)).toBe(true);
    expect(isExternalMutationRequest({ method: 'GET', url: 'https://project.supabase.co/rest/v1/profiles' }, allowedOrigin)).toBe(false);
    expect(isExternalMutationRequest({ method: 'POST', url: `${allowedOrigin}/fixture` }, allowedOrigin)).toBe(false);
  });

  test('constrains artifact labels to the session directory', () => {
    const root = resolve(tmpdir(), 'mazer-auth-soak-artifacts');
    expect(resolveAuthPersistenceArtifactPath(root, 'safe-label_01', '.summary.json'))
      .toBe(resolve(root, 'safe-label_01.summary.json'));
    expect(() => resolveAuthPersistenceArtifactPath(root, '../escape', '.json')).toThrow('unsafe_artifact_label');
    expect(() => resolveAuthPersistenceArtifactPath(root, 'C:\\escape', '.json')).toThrow('unsafe_artifact_label');
  });

  test('sanitizes secret-shaped diagnostic text before it can be persisted', () => {
    const raw = 'Bearer abc.def.ghi user@example.com token=private password=hunter2';
    const sanitized = sanitizeAuthPersistenceDiagnosticText(raw);
    expect(sanitized).toBe('Bearer <redacted> <redacted-email> token=<redacted> password=<redacted>');
    expect(sanitized).not.toContain('abc.def.ghi');
    expect(sanitized).not.toContain('user@example.com');
    expect(sanitized).not.toContain('hunter2');
  });

  test('settles every resource even when evidence and browser cleanup fail', async () => {
    const settled = [];
    const errors = await settleAuthPersistenceResources([
      { name: 'fixture_settings_restore', run: async () => { settled.push('fixture'); } },
      { name: 'failure_evidence', run: async () => { throw new Error('write failed'); } },
      { name: 'browser_close', run: async () => { settled.push('browser'); throw new Error('close failed'); } },
      { name: 'preview_stop', run: async () => { settled.push('preview'); } }
    ]);
    expect(settled).toEqual(['fixture', 'browser', 'preview']);
    expect(errors).toEqual(['failure_evidence:write failed', 'browser_close:close failed']);
  });

  test('persists sanitized finally-safe timeout evidence and a screenshot artifact', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'mazer-auth-soak-evidence-'));
    try {
      const evidence = {
        capturedAt: '2026-09-02T00:00:00.000Z',
        currentPhase: 'signed-out-account-gate',
        elapsedMs: 30_000,
        phaseTimings: [{ phase: 'signed-out-account-gate', elapsedMs: 0 }],
        error: 'surface_timeout',
        url: sanitizeAuthPersistenceDiagnosticUrl('https://example.test/?token=private&runtimeDiagnostics=1#secret'),
        title: 'Mazer',
        document: { readyState: 'complete', visibilityState: 'visible' },
        controls: [{ tag: 'input', type: 'email', name: 'email', text: null }],
        canvas: { width: 810, height: 1916, clientWidth: 405, clientHeight: 958, visible: true },
        surface: currentSignedOutSurface,
        failedRequests: [{ method: 'GET', url: 'https://example.test/api?token=<redacted>' }],
        pendingRequests: [],
        consoleMessages: [],
        pageErrors: [],
        serviceWorker: { controlled: true, controllerScriptUrl: 'https://example.test/sw.js', registrationScopes: [], cacheNames: ['mazer'] },
        captureState: 'captured',
        captureError: null
      };
      const artifacts = await persistAuthPersistenceFailureEvidence({
        outputDir,
        label: 'timeout',
        evidence,
        screenshot: (path) => writeFile(path, Buffer.from('screenshot'))
      });
      const persisted = JSON.parse(await readFile(artifacts.evidencePath, 'utf8'));

      expect(persisted).toMatchObject({
        schema: 'mazer.live-auth-persistence-failure.v1',
        currentPhase: 'signed-out-account-gate',
        elapsedMs: 30_000,
        error: 'surface_timeout',
        document: { readyState: 'complete', visibilityState: 'visible' },
        canvas: { visible: true },
        surface: { overlay: 'auth' },
        serviceWorker: { controlled: true },
        artifacts: { screenshotError: null }
      });
      expect(persisted.url).toBe('https://example.test/?runtimeDiagnostics=<redacted>&token=<redacted>');
      expect(await readFile(artifacts.screenshotPath, 'utf8')).toBe('screenshot');
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  test('requires the complete visible mobile account-state sequence', () => {
    expect(summarizeAuthPersistenceSoak(passingSteps, [], [])).toMatchObject({
      pass: true,
      missingSteps: []
    });
    expect(summarizeAuthPersistenceSoak(passingSteps.filter((step) => step.id !== 'diagnostics-fixture-options'), [], [])).toMatchObject({
      pass: false,
      missingSteps: ['diagnostics-fixture-options']
    });
    expect(summarizeAuthPersistenceSoak(passingSteps.filter((step) => step.id !== 'diagnostics-fixture-play'), [], [])).toMatchObject({
      pass: false,
      missingSteps: ['diagnostics-fixture-play']
    });
  });

  test('ignores only the known WebGL teardown diagnostic', () => {
    expect(summarizeAuthPersistenceSoak(passingSteps, ['WebGL: CONTEXT_LOST_WEBGL: loseContext: context lost'], [])).toMatchObject({
      pass: true,
      actionableConsoleMessages: []
    });
    expect(summarizeAuthPersistenceSoak(passingSteps, ['unexpected runtime warning'], [])).toMatchObject({
      pass: false,
      actionableConsoleMessages: ['unexpected runtime warning']
    });
  });
});
