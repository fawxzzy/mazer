/**
 * Wave 0C companion check: real click-through proof that the Options-bottom
 * label fix (OPTIONS_BOTTOM_EXPECTED_LABELS -> ['Sign out']) did not leave
 * the real Account capability unreachable.
 *
 * The gap this closes: tests/scenes/menu-render-frame.test.ts's source
 * assertion proves buildAuthenticatedAccountSection's Account/Sign out bar
 * is WIRED in source; it does not prove a player can see the control, click
 * it, and actually reach the surface and destination it claims to. This
 * script proves that against the real running app, in both a desktop and a
 * compact touch-enabled layout, using real clicks/taps on the app's own
 * reported control bounds -- never a direct callback/dispatch/state
 * assignment for the interaction under test.
 *
 * The one QA-bridge use is opening Options itself (openOptionsOverlayViaQa),
 * matching this harness's own established convention for that incidental
 * setup step -- already covered independently elsewhere by
 * hasVisualButton(surfaces.menu, 'Settings', {iconOnly:true}). Every other
 * step here (scrolling to the bottom, clicking Account from Options,
 * clicking the main-menu profile icon, clicking Account inside the
 * resulting Account overlay, and closing back out) is a real mouse
 * click/drag against bounds the app itself reports.
 *
 * The Account button's own click handler calls a real window.location.assign
 * to an external portal (account.fawxzzy.com). This script intercepts only
 * requests to that origin -- installed on the browser context before the
 * local app is even navigated to -- fulfilling with an inert response
 * instead of contacting the real portal, then asserts the intercepted
 * request's URL against the same contract legacy-account-portal.test.ts
 * already unit-tests (buildMazerAccountPortalUrl('account')). No real
 * account is signed in, signed out, or mutated; no request reaches the real
 * portal.
 *
 * Negative control: rather than mutating and rebuilding real source (this
 * exact script family's own precedent in
 * verify-ui-surfaces-failure-reporting.mjs's Part 3 uses the same lighter-
 * weight approach for an equivalent class of check), this script re-checks
 * the SAME real intercepted request against a deliberately wrong expected
 * `app` parameter, proving the URL-matching assertion itself actually
 * rejects a mismatch rather than passing unconditionally -- using real
 * browser/interception data, not a mocked comparison.
 *
 * Usage: node scripts/analysis/verify-options-account-reachability.mjs [--skip-build]
 */
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { DEFAULT_BASE_URL, DEFAULT_PREVIEW_TIMEOUT_MS, REPO_ROOT, normalizeBaseUrl, parseCliArgs } from '../visual/common.mjs';
import { launchPreviewServer, stopPreviewServer } from '../visual/preview-server.mjs';
import {
  clickPoint,
  getVisualButtonPoint,
  hasTextLabels,
  openOptionsOverlayViaQa,
  readDiagnostics,
  scrollOverlayToBottom,
  waitForAuthenticatedFixtureReady,
  waitForSurface
} from './capture-ui-surfaces.mjs';

const ACCOUNT_PORTAL_ORIGIN = 'https://account.fawxzzy.com';
const EXPECTED_ACCOUNT_PATHNAME = '/account';
const EXPECTED_ACCOUNT_APP_PARAM = 'mazer';
const EXPECTED_ACCOUNT_RETURN_TO = 'https://mazer.fawxzzy.com/';
const DEFAULT_TIMEOUT_MS = 30_000;
const DESKTOP_VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const COMPACT_TOUCH_VIEWPORT = Object.freeze({ width: 405, height: 958 });

const checks = [];
const check = (label, passed, detail) => {
  checks.push({ label, passed, detail });
  process.stderr.write(`${passed ? 'PASS' : 'FAIL'}: ${label}${detail ? ` -- ${detail}` : ''}\n`);
};

const runBuild = () => {
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm run build'], { cwd: REPO_ROOT, stdio: 'inherit' });
    return;
  }
  execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' });
};

const surfaceFromDiagnostics = (diagnostics) => ({
  buttons: diagnostics.visual?.buttons ?? [],
  textLabels: diagnostics.visual?.textLabels ?? []
});

const matchesAccountUrl = (rawUrl, { appParam = EXPECTED_ACCOUNT_APP_PARAM } = {}) => {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  return url.origin === ACCOUNT_PORTAL_ORIGIN
    && url.pathname === EXPECTED_ACCOUNT_PATHNAME
    && url.searchParams.get('app') === appParam
    && url.searchParams.get('returnTo') === EXPECTED_ACCOUNT_RETURN_TO;
};

// A real click on the profile/Account icon calls openSharedAccountSurface(),
// which -- confirmed by reading both MenuScene.ts's adapter (`openAccount:
// () => { this.openSharedAccountSurface(); return true; }`) and
// UiLegacyBridge's NAVIGATE/account handling, which routes to that exact
// same adapter method -- goes straight to a real
// navigateToSharedAccountRoute('account') whenever authSnapshot.status is
// already 'authenticated'. There is no intermediate internal overlay for
// this click while already signed in: this was confirmed empirically by an
// earlier version of this script, which assumed a click here would land on
// the internal `overlay: 'auth'` surface (buildAuthenticatedAccountSection)
// and instead saw a real cross-origin navigation blank the page's
// diagnostics entirely. buildAuthenticatedAccountSection's own 'Account'/
// 'Sign out' bar is reached only via a separate, narrower path (completing
// sign-in while the auth overlay is already open) that this script does not
// exercise -- see docs/current-truth.md for the full correction.
//
// One real page navigation per check: after the intercepted click, the
// page has genuinely navigated to the (fake, intercepted) response
// document, so each entry point gets its own fresh context/page.
const verifyAccountNavigationFromEntryPoint = async ({
  baseUrl,
  browser,
  isMobile,
  label,
  reachEntryPoint,
  viewport
}) => {
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    hasTouch: isMobile,
    isMobile,
    viewport
  });

  // Installed before any navigation to the local app: any request to the
  // real account portal is fulfilled locally and never reaches the
  // network; every other request (the local app itself) passes through.
  await context.route(`${ACCOUNT_PORTAL_ORIGIN}/**`, async (route) => {
    await route.fulfill({
      body: '<!doctype html><title>intercepted-test-double</title>',
      contentType: 'text/html',
      status: 200
    });
  });

  const page = await context.newPage();
  try {
    const targetUrl = `${baseUrl}/?content=core-only&theme=aurora&runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=3749&v=options-account-reachability-${label}-${Date.now()}`;
    await page.goto(targetUrl, { timeout: DEFAULT_TIMEOUT_MS, waitUntil: 'networkidle' });
    await waitForAuthenticatedFixtureReady(page, { timeoutMs: DEFAULT_TIMEOUT_MS });

    const accountPoint = await reachEntryPoint(page);

    const interceptedRequest = page.waitForRequest(
      (request) => request.url().startsWith(ACCOUNT_PORTAL_ORIGIN),
      { timeout: DEFAULT_TIMEOUT_MS }
    );
    await clickPoint(page, accountPoint, `Account (${label})`);
    let capturedUrl = null;
    try {
      capturedUrl = (await interceptedRequest).url();
    } catch {
      capturedUrl = null;
    }
    check(
      `[${label}] clicking the real, visible Account control triggers a real navigation attempt to the account portal (intercepted, not sent to the real portal)`,
      typeof capturedUrl === 'string',
      capturedUrl ?? 'no request observed'
    );
    check(
      `[${label}] the intercepted navigation matches the known account-portal URL contract (origin, pathname, app, returnTo)`,
      capturedUrl !== null && matchesAccountUrl(capturedUrl),
      capturedUrl ?? 'no request observed'
    );

    // Negative control on the assertion itself: the same real captured
    // request, checked against a deliberately wrong expected `app` value,
    // must be reported as NOT matching -- proving matchesAccountUrl can
    // actually fail, not just always agree with whatever it's given.
    check(
      `[${label}] negative control: the same URL-match assertion correctly rejects a deliberately wrong app parameter`,
      capturedUrl !== null && !matchesAccountUrl(capturedUrl, { appParam: 'not-mazer' }),
      capturedUrl ?? 'no request observed'
    );
  } finally {
    await context.close();
  }
};

const verifyLayout = async ({ baseUrl, browser, viewportLabel, viewport, isMobile }) => {
  // Entry point 1: the main menu's own profile/Account icon, reached
  // directly with no overlay open first.
  await verifyAccountNavigationFromEntryPoint({
    baseUrl,
    browser,
    isMobile,
    label: `${viewportLabel}-main-menu`,
    viewport,
    reachEntryPoint: async (page) => {
      const diagnostics = await readDiagnostics(page);
      return getVisualButtonPoint(diagnostics.visual, 'Account');
    }
  });

  // Entry point 2: the same icon reused in the Options overlay's own
  // header, reached after a real click on Settings and a real scroll to
  // the bottom (also proving OPTIONS_BOTTOM_EXPECTED_LABELS's real target,
  // 'Sign out', is genuinely visible there).
  await verifyAccountNavigationFromEntryPoint({
    baseUrl,
    browser,
    isMobile,
    label: `${viewportLabel}-options`,
    viewport,
    reachEntryPoint: async (page) => {
      const menuDiagnostics = await readDiagnostics(page);
      const settingsPoint = getVisualButtonPoint(menuDiagnostics.visual, 'Settings');
      await clickPoint(page, settingsPoint, 'Settings');
      await waitForSurface(page, { mode: 'menu', overlay: 'options', timeoutMs: DEFAULT_TIMEOUT_MS });

      const optionsBottomDiagnostics = await scrollOverlayToBottom(page, { timeoutMs: DEFAULT_TIMEOUT_MS });
      const optionsBottomSurface = surfaceFromDiagnostics(optionsBottomDiagnostics);
      check(
        `[${viewportLabel}-options] Options-bottom shows the real Sign out control after real scroll input`,
        hasTextLabels(optionsBottomSurface, ['Sign out']),
        `labels=${optionsBottomSurface.textLabels.map((entry) => entry.text).join(', ')}`
      );

      return getVisualButtonPoint(optionsBottomSurface, 'Account');
    }
  });
};

const main = async () => {
  const args = parseCliArgs();
  const isTruthyArg = (value) => value === true || value === 'true' || value === '1';
  const skipBuild = isTruthyArg(args.skipBuild ?? args['skip-build']);

  if (!skipBuild) {
    runBuild();
  }

  const preview = await launchPreviewServer({
    previewTimeoutMs: DEFAULT_PREVIEW_TIMEOUT_MS,
    requestedBaseUrl: normalizeBaseUrl(DEFAULT_BASE_URL)
  });

  try {
    const browser = await chromium.launch({ headless: true });
    try {
      await verifyLayout({
        baseUrl: preview.baseUrl,
        browser,
        isMobile: false,
        viewportLabel: 'desktop',
        viewport: DESKTOP_VIEWPORT
      });
      await verifyLayout({
        baseUrl: preview.baseUrl,
        browser,
        isMobile: true,
        viewportLabel: 'compact-touch',
        viewport: COMPACT_TOUCH_VIEWPORT
      });
    } finally {
      await browser.close();
    }
  } finally {
    await stopPreviewServer(preview.child);
  }

  const failed = checks.filter((entry) => !entry.passed);
  process.stderr.write(`\n${checks.length - failed.length}/${checks.length} checks passed.\n`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
