/**
 * Wave 0C: bounded, real-process negative control for the visual-
 * verification harness's OWN failure-reporting path
 * (capture-ui-surfaces.mjs's runUiSurfaceCapture catch block).
 *
 * A real gap this closes: tests/reset/ui-surface-capture-script.test.mjs's
 * unit tests exercise evaluateSurfaceReadiness and waitForSurface's own
 * error-throwing against a mocked Playwright page -- valuable, but a mock
 * cannot prove the actual CLI entry point exits nonzero, actually writes a
 * retained summary.json/report.md to disk on a real failure, or actually
 * releases the preview server port afterward. This script proves those
 * three things against the real `node capture-ui-surfaces.mjs` process and
 * a real (deliberately-broken) browser run, then restores nothing because
 * it never modifies source -- the "negative control" here is an
 * impossible-to-satisfy timeout passed as a normal CLI argument, not a
 * temporary source edit.
 *
 * Deliberately forces failure via `--timeout-ms=1` (no real page can ever
 * signal readiness in 1ms) rather than disabling a real assertion, so this
 * stays a pure black-box check of the reporting contract and can be left
 * permanently wired into CI without ever needing to "restore" anything.
 *
 * Usage: node scripts/analysis/verify-ui-surfaces-failure-reporting.mjs [--skip-build]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, STACK_ROOT, parseCliArgs } from '../visual/common.mjs';
import { runUiSurfaceCapture } from './capture-ui-surfaces.mjs';

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

  // === Part 1: call runUiSurfaceCapture directly in-process, asserting the
  // function-level contract (rejects, does not hang, still releases its
  // own preview server). ===
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
    'a deliberately-impossible 1ms readiness timeout makes runUiSurfaceCapture actually reject, not resolve with a false pass',
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

  // === Part 2: the real CLI entry point as its own OS process, asserting
  // the actual exit code a CI step or a human running this by hand would
  // see -- the in-process call above cannot prove this by itself. ===
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

  // This script only ever passes a CLI flag (--timeout-ms=1); it never
  // edits source, so there is nothing to restore. Only its own scratch
  // capture directories need cleaning up.
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
