import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright';
import {
  STACK_ROOT,
  ensureDir,
  parseCliArgs,
  resolveSessionId
} from '../visual/common.mjs';
import { launchPreviewServer, stopPreviewServer } from '../visual/preview-server.mjs';

const VISUAL_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-visual-diagnostics';
const RUNTIME_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-runtime-diagnostics';
const DEFAULT_TIMEOUT_MS = 30_000;
const SURFACES = Object.freeze([
  Object.freeze({
    id: 'account',
    fixture: 'account',
    expectedLabels: ['Account', 'Save Account', 'Change Password', 'Log out']
  }),
  Object.freeze({
    id: 'recovery',
    fixture: 'recovery',
    expectedLabels: ['Reset Password', 'Save Password', 'Back to Account', 'Request New Link', 'Show']
  }),
  Object.freeze({
    id: 'reset-wait',
    fixture: 'reset-wait',
    expectedLabels: ['Reset Password', 'Please wait before requesting another reset link.', 'Save Password', 'Back to Account', 'Request New Link', 'Show']
  }),
  Object.freeze({
    id: 'session-ended',
    fixture: 'session-ended',
    expectedAuth: { formMode: 'login', status: 'guest' },
    expectedLabels: ['Account', 'Login', 'Create Account', 'Reset Password']
  }),
  Object.freeze({
    id: 'confirmation',
    route: '/?content=core-only&theme=aurora&runtimeDiagnostics=1&auth=confirmed',
    expectedLabels: ['Account', 'Email confirmed. You can log in.', 'Login', 'Create Account', 'Reset Password']
  }),
  Object.freeze({
    id: 'invalid-confirmation',
    route: '/?content=core-only&theme=aurora&runtimeDiagnostics=1&auth=error&error=access_denied&error_description=raw-provider-detail',
    expectedLabels: ['Account', 'This account link is invalid or expired. Request a new one.', 'Login', 'Create Account', 'Reset Password']
  })
]);
const TARGETS = Object.freeze([
  Object.freeze({ engine: 'chromium', id: 'desktop-chromium', viewport: { width: 1365, height: 900 } }),
  Object.freeze({ engine: 'webkit', id: 'mobile-webkit', viewport: { width: 390, height: 844 } })
]);

const readVisualDiagnostics = async (page) => page.evaluate((attribute) => {
  const raw = document.documentElement.getAttribute(attribute);
  return raw ? JSON.parse(raw) : null;
}, VISUAL_DIAGNOSTICS_ATTRIBUTE);

const readRuntimeDiagnostics = async (page) => page.evaluate((attribute) => {
  const raw = document.documentElement.getAttribute(attribute);
  return raw ? JSON.parse(raw) : null;
}, RUNTIME_DIAGNOSTICS_ATTRIBUTE);

const waitForAuthSurface = async (page, expectedLabels, expectedAuth, timeoutMs) => {
  await page.waitForFunction(({ expected, expectedRuntime, runtimeAttribute, visualAttribute }) => {
    const raw = document.documentElement.getAttribute(visualAttribute);
    if (!raw) {
      return false;
    }
    try {
      const diagnostics = JSON.parse(raw);
      const labels = new Set((diagnostics?.textLabels ?? []).map((entry) => entry.text));
      const runtimeRaw = document.documentElement.getAttribute(runtimeAttribute);
      const runtime = runtimeRaw ? JSON.parse(runtimeRaw) : null;
      return diagnostics?.runtime?.mode === 'menu'
        && diagnostics?.runtime?.overlay === 'auth'
        && expected.every((label) => labels.has(label))
        && (!expectedRuntime
          || (runtime?.auth?.formMode === expectedRuntime.formMode && runtime?.auth?.status === expectedRuntime.status));
    } catch {
      return false;
    }
  }, {
    expected: expectedLabels,
    expectedRuntime: expectedAuth ?? null,
    runtimeAttribute: RUNTIME_DIAGNOSTICS_ATTRIBUTE,
    visualAttribute: VISUAL_DIAGNOSTICS_ATTRIBUTE
  }, { timeout: timeoutMs });
};

const collectGeometryIssues = (diagnostics, viewport) => {
  const issues = [];
  for (const button of diagnostics?.buttons ?? []) {
    const bounds = button?.bounds;
    const label = button?.labelBounds;
    if (!bounds || !label) {
      issues.push(`${button?.text ?? 'unknown'}:missing-bounds`);
      continue;
    }
    if (bounds.left < -1 || bounds.top < -1 || bounds.right > viewport.width + 1 || bounds.bottom > viewport.height + 1) {
      issues.push(`${button.text}:outside-viewport`);
    }
    if (label.left < bounds.left - 1.5 || label.top < bounds.top - 1.5 || label.right > bounds.right + 1.5 || label.bottom > bounds.bottom + 1.5) {
      issues.push(`${button.text}:label-outside-button`);
    }
  }
  const buttonsByText = new Map((diagnostics?.buttons ?? []).map((button) => [button.text, button]));
  const fieldIds = ['confirmPassword', 'displayName', 'email', 'password', 'username'];
  const actionLabels = ['Save Account', 'Save Password'];
  const renderedFields = fieldIds.map((id) => buttonsByText.get(id)).filter(Boolean);
  const firstAction = actionLabels.map((id) => buttonsByText.get(id)).find(Boolean);
  if (renderedFields.length > 0 && firstAction?.bounds) {
    const lastFieldBottom = Math.max(...renderedFields.map((field) => field.bounds.bottom));
    const deadZone = firstAction.bounds.top - lastFieldBottom;
    if (deadZone > 120) {
      issues.push(`auth-stack-dead-zone=${deadZone.toFixed(1)}`);
    }
  }
  return issues;
};

const captureTarget = async ({ artifactDir, baseUrl, target, timeoutMs }) => {
  const browserType = target.engine === 'webkit' ? webkit : chromium;
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    hasTouch: target.engine === 'webkit',
    isMobile: target.engine === 'webkit',
    viewport: target.viewport
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const captures = [];

  try {
    for (const surface of SURFACES) {
      const route = surface.route
        ? `${surface.route}&v=auth-parity-${target.id}-${surface.id}`
        : `/?content=core-only&theme=aurora&runtimeDiagnostics=1&authFixture=${surface.fixture}&v=auth-parity-${target.id}-${surface.id}`;
      await page.goto(new URL(route, baseUrl).toString(), { waitUntil: 'networkidle', timeout: timeoutMs });
      try {
        await waitForAuthSurface(page, surface.expectedLabels, surface.expectedAuth, timeoutMs);
      } catch (error) {
        const observedVisual = await readVisualDiagnostics(page);
        const observedRuntime = await readRuntimeDiagnostics(page);
        const observedLabels = (observedVisual?.textLabels ?? []).map((entry) => entry.text);
        throw new Error(
          `${target.id}/${surface.id} did not reach the expected Auth surface; `
          + `auth=${JSON.stringify(observedRuntime?.auth ?? null)}; labels=${JSON.stringify(observedLabels)}; `
          + `cause=${error instanceof Error ? error.message : String(error)}`
        );
      }
      await page.evaluate(() => new Promise((resolvePaint) => requestAnimationFrame(() => requestAnimationFrame(resolvePaint))));
      const diagnostics = await readVisualDiagnostics(page);
      const runtimeDiagnostics = await readRuntimeDiagnostics(page);
      const nativeInputs = await page.locator('[data-mazer-auth-input]').evaluateAll((inputs) => inputs.map((input) => {
        const bounds = input.getBoundingClientRect();
        return {
          ariaLabel: input.getAttribute('aria-label'),
          field: input.getAttribute('data-mazer-auth-input'),
          height: bounds.height,
          left: bounds.left,
          top: bounds.top,
          type: input.type,
          width: bounds.width
        };
      }));
      const screenshotPath = resolve(artifactDir, `${target.id}-${surface.id}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      const geometryIssues = collectGeometryIssues(diagnostics, target.viewport);
      const labels = new Set((diagnostics?.textLabels ?? []).map((entry) => entry.text));
      const authStateMatches = !surface.expectedAuth
        || (runtimeDiagnostics?.auth?.formMode === surface.expectedAuth.formMode
          && runtimeDiagnostics?.auth?.status === surface.expectedAuth.status);
      captures.push({
        authState: runtimeDiagnostics?.auth ?? null,
        authStateMatches,
        id: surface.id,
        expectedLabels: surface.expectedLabels,
        geometryIssues,
        labelsPresent: surface.expectedLabels.every((label) => labels.has(label)),
        nativeInputs,
        pass: authStateMatches && geometryIssues.length === 0 && surface.expectedLabels.every((label) => labels.has(label)),
        screenshotPath
      });
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return {
    captures,
    consoleErrors,
    engine: target.engine,
    id: target.id,
    pageErrors,
    pass: captures.every((capture) => capture.pass) && consoleErrors.length === 0 && pageErrors.length === 0,
    viewport: target.viewport
  };
};

const run = async () => {
  const args = parseCliArgs();
  const sessionId = resolveSessionId(typeof args.session === 'string' ? args.session : 'auth-capability-parity');
  const artifactDir = await ensureDir(resolve(STACK_ROOT, 'tmp', 'captures', 'mazer-auth-capability-parity', sessionId));
  const timeoutMs = Number.parseInt(String(args['timeout-ms'] ?? DEFAULT_TIMEOUT_MS), 10) || DEFAULT_TIMEOUT_MS;
  const preview = await launchPreviewServer({
    requestedBaseUrl: typeof args['base-url'] === 'string' ? args['base-url'] : 'http://127.0.0.1:4189'
  });
  try {
    const targets = [];
    for (const target of TARGETS) {
      targets.push(await captureTarget({ artifactDir, baseUrl: preview.baseUrl, target, timeoutMs }));
    }
    const summary = {
      artifactDir,
      pass: targets.every((target) => target.pass),
      sessionId,
      targets
    };
    const summaryPath = resolve(artifactDir, 'summary.json');
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify({ pass: summary.pass, summaryPath, targets }, null, 2)}\n`);
    if (!summary.pass) {
      process.exitCode = 1;
    }
  } finally {
    await stopPreviewServer(preview.child);
  }
};

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
