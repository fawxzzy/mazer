/**
 * Wave 3A: real browser integration evidence for UiLegacyBridge
 * (src/state/uiLegacyBridge.ts), run against an actual built/served
 * MenuScene -- not a fake-adapter unit test (see
 * tests/architecture/ui-legacy-bridge.test.ts for those).
 *
 * Proves, against the real running scene via the documented QA surface
 * (window.__MAZER_QA__, requires ?runtimeDiagnostics=1):
 * - the bridge is actually installed;
 * - a real UI action (dispatchUiCommand) increments dispatch diagnostics;
 * - the real scene actually changes mode (confirmed via the independent
 *   movePlayPlayer QA surface, not just the bridge's own idea of it);
 * - the projected snapshot and generated view model change accordingly;
 * - a real access-denied rejection propagates as ok:false, not a false
 *   success (mandatory correction 3 from the Wave 3A PR review);
 * - an unsupported command fails closed without a side effect;
 * - OPEN_MODAL confirm-reset-progress rejects an invalid live origin
 *   (mandatory correction 1's regression check, live).
 *
 * Usage: node scripts/analysis/verify-ui-bridge-integration.mjs
 * (builds and launches its own preview server unless --no-preview is
 * passed with an existing server already up on --base-url).
 */
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import {
  DEFAULT_BASE_URL,
  DEFAULT_PREVIEW_TIMEOUT_MS,
  REPO_ROOT,
  normalizeBaseUrl,
  parseCliArgs
} from '../visual/common.mjs';
import { launchPreviewServer, stopPreviewServer } from '../visual/preview-server.mjs';

const runBuild = () => {
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm run build'], { cwd: REPO_ROOT, stdio: 'inherit' });
    return;
  }
  execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' });
};

const results = [];
const check = (name, pass, detail) => { results.push({ name, pass, detail }); };

const runChecks = async (baseUrl) => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`${baseUrl}/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__MAZER_QA__?.getUiBridgeDiagnostics), { timeout: 15000 });

  const installed = await page.evaluate(() => window.__MAZER_QA__.getUiBridgeDiagnostics());
  check('bridge installed on boot', installed?.installed === true, JSON.stringify(installed));

  const beforeSnapshot = await page.evaluate(() => window.__MAZER_QA__.getUiStateSnapshot());
  check('initial snapshot is menu/home with the authenticated fixture', beforeSnapshot?.primarySurface === 'home', JSON.stringify(beforeSnapshot));

  // Real rejection propagates as ok:false rather than a false success
  // (mandatory correction 3), using a second page with no play access yet.
  const gatedPage = await browser.newPage();
  await gatedPage.goto(`${baseUrl}/?runtimeDiagnostics=1&mazeSeed=3749`, { waitUntil: 'load', timeout: 30000 });
  await gatedPage.waitForFunction(() => Boolean(window.__MAZER_QA__?.dispatchUiCommand), { timeout: 15000 });
  const gatedStart = await gatedPage.evaluate(() => window.__MAZER_QA__.dispatchUiCommand({ type: 'START_RUN' }));
  const gatedSnapshotAfter = await gatedPage.evaluate(() => window.__MAZER_QA__.getUiStateSnapshot());
  check(
    'START_RUN without play access is rejected, and the real scene did not silently start anyway',
    gatedStart?.ok === false && gatedSnapshotAfter?.primarySurface !== 'play',
    `dispatch=${JSON.stringify(gatedStart)} snapshotAfter=${JSON.stringify(gatedSnapshotAfter)}`
  );
  await gatedPage.close();

  const beforeDiagnostics = await page.evaluate(() => window.__MAZER_QA__.getUiBridgeDiagnostics());

  const dispatchResult = await page.evaluate(() => window.__MAZER_QA__.dispatchUiCommand({ type: 'START_RUN' }));
  const afterDiagnosticsImmediate = await page.evaluate(() => window.__MAZER_QA__.getUiBridgeDiagnostics());
  check('START_RUN command accepted', dispatchResult?.ok === true, JSON.stringify(dispatchResult));
  check(
    'dispatchCount incremented by a real UI action',
    afterDiagnosticsImmediate.dispatchCount === beforeDiagnostics.dispatchCount + 1,
    `before=${beforeDiagnostics.dispatchCount} after=${afterDiagnosticsImmediate.dispatchCount}`
  );
  check('lastCommandType reflects the real dispatched command', afterDiagnosticsImmediate.lastCommandType === 'START_RUN', afterDiagnosticsImmediate.lastCommandType);

  // A fresh maze genuinely takes real time to generate/render -- poll the
  // real scene's own lifecycle-lock signal rather than a fixed delay.
  let moveProbe = null;
  for (let i = 0; i < 40; i += 1) {
    moveProbe = await page.evaluate(() => window.__MAZER_QA__.movePlayPlayer('move_up'));
    if (moveProbe?.mode === 'play' && !moveProbe?.lifecycleLocked) break;
    await page.waitForTimeout(150);
  }
  check('the real scene actually reached play mode and unlocked (QA move surface agrees)', moveProbe?.mode === 'play' && moveProbe?.lifecycleLocked === false, JSON.stringify(moveProbe));

  const afterSnapshot = await page.evaluate(() => window.__MAZER_QA__.getUiStateSnapshot());
  const afterViewModels = await page.evaluate(() => window.__MAZER_QA__.getUiViewModels());
  check('projected snapshot actually changed to play/active', afterSnapshot?.primarySurface === 'play' && afterSnapshot?.gamePhase === 'active', JSON.stringify(afterSnapshot));
  check('generated view model reflects the change', afterViewModels?.gameplayHud?.visible === true, JSON.stringify(afterViewModels?.gameplayHud));

  const invalidResult = await page.evaluate(() => window.__MAZER_QA__.dispatchUiCommand({ type: 'NAVIGATE', surface: 'guide' }));
  const afterInvalidDiagnostics = await page.evaluate(() => window.__MAZER_QA__.getUiBridgeDiagnostics());
  check('invalid action fails closed', invalidResult?.ok === false, JSON.stringify(invalidResult));
  check(
    'invalid action counted as a command failure, not a silent success',
    afterInvalidDiagnostics.commandFailureCount === afterDiagnosticsImmediate.commandFailureCount + 1,
    `before=${afterDiagnosticsImmediate.commandFailureCount} after=${afterInvalidDiagnostics.commandFailureCount}`
  );

  const invalidModal = await page.evaluate(() => window.__MAZER_QA__.dispatchUiCommand({ type: 'OPEN_MODAL', modal: 'confirm-reset-progress' }));
  check('OPEN_MODAL confirm-reset-progress rejects an invalid live origin', invalidModal?.ok === false, JSON.stringify(invalidModal));

  check('no console/page errors during the whole check', consoleErrors.filter((e) => !/400 \(\)/.test(e)).length === 0, JSON.stringify(consoleErrors));

  await browser.close();
};

const main = async () => {
  const args = parseCliArgs();
  const baseUrl = normalizeBaseUrl(typeof args.baseUrl === 'string' ? args.baseUrl : DEFAULT_BASE_URL);
  const isTruthyArg = (value) => value === true || value === 'true' || value === '1';
  const useExistingServer = isTruthyArg(args.noPreview ?? args['no-preview']);
  const skipBuild = isTruthyArg(args.skipBuild ?? args['skip-build']);

  if (!useExistingServer && !skipBuild) {
    runBuild();
  }

  const preview = useExistingServer
    ? null
    : await launchPreviewServer({ requestedBaseUrl: baseUrl, previewTimeoutMs: DEFAULT_PREVIEW_TIMEOUT_MS });
  const resolvedBaseUrl = preview?.baseUrl ?? baseUrl;

  try {
    await runChecks(resolvedBaseUrl);
  } finally {
    if (preview) {
      await stopPreviewServer(preview.child);
    }
  }

  const failed = results.filter((r) => !r.pass);
  process.stdout.write(`${JSON.stringify({ results, pass: failed.length === 0 }, null, 2)}\n`);
  process.exitCode = failed.length === 0 ? 0 : 1;
};

main().catch((error) => {
  console.error('FATAL', error);
  process.exitCode = 1;
});
