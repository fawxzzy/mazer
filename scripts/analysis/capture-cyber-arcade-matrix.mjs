import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runUiSurfaceCapture } from './capture-ui-surfaces.mjs';
import { STACK_ROOT, parseCliArgs, resolveSessionId } from '../visual/common.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH;

export const CYBER_ARCADE_VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'iphone-390x844', width: 390, height: 844, deviceScaleFactor: 2 }),
  Object.freeze({ id: 'tall-mobile-405x958', width: 405, height: 958, deviceScaleFactor: 2 }),
  Object.freeze({ id: 'wide-mobile-430x932', width: 430, height: 932, deviceScaleFactor: 2 }),
  Object.freeze({ id: 'desktop-1440x900', width: 1440, height: 900, deviceScaleFactor: 1 })
]);

export const runCyberArcadeMatrix = async (options = {}) => {
  const sessionId = resolveSessionId(options.sessionId);
  const artifactRoot = resolve(
    options.artifactRoot ?? resolve(STACK_ROOT, 'tmp', 'captures', 'mazer-cyber-arcade')
  );
  const results = [];

  for (const [index, profile] of CYBER_ARCADE_VIEWPORTS.entries()) {
    const result = await runUiSurfaceCapture({
      artifactRoot,
      deviceScaleFactor: profile.deviceScaleFactor,
      label: `crisp-cyber-${profile.id}`,
      mazeSeed: options.mazeSeed ?? '3749',
      sessionId: `${sessionId}-${profile.id}`,
      skipBuild: options.skipBuild === true || index > 0,
      skipTopologyDiagnostics: true,
      timeoutMs: options.timeoutMs,
      viewport: { width: profile.width, height: profile.height }
    });
    results.push({ profile, result });
  }

  return {
    pass: results.every(({ result }) => result.pass),
    artifactRoot,
    sessionId,
    results
  };
};

if (isDirectRun) {
  const args = parseCliArgs();
  runCyberArcadeMatrix({
    artifactRoot: typeof args['artifact-root'] === 'string' ? args['artifact-root'] : undefined,
    mazeSeed: typeof args['maze-seed'] === 'string' ? args['maze-seed'] : undefined,
    sessionId: typeof args.session === 'string' ? args.session : undefined,
    skipBuild: args['skip-build'] === true || args['skip-build'] === 'true',
    timeoutMs: typeof args['timeout-ms'] === 'string' ? Number.parseInt(args['timeout-ms'], 10) : undefined
  }).then((matrix) => {
    process.stdout.write(`${JSON.stringify({
      pass: matrix.pass,
      artifactRoot: matrix.artifactRoot,
      sessionId: matrix.sessionId,
      summaries: matrix.results.map(({ profile, result }) => ({
        profile: profile.id,
        pass: result.pass,
        summaryPath: result.summaryPath
      }))
    }, null, 2)}\n`);
    if (!matrix.pass) {
      process.exitCode = 1;
    }
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
