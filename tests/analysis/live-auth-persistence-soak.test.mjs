import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { describe, expect, test } from 'vitest';
import {
  AUTHENTICATED_FIXTURE_SETTINGS_STORAGE_KEY,
  FIXTURE_SETTINGS_STORAGE_KEYS,
  RETIRED_LOCAL_AUTH_CONTROLS,
  SIGNED_OUT_SHARED_ACCOUNT_BUTTONS,
  buildAuthPersistenceRoute,
  buildVercelProtectionBypassSeedUrl,
  createGuardedAuthPersistenceContext,
  createFixtureSettingsRestorePlan,
  evaluateFixtureSettingsCleanup,
  evaluateFixtureSettingsIsolation,
  evaluateTrailShineChangedStatePersistence,
  isExternalMutationRequest,
  measureAuthPersistenceElapsedMs,
  persistAuthPersistenceFailureEvidence,
  publishAuthPersistenceSuccessAfterCleanup,
  requireFixtureSettingsCleanupPage,
  resolveAuthPersistenceArtifactPath,
  resolveAuthPersistenceExecutionPlan,
  resolveProtectedDeploymentIdentity,
  sanitizeAuthPersistenceDiagnosticText,
  sanitizeAuthPersistenceDiagnosticUrl,
  seedVercelProtectionBypassCookie,
  settleAuthPersistenceResources,
  summarizeAuthPersistenceSurface,
  summarizeAuthPersistenceSoak,
  verifyReadOnlyServiceWorkerAssets,
  resolveTrailShineUiState,
  surfaceMatchesAuthPersistenceExpectation
} from '../../scripts/analysis/live-auth-persistence-soak.mjs';

const PROTECTED_DEPLOYMENT_IDENTITY = Object.freeze({
  deploymentId: 'dpl_6zxHgAEKUbntK8Fw6NW253rZwx1z',
  deploymentUrl: 'https://fawxzzy-mazer-a1b2c3d4e-fawxzzy.vercel.app/',
  sourceCommit: 'a544150002794421f8ea339fffbfd9f71f5a9268'
});

const startSyntheticServiceWorkerMutationServer = async () => {
  const state = { mutations: 0 };
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname === '/sw.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript', 'Service-Worker-Allowed': '/' });
      response.end(`
        self.addEventListener('install', () => self.skipWaiting());
        self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
        self.addEventListener('message', (event) => {
          if (event.data === 'mutate') {
            event.waitUntil(fetch('/mutation', { method: 'POST', body: 'synthetic' }));
          }
        });
      `);
      return;
    }
    if (pathname === '/mutation' && request.method === 'POST') {
      state.mutations += 1;
      response.writeHead(204);
      response.end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><title>service worker mutation boundary</title>');
  });
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('synthetic_service_worker_server_address_missing');
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise())),
    state
  };
};

const passingSteps = [
  'signed-out-shared-account-entry',
  'signed-out-shared-account-contract',
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
  buttons: SIGNED_OUT_SHARED_ACCOUNT_BUTTONS,
  exactButtons: true,
  forbiddenButtons: RETIRED_LOCAL_AUTH_CONTROLS,
  mode: 'menu',
  overlay: 'none'
};

const currentSignedOutSurface = {
  authStatus: 'anonymous',
  buttons: [...SIGNED_OUT_SHARED_ACCOUNT_BUTTONS],
  mode: 'menu',
  overlay: 'none',
  userIdPresent: false
};

const fixtureSettingsPreimage = Object.freeze({
  authenticated: '{"toggleTrailPulse":true}',
  guest: '{"toggleTrailPulse":false,"volume":0.25}',
  unscoped: '{"toggleTrailPulse":true,"volume":0.5}'
});
const fixtureSettingsChanged = Object.freeze({
  ...fixtureSettingsPreimage,
  authenticated: '{"toggleTrailPulse":false}'
});

describe('live auth persistence soak contract', () => {
  test('reads controls only from the canonical top-level visual buttons contract', () => {
    const runtime = { auth: { status: 'guest', userIdPresent: false } };
    const visual = {
      buttons: SIGNED_OUT_SHARED_ACCOUNT_BUTTONS.map((text) => ({ text })),
      runtime: { mode: 'menu', overlay: 'none' }
    };
    const canonical = summarizeAuthPersistenceSurface({ runtime, visual });
    expect(canonical).toMatchObject({
      authStatus: 'guest',
      buttons: SIGNED_OUT_SHARED_ACCOUNT_BUTTONS,
      mode: 'menu',
      overlay: 'none',
      userIdPresent: false
    });
    expect(surfaceMatchesAuthPersistenceExpectation(canonical, signedOutExpectation)).toBe(true);

    const nestedOnly = summarizeAuthPersistenceSurface({
      runtime,
      visual: {
        runtime: {
          buttons: SIGNED_OUT_SHARED_ACCOUNT_BUTTONS.map((text) => ({ text })),
          mode: 'menu',
          overlay: 'none'
        }
      }
    });
    expect(nestedOnly.buttons).toEqual([]);
    expect(surfaceMatchesAuthPersistenceExpectation(nestedOnly, signedOutExpectation)).toBe(false);
    expect(surfaceMatchesAuthPersistenceExpectation(
      summarizeAuthPersistenceSurface({ runtime: null, visual: null }),
      signedOutExpectation
    )).toBe(false);
  });

  test('existing-server mode never builds or launches preview and public mode stays unchanged', () => {
    expect(resolveAuthPersistenceExecutionPlan({
      baseUrl: 'https://candidate.example.test/path?secret=value',
      useExistingServer: true
    })).toEqual({
      baseUrl: 'https://candidate.example.test/',
      launchPreview: false,
      protectedDeployment: false,
      runBuild: false,
      serviceWorkers: 'block',
      useExistingServer: true
    });
    expect(resolveAuthPersistenceExecutionPlan({ skipBuild: false })).toMatchObject({
      launchPreview: true,
      runBuild: true,
      serviceWorkers: 'block',
      useExistingServer: false
    });
    expect(() => resolveAuthPersistenceExecutionPlan({ useExistingServer: true }))
      .toThrow('existing_server_base_url_required');
  });

  test('protected retained-deployment mode seeds an isolated bypass cookie before browser navigation without widening public aliases', async () => {
    const plan = resolveAuthPersistenceExecutionPlan({
      baseUrl: PROTECTED_DEPLOYMENT_IDENTITY.deploymentUrl,
      ...PROTECTED_DEPLOYMENT_IDENTITY,
      protectedDeployment: true,
      useExistingServer: true
    });
    expect(plan).toMatchObject({
      launchPreview: false,
      protectedDeployment: true,
      runBuild: false,
      serviceWorkers: 'block',
      deploymentIdentity: {
        ...PROTECTED_DEPLOYMENT_IDENTITY,
        digest: expect.stringMatching(/^[0-9a-f]{64}$/u)
      }
    });
    const seedUrl = buildVercelProtectionBypassSeedUrl({
      baseUrl: PROTECTED_DEPLOYMENT_IDENTITY.deploymentUrl,
      protectionBypass: 'fixture-secret'
    });
    expect(new URL(seedUrl).searchParams.get('x-vercel-protection-bypass')).toBe('fixture-secret');
    expect(new URL(seedUrl).searchParams.get('x-vercel-set-bypass-cookie')).toBe('true');
    expect(sanitizeAuthPersistenceDiagnosticUrl(seedUrl)).toBe(
      'https://fawxzzy-mazer-a1b2c3d4e-fawxzzy.vercel.app/?x-vercel-protection-bypass=<redacted>&x-vercel-set-bypass-cookie=<redacted>'
    );
    const calls = [];
    const seeded = await seedVercelProtectionBypassCookie({
      baseUrl: plan.baseUrl,
      context: {
        cookies: async () => {
          calls.push('cookies');
          return [{ name: 'opaque-cookie', value: 'not-inspected' }];
        },
        request: {
          get: async () => {
            calls.push('request');
            return {
              dispose: async () => calls.push('dispose'),
              status: () => 200
            };
          }
        }
      },
      protectionBypass: 'fixture-secret'
    });
    expect(seeded).toEqual({ cookieSeeded: true, status: 200 });
    expect(calls).toEqual(['request', 'dispose', 'cookies']);
    expect(() => resolveAuthPersistenceExecutionPlan({
      baseUrl: 'https://mazer.fawxzzy.com/',
      protectedDeployment: true,
      useExistingServer: true
    })).toThrow('public_alias_protection_bypass_forbidden');
    expect(() => resolveAuthPersistenceExecutionPlan({
      baseUrl: 'http://fawxzzy-mazer-fixture-fawxzzy.vercel.app/',
      ...PROTECTED_DEPLOYMENT_IDENTITY,
      protectedDeployment: true,
      useExistingServer: true
    })).toThrow('protected_deployment_https_required');
    expect(() => buildVercelProtectionBypassSeedUrl({
      baseUrl: 'https://example.com/',
      protectionBypass: 'fixture-secret'
    })).toThrow('protection_bypass_target_forbidden');
    expect(() => buildVercelProtectionBypassSeedUrl({
      baseUrl: 'https://attacker.vercel.app/',
      protectionBypass: 'fixture-secret'
    })).toThrow('protection_bypass_target_forbidden');
    expect(() => buildVercelProtectionBypassSeedUrl({
      baseUrl: 'http://fawxzzy-mazer-fixture-fawxzzy.vercel.app/',
      protectionBypass: 'fixture-secret'
    })).toThrow('protected_deployment_https_required');
    await expect(seedVercelProtectionBypassCookie({
      baseUrl: 'http://fawxzzy-mazer-fixture-fawxzzy.vercel.app/',
      context: {
        cookies: async () => [],
        request: { get: async () => { throw new Error('must not execute'); } }
      },
      protectionBypass: 'fixture-secret'
    })).rejects.toThrow('protected_deployment_https_required');
    await expect(seedVercelProtectionBypassCookie({
      baseUrl: plan.baseUrl,
      context: {
        cookies: async () => [],
        request: { get: async () => ({ dispose: async () => {}, status: () => 200 }) }
      },
      protectionBypass: 'fixture-secret'
    })).rejects.toThrow('protection_bypass_cookie_seed_failed');
    const requestFailure = await seedVercelProtectionBypassCookie({
      baseUrl: plan.baseUrl,
      context: {
        cookies: async () => [],
        request: {
          get: async () => {
            throw new Error('request failed for https://example.test/?x-vercel-protection-bypass=fixture-secret');
          }
        }
      },
      protectionBypass: 'fixture-secret'
    }).catch((error) => error);
    expect(requestFailure.message).toBe('protection_bypass_cookie_seed_request_failed');
    expect(requestFailure.stack).not.toContain('fixture-secret');
    expect(sanitizeAuthPersistenceDiagnosticText(
      'GET https://example.test/?x-vercel-protection-bypass=fixture-secret&x-vercel-set-bypass-cookie=true'
    )).toBe(
      'GET https://example.test/?x-vercel-protection-bypass=<redacted>&x-vercel-set-bypass-cookie=<redacted>'
    );
  });

  test('requires exact immutable deployment and source identity before protected success can exist', () => {
    const identity = resolveProtectedDeploymentIdentity({
      baseUrl: PROTECTED_DEPLOYMENT_IDENTITY.deploymentUrl,
      ...PROTECTED_DEPLOYMENT_IDENTITY
    });
    expect(identity).toEqual({
      ...PROTECTED_DEPLOYMENT_IDENTITY,
      digest: expect.stringMatching(/^[0-9a-f]{64}$/u)
    });
    expect(() => resolveAuthPersistenceExecutionPlan({
      baseUrl: PROTECTED_DEPLOYMENT_IDENTITY.deploymentUrl,
      protectedDeployment: true,
      useExistingServer: true
    })).toThrow('protected_deployment_id_invalid');
    expect(() => resolveAuthPersistenceExecutionPlan({
      baseUrl: PROTECTED_DEPLOYMENT_IDENTITY.deploymentUrl,
      ...PROTECTED_DEPLOYMENT_IDENTITY,
      deploymentId: 'preview-alias',
      protectedDeployment: true,
      useExistingServer: true
    })).toThrow('protected_deployment_id_invalid');
    expect(() => resolveAuthPersistenceExecutionPlan({
      baseUrl: PROTECTED_DEPLOYMENT_IDENTITY.deploymentUrl,
      ...PROTECTED_DEPLOYMENT_IDENTITY,
      sourceCommit: 'not-a-commit',
      protectedDeployment: true,
      useExistingServer: true
    })).toThrow('protected_deployment_source_commit_invalid');
    expect(() => resolveAuthPersistenceExecutionPlan({
      baseUrl: 'https://fawxzzy-mazer-git-main-fawxzzy.vercel.app/',
      ...PROTECTED_DEPLOYMENT_IDENTITY,
      deploymentUrl: 'https://fawxzzy-mazer-git-main-fawxzzy.vercel.app/',
      protectedDeployment: true,
      useExistingServer: true
    })).toThrow('protected_deployment_immutable_url_required');
    expect(() => resolveAuthPersistenceExecutionPlan({
      baseUrl: 'https://fawxzzy-mazer-z9y8x7w6v-fawxzzy.vercel.app/',
      ...PROTECTED_DEPLOYMENT_IDENTITY,
      protectedDeployment: true,
      useExistingServer: true
    })).toThrow('protected_deployment_identity_mismatch');
  });

  test('verifies service-worker assets through read-only request-context GETs', async () => {
    const calls = [];
    const assets = await verifyReadOnlyServiceWorkerAssets({
      baseUrl: PROTECTED_DEPLOYMENT_IDENTITY.deploymentUrl,
      context: {
        request: {
          get: async (url) => {
            calls.push(url);
            return {
              body: async () => Buffer.from(`asset:${new URL(url).pathname}`),
              dispose: async () => {},
              status: () => 200
            };
          }
        }
      }
    });
    expect(calls.map((url) => new URL(url).pathname)).toEqual(['/app-sw.js', '/sw.js']);
    expect(assets).toEqual([
      expect.objectContaining({ pathname: '/app-sw.js', status: 200, sha256: expect.stringMatching(/^[0-9a-f]{64}$/u) }),
      expect.objectContaining({ pathname: '/sw.js', status: 200, sha256: expect.stringMatching(/^[0-9a-f]{64}$/u) })
    ]);
  });

  test('recognizes shared account entry on the main menu and rejects every retired local-auth control', () => {
    expect(surfaceMatchesAuthPersistenceExpectation(currentSignedOutSurface, signedOutExpectation)).toBe(true);
    expect(surfaceMatchesAuthPersistenceExpectation(currentSignedOutSurface, {
      authenticated: false,
      buttons: ['Play as guest', 'Sign In'],
      mode: 'menu',
      overlay: 'auth'
    })).toBe(false);
    expect(surfaceMatchesAuthPersistenceExpectation({
      ...currentSignedOutSurface,
      buttons: [...SIGNED_OUT_SHARED_ACCOUNT_BUTTONS, 'Play as guest']
    }, signedOutExpectation)).toBe(false);
    expect(surfaceMatchesAuthPersistenceExpectation({
      ...currentSignedOutSurface,
      buttons: [...SIGNED_OUT_SHARED_ACCOUNT_BUTTONS, 'Continue offline']
    }, signedOutExpectation)).toBe(false);
  });

  test('uses only the authenticated diagnostics fixture for gameplay continuation', () => {
    expect(buildAuthPersistenceRoute(true)).toContain('runtimeDiagnostics=1&authFixture=authenticated');
    expect(buildAuthPersistenceRoute(false)).toContain('runtimeDiagnostics=1');
    expect(buildAuthPersistenceRoute(false)).not.toContain('authFixture=authenticated');

    const source = readFileSync(resolve(process.cwd(), 'scripts/analysis/live-auth-persistence-soak.mjs'), 'utf8');
    expect(source).toContain("id: 'diagnostics-fixture-play'");
    expect(source).toContain("id: 'signed-out-shared-account-contract'");
    expect(source).not.toContain("findVisualButtonCenter((await readDiagnostics(page)).visual, 'Sign in'");
    expect(source).toContain("buttons: ['Back', 'Guide', 'Trail Shine', 'Main Menu']");
    expect(source).toContain("id: 'diagnostics-fixture-account'");
    expect(source).toContain("buttons: ['Account'], mode: 'menu', overlay: 'options'");
    expect(source).not.toContain("buttons: ['username', 'Reset progress', 'Sign out']");
    expect(source).toContain("findVisualButtonCenter((await readDiagnostics(page)).visual, 'Trail Shine'");
    expect(source).toContain('evaluateTrailShineChangedStatePersistence({');
    expect(source).toContain('fixture_settings_restore');
    expect(source).toContain('(visual?.buttons ?? [])');
    expect(source).not.toContain('visual?.runtime?.buttons');
    expect(source).toContain('executionPlan.launchPreview');
    expect(source).toContain("serviceWorkers: executionPlan.serviceWorkers");
    expect(source).toContain('context.request.get(seedUrl');
    expect(source).not.toContain('page.goto(seedUrl');
    expect(source).toContain('installLivePlayQaServiceWorkerStabilizationProbe(page)');
    expect(source).toContain('settleLivePlayQaServiceWorkerNavigation({');
    expect(source).not.toContain('const logoutPoint =');
    expect(source.match(/Play as guest/gu)).toHaveLength(1);
    expect(source).toContain('forbiddenButtons: RETIRED_LOCAL_AUTH_CONTROLS');
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
    expect(createFixtureSettingsRestorePlan({ authenticated: null })).toEqual({
      action: 'remove',
      key: AUTHENTICATED_FIXTURE_SETTINGS_STORAGE_KEY,
      value: null
    });
    expect(createFixtureSettingsRestorePlan({ authenticated: '{"toggleTrailPulse":false}' })).toEqual({
      action: 'set',
      key: AUTHENTICATED_FIXTURE_SETTINGS_STORAGE_KEY,
      value: '{"toggleTrailPulse":false}'
    });
    expect(FIXTURE_SETTINGS_STORAGE_KEYS).toEqual({
      authenticated: AUTHENTICATED_FIXTURE_SETTINGS_STORAGE_KEY,
      guest: 'mazer.game-toggles.v1:guest',
      unscoped: 'mazer.game-toggles.v1'
    });
  });

  test('accepts changed-state persistence only when the authenticated key changes alone and cleanup is exact', () => {
    expect(evaluateFixtureSettingsIsolation({
      preimage: fixtureSettingsPreimage,
      changed: fixtureSettingsChanged,
      reloaded: fixtureSettingsChanged,
      expectedTrailShine: false
    })).toEqual({
      pass: true,
      expectedKeyChanged: true,
      expectedKeyPersisted: true,
      changedValueMatches: true,
      reloadedValueMatches: true,
      guestByteIdentical: true,
      unscopedByteIdentical: true
    });
    expect(evaluateFixtureSettingsCleanup({
      preimage: fixtureSettingsPreimage,
      postimage: fixtureSettingsPreimage
    })).toEqual({
      pass: true,
      authenticatedByteIdentical: true,
      guestByteIdentical: true,
      unscopedByteIdentical: true
    });
  });

  test('rejects a UI change that does not persist in the authenticated settings key', () => {
    expect(evaluateFixtureSettingsIsolation({
      preimage: fixtureSettingsPreimage,
      changed: fixtureSettingsChanged,
      reloaded: fixtureSettingsPreimage,
      expectedTrailShine: false
    })).toMatchObject({
      pass: false,
      expectedKeyChanged: true,
      expectedKeyPersisted: false,
      reloadedValueMatches: false
    });
  });

  test('rejects mutation of the guest key instead of the authenticated fixture key', () => {
    const wrongKeyMutation = {
      ...fixtureSettingsPreimage,
      guest: '{"toggleTrailPulse":true,"volume":0.25}'
    };
    expect(evaluateFixtureSettingsIsolation({
      preimage: fixtureSettingsPreimage,
      changed: wrongKeyMutation,
      reloaded: wrongKeyMutation,
      expectedTrailShine: false
    })).toMatchObject({
      pass: false,
      expectedKeyChanged: false,
      changedValueMatches: false,
      guestByteIdentical: false
    });
  });

  test('rejects collateral guest or unscoped key mutation even when authenticated persistence succeeds', () => {
    for (const collateralKey of ['guest', 'unscoped']) {
      const collateralMutation = {
        ...fixtureSettingsChanged,
        [collateralKey]: `${fixtureSettingsChanged[collateralKey]}-mutated`
      };
      expect(evaluateFixtureSettingsIsolation({
        preimage: fixtureSettingsPreimage,
        changed: collateralMutation,
        reloaded: collateralMutation,
        expectedTrailShine: false
      })).toMatchObject({ pass: false, [`${collateralKey}ByteIdentical`]: false });
    }
  });

  test('cleanup mismatch prevents success publication and latest promotion', async () => {
    const events = [];
    expect(evaluateFixtureSettingsCleanup({
      preimage: fixtureSettingsPreimage,
      postimage: fixtureSettingsChanged
    })).toMatchObject({ pass: false, authenticatedByteIdentical: false });

    await expect(publishAuthPersistenceSuccessAfterCleanup({
      cleanupErrors: ['fixture_settings_restore:fixture_settings_complete_postimage_mismatch'],
      writeSummary: async () => { events.push('summary'); },
      promoteLatest: async () => { events.push('latest'); }
    })).resolves.toEqual({ published: false, promoted: false });
    expect(events).toEqual([]);

    await expect(publishAuthPersistenceSuccessAfterCleanup({
      cleanupErrors: [],
      writeSummary: async () => { events.push('summary'); },
      promoteLatest: async () => { events.push('latest'); }
    })).resolves.toEqual({ published: true, promoted: true });
    expect(events).toEqual(['summary', 'latest']);
  });

  test('treats a closed page after preimage capture as cleanup failure', () => {
    expect(() => requireFixtureSettingsCleanupPage({
      page: { isClosed: () => true },
      preimage: fixtureSettingsPreimage
    })).toThrow('fixture_settings_cleanup_page_unavailable');
    expect(requireFixtureSettingsCleanupPage({ page: null, preimage: null })).toBe(false);
  });

  test('measures delayed failure at evidence-capture time from the monotonic run start', () => {
    expect(measureAuthPersistenceElapsedMs(100, 30_100)).toBe(30_000);
    expect(measureAuthPersistenceElapsedMs(100, 30_100)).toBeGreaterThan(29_000);
    const source = readFileSync(resolve(process.cwd(), 'scripts/analysis/live-auth-persistence-soak.mjs'), 'utf8');
    expect(source).not.toContain("elapsedMs: phaseTimings.at(-1)?.elapsedMs");
    expect(source).toContain('elapsedMs: measureAuthPersistenceElapsedMs(runStartedAt)');
  });

  test('blocks external mutation methods while allowing local fixture traffic and read-only requests', () => {
    const allowedOrigin = 'http://127.0.0.1:4173';
    expect(isExternalMutationRequest({ method: 'POST', url: 'https://project.supabase.co/rest/v1/profiles' }, allowedOrigin)).toBe(true);
    expect(isExternalMutationRequest({ method: 'PATCH', url: 'https://project.supabase.co/rest/v1/profiles' }, allowedOrigin)).toBe(true);
    expect(isExternalMutationRequest({ method: 'GET', url: 'https://project.supabase.co/rest/v1/profiles' }, allowedOrigin)).toBe(false);
    expect(isExternalMutationRequest(
      { method: 'POST', url: `${allowedOrigin}/fixture` },
      allowedOrigin,
      { allowSameOriginMutations: true }
    )).toBe(false);
    expect(isExternalMutationRequest(
      { method: 'POST', url: 'https://fawxzzy-mazer-fixture-fawxzzy.vercel.app/api/settings' },
      'https://fawxzzy-mazer-fixture-fawxzzy.vercel.app/',
      { allowSameOriginMutations: false }
    )).toBe(true);
    expect(isExternalMutationRequest(
      { method: 'GET', url: 'https://fawxzzy-mazer-fixture-fawxzzy.vercel.app/api/settings' },
      'https://fawxzzy-mazer-fixture-fawxzzy.vercel.app/',
      { allowSameOriginMutations: false }
    )).toBe(false);
  });

  test('blocks service-worker mutation reachability at the real browser boundary', async () => {
    const synthetic = await startSyntheticServiceWorkerMutationServer();
    const browser = await chromium.launch({ headless: true });
    try {
      const vulnerableControl = await browser.newContext({ serviceWorkers: 'allow' });
      const controlPage = await vulnerableControl.newPage();
      await controlPage.goto(synthetic.baseUrl);
      await controlPage.evaluate(async () => {
        await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
      });
      await controlPage.reload();
      await controlPage.waitForFunction(() => navigator.serviceWorker.controller !== null);
      await controlPage.evaluate(() => navigator.serviceWorker.controller?.postMessage('mutate'));
      await expect.poll(() => synthetic.state.mutations, { timeout: 5_000 }).toBe(1);
      await vulnerableControl.close();

      const blockedMutationRequests = [];
      const executionPlan = resolveAuthPersistenceExecutionPlan({
        baseUrl: synthetic.baseUrl,
        useExistingServer: true
      });
      const guardedContext = await createGuardedAuthPersistenceContext({
        browser,
        executionPlan,
        resolvedBaseUrl: synthetic.baseUrl,
        blockedMutationRequests
      });
      const guardedPage = await guardedContext.newPage();
      await guardedPage.goto(synthetic.baseUrl);
      const guardedResult = await guardedPage.evaluate(async () => {
        let registrationBlocked = false;
        try {
          await navigator.serviceWorker.register('/sw.js');
        } catch {
          registrationBlocked = true;
        }
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
        const controlled = navigator.serviceWorker.controller !== null;
        const mutationResult = await fetch('/mutation', { method: 'POST', body: 'synthetic' })
          .then(() => 'unexpected-success')
          .catch(() => 'blocked');
        return { controlled, mutationResult, registrationBlocked };
      });
      expect(guardedResult).toMatchObject({
        controlled: false,
        mutationResult: 'blocked'
      });
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
      expect(synthetic.state.mutations).toBe(1);
      expect(blockedMutationRequests).toEqual([
        expect.objectContaining({ method: 'POST', url: `${synthetic.baseUrl}mutation` })
      ]);
      await guardedContext.close();
    } finally {
      await browser.close();
      await synthetic.close();
    }
  }, 20_000);

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
        currentPhase: 'signed-out-shared-account-entry',
        elapsedMs: 30_000,
        phaseTimings: [{ phase: 'signed-out-shared-account-entry', elapsedMs: 0 }],
        navigationHistory: [{ elapsedMs: 1, url: 'https://example.test/?runtimeDiagnostics=<redacted>' }],
        error: 'surface_timeout',
        url: sanitizeAuthPersistenceDiagnosticUrl('https://example.test/?token=private&runtimeDiagnostics=1#secret'),
        title: 'Mazer',
        document: { readyState: 'complete', visibilityState: 'visible' },
        controls: [{ tag: 'button', type: 'button', name: null, text: 'Login' }],
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
        currentPhase: 'signed-out-shared-account-entry',
        elapsedMs: 30_000,
        navigationHistory: [{ elapsedMs: 1, url: 'https://example.test/?runtimeDiagnostics=<redacted>' }],
        error: 'surface_timeout',
        document: { readyState: 'complete', visibilityState: 'visible' },
        canvas: { visible: true },
        surface: { overlay: 'none' },
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
    expect(summarizeAuthPersistenceSoak(
      passingSteps,
      ['Service Worker registration blocked by Playwright'],
      [],
      { serviceWorkersBlocked: true }
    )).toMatchObject({
      pass: true,
      actionableConsoleMessages: []
    });
    expect(summarizeAuthPersistenceSoak(
      passingSteps,
      ['Service Worker registration blocked by Playwright'],
      [],
      { serviceWorkersBlocked: false }
    )).toMatchObject({
      pass: false,
      actionableConsoleMessages: ['Service Worker registration blocked by Playwright']
    });
  });
});
