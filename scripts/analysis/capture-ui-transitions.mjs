import { parseCliArgs, parseIntegerArg } from '../visual/common.mjs';
import { runUiSurfaceCapture } from './capture-ui-surfaces.mjs';

const TRANSITION_VIEWPORTS = Object.freeze({
  initial: Object.freeze({ width: 360, height: 720 }),
  desktop: Object.freeze({ width: 1440, height: 900 }),
  endpoint: Object.freeze({ width: 405, height: 958 })
});

const args = parseCliArgs();
const result = await runUiSurfaceCapture({
  artifactRoot: typeof args['artifact-root'] === 'string' ? args['artifact-root'] : undefined,
  baseUrl: args['base-url'],
  authFixture: typeof args['auth-fixture'] === 'string' ? args['auth-fixture'] : undefined,
  deviceScaleFactor: parseIntegerArg(args['device-scale-factor'], 2),
  headless: args.headless !== 'false',
  label: typeof args.label === 'string' ? args.label : 'ui-transitions',
  mazeSeed: typeof args['maze-seed'] === 'string' ? args['maze-seed'] : undefined,
  sessionId: args.session,
  skipBuild: args['skip-build'] === true || args['skip-build'] === 'true',
  timeoutMs: parseIntegerArg(args['timeout-ms'], 30_000),
  transition: TRANSITION_VIEWPORTS,
  useExistingServer: args['no-preview'] === true || args['no-preview'] === 'true'
});

process.stdout.write(`${JSON.stringify({
  pass: result.pass,
  reportPath: result.reportPath,
  summaryPath: result.summaryPath,
  transition: result.transition
}, null, 2)}\n`);

if (!result.pass) {
  process.exitCode = 1;
}
