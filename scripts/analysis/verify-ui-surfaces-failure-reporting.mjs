/**
 * Wave 0C: bounded, real-process negative controls for the visual-
 * verification harness's OWN failure-reporting path
 * (capture-ui-surfaces.mjs's runUiSurfaceCapture catch block) AND for
 * waitForSurface's runtime-diagnostics parsing.
 *
 * A real gap this closes: tests/reset/ui-surface-capture-script.test.mjs's
 * unit tests exercise evaluateSurfaceReadiness and waitForSurface's own
 * error-throwing against a mocked Playwright page -- valuable, but a mock
 * cannot prove the actual CLI entry point exits nonzero, actually writes a
 * retained summary.json/report.md to disk on a real failure, actually
 * releases the preview server port afterward, or that the REAL browser-side
 * predicate (not a reference copy) agrees with evaluateSurfaceReadiness
 * about malformed diagnostics. This script proves all of that against the
 * real `node capture-ui-surfaces.mjs` process and real (deliberately
 * provoked) browser runs, then restores nothing because it never edits
 * source -- every negative control here is a normal function argument or
 * CLI flag, not a temporary source edit.
 *
 * Four parts, each proving a distinct failure mode -- do not collapse them:
 *   1-2. BOOT/NAVIGATION failure (a page that never loads at all --
 *        `--timeout-ms=1`, a value no real page can ever satisfy). Proves
 *        the reporting contract works for the earliest possible failure.
 *   3.   RUNTIME-DIAGNOSTICS PARITY (no app, a blank page with a hand-set
 *        `data-mazer-runtime-diagnostics` attribute). Proves the real
 *        browser-side predicate -- not a reference copy -- now rejects a
 *        malformed runtime payload the same way evaluateSurfaceReadiness's
 *        hasRuntimeDiagnostics clause does, closing the exact gap an owner
 *        review reproduced live (a bare truthiness check on runtimeRaw that
 *        never actually parsed it).
 *   4.   POST-NAVIGATION READINESS failure (the real app, real navigation
 *        genuinely completes, then the specific mode/overlay readiness
 *        clause fails). Proves SURFACE_READINESS_TIMEOUT's own
 *        clause-level evidence is retained, not just a navigation timeout
 *        -- the earlier version of this script only ever demonstrated #1-2
 *        and mislabeling that as covering the readiness path was itself a
 *        review finding.
 *
 * Usage: node scripts/analysis/verify-ui-surfaces-failure-reporting.mjs [--skip-build]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { DEFAULT_BASE_URL, DEFAULT_PREVIEW_TIMEOUT_MS, REPO_ROOT, STACK_ROOT, normalizeBaseUrl, parseCliArgs } from '../visual/common.mjs';
import { launchPreviewServer, stopPreviewServer } from '../visual/preview-server.mjs';
import { runUiSurfaceCapture, waitForSurface } from './capture-ui-surfaces.mjs';

const CLI_SCRIPT_PATH = fileURLToPath(new URL('./capture-ui-surfaces.mjs', import.meta.url));
const CAPTURES_ROOT = resolve(STACK_ROOT, 'tmp', 'captures', 'mazer-ui-surfaces');

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

const readJsonIfPresent = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};

const readTextIfPresent = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
};

// A plain net.Server bind-then-release probe -- true only if nothing else
// currently holds the port, i.e. the harness's own preview-server child was
// genuinely stopped rather than left running.
const isPortFree = (port) => new Promise((resolvePromise) => {
  const server = createServer();
  server.once('error', () => resolvePromise(false));
  server.once('listening', () => {
    server.close(() => resolvePromise(true));
  });
  server.listen(port, '127.0.0.1');
});

const main = async () => {
  const args = parseCliArgs();
  const isTruthyArg = (value) => value === true || value === 'true' || value === '1';
  const skipBuild = isTruthyArg(args.skipBuild ?? args['skip-build']);

  if (!skipBuild) {
    runBuild();
  }

  // === Part 1: BOOT/NAVIGATION failure -- call runUiSurfaceCapture
  // directly in-process with a 1ms timeout (the page never even finishes
  // loading), asserting the function-level contract (rejects, does not
  // hang, still releases its own preview server). This is the earliest
  // possible failure point (currentStep stays 'boot'), NOT a
  // SURFACE_READINESS_TIMEOUT -- see Part 4 below for that. ===
  const directSessionId = `verify-failure-reporting-direct-${Date.now()}`;
  let directError = null;
  try {
    await runUiSurfaceCapture({
      mazeSeed: 3749,
      sessionId: directSessionId,
      skipBuild: true,
      timeoutMs: 1
    });
  } catch (error) {
    directError = error;
  }
  check(
    'a deliberately-impossible 1ms navigation timeout makes runUiSurfaceCapture actually reject, not resolve with a false pass',
    directError !== null,
    directError ? `${directError.name ?? 'Error'}: ${directError.message}` : 'resolved without throwing'
  );

  const directSummary = readJsonIfPresent(resolve(CAPTURES_ROOT, directSessionId, 'summary.json'));
  check(
    'the direct in-process call also retained a summary.json with pass:false and a failure object',
    directSummary?.pass === false && directSummary?.failure != null,
    JSON.stringify(directSummary?.failure ?? null).slice(0, 300)
  );

  const directPortFree = await isPortFree(4173);
  check(
    'after the direct call rejects, its own preview server child no longer holds the default port',
    directPortFree,
    `port 4173 free: ${directPortFree}`
  );

  // === Part 2: BOOT/NAVIGATION failure, the real CLI entry point as its
  // own OS process, asserting the actual exit code a CI step or a human
  // running this by hand would see -- the in-process call above cannot
  // prove this by itself. Same 1ms boot-level failure as Part 1, not a
  // readiness-clause failure. ===
  const cliSessionId = `verify-failure-reporting-cli-${Date.now()}`;
  let cliExitCode = 0;
  try {
    execFileSync(process.execPath, [
      CLI_SCRIPT_PATH,
      '--maze-seed=3749',
      `--session=${cliSessionId}`,
      '--skip-build',
      '--timeout-ms=1'
    ], { cwd: REPO_ROOT, stdio: 'pipe' });
  } catch (error) {
    cliExitCode = typeof error.status === 'number' ? error.status : 1;
  }
  check('the real CLI entry point (a separate OS process) exits nonzero on the same forced failure', cliExitCode !== 0, `exitCode=${cliExitCode}`);

  const cliOutputDir = resolve(CAPTURES_ROOT, cliSessionId);
  const cliSummary = readJsonIfPresent(resolve(cliOutputDir, 'summary.json'));
  check(
    'the CLI run retained a summary.json with pass:false and a failure object',
    cliSummary?.pass === false && cliSummary?.failure != null,
    JSON.stringify(cliSummary?.failure ?? null).slice(0, 300)
  );
  check(
    'the failure report names a specific failed step, not a generic "something failed"',
    typeof cliSummary?.failure?.failedStep === 'string' && cliSummary.failure.failedStep.length > 0,
    cliSummary?.failure?.failedStep ?? 'none'
  );
  check(
    'the failure report accounts for completed vs. not-run surfaces as arrays',
    Array.isArray(cliSummary?.failure?.completedSteps) && Array.isArray(cliSummary?.failure?.notRunSteps),
    JSON.stringify({ completedSteps: cliSummary?.failure?.completedSteps, notRunSteps: cliSummary?.failure?.notRunSteps })
  );
  check(
    'the failure report preserves the ORIGINAL error message, not a replacement from a broken reporter',
    typeof cliSummary?.failure?.error?.message === 'string' && /timeout/i.test(cliSummary.failure.error.message),
    cliSummary?.failure?.error?.message ?? 'none'
  );
  check(
    'build identity (commit + dirty flag) is recorded even on a failed run',
    typeof cliSummary?.failure?.buildIdentity?.commit === 'string' && cliSummary.failure.buildIdentity.commit.length > 0,
    JSON.stringify(cliSummary?.failure?.buildIdentity ?? null)
  );

  const cliReportMarkdown = readTextIfPresent(resolve(cliOutputDir, 'report.md'));
  check(
    'report.md was also retained and names the same failed step',
    cliReportMarkdown.includes('FAILED') && (cliSummary?.failure?.failedStep
      ? cliReportMarkdown.includes(cliSummary.failure.failedStep)
      : false),
    cliReportMarkdown.slice(0, 200)
  );

  const cliPortFree = await isPortFree(4173);
  check(
    'after the CLI process exits, its own preview server child no longer holds the default port',
    cliPortFree,
    `port 4173 free: ${cliPortFree}`
  );

  // === Part 3: RUNTIME-DIAGNOSTICS PARITY. No app needed -- a blank page
  // with the two diagnostics attributes set by hand, so the ONLY variable
  // is whether waitForSurface's real (not a reference copy) browser-side
  // predicate treats a malformed data-mazer-runtime-diagnostics value the
  // same way evaluateSurfaceReadiness's hasRuntimeDiagnostics clause does.
  // Before the fix this round, the predicate only checked runtimeRaw for
  // non-emptiness and never parsed it -- every one of the malformed cases
  // below satisfied that check and the predicate resolved anyway, purely
  // because its own mode/overlay decision only ever reads the SEPARATE
  // visual payload's nested .runtime, never the runtime payload itself. ===
  const parityBrowser = await chromium.launch({ headless: true });
  try {
    const setDiagnosticsAttributes = (page, { runtimeRaw, visualRaw }) => page.evaluate(({ runtimeRaw: r, visualRaw: v }) => {
      document.documentElement.setAttribute('data-mazer-runtime-diagnostics', r);
      document.documentElement.setAttribute('data-mazer-visual-diagnostics', v);
    }, { runtimeRaw, visualRaw });
    const validVisualRaw = JSON.stringify({ runtime: { mode: 'menu', overlay: 'none' }, textLabels: [] });
    const malformedRuntimeCases = [
      ['malformed JSON', '{broken'],
      ['valid JSON, wrong top-level shape (string)', JSON.stringify('not an object')],
      ['valid JSON, wrong top-level shape (array)', '[]'],
      ['valid JSON, null', 'null']
    ];

    for (const [label, runtimeRaw] of malformedRuntimeCases) {
      const page = await parityBrowser.newPage();
      await page.goto('about:blank');
      await setDiagnosticsAttributes(page, { runtimeRaw, visualRaw: validVisualRaw });
      let rejected = false;
      try {
        await waitForSurface(page, { mode: 'menu', overlay: 'none', timeoutMs: 300 });
      } catch {
        rejected = true;
      }
      check(
        `the real waitForSurface predicate does not resolve when data-mazer-runtime-diagnostics is ${label}, even though the visual payload alone would satisfy it`,
        rejected,
        `runtimeRaw=${runtimeRaw}`
      );
      await page.close();
    }

    const page = await parityBrowser.newPage();
    await page.goto('about:blank');
    await setDiagnosticsAttributes(page, {
      runtimeRaw: JSON.stringify({ surface: { mode: 'menu', overlay: 'none' } }),
      visualRaw: validVisualRaw
    });
    let validResolved = false;
    try {
      await waitForSurface(page, { mode: 'menu', overlay: 'none', timeoutMs: 2000 });
      validResolved = true;
    } catch {
      validResolved = false;
    }
    check(
      'the same predicate DOES resolve once data-mazer-runtime-diagnostics is genuinely valid JSON shaped as a plain object -- the fix only rejects malformed shapes, it does not newly require content it never checked before',
      validResolved,
      `validResolved=${validResolved}`
    );
    await page.close();
  } finally {
    await parityBrowser.close();
  }

  // === Part 4: POST-NAVIGATION READINESS failure. The real app, real
  // navigation genuinely completes -- then waitForSurface is asked to wait
  // for an overlay value ('__verify_never_reached__') the app can never
  // actually produce. This is deterministic, not a timing race: an earlier
  // version of this check picked a timeout meant to land between real
  // navigation and real auth-gate readiness (empirically ~700ms vs.
  // ~1720ms in an isolated measurement) and it flaked on its very first
  // run inside this same script -- warmed caches from Parts 1-3 running
  // first sped up the real app's own boot enough that 1000ms was no longer
  // short enough, resolving instead of failing. Asking for a value that
  // structurally never occurs removes the race entirely: correctness no
  // longer depends on how fast the app happens to boot on a given
  // machine/run, only on whether it ever produces the requested overlay
  // (it never will), so a generous timeout is safe and appropriate here. ===
  const readinessPreview = await launchPreviewServer({
    requestedBaseUrl: normalizeBaseUrl(DEFAULT_BASE_URL),
    previewTimeoutMs: DEFAULT_PREVIEW_TIMEOUT_MS
  });
  try {
    const readinessBrowser = await chromium.launch({ headless: true });
    try {
      const page = await (await readinessBrowser.newContext({ viewport: { width: 405, height: 958 } })).newPage();
      const targetUrl = `${readinessPreview.baseUrl}/?content=core-only&theme=aurora&runtimeDiagnostics=1&mazeSeed=3749&v=readiness-negative-control-${Date.now()}`;
      const gotoStartedAt = Date.now();
      await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
      const gotoElapsedMs = Date.now() - gotoStartedAt;
      check(
        'navigation itself genuinely completes before the readiness check below even starts (proving a subsequent readiness failure is not a disguised navigation error)',
        gotoElapsedMs < 30000,
        `page.goto took ${gotoElapsedMs}ms`
      );

      let readinessError = null;
      try {
        await waitForSurface(page, { mode: 'menu', overlay: '__verify_never_reached__', timeoutMs: 5000 });
      } catch (error) {
        readinessError = error;
      }
      check(
        'after navigation genuinely completes, requesting an overlay value the app can never produce makes waitForSurface reject with SURFACE_READINESS_TIMEOUT specifically (not a navigation error)',
        readinessError?.code === 'SURFACE_READINESS_TIMEOUT',
        readinessError ? `code=${readinessError.code} message=${readinessError.message.slice(0, 200)}` : 'resolved without throwing'
      );
      check(
        'the retained evidence correctly blames overlayMatches specifically, with the real observed overlay named (proving this reached real, settled diagnostics, not a boot-time gap)',
        readinessError?.evidence?.failedClauses?.includes('overlayMatches')
          && readinessError?.evidence?.lastState?.actualOverlay != null
          && readinessError.evidence.lastState.actualOverlay !== '__verify_never_reached__',
        JSON.stringify(readinessError?.evidence ?? null).slice(0, 300)
      );
      check(
        'modeMatches is NOT among the failed clauses -- the real app did reach mode:"menu" as requested, isolating the failure to the deliberately-impossible overlay alone',
        readinessError?.evidence?.failedClauses != null && !readinessError.evidence.failedClauses.includes('modeMatches'),
        JSON.stringify(readinessError?.evidence?.failedClauses ?? null)
      );

      await page.close();
    } finally {
      await readinessBrowser.close();
    }
  } finally {
    await stopPreviewServer(readinessPreview.child);
  }

  // This script only ever passes a CLI flag (--timeout-ms=1), sets DOM
  // attributes on a blank page, or calls waitForSurface with a real but
  // deliberately narrow timeout -- it never edits source, so there is
  // nothing to restore. Only its own scratch capture directories need
  // cleaning up.
  for (const dir of [resolve(CAPTURES_ROOT, directSessionId), cliOutputDir]) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort scratch cleanup; leaving a stray directory behind does
      // not affect the correctness of the checks already recorded above.
    }
  }

  const failed = checks.filter((c) => !c.passed);
  process.stderr.write(`\n${checks.length - failed.length}/${checks.length} checks passed.\n`);
  process.exitCode = failed.length > 0 ? 1 : 0;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
