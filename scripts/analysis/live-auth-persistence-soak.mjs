import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  REPO_ROOT,
  STACK_ROOT,
  ensureDir,
  parseCliArgs,
  resolveSessionId
} from '../visual/common.mjs';
import { launchPreviewServer, stopPreviewServer } from '../visual/preview-server.mjs';
import {
  createLivePlayQaNavigationTracker,
  installLivePlayQaServiceWorkerStabilizationProbe,
  settleLivePlayQaServiceWorkerNavigation
} from './live-play-qa.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH;
const DEFAULT_ARTIFACT_ROOT = resolve(STACK_ROOT, 'tmp', 'captures', 'mazer-live-auth-persistence-soak');
const RUNTIME_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-runtime-diagnostics';
const VISUAL_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-visual-diagnostics';
const MOBILE_VIEWPORT = Object.freeze({ width: 405, height: 958 });
const MOBILE_DPR = 2;
const TIMEOUT_MS = 30_000;
const PUBLIC_PRODUCTION_HOST = 'mazer.fawxzzy.com';
const PROTECTED_DEPLOYMENT_HOST_PATTERN = /^fawxzzy-mazer-[a-z0-9-]+-fawxzzy\.vercel\.app$/u;
const IMMUTABLE_PROTECTED_DEPLOYMENT_HOST_PATTERN = /^fawxzzy-mazer-[a-z0-9]{8,32}-fawxzzy\.vercel\.app$/u;
const VERCEL_DEPLOYMENT_ID_PATTERN = /^dpl_[A-Za-z0-9]{20,64}$/u;
const SOURCE_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const READ_ONLY_SERVICE_WORKER_ASSETS = Object.freeze(['/app-sw.js', '/sw.js']);
const EXPECTED_VERCEL_PROJECT_ID = 'prj_t3zothbtj9DExrh3FjMsH98hwwSZ';
const EXPECTED_VERCEL_TEAM_ID = 'team_CMJn7MvzFZZBnhNnjVUZF2RD';
const EXPECTED_VERCEL_SCOPE = 'fawxzzy';
const EXPECTED_GITHUB_REPOSITORY_ID = 1212867711;
const SERVICE_WORKER_ASSET_MARKERS = Object.freeze({
  '/app-sw.js': ['precacheAndRoute', 'self.skipWaiting'],
  '/sw.js': ["self.addEventListener('install'", 'CANONICAL_ORIGIN']
});

export const SIGNED_OUT_SHARED_ACCOUNT_BUTTONS = Object.freeze([
  'Login',
  'Settings',
  'Leaderboard',
  'Account'
]);
export const RETIRED_LOCAL_AUTH_CONTROLS = Object.freeze([
  'Create account',
  'Reset password',
  'Privacy',
  'Terms',
  'Sign in',
  'Play as guest'
]);
export const AUTHENTICATED_FIXTURE_SETTINGS_STORAGE_KEY = 'mazer.game-toggles.v1:user:runtime-diagnostics-auth-fixture';
export const GUEST_FIXTURE_SETTINGS_STORAGE_KEY = 'mazer.game-toggles.v1:guest';
export const UNSCOPED_SETTINGS_STORAGE_KEY = 'mazer.game-toggles.v1';
export const FIXTURE_SETTINGS_STORAGE_KEYS = Object.freeze({
  authenticated: AUTHENTICATED_FIXTURE_SETTINGS_STORAGE_KEY,
  guest: GUEST_FIXTURE_SETTINGS_STORAGE_KEY,
  unscoped: UNSCOPED_SETTINGS_STORAGE_KEY
});

export const normalizeAuthPersistenceBaseUrl = (value) => {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('unsafe_auth_persistence_base_url');
  }
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.toString();
};

const validateProtectedDeploymentClaims = ({
  baseUrl,
  deploymentId,
  deploymentUrl,
  sourceCommit
}) => {
  if (!VERCEL_DEPLOYMENT_ID_PATTERN.test(String(deploymentId ?? ''))) {
    throw new Error('protected_deployment_id_invalid');
  }
  if (!SOURCE_COMMIT_PATTERN.test(String(sourceCommit ?? ''))) {
    throw new Error('protected_deployment_source_commit_invalid');
  }
  if (typeof deploymentUrl !== 'string') {
    throw new Error('protected_deployment_url_required');
  }
  const normalizedDeploymentUrl = normalizeAuthPersistenceBaseUrl(deploymentUrl);
  if (!IMMUTABLE_PROTECTED_DEPLOYMENT_HOST_PATTERN.test(new URL(normalizedDeploymentUrl).hostname)) {
    throw new Error('protected_deployment_immutable_url_required');
  }
  if (normalizedDeploymentUrl !== baseUrl) {
    throw new Error('protected_deployment_identity_mismatch');
  }
  return {
    deploymentId,
    deploymentUrl: normalizedDeploymentUrl,
    sourceCommit
  };
};

export const resolveProtectedDeploymentIdentity = ({
  baseUrl,
  deploymentId,
  deploymentUrl,
  providerDeployment,
  sourceCommit
}) => {
  const normalizedIdentity = validateProtectedDeploymentClaims({
    baseUrl,
    deploymentId,
    deploymentUrl,
    sourceCommit
  });
  const providerUrl = typeof providerDeployment?.url === 'string'
    ? normalizeAuthPersistenceBaseUrl(`https://${providerDeployment.url}`)
    : null;
  const providerSourceCommit = providerDeployment?.gitSource?.sha ?? providerDeployment?.meta?.githubCommitSha;
  if (providerDeployment?.id !== deploymentId
    || providerUrl !== normalizedIdentity.deploymentUrl
    || providerSourceCommit !== sourceCommit
    || providerDeployment?.projectId !== EXPECTED_VERCEL_PROJECT_ID
    || (providerDeployment?.team?.id ?? providerDeployment?.ownerId) !== EXPECTED_VERCEL_TEAM_ID
    || Number(providerDeployment?.gitSource?.repoId ?? providerDeployment?.meta?.githubRepoId)
      !== EXPECTED_GITHUB_REPOSITORY_ID
    || providerDeployment?.readyState !== 'READY') {
    throw new Error('protected_deployment_provider_identity_mismatch');
  }
  return {
    ...normalizedIdentity,
    digest: createHash('sha256')
      .update(`${deploymentId}\n${normalizedIdentity.deploymentUrl}\n${sourceCommit}\n`, 'utf8')
      .digest('hex')
  };
};

const readProtectedDeploymentProviderIdentity = (deploymentId) => {
  try {
    const vercelWrapper = process.platform === 'win32'
      ? execFileSync('where.exe', ['vercel.cmd'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true
        }).split(/\r?\n/u).find(Boolean)
      : 'vercel';
    if (!vercelWrapper) {
      throw new Error('vercel_cli_missing');
    }
    const vercelCommand = process.platform === 'win32' ? process.execPath : vercelWrapper;
    const vercelArgs = process.platform === 'win32'
      ? [resolve(vercelWrapper, '..', 'node_modules', 'vercel', 'dist', 'vc.js')]
      : [];
    return JSON.parse(execFileSync(
      vercelCommand,
      [...vercelArgs, 'api', `/v13/deployments/${deploymentId}`, '--scope', EXPECTED_VERCEL_SCOPE],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      }
    ));
  } catch {
    throw new Error('protected_deployment_provider_readback_failed');
  }
};

export const resolveAuthPersistenceExecutionPlan = (options = {}) => {
  const useExistingServer = options.useExistingServer === true;
  if (useExistingServer && typeof options.baseUrl !== 'string') {
    throw new Error('existing_server_base_url_required');
  }
  const baseUrl = normalizeAuthPersistenceBaseUrl(
    useExistingServer ? options.baseUrl : (options.baseUrl ?? 'http://127.0.0.1:4173')
  );
  const protectedDeployment = options.protectedDeployment === true;
  if (protectedDeployment && !useExistingServer) {
    throw new Error('protected_deployment_requires_existing_server');
  }
  if (protectedDeployment && new URL(baseUrl).protocol !== 'https:') {
    throw new Error('protected_deployment_https_required');
  }
  if (protectedDeployment && new URL(baseUrl).hostname === PUBLIC_PRODUCTION_HOST) {
    throw new Error('public_alias_protection_bypass_forbidden');
  }
  let deploymentIdentity = null;
  if (protectedDeployment) {
    const locallyValidatedIdentity = validateProtectedDeploymentClaims({
      baseUrl,
      deploymentId: options.deploymentId,
      deploymentUrl: options.deploymentUrl,
      sourceCommit: options.sourceCommit
    });
    deploymentIdentity = resolveProtectedDeploymentIdentity({
      baseUrl,
      ...locallyValidatedIdentity,
      providerDeployment: process.env.NODE_ENV === 'test' && options.providerDeploymentIdentity
        ? options.providerDeploymentIdentity
        : readProtectedDeploymentProviderIdentity(locallyValidatedIdentity.deploymentId)
    });
  }
  return {
    baseUrl,
    ...(deploymentIdentity === null ? {} : { deploymentIdentity }),
    launchPreview: !useExistingServer,
    protectedDeployment,
    runBuild: !useExistingServer && options.skipBuild !== true,
    // Context routing cannot intercept requests handled by a service worker.
    // Keep the guarded browser uncontrolled, then verify both worker assets
    // separately through read-only request-context GETs.
    serviceWorkers: 'block',
    useExistingServer
  };
};

export const buildVercelProtectionBypassSeedUrl = ({ baseUrl, protectionBypass }) => {
  if (typeof protectionBypass !== 'string' || protectionBypass.length === 0) {
    throw new Error('protection_bypass_missing');
  }
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:') {
    throw new Error('protected_deployment_https_required');
  }
  if (url.hostname === PUBLIC_PRODUCTION_HOST || !PROTECTED_DEPLOYMENT_HOST_PATTERN.test(url.hostname)) {
    throw new Error('protection_bypass_target_forbidden');
  }
  url.searchParams.set('x-vercel-protection-bypass', protectionBypass);
  url.searchParams.set('x-vercel-set-bypass-cookie', 'true');
  return url.toString();
};

export const seedVercelProtectionBypassCookie = async ({ context, baseUrl, protectionBypass }) => {
  const seedUrl = buildVercelProtectionBypassSeedUrl({ baseUrl, protectionBypass });
  let status;
  try {
    const response = await context.request.get(seedUrl, {
      failOnStatusCode: false,
      timeout: TIMEOUT_MS
    });
    status = response.status();
    await response.dispose();
  } catch {
    throw new Error('protection_bypass_cookie_seed_request_failed');
  }
  const cookies = await context.cookies(baseUrl);
  if (status !== 200 || cookies.length === 0) {
    throw new Error('protection_bypass_cookie_seed_failed');
  }
  return { cookieSeeded: true, status };
};

export const verifyReadOnlyServiceWorkerAssets = async ({ context, baseUrl }) => {
  const assets = [];
  for (const pathname of READ_ONLY_SERVICE_WORKER_ASSETS) {
    const url = new URL(pathname, baseUrl).toString();
    const response = await context.request.get(url, {
      failOnStatusCode: false,
      timeout: TIMEOUT_MS
    });
    try {
      const status = response.status();
      const body = await response.body();
      const contentType = String(response.headers()['content-type'] ?? '').toLocaleLowerCase('en-US');
      const responseUrl = new URL(response.url());
      const requestedUrl = new URL(url);
      const bodyText = body.toString('utf8');
      const markers = SERVICE_WORKER_ASSET_MARKERS[pathname];
      if (status !== 200
        || body.byteLength === 0
        || responseUrl.toString() !== requestedUrl.toString()
        || !/(?:java|ecma)script/iu.test(contentType)
        || !markers.every((marker) => bodyText.includes(marker))) {
        throw new Error('service_worker_asset_read_only_verification_failed');
      }
      assets.push({
        bytes: body.byteLength,
        contentType,
        pathname,
        responseUrl: responseUrl.toString(),
        sha256: createHash('sha256').update(body).digest('hex'),
        status
      });
    } finally {
      await response.dispose();
    }
  }
  return assets;
};

export const assertAuthPersistenceNavigationOrigin = ({ actualUrl, baseUrl }) => {
  let actual;
  let expected;
  try {
    actual = new URL(actualUrl);
    expected = new URL(baseUrl);
  } catch {
    throw new Error('auth_persistence_navigation_origin_invalid');
  }
  if (actual.origin !== expected.origin) {
    throw new Error('auth_persistence_navigation_origin_mismatch');
  }
  return sanitizeAuthPersistenceDiagnosticUrl(actual.toString());
};

export const assertAuthPersistenceClosedBrowserBoundary = ({
  baseUrl,
  blockedMutationRequests,
  finalUrl,
  navigationHistory
}) => {
  if (blockedMutationRequests.length > 0) {
    throw new Error(`external_mutation_attempt_blocked:${JSON.stringify(blockedMutationRequests)}`);
  }
  for (const navigation of navigationHistory) {
    assertAuthPersistenceNavigationOrigin({ actualUrl: navigation.url, baseUrl });
  }
  assertAuthPersistenceNavigationOrigin({ actualUrl: finalUrl, baseUrl });
  return {
    finalUrl: sanitizeAuthPersistenceDiagnosticUrl(finalUrl),
    navigationCount: navigationHistory.length
  };
};

const normalizeControlLabel = (value) => String(value).trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
const normalizedLabelsMatchExactly = (actual, expected) => {
  const actualLabels = actual.map(normalizeControlLabel).sort();
  const expectedLabels = expected.map(normalizeControlLabel).sort();
  return actualLabels.length === expectedLabels.length
    && actualLabels.every((label, index) => label === expectedLabels[index]);
};

export const resolveTrailShineUiState = (visual) => {
  const trailShineButton = (visual?.buttons ?? []).find(
    (button) => normalizeControlLabel(button?.text) === 'trail shine'
  );
  if (!trailShineButton?.bounds) {
    return null;
  }

  const labelsWithinButton = (visual?.textLabels ?? [])
    .filter((label) => {
      const centerX = label?.bounds?.centerX;
      const centerY = label?.bounds?.centerY;
      return Number.isFinite(centerX)
        && Number.isFinite(centerY)
        && centerX >= trailShineButton.bounds.left
        && centerX <= trailShineButton.bounds.right
        && centerY >= trailShineButton.bounds.top
        && centerY <= trailShineButton.bounds.bottom;
    })
    .map((label) => normalizeControlLabel(label.text));

  if (labelsWithinButton.some((label) => label === 'on' || label === 'trail shine: on')) {
    return true;
  }
  if (labelsWithinButton.some((label) => label === 'off' || label === 'trail shine: off')) {
    return false;
  }
  return null;
};

export const evaluateTrailShineChangedStatePersistence = ({
  initialRuntime,
  initialUi,
  changedRuntime,
  changedUi,
  reloadedRuntime,
  reloadedUi
}) => {
  const expectedChanged = typeof initialRuntime === 'boolean' ? !initialRuntime : null;
  return {
    pass: expectedChanged !== null
      && initialUi === initialRuntime
      && changedRuntime === expectedChanged
      && changedUi === expectedChanged
      && reloadedRuntime === expectedChanged
      && reloadedUi === expectedChanged,
    initial: { runtime: initialRuntime, ui: initialUi },
    expectedChanged,
    changed: { runtime: changedRuntime, ui: changedUi },
    reloaded: { runtime: reloadedRuntime, ui: reloadedUi }
  };
};

const readTrailShineFromStoredSettings = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return typeof parsed?.toggleTrailPulse === 'boolean' ? parsed.toggleTrailPulse : null;
  } catch {
    return null;
  }
};

export const evaluateFixtureSettingsIsolation = ({
  preimage,
  changed,
  reloaded,
  expectedTrailShine
}) => {
  const expectedKeyChanged = changed.authenticated !== preimage.authenticated;
  const expectedKeyPersisted = reloaded.authenticated === changed.authenticated;
  const changedValueMatches = readTrailShineFromStoredSettings(changed.authenticated) === expectedTrailShine;
  const reloadedValueMatches = readTrailShineFromStoredSettings(reloaded.authenticated) === expectedTrailShine;
  const guestByteIdentical = changed.guest === preimage.guest && reloaded.guest === preimage.guest;
  const unscopedByteIdentical = changed.unscoped === preimage.unscoped
    && reloaded.unscoped === preimage.unscoped;
  return {
    pass: expectedKeyChanged
      && expectedKeyPersisted
      && changedValueMatches
      && reloadedValueMatches
      && guestByteIdentical
      && unscopedByteIdentical,
    expectedKeyChanged,
    expectedKeyPersisted,
    changedValueMatches,
    reloadedValueMatches,
    guestByteIdentical,
    unscopedByteIdentical
  };
};

export const evaluateFixtureSettingsCleanup = ({ preimage, postimage }) => {
  const authenticatedByteIdentical = postimage.authenticated === preimage.authenticated;
  const guestByteIdentical = postimage.guest === preimage.guest;
  const unscopedByteIdentical = postimage.unscoped === preimage.unscoped;
  return {
    pass: authenticatedByteIdentical && guestByteIdentical && unscopedByteIdentical,
    authenticatedByteIdentical,
    guestByteIdentical,
    unscopedByteIdentical
  };
};

export const createFixtureSettingsRestorePlan = (preimage) => (
  typeof preimage?.authenticated === 'string'
    ? { action: 'set', key: AUTHENTICATED_FIXTURE_SETTINGS_STORAGE_KEY, value: preimage.authenticated }
    : { action: 'remove', key: AUTHENTICATED_FIXTURE_SETTINGS_STORAGE_KEY, value: null }
);

export const requireFixtureSettingsCleanupPage = ({ page, preimage }) => {
  if (preimage === null) {
    return false;
  }
  if (page === null || page.isClosed()) {
    throw new Error('fixture_settings_cleanup_page_unavailable');
  }
  return true;
};

export const measureAuthPersistenceElapsedMs = (
  runStartedAt,
  capturedAt = performance.now()
) => Math.max(0, Math.round(capturedAt - runStartedAt));

export const publishAuthPersistenceSuccessAfterCleanup = async ({
  cleanupErrors,
  writeSummary,
  promoteLatest
}) => {
  if (cleanupErrors.length > 0) {
    return { published: false, promoted: false };
  }
  await writeSummary();
  await promoteLatest();
  return { published: true, promoted: true };
};

export const surfaceMatchesAuthPersistenceExpectation = (surface, expected) => (
  (expected.authenticated === undefined || (surface?.authStatus === 'authenticated') === expected.authenticated)
  && surface?.mode === expected.mode
  && surface?.overlay === expected.overlay
  && expected.buttons.every((label) => surface?.buttons?.includes(label))
  && (expected.exactButtons !== true || normalizedLabelsMatchExactly(surface?.buttons ?? [], expected.buttons))
  && (expected.forbiddenButtons ?? []).every((label) => !surface?.buttons?.includes(label))
);

export const sanitizeAuthPersistenceDiagnosticUrl = (rawUrl) => {
  try {
    const url = new URL(rawUrl);
    const queryKeys = [...new Set([...url.searchParams.keys()])].sort();
    const redactedQuery = queryKeys.length > 0
      ? `?${queryKeys.map((key) => `${encodeURIComponent(key)}=<redacted>`).join('&')}`
      : '';
    return `${url.origin}${url.pathname}${redactedQuery}`;
  } catch {
    return String(rawUrl).replace(/[?#].*$/u, '');
  }
};

export const sanitizeAuthPersistenceDiagnosticText = (value) => String(value)
  .replace(/\bBearer\s+[A-Z0-9._~+/=-]+/giu, 'Bearer <redacted>')
  .replace(/\beyJ[A-Z0-9_-]+\.[A-Z0-9_-]+\.[A-Z0-9_-]+\b/giu, '<redacted-jwt>')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '<redacted-email>')
  .replace(/((?:x-vercel-protection-bypass|x-vercel-set-bypass-cookie)=)[^\s&]+/giu, '$1<redacted>')
  .replace(/((?:token|code|password|secret|key)=)[^\s&]+/giu, '$1<redacted>');

export const settleAuthPersistenceResources = async (actions) => {
  const errors = [];
  for (const action of actions) {
    if (typeof action?.run !== 'function') {
      continue;
    }
    try {
      await action.run();
    } catch (error) {
      errors.push(`${action.name}:${sanitizeAuthPersistenceDiagnosticText(
        error instanceof Error ? error.message : String(error)
      )}`);
    }
  }
  return errors;
};

const SAFE_ARTIFACT_LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export const resolveAuthPersistenceArtifactPath = (outputDir, label, suffix) => {
  if (!SAFE_ARTIFACT_LABEL.test(label)) {
    throw new Error('unsafe_artifact_label');
  }
  const root = resolve(outputDir);
  const artifactPath = resolve(root, `${label}${suffix}`);
  const relativePath = relative(root, artifactPath);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error('artifact_path_escape');
  }
  return artifactPath;
};

export const isExternalMutationRequest = (
  { method, url },
  allowedOrigin,
  { allowSameOriginMutations = true } = {}
) => {
  const normalizedMethod = String(method).toUpperCase();
  if (normalizedMethod === 'GET' || normalizedMethod === 'HEAD' || normalizedMethod === 'OPTIONS') {
    return false;
  }
  if (!allowSameOriginMutations) {
    return true;
  }
  try {
    return new URL(url).origin !== new URL(allowedOrigin).origin;
  } catch {
    return true;
  }
};

export const createGuardedAuthPersistenceContext = async ({
  browser,
  executionPlan,
  resolvedBaseUrl,
  blockedMutationRequests
}) => {
  const context = await browser.newContext({
    deviceScaleFactor: MOBILE_DPR,
    hasTouch: true,
    isMobile: true,
    serviceWorkers: executionPlan.serviceWorkers,
    viewport: MOBILE_VIEWPORT
  });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const requestSummary = {
      method: request.method(),
      resourceType: request.resourceType(),
      url: sanitizeAuthPersistenceDiagnosticUrl(request.url())
    };
    if (isExternalMutationRequest(requestSummary, resolvedBaseUrl, {
      allowSameOriginMutations: executionPlan.launchPreview
    })) {
      blockedMutationRequests.push(requestSummary);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  return context;
};

export const persistAuthPersistenceFailureEvidence = async ({
  outputDir,
  label,
  evidence,
  screenshot
}) => {
  const screenshotPath = resolveAuthPersistenceArtifactPath(outputDir, label, '.failure.png');
  let screenshotError = null;
  try {
    await screenshot(screenshotPath);
  } catch (error) {
    screenshotError = sanitizeAuthPersistenceDiagnosticText(error instanceof Error ? error.message : String(error));
  }

  const evidencePath = resolveAuthPersistenceArtifactPath(outputDir, label, '.failure.json');
  await writeFile(evidencePath, `${JSON.stringify({
    schema: 'mazer.live-auth-persistence-failure.v1',
    ...evidence,
    artifacts: {
      evidencePath,
      screenshotPath: screenshotError === null ? screenshotPath : null,
      screenshotError
    }
  }, null, 2)}\n`, 'utf8');
  return { evidencePath, screenshotPath: screenshotError === null ? screenshotPath : null, screenshotError };
};

const runBuild = () => {
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm run build'], { cwd: REPO_ROOT, stdio: 'inherit' });
    return;
  }
  execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' });
};

const readJsonAttribute = async (page, attribute) => page.evaluate((name) => {
  const raw = document.documentElement.getAttribute(name);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}, attribute);

const readDiagnostics = async (page) => ({
  runtime: await readJsonAttribute(page, RUNTIME_DIAGNOSTICS_ATTRIBUTE),
  visual: await readJsonAttribute(page, VISUAL_DIAGNOSTICS_ATTRIBUTE)
});

const readFixtureSettingsStorageSnapshot = async (page) => page.evaluate((keys) => ({
  authenticated: window.localStorage.getItem(keys.authenticated),
  guest: window.localStorage.getItem(keys.guest),
  unscoped: window.localStorage.getItem(keys.unscoped)
}), FIXTURE_SETTINGS_STORAGE_KEYS);

export const summarizeAuthPersistenceSurface = ({ runtime, visual }) => ({
  authStatus: runtime?.auth?.status ?? null,
  buttons: (visual?.buttons ?? []).map((button) => button.text),
  mode: visual?.runtime?.mode ?? null,
  overlay: visual?.runtime?.overlay ?? null,
  trailShineEnabled: runtime?.gameToggles?.trailPulse?.enabled ?? null,
  trailShineUiEnabled: resolveTrailShineUiState(visual),
  userIdPresent: runtime?.auth?.userIdPresent === true
});

const waitForSurface = async (page, expected) => {
  try {
    await page.waitForFunction(({ runtimeAttribute, visualAttribute, expectedSurface }) => {
      const runtimeRaw = document.documentElement.getAttribute(runtimeAttribute);
      const visualRaw = document.documentElement.getAttribute(visualAttribute);
      if (!runtimeRaw || !visualRaw) {
        return false;
      }
      try {
        const runtime = JSON.parse(runtimeRaw);
        const visual = JSON.parse(visualRaw);
        const normalize = (value) => String(value).trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
        const labels = (visual?.buttons ?? []).map((button) => normalize(button.text));
        const labelSet = new Set(labels);
        const expectedLabels = expectedSurface.buttons.map(normalize);
        const sortedLabels = [...labels].sort();
        const sortedExpectedLabels = [...expectedLabels].sort();
        return (expectedSurface.authenticated === undefined || (runtime?.auth?.status === 'authenticated') === expectedSurface.authenticated)
          && visual?.runtime?.mode === expectedSurface.mode
          && visual?.runtime?.overlay === expectedSurface.overlay
          && expectedLabels.every((label) => labelSet.has(label))
          && (expectedSurface.exactButtons !== true
            || (labels.length === expectedLabels.length
              && sortedLabels.every((label, index) => label === sortedExpectedLabels[index])))
          && (expectedSurface.forbiddenButtons ?? []).map(normalize).every((label) => !labelSet.has(label));
      } catch {
        return false;
      }
    }, {
      runtimeAttribute: RUNTIME_DIAGNOSTICS_ATTRIBUTE,
      visualAttribute: VISUAL_DIAGNOSTICS_ATTRIBUTE,
      expectedSurface: expected
    }, { timeout: TIMEOUT_MS });
  } catch (error) {
    const observed = summarizeAuthPersistenceSurface(await readDiagnostics(page));
    throw new Error(`surface_timeout:${JSON.stringify({ expected, observed })}`, { cause: error });
  }
  return summarizeAuthPersistenceSurface(await readDiagnostics(page));
};

const waitForTrailShineState = async (page, enabled, expectedSurface) => {
  const deadline = Date.now() + TIMEOUT_MS;
  let observed = null;
  while (Date.now() < deadline) {
    observed = summarizeAuthPersistenceSurface(await readDiagnostics(page));
    if (
      surfaceMatchesAuthPersistenceExpectation(observed, expectedSurface)
      && observed.trailShineEnabled === enabled
      && observed.trailShineUiEnabled === enabled
    ) {
      return observed;
    }
    await page.waitForTimeout(25);
  }
  throw new Error(`trail_shine_state_timeout:${JSON.stringify({ enabled, expectedSurface, observed })}`);
};

const captureFailureState = async ({
  page,
  runStartedAt,
  currentPhase,
  phaseTimings,
  terminalError,
  consoleMessages,
  pageErrors,
  failedRequests,
  pendingRequests,
  navigationHistory
}) => {
  const elapsedMs = measureAuthPersistenceElapsedMs(runStartedAt);
  if (page.isClosed()) {
    return {
      capturedAt: new Date().toISOString(),
      currentPhase,
      elapsedMs,
      phaseTimings,
      navigationHistory,
      error: sanitizeAuthPersistenceDiagnosticText(terminalError?.message ?? terminalError ?? 'unknown_failure'),
      url: null,
      title: null,
      document: null,
      controls: [],
      canvas: null,
      surface: null,
      failedRequests,
      pendingRequests: [...pendingRequests.values()],
      consoleMessages: consoleMessages.map(sanitizeAuthPersistenceDiagnosticText),
      pageErrors: pageErrors.map(sanitizeAuthPersistenceDiagnosticText),
      serviceWorker: null,
      captureState: 'page_closed'
    };
  }

  let pageState = null;
  let captureError = null;
  try {
    pageState = await page.evaluate(async ({ runtimeAttribute, visualAttribute }) => {
      const runtimeRaw = document.documentElement.getAttribute(runtimeAttribute);
      const visualRaw = document.documentElement.getAttribute(visualAttribute);
      const parse = (raw) => {
        try {
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      };
      const runtime = parse(runtimeRaw);
      const visual = parse(visualRaw);
      const canvas = document.querySelector('canvas');
      const canvasRect = canvas?.getBoundingClientRect();
      const controls = [...document.querySelectorAll('button, input, a, [role="button"]')].map((node) => ({
        tag: node.tagName.toLowerCase(),
        type: node.getAttribute('type'),
        name: node.getAttribute('name'),
        placeholder: node.getAttribute('placeholder'),
        text: node instanceof HTMLInputElement ? null : node.textContent?.trim().slice(0, 120) ?? null,
        ariaLabel: node.getAttribute('aria-label'),
        disabled: node.hasAttribute('disabled'),
        visible: Boolean(node.getClientRects().length)
      }));
      const registrations = 'serviceWorker' in navigator
        ? await navigator.serviceWorker.getRegistrations()
        : [];
      const cacheNames = 'caches' in globalThis ? await caches.keys() : [];
      return {
        document: {
          readyState: document.readyState,
          visibilityState: document.visibilityState
        },
        controls,
        canvas: canvas ? {
          width: canvas.width,
          height: canvas.height,
          clientWidth: canvasRect?.width ?? null,
          clientHeight: canvasRect?.height ?? null,
          visible: Boolean(canvas.getClientRects().length)
        } : null,
        surface: {
          authStatus: runtime?.auth?.status ?? null,
          userIdPresent: runtime?.auth?.userIdPresent === true,
          mode: visual?.runtime?.mode ?? null,
          overlay: visual?.runtime?.overlay ?? null,
          buttons: (visual?.buttons ?? []).map((button) => button.text)
        },
        serviceWorker: {
          controlled: Boolean(navigator.serviceWorker?.controller),
          controllerScriptUrl: navigator.serviceWorker?.controller?.scriptURL ?? null,
          registrationScopes: registrations.map((registration) => registration.scope),
          cacheNames
        }
      };
    }, {
      runtimeAttribute: RUNTIME_DIAGNOSTICS_ATTRIBUTE,
      visualAttribute: VISUAL_DIAGNOSTICS_ATTRIBUTE
    });
  } catch (error) {
    captureError = sanitizeAuthPersistenceDiagnosticText(error instanceof Error ? error.message : String(error));
  }

  return {
    capturedAt: new Date().toISOString(),
    currentPhase,
    elapsedMs,
    phaseTimings,
    navigationHistory,
    error: sanitizeAuthPersistenceDiagnosticText(terminalError?.message ?? terminalError ?? 'unknown_failure'),
    url: sanitizeAuthPersistenceDiagnosticUrl(page.url()),
    title: await page.title().catch(() => null),
    document: pageState?.document ?? null,
    controls: pageState?.controls ?? [],
    canvas: pageState?.canvas ?? null,
    surface: pageState?.surface ?? null,
    failedRequests,
    pendingRequests: [...pendingRequests.values()],
    consoleMessages: consoleMessages.map(sanitizeAuthPersistenceDiagnosticText),
    pageErrors: pageErrors.map(sanitizeAuthPersistenceDiagnosticText),
    serviceWorker: pageState?.serviceWorker ? {
      ...pageState.serviceWorker,
      controllerScriptUrl: pageState.serviceWorker.controllerScriptUrl
        ? sanitizeAuthPersistenceDiagnosticUrl(pageState.serviceWorker.controllerScriptUrl)
        : null,
      registrationScopes: pageState.serviceWorker.registrationScopes.map(sanitizeAuthPersistenceDiagnosticUrl)
    } : null,
    captureState: captureError === null ? 'captured' : 'partial',
    captureError
  };
};

const findVisualButtonCenter = (visual, text) => {
  const button = (visual?.buttons ?? []).find((candidate) => candidate?.text === text);
  const bounds = button?.bounds;
  if (!bounds || !Number.isFinite(bounds.left) || !Number.isFinite(bounds.top)) {
    throw new Error(`button_not_found:${text}`);
  }
  return { x: bounds.left + (bounds.width / 2), y: bounds.top + (bounds.height / 2) };
};

const openOptionsViaQa = async (page) => {
  await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.openOptionsOverlay), {}, { timeout: TIMEOUT_MS });
  const result = await page.evaluate(() => window.__MAZER_QA__?.openOptionsOverlay?.() ?? null);
  if (result?.accepted !== true) {
    throw new Error('options_fixture_action_rejected');
  }
};

const startPlayViaQa = async (page) => {
  await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.startPlayMode), {}, { timeout: TIMEOUT_MS });
  const result = await page.evaluate(() => window.__MAZER_QA__?.startPlayMode?.() ?? null);
  if (result?.accepted !== true) {
    throw new Error(`play_fixture_action_rejected:${result?.reason ?? 'unknown'}`);
  }
};

const openPauseViaQa = async (page) => {
  await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.openPauseOverlay), {}, { timeout: TIMEOUT_MS });
  const result = await page.evaluate(() => window.__MAZER_QA__?.openPauseOverlay?.() ?? null);
  if (result?.accepted !== true) {
    throw new Error(`pause_fixture_action_rejected:${result?.reason ?? 'unknown'}`);
  }
};

export const buildAuthPersistenceRoute = (authenticated) => (
  `/?content=core-only&theme=aurora&runtimeDiagnostics=1${authenticated ? '&authFixture=authenticated' : ''}&v=auth-persistence-soak`
);

export const summarizeAuthPersistenceSoak = (
  steps,
  consoleMessages,
  pageErrors,
  { serviceWorkersBlocked = false } = {}
) => {
  const required = [
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
  ];
  const missingSteps = required.filter((id) => !steps.some((step) => step.id === id && step.pass));
  // Phaser may emit this teardown diagnostic while a page is navigating away.
  const actionableConsoleMessages = consoleMessages.filter(
    (message) => !message.startsWith('WebGL: CONTEXT_LOST_WEBGL:')
      && !(serviceWorkersBlocked && message === 'Service Worker registration blocked by Playwright')
  );
  return {
    pass: missingSteps.length === 0 && actionableConsoleMessages.length === 0 && pageErrors.length === 0,
    missingSteps,
    stepCount: steps.length,
    steps,
    actionableConsoleMessages
  };
};

export const runLiveAuthPersistenceSoak = async (options = {}) => {
  const runStartedAt = performance.now();
  const artifactRoot = resolve(options.artifactRoot ?? DEFAULT_ARTIFACT_ROOT);
  const sessionId = resolveSessionId(options.sessionId);
  const outputDir = resolve(artifactRoot, sessionId);
  const label = options.label ?? 'auth-persistence-soak';
  const summaryPath = resolveAuthPersistenceArtifactPath(outputDir, label, '.summary.json');
  const cleanupFailureEvidencePath = resolveAuthPersistenceArtifactPath(outputDir, label, '.cleanup-failure.json');
  const latestSummaryPath = resolve(artifactRoot, 'latest.summary.json');
  await ensureDir(outputDir);
  const executionPlan = resolveAuthPersistenceExecutionPlan(options);

  if (executionPlan.runBuild) {
    runBuild();
  }

  let preview = null;
  let browser = null;
  let context = null;
  let page = null;
  let resolvedBaseUrl = null;
  let finalBrowserUrl = null;
  let closedBrowserBoundary = null;
  const consoleMessages = [];
  const pageErrors = [];
  const failedRequests = [];
  const pendingRequests = new Map();
  const blockedMutationRequests = [];
  const navigationHistory = [];
  let navigationTracker = null;
  const steps = [];
  const screenshots = {};
  const phaseTimings = [];
  let currentPhase = 'initialization';
  let pendingSummary = null;
  let terminalError = null;
  let fixtureSettingsPreimage = null;
  let fixtureSettingsTouched = false;
  let cleanupErrors = [];
  let fixtureSettingsCleanup = {
    attempted: false,
    fixtureOnly: true,
    restored: false,
    storageScope: 'authenticated-diagnostics-fixture/game-toggles'
  };
  const cleanupEvidencePath = resolveAuthPersistenceArtifactPath(outputDir, label, '.fixture-cleanup.json');
  const enterPhase = (phase) => {
    currentPhase = phase;
    phaseTimings.push({ phase, elapsedMs: measureAuthPersistenceElapsedMs(runStartedAt) });
  };
  const persistCurrentFailureEvidence = async (failedPhase) => {
    enterPhase('failure-evidence');
    const pageAvailable = page !== null && !page.isClosed();
    const evidence = pageAvailable
      ? await captureFailureState({
        page,
        runStartedAt,
        currentPhase: failedPhase,
        phaseTimings,
        terminalError,
        consoleMessages,
        pageErrors,
        failedRequests,
        pendingRequests,
        navigationHistory
      })
      : {
        capturedAt: new Date().toISOString(),
        currentPhase: failedPhase,
        elapsedMs: measureAuthPersistenceElapsedMs(runStartedAt),
        phaseTimings,
        error: sanitizeAuthPersistenceDiagnosticText(
          terminalError instanceof Error ? terminalError.message : terminalError ?? 'unknown_failure'
        ),
        url: null,
        title: null,
        document: null,
        controls: [],
        canvas: null,
        surface: null,
        failedRequests,
        pendingRequests: [...pendingRequests.values()],
        consoleMessages: consoleMessages.map(sanitizeAuthPersistenceDiagnosticText),
        pageErrors: pageErrors.map(sanitizeAuthPersistenceDiagnosticText),
        navigationHistory,
        serviceWorker: null,
        captureState: 'page_unavailable'
      };
    await persistAuthPersistenceFailureEvidence({
      outputDir,
      label,
      evidence,
      screenshot: pageAvailable
        ? (path) => page.screenshot({ path, fullPage: true })
        : async () => { throw new Error('page_unavailable'); }
    });
  };

  try {
    preview = executionPlan.launchPreview
      ? await launchPreviewServer({ previewTimeoutMs: options.previewTimeoutMs })
      : null;
    resolvedBaseUrl = preview?.baseUrl ?? executionPlan.baseUrl;
    browser = await chromium.launch({ headless: options.headless !== false });
    context = await createGuardedAuthPersistenceContext({
      browser,
      executionPlan,
      resolvedBaseUrl,
      blockedMutationRequests
    });
    page = await context.newPage();
    await installLivePlayQaServiceWorkerStabilizationProbe(page);
    navigationTracker = createLivePlayQaNavigationTracker();
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        navigationTracker.record({ isMainFrame: true, url: frame.url() });
        navigationHistory.push({
          elapsedMs: measureAuthPersistenceElapsedMs(runStartedAt),
          url: sanitizeAuthPersistenceDiagnosticUrl(frame.url())
        });
      }
    });
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error') {
        consoleMessages.push(message.text());
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => pendingRequests.set(request, {
      method: request.method(),
      resourceType: request.resourceType(),
      url: sanitizeAuthPersistenceDiagnosticUrl(request.url())
    }));
    page.on('requestfinished', (request) => pendingRequests.delete(request));
    page.on('requestfailed', (request) => {
      failedRequests.push({
        ...pendingRequests.get(request),
        failure: sanitizeAuthPersistenceDiagnosticText(request.failure()?.errorText ?? 'unknown_request_failure')
      });
      pendingRequests.delete(request);
    });
    if (executionPlan.protectedDeployment) {
      enterPhase('protected-deployment-bypass-cookie');
      await seedVercelProtectionBypassCookie({
        context,
        baseUrl: resolvedBaseUrl,
        protectionBypass: options.protectionBypass
      });
      enterPhase('read-only-service-worker-assets');
      steps.push({
        id: 'read-only-service-worker-assets',
        pass: true,
        assets: await verifyReadOnlyServiceWorkerAssets({
          context,
          baseUrl: resolvedBaseUrl
        })
      });
    }
    enterPhase('signed-out-shared-account-entry');
    const signedOutRoute = new URL(buildAuthPersistenceRoute(false), resolvedBaseUrl).toString();
    const initialNavigationCount = navigationTracker.snapshot().mainFrameNavigationCount;
    await page.goto(signedOutRoute, { waitUntil: 'load', timeout: TIMEOUT_MS });
    await settleLivePlayQaServiceWorkerNavigation({
      initialNavigationCount,
      page,
      serviceWorkerAvailable: executionPlan.serviceWorkers === 'allow',
      targetUrl: signedOutRoute,
      timeoutMs: TIMEOUT_MS,
      tracker: navigationTracker
    });
    assertAuthPersistenceNavigationOrigin({ actualUrl: page.url(), baseUrl: resolvedBaseUrl });
    const signedOutAccountEntry = await waitForSurface(page, {
      authenticated: false,
      buttons: SIGNED_OUT_SHARED_ACCOUNT_BUTTONS,
      exactButtons: true,
      forbiddenButtons: RETIRED_LOCAL_AUTH_CONTROLS,
      mode: 'menu',
      overlay: 'none'
    });
    steps.push({
      id: 'signed-out-shared-account-entry',
      pass: surfaceMatchesAuthPersistenceExpectation(signedOutAccountEntry, {
        authenticated: false,
        buttons: SIGNED_OUT_SHARED_ACCOUNT_BUTTONS,
        exactButtons: true,
        forbiddenButtons: RETIRED_LOCAL_AUTH_CONTROLS,
        mode: 'menu',
        overlay: 'none'
      }),
      surface: signedOutAccountEntry
    });

    // Do not click the external OAuth controls in this fixture-only soak. The
    // exact destination and PKCE contract are covered by source-level tests;
    // authenticated gameplay below uses only the maintained diagnostics lane.
    enterPhase('signed-out-shared-account-contract');
    steps.push({
      id: 'signed-out-shared-account-contract',
      pass: signedOutAccountEntry.mode === 'menu'
        && signedOutAccountEntry.overlay === 'none'
        && !signedOutAccountEntry.userIdPresent
        && RETIRED_LOCAL_AUTH_CONTROLS.every((label) => !signedOutAccountEntry.buttons.includes(label)),
      surface: signedOutAccountEntry
    });

    enterPhase('diagnostics-fixture-entry');
    await page.goto(new URL(buildAuthPersistenceRoute(true), resolvedBaseUrl).toString(), { waitUntil: 'networkidle', timeout: TIMEOUT_MS });
    assertAuthPersistenceNavigationOrigin({ actualUrl: page.url(), baseUrl: resolvedBaseUrl });
    const authenticatedEntry = await waitForSurface(page, {
      authenticated: true, buttons: ['Start', 'Settings'], mode: 'menu', overlay: 'none'
    });
    steps.push({
      id: 'diagnostics-fixture-entry',
      pass: authenticatedEntry.userIdPresent,
      surface: authenticatedEntry,
      fixtureOnly: true
    });
    fixtureSettingsPreimage = await readFixtureSettingsStorageSnapshot(page);

    enterPhase('diagnostics-fixture-options');
    await openOptionsViaQa(page);
    const optionsSurface = await waitForSurface(page, {
      authenticated: true, buttons: ['Trail Shine', 'Account'], mode: 'menu', overlay: 'options'
    });
    const initialTrailShine = optionsSurface.trailShineEnabled;
    if (typeof initialTrailShine !== 'boolean') {
      throw new Error('trail_shine_diagnostic_missing');
    }
    if (optionsSurface.trailShineUiEnabled !== initialTrailShine) {
      throw new Error('trail_shine_initial_ui_runtime_mismatch');
    }
    steps.push({
      id: 'diagnostics-fixture-options',
      pass: optionsSurface.userIdPresent
        && optionsSurface.trailShineEnabled === initialTrailShine
        && optionsSurface.trailShineUiEnabled === initialTrailShine,
      surface: optionsSurface,
      fixtureOnly: true
    });

    enterPhase('diagnostics-fixture-trail-shine-changed');
    const changedTrailShine = !initialTrailShine;
    const trailShinePoint = findVisualButtonCenter((await readDiagnostics(page)).visual, 'Trail Shine');
    fixtureSettingsTouched = true;
    await page.mouse.click(trailShinePoint.x, trailShinePoint.y);
    const changedOptionsSurface = await waitForTrailShineState(page, changedTrailShine, {
      authenticated: true, buttons: ['Trail Shine', 'Account'], mode: 'menu', overlay: 'options'
    });
    const changedSettingsSnapshot = await readFixtureSettingsStorageSnapshot(page);
    steps.push({
      id: 'diagnostics-fixture-trail-shine-changed',
      pass: changedOptionsSurface.userIdPresent
        && changedOptionsSurface.trailShineEnabled === changedTrailShine
        && changedOptionsSurface.trailShineUiEnabled === changedTrailShine,
      surface: changedOptionsSurface,
      fixtureOnly: true
    });

    enterPhase('authenticated-reload');
    await page.reload({ waitUntil: 'networkidle', timeout: TIMEOUT_MS });
    assertAuthPersistenceNavigationOrigin({ actualUrl: page.url(), baseUrl: resolvedBaseUrl });
    const authenticatedReload = await waitForSurface(page, {
      authenticated: true, buttons: ['Start', 'Settings'], mode: 'menu', overlay: 'none'
    });
    const reloadedSettingsSnapshot = await readFixtureSettingsStorageSnapshot(page);
    steps.push({
      id: 'authenticated-reload',
      pass: authenticatedReload.userIdPresent && authenticatedReload.trailShineEnabled === changedTrailShine,
      surface: authenticatedReload
    });

    await openOptionsViaQa(page);
    const authenticatedOptionsReload = await waitForTrailShineState(page, changedTrailShine, {
      authenticated: true, buttons: ['Trail Shine', 'Account'], mode: 'menu', overlay: 'options'
    });
    const changedStatePersistence = evaluateTrailShineChangedStatePersistence({
      initialRuntime: initialTrailShine,
      initialUi: optionsSurface.trailShineUiEnabled,
      changedRuntime: changedOptionsSurface.trailShineEnabled,
      changedUi: changedOptionsSurface.trailShineUiEnabled,
      reloadedRuntime: authenticatedOptionsReload.trailShineEnabled,
      reloadedUi: authenticatedOptionsReload.trailShineUiEnabled
    });
    const fixtureSettingsIsolation = evaluateFixtureSettingsIsolation({
      preimage: fixtureSettingsPreimage,
      changed: changedSettingsSnapshot,
      reloaded: reloadedSettingsSnapshot,
      expectedTrailShine: changedTrailShine
    });
    steps.push({
      id: 'authenticated-options-reload',
      pass: authenticatedOptionsReload.userIdPresent
        && changedStatePersistence.pass
        && fixtureSettingsIsolation.pass,
      surface: authenticatedOptionsReload,
      changedStatePersistence,
      fixtureSettingsIsolation,
      fixtureOnly: true
    });
    screenshots.authenticatedOptions = resolveAuthPersistenceArtifactPath(outputDir, label, '-authenticated-options.png');
    await page.screenshot({ path: screenshots.authenticatedOptions });
    await page.keyboard.press('Escape');
    await waitForSurface(page, {
      authenticated: true, buttons: ['Start', 'Settings'], mode: 'menu', overlay: 'none'
    });

    enterPhase('diagnostics-fixture-play');
    await startPlayViaQa(page);
    const diagnosticsFixturePlay = await waitForSurface(page, {
      authenticated: true, buttons: [], mode: 'play', overlay: 'none'
    });
    steps.push({
      id: 'diagnostics-fixture-play',
      pass: diagnosticsFixturePlay.userIdPresent
        && diagnosticsFixturePlay.mode === 'play'
        && diagnosticsFixturePlay.overlay === 'none',
      surface: diagnosticsFixturePlay,
      fixtureOnly: true
    });
    enterPhase('authenticated-pause-reentry');
    await openPauseViaQa(page);
    const authenticatedPauseReentry = await waitForSurface(page, {
      authenticated: true, buttons: ['Back', 'Guide', 'Trail Shine', 'Main Menu'], mode: 'play', overlay: 'pause'
    });
    steps.push({
      id: 'authenticated-pause-reentry',
      pass: authenticatedPauseReentry.userIdPresent
        && authenticatedPauseReentry.trailShineEnabled === changedTrailShine
        && authenticatedPauseReentry.trailShineUiEnabled === changedTrailShine,
      surface: authenticatedPauseReentry
    });
    screenshots.authenticatedPause = resolveAuthPersistenceArtifactPath(outputDir, label, '-authenticated-pause.png');
    await page.screenshot({ path: screenshots.authenticatedPause });

    enterPhase('diagnostics-fixture-account');
    await page.goto(new URL(buildAuthPersistenceRoute(true), resolvedBaseUrl).toString(), { waitUntil: 'networkidle', timeout: TIMEOUT_MS });
    assertAuthPersistenceNavigationOrigin({ actualUrl: page.url(), baseUrl: resolvedBaseUrl });
    await waitForSurface(page, {
      authenticated: true, buttons: ['Start', 'Settings'], mode: 'menu', overlay: 'none'
    });
    await openOptionsViaQa(page);
    const fixtureAccount = await waitForSurface(page, {
      authenticated: true, buttons: ['Account'], mode: 'menu', overlay: 'options'
    });
    steps.push({
      id: 'diagnostics-fixture-account',
      pass: fixtureAccount.userIdPresent
        && fixtureAccount.authStatus === 'authenticated'
        && fixtureAccount.buttons.includes('Account')
        && fixtureAccount.mode === 'menu'
        && fixtureAccount.overlay === 'options',
      surface: fixtureAccount,
      fixtureOnly: true,
      note: 'The authenticated Account control is present; the fixture intentionally does not follow the external shared-account portal navigation.'
    });

    enterPhase('fixture-reentry');
    await page.goto(new URL(buildAuthPersistenceRoute(true), resolvedBaseUrl).toString(), { waitUntil: 'networkidle', timeout: TIMEOUT_MS });
    assertAuthPersistenceNavigationOrigin({ actualUrl: page.url(), baseUrl: resolvedBaseUrl });
    const reentry = await waitForSurface(page, {
      authenticated: true, buttons: ['Start', 'Settings'], mode: 'menu', overlay: 'none'
    });
    steps.push({
      id: 'fixture-reentry',
      pass: reentry.userIdPresent && reentry.trailShineEnabled === changedTrailShine,
      surface: reentry,
      fixtureOnly: true
    });

    if (blockedMutationRequests.length > 0) {
      throw new Error(`external_mutation_attempt_blocked:${JSON.stringify(blockedMutationRequests)}`);
    }

    const screenshotPath = resolveAuthPersistenceArtifactPath(outputDir, label, '.png');
    await page.screenshot({ path: screenshotPath });
    screenshots.fixtureReentry = screenshotPath;
    const sanitizedConsoleMessages = consoleMessages.map(sanitizeAuthPersistenceDiagnosticText);
    const sanitizedPageErrors = pageErrors.map(sanitizeAuthPersistenceDiagnosticText);
    const result = summarizeAuthPersistenceSoak(steps, sanitizedConsoleMessages, sanitizedPageErrors, {
      serviceWorkersBlocked: executionPlan.serviceWorkers === 'block'
    });
    if (!result.pass) {
      throw new Error(`auth_persistence_soak_failed:${JSON.stringify({
        missingSteps: result.missingSteps,
        actionableConsoleMessages: result.actionableConsoleMessages,
        pageErrors: sanitizedPageErrors
      })}`);
    }
    pendingSummary = {
      schema: 'mazer.live-auth-persistence-soak.v1',
      label,
      generatedAt: new Date().toISOString(),
      fixtureOnly: true,
      note: 'This verifies the exact current signed-out shared-account entry surface and an opposite fixture-local Trail Shine value through the real Settings control, reload, gameplay, Pause, Account, and re-entry without credentials, external settings/session writes, or retired local-auth controls.',
      viewport: MOBILE_VIEWPORT,
      deviceScaleFactor: MOBILE_DPR,
      result,
      consoleMessages: sanitizedConsoleMessages,
      pageErrors: sanitizedPageErrors,
      blockedMutationRequests,
      transport: {
        deploymentIdentity: executionPlan.deploymentIdentity ?? null,
        existingServer: executionPlan.useExistingServer,
        protectedDeployment: executionPlan.protectedDeployment,
        serviceWorkers: executionPlan.serviceWorkers
      },
      fixtureSettings: {
        changedFromDefault: changedTrailShine !== initialTrailShine,
        storageIsolation: fixtureSettingsIsolation,
        cleanupEvidencePath,
        storageScope: fixtureSettingsCleanup.storageScope,
        cleanup: null
      },
      artifacts: { cleanupEvidencePath, screenshotPath, screenshots }
    };
  } catch (error) {
    terminalError = error;
  } finally {
    const failedPhase = currentPhase;
    if (terminalError !== null) {
      cleanupErrors.push(...await settleAuthPersistenceResources([
        {
          name: 'failure_evidence',
          run: () => persistCurrentFailureEvidence(failedPhase)
        }
      ]));
    }
    cleanupErrors.push(...await settleAuthPersistenceResources([
      {
        name: 'fixture_settings_restore',
        run: fixtureSettingsPreimage === null
          ? null
          : async () => {
            const restorePlan = createFixtureSettingsRestorePlan(fixtureSettingsPreimage);
            try {
              requireFixtureSettingsCleanupPage({ page, preimage: fixtureSettingsPreimage });
              if (fixtureSettingsTouched) {
                await page.evaluate((plan) => {
                  if (plan.action === 'set') {
                    window.localStorage.setItem(plan.key, plan.value);
                  } else {
                    window.localStorage.removeItem(plan.key);
                  }
                }, restorePlan);
              }
              const postimage = await readFixtureSettingsStorageSnapshot(page);
              const cleanupVerification = evaluateFixtureSettingsCleanup({
                preimage: fixtureSettingsPreimage,
                postimage
              });
              fixtureSettingsCleanup = {
                ...fixtureSettingsCleanup,
                attempted: fixtureSettingsTouched,
                action: fixtureSettingsTouched ? restorePlan.action : 'none',
                restored: cleanupVerification.pass,
                verification: cleanupVerification
              };
              if (!cleanupVerification.pass) {
                throw new Error('fixture_settings_complete_postimage_mismatch');
              }
            } catch (error) {
              fixtureSettingsCleanup = {
                ...fixtureSettingsCleanup,
                error: sanitizeAuthPersistenceDiagnosticText(
                  error instanceof Error ? error.message : String(error)
                ),
                restored: false
              };
              throw error;
            }
          }
      },
      {
        name: 'fixture_cleanup_evidence',
        run: fixtureSettingsPreimage === null
          ? null
          : () => writeFile(cleanupEvidencePath, `${JSON.stringify({
            schema: 'mazer.live-auth-persistence-fixture-cleanup.v1',
            ...fixtureSettingsCleanup
          }, null, 2)}\n`, 'utf8')
      },
      {
        name: 'final_browser_url_capture',
        run: page === null ? null : () => {
          finalBrowserUrl = page.url();
        }
      },
      {
        name: 'context_close',
        run: context === null ? null : () => context.close()
      },
      {
        name: 'closed_browser_boundary',
        run: resolvedBaseUrl === null || finalBrowserUrl === null
          ? null
          : () => {
            closedBrowserBoundary = assertAuthPersistenceClosedBrowserBoundary({
              baseUrl: resolvedBaseUrl,
              blockedMutationRequests,
              finalUrl: finalBrowserUrl,
              navigationHistory
            });
          }
      },
      {
        name: 'browser_close',
        run: browser === null ? null : () => browser.close()
      },
      {
        name: 'preview_stop',
        run: preview?.child ? () => stopPreviewServer(preview.child) : null
      }
    ]));
    if (cleanupErrors.length > 0) {
      const cleanupFailure = {
        schema: 'mazer.live-auth-persistence-cleanup-failure.v1',
        capturedAt: new Date().toISOString(),
        currentPhase: failedPhase,
        elapsedMs: measureAuthPersistenceElapsedMs(runStartedAt),
        cleanupErrors,
        fixtureSettingsCleanup
      };
      try {
        await writeFile(cleanupFailureEvidencePath, `${JSON.stringify(cleanupFailure, null, 2)}\n`, 'utf8');
      } catch (error) {
        cleanupErrors.push(`cleanup_failure_evidence:${sanitizeAuthPersistenceDiagnosticText(
          error instanceof Error ? error.message : String(error)
        )}`);
      }
      if (terminalError instanceof Error) {
        terminalError.cleanupErrors = cleanupErrors;
      } else {
        terminalError = new AggregateError(
          cleanupErrors.map((message) => new Error(message)),
          'auth_persistence_cleanup_failed'
        );
        cleanupErrors.push(...await settleAuthPersistenceResources([
          {
            name: 'failure_evidence',
            run: () => persistCurrentFailureEvidence(failedPhase)
          }
        ]));
      }
    }
  }

  if (terminalError !== null) {
    throw terminalError;
  }
  if (pendingSummary === null) {
    throw new Error('auth_persistence_summary_unavailable');
  }
  if (closedBrowserBoundary === null) {
    throw new Error('auth_persistence_closed_browser_boundary_unavailable');
  }

  pendingSummary.fixtureSettings.cleanup = fixtureSettingsCleanup;
  pendingSummary.transport.closedBrowserBoundary = closedBrowserBoundary;
  await publishAuthPersistenceSuccessAfterCleanup({
    cleanupErrors,
    writeSummary: () => writeFile(summaryPath, `${JSON.stringify(pendingSummary, null, 2)}\n`, 'utf8'),
    promoteLatest: () => copyFile(summaryPath, latestSummaryPath)
  });
  return { ...pendingSummary, summaryPath };
};

if (isDirectRun) {
  const args = parseCliArgs();
  const optionEnabled = (value) => value === true || value === 'true';
  const protectedDeployment = optionEnabled(args['protected-deployment']);
  runLiveAuthPersistenceSoak({
    artifactRoot: typeof args['output-root'] === 'string' ? args['output-root'] : DEFAULT_ARTIFACT_ROOT,
    baseUrl: typeof args['base-url'] === 'string' ? args['base-url'] : undefined,
    deploymentId: typeof args['deployment-id'] === 'string' ? args['deployment-id'] : undefined,
    deploymentUrl: typeof args['deployment-url'] === 'string' ? args['deployment-url'] : undefined,
    headless: args.headless !== 'false',
    label: typeof args.label === 'string' ? args.label : 'auth-persistence-soak',
    protectedDeployment,
    protectionBypass: protectedDeployment ? process.env.VERCEL_AUTOMATION_BYPASS_SECRET : undefined,
    sessionId: typeof args.session === 'string' ? args.session : undefined,
    skipBuild: optionEnabled(args['skip-build']),
    sourceCommit: typeof args['source-commit'] === 'string' ? args['source-commit'] : undefined,
    useExistingServer: optionEnabled(args['existing-server']) || optionEnabled(args['no-preview'])
  }).then((summary) => {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    process.exitCode = summary.result.pass ? 0 : 1;
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
